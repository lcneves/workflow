'use server';

/**
 * Server-side configuration API
 *
 * This module exposes the server-side environment configuration to the client.
 * When environment variables are set on the server (e.g., by the CLI or self-hosted deployment),
 * those values take precedence over any client-side configuration.
 *
 * Security: This module only exposes specific, allowed environment variables.
 * It does not allow clients to set arbitrary env vars on the server.
 *
 * IMPORTANT: We capture a snapshot of the environment at module load time.
 * This is necessary because getWorldFromEnv() in workflow-server-actions.ts
 * writes to process.env when initializing a world. We need to distinguish
 * between env vars that were set at startup (locked) vs. those written later
 * by the application.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findWorkflowDataDir,
  type WorkflowDataDirInfo,
} from '@workflow/utils/check-data-dir';

/**
 * Environment variable names we care about for configuration.
 * Captured at module load time to detect pre-set values.
 */
const CONFIG_ENV_VARS = [
  'WORKFLOW_TARGET_WORLD',
  'WORKFLOW_VERCEL_ENV',
  'WORKFLOW_VERCEL_AUTH_TOKEN',
  'WORKFLOW_VERCEL_PROJECT',
  'WORKFLOW_VERCEL_TEAM',
  'PORT',
  'WORKFLOW_LOCAL_DATA_DIR',
  'WORKFLOW_MANIFEST_PATH',
  'WORKFLOW_POSTGRES_URL',
] as const;

/**
 * Snapshot of configuration-relevant environment variables captured at module load time.
 * This allows us to distinguish between:
 * - Env vars set before the app started (from deployment, CLI args, etc.) - LOCKED
 * - Env vars written later by getWorldFromEnv() - NOT locked, can be overridden by user
 */
const INITIAL_ENV_SNAPSHOT: Record<string, string | undefined> = {};

// Capture initial environment state immediately at module load
for (const key of CONFIG_ENV_VARS) {
  INITIAL_ENV_SNAPSHOT[key] = process.env[key];
}

// Debug: Log captured env snapshot at module load
console.log('[server-config] Module loaded. INITIAL_ENV_SNAPSHOT:', {
  cwd: process.cwd(),
  WORKFLOW_LOCAL_DATA_DIR: INITIAL_ENV_SNAPSHOT.WORKFLOW_LOCAL_DATA_DIR,
  WORKFLOW_TARGET_WORLD: INITIAL_ENV_SNAPSHOT.WORKFLOW_TARGET_WORLD,
});

/**
 * Configuration field with its value and source
 */
export interface ConfigField {
  /** The current value */
  value: string | undefined;
  /** Whether this value came from server environment (read-only) */
  isFromEnv: boolean;
  /** Human-readable label for this field */
  label: string;
  /** The environment variable name */
  envVarName: string;
}

/**
 * Complete server configuration with all fields
 */
export interface ServerWorldConfig {
  /** The world/backend type (local, vercel, postgres, etc.) */
  backend: ConfigField;
  /** Vercel environment (production/preview) */
  vercelEnv: ConfigField;
  /** Vercel auth token */
  vercelAuthToken: ConfigField;
  /** Vercel project ID/name */
  vercelProject: ConfigField;
  /** Vercel team ID/slug */
  vercelTeam: ConfigField;
  /** Local world port */
  port: ConfigField;
  /** Local world data directory */
  dataDir: ConfigField;
  /** Path to workflow manifest file */
  manifestPath: ConfigField;
  /** PostgreSQL connection URL */
  postgresUrl: ConfigField;
}

/**
 * Detected operating mode of the web UI
 */
export type ConfigMode =
  | 'self-hosted' // Server has env vars set, configuration is locked
  | 'cli' // Launched via CLI with query params
  | 'standalone'; // No config provided, user must configure

/**
 * Result from getServerConfig
 */
export interface ServerConfigResult {
  /** The detected configuration mode */
  mode: ConfigMode;
  /** All configuration fields with their sources */
  config: ServerWorldConfig;
  /** The server's current working directory (for debugging) */
  cwd: string;
  /** Whether any server-side env vars are configured */
  hasServerConfig: boolean;
  /** Data directory info if available */
  dataDirInfo: WorkflowDataDirInfo | null;
}

/**
 * Mapping of config keys to environment variable names and labels
 */
const CONFIG_FIELD_METADATA: Record<
  keyof ServerWorldConfig,
  { envVarName: string; label: string }
> = {
  backend: {
    envVarName: 'WORKFLOW_TARGET_WORLD',
    label: 'World Backend',
  },
  vercelEnv: {
    envVarName: 'WORKFLOW_VERCEL_ENV',
    label: 'Vercel Environment',
  },
  vercelAuthToken: {
    envVarName: 'WORKFLOW_VERCEL_AUTH_TOKEN',
    label: 'Vercel Auth Token',
  },
  vercelProject: {
    envVarName: 'WORKFLOW_VERCEL_PROJECT',
    label: 'Vercel Project',
  },
  vercelTeam: {
    envVarName: 'WORKFLOW_VERCEL_TEAM',
    label: 'Vercel Team',
  },
  port: {
    envVarName: 'PORT',
    label: 'Port',
  },
  dataDir: {
    envVarName: 'WORKFLOW_LOCAL_DATA_DIR',
    label: 'Data Directory',
  },
  manifestPath: {
    envVarName: 'WORKFLOW_MANIFEST_PATH',
    label: 'Manifest Path',
  },
  postgresUrl: {
    envVarName: 'WORKFLOW_POSTGRES_URL',
    label: 'PostgreSQL URL',
  },
};

/**
 * Normalizes backend value to standard form
 */
function normalizeBackend(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Map full package names to short IDs
  const mapping: Record<string, string> = {
    '@workflow/world-local': 'local',
    '@workflow/world-vercel': 'vercel',
    '@workflow/world-postgres': 'postgres',
  };
  return mapping[value] || value;
}

/**
 * Fetches the server-side configuration.
 *
 * This compares the INITIAL_ENV_SNAPSHOT (captured at module load time) with the
 * current process.env to determine which values were pre-set at startup (locked)
 * vs. which were written later by the application (editable).
 */
export async function getServerConfig(): Promise<ServerConfigResult> {
  const cwd = process.cwd();

  // Build config fields from environment
  const config: ServerWorldConfig = {} as ServerWorldConfig;
  let hasServerConfig = false;

  for (const [key, metadata] of Object.entries(CONFIG_FIELD_METADATA)) {
    // Check the INITIAL snapshot, not current process.env
    // This ensures we only mark values as "from env" if they were set BEFORE
    // the app started (not written later by getWorldFromEnv)
    const initialValue = INITIAL_ENV_SNAPSHOT[metadata.envVarName];
    const wasSetAtStartup = initialValue !== undefined && initialValue !== '';

    if (wasSetAtStartup) {
      hasServerConfig = true;
    }

    // Special handling for backend to normalize package names
    const value =
      key === 'backend'
        ? normalizeBackend(initialValue)
        : initialValue || undefined;

    config[key as keyof ServerWorldConfig] = {
      value,
      isFromEnv: wasSetAtStartup,
      label: metadata.label,
      envVarName: metadata.envVarName,
    };
  }

  // Determine operating mode
  let mode: ConfigMode;
  if (hasServerConfig) {
    // If any server-side config was present at startup, we're in self-hosted mode
    mode = 'self-hosted';
  } else {
    mode = 'standalone';
  }

  // Try to resolve data directory info
  let dataDirInfo: WorkflowDataDirInfo | null = null;
  const dataDir = config.dataDir.value;
  if (dataDir) {
    try {
      dataDirInfo = await findWorkflowDataDir(dataDir);
    } catch {
      // Data dir info is optional
    }
  } else {
    // Try to find from cwd
    try {
      dataDirInfo = await findWorkflowDataDir(cwd);
    } catch {
      // Data dir info is optional
    }
  }

  return {
    mode,
    config,
    cwd,
    hasServerConfig,
    dataDirInfo,
  };
}

/**
 * Validates that a data directory exists and contains workflow data.
 * Used by the settings panel to validate user-provided paths.
 */
export async function validateDataDir(
  dataDir: string
): Promise<{ valid: boolean; info?: WorkflowDataDirInfo; error?: string }> {
  try {
    const info = await findWorkflowDataDir(dataDir);
    if (info.dataDir) {
      return { valid: true, info };
    }
    return {
      valid: false,
      error: `No workflow data found at "${dataDir}". Have you run any workflows in this project?`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the bundled worlds manifest data.
 * This reads from a file bundled at build time.
 */
export async function getWorldsManifest(): Promise<{
  worlds: Array<{
    id: string;
    type: 'official' | 'community';
    package: string;
    name: string;
    description: string;
    docs: string;
    env: Record<string, string>;
  }>;
}> {
  // First try to read from bundled location (at build time, we copy this)
  const possiblePaths = [
    // In the web package's public folder
    path.join(process.cwd(), 'public', 'worlds-manifest.json'),
    // In the root of the monorepo (development)
    path.join(process.cwd(), '..', '..', 'worlds-manifest.json'),
    // Three levels up (when installed as dependency)
    path.join(process.cwd(), '..', '..', '..', 'worlds-manifest.json'),
  ];

  for (const manifestPath of possiblePaths) {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Try next path
    }
  }

  // Fallback to inline minimal manifest
  return {
    worlds: [
      {
        id: 'local',
        type: 'official',
        package: '@workflow/world-local',
        name: 'Local',
        description: 'Filesystem-based world for local development',
        docs: '/docs/deploying/world/local-world',
        env: {},
      },
      {
        id: 'vercel',
        type: 'official',
        package: '@workflow/world-vercel',
        name: 'Vercel',
        description: 'Production-ready world for Vercel deployments',
        docs: '/docs/deploying/world/vercel-world',
        env: {},
      },
      {
        id: 'postgres',
        type: 'official',
        package: '@workflow/world-postgres',
        name: 'PostgreSQL',
        description: 'PostgreSQL-based world for multi-host deployments',
        docs: '/docs/deploying/world/postgres-world',
        env: {},
      },
    ],
  };
}
