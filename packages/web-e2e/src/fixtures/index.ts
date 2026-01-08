import { test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  WebServer,
  getDefaultConfig,
  type WebServerConfig,
} from './web-server.js';

/**
 * E2E metadata from the main e2e tests
 */
export interface E2EMetadata {
  runIds: Array<{
    testName: string;
    runId: string;
    timestamp: string;
  }>;
  vercel?: {
    projectSlug: string;
    environment: string;
    teamSlug: string;
  };
}

/**
 * Extended test fixtures for web e2e tests
 */
export interface WebE2EFixtures {
  /**
   * The web server instance
   */
  webServer: WebServer;

  /**
   * A page that's already navigated to the web UI with correct config params
   */
  webPage: Page;

  /**
   * E2E metadata with runIds from previous e2e tests (if available)
   */
  e2eMetadata: E2EMetadata | null;

  /**
   * Get a specific runId from the e2e metadata by test name
   */
  getRunId: (testName: string) => string | null;

  /**
   * Get the first available runId from the e2e metadata
   */
  getAnyRunId: () => string | null;
}

/**
 * Worker-scoped fixtures (shared across all tests in a worker)
 */
export interface WebE2EWorkerFixtures {
  /**
   * Web server configuration
   */
  webServerConfig: WebServerConfig;

  /**
   * The shared web server instance (per worker)
   */
  sharedWebServer: WebServer;
}

/**
 * Find e2e metadata files in the results directory
 */
function findE2EMetadata(
  appName: string,
  backend: 'local' | 'vercel'
): E2EMetadata | null {
  const workspaceRoot = path.resolve(import.meta.dirname, '../../../../');

  // Look for metadata files in various locations
  const possiblePaths = [
    // CI artifacts location
    path.join(
      workspaceRoot,
      'e2e-results',
      `e2e-metadata-${appName}-${backend}.json`
    ),
    // Root location (from test:e2e runs)
    path.join(workspaceRoot, `e2e-metadata-${appName}-${backend}.json`),
    // Local location for testing
    path.join(
      workspaceRoot,
      'packages',
      'web-e2e',
      `e2e-metadata-${appName}-${backend}.json`
    ),
  ];

  for (const metadataPath of possiblePaths) {
    try {
      if (fs.existsSync(metadataPath)) {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        return JSON.parse(content) as E2EMetadata;
      }
    } catch (error) {
      console.warn(
        `[WebE2E] Failed to read metadata from ${metadataPath}:`,
        error
      );
    }
  }

  return null;
}

/**
 * Extended Playwright test with web e2e fixtures
 */
export const test = base.extend<WebE2EFixtures, WebE2EWorkerFixtures>({
  // Worker-scoped: shared across all tests in a worker
  webServerConfig: [
    async ({}, use) => {
      const config = getDefaultConfig();
      await use(config);
    },
    { scope: 'worker' },
  ],

  sharedWebServer: [
    async ({ webServerConfig }, use) => {
      const server = new WebServer(webServerConfig);
      await server.start();
      await use(server);
      await server.stop();
    },
    { scope: 'worker' },
  ],

  // Test-scoped fixtures
  webServer: async ({ sharedWebServer }, use) => {
    await use(sharedWebServer);
  },

  webPage: async ({ page, webServer }, use) => {
    // Navigate to the web UI with configuration params
    const url = webServer.getUrl('/');
    
    // Try to navigate to the server with retry logic and better error handling
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await use(page);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if server is still running
        const serverRunning = await webServer.isRunning();
        
        if (attempt < maxRetries && serverRunning) {
          // Server is running but navigation failed, try again
          console.warn(
            `[webPage] Navigation attempt ${attempt} failed: ${lastError.message}. ` +
            `Retrying (${attempt}/${maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Last attempt or server is down
          if (!serverRunning) {
            throw new Error(
              `[webPage] Failed to navigate to ${url}: Server is not responding. ` +
              `Original error: ${lastError.message}`
            );
          } else {
            throw new Error(
              `[webPage] Failed to navigate to ${url} after ${maxRetries} attempts. ` +
              `Last error: ${lastError.message}`
            );
          }
        }
      }
    }
    
    // Fallback (should not reach here, but for safety)
    throw lastError || new Error('Failed to navigate to webPage');
  },

  e2eMetadata: async ({ webServerConfig }, use) => {
    const appName = process.env.APP_NAME || 'nextjs-turbopack';
    const metadata = findE2EMetadata(appName, webServerConfig.backend);
    await use(metadata);
  },

  getRunId: async ({ e2eMetadata }, use) => {
    const fn = (testName: string): string | null => {
      if (!e2eMetadata?.runIds) return null;
      const entry = e2eMetadata.runIds.find((r) => r.testName === testName);
      return entry?.runId || null;
    };
    await use(fn);
  },

  getAnyRunId: async ({ e2eMetadata }, use) => {
    const fn = (): string | null => {
      if (!e2eMetadata?.runIds || e2eMetadata.runIds.length === 0) return null;
      return e2eMetadata.runIds[0].runId;
    };
    await use(fn);
  },
});

export { expect } from '@playwright/test';
export type { WebServer, WebServerConfig };
