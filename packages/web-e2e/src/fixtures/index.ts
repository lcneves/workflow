import { test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  WebUrlBuilder,
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
   * Configuration for the web server
   */
  webServerConfig: WebServerConfig;

  /**
   * URL builder for creating URLs with correct query params
   */
  urlBuilder: WebUrlBuilder;

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
export const test = base.extend<WebE2EFixtures>({
  // Configuration (test-scoped but constant)
  webServerConfig: async ({}, use) => {
    const config = getDefaultConfig();
    await use(config);
  },

  // URL builder
  urlBuilder: async ({ webServerConfig }, use) => {
    const builder = new WebUrlBuilder(webServerConfig);
    await use(builder);
  },

  // Page pre-navigated to the web UI
  webPage: async ({ page, urlBuilder }, use) => {
    const url = urlBuilder.getUrl('/');
    await page.goto(url);
    await use(page);
  },

  // E2E metadata from previous tests
  e2eMetadata: async ({ webServerConfig }, use) => {
    const appName = process.env.APP_NAME || 'nextjs-turbopack';
    const metadata = findE2EMetadata(appName, webServerConfig.backend);
    await use(metadata);
  },

  // Helper to get runId by test name
  getRunId: async ({ e2eMetadata }, use) => {
    const fn = (testName: string): string | null => {
      if (!e2eMetadata?.runIds) return null;
      const entry = e2eMetadata.runIds.find((r) => r.testName === testName);
      return entry?.runId || null;
    };
    await use(fn);
  },

  // Helper to get any available runId
  getAnyRunId: async ({ e2eMetadata }, use) => {
    const fn = (): string | null => {
      if (!e2eMetadata?.runIds || e2eMetadata.runIds.length === 0) return null;
      return e2eMetadata.runIds[0].runId;
    };
    await use(fn);
  },
});

export { expect } from '@playwright/test';
export type { WebUrlBuilder, WebServerConfig };
