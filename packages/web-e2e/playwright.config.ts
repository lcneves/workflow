import { defineConfig, devices } from '@playwright/test';

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
    baseURL: process.env.WORKFLOW_WEB_URL || 'http://localhost:3456',
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
});
