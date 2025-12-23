'use server';

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import {
  findWorkflowDataDir,
  type WorkflowDataDirInfo,
} from '@workflow/utils/check-data-dir';
import { KNOWN_WORLDS, type KnownWorld } from './known-worlds';

const require = createRequire(join(process.cwd(), 'index.js'));

export interface WorldConfig {
  backend?: string;
  env?: string;
  authToken?: string;
  project?: string;
  team?: string;
  port?: string;
  dataDir?: string;
  // Path to the workflow manifest file (defaults to app/.well-known/workflow/v1/manifest.json)
  manifestPath?: string;
  // Postgres fields
  postgresUrl?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface WorldAvailability {
  id: string;
  displayName: string;
  packageName: string | null;
  description: string;
  isBuiltIn: boolean;
  isInstalled: boolean;
  installCommand?: string;
}

/**
 * Check which world packages are installed.
 *
 * Built-in worlds (local, vercel) are always available.
 * Third-party worlds are checked by attempting to resolve their package.
 */
export async function checkWorldsAvailability(): Promise<WorldAvailability[]> {
  return KNOWN_WORLDS.map((world: KnownWorld) => {
    const availability: WorldAvailability = {
      id: world.id,
      displayName: world.displayName,
      packageName: world.packageName,
      description: world.description,
      isBuiltIn: world.isBuiltIn,
      isInstalled: world.isBuiltIn, // Built-in worlds are always installed
    };

    // For non-built-in worlds, try to resolve the package
    if (!world.isBuiltIn && world.packageName) {
      try {
        require.resolve(world.packageName);
        availability.isInstalled = true;
      } catch {
        availability.isInstalled = false;
        availability.installCommand = `npm install ${world.packageName}`;
      }
    }

    return availability;
  });
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Resolve a dataDir path to the actual workflow data directory.
 * The path can point to either a project directory or the data directory itself.
 *
 * @returns The resolved workflow data dir info, or null if not found
 */
export async function resolveDataDir(
  dataDir: string
): Promise<WorkflowDataDirInfo | null> {
  if (!dataDir) return null;

  // Server actions cannot reliably resolve relative paths because they
  // execute in the server's working directory, not the user's.
  if (!isAbsolute(dataDir)) {
    return null;
  }

  return findWorkflowDataDir(dataDir);
}

// Validate configuration and return errors
export async function validateWorldConfig(
  config: WorldConfig
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const backend = config.backend || 'local';

  if (backend === 'local') {
    // Check if data directory exists
    if (config.dataDir) {
      // Server actions cannot reliably resolve relative paths because they
      // execute in the server's working directory, not the user's.
      // Require absolute paths or use the CLI which provides absolute paths.
      if (!isAbsolute(config.dataDir)) {
        errors.push({
          field: 'dataDir',
          message:
            'Data directory path must be absolute. Use the CLI to set the data directory, or provide the full path starting with "/"',
        });
      } else {
        // Use findWorkflowDataDir to validate - it handles both project dirs and data dirs
        const result = await findWorkflowDataDir(config.dataDir);
        if (!result) {
          // Check if the path exists at all
          if (!existsSync(config.dataDir)) {
            errors.push({
              field: 'dataDir',
              message: `Data directory does not exist: ${config.dataDir}`,
            });
          } else {
            errors.push({
              field: 'dataDir',
              message: `Directory does not contain workflow data: ${config.dataDir}`,
            });
          }
        }
      }
    }

    // Validate port if provided
    if (config.port) {
      const portNum = Number.parseInt(config.port, 10);
      if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
        errors.push({
          field: 'port',
          message: 'Port must be a number between 1 and 65535',
        });
      }
    }
    // Note: dataDir and manifestPath are optional and don't require validation
    // The server action will try multiple paths and gracefully handle missing files
  }

  if (backend === 'postgres') {
    // Validate postgres connection string
    if (!config.postgresUrl) {
      errors.push({
        field: 'postgresUrl',
        message: 'PostgreSQL connection string is required',
      });
    } else if (
      !config.postgresUrl.startsWith('postgres://') &&
      !config.postgresUrl.startsWith('postgresql://')
    ) {
      errors.push({
        field: 'postgresUrl',
        message:
          'Invalid PostgreSQL connection string format (must start with postgres:// or postgresql://)',
      });
    }
  }

  return errors;
}

export interface ConfigCheckResult {
  /** Whether the config is valid and ready to use */
  valid: boolean;
  /** Reason why config is invalid, if applicable */
  reason?: string;
  /** The backend being checked */
  backend: string;
  /** Resolved workflow data directory info (for local backend) */
  dataDirInfo?: WorkflowDataDirInfo;
}

/**
 * Check if the current config can successfully connect to/access the backend.
 * This is a quick health check used to decide whether to show the setup screen.
 */
export async function checkConfigHealth(
  config: WorldConfig
): Promise<ConfigCheckResult> {
  const backend = config.backend || 'local';

  if (backend === 'local') {
    // For local backend, check if data directory exists and looks valid
    const dataDir = config.dataDir;
    if (!dataDir) {
      return {
        valid: false,
        reason: 'No data directory configured',
        backend,
      };
    }

    // Server actions cannot reliably resolve relative paths because they
    // execute in the server's working directory, not the user's.
    // Only accept absolute paths.
    if (!isAbsolute(dataDir)) {
      return {
        valid: false,
        reason:
          'Data directory path must be absolute. Use the CLI to set the data directory, or provide the full path starting with "/"',
        backend,
      };
    }

    // Use findWorkflowDataDir to validate - it handles both project dirs and data dirs
    const result = await findWorkflowDataDir(dataDir);
    if (!result) {
      if (!existsSync(dataDir)) {
        return {
          valid: false,
          reason: `Data directory does not exist: ${dataDir}`,
          backend,
        };
      }
      return {
        valid: false,
        reason: `Directory does not contain workflow data: ${dataDir}`,
        backend,
      };
    }

    return { valid: true, backend, dataDirInfo: result };
  }

  if (backend === 'postgres') {
    // For postgres, just check if connection URL is provided
    // (actual connection test would be too slow for initial check)
    if (!config.postgresUrl) {
      return {
        valid: false,
        reason: 'No PostgreSQL connection URL configured',
        backend,
      };
    }

    if (
      !config.postgresUrl.startsWith('postgres://') &&
      !config.postgresUrl.startsWith('postgresql://')
    ) {
      return {
        valid: false,
        reason: 'Invalid PostgreSQL connection URL format',
        backend,
      };
    }

    return { valid: true, backend };
  }

  if (backend === 'vercel') {
    // For vercel, check required fields
    if (!config.authToken) {
      return {
        valid: false,
        reason: 'No Vercel auth token configured',
        backend,
      };
    }

    if (!config.project) {
      return {
        valid: false,
        reason: 'No Vercel project configured',
        backend,
      };
    }

    return { valid: true, backend };
  }

  // Unknown backend - assume valid for now
  return { valid: true, backend };
}
