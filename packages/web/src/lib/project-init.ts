/**
 * Project initialization from query parameters.
 *
 * When the app loads with configuration query params, this module:
 * 1. Parses the query params into a Project configuration
 * 2. Removes the config params from the URL (preserving view state params)
 * 3. Returns the initialized project
 */

import {
  type EnvMap,
  type Project,
  createProject,
  generateProjectId,
} from '@workflow/utils/project';
import { getWorldById, getWorldEnvVars } from '@workflow/utils/worlds-manifest';
import { findRecentProjectByEnv, loadRecentProjects } from './project-storage';

/**
 * Query param names that represent configuration (will be removed after init).
 */
const CONFIG_PARAM_NAMES = new Set([
  'backend',
  'env',
  'authToken',
  'project',
  'team',
  'port',
  'dataDir',
  'manifestPath',
  'postgresUrl',
  'projectDir',
  // Also include the raw env var names
  'WORKFLOW_TARGET_WORLD',
  'WORKFLOW_LOCAL_DATA_DIR',
  'WORKFLOW_MANIFEST_PATH',
  'WORKFLOW_VERCEL_AUTH_TOKEN',
  'WORKFLOW_VERCEL_PROJECT',
  'WORKFLOW_VERCEL_TEAM',
  'WORKFLOW_VERCEL_ENV',
  'WORKFLOW_POSTGRES_URL',
  'PORT',
]);

/**
 * Map from query param names to environment variable names.
 */
const PARAM_TO_ENV: Record<string, string> = {
  backend: 'WORKFLOW_TARGET_WORLD',
  dataDir: 'WORKFLOW_LOCAL_DATA_DIR',
  manifestPath: 'WORKFLOW_MANIFEST_PATH',
  authToken: 'WORKFLOW_VERCEL_AUTH_TOKEN',
  project: 'WORKFLOW_VERCEL_PROJECT',
  team: 'WORKFLOW_VERCEL_TEAM',
  env: 'WORKFLOW_VERCEL_ENV',
  port: 'PORT',
  postgresUrl: 'WORKFLOW_POSTGRES_URL',
};

/**
 * Map from backend shorthand names to world IDs.
 */
const BACKEND_TO_WORLD_ID: Record<string, string> = {
  local: 'local',
  vercel: 'vercel',
  postgres: 'postgres',
  '@workflow/world-local': 'local',
  '@workflow/world-vercel': 'vercel',
  '@workflow/world-postgres': 'postgres',
};

/**
 * Parse query parameters into an envMap and worldId.
 */
export function parseQueryParamsToEnv(searchParams: URLSearchParams): {
  envMap: EnvMap;
  worldId: string;
  projectDir?: string;
} {
  const envMap: EnvMap = {};
  let worldId = 'local'; // Default to local
  let projectDir: string | undefined;

  // First check for raw env var names
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('WORKFLOW_') || key === 'PORT') {
      envMap[key] = value;
    }
  }

  // Then check for shorthand param names (these override raw names)
  for (const [param, envName] of Object.entries(PARAM_TO_ENV)) {
    const value = searchParams.get(param);
    if (value !== null && value !== '') {
      envMap[envName] = value;
    }
  }

  // Handle projectDir separately (not an env var, but stored on Project)
  const projectDirParam = searchParams.get('projectDir');
  if (projectDirParam) {
    projectDir = projectDirParam;
  }

  // Determine worldId from backend param or WORKFLOW_TARGET_WORLD
  const backendParam =
    searchParams.get('backend') || envMap.WORKFLOW_TARGET_WORLD;
  if (backendParam) {
    worldId = BACKEND_TO_WORLD_ID[backendParam] || backendParam;
    // Also set WORKFLOW_TARGET_WORLD to the package name if it's a known world
    const world = getWorldById(worldId);
    if (world) {
      envMap.WORKFLOW_TARGET_WORLD = world.package;
    } else {
      envMap.WORKFLOW_TARGET_WORLD = backendParam;
    }
  }

  return { envMap, worldId, projectDir };
}

/**
 * Check if the search params contain any configuration params.
 */
export function hasConfigParams(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (CONFIG_PARAM_NAMES.has(key)) {
      return true;
    }
  }
  return false;
}

/**
 * Remove configuration params from the URL, keeping view state params.
 */
export function removeConfigParams(searchParams: URLSearchParams): string {
  const newParams = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    // Keep params that are NOT config params
    if (!CONFIG_PARAM_NAMES.has(key)) {
      newParams.set(key, value);
    }
  }

  return newParams.toString();
}

/**
 * Initialize a project from query parameters.
 *
 * This will:
 * 1. Parse the query params into an envMap
 * 2. Look for an existing project with matching configuration
 * 3. Create a new project if none found
 * 4. Return the project (doesn't modify the URL - that's the caller's responsibility)
 */
export function initializeProjectFromParams(
  searchParams: URLSearchParams
): Project | null {
  // If no config params, return null (use stored project)
  if (!hasConfigParams(searchParams)) {
    return null;
  }

  const { envMap, worldId, projectDir } = parseQueryParamsToEnv(searchParams);

  // Check if we have an existing project with this configuration
  const existing = findRecentProjectByEnv(envMap, worldId);
  if (existing) {
    // Update the existing project with any new env values and projectDir
    return {
      ...existing,
      envMap: { ...existing.envMap, ...envMap },
      projectDir: projectDir || existing.projectDir,
      lastUsed: Date.now(),
    };
  }

  // Create a new project
  const world = getWorldById(worldId);
  const name = world?.name || worldId;

  return createProject(worldId, envMap, {
    name: `${name} Project`,
    projectDir,
  });
}

/**
 * Get the cleaned URL after removing config params.
 */
export function getCleanedUrl(
  pathname: string,
  searchParams: URLSearchParams
): string {
  const cleanedSearch = removeConfigParams(searchParams);
  return cleanedSearch ? `${pathname}?${cleanedSearch}` : pathname;
}
