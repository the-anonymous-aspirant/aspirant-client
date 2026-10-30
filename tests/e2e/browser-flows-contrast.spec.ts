import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installBrowserFlowsMocks,
  seedBrowserFlows,
  seedBrowserFlowRuns,
  seedBrowserFlowHealth,
  seedBrowserFlowRunDetail,
} from './helpers/mockBackend';

/**
 * #9175 — the browser-flows views paint --surface-card (dark in BOTH themes)
 * on blocks that declared no ink, so in the LIGHT theme the run-history table,
 * the KPI labels and notes, and the matrix headers rendered at 1.00:1 (#424242
 * on #424242). RunForensic had the inverse: on-dark ink on the page root put
 * its crumbs and empty states at ~1.2:1 on the light page. Same family as
 * #4483 (voice-commander-contrast.spec.ts): a surface owner declares its ink.
 *
 * Asserts the OUTCOME (computed contrast >= WCAG AA 4.5:1) in both themes, not
 * the token, so a regression is caught however it is reintroduced.
 */

/** Computed foreground-over-effective-background contrast for `el`. Same
 *  measurement as voice-commander-contrast.spec.ts; parses the color(srgb …)
 *  form color-mix() serialises to, which --text-muted resolves through. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    // Effective background: nearest ancestor with an opaque background.
    let bg = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

const AA = 4.5;

const FLOW = {
  id: 'flow-a',
  name: 'berlinstartupjobs.com',
  enabled: true,
  input_schema: { type: 'object', properties: { keyword: { type: 'string' } } },
  output_schema: { title: { type: 'string' } },
  created_at: '2026-07-01T09:00:00Z',
};
const RUN = {
  id: 'run-1',
  flow_id: FLOW.id,
  started_at: '2026-06-01T00:00:00Z',
  completed_at: '2026-06-01T00:00:30Z',
  status: 'success',
  input_payload: {},
  output_rows_count: 12,
  errors: [],
  proxy_used: null,
  user_agent_used: null,
  location_used: null,
};

async function expectAA(targets: Array<[string, Locator]>, theme: string): Promise<void> {
  for (const [name, loc] of targets) {
    await expect(loc.first(), `${name}: rendered`).toBeVisible();
    const ratio = await contrastRatio(loc);
    expect(ratio, `${name} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissMobileSidebarIfPresent(page);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9175 browser-flows card ink (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await seedAdminSession(page);
      await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
      await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
      await installBrowserFlowsMocks(page);
      // installBrowserFlowsMocks resets its seeds, so seed after it.
      seedBrowserFlows([FLOW]);
      seedBrowserFlowRuns([RUN]);
      seedBrowserFlowHealth(FLOW.id, { total_runs: 1, success_rate: 1, avg_duration_ms: 30000 });
      seedBrowserFlowRunDetail(RUN.id, [
        { id: 'a1', step_order: 1, action_type: 'goto', selector: 'https://example.com', succeeded: true, duration_ms: 1200 },
      ]);
    });

    test('matrix headers clear AA on the matrix card', async ({ page }) => {
      await open(page, '/admin/browser-flows');
      await expectAA([
        ['header Flow', page.locator('th.flow-col')],
        ['header Actions', page.locator('th.actions-col')],
      ], theme);
    });

    test('flow detail: KPI, schema and run-history text clear AA on their cards', async ({ page }) => {
      await open(page, `/admin/browser-flows/${FLOW.id}`);
      const runs = page.locator('[data-test="runs-table"]');
      await expectAA([
        ['KPI label', page.locator('[data-test="kpi-total-runs"] .kpi-label')],
        ['KPI value', page.locator('[data-test="kpi-total-runs"] .kpi-value')],
        ['KPI note', page.locator('[data-test="kpi-total-runs"] .kpi-note')],
        ['input schema', page.locator('[data-test="input-schema"]')],
        ['run-history header', runs.locator('th', { hasText: 'Started' })],
        ['run-history rows cell', runs.locator('td', { hasText: '12' })],
      ], theme);
    });

    test('run forensic: page text keeps page ink, card text keeps card ink', async ({ page }) => {
      await open(page, `/admin/browser-flows/${FLOW.id}/runs/${RUN.id}`);
      await expectAA([
        ['crumb run id', page.locator('[data-test="crumb-run"]')],
        ['crumb separator', page.locator('.crumb-sep')],
        ['outputs empty state', page.locator('[data-test="outputs-empty"]')],
        ['meta label', page.locator('[data-test="meta-rows"] .meta-label')],
        ['meta value', page.locator('[data-test="meta-rows"] .meta-value')],
      ], theme);
    });
  });
}
