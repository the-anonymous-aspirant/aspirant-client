import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * UX walk AA5 (system_3 #11007): the Database card listed all 59 tables, one
 * row each, pushing Refresh four phone screens down; a long table name broke
 * its figure from its unit across lines; "Checked at" had no date or zone;
 * "1 rows" appeared.
 *
 * Fixed shape: the three totals lead, the table list folds behind a count
 * (closed by default), largest table first once opened, each value kept on
 * one line; Refresh sits beside the verdict banner; the read time is a full
 * date, time and zone; counts pluralise correctly. Folded in from design_agent
 * c68758 on #11003: the Server card's "database" check now reads "Database"
 * with a real status colour, not bare amber text.
 */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const HEALTH = { status: 'ok', service: 'server', checks: { database: 'connected' } };
const CONTAINERS = { containers: [] };
const DISK = { disks: [], volumes: [], images: { total_count: 0, total_size_mb: 0 } };
// Deliberately out of size order, so a passing sort assertion means the sort
// ran, not that the fixture happened to arrive sorted.
const DB_STATS = {
  data: {
    table_count: 3,
    total_rows: 6,
    total_size_mb: 0.4,
    tables: [
      { name: 'easter_hunt_games', rows: 0, size_mb: 0.0 },
      { name: 'constellation_relationship_events_and_actions', rows: 1, size_mb: 0.1 },
      { name: 'invoicing_invoice_pdfs', rows: 5, size_mb: 0.3 },
    ],
  },
};

async function open(page: Page) {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/health$/, (route) => json(route, 200, HEALTH));
  await page.route(/\/api\/system\/containers$/, (route) => json(route, 200, CONTAINERS));
  await page.route(/\/api\/system\/disk$/, (route) => json(route, 200, DISK));
  await page.route(/\/api\/system\/db-stats$/, (route) => json(route, 200, DB_STATS));
  await seedAdminSession(page);
  await page.goto('/admin/system-health');
  await dismissMobileSidebarIfPresent(page);
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`the database card leads with totals, folds its tables, and Refresh sits at the top (${theme}, ${width}px)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page);

      // One Refresh, beside the verdict — not the page's last element.
      const refresh = page.getByRole('button', { name: 'Refresh' });
      await expect(refresh).toHaveCount(1);
      const banner = page.locator('[data-test="status-banner-partial"], .status-banner.ok');
      await expect(banner.getByRole('button', { name: 'Refresh' })).toBeVisible();
      const refreshBox = (await refresh.boundingBox())!;
      // First screen: Refresh does not need a phone-length scroll to reach.
      expect(refreshBox.y).toBeLessThanOrEqual(page.viewportSize()!.height);

      // The three totals lead, correctly pluralised.
      const summary = page.locator('.db-summary');
      await expect(summary).toContainText('3 tables');
      await expect(summary).toContainText('6 rows');

      // Closed by default: the count shows, the rows do not.
      const disclosure = page.locator('.db-tables-disclosure');
      await expect(disclosure.locator('summary')).toContainText('3 tables');
      await expect(page.locator('.info-row').filter({ hasText: 'invoicing_invoice_pdfs' })).toBeHidden();
      await expect(noSideways(page)).resolves.toBeLessThanOrEqual(0);

      // Opened: largest table first (by size), "1 row" singular, figures whole.
      await disclosure.locator('summary').click();
      const rows = page.locator('.info-row').filter({ has: page.locator('.info-label.mono') });
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toContainText('invoicing_invoice_pdfs');
      await expect(rows.nth(0)).toContainText('5 rows');
      await expect(rows.nth(1)).toContainText('constellation_relationship_events_and_actions');
      await expect(rows.nth(1)).toContainText('1 row');
      await expect(rows.nth(1)).not.toContainText('1 rows');
      await expect(rows.nth(2)).toContainText('easter_hunt_games');

      // The long name's figure stays on one line — never "0.1 / MB".
      const longRowValue = rows.nth(1).locator('.info-value');
      const valueBox = await longRowValue.boundingBox();
      const valueFont = await longRowValue.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(valueBox!.height, 'the figure is one line').toBeLessThan(valueFont * 2);

      expect(await noSideways(page)).toBeLessThanOrEqual(0);
    });
  }
}

test('Checked at is a full date, time and zone, not a bare time', async ({ page }) => {
  await open(page);
  const checkedAt = page.locator('.info-row', { hasText: 'Checked at' }).locator('.info-value');
  const text = (await checkedAt.textContent())!;
  expect(text).toMatch(/\d{4}/); // a year
  expect(text).toMatch(/[A-Za-z]{2,5}$/); // a zone abbreviation, e.g. UTC/GMT+1
  expect(text.split(':').length, 'still carries hh:mm:ss').toBeGreaterThanOrEqual(3);
});

test('the Server card\'s "database" check reads Database, with a real status colour', async ({ page }) => {
  await open(page);
  const card = page.locator('.health-card', { hasText: 'Database' }).filter({ has: page.locator('.status-badge') });
  await expect(card.locator('h3')).toContainText('Database');
  await expect(card.locator('h3')).not.toContainText('database');
  const badge = card.locator('.status-badge');
  await expect(badge).toHaveText('connected');
  const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, 'a real pill background, not the inherited transparent default').not.toBe('rgba(0, 0, 0, 0)');
});
