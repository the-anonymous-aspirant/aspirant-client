import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installBrowserFlowsMocks,
  seedBrowserFlows,
  seedBrowserFlowRuns,
  browserFlowsSeed,
} from './helpers/mockBackend';

/** Covers #1445-A1: the /admin/browser-flows Vue matrix rendered natively over
 *  the /api/browser-flows* JSON API. The API is mocked in-process via
 *  page.route() — no aspirant-server or aspirant-browser is required. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const FLOWS = [
  {
    id: 'flow-a',
    name: 'berlinstartupjobs.com',
    enabled: true,
    created_at: '2026-07-01T09:00:00Z',
  },
  {
    id: 'flow-b',
    name: 'jobs.smashing.de',
    enabled: true,
    created_at: '2026-07-02T09:00:00Z',
  },
  {
    id: 'flow-c',
    name: 'legacy-scraper',
    enabled: false,
    created_at: '2026-07-03T09:00:00Z',
  },
];

const RUNS = [
  { id: 'run-a1', flow_id: 'flow-a', started_at: '2026-07-02T12:00:00Z', completed_at: '2026-07-02T12:05:00Z', status: 'success', output_rows_count: 42 },
  { id: 'run-a2', flow_id: 'flow-a', started_at: '2026-07-02T18:00:00Z', completed_at: '2026-07-02T18:04:00Z', status: 'failed', output_rows_count: 0 },
  { id: 'run-a3', flow_id: 'flow-a', started_at: '2026-07-03T09:00:00Z', completed_at: null, status: 'running', output_rows_count: 0 },
  { id: 'run-b1', flow_id: 'flow-b', started_at: '2026-07-02T14:00:00Z', completed_at: '2026-07-02T14:03:00Z', status: 'blocked', output_rows_count: 0 },
];

test.describe('/admin/browser-flows — native matrix', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await installBrowserFlowsMocks(page);
  });

  test('renders one row per flow with the correct number of empty + status cells', async ({ page }) => {
    seedBrowserFlows(FLOWS);
    seedBrowserFlowRuns(RUNS);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('browser-flows-view')).toBeVisible();
    await expect(page.getByTestId('browser-flows-matrix')).toBeVisible();

    await expect(page.getByTestId('flow-row-flow-a')).toBeVisible();
    await expect(page.getByTestId('flow-row-flow-b')).toBeVisible();
    await expect(page.getByTestId('flow-row-flow-c')).toBeVisible();

    // Flow A has 3 runs → 17 empty cells + 3 status cells = 20 cells.
    const rowA = page.getByTestId('flow-row-flow-a');
    await expect(rowA.locator('.cell')).toHaveCount(20);
    await expect(rowA.locator('.cell-empty')).toHaveCount(17);
    await expect(rowA.locator('.cell-success')).toHaveCount(1);
    await expect(rowA.locator('.cell-failed')).toHaveCount(1);
    await expect(rowA.locator('.cell-running')).toHaveCount(1);

    // Flow C has no runs → all 20 cells empty.
    const rowC = page.getByTestId('flow-row-flow-c');
    await expect(rowC.locator('.cell-empty')).toHaveCount(20);
  });

  test('cell colour mapping matches BrowserFlowRun.status vocabulary', async ({ page }) => {
    seedBrowserFlows([FLOWS[1]]);
    seedBrowserFlowRuns([
      { id: 'r1', flow_id: 'flow-b', started_at: '2026-07-02T10:00:00Z', status: 'success' },
      { id: 'r2', flow_id: 'flow-b', started_at: '2026-07-02T11:00:00Z', status: 'failed' },
      { id: 'r3', flow_id: 'flow-b', started_at: '2026-07-02T12:00:00Z', status: 'blocked' },
      { id: 'r4', flow_id: 'flow-b', started_at: '2026-07-02T13:00:00Z', status: 'cancelled' },
      { id: 'r5', flow_id: 'flow-b', started_at: '2026-07-02T14:00:00Z', status: 'running' },
      { id: 'r6', flow_id: 'flow-b', started_at: '2026-07-02T15:00:00Z', status: 'unexpected-value' },
    ]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const row = page.getByTestId('flow-row-flow-b');
    await expect(row.locator('.cell-success')).toHaveCount(1);
    await expect(row.locator('.cell-failed')).toHaveCount(1);
    await expect(row.locator('.cell-blocked')).toHaveCount(1);
    await expect(row.locator('.cell-cancelled')).toHaveCount(1);
    await expect(row.locator('.cell-running')).toHaveCount(1);
    // Unknown status falls back to cell-unknown, never leaks a raw class.
    await expect(row.locator('.cell-unknown')).toHaveCount(1);
  });

  test('empty state renders when the API returns no flows', async ({ page }) => {
    seedBrowserFlows([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('browser-flows-empty')).toBeVisible();
    await expect(page.getByTestId('browser-flows-matrix')).toHaveCount(0);
  });

  test('flow ordering follows the API list order (oldest created_at first)', async ({ page }) => {
    seedBrowserFlows(FLOWS);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const rows = await page.locator('tbody tr').all();
    expect(rows.length).toBe(3);
    await expect(rows[0]).toHaveAttribute('data-test', 'flow-row-flow-a');
    await expect(rows[1]).toHaveAttribute('data-test', 'flow-row-flow-b');
    await expect(rows[2]).toHaveAttribute('data-test', 'flow-row-flow-c');
  });

  test('trigger button POSTs and cancel button appears for running flows', async ({ page }) => {
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('trigger-flow-a').click();

    // A new "running" run appears; cancel button surfaces on the row.
    await expect(page.getByTestId('cancel-flow-a')).toBeVisible();
    await expect(page.getByTestId('flow-row-flow-a').locator('.cell-running')).toHaveCount(1);
    expect(browserFlowsSeed.runs.some((r) => r.status === 'running')).toBe(true);
  });

  test('disabled flow shows the trigger button as disabled', async ({ page }) => {
    seedBrowserFlows([FLOWS[2]]);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('trigger-flow-c')).toBeDisabled();
  });

  test('?legacy=1 falls back to the iframe wrapper for rollback', async ({ page }) => {
    seedBrowserFlows(FLOWS);
    await page.goto('/admin/browser-flows?legacy=1');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('browser-flows-legacy')).toBeVisible();
    await expect(page.getByTestId('browser-flows-view')).toHaveCount(0);
    await expect(page.locator('iframe.browser-flows-iframe')).toHaveAttribute('src', '/browser-flows');
  });

  test('cell renders as a router-link to the run-detail path', async ({ page }) => {
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const cell = page.getByTestId('cell-flow-a-run-a1');
    await expect(cell).toHaveAttribute('href', '/admin/browser-flows/flow-a/runs/run-a1');
  });

  test('flow-name link routes to the flow-detail path', async ({ page }) => {
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const link = page.getByTestId('flow-row-flow-a').locator('.flow-name a');
    await expect(link).toHaveAttribute('href', '/admin/browser-flows/flow-a');
  });
});
