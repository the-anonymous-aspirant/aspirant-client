import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Pappas sit-ups (system_3 #7992/#7994): a copy of Pappas pushups over
 *  2026-10-18..2026-12-13 with three fixed-total lines at thirds of 60/day ×
 *  57 days (1140 / 2280 / 3420), line-crossing messages, and crowns past the
 *  goal every 300. The API is #7993's GET/PATCH /api/situps/entries. */

const LINE_1 = '1140 — första linjen! En tredjedel klar.';
const LINE_2 = '2280 — andra linjen! Två tredjedelar klara.';
const GOAL = '3420 — Mål! 60 om dagen hela vägen.';

async function mockSitups(
  page: Page,
  entries: Array<{ date: string; count: number | null }>,
): Promise<void> {
  await page.route(/\/api\/situps\/entries$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries }),
    });
  });
}

async function openPage(page: Page): Promise<void> {
  await page.goto('/member/personal/pappas-sit-ups');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('.chart-card').waitFor();
  // Rows sit in per-week <details> that only auto-open for today's week.
  await page.$$eval('.week-block', (blocks) => blocks.forEach((b) => b.setAttribute('open', '')));
}

const badges = (page: Page) => page.locator('.entries-table .message-cell .milestone-badge');

/** Today's date in Europe/Stockholm, the zone the view computes "today" in. */
function stockholmToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

test.describe('Pappas sit-ups — three lines, crossings, crowns', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('the graph carries the three lines and the 3420 goal', async ({ page }) => {
    await mockSitups(page, [{ date: '2026-10-18', count: 60 }]);
    await openPage(page);

    await expect(page.locator('h1')).toHaveText('Pappas sit-ups');
    await expect(page.locator('.chart-wrap')).toHaveAttribute('data-line-totals', '1140,2280,3420');
    await expect(page.locator('.chart-meta')).toContainText('60 av 3420 situps');
  });

  test('each line is named on the day the total crosses it', async ({ page }) => {
    await mockSitups(page, [
      { date: '2026-10-18', count: 1100 }, // 1100: below the first line, no message
      { date: '2026-10-19', count: 60 }, //   1160: crosses 1140
      { date: '2026-10-20', count: 1120 }, // 2280: lands exactly on the second line
      { date: '2026-10-21', count: 1140 }, // 3420: the goal, exactly
    ]);
    await openPage(page);

    await expect(badges(page)).toHaveText([LINE_1, LINE_2, GOAL]);
  });

  test('a day that crosses two lines names the higher one', async ({ page }) => {
    await mockSitups(page, [{ date: '2026-10-18', count: 2300 }]); // 0 -> 2300
    await openPage(page);

    await expect(badges(page)).toHaveText([LINE_2]);
  });

  test('crowns: one above 3420, one more per 300', async ({ page }) => {
    await mockSitups(page, [
      { date: '2026-10-18', count: 3421 }, // 3421 -> 1 crown
      { date: '2026-10-19', count: 298 }, //  3719 -> still 1
      { date: '2026-10-20', count: 1 }, //    3720 -> 2
      { date: '2026-10-21', count: 300 }, //  4020 -> 3
    ]);
    await openPage(page);

    await expect(badges(page)).toHaveText(['👑', '👑', '👑👑', '👑👑👑']);
  });

  /** Mock an empty today row and capture the PATCH the view sends for it. */
  async function saveToday(page: Page): Promise<{ today: string; patched: () => { url: string; body: unknown } | null }> {
    const today = stockholmToday();
    await mockSitups(page, [{ date: today, count: null }]);
    let patched: { url: string; body: unknown } | null = null;
    await page.route(/\/api\/situps\/entries\/\d{4}-\d{2}-\d{2}$/, async (route: Route) => {
      patched = { url: route.request().url(), body: route.request().postDataJSON() };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entry: { date: today, count: 60 } }),
      });
    });
    await openPage(page);
    const input = page.locator('.count-cell input').first();
    await input.fill('60');
    // The view saves on the native change event. Dispatch it directly: pressing
    // Tab to blur hangs in the mobile-safari (WebKit) project.
    await input.dispatchEvent('change');
    await expect.poll(() => patched?.url ?? '').toMatch(new RegExp(`/api/situps/entries/${today}$`));
    return { today, patched: () => patched };
  }

  test('an entry saves to /api/situps/entries/<date>', async ({ page }) => {
    const { patched } = await saveToday(page);
    expect(patched()!.body).toEqual({ count: 60 });
  });

  test('the total updates after a save', async ({ page, browserName }) => {
    // Under WebKit the page stops responding once the save lands -- the
    // unchanged pushups view does the same, chromium at phone width does not
    // (system_3 #7996). Kept visible as a known failure, not skipped.
    test.fixme(browserName === 'webkit', 'page hangs after save under WebKit (system_3 #7996)');
    await saveToday(page);
    await expect(page.locator('.chart-meta')).toContainText('60 av 3420 situps');
  });

  test('a load failure speaks Swedish', async ({ page }) => {
    await page.route(/\/api\/situps\/entries$/, (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/member/personal/pappas-sit-ups');
    await dismissMobileSidebarIfPresent(page);

    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Utmaningen kunde inte laddas');
    await expect(page.locator('body')).not.toContainText('status code');
  });

  test('card text follows the dark card, not the theme (light theme)', async ({ page }) => {
    // --surface-card is dark in both themes; inheriting the page's
    // --text-on-light made every label on the cards dark-on-dark (§3.18).
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await mockSitups(page, [{ date: '2026-10-18', count: 60 }]);
    await openPage(page);

    for (const sel of ['.date-cell .date-label', '.entries-table th', '.chart-meta span']) {
      const ink = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
      // White, or white mixed toward transparent (--text-muted is a currentColor mix).
      expect(ink, sel).toMatch(/^(rgb\(255, 255, 255\)|color\(srgb 1 1 1 \/ [\d.]+\))$/);
    }
  });

  test('the Robbans Tusen widget stays on pushups only', async ({ page }) => {
    await mockSitups(page, [{ date: '2026-10-18', count: 60 }]);
    await openPage(page);

    await expect(page.locator('.robbans-tusen')).toHaveCount(0);
  });
});
