/**
 * Project type and validation utilities.
 *
 * A Project represents a configuration for connecting to a Workflow World,
 * containing all necessary environment variables and metadata.
 *
 * NOTE: This module is client-safe and should not import Node.js-specific modules.
 * Filesystem validation is done server-side via the validateProject options.
 */

import { getWorldById, isKnownWorld } from './worlds-manifest.js';

/**
 * Get a short display name from a directory path.
 * This is a client-safe version that doesn't require Node.js path module.
 */
function getDirShortName(projectDir: string): string {
  // Handle both Unix and Windows path separators
  const parts = projectDir.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) {
    return '/';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  // Return last two parts for context (e.g., "org/project")
  return parts.slice(-2).join('/');
}

/**
 * Environment map - a record of environment variable names to values.
 */
export type EnvMap = Record<string, string | undefined>;

/**
 * A Project configuration for connecting to a Workflow World.
 */
export interface Project {
  /** Unique identifier for this project configuration */
  id: string;
  /** Human-readable name for the project */
  name: string;
  /** The world ID (e.g., 'local', 'vercel', 'postgres') */
  worldId: string;
  /** Environment variables for connecting to the world */
  envMap: EnvMap;
  /** Path to the project directory (independent of world backend) */
  projectDir?: string;
  /** Timestamp when this project was last used */
  lastUsed?: number;
  /** Timestamp when this project was created */
  createdAt: number;
}

/**
 * Validation error for a specific field.
 */
export interface ProjectValidationError {
  /** The field that has an error */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Error severity */
  severity: 'error' | 'warning';
}

/**
 * Result of project validation.
 */
export interface ProjectValidationResult {
  /** Whether the project configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ProjectValidationError[];
  /** List of validation warnings */
  warnings: ProjectValidationError[];
}

/**
 * Validate a Project configuration against the world manifest.
 *
 * This function checks:
 * 1. Required environment variables are present
 * 2. Environment variable values are valid (format checks)
 * 3. For known worlds, additional specific checks
 *
 * Note: This is a client-safe validation. Filesystem and network checks
 * are performed server-side via the validateProjectServerAction.
 *
 * @param project - The project to validate
 * @returns Validation result with errors and warnings
 */
export function validateProject(project: Project): ProjectValidationResult {
  const errors: ProjectValidationError[] = [];
  const warnings: ProjectValidationError[] = [];

  const worldId = project.worldId;
  const envMap = project.envMap;

  // Check if it's a known world
  if (!isKnownWorld(worldId)) {
    // For unknown worlds, we just check that some env vars are present
    if (Object.keys(envMap).length === 0) {
      warnings.push({
        field: 'envMap',
        message:
          'No environment variables configured. This may be intentional for some worlds.',
        severity: 'warning',
      });
    }
    return { valid: true, errors, warnings };
  }

  const world = getWorldById(worldId);
  if (!world) {
    errors.push({
      field: 'worldId',
      message: `Unknown world: ${worldId}`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // Check required environment variables
  for (const envName of world.requiredEnv) {
    const value = envMap[envName];
    if (!value || value.trim() === '') {
      errors.push({
        field: envName,
        message: `Required environment variable ${envName} is not set`,
        severity: 'error',
      });
    }
  }

  // World-specific validation
  switch (worldId) {
    case 'local':
      validateLocalWorld(envMap, errors, warnings);
      break;
    case 'vercel':
      validateVercelWorld(envMap, errors, warnings);
      break;
    case 'postgres':
      validatePostgresWorld(envMap, errors, warnings);
      break;
    case 'turso':
      validateTursoWorld(envMap, errors, warnings);
      break;
    case 'mongodb':
      validateMongoDBWorld(envMap, errors, warnings);
      break;
    case 'redis':
      validateRedisWorld(envMap, errors, warnings);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate local world configuration.
 * Note: Filesystem checks are handled by the server action, not here.
 */
function validateLocalWorld(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const port = envMap.PORT;

  // Validate port if provided
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
}

/**
 * Validate Vercel world configuration.
 * Note: Network checks for Vercel API validation are handled by the server action.
 */
function validateVercelWorld(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const env = envMap.WORKFLOW_VERCEL_ENV;

  // Validate environment value
  if (env && !['production', 'preview', 'development'].includes(env)) {
    errors.push({
      field: 'WORKFLOW_VERCEL_ENV',
      message:
        'Environment must be one of: production, preview, or development',
      severity: 'error',
    });
  }
}

/**
 * Validate Postgres world configuration.
 */
function validatePostgresWorld(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const url = envMap.WORKFLOW_POSTGRES_URL || envMap.DATABASE_URL;

  if (url) {
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
      errors.push({
        field: 'WORKFLOW_POSTGRES_URL',
        message: 'PostgreSQL URL must start with postgres:// or postgresql://',
        severity: 'error',
      });
    }
  }

  const concurrency = envMap.WORKFLOW_POSTGRES_WORKER_CONCURRENCY;
  if (concurrency) {
    const num = Number.parseInt(concurrency, 10);
    if (Number.isNaN(num) || num < 1) {
      errors.push({
        field: 'WORKFLOW_POSTGRES_WORKER_CONCURRENCY',
        message: 'Worker concurrency must be a positive number',
        severity: 'error',
      });
    }
  }
}

/**
 * Validate Turso world configuration.
 */
function validateTursoWorld(
  envMap: EnvMap,
  _errors: ProjectValidationError[],
  warnings: ProjectValidationError[]
): void {
  const url = envMap.WORKFLOW_TURSO_DATABASE_URL;
  const token = envMap.WORKFLOW_TURSO_AUTH_TOKEN;

  // Check if using remote URL without auth token
  if (url && url.startsWith('libsql://') && !token) {
    warnings.push({
      field: 'WORKFLOW_TURSO_AUTH_TOKEN',
      message: 'Remote Turso databases usually require an auth token',
      severity: 'warning',
    });
  }
}

/**
 * Validate MongoDB world configuration.
 */
function validateMongoDBWorld(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const uri = envMap.WORKFLOW_MONGODB_URI;

  if (
    uri &&
    !uri.startsWith('mongodb://') &&
    !uri.startsWith('mongodb+srv://')
  ) {
    errors.push({
      field: 'WORKFLOW_MONGODB_URI',
      message: 'MongoDB URI must start with mongodb:// or mongodb+srv://',
      severity: 'error',
    });
  }
}

/**
 * Validate Redis world configuration.
 */
function validateRedisWorld(
  envMap: EnvMap,
  errors: ProjectValidationError[],
  _warnings: ProjectValidationError[]
): void {
  const uri = envMap.WORKFLOW_REDIS_URI;

  if (uri && !uri.startsWith('redis://') && !uri.startsWith('rediss://')) {
    errors.push({
      field: 'WORKFLOW_REDIS_URI',
      message: 'Redis URI must start with redis:// or rediss://',
      severity: 'error',
    });
  }
}

/**
 * Generate a unique ID for a new project.
 */
export function generateProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new Project with default values.
 */
export function createProject(
  worldId: string,
  envMap: EnvMap = {},
  options: { name?: string; projectDir?: string } = {}
): Project {
  const world = getWorldById(worldId);
  const defaultName = world?.name || worldId;

  return {
    id: generateProjectId(),
    name: options.name || `${defaultName} Project`,
    worldId,
    envMap,
    projectDir: options.projectDir,
    createdAt: Date.now(),
  };
}

/**
 * Get a display name for a project.
 * Uses shortName for local world, or other relevant info for other worlds.
 */
export function getProjectDisplayName(project: Project): string {
  if (project.name && project.name !== `${project.worldId} Project`) {
    return project.name;
  }

  // For local world, show the projectDir shortName
  if (project.worldId === 'local' && project.projectDir) {
    return getDirShortName(project.projectDir);
  }

  // For vercel, show project/team info
  if (project.worldId === 'vercel') {
    const projectName = project.envMap.WORKFLOW_VERCEL_PROJECT;
    const team = project.envMap.WORKFLOW_VERCEL_TEAM;
    if (projectName && team) {
      return `${team}/${projectName}`;
    }
    if (projectName) {
      return projectName;
    }
  }

  // For postgres, show a masked connection string
  if (project.worldId === 'postgres') {
    const url = project.envMap.WORKFLOW_POSTGRES_URL;
    if (url) {
      try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.pathname || '/postgres'}`;
      } catch {
        return 'PostgreSQL';
      }
    }
  }

  const world = getWorldById(project.worldId);
  return world?.name || project.worldId;
}

/**
 * Convert a Project to an EnvMap for use with server actions.
 * Ensures WORKFLOW_TARGET_WORLD is set based on the worldId.
 */
export function projectToEnvMap(project: Project): EnvMap {
  const world = getWorldById(project.worldId);
  const envMap = { ...project.envMap };

  // Set target world package
  if (world?.package) {
    envMap.WORKFLOW_TARGET_WORLD = world.package;
  } else if (!envMap.WORKFLOW_TARGET_WORLD) {
    // For unknown worlds, use the worldId as the package name
    envMap.WORKFLOW_TARGET_WORLD = project.worldId;
  }

  return envMap;
}
