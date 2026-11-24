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

/** Non-text contrast (a swatch fill or an outline, never a glyph): same
 *  measurement as contrastRatio, reading `prop` on `el` itself rather than
 *  its `color`, against the nearest ancestor's own opaque background. WCAG's
 *  non-text floor (UX walk AA6, system_3 #11008). */
type MarkProp = 'backgroundColor' | 'borderTopColor' | 'outlineColor';

async function nonTextContrastRatio(locator: Locator, prop: MarkProp): Promise<number> {
  return locator.first().evaluate((el, cssProp) => {
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
    let bg = null;
    for (let n: Element | null = el.parentElement; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el)[cssProp as MarkProp]);
    if (!fg || !bg || fg.a === 0) return 0;
    // A translucent mark (the grid's outlines are a color-mix with
    // transparent, #11008) is measured as it lands on the background.
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }, prop);
}

const NON_TEXT_AA = 3;

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
      // AspDataTable renders cards at narrow widths on DS main: <thead> hidden,
      // each value labelled by .data-table__card-label. Measure whichever shows.
      const runsHeader = runs.locator('th:visible, .data-table__card-label:visible', { hasText: 'Rows' });
      await expectAA([
        ['KPI label', page.locator('[data-test="kpi-total-runs"] .kpi-label')],
        ['KPI value', page.locator('[data-test="kpi-total-runs"] .kpi-value')],
        ['KPI note', page.locator('[data-test="kpi-total-runs"] .kpi-note')],
        ['input schema', page.locator('[data-test="input-schema"]')],
        ['run-history header', runsHeader],
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

    // UX walk AA6 (system_3 #11008): the legend sits on the page itself, not
    // the dark matrix card its swatches used to be calibrated for, so
    // "unknown" and "no run" read as near-identical greys in light, and "no
    // run" nearly vanished into the page in dark.
    test('legend marks clear the 3:1 non-text floor against the page', async ({ page }) => {
      await open(page, '/admin/browser-flows');
      const legend = page.locator('[data-test="browser-flows-legend"]');
      await expect(legend).toBeVisible();
      const marks: Array<[string, Locator, MarkProp]> = [
        ['success', legend.locator('.cell-success'), 'backgroundColor'],
        ['running', legend.locator('.cell-running'), 'backgroundColor'],
        ['blocked', legend.locator('.cell-blocked'), 'backgroundColor'],
        ['failed', legend.locator('.cell-failed'), 'backgroundColor'],
        ['cancelled', legend.locator('.cell-cancelled'), 'backgroundColor'],
        ['unknown', legend.locator('.cell-unknown'), 'backgroundColor'],
        ['no run (outline)', legend.locator('.cell-empty'), 'borderTopColor'],
      ];
      for (const [name, loc, prop] of marks) {
        const ratio = await nonTextContrastRatio(loc, prop);
        expect(ratio, `${name} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(NON_TEXT_AA);
      }
    });

    // system_3 #11008 (design c76151): the grid's "no run" cells were filled
    // squares while the legend promised an outline. They are outlines now, in
    // the card's own ink: the card is dark in both themes, where the page's
    // --border-control measured 2.21:1 on the light theme's card.
    test('grid "no run" cells are outlines in the card ink, 3:1 on the card, the size of a run cell', async ({ page }) => {
      await open(page, '/admin/browser-flows');
      const empty = page.locator('[data-test="browser-flows-matrix"] .cell-empty');
      await expect(empty).toHaveCount(19);
      const run = page.locator(`[data-test="cell-${FLOW.id}-${RUN.id}"]`);
      const [fill, width, emptyBox, runBox] = await Promise.all([
        empty.first().evaluate((el) => getComputedStyle(el).backgroundColor),
        empty.first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth)),
        empty.first().evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }),
        run.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }),
      ]);
      expect(fill, 'no fill').toMatch(/^rgba?\([\d.\s,]*,?\s*0\)$|^transparent$/);
      expect(width, 'a visible outline').toBeGreaterThan(0);
      expect(emptyBox, 'the outline sits inside the cell (border-box)').toEqual(runBox);
      const ratio = await nonTextContrastRatio(empty, 'borderTopColor');
      test.info().annotations.push({ type: 'ratio', description: `no-run outline @ ${theme}: ${ratio.toFixed(2)}:1` });
      expect(ratio, `no-run outline @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(NON_TEXT_AA);
    });

    test('a hovered run cell outlines in the card ink, 3:1 on the card', async ({ page }) => {
      await open(page, '/admin/browser-flows');
      const run = page.locator(`[data-test="cell-${FLOW.id}-${RUN.id}"]`);
      await run.hover();
      await expect.poll(() => run.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      const ratio = await nonTextContrastRatio(run, 'outlineColor');
      test.info().annotations.push({ type: 'ratio', description: `hover outline @ ${theme}: ${ratio.toFixed(2)}:1` });
      expect(ratio, `hover outline @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(NON_TEXT_AA);
    });

    // system_3 #11455: the floor above passed in dark while the legend still
    // wore its light-page fills, because those clear 3:1 on the dark page too.
    // The dark selectors were `:global([data-theme='dark']) .legend …`, which a
    // scoped style compiles to a bare `[data-theme=dark]` rule on <html>. So
    // this names the fill itself: each swatch wears the token of its theme.
    test('each legend swatch wears the fill of the page it sits on', async ({ page }) => {
      await open(page, '/admin/browser-flows');
      const legend = page.locator('[data-test="browser-flows-legend"]');
      await expect(legend).toBeVisible();
      const series: Record<string, number> = { success: 3, running: 1, blocked: 5, failed: 4, cancelled: 2, unknown: 9 };
      const fills = await legend.evaluate((el, [names, polarity]) => {
        const resolve = (token: string) => {
          const probe = document.createElement('span');
          probe.style.background = `var(${token})`;
          el.appendChild(probe);
          const colour = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return colour;
        };
        return Object.entries(names as Record<string, number>).map(([name, n]) => ({
          name,
          swatch: getComputedStyle(el.querySelector(`.cell-${name}`)!).backgroundColor,
          own: resolve(`--chart-series-${n}-on-${polarity}`),
          other: resolve(`--chart-series-${n}-on-${polarity === 'dark' ? 'light' : 'dark'}`),
        }));
      }, [series, theme] as const);
      expect(fills).toHaveLength(6);
      for (const { name, swatch, own, other } of fills) {
        // The two polarities differ, or equality with one would prove nothing.
        expect(own, `${name}: the two tokens differ`).not.toBe(other);
        expect(swatch, `${name} @ ${theme}: the swatch is ${swatch}, its -on-${theme} token is ${own}`).toBe(own);
      }
    });
  });
}

// UX walk AA6, system_3 #11008: "no run" is an outlined empty cell, not a
// fill, so it never depends on reading as a different grey from "unknown" —
// the shape, not only the hue, carries the distinction.
test('the legend\'s "no run" mark is an outline on no fill, not another coloured square', async ({ page }) => {
  await seedAdminSession(page);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await installBrowserFlowsMocks(page);
  seedBrowserFlows([FLOW]);
  seedBrowserFlowRuns([RUN]);
  await open(page, '/admin/browser-flows');
  const noRun = page.locator('[data-test="browser-flows-legend"] .cell-empty');
  const [fill, borderWidth] = await noRun.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundColor, s.borderTopWidth];
  });
  expect(fill, 'no-run fill is transparent').toMatch(/^rgba?\([\d.\s,]*,?\s*0\)$|^transparent$/);
  expect(parseFloat(borderWidth), 'no-run has a visible outline').toBeGreaterThan(0);
});
