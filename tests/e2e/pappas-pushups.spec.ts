import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Seed the two pushups endpoints. `entries` drives the cumulative curve and
 *  the crown milestones; milestones stay empty so the crown logic is the only
 *  thing painting the "Meddelande" cell. */
async function mockPushups(
  page: Page,
  entries: Array<{ date: string; count: number | null }>,
): Promise<void> {
  await page.route(/\/api\/pushups\/entries$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries }),
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

/** The rows live inside per-week <details> that only auto-open for the week
 *  containing today, so force every block open before reading the cells. */
async function openAllWeeks(page: Page): Promise<void> {
  await page.$$eval('.week-block', (blocks) =>
    blocks.forEach((b) => b.setAttribute('open', '')),
  );
}

// Cumulative lands on the crown boundaries: 1499 -> 1500 -> 1600 -> 2000.
const CROWN_ENTRIES = [
  { date: '2026-07-01', count: 1499 }, // running 1499 -> 1 crown
  { date: '2026-07-02', count: 1 }, //    running 1500 -> 2 crowns (new at 1500)
  { date: '2026-07-03', count: 100 }, //  running 1600 -> 3 crowns
  { date: '2026-07-04', count: 400 }, //  running 2000 -> 7 crowns
];

test.describe('Pappas pushups graph — taller chart, 3000 ceiling, crown cadence', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('crowns: one past 1000, one more per 100 from 1500 up', async ({ page }) => {
    await mockPushups(page, CROWN_ENTRIES);
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.chart-card').waitFor();
    await openAllWeeks(page);

    const badges = page.locator('.entries-table .message-cell .milestone-badge');
    await expect(badges).toHaveText(['👑', '👑👑', '👑👑👑', '👑👑👑👑👑👑👑']);
  });

  test('crowns stay consistent through the new 2000–3000 headroom', async ({ page }) => {
    // The crown cadence has no upper cap, so it must keep counting past the old
    // 2000 ceiling up to the new 3000 roof (operator #2848).
    await mockPushups(page, [
      { date: '2026-07-01', count: 2000 }, // running 2000 -> 7 crowns
      { date: '2026-07-02', count: 500 }, //  running 2500 -> 12 crowns
      { date: '2026-07-03', count: 500 }, //  running 3000 -> 17 crowns (the roof)
    ]);
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.chart-card').waitFor();
    await openAllWeeks(page);

    const badges = page.locator('.entries-table .message-cell .milestone-badge');
    await expect(badges).toHaveText(['👑'.repeat(7), '👑'.repeat(12), '👑'.repeat(17)]);
  });

  test('below 1500 keeps the single existing crown', async ({ page }) => {
    await mockPushups(page, [
      { date: '2026-07-01', count: 1200 }, // running 1200 -> 1 crown
      { date: '2026-07-02', count: 299 }, //  running 1499 -> still 1 crown
    ]);
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.chart-card').waitFor();
    await openAllWeeks(page);

    const badges = page.locator('.entries-table .message-cell .milestone-badge');
    await expect(badges).toHaveText(['👑', '👑']);
  });

  test('chart is rendered at the doubled height (560px on desktop)', async ({ page }) => {
    await mockPushups(page, CROWN_ENTRIES);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    const wrap = page.locator('.chart-wrap');
    await expect(wrap).toBeVisible();
    const box = await wrap.boundingBox();
    // 560px = the doubled height (was 280px); assert with a sub-pixel margin
    // and comfortably above the old value so a regression is unambiguous.
    expect(box!.height).toBeGreaterThan(500);
    expect(box!.height).toBeLessThan(600);
  });
});
