import { test, expect, type Page, type Locator, type Route } from '@playwright/test';
import {
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  installJobsMocks,
  seedJobsRows,
  seedJobsSources,
} from './helpers/mockBackend';

/**
 * #3027 — the same surface/ink collision #3014 fixed on the valuation
 * wizard card, now locked on /member/shared/translator and /member/personal/jobs.
 *
 * A container paints --surface-card with no ink of its own inside a view
 * whose inherited ink is --text-on-light (the same value), so text that
 * inherits — or derives from currentColor, as --text-muted does since
 * design-system #27 — renders at ~1:1. The surface-owning component must
 * pair its surface with its own ink (color: var(--text-on-dark)). These
 * tests assert the *outcome* (computed contrast >= WCAG AA 4.5:1), not the
 * token, so a future regression is caught however it is reintroduced.
 */

/** Computed foreground-over-effective-background contrast for `el`.
 *  Same measurement as tests/e2e/vardeutlatande.spec.ts (#3014). */
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

test.describe('#3027 /member card surface/ink contrast', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('/member/shared/translator card labels keep WCAG AA contrast', async ({ page }) => {
    // The languages fetch feeds the .languages-card; a small valid payload
    // lets both cards render their content.
    await page.route(/\/api\/translator\/languages(\?.*)?$/, async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          installed_pairs: 1,
          total_pairs: 2,
          languages: [
            { code: 'en', name: 'English', targets: [{ code: 'sv', name: 'Swedish', installed: true }] },
            { code: 'sv', name: 'Swedish', targets: [{ code: 'en', name: 'English', installed: false }] },
          ],
        }),
      });
    });

    await page.goto('/member/shared/translator');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.translate-card')).toBeVisible();

    // .lang-group label = the From/To labels (--text-muted); .char-counter
    // is the "0 / 5000" counter; .lang-stats sits in the languages card.
    for (const selector of ['.translate-card .lang-group label', '.char-counter', '.languages-card .lang-stats']) {
      const ratio = await contrastRatio(page.locator(selector));
      expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('/member/personal/jobs panel + table headers keep WCAG AA contrast', async ({ page }) => {
    await installJobsMocks(page);
    seedJobsSources([{ source: 'berlinstartupjobs.com', row_count: 3 }]);
    seedJobsRows([
      {
        id: 'job-001',
        title: 'English-speaking barista',
        company: 'Cafe Kreuzberg',
        source: 'berlinstartupjobs.com',
        distance_km: 1.8,
        scraped_at: '2026-06-30T18:00:00Z',
      },
    ]);

    await page.goto('/member/personal/jobs');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="jobs-table"]')).toBeVisible();

    // .about-me + .sources-panel-summary (the "Sources & criteria" toggle)
    // + .jobs-table th (the cited table headers) all paint --surface-card.
    for (const selector of [
      '.about-me .about-me-heading',
      '[data-test="sources-panel-summary"] span',
      '.jobs-table th',
    ]) {
      const ratio = await contrastRatio(page.locator(selector));
      expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
