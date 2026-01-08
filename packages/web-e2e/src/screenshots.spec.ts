import { test, expect } from './fixtures/index.js';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Screenshot tests for main views.
 * These tests capture screenshots of the main UI views for visual verification in PR comments.
 */

const SCREENSHOTS_DIR = 'screenshots';

// Ensure screenshots directory exists
function ensureScreenshotsDir() {
  const dir = path.join(process.cwd(), SCREENSHOTS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

test.describe('Screenshots - Main Views', () => {
  test.beforeAll(() => {
    ensureScreenshotsDir();
  });

  test('capture runs list view', async ({ webPage, webServerConfig }) => {
    await webPage.waitForLoadState('networkidle');
    // Wait a bit for any animations to settle
    await webPage.waitForTimeout(1000);

    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      `runs-list-${webServerConfig.backend}.png`
    );
    await webPage.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    // Verify screenshot was created
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('capture hooks tab view', async ({ webPage, webServerConfig }) => {
    // Click on hooks tab
    const hooksTab = webPage.getByRole('tab', { name: 'Hooks' });
    await hooksTab.click();
    await webPage.waitForLoadState('networkidle');
    await webPage.waitForTimeout(1000);

    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      `hooks-tab-${webServerConfig.backend}.png`
    );
    await webPage.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('capture workflows tab view (local only)', async ({
    webPage,
    webServerConfig,
  }) => {
    if (webServerConfig.backend !== 'local') {
      test.skip();
      return;
    }

    const workflowsTab = webPage.getByRole('tab', { name: 'Workflows' });
    await workflowsTab.click();
    await webPage.waitForLoadState('networkidle');
    await webPage.waitForTimeout(1000);

    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      `workflows-tab-${webServerConfig.backend}.png`
    );
    await webPage.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('capture run detail view', async ({
    webPage,
    webServerConfig,
    getAnyRunId,
  }) => {
    const runId = getAnyRunId();
    if (!runId) {
      // If no runId available, take screenshot of empty state
      const screenshotPath = path.join(
        SCREENSHOTS_DIR,
        `run-detail-empty-${webServerConfig.backend}.png`
      );
      await webPage.screenshot({
        path: screenshotPath,
        fullPage: false,
      });
      expect(fs.existsSync(screenshotPath)).toBe(true);
      return;
    }

    // Navigate to run detail page
    const baseUrl = webPage.url().split('?')[0];
    const runDetailUrl = `${baseUrl}run/${runId}`;
    await webPage.goto(runDetailUrl);
    await webPage.waitForLoadState('networkidle');
    await webPage.waitForTimeout(2000); // Extra time for trace viewer to load

    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      `run-detail-${webServerConfig.backend}.png`
    );
    await webPage.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('capture run detail graph tab (local only)', async ({
    webPage,
    webServerConfig,
    getAnyRunId,
  }) => {
    if (webServerConfig.backend !== 'local') {
      test.skip();
      return;
    }

    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    // Navigate to run detail page
    const baseUrl = webPage.url().split('?')[0];
    const runDetailUrl = `${baseUrl}run/${runId}`;
    await webPage.goto(runDetailUrl);
    await webPage.waitForLoadState('networkidle');

    // Click on graph tab
    const graphTab = webPage.getByRole('tab', { name: 'Graph' });
    await graphTab.click();
    await webPage.waitForTimeout(2000); // Extra time for graph to render

    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      `run-detail-graph-${webServerConfig.backend}.png`
    );
    await webPage.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
