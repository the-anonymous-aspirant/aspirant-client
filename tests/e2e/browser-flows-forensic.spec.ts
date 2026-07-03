import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installBrowserFlowsMocks,
  seedBrowserFlows,
  seedBrowserFlowRuns,
  seedBrowserFlowRunDetail,
} from './helpers/mockBackend';

/** Covers #1445-A3: /admin/browser-flows/:id/runs/:run_id renders the per-run
 *  forensic view over /api/browser-flows/:id/runs/:run_id, with screenshot
 *  embeds pointing at the aspirant-browser per-step asset endpoints. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

async function installAssetStub(page: Page): Promise<void> {
  // 1x1 transparent PNG so the `<img>` load succeeds without a real backend.
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
    'base64',
  );
  await page.route(/\/browser-flows\/.*\/steps\/.*\.png$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
  });
}

const FLOW = {
  id: 'flow-a',
  name: 'berlinstartupjobs.com',
  enabled: true,
  created_at: '2026-07-01T09:00:00Z',
};

const RUN_SUCCESS = {
  id: 'run-ok',
  flow_id: FLOW.id,
  started_at: '2026-07-03T14:00:00Z',
  completed_at: '2026-07-03T14:02:30Z',
  status: 'success',
  input_payload: {},
  output_rows_count: 2,
  errors: [],
  proxy_used: 'tor-exit-uk',
  user_agent_used: 'Mozilla/5.0 test',
  location_used: 'uk',
};

const RUN_FAILED = {
  id: 'run-bad',
  flow_id: FLOW.id,
  started_at: '2026-07-03T15:00:00Z',
  completed_at: '2026-07-03T15:01:00Z',
  status: 'failed',
  input_payload: {},
  output_rows_count: 0,
  errors: [{ code: 'timeout', message: 'page never loaded' }],
  proxy_used: null,
  user_agent_used: null,
  location_used: null,
};

const RUN_RUNNING = {
  id: 'run-live',
  flow_id: FLOW.id,
  started_at: '2026-07-03T16:00:00Z',
  completed_at: null,
  status: 'running',
  input_payload: {},
  output_rows_count: 0,
  errors: [],
  proxy_used: null,
  user_agent_used: null,
  location_used: null,
};

test.describe('/admin/browser-flows/:id/runs/:run_id — run forensic', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await installBrowserFlowsMocks(page);
    await installAssetStub(page);
  });

  test('renders header, meta, and status pill for a successful run', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(RUN_SUCCESS.id, [
      { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 1230 },
      { id: 'a2', step_order: 2, action_type: 'click', selector: 'a.next', succeeded: true, duration_ms: 45 },
    ]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="run-forensic-view"]')).toBeVisible();
    await expect(page.locator('[data-test="run-status"]')).toHaveText('success');
    await expect(page.locator('[data-test="crumb-flow"]')).toHaveText(FLOW.name);
    await expect(page.locator('[data-test="crumb-run"]')).toContainText('run-ok');
    await expect(page.locator('[data-test="meta-rows"]')).toContainText('2');
    await expect(page.locator('[data-test="run-cancel"]')).toHaveCount(0);
  });

  test('per-action trace lists every step sorted by step_order', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(RUN_SUCCESS.id, [
      { id: 'a3', step_order: 3, action_type: 'extract', succeeded: true, duration_ms: 22 },
      { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 1200 },
      { id: 'a2', step_order: 2, action_type: 'click', selector: 'a.next', succeeded: true, duration_ms: 40 },
    ]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    const steps = await page.locator('[data-test^="step-"][data-test$="-1"], [data-test^="step-"][data-test$="-2"], [data-test^="step-"][data-test$="-3"]').all();
    expect(steps.length).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-test="step-1"]')).toBeVisible();
    await expect(page.locator('[data-test="step-2"]')).toBeVisible();
    await expect(page.locator('[data-test="step-3"]')).toBeVisible();
    await expect(page.locator('[data-test="step-status-1"]')).toHaveText('ok');
    await expect(page.locator('[data-test="step-status-3"]')).toHaveText('ok');
  });

  test('failed step shows the error message and the failed styling', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_FAILED]);
    seedBrowserFlowRunDetail(RUN_FAILED.id, [
      { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 1234 },
      {
        id: 'a2',
        step_order: 2,
        action_type: 'click',
        selector: 'a.pagination-next',
        succeeded: false,
        error: 'ElementNotFound: a.pagination-next never appeared within 10 s',
        duration_ms: 10_000,
      },
    ]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_FAILED.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="run-status"]')).toHaveText('failed');
    await expect(page.locator('[data-test="step-status-2"]')).toHaveText('failed');
    await expect(page.locator('[data-test="step-error-2"]')).toContainText('ElementNotFound');
    // Failed step gets the failed CSS class for visual distinction.
    await expect(page.locator('[data-test="step-2"]')).toHaveClass(/step-failed/);
  });

  test('run-level errors block renders when the run has errors', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_FAILED]);
    seedBrowserFlowRunDetail(RUN_FAILED.id, []);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_FAILED.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="run-errors"]')).toBeVisible();
    await expect(page.locator('[data-test="run-errors"]')).toContainText('timeout');
  });

  test('screenshot thumbs point at the aspirant-browser asset endpoints', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(RUN_SUCCESS.id, [
      { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 800 },
    ]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    const before = page.locator('[data-test="screenshot-before-1"]');
    const after = page.locator('[data-test="screenshot-after-1"]');
    await expect(before).toHaveAttribute('href', `/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}/steps/1/screenshot_before.png`);
    await expect(after).toHaveAttribute('href', `/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}/steps/1/screenshot_after.png`);
    await expect(before.locator('img')).toBeVisible();
  });

  test('asset links enumerate every trace asset for each step', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(RUN_SUCCESS.id, [
      { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 100 },
    ]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    const links = page.locator('[data-test="assets-1"] .asset-link');
    await expect(links).toHaveCount(8);
    await expect(page.locator('[data-test="asset-link-1-stderr.txt"]')).toHaveAttribute(
      'href',
      `/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}/steps/1/stderr.txt`,
    );
    await expect(page.locator('[data-test="asset-link-1-har.json"]')).toBeVisible();
  });

  test('extracted output rows render as JSON blocks', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(
      RUN_SUCCESS.id,
      [{ id: 'a1', step_order: 1, action_type: 'extract', succeeded: true, duration_ms: 5 }],
      [
        { id: 'o1', row_data: { title: 'Barista', company: 'Cafe Kreuzberg' }, scraped_at: '2026-07-03T14:02:00Z' },
        { id: 'o2', row_data: { title: 'Line cook', company: 'Kitchen ABC' }, scraped_at: '2026-07-03T14:02:15Z' },
      ],
    );

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="output-row-0"]')).toContainText('Barista');
    await expect(page.locator('[data-test="output-row-1"]')).toContainText('Line cook');
    await expect(page.locator('[data-test="outputs-empty"]')).toHaveCount(0);
  });

  test('empty outputs renders the empty state', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_SUCCESS]);
    seedBrowserFlowRunDetail(RUN_SUCCESS.id, [], []);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_SUCCESS.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="outputs-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="trace-empty"]')).toBeVisible();
  });

  test('running run surfaces a Cancel button', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([RUN_RUNNING]);
    seedBrowserFlowRunDetail(RUN_RUNNING.id, []);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/${RUN_RUNNING.id}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="run-cancel"]')).toBeVisible();
    await page.locator('[data-test="run-cancel"]').click();
    await expect(page.locator('[data-test="run-status"]')).toHaveText('cancelled');
  });

  test('unknown run id renders a load error', async ({ page }) => {
    seedBrowserFlows([FLOW]);
    seedBrowserFlowRuns([]);

    await page.goto(`/admin/browser-flows/${FLOW.id}/runs/nonexistent`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="run-forensic-error"]')).toBeVisible();
    await expect(page.locator('[data-test="run-forensic-error"]')).toContainText('not found');
  });
});
