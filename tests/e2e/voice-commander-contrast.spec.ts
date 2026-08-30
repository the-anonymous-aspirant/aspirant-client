import { test, expect, type Page, type Locator, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4483 — the /admin/voice-commander cards paint --surface-card (dark in BOTH
 * themes) with no ink of their own, so descendants that inherit the ambient
 * ink — table headers, the note date — render at ~1.00:1 in the LIGHT theme,
 * where the ambient ink is also #424242. Dark reads normally, which is why
 * only a both-themes walk finds it (§3.90). Same defect family as #3027 /
 * #2415: a surface-owner must declare its ink (color: var(--text-on-dark)).
 *
 * These assert the OUTCOME (computed contrast >= WCAG AA 4.5:1) in both
 * themes, not the token, so a regression is caught however it is reintroduced.
 * #4477 already fixed .filter-card; this covers the five sibling cards.
 */

/** Computed foreground-over-effective-background contrast for `el`.
 *  Same measurement as tests/e2e/trusted-contrast.spec.ts (#3027 / #3014).
 *  Parses both rgb()/rgba() and the color(srgb …) form getComputedStyle
 *  serialises color-mix() to — an rgb-only parser silently skips --text-muted,
 *  which is the token this defect hits hardest. */
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
const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Rows are non-empty on purpose: each card's table/list is `v-else` behind an
 *  empty-state, so the headers and .note-date this defect makes invisible only
 *  render once there is at least one row. */
async function mockVoiceCommander(page: Page): Promise<void> {
  await page.route(/\/api\//, json({}));
  await page.route(/\/api\/voice-messages/, json({
    items: [{ id: 1, status: 'open', transcription: 'seeded transcription', created_at: '2026-08-01T00:00:00Z' }],
  }));
  await page.route(/\/api\/commander\/tasks/, json({
    items: [{ id: 1, title: 'seeded task', status: 'open', priority: 'high', label: null, due_date: null, created_at: '2026-08-01T00:00:00Z' }],
    total: 1,
  }));
  await page.route(/\/api\/commander\/notes/, json({
    items: [{ id: 1, content: 'seeded note', created_at: '2026-08-01T00:00:00Z' }],
    total_pages: 1,
  }));
  await page.route(/\/api\/commander\/vocabulary/, json([]));
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#4483 /admin/voice-commander card ink (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('user_role', 'Admin');
        localStorage.setItem('user_name', 'e2e-admin');
        localStorage.setItem('theme', t as string);
      }, theme);
      await mockVoiceCommander(page);
      await page.goto('/admin/voice-commander');
      await dismissMobileSidebarIfPresent(page);
    });

    test('the invisible-in-light elements clear AA on their card', async ({ page }) => {
      // Each target inherits its card's ink; before the fix all three measured
      // 1.00:1 in light (#424242 on #424242). Named individually so a failure
      // says which card regressed.
      const targets: Array<[string, Locator]> = [
        ['messages header (Transcription)', page.getByRole('columnheader', { name: 'Transcription' })],
        ['tasks header (Title)', page.locator('.tasks-table th', { hasText: 'Title' })],
        ['note date', page.locator('.note-date')],
      ];
      for (const [name, loc] of targets) {
        await expect(loc.first(), `${name}: rendered`).toBeVisible();
        const ratio = await contrastRatio(loc);
        expect(ratio, `${name} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    });
  });
}
