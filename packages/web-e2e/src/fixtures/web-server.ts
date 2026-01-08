import path from 'node:path';

/**
 * Configuration for the web server
 */
export interface WebServerConfig {
  /**
   * Backend type: 'local' or 'vercel'
   */
  backend: 'local' | 'vercel';

  /**
   * Port the web server runs on
   */
  port: number;

  /**
   * Vercel-specific configuration (required when backend is 'vercel')
   */
  vercel?: {
    authToken: string;
    project: string;
    team: string;
    env?: 'production' | 'preview';
  };

  /**
   * Path to the workbench app directory (for local backend)
   */
  appDir?: string;
}

/**
 * URL builder for the web UI.
 * The actual server lifecycle is managed by Playwright's webServer config.
 */
export class WebUrlBuilder {
  private config: WebServerConfig;

  constructor(config: WebServerConfig) {
    this.config = config;
  }

  /**
   * Get the base URL for the web server
   */
  get baseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  /**
   * Get the backend type
   */
  get backend(): 'local' | 'vercel' {
    return this.config.backend;
  }

  /**
   * Get query parameters for the web server based on configuration
   */
  getQueryParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set('resource', 'run');

    if (this.config.backend === 'local') {
      params.set('backend', 'local');
      if (this.config.appDir) {
        // For local backend, set the data directory to the workbench app's .workflow folder
        const dataDir = path.join(this.config.appDir, '.workflow');
        params.set('dataDir', dataDir);
      }
    } else if (this.config.backend === 'vercel' && this.config.vercel) {
      params.set('backend', 'vercel');
      params.set('authToken', this.config.vercel.authToken);
      params.set('project', this.config.vercel.project);
      params.set('team', this.config.vercel.team);
      if (this.config.vercel.env) {
        params.set('env', this.config.vercel.env);
      }
    }

    return params;
  }

  /**
   * Get the full URL including query parameters
   */
  getUrl(pathname = '/'): string {
    const params = this.getQueryParams();
    const url = new URL(pathname, this.baseUrl);
    // Merge query params
    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

/**
 * Get default web server configuration from environment variables
 */
export function getDefaultConfig(): WebServerConfig {
  const backend =
    (process.env.WORKFLOW_WEB_E2E_BACKEND as 'local' | 'vercel') || 'local';
  const port = parseInt(process.env.WORKFLOW_WEB_PORT || '3456', 10);

  const config: WebServerConfig = {
    backend,
    port,
  };

  if (backend === 'local') {
    // Get the app directory from APP_NAME
    const appName = process.env.APP_NAME || 'nextjs-turbopack';
    const workspaceRoot = path.resolve(import.meta.dirname, '../../../../');
    config.appDir = path.join(workspaceRoot, 'workbench', appName);
  } else if (backend === 'vercel') {
    config.vercel = {
      authToken: process.env.WORKFLOW_VERCEL_AUTH_TOKEN || '',
      project: process.env.WORKFLOW_VERCEL_PROJECT || '',
      team: process.env.WORKFLOW_VERCEL_TEAM || '',
      env:
        (process.env.WORKFLOW_VERCEL_ENV as 'production' | 'preview') ||
        'preview',
    };
  }

  return config;
}
