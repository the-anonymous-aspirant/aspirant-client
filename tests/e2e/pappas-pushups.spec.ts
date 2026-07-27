import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

// Cumulative pushups reach 2000 across these four days, crossing every crown
// threshold: 1000 (base crown), 1500, 1600 and 2000. The final day is "today"
// (Europe/Stockholm) so its week block renders expanded.
const ENTRIES = [
  { date: '2026-07-24', count: 1000 }, // cumulative 1000 — target hit, no crown yet (strict >)
  { date: '2026-07-25', count: 500 }, //  cumulative 1500 — 2 crowns
  { date: '2026-07-26', count: 100 }, //  cumulative 1600 — 3 crowns
  { date: '2026-07-27', count: 400 }, //  cumulative 2000 — 7 crowns
];

async function mockPushupEndpoints(page: Page): Promise<void> {
  await page.route(/\/api\/pushups\/entries$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: ENTRIES }),
    });
  });
  await page.route(/\/api\/pushups\/milestones$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ milestones: [] }),
    });
  });
}

test.describe('Pappas pushups graph — taller chart, 2000 ceiling, crown ladder', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await mockPushupEndpoints(page);
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
  });

  test('chart wrapper is drawn at double the previous height', async ({ page }) => {
    const wrap = page.locator('.chart-wrap');
    await expect(wrap).toBeVisible();
    // Was 280px (desktop) / 220px (mobile); doubled to 560 / 440.
    const height = await wrap.evaluate((el) => el.clientHeight);
    expect(height).toBeGreaterThanOrEqual(440);
  });

  test('crowns accumulate one per 100 pushups from 1500 upward', async ({ page }) => {
    // Wait for the cumulative-2000 row (the today week, rendered expanded) to
    // have painted its 7-crown badge before collecting all badge texts.
    await expect(
      page.locator('.milestone-badge').filter({ hasText: '👑'.repeat(7) }),
    ).toHaveCount(1);
    const badges = await page.locator('.milestone-badge').allTextContents();
    expect(badges).toContain('👑👑'); //       1500 → 2 crowns
    expect(badges).toContain('👑👑👑'); //     1600 → 3 crowns
    expect(badges).toContain('👑'.repeat(7)); // 2000 → 7 crowns
    // The exact-1000 row does not earn a crown (strict > TARGET).
    expect(badges).not.toContain('👑');
  });
});
