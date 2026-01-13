'use server';

import fs from 'node:fs/promises';
import path from 'node:path';
import { hydrateResourceIO } from '@workflow/core/observability';
import {
  createWorld,
  resumeHook as resumeHookRuntime,
  start,
} from '@workflow/core/runtime';
import {
  getDeserializeStream,
  getExternalRevivers,
} from '@workflow/core/serialization';
import { WorkflowAPIError, WorkflowRunNotFoundError } from '@workflow/errors';
import type {
  Event,
  Hook,
  Step,
  WorkflowRun,
  WorkflowRunStatus,
  World,
} from '@workflow/world';

export type EnvMap = Record<string, string | undefined>;

export interface PaginatedResult<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * Structured error information that can be sent to the client
 */
export interface ServerActionError {
  message: string;
  // "Server" if the error originates in this file, "API" if the error originates in the World interface
  layer: 'server' | 'API';
  cause?: string;
  request?: {
    operation: string;
    params: Record<string, any>;
    status?: number;
    url?: string;
    code?: string;
  };
}

/**
 * Result wrapper for server actions that can return either data or error
 */
export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServerActionError };

/**
 * Check if the app is running in self-hosted mode.
 * In self-hosted mode, the app uses only server-side environment variables.
 * Note: This is an internal helper function, not a server action.
 */
function isSelfHostedMode(): boolean {
  return process.env.WORKFLOW_UI_SELF_HOSTING === 'true';
}

/**
 * Get self-hosting status for the client.
 */
export async function getSelfHostedStatus(): Promise<
  ServerActionResult<{ isSelfHosted: boolean }>
> {
  return createResponse({ isSelfHosted: isSelfHostedMode() });
}

/**
 * Cache for World instances keyed by envMap
 *
 * IMPORTANT: This cache works under the assumption that if the UI is used to look at
 * different worlds, the user should pass all relevant variables via EnvMap, instead of
 * setting them directly on their Next.js instance. If environment variables are set
 * directly on process.env, the cached World may operate with incorrect environment
 * configuration.
 *
 * CACHING RULES:
 * - Never cache worlds for 'vercel' backend (multi-tenant scenario)
 * - For other backends, cache based on relevant env vars
 */
const worldCache = new Map<string, World>();

/**
 * Check if the world should be cached.
 * Returns false for vercel backend (multi-tenant) to prevent cross-tenant data leakage.
 */
function shouldCacheWorld(envMap: EnvMap): boolean {
  const targetWorld = envMap.WORKFLOW_TARGET_WORLD || '';
  const isVercel =
    targetWorld === 'vercel' ||
    targetWorld === '@workflow/world-vercel' ||
    targetWorld.includes('world-vercel');
  return !isVercel;
}

/**
 * Merge provided envMap with server environment variables.
 * In self-hosted mode, ignores the provided envMap and uses only server env.
 */
function resolveEnvMap(providedEnvMap: EnvMap): EnvMap {
  if (isSelfHostedMode()) {
    // In self-hosted mode, ignore provided env vars and use server env
    return {
      WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
      WORKFLOW_LOCAL_DATA_DIR: process.env.WORKFLOW_LOCAL_DATA_DIR,
      WORKFLOW_MANIFEST_PATH: process.env.WORKFLOW_MANIFEST_PATH,
      WORKFLOW_VERCEL_AUTH_TOKEN: process.env.WORKFLOW_VERCEL_AUTH_TOKEN,
      WORKFLOW_VERCEL_PROJECT: process.env.WORKFLOW_VERCEL_PROJECT,
      WORKFLOW_VERCEL_TEAM: process.env.WORKFLOW_VERCEL_TEAM,
      WORKFLOW_VERCEL_ENV: process.env.WORKFLOW_VERCEL_ENV,
      WORKFLOW_VERCEL_BACKEND_URL: process.env.WORKFLOW_VERCEL_BACKEND_URL,
      WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL,
      PORT: process.env.PORT,
    };
  }
  return providedEnvMap;
}

function getWorldFromEnv(providedEnvMap: EnvMap) {
  const envMap = resolveEnvMap(providedEnvMap);

  // Generate stable cache key from envMap
  const sortedKeys = Object.keys(envMap).sort();
  const sortedEntries = sortedKeys.map((key) => [key, envMap[key]]);
  const cacheKey = JSON.stringify(Object.fromEntries(sortedEntries));

  // Check if we should use caching for this world
  const useCache = shouldCacheWorld(envMap);

  // Check if we have a cached World for this configuration
  if (useCache) {
    const cachedWorld = worldCache.get(cacheKey);
    if (cachedWorld) {
      return cachedWorld;
    }
  }

  // No cached World found (or caching disabled), create a new one
  for (const [key, value] of Object.entries(envMap)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    process.env[key] = value;
  }

  const world = createWorld();

  // Cache the newly created World (if caching is enabled)
  if (useCache) {
    worldCache.set(cacheKey, world);
  }

  return world;
}

/**
 * Creates a structured error object from a caught error
 */
function createServerActionError<T>(
  error: unknown,
  operation: string,
  requestParams?: Record<string, any>
): ServerActionResult<T> {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[web-api] ${operation} error:`, err);
  let errorResponse: ServerActionError;

  console.warn('isWorkflowAPIError(error)', WorkflowAPIError.is(error));
  console.warn(
    'error.status',
    WorkflowAPIError.is(error) ? error.status : undefined
  );
  console.warn('error.url', WorkflowAPIError.is(error) ? error.url : undefined);
  console.warn(
    'error.code',
    WorkflowAPIError.is(error) ? error.code : undefined
  );

  if (WorkflowAPIError.is(error)) {
    // If the World threw the error on fetch/fs.read, we add that data
    // to the error object
    errorResponse = {
      message: getUserFacingErrorMessage(err, error.status),
      layer: 'API',
      cause: err.stack || err.message,
      request: {
        operation,
        params: requestParams ?? {},
        status: error.status,
        url: error.url,
        code: error.code ?? undefined,
      },
    };
  } else if (WorkflowRunNotFoundError.is(error)) {
    // The World might repackage the error as a WorkflowRunNotFoundError
    errorResponse = {
      message: getUserFacingErrorMessage(error, 404),
      layer: 'API',
      cause: err.stack || err.message,
      request: { operation, status: 404, params: requestParams ?? {} },
    };
  } else {
    errorResponse = {
      message: getUserFacingErrorMessage(err),
      layer: 'server',
      cause: err.stack || err.message,
      request: { status: 500, operation, params: requestParams ?? {} },
    };
  }

  return {
    success: false,
    error: errorResponse,
  };
}

/**
 * Converts an error into a user-facing message
 */
function getUserFacingErrorMessage(error: Error, status?: number): string {
  console.warn('getUserFacingErrorMessage', error, status);
  if (!status) {
    console.warn('No status, returning error message', error.message);
    return 'Error creating response: ' + error.message;
  }

  // Check for common error patterns
  if (status === 403 || status === 401) {
    return 'Access denied. Please check your credentials and permissions.';
  }

  if (status === 404) {
    return 'The requested resource was not found.';
  }

  if (status === 500) {
    return 'Error connecting to World backend, please try again later.';
  }

  if (error.message?.includes('Network') || error.message?.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Return the original message for other errors
  return error.message || 'An unexpected error occurred';
}

const toJSONCompatible = <T>(data: T): T => {
  if (data && typeof data === 'object') {
    return JSON.parse(JSON.stringify(data)) as T;
  }
  return data;
};

const hydrate = <T>(data: T): T => {
  data = toJSONCompatible(data);
  try {
    return hydrateResourceIO(data as any) as T;
  } catch (error) {
    throw new Error('Failed to hydrate data', { cause: error });
  }
};

/**
 * Helper to create successful responses
 * @param data - The data to return on success
 * @returns ServerActionResult with success=true and the data
 */
function createResponse<T>(data: T): ServerActionResult<T> {
  data = toJSONCompatible(data);
  return {
    success: true,
    data,
  };
}

/**
 * Fetch paginated list of workflow runs
 */
export async function fetchRuns(
  worldEnv: EnvMap,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    workflowName?: string;
    status?: WorkflowRunStatus;
  }
): Promise<ServerActionResult<PaginatedResult<WorkflowRun>>> {
  const {
    cursor,
    sortOrder = 'desc',
    limit = 10,
    workflowName,
    status,
  } = params;
  try {
    const world = getWorldFromEnv(worldEnv);
    const result = await world.runs.list({
      ...(workflowName ? { workflowName } : {}),
      ...(status ? { status: status } : {}),
      pagination: { cursor, limit, sortOrder },
      resolveData: 'none',
    });
    return createResponse({
      data: (result.data as unknown as WorkflowRun[]).map(hydrate),
      cursor: result.cursor ?? undefined,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return createServerActionError<PaginatedResult<WorkflowRun>>(
      error,
      'world.runs.list',
      params
    );
  }
}

/**
 * Fetch a single workflow run with full data
 */
export async function fetchRun(
  worldEnv: EnvMap,
  runId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<WorkflowRun>> {
  try {
    const world = getWorldFromEnv(worldEnv);
    const run = await world.runs.get(runId, { resolveData });
    const hydratedRun = hydrate(run as WorkflowRun);
    return createResponse(hydratedRun);
  } catch (error) {
    return createServerActionError<WorkflowRun>(error, 'world.runs.get', {
      runId,
      resolveData,
    });
  }
}

/**
 * Fetch paginated list of steps for a run
 */
export async function fetchSteps(
  worldEnv: EnvMap,
  runId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Step>>> {
  const { cursor, sortOrder = 'asc', limit = 100 } = params;
  try {
    const world = getWorldFromEnv(worldEnv);
    const result = await world.steps.list({
      runId,
      pagination: { cursor, limit, sortOrder },
      resolveData: 'none',
    });
    return createResponse({
      data: (result.data as Step[]).map(hydrate),
      cursor: result.cursor ?? undefined,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return createServerActionError<PaginatedResult<Step>>(
      error,
      'world.steps.list',
      {
        runId,
        ...params,
      }
    );
  }
}

/**
 * Fetch a single step with full data
 */
export async function fetchStep(
  worldEnv: EnvMap,
  runId: string,
  stepId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<Step>> {
  try {
    const world = getWorldFromEnv(worldEnv);
    const step = await world.steps.get(runId, stepId, { resolveData });
    const hydratedStep = hydrate(step as Step);
    return createResponse(hydratedStep);
  } catch (error) {
    return createServerActionError<Step>(error, 'world.steps.get', {
      runId,
      stepId,
      resolveData,
    });
  }
}

/**
 * Fetch paginated list of events for a run
 */
export async function fetchEvents(
  worldEnv: EnvMap,
  runId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Event>>> {
  const { cursor, sortOrder = 'asc', limit = 1000 } = params;
  try {
    const world = getWorldFromEnv(worldEnv);
    const result = await world.events.list({
      runId,
      pagination: { cursor, limit, sortOrder },
      resolveData: 'none',
    });
    return createResponse({
      data: result.data as unknown as Event[],
      cursor: result.cursor ?? undefined,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return createServerActionError<PaginatedResult<Event>>(
      error,
      'world.events.list',
      {
        runId,
        ...params,
      }
    );
  }
}

/**
 * Fetch events by correlation ID
 */
export async function fetchEventsByCorrelationId(
  worldEnv: EnvMap,
  correlationId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    withData?: boolean;
  }
): Promise<ServerActionResult<PaginatedResult<Event>>> {
  const { cursor, sortOrder = 'asc', limit = 1000, withData = false } = params;
  try {
    const world = getWorldFromEnv(worldEnv);
    const result = await world.events.listByCorrelationId({
      correlationId,
      pagination: { cursor, limit, sortOrder },
      resolveData: withData ? 'all' : 'none',
    });
    return createResponse({
      data: result.data.map(hydrate),
      cursor: result.cursor ?? undefined,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return createServerActionError<PaginatedResult<Event>>(
      error,
      'world.events.listByCorrelationId',
      {
        correlationId,
        ...params,
      }
    );
  }
}

/**
 * Fetch paginated list of hooks
 */
export async function fetchHooks(
  worldEnv: EnvMap,
  params: {
    runId?: string;
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Hook>>> {
  const { runId, cursor, sortOrder = 'desc', limit = 10 } = params;
  try {
    const world = getWorldFromEnv(worldEnv);
    const result = await world.hooks.list({
      ...(runId ? { runId } : {}),
      pagination: { cursor, limit, sortOrder },
      resolveData: 'none',
    });
    return createResponse({
      data: (result.data as Hook[]).map(hydrate),
      cursor: result.cursor ?? undefined,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return createServerActionError<PaginatedResult<Hook>>(
      error,
      'world.hooks.list',
      params
    );
  }
}

/**
 * Fetch a single hook with full data
 */
export async function fetchHook(
  worldEnv: EnvMap,
  hookId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<Hook>> {
  try {
    const world = getWorldFromEnv(worldEnv);
    const hook = await world.hooks.get(hookId, { resolveData });
    return createResponse(hydrate(hook as Hook));
  } catch (error) {
    return createServerActionError<Hook>(error, 'world.hooks.get', {
      hookId,
      resolveData,
    });
  }
}

/**
 * Cancel a workflow run
 */
export async function cancelRun(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<void>> {
  try {
    const world = getWorldFromEnv(worldEnv);
    await world.runs.cancel(runId);
    return createResponse(undefined);
  } catch (error) {
    return createServerActionError<void>(error, 'world.runs.cancel', { runId });
  }
}

/**
 * Start a new workflow run.
 *
 * This requires the ID of an existing run of which to re-use the deployment ID of.
 */
export async function recreateRun(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<string>> {
  try {
    const world = getWorldFromEnv({ ...worldEnv });
    const run = await world.runs.get(runId);
    const hydratedRun = hydrate(run as WorkflowRun);
    const deploymentId = run.deploymentId;
    const newRun = await start(
      { workflowId: run.workflowName },
      hydratedRun.input,
      {
        deploymentId,
      }
    );
    return createResponse(newRun.runId);
  } catch (error) {
    return createServerActionError<string>(error, 'recreateRun', { runId });
  }
}

/**
 * Re-enqueue a workflow run.
 *
 * This re-enqueues the workflow orchestration layer. It's a no-op unless the workflow
 * got stuck due to an implementation issue in the World. Useful for debugging custom Worlds.
 */
export async function reenqueueRun(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<void>> {
  try {
    const world = getWorldFromEnv({ ...worldEnv });
    const run = await world.runs.get(runId);
    const deploymentId = run.deploymentId;

    await world.queue(
      `__wkf_workflow_${run.workflowName}`,
      {
        runId,
      },
      {
        deploymentId,
      }
    );

    return createResponse(undefined);
  } catch (error) {
    return createServerActionError<void>(error, 'reenqueueRun', { runId });
  }
}

export interface StopSleepResult {
  /** Number of pending sleeps that were stopped */
  stoppedCount: number;
}

export interface StopSleepOptions {
  /**
   * Optional list of specific correlation IDs to target.
   * If provided, only these sleep calls will be interrupted.
   * If not provided, all pending sleep calls will be interrupted.
   */
  correlationIds?: string[];
}

/**
 * Wake up a workflow run by interrupting pending sleep() calls.
 *
 * This finds wait_created events without matching wait_completed events,
 * creates wait_completed events for them, and then re-enqueues the run.
 *
 * @param worldEnv - Environment configuration for the World
 * @param runId - The run ID to wake up
 * @param options - Optional settings to narrow down targeting (specific correlation IDs)
 */
export async function wakeUpRun(
  worldEnv: EnvMap,
  runId: string,
  options?: StopSleepOptions
): Promise<ServerActionResult<StopSleepResult>> {
  try {
    const world = getWorldFromEnv({ ...worldEnv });
    const run = await world.runs.get(runId);
    const deploymentId = run.deploymentId;

    // Fetch all events for the run
    const eventsResult = await world.events.list({
      runId,
      pagination: { limit: 1000 },
      resolveData: 'none',
    });

    // Find wait_created events without matching wait_completed events
    const waitCreatedEvents = eventsResult.data.filter(
      (e) => e.eventType === 'wait_created'
    );
    const waitCompletedCorrelationIds = new Set(
      eventsResult.data
        .filter((e) => e.eventType === 'wait_completed')
        .map((e) => e.correlationId)
    );

    let pendingWaits = waitCreatedEvents.filter(
      (e) => !waitCompletedCorrelationIds.has(e.correlationId)
    );

    // If specific correlation IDs are provided, filter to only those
    if (options?.correlationIds && options.correlationIds.length > 0) {
      const targetCorrelationIds = new Set(options.correlationIds);
      pendingWaits = pendingWaits.filter(
        (e) => e.correlationId && targetCorrelationIds.has(e.correlationId)
      );
    }

    // Create wait_completed events for each pending wait
    for (const waitEvent of pendingWaits) {
      if (waitEvent.correlationId) {
        await world.events.create(runId, {
          eventType: 'wait_completed',
          correlationId: waitEvent.correlationId,
        });
      }
    }

    // Re-enqueue the run to wake it up
    if (pendingWaits.length > 0) {
      await world.queue(
        `__wkf_workflow_${run.workflowName}`,
        {
          runId,
        },
        {
          deploymentId,
        }
      );
    }

    return createResponse({ stoppedCount: pendingWaits.length });
  } catch (error) {
    return createServerActionError<StopSleepResult>(error, 'wakeUpRun', {
      runId,
      correlationIds: options?.correlationIds,
    });
  }
}

export interface ResumeHookResult {
  /** The hook ID that was resumed */
  hookId: string;
  /** The run ID associated with the hook */
  runId: string;
}

/**
 * Resume a hook by sending a payload.
 *
 * This sends a payload to a hook identified by its token, which resumes
 * the associated workflow run. The payload will be available as the return
 * value of the `createHook()` call in the workflow.
 *
 * @param worldEnv - Environment configuration for the World
 * @param token - The hook token
 * @param payload - The JSON payload to send to the hook
 */
export async function resumeHook(
  worldEnv: EnvMap,
  token: string,
  payload: unknown
): Promise<ServerActionResult<ResumeHookResult>> {
  try {
    // Initialize the world so resumeHookRuntime can access it
    getWorldFromEnv({ ...worldEnv });

    const hook = await resumeHookRuntime(token, payload);

    return createResponse({
      hookId: hook.hookId,
      runId: hook.runId,
    });
  } catch (error) {
    return createServerActionError<ResumeHookResult>(error, 'resumeHook', {
      token,
    });
  }
}

export async function readStreamServerAction(
  env: EnvMap,
  streamId: string,
  startIndex?: number
): Promise<ReadableStream<unknown> | ServerActionError> {
  try {
    const world = getWorldFromEnv(env);
    // We should probably use getRun().getReadable() instead, to make the UI
    // more consistent with runtime behavior, and also expose a "replay" and "startIndex",
    // feature, to allow for testing World behavior.
    const stream = await world.readFromStream(streamId, startIndex);

    const revivers = getExternalRevivers(globalThis, [], '');
    const transform = getDeserializeStream(revivers);

    return stream.pipeThrough(transform);
  } catch (error) {
    const actionError = createServerActionError(error, 'world.readFromStream', {
      streamId,
      startIndex,
    });
    if (!actionError.success) {
      return actionError.error;
    }
    // Shouldn't happen, this is just a type guard
    throw new Error();
  }
}

/**
 * List all stream IDs for a run
 */
export async function fetchStreams(
  env: EnvMap,
  runId: string
): Promise<ServerActionResult<string[]>> {
  try {
    const world = getWorldFromEnv(env);
    const streams = await world.listStreamsByRunId(runId);
    return createResponse(streams);
  } catch (error) {
    return createServerActionError<string[]>(
      error,
      'world.listStreamsByRunId',
      {
        runId,
      }
    );
  }
}

/**
 * Fetch the workflows manifest from the workflow route directory
 * The manifest is generated at build time and contains static structure info about workflows
 *
 * Configuration priority:
 * 1. WORKFLOW_MANIFEST_PATH - explicit path to the manifest file
 * 2. Standard Next.js app router locations (app/.well-known/workflow/v1/manifest.json)
 * 3. WORKFLOW_EMBEDDED_DATA_DIR - legacy data directory
 */
export async function fetchWorkflowsManifest(
  worldEnv: EnvMap
): Promise<ServerActionResult<any>> {
  const cwd = process.cwd();

  console.log('[fetchWorkflowsManifest] cwd:', cwd);
  console.log(
    '[fetchWorkflowsManifest] WORKFLOW_MANIFEST_PATH from env:',
    worldEnv.WORKFLOW_MANIFEST_PATH
  );

  // Helper to resolve path (absolute or relative to cwd)
  const resolvePath = (p: string) =>
    path.isAbsolute(p) ? p : path.join(cwd, p);

  // Build list of paths to try, in priority order
  const manifestPaths: string[] = [];

  // 1. Explicit manifest path configuration (highest priority)
  if (worldEnv.WORKFLOW_MANIFEST_PATH) {
    manifestPaths.push(resolvePath(worldEnv.WORKFLOW_MANIFEST_PATH));
  }
  if (process.env.WORKFLOW_MANIFEST_PATH) {
    manifestPaths.push(resolvePath(process.env.WORKFLOW_MANIFEST_PATH));
  }

  // 2. Standard Next.js app router locations
  manifestPaths.push(
    path.join(cwd, 'app/.well-known/workflow/v1/manifest.json'),
    path.join(cwd, 'src/app/.well-known/workflow/v1/manifest.json')
  );

  // 3. Legacy data directory locations
  if (worldEnv.WORKFLOW_EMBEDDED_DATA_DIR) {
    manifestPaths.push(
      path.join(
        resolvePath(worldEnv.WORKFLOW_EMBEDDED_DATA_DIR),
        'manifest.json'
      )
    );
  }
  if (process.env.WORKFLOW_EMBEDDED_DATA_DIR) {
    manifestPaths.push(
      path.join(
        resolvePath(process.env.WORKFLOW_EMBEDDED_DATA_DIR),
        'manifest.json'
      )
    );
  }

  console.log('[fetchWorkflowsManifest] Trying paths:', manifestPaths);

  // Try each path until we find the manifest
  for (const manifestPath of manifestPaths) {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      const workflowCount = Object.keys(manifest.workflows || {}).reduce(
        (acc, filePath) =>
          acc + Object.keys(manifest.workflows[filePath] || {}).length,
        0
      );
      console.log(
        `[fetchWorkflowsManifest] Found manifest at: ${manifestPath} with ${workflowCount} workflows`
      );
      return createResponse(manifest);
    } catch (err) {
      console.log(
        `[fetchWorkflowsManifest] Failed to read: ${manifestPath}`,
        (err as Error).message
      );
      // Continue to next path
    }
  }

  // If no manifest found, return an empty manifest
  // This allows the UI to work without workflows graph data
  console.log('[fetchWorkflowsManifest] No manifest found, returning empty');
  return createResponse({
    version: '1.0.0',
    steps: {},
    workflows: {},
  });
}

/**
 * Project validation result from server-side checks.
 */
export interface ProjectValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ProjectValidationResult {
  valid: boolean;
  errors: ProjectValidationError[];
  warnings: ProjectValidationError[];
}

/**
 * Validate a project configuration on the server.
 *
 * This performs server-side validation including:
 * - Checking if required environment variables are present
 * - Validating file paths exist (for local world)
 * - Testing connection to remote backends
 */
export async function validateProjectConfig(
  worldEnv: EnvMap,
  worldId: string
): Promise<ServerActionResult<ProjectValidationResult>> {
  const envMap = resolveEnvMap(worldEnv);
  const errors: ProjectValidationError[] = [];
  const warnings: ProjectValidationError[] = [];

  try {
    // World-specific validation
    switch (worldId) {
      case 'local':
        await validateLocalWorldConfig(envMap, errors, warnings);
        break;
      case 'vercel':
        await validateVercelWorldConfig(envMap, errors, warnings);
        break;
      case 'postgres':
        validatePostgresWorldConfig(envMap, errors, warnings);
        break;
      default:
        // For unknown worlds, just check that we can create a world instance
        try {
          getWorldFromEnv(envMap);
        } catch (err) {
          errors.push({
            field: 'WORKFLOW_TARGET_WORLD',
            message: `Failed to initialize world: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'error',
          });
        }
    }

    return createResponse({
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    return createServerActionError(error, 'validateProjectConfig', {
      worldId,
    });
  }
}

/**
 * Validate local world configuration.
 */
async function validateLocalWorldConfig(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  warnings: ProjectValidationError[]
): Promise<void> {
  const dataDir = envMap.WORKFLOW_LOCAL_DATA_DIR;
  const port = envMap.PORT;

  // Validate port
  if (port) {
    const portNum = Number.parseInt(port, 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      errors.push({
        field: 'PORT',
        message: 'Port must be a number between 1 and 65535',
        severity: 'error',
      });
    }
  }

  // Check data directory
  if (dataDir) {
    const resolvedPath = path.isAbsolute(dataDir)
      ? dataDir
      : path.resolve(process.cwd(), dataDir);

    try {
      await fs.access(resolvedPath);
    } catch {
      // Directory doesn't exist - this might be okay, workflow data will be created
      warnings.push({
        field: 'WORKFLOW_LOCAL_DATA_DIR',
        message: `Directory not found: ${resolvedPath}. It will be created when workflows run.`,
        severity: 'warning',
      });
    }
  }

  // Try to create a world to validate the overall configuration
  try {
    getWorldFromEnv(envMap);
  } catch (err) {
    errors.push({
      field: 'WORKFLOW_TARGET_WORLD',
      message: `Failed to initialize local world: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'error',
    });
  }
}

/**
 * Validate Vercel world configuration.
 */
async function validateVercelWorldConfig(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): Promise<void> {
  const authToken = envMap.WORKFLOW_VERCEL_AUTH_TOKEN;
  const project = envMap.WORKFLOW_VERCEL_PROJECT;
  const team = envMap.WORKFLOW_VERCEL_TEAM;
  const env = envMap.WORKFLOW_VERCEL_ENV;

  // Check required fields
  if (!authToken) {
    errors.push({
      field: 'WORKFLOW_VERCEL_AUTH_TOKEN',
      message: 'Auth token is required for Vercel backend',
      severity: 'error',
    });
  }

  if (!project) {
    errors.push({
      field: 'WORKFLOW_VERCEL_PROJECT',
      message: 'Project is required for Vercel backend',
      severity: 'error',
    });
  }

  if (!team) {
    errors.push({
      field: 'WORKFLOW_VERCEL_TEAM',
      message: 'Team is required for Vercel backend',
      severity: 'error',
    });
  }

  // Validate environment value
  if (env && !['production', 'preview', 'development'].includes(env)) {
    errors.push({
      field: 'WORKFLOW_VERCEL_ENV',
      message:
        'Environment must be one of: production, preview, or development',
      severity: 'error',
    });
  }

  // If we have all required fields, try to create a world
  if (authToken && project && team && errors.length === 0) {
    try {
      const world = getWorldFromEnv(envMap);
      // Try a simple API call to validate the connection
      await world.runs.list({ pagination: { limit: 1 } });
    } catch (err) {
      errors.push({
        field: 'WORKFLOW_VERCEL_AUTH_TOKEN',
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
    }
  }
}

/**
 * Validate Postgres world configuration.
 */
function validatePostgresWorldConfig(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const url = envMap.WORKFLOW_POSTGRES_URL;

  if (!url) {
    errors.push({
      field: 'WORKFLOW_POSTGRES_URL',
      message: 'PostgreSQL URL is required',
      severity: 'error',
    });
    return;
  }

  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    errors.push({
      field: 'WORKFLOW_POSTGRES_URL',
      message: 'PostgreSQL URL must start with postgres:// or postgresql://',
      severity: 'error',
    });
  }

  // Try to create a world to validate the connection
  try {
    getWorldFromEnv(envMap);
  } catch (err) {
    errors.push({
      field: 'WORKFLOW_POSTGRES_URL',
      message: `Failed to initialize postgres world: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'error',
    });
  }
}
