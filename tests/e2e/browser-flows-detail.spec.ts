import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installBrowserFlowsMocks,
  seedBrowserFlows,
  seedBrowserFlowRuns,
  seedBrowserFlowHealth,
} from './helpers/mockBackend';

/** Covers #1445-A2: /admin/browser-flows/:id renders KPIs, a rows-returned
 *  sparkline, input/output schema, and paged run history via /api/browser-flows/:id/*. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const FLOW = {
  id: 'flow-a',
  name: 'berlinstartupjobs.com',
  enabled: true,
  input_schema: { type: 'object', properties: { keyword: { type: 'string' } } },
  output_schema: { title: { type: 'string' }, company: { type: 'string' } },
  created_at: '2026-07-01T09:00:00Z',
};

function makeRuns(count: number, status = 'success'): any[] {
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(2026, 5, 1, 0, i, 0).toISOString();
    const end = new Date(2026, 5, 1, 0, i, 30).toISOString();
    out.push({
      id: `run-${i + 1}`,
      flow_id: FLOW.id,
      started_at: start,
      completed_at: end,
      status,
      input_payload: {},
      output_rows_count: 10 + i,
      errors: [],
      proxy_used: null,
      user_agent_used: null,
      location_used: null,
    });
  }
  return out;
}

test.describe('/admin/browser-flows/:id — flow detail', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await installBrowserFlowsMocks(page);
  });

  test('renders KPI cards from /health payload', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns(makeRuns(3));
    seedBrowserFlowHealth(FLOW.id, {
      window: 20,
      total_runs: 3,
      success_rate: 0.75,
      avg_duration_ms: 4321,
      rows_returned_trend: [10, 11, 12],
      last_failure: null,
    });

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="flow-detail-view"]')).toBeVisible();
    await expect(page.locator('[data-test="flow-name"]')).toHaveText(FLOW.name);

    await expect(page.locator('[data-test="kpi-success-rate"]')).toContainText('75%');
    await expect(page.locator('[data-test="kpi-avg-duration"]')).toContainText('4.3 s');
    await expect(page.locator('[data-test="kpi-total-runs"]')).toContainText('3');
    await expect(page.locator('[data-test="kpi-last-failure"]')).toContainText('none in window');
  });

  test('last-failure KPI links to the failed run when present', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns(makeRuns(1));
    seedBrowserFlowHealth(FLOW.id, {
      window: 20,
      total_runs: 5,
      success_rate: 0.8,
      avg_duration_ms: 3000,
      rows_returned_trend: [1, 2, 3, 4, 5],
      last_failure: {
        id: 'run-failed-1',
        status: 'failed',
        started_at: '2026-07-01T14:00:00Z',
        completed_at: '2026-07-01T14:02:00Z',
        output_rows_count: 0,
      },
    });

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    const link = page.locator('[data-test="last-failure-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/admin/browser-flows/${FLOW.id}/runs/run-failed-1`);
  });

  test('rows-returned sparkline renders when data is present', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns(makeRuns(3));
    seedBrowserFlowHealth(FLOW.id, {
      window: 20,
      total_runs: 3,
      success_rate: 1,
      avg_duration_ms: 5000,
      rows_returned_trend: [7, 12, 9],
      last_failure: null,
    });

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="rows-returned-sparkline"]')).toBeVisible();
    await expect(page.locator('[data-test="rows-returned-empty"]')).toHaveCount(0);
  });

  test('sparkline section shows empty state when trend is empty', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([]);
    seedBrowserFlowHealth(FLOW.id, {
      window: 20,
      total_runs: 0,
      success_rate: 0,
      avg_duration_ms: null,
      rows_returned_trend: [],
      last_failure: null,
    });

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="rows-returned-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="rows-returned-sparkline"]')).toHaveCount(0);
  });

  test('input and output schema blocks render as pretty JSON', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([]);
    seedBrowserFlowHealth(FLOW.id, {});

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="input-schema"]')).toContainText('keyword');
    await expect(page.locator('[data-test="output-schema"]')).toContainText('title');
  });

  test('paged run history renders and paginates', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns(makeRuns(60));
    seedBrowserFlowHealth(FLOW.id, {
      window: 20,
      total_runs: 60,
      success_rate: 1,
      avg_duration_ms: 30000,
      rows_returned_trend: [10, 20, 30],
      last_failure: null,
    });

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="runs-table"]')).toBeVisible();
    // First page: 25 rows, newest first.
    await expect(page.locator('[data-test="runs-table"] tbody tr')).toHaveCount(25);
    await expect(page.locator('[data-test="runs-page-indicator"]')).toContainText('1–25 of 60');
    await expect(page.locator('[data-test="runs-prev"]')).toBeDisabled();

    await page.locator('[data-test="runs-next"]').click();
    await expect(page.locator('[data-test="runs-page-indicator"]')).toContainText('26–50 of 60');
    await expect(page.locator('[data-test="runs-prev"]')).toBeEnabled();

    await page.locator('[data-test="runs-next"]').click();
    await expect(page.locator('[data-test="runs-page-indicator"]')).toContainText('51–60 of 60');
    await expect(page.locator('[data-test="runs-next"]')).toBeDisabled();
  });

  test('run row links target the forensic page', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns(makeRuns(1));
    seedBrowserFlowHealth(FLOW.id, {});

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    const link = page.locator('[data-test="run-link-run-1"]');
    await expect(link).toHaveAttribute('href', `/admin/browser-flows/${FLOW.id}/runs/run-1`);
  });

  test('back link returns to the matrix', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([]);
    seedBrowserFlowHealth(FLOW.id, {});

    await page.goto(`/admin/browser-flows/${FLOW.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="back-to-matrix"]')).toHaveAttribute('href', '/admin/browser-flows');
  });

  test('unknown flow id renders a load error', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    await page.goto('/admin/browser-flows/nonexistent-flow');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="flow-detail-error"]')).toBeVisible();
    await expect(page.locator('[data-test="flow-detail-error"]')).toContainText('not found');
  });
});
