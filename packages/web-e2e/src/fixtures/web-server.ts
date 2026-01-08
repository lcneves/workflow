import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
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
   * Port to run the web server on
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
 * Web server manager for Playwright tests.
 * Spawns the @workflow/web Next.js server and manages its lifecycle.
 */
export class WebServer {
  private process: ChildProcess | null = null;
  private config: WebServerConfig;
  private started = false;

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

  /**
   * Start the web server
   */
  async start(): Promise<void> {
    if (this.started) {
      console.log('[WebServer] Already started');
      return;
    }

    // Check if server is already running on the port
    if (await this.isRunning()) {
      console.log(
        `[WebServer] Server already running on port ${this.config.port}`
      );
      this.started = true;
      return;
    }

    // Find the @workflow/web package
    const webPackagePath = this.findWebPackagePath();
    console.log(`[WebServer] Using web package at: ${webPackagePath}`);

    // Start the Next.js server
    const shellCommand = `npx next start -p ${this.config.port}`;
    console.log(`[WebServer] Starting: ${shellCommand}`);

    this.process = spawn(shellCommand, {
      shell: true,
      cwd: webPackagePath,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Don't pass workflow-specific env vars to the server
        // They will be passed via query params
        WORKFLOW_TARGET_WORLD: undefined,
        WORKFLOW_VERCEL_ENV: undefined,
        WORKFLOW_VERCEL_AUTH_TOKEN: undefined,
        WORKFLOW_VERCEL_PROJECT: undefined,
        WORKFLOW_VERCEL_TEAM: undefined,
        WORKFLOW_LOCAL_DATA_DIR: undefined,
      },
    });

    // Log server output
    this.process.stdout?.on('data', (data) => {
      console.log(`[WebServer] ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[WebServer] ${data.toString().trim()}`);
    });

    this.process.on('error', (error) => {
      console.error(`[WebServer] Process error: ${error}`);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.log(`[WebServer] Exited with code ${code}`);
      }
      this.process = null;
    });

    // Wait for server to be ready
    const maxRetries = 60;
    const retryInterval = 1000;

    for (let i = 0; i < maxRetries; i++) {
      await this.sleep(retryInterval);
      if (await this.isRunning()) {
        console.log(`[WebServer] Server ready on port ${this.config.port}`);
        this.started = true;
        return;
      }
    }

    throw new Error(
      `[WebServer] Failed to start within ${maxRetries * retryInterval}ms`
    );
  }

  /**
   * Stop the web server
   */
  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      console.log('[WebServer] Stopping server...');
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.started = false;
  }

  /**
   * Check if the server is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(this.baseUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }

  /**
   * Find the @workflow/web package path
   */
  private findWebPackagePath(): string {
    try {
      // Try to resolve from the workspace root
      const requireFromHere = createRequire(import.meta.url);
      const packageJsonPath = requireFromHere.resolve(
        '@workflow/web/package.json'
      );
      return path.dirname(packageJsonPath);
    } catch {
      // Fallback to relative path from this package
      return path.resolve(import.meta.dirname, '../../../web');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
