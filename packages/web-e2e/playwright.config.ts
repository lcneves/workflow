import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { createRequire } from 'node:module';

const WEB_PORT = parseInt(process.env.WORKFLOW_WEB_PORT || '3456', 10);

/**
 * Find the @workflow/web package path
 */
function findWebPackagePath(): string {
  try {
    const requireFromHere = createRequire(import.meta.url);
    const packageJsonPath = requireFromHere.resolve(
      '@workflow/web/package.json'
    );
    return path.dirname(packageJsonPath);
  } catch {
    return path.resolve(import.meta.dirname, '../web');
  }
}

/**
 * Playwright configuration for Workflow Web UI e2e tests.
 *
 * These tests run after the main e2e tests and verify that the web UI
 * correctly displays workflow runs, steps, hooks, and other data.
 */
export default defineConfig({
  testDir: './src',
  // Run tests in parallel when possible
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Opt out of parallel tests on CI since we're spawning servers
  workers: 1,
  // Reporter to use
  reporter: process.env.CI
    ? [
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results.json' }],
        ['list'],
      ]
    : [['html', { open: 'on-failure' }], ['list']],
  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: `http://localhost:${WEB_PORT}`,
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    // Take screenshot on failure
    screenshot: 'only-on-failure',
  },
  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Timeout for each test
  timeout: 60_000,
  // Timeout for expect assertions
  expect: {
    timeout: 10_000,
  },
  // Output folder for test artifacts
  outputDir: './test-results',

  // Use Playwright's built-in webServer config to manage the server lifecycle.
  // This ensures proper startup/shutdown and handles port conflicts gracefully.
  webServer: {
    command: `npx next start -p ${WEB_PORT}`,
    cwd: findWebPackagePath(),
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Don't pass workflow-specific env vars to the server
    // They will be passed via query params in tests
    env: {
      ...process.env,
      WORKFLOW_TARGET_WORLD: '',
      WORKFLOW_VERCEL_ENV: '',
      WORKFLOW_VERCEL_AUTH_TOKEN: '',
      WORKFLOW_VERCEL_PROJECT: '',
      WORKFLOW_VERCEL_TEAM: '',
      WORKFLOW_LOCAL_DATA_DIR: '',
    },
  },
});
