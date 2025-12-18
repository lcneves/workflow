import { WorkflowAPIError } from '@workflow/errors';
import type {
  CancelWorkflowRunParams,
  CreateEventParams,
  CreateEventRequest,
  CreateHookRequest,
  CreateStepRequest,
  CreateWorkflowRunRequest,
  GetHookParams,
  GetStepParams,
  GetWorkflowRunParams,
  ListEventsByCorrelationIdParams,
  ListEventsParams,
  ListHooksParams,
  ListWorkflowRunStepsParams,
  ListWorkflowRunsParams,
  MessageId,
  PauseWorkflowRunParams,
  QueueOptions,
  QueuePayload,
  QueuePrefix,
  ResumeWorkflowRunParams,
  UpdateStepRequest,
  UpdateWorkflowRunRequest,
  ValidQueueName,
  World,
} from '@workflow/world';
import retry, { type Options as RetryOptions } from 'async-retry';

/**
 * Default retry options for World operations.
 *
 * We use a conservative retry strategy to handle transient failures:
 * - 3 retries (4 total attempts)
 * - Exponential backoff starting at 250ms
 * - Maximum delay of 5 seconds between retries
 * - Randomization to avoid thundering herd
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 3,
  minTimeout: 250,
  maxTimeout: 5000,
  factor: 2,
  randomize: true,
};

/**
 * Common retryable network error codes.
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * HTTP status codes that should trigger a retry.
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Determines if an error is retryable.
 *
 * We retry on:
 * - Network errors (fetch failures, timeouts)
 * - 5xx server errors
 * - 408 Request Timeout
 * - 429 Too Many Requests
 *
 * We do NOT retry on:
 * - 4xx client errors (except 408, 429)
 * - Business logic errors
 */
function isRetryableError(error: unknown): boolean {
  // WorkflowAPIError with status code - check if it's retryable
  if (WorkflowAPIError.is(error) && error.status !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  // For non-WorkflowAPIError errors (network errors, etc.)
  if (error instanceof Error) {
    // Check for retryable network error codes
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
      return true;
    }

    // Check for fetch-related errors or AbortError from timeouts
    if (
      (error.name === 'TypeError' && error.message.includes('fetch failed')) ||
      error.name === 'AbortError'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Wraps an async function with retry logic.
 *
 * @param fn - The async function to wrap
 * @param options - Optional retry configuration
 * @returns The result of the function, or throws after all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return retry(
    async (bail: (e: Error) => void) => {
      try {
        return await fn();
      } catch (error) {
        // If the error is not retryable, bail immediately
        if (!isRetryableError(error)) {
          bail(error as Error);
          // This throw is never reached, but TypeScript requires it
          throw error;
        }
        // Otherwise, throw to trigger a retry
        throw error;
      }
    },
    {
      ...DEFAULT_RETRY_OPTIONS,
      ...options,
    }
  );
}

/**
 * A World wrapper that adds automatic retry logic for all async operations.
 *
 * This class wraps another World instance and intercepts all method calls,
 * adding retry logic with exponential backoff for transient failures.
 */
export class RetryWorld implements World {
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  // ============ Queue methods ============

  getDeploymentId(): Promise<string> {
    // Idempotent read - safe to retry
    return withRetry(() => this.world.getDeploymentId());
  }

  queue(
    queueName: ValidQueueName,
    message: QueuePayload,
    opts?: QueueOptions
  ): Promise<{ messageId: MessageId }> {
    // Non-idempotent write - no retry
    return this.world.queue(queueName, message, opts);
  }

  createQueueHandler(
    queueNamePrefix: QueuePrefix,
    handler: (
      message: unknown,
      meta: { attempt: number; queueName: ValidQueueName; messageId: MessageId }
      // biome-ignore lint/suspicious/noConfusingVoidType: matches World interface
    ) => Promise<void | { timeoutSeconds: number }>
  ): (req: Request) => Promise<Response> {
    // Factory method - no retry needed
    return this.world.createQueueHandler(queueNamePrefix, handler);
  }

  // ============ Streamer methods ============

  writeToStream(
    name: string,
    runId: string | Promise<string>,
    chunk: string | Uint8Array
  ): Promise<void> {
    // Non-idempotent write - no retry
    return this.world.writeToStream(name, runId, chunk);
  }

  closeStream(name: string, runId: string | Promise<string>): Promise<void> {
    // Non-idempotent write - no retry
    return this.world.closeStream(name, runId);
  }

  readFromStream(
    name: string,
    startIndex?: number
  ): Promise<ReadableStream<Uint8Array>> {
    // Idempotent read - safe to retry
    return withRetry(() => this.world.readFromStream(name, startIndex));
  }

  listStreamsByRunId(runId: string): Promise<string[]> {
    // Idempotent read - safe to retry
    return withRetry(() => this.world.listStreamsByRunId(runId));
  }

  // ============ Optional start method ============

  async start(): Promise<void> {
    // Non-idempotent - no retry
    if (this.world.start) {
      await this.world.start();
    }
  }

  // ============ Storage: runs ============

  readonly runs = {
    create: (data: CreateWorkflowRunRequest) => {
      // Non-idempotent write - no retry
      return this.world.runs.create(data);
    },
    get: (id: string, params?: GetWorkflowRunParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.runs.get(id, params));
    },
    update: (id: string, data: UpdateWorkflowRunRequest) => {
      // Non-idempotent write - no retry
      return this.world.runs.update(id, data);
    },
    list: (params?: ListWorkflowRunsParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.runs.list(params));
    },
    cancel: (id: string, params?: CancelWorkflowRunParams) => {
      // Non-idempotent write - no retry
      return this.world.runs.cancel(id, params);
    },
    pause: (id: string, params?: PauseWorkflowRunParams) => {
      // Non-idempotent write - no retry
      return this.world.runs.pause(id, params);
    },
    resume: (id: string, params?: ResumeWorkflowRunParams) => {
      // Non-idempotent write - no retry
      return this.world.runs.resume(id, params);
    },
  };

  // ============ Storage: steps ============

  readonly steps = {
    create: (runId: string, data: CreateStepRequest) => {
      // Non-idempotent write - no retry
      return this.world.steps.create(runId, data);
    },
    get: (
      runId: string | undefined,
      stepId: string,
      params?: GetStepParams
    ) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.steps.get(runId, stepId, params));
    },
    update: (runId: string, stepId: string, data: UpdateStepRequest) => {
      // Non-idempotent write - no retry
      return this.world.steps.update(runId, stepId, data);
    },
    list: (params: ListWorkflowRunStepsParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.steps.list(params));
    },
  };

  // ============ Storage: events ============

  readonly events = {
    create: (
      runId: string,
      data: CreateEventRequest,
      params?: CreateEventParams
    ) => {
      // Non-idempotent write - no retry
      return this.world.events.create(runId, data, params);
    },
    list: (params: ListEventsParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.events.list(params));
    },
    listByCorrelationId: (params: ListEventsByCorrelationIdParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.events.listByCorrelationId(params));
    },
  };

  // ============ Storage: hooks ============

  readonly hooks = {
    create: (
      runId: string,
      data: CreateHookRequest,
      params?: GetHookParams
    ) => {
      // Non-idempotent write - no retry
      return this.world.hooks.create(runId, data, params);
    },
    get: (hookId: string, params?: GetHookParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.hooks.get(hookId, params));
    },
    getByToken: (token: string, params?: GetHookParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.hooks.getByToken(token, params));
    },
    list: (params: ListHooksParams) => {
      // Idempotent read - safe to retry
      return withRetry(() => this.world.hooks.list(params));
    },
    dispose: (hookId: string, params?: GetHookParams) => {
      // Non-idempotent write - no retry
      return this.world.hooks.dispose(hookId, params);
    },
  };
}
