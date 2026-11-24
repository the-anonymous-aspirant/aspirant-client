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

    await expect(page.locator('[data-test="browser-flows-view"]')).toBeVisible();
    await expect(page.locator('[data-test="browser-flows-matrix"]')).toBeVisible();

    await expect(page.locator('[data-test="flow-row-flow-a"]')).toBeVisible();
    await expect(page.locator('[data-test="flow-row-flow-b"]')).toBeVisible();
    await expect(page.locator('[data-test="flow-row-flow-c"]')).toBeVisible();

    // Flow A has 3 runs → 17 empty cells + 3 status cells = 20 cells.
    const rowA = page.locator('[data-test="flow-row-flow-a"]');
    await expect(rowA.locator('.cell')).toHaveCount(20);
    await expect(rowA.locator('.cell-empty')).toHaveCount(17);
    await expect(rowA.locator('.cell-success')).toHaveCount(1);
    await expect(rowA.locator('.cell-failed')).toHaveCount(1);
    await expect(rowA.locator('.cell-running')).toHaveCount(1);

    // Flow C has no runs → all 20 cells empty.
    const rowC = page.locator('[data-test="flow-row-flow-c"]');
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

    const row = page.locator('[data-test="flow-row-flow-b"]');
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

    await expect(page.locator('[data-test="browser-flows-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="browser-flows-matrix"]')).toHaveCount(0);
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

    await page.locator('[data-test="trigger-flow-a"]').click();

    // A new "running" run appears; cancel button surfaces on the row.
    await expect(page.locator('[data-test="cancel-flow-a"]')).toBeVisible();
    await expect(page.locator('[data-test="flow-row-flow-a"] .cell-running')).toHaveCount(1);
    expect(browserFlowsSeed.runs.some((r) => r.status === 'running')).toBe(true);
  });

  test('disabled flow shows the trigger button as disabled', async ({ page }) => {
    seedBrowserFlows([FLOWS[2]]);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="trigger-flow-c"]')).toBeDisabled();
  });

  test('?legacy=1 falls back to the iframe wrapper for rollback', async ({ page }) => {
    seedBrowserFlows(FLOWS);
    await page.goto('/admin/browser-flows?legacy=1');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="browser-flows-legacy"]')).toBeVisible();
    await expect(page.locator('[data-test="browser-flows-view"]')).toHaveCount(0);
    await expect(page.locator('iframe.browser-flows-iframe')).toHaveAttribute('src', '/browser-flows');
  });

  test('cell renders as a router-link to the run-detail path', async ({ page }) => {
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const cell = page.locator('[data-test="cell-flow-a-run-a1"]');
    await expect(cell).toHaveAttribute('href', '/admin/browser-flows/flow-a/runs/run-a1');
  });

  test('flow-name link routes to the flow-detail path', async ({ page }) => {
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const link = page.locator('[data-test="flow-row-flow-a"] .flow-name a');
    await expect(link).toHaveAttribute('href', '/admin/browser-flows/flow-a');
  });

  // UX walk AA6 (system_3 #11008): with the service unreachable, the page
  // used to keep the reading instructions and the seven-colour legend for a
  // grid it never draws, above an error with no next step.
  test('service down: the error names a next step, and the reading instructions and legend hide', async ({ page }) => {
    await page.route(/\/api\/browser-flows(\?.*)?$/, async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Browser service unavailable' } }),
      });
    });
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="browser-flows-error"]')).toContainText('Browser service unavailable');
    const next = page.locator('[data-test="browser-flows-error-next"]');
    await expect(next).toBeVisible();
    await expect(next).toHaveAttribute('href', '/admin/system-health');
    await expect(page.locator('.meta')).toHaveCount(0);
    await expect(page.locator('[data-test="browser-flows-legend"]')).toHaveCount(0);
    await expect(page.locator('[data-test="browser-flows-matrix"]')).toHaveCount(0);
  });

  // system_3 #11846: runs read oldest-left, newest-right; the card used to
  // open scrolled to its left edge, so on a narrow card the newest run sat
  // past the right edge, unreachable without scrolling. The run strip now
  // opens scrolled to its right end. Since #11008 the strip scrolls inside
  // the card (`browser-flows-scroll`), which keeps its padding.
  for (const [width, height] of [[390, 844], [768, 1024]] as const) {
    test(`at ${width}x${height}: the newest run is visible on the first screen, no scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      seedBrowserFlows([FLOWS[0]]);
      seedBrowserFlowRuns([RUNS[0], RUNS[1]]); // run-a1 (oldest), run-a2 (newest)
      await page.goto('/admin/browser-flows');
      await dismissMobileSidebarIfPresent(page);

      const strip = page.locator('[data-test="browser-flows-scroll"]');
      const newest = page.locator('[data-test="cell-flow-a-run-a2"]');
      await expect(newest).toBeVisible();

      const overflowed = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflowed, 'fixture must actually overflow the strip, or this test proves nothing').toBe(true);

      const [cellRect, stripRect] = await Promise.all([
        newest.evaluate((el) => el.getBoundingClientRect().right),
        strip.evaluate((el) => el.getBoundingClientRect().right),
      ]);
      expect(cellRect, 'newest run cell must end at or before the strip\'s right edge').toBeLessThanOrEqual(stripRect + 0.5);

      // The page itself still does not scroll sideways.
      const pageOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(pageOverflows).toBe(false);
    });
  }

  test('at 1440 the page is unchanged: the card does not overflow, scrollLeft stays 0', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0], RUNS[1]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);

    const strip = page.locator('[data-test="browser-flows-scroll"]');
    await expect(page.locator('[data-test="cell-flow-a-run-a2"]')).toBeVisible();
    const { scrollLeft, overflowed } = await strip.evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      overflowed: el.scrollWidth > el.clientWidth + 1,
    }));
    expect(overflowed).toBe(false);
    expect(scrollLeft).toBe(0);
    const viewport = page.locator('[data-test="browser-flows-viewport"]');
    await expect(viewport, 'no fade where nothing is hidden').not.toHaveClass(/overflow-start|overflow-end/);
  });

  // system_3 #11008 (design c76151, §3.119): opening the strip at its newest
  // run pushed the Flow column off the card's left edge, so on a phone the
  // runs could not be told apart by flow. The column is sticky-left with a
  // 16ch floor below 768px, and the #4529 fades mark the side runs hide on.
  const sticky = (page: Page) => page.locator('[data-test="flow-row-flow-a"] td.flow-col');
  const strip = (page: Page) => page.locator('[data-test="browser-flows-scroll"]');
  const viewport = (page: Page) => page.locator('[data-test="browser-flows-viewport"]');

  /** The element painted just inside the strip's left edge, on flow-a's row. */
  async function leftmostPainted(page: Page): Promise<string> {
    const [box, row] = await Promise.all([
      strip(page).evaluate((el) => el.getBoundingClientRect().left),
      page.locator('[data-test="flow-row-flow-a"]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }),
    ]);
    return page.evaluate(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('td.flow-col') ? 'flow-col' : (hit?.className?.toString() ?? 'nothing');
    }, [box + 2, row]);
  }

  async function widths(page: Page): Promise<{ column: number; ch16: number }> {
    return sticky(page).evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:16ch';
      el.appendChild(probe);
      const ch16 = probe.getBoundingClientRect().width;
      probe.remove();
      return { column: el.getBoundingClientRect().width, ch16 };
    });
  }

  test('at 390: the name stays beside its runs, flush with the strip, at the 16ch floor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0], RUNS[1]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="cell-flow-a-run-a2"]')).toBeVisible();

    const opened = await strip(page).evaluate((el) => el.scrollLeft);
    expect(opened, 'opened at the newest run (#11846)').toBeGreaterThan(0);
    await expect(sticky(page).locator('a')).toBeInViewport();
    const [nameLeft, stripLeft] = await Promise.all([
      sticky(page).evaluate((el) => el.getBoundingClientRect().left),
      strip(page).evaluate((el) => el.getBoundingClientRect().left),
    ]);
    expect(Math.abs(nameLeft - stripLeft), 'the name sits flush with the strip\'s left edge').toBeLessThanOrEqual(0.5);
    expect(await leftmostPainted(page), 'no run cell shows left of the name').toBe('flow-col');

    const { column, ch16 } = await widths(page);
    expect(Math.abs(column - ch16), `column ${column}px vs 16ch ${ch16}px`).toBeLessThanOrEqual(1);

    // The runs pass under the name, never over it.
    expect(await sticky(page).evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    expect(await sticky(page).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(/rgba\(0, 0, 0, 0\)/);

    // Scrolled to the left end the name has not moved.
    await strip(page).evaluate((el) => { el.scrollLeft = 0; });
    expect(await sticky(page).evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(nameLeft, 0);
    const pageOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(pageOverflows).toBe(false);
  });

  test('at 768 the Flow column keeps its 14rem', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0], RUNS[1]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="cell-flow-a-run-a2"]')).toBeVisible();
    const column = await sticky(page).evaluate((el) => el.getBoundingClientRect().width);
    const rem14 = await page.evaluate(() => 14 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(column).toBeGreaterThanOrEqual(rem14 - 0.5);
  });

  test('at 390 the edge fades show only where runs are hidden', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    seedBrowserFlows([FLOWS[0]]);
    seedBrowserFlowRuns([RUNS[0], RUNS[1]]);
    await page.goto('/admin/browser-flows');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="cell-flow-a-run-a2"]')).toBeVisible();

    // As opened, at the newest run: older runs are hidden to the left.
    await expect(viewport(page)).toHaveClass(/matrix-viewport--overflow-start/);
    await expect(viewport(page)).not.toHaveClass(/matrix-viewport--overflow-end/);
    // The start fade begins just right of the sticky name.
    const [fadeLeft, column] = await Promise.all([
      viewport(page).evaluate((el) => parseFloat(getComputedStyle(el, '::before').left)),
      sticky(page).evaluate((el) => (el as HTMLElement).offsetWidth),
    ]);
    expect(fadeLeft).toBeCloseTo(column, 0);

    await strip(page).evaluate((el) => { el.scrollLeft = 0; });
    await expect(viewport(page)).toHaveClass(/matrix-viewport--overflow-end/);
    await expect(viewport(page)).not.toHaveClass(/matrix-viewport--overflow-start/);
  });
});
