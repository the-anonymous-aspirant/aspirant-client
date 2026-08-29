import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4493 — two dark-theme surface-pairing defects, both found by the merged-
 * mainline both-themes walk of #4442's A10 set and invisible to a green build.
 *
 * These assert the RATIO in both themes, not a token name or a class. Asserting
 * `background: var(--surface-elevated)` would pass on a build where the token
 * itself stopped flipping, and asserting the class list would pass on the
 * broken version — both defects rendered a perfectly correct class list.
 *
 * D1 `.btn-back` — the DS `.btn--ghost` mixes a brand step into `currentColor`
 *   (AspButton.vue:170-184) so its ink takes the surround's polarity. On bare
 *   page chrome nothing set a colour, so currentColor was the UA default black
 *   in both themes: 8.55:1 light, 1.60:1 dark. `src/style.css` `:root` now
 *   pairs `color: var(--text-body)` with its `background-color`.
 * D2 `.source-folder` — `var(--bg-card, #fff)` on an undefined token pinned the
 *   card white while its ink flipped: card text 1.60:1, ghost controls 1.85:1.
 * D3 `.item-modal` — the same defect reached a different way: a literal
 *   `#ffffff` panel whose two text rules read `var(--text-on-light)`, which
 *   flips. Found while bounding D1's blast radius (the four hard-coded white
 *   surfaces left in `src/`); the other three carry no text.
 */

const AA_TEXT = 4.5;

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Foreground over the composited ancestor background stack — the construction
 *  tests/e2e/shared-components-icon-buttons.spec.ts uses, kept identical so the
 *  numbers on this spec and on that one are comparable. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    type RGBA = { r: number; g: number; b: number; a: number };
    const parse = (s: string): RGBA | null => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const layers: RGBA[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a === 1) break;
    }
    let bg = layers.pop() ?? null;
    while (bg && layers.length) {
      const over = layers.pop()!;
      bg = {
        r: over.r * over.a + bg.r * (1 - over.a),
        g: over.g * over.a + bg.g * (1 - over.a),
        b: over.b * over.a + bg.b * (1 - over.a),
        a: 1,
      };
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    return (Math.max(lum(eff), lum(bg)) + 0.05) / (Math.min(lum(eff), lum(bg)) + 0.05);
  });
}

async function withTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#4493 surface pairing — ${theme}`, () => {
    test(`D1 the goal-canvas back control is legible on the page it sits on`, async ({ page }) => {
      await withTheme(page, theme);
      await seedTrustedSession(page);
      await page.route(/\/api\/goals\/trees$/, json([{ id: 1, name: 'Existing name', updated_at: '2026-08-01T10:00:00Z' }]));
      await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, json([]));
      await page.goto('/member/shared/goals/1');
      await dismissMobileSidebarIfPresent(page);

      const back = page.locator('.btn-back');
      await expect(back).toBeVisible();
      expect(await contrastRatio(back), `${theme}: back control ink over the page`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    test(`D2 the finance source card and its ghost controls are legible`, async ({ page }) => {
      await withTheme(page, theme);
      await page.addInitScript(() => {
        localStorage.setItem('user_role', 'Admin');
        localStorage.setItem('user_name', 'e2e-admin');
      });
      await page.route(/\/api\//, json({}));
      await page.route(/\/api\/finance\/summary\/overview/, json({ total_transactions: 12, total_income: 1000, total_expenses: 500, banks: ['seb'], categories: [] }));
      await page.route(/\/api\/finance\/summary\/monthly/, json([]));
      await page.route(/\/api\/finance\/summary\/outliers/, json({ top_expenses: [], top_income: [] }));
      await page.route(/\/api\/finance\/transactions/, json({ transactions: [], total: 0 }));
      await page.route(/\/api\/finance\/sources/, json([{ bank: 'seb', name: 'SEB', transaction_count: 12 }]));
      await page.goto('/admin/finance');
      await dismissMobileSidebarIfPresent(page);

      const card = page.locator('.source-folder').first();
      await expect(card).toBeVisible();
      expect(await contrastRatio(card.locator('.folder-header').first()), `${theme}: card body ink`).toBeGreaterThanOrEqual(AA_TEXT);

      const schema = page.getByRole('button', { name: 'View expected CSV schema' }).first();
      await expect(schema).toBeVisible();
      expect(await contrastRatio(schema), `${theme}: schema control on the card`).toBeGreaterThanOrEqual(AA_TEXT);

      // The modal is the third `#fff` surface in this file; its closer was the
      // other ghost control #4445 ported, and since #4516 it is AspModal's own
      // ✕ (`Close dialog`), inheriting the panel ink rather than mixing a brand
      // step into it. The ratio is what is asserted either way.
      await schema.click();
      const closer = page.getByRole('button', { name: 'Close dialog' }).first();
      await expect(closer).toBeVisible();
      expect(await contrastRatio(closer), `${theme}: modal closer`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    test(`D3 the timeline item modal is legible on the panel it paints`, async ({ page }) => {
      await withTheme(page, theme);
      await seedTrustedSession(page);
      await page.route(/\/api\//, json({}));
      await page.goto('/quizzes/timeline-tech');
      await dismissMobileSidebarIfPresent(page);

      // Sequencing mode puts one draggable item card on screen; clicking it is
      // what opens the detail modal (GameTimeline.vue:177 -> showItemDetails).
      await page.locator('.mode-selector button.mode-btn').first().click();
      await page.locator('.item-card.draggable').first().click();

      // The modal is AspModal now (#4518): `[role="dialog"]`, its `.modal__title`
      // heading and `.modal__body` slot painted by the DS card ink — which is
      // what retired the `--text-on-light` reads that flipped this panel to
      // 1.60:1 in dark. The ratio, not the class, is still what is asserted.
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
      expect(await contrastRatio(modal.locator('.modal__title')), `${theme}: modal heading`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(await contrastRatio(modal.locator('.modal__body p').first()), `${theme}: modal body`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
}
