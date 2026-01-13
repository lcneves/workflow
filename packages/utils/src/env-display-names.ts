/**
 * Human-readable display names for environment variables.
 *
 * These are used in the web UI to show user-friendly labels
 * for configuration fields.
 */

export interface EnvDisplayInfo {
  /** Human-readable label for the field */
  label: string;
  /** Description/hint for the field */
  description: string;
  /** Whether this is a sensitive field (should be masked) */
  sensitive?: boolean;
  /** Placeholder text for input fields */
  placeholder?: string;
  /** Input type hint */
  type?: 'text' | 'password' | 'url' | 'number' | 'path';
}

/**
 * Display information for known environment variables.
 */
export const ENV_DISPLAY_INFO: Record<string, EnvDisplayInfo> = {
  // Local World
  WORKFLOW_LOCAL_DATA_DIR: {
    label: 'Data Directory',
    description:
      'Path to the workflow data directory. Can be relative or absolute.',
    placeholder: '.workflow-data',
    type: 'path',
  },
  WORKFLOW_MANIFEST_PATH: {
    label: 'Manifest Path',
    description:
      'Path to the workflow manifest file. Used for the Workflows graph view.',
    placeholder: 'app/.well-known/workflow/v1/manifest.json',
    type: 'path',
  },
  PORT: {
    label: 'Port',
    description:
      'Port number for the application server. Used to determine the base URL.',
    placeholder: '3000',
    type: 'number',
  },
  WORKFLOW_LOCAL_BASE_URL: {
    label: 'Base URL',
    description:
      'Override the base URL for the local server. If not set, uses localhost:PORT.',
    placeholder: 'http://localhost:3000',
    type: 'url',
  },
  WORKFLOW_LOCAL_QUEUE_MAX_VISIBILITY: {
    label: 'Queue Max Visibility',
    description: 'Maximum visibility timeout for queue messages in seconds.',
    placeholder: '0',
    type: 'number',
  },
  WORKFLOW_LOCAL_QUEUE_CONCURRENCY: {
    label: 'Queue Concurrency',
    description: 'Maximum number of concurrent queue workers.',
    placeholder: '1',
    type: 'number',
  },

  // Vercel World
  WORKFLOW_VERCEL_AUTH_TOKEN: {
    label: 'Auth Token',
    description:
      'Vercel API authentication token. Can be obtained via `vercel login` or from dashboard.',
    placeholder: 'vercel_token_...',
    sensitive: true,
    type: 'password',
  },
  WORKFLOW_VERCEL_PROJECT: {
    label: 'Project',
    description:
      'Vercel project name or ID. The project must have Workflow enabled.',
    placeholder: 'my-project',
    type: 'text',
  },
  WORKFLOW_VERCEL_TEAM: {
    label: 'Team',
    description: 'Vercel team slug or ID. Required for team projects.',
    placeholder: 'my-team',
    type: 'text',
  },
  WORKFLOW_VERCEL_ENV: {
    label: 'Environment',
    description: 'Vercel deployment environment to connect to.',
    placeholder: 'production',
    type: 'text',
  },
  WORKFLOW_VERCEL_BACKEND_URL: {
    label: 'Backend URL',
    description: 'Override the Vercel Workflow API URL. For internal use only.',
    placeholder: 'https://api.vercel.com/v1/workflow',
    type: 'url',
  },
  WORKFLOW_VERCEL_SKIP_PROXY: {
    label: 'Skip Proxy',
    description: 'Skip the Vercel proxy when making API calls.',
    placeholder: 'false',
    type: 'text',
  },

  // Postgres World
  WORKFLOW_POSTGRES_URL: {
    label: 'PostgreSQL URL',
    description:
      'PostgreSQL connection string. Must start with postgres:// or postgresql://.',
    placeholder: 'postgres://user:password@localhost:5432/database',
    sensitive: true,
    type: 'url',
  },
  DATABASE_URL: {
    label: 'Database URL',
    description:
      'Alternative database connection string (fallback for WORKFLOW_POSTGRES_URL).',
    placeholder: 'postgres://user:password@localhost:5432/database',
    sensitive: true,
    type: 'url',
  },
  WORKFLOW_POSTGRES_JOB_PREFIX: {
    label: 'Job Prefix',
    description: 'Prefix for job names in pg-boss queue.',
    placeholder: 'workflow',
    type: 'text',
  },
  WORKFLOW_POSTGRES_WORKER_CONCURRENCY: {
    label: 'Worker Concurrency',
    description: 'Number of concurrent workers for processing queue jobs.',
    placeholder: '10',
    type: 'number',
  },

  // Turso World
  WORKFLOW_TURSO_DATABASE_URL: {
    label: 'Database URL',
    description: 'Turso/libSQL database URL. Can be a file or remote URL.',
    placeholder: 'file:workflow.db',
    type: 'url',
  },
  WORKFLOW_TURSO_AUTH_TOKEN: {
    label: 'Auth Token',
    description: 'Turso authentication token for remote databases.',
    placeholder: 'turso_token_...',
    sensitive: true,
    type: 'password',
  },

  // MongoDB World
  WORKFLOW_MONGODB_URI: {
    label: 'MongoDB URI',
    description: 'MongoDB connection string.',
    placeholder: 'mongodb://localhost:27017',
    sensitive: true,
    type: 'url',
  },
  WORKFLOW_MONGODB_DATABASE_NAME: {
    label: 'Database Name',
    description: 'Name of the MongoDB database to use.',
    placeholder: 'workflow',
    type: 'text',
  },

  // Redis World
  WORKFLOW_REDIS_URI: {
    label: 'Redis URI',
    description: 'Redis connection string.',
    placeholder: 'redis://localhost:6379',
    sensitive: true,
    type: 'url',
  },

  // Jazz World
  JAZZ_API_KEY: {
    label: 'API Key',
    description: 'Jazz Cloud API key.',
    placeholder: 'jazz_api_...',
    sensitive: true,
    type: 'password',
  },
  JAZZ_WORKER_ACCOUNT: {
    label: 'Worker Account',
    description: 'Jazz Cloud worker account ID.',
    placeholder: 'co_...',
    type: 'text',
  },
  JAZZ_WORKER_SECRET: {
    label: 'Worker Secret',
    description: 'Jazz Cloud worker secret.',
    placeholder: 'secret_...',
    sensitive: true,
    type: 'password',
  },

  // Common
  WORKFLOW_TARGET_WORLD: {
    label: 'Target World',
    description: 'The world package to use. Usually set automatically.',
    placeholder: '@workflow/world-local',
    type: 'text',
  },
};

/**
 * Get display info for an environment variable.
 * Returns a default if not found.
 */
export function getEnvDisplayInfo(envName: string): EnvDisplayInfo {
  return (
    ENV_DISPLAY_INFO[envName] ?? {
      label: formatEnvNameAsLabel(envName),
      description: `Configuration value for ${envName}`,
      type: 'text',
    }
  );
}

/**
 * Convert an environment variable name to a human-readable label.
 * e.g., "WORKFLOW_POSTGRES_URL" -> "Postgres URL"
 */
function formatEnvNameAsLabel(envName: string): string {
  // Remove common prefixes
  let name = envName
    .replace(/^WORKFLOW_/, '')
    .replace(/^JAZZ_/, '')
    .replace(/^DATABASE_/, '');

  // Convert snake_case to Title Case
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if an environment variable should be treated as sensitive.
 */
export function isEnvSensitive(envName: string): boolean {
  const info = ENV_DISPLAY_INFO[envName];
  if (info?.sensitive) return true;

  // Also check common patterns for sensitive vars
  const sensitivePatterns = [
    /token/i,
    /secret/i,
    /password/i,
    /key/i,
    /auth/i,
    /credential/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(envName));
}
