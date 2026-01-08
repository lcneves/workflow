import { expect, test } from './fixtures/index.js';

test.describe('Web UI - Runs List', () => {
  test('should display the runs tab by default', async ({ webPage }) => {
    // The runs tab should be active by default
    const runsTab = webPage.getByRole('tab', { name: 'Runs' });
    await expect(runsTab).toBeVisible();
    await expect(runsTab).toHaveAttribute('data-state', 'active');
  });

  test('should show the runs table or empty state', async ({ webPage }) => {
    // Wait for the page to load
    await webPage.waitForLoadState('networkidle');

    // Should show either the runs table or an empty state
    const table = webPage.getByRole('table');
    const emptyState = webPage.getByText('No workflow runs found');

    // One of these should be visible
    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(tableVisible || emptyVisible).toBe(true);
  });

  test('should display table headers when runs exist', async ({
    webPage,
    e2eMetadata,
  }) => {
    // Skip if no runs from e2e tests
    if (!e2eMetadata?.runIds?.length) {
      test.skip();
      return;
    }

    await webPage.waitForLoadState('networkidle');

    // Wait a bit for data to load
    await webPage.waitForTimeout(2000);

    // Check for table headers
    const workflowHeader = webPage.getByRole('columnheader', {
      name: 'Workflow',
    });
    const runIdHeader = webPage.getByRole('columnheader', { name: 'Run ID' });
    const statusHeader = webPage.getByRole('columnheader', { name: 'Status' });

    await expect(workflowHeader).toBeVisible();
    await expect(runIdHeader).toBeVisible();
    await expect(statusHeader).toBeVisible();
  });

  test('should have filter controls', async ({ webPage }) => {
    await webPage.waitForLoadState('networkidle');

    // Should have workflow filter dropdown
    const workflowFilter = webPage.getByRole('combobox').first();
    await expect(workflowFilter).toBeVisible();

    // Should have refresh button
    const refreshButton = webPage.getByRole('button', { name: /Refresh/i });
    await expect(refreshButton).toBeVisible();
  });
});

test.describe('Web UI - Hooks Tab', () => {
  test('should switch to hooks tab', async ({ webPage }) => {
    const hooksTab = webPage.getByRole('tab', { name: 'Hooks' });
    await expect(hooksTab).toBeVisible();

    await hooksTab.click();
    await expect(hooksTab).toHaveAttribute('data-state', 'active');
  });

  test('should show hooks table or empty state', async ({ webPage }) => {
    // Click on hooks tab
    const hooksTab = webPage.getByRole('tab', { name: 'Hooks' });
    await hooksTab.click();

    await webPage.waitForLoadState('networkidle');

    // Should show either hooks table or empty state
    const table = webPage.getByRole('table');
    const emptyState = webPage.getByText(/no.*hooks/i);

    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(tableVisible || emptyVisible).toBe(true);
  });
});

test.describe('Web UI - Workflows Tab (Local Only)', () => {
  test('should show workflows tab for local backend', async ({
    webPage,
    webServerConfig,
  }) => {
    // Skip if not local backend
    if (webServerConfig.backend !== 'local') {
      test.skip();
      return;
    }

    const workflowsTab = webPage.getByRole('tab', { name: 'Workflows' });
    await expect(workflowsTab).toBeVisible();
  });

  test('should switch to workflows tab and show content', async ({
    webPage,
    webServerConfig,
  }) => {
    // Skip if not local backend
    if (webServerConfig.backend !== 'local') {
      test.skip();
      return;
    }

    const workflowsTab = webPage.getByRole('tab', { name: 'Workflows' });
    await workflowsTab.click();
    await expect(workflowsTab).toHaveAttribute('data-state', 'active');

    await webPage.waitForLoadState('networkidle');
  });
});

test.describe('Web UI - Run Detail View', () => {
  test('should navigate to run detail page', async ({
    webPage,
    getAnyRunId,
  }) => {
    // Skip if no run IDs available
    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    // Navigate to run detail page
    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = `/run/${runId}`;
    pageUrl.search = '';
    const runDetailUrl = pageUrl.toString();
    await webPage.goto(runDetailUrl);

    await webPage.waitForLoadState('networkidle');

    // Should show breadcrumb back to runs
    const breadcrumb = webPage.getByRole('link', { name: 'Runs' });
    await expect(breadcrumb).toBeVisible();
  });

  test('should display run overview information', async ({
    webPage,
    getAnyRunId,
  }) => {
    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    // Navigate to run detail page
    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = `/run/${runId}`;
    pageUrl.search = '';
    const runDetailUrl = pageUrl.toString();
    await webPage.goto(runDetailUrl);

    await webPage.waitForLoadState('networkidle');

    // Wait for content to load
    await webPage.waitForTimeout(2000);

    // Should show status section
    const statusLabel = webPage.getByText('Status');
    await expect(statusLabel.first()).toBeVisible();

    // Should show Run ID section
    const runIdLabel = webPage.getByText('Run ID');
    await expect(runIdLabel.first()).toBeVisible();
  });

  test('should display trace tab by default', async ({
    webPage,
    getAnyRunId,
  }) => {
    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = `/run/${runId}`;
    pageUrl.search = '';
    const runDetailUrl = pageUrl.toString();
    await webPage.goto(runDetailUrl);

    await webPage.waitForLoadState('networkidle');

    // Trace tab should be active by default
    const traceTab = webPage.getByRole('tab', { name: 'Trace' });
    await expect(traceTab).toBeVisible();
    await expect(traceTab).toHaveAttribute('data-state', 'active');
  });

  test('should have streams tab', async ({ webPage, getAnyRunId }) => {
    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = `/run/${runId}`;
    pageUrl.search = '';
    const runDetailUrl = pageUrl.toString();
    await webPage.goto(runDetailUrl);

    await webPage.waitForLoadState('networkidle');

    // Should have streams tab
    const streamsTab = webPage.getByRole('tab', { name: 'Streams' });
    await expect(streamsTab).toBeVisible();
  });

  test('should have graph tab for local backend', async ({
    webPage,
    getAnyRunId,
    webServerConfig,
  }) => {
    // Skip if not local backend
    if (webServerConfig.backend !== 'local') {
      test.skip();
      return;
    }

    const runId = getAnyRunId();
    if (!runId) {
      test.skip();
      return;
    }

    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = `/run/${runId}`;
    pageUrl.search = '';
    const runDetailUrl = pageUrl.toString();
    await webPage.goto(runDetailUrl);

    await webPage.waitForLoadState('networkidle');

    // Should have graph tab for local backend
    const graphTab = webPage.getByRole('tab', { name: 'Graph' });
    await expect(graphTab).toBeVisible();
  });
});

test.describe('Web UI - Navigation', () => {
  test('should navigate from run list to run detail and back', async ({
    webPage,
    e2eMetadata,
  }) => {
    // Skip if no runs from e2e tests
    if (!e2eMetadata?.runIds?.length) {
      test.skip();
      return;
    }

    await webPage.waitForLoadState('networkidle');
    await webPage.waitForTimeout(2000);

    // Find and click on a run row (if table is visible)
    const table = webPage.getByRole('table');
    const tableVisible = await table.isVisible().catch(() => false);

    if (!tableVisible) {
      test.skip();
      return;
    }

    // Click on first data row
    const firstRow = webPage.getByRole('row').nth(1);
    await firstRow.click();

    // Should navigate to run detail page
    await webPage.waitForLoadState('networkidle');
    await expect(webPage).toHaveURL(/\/run\//);

    // Click breadcrumb to go back
    const breadcrumb = webPage.getByRole('link', { name: 'Runs' });
    await breadcrumb.click();

    // Should be back on main page
    await webPage.waitForLoadState('networkidle');
    await expect(webPage).not.toHaveURL(/\/run\//);
  });
});

test.describe('Web UI - Error Handling', () => {
  test('should handle invalid run ID gracefully', async ({ webPage }) => {
    // Navigate to a non-existent run
    const pageUrl = new URL(webPage.url());
    pageUrl.pathname = '/run/invalid_run_id_12345';
    pageUrl.search = '';
    const invalidRunUrl = pageUrl.toString();
    await webPage.goto(invalidRunUrl);

    await webPage.waitForLoadState('networkidle');

    // Should show some error state (alert or error message)
    // The exact message may vary, but it shouldn't crash
    const page = webPage;

    // Give it time to potentially load/fail
    await page.waitForTimeout(3000);

    // Page should still be responsive
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
