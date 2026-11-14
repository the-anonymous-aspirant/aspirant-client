import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The meal tracker says when its log could not be read (system_3 #11018, UX
 *  walk finding AM1; D2, D7, D11, §3.122 P3). Before this a refused read was
 *  logged to the console only, and the page showed seven figures computed from
 *  an empty list ("0 hours", "0.00", "0") with Save live. Every /api call is
 *  answered here; a catch-all /api/ → 404 is registered first. */

type Json = Record<string, any>;
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const NOW = new Date('2026-11-14T10:00:00');
const at = (hhmm: string, daysAgo = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

interface Fake {
  reads: Array<{ status: number; body?: Json }>;
  items: Json[];
  saveStatus: number;
}

async function open(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/data_models\/ludde_feeding_times$/, (route) => {
    if (route.request().method() === 'POST') {
      if (fake.saveStatus !== 200) return json(route, fake.saveStatus, { error: 'no' });
      const body = JSON.parse(route.request().postData() || '{}');
      fake.items.push({ ID: fake.items.length + 1, timestamp: new Date(body.timestamp).toISOString(), comment: body.comment });
      return json(route, 200, { ok: true });
    }
    const next = fake.reads.length > 1 ? fake.reads.shift()! : fake.reads[0];
    if (next.status !== 200) return json(route, next.status, next.body || { error: 'refused' });
    return json(route, 200, { items: [...fake.items] });
  });
  await seedTrustedSessionAs(page, 'jenny');
  await page.goto('/member/personal/ludde-analytics');
  await dismissMobileSidebarIfPresent(page);
}

const meals = () => [
  { ID: 1, timestamp: at('19:30', 1), comment: '' },
  { ID: 2, timestamp: at('06:15'), comment: '' },
  { ID: 3, timestamp: at('07:50'), comment: '' },
];

const errorState = (page: Page) => page.locator('[data-testid="read-state-failed"]');
const refused = (page: Page) => page.locator('[data-test="meal-log-refused"]');
const figures = (page: Page) => page.locator('[data-test="meal-figures"]');
const save = (page: Page) => page.locator('[data-test="meal-save"]');

test.describe('#11018 the meal log says when it could not be read', () => {
  test("a refused read (403) says the log is someone else's, with no retry and no form", async ({ page }) => {
    await open(page, { reads: [{ status: 403 }], items: meals(), saveStatus: 200 });
    await expect(refused(page)).toContainText('This app belongs to another account');
    await expect(refused(page)).toContainText('Only its owner and an administrator can open it.');
    // Trying again cannot help with a refusal, so it is not offered.
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(save(page)).toHaveCount(0);
    await expect(figures(page)).toHaveCount(0);
    await expect(page.getByText('0 hours')).toHaveCount(0);
  });

  test('a failed read is said in words: no figures, saving held, and Try again recovers', async ({ page }) => {
    await open(page, { reads: [{ status: 502 }, { status: 200 }], items: meals(), saveStatus: 200 });
    await expect(errorState(page)).toContainText('The meal log could not be read');
    await expect(errorState(page)).toContainText('The server answered with an error (502).');
    await expect(figures(page)).toHaveCount(0);
    await expect(page.locator('[data-test="meal-last"]')).toHaveCount(0);
    await expect(save(page)).toBeDisabled();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(errorState(page)).toHaveCount(0);
    await expect(page.locator('[data-test="meal-last"]')).toContainText('Last meal: today');
    await expect(figures(page)).toBeVisible();
    await expect(save(page)).toBeEnabled();
  });

  test('a signed-out read says to sign in again', async ({ page }) => {
    await open(page, { reads: [{ status: 401 }], items: [], saveStatus: 200 });
    await expect(errorState(page)).toContainText('You are signed out. Sign in again to read it.');
  });

  test('a log that was read and is empty says so in words, with no zeros', async ({ page }) => {
    await open(page, { reads: [{ status: 200 }], items: [], saveStatus: 200 });
    await expect(page.locator('[data-test="meal-last"]')).toHaveText('No meals in the log yet.');
    await expect(figures(page)).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
  });

  test('a log with meals answers when Ludde last ate and how often today', async ({ page }) => {
    await open(page, { reads: [{ status: 200 }], items: meals(), saveStatus: 200 });
    // The newest is 07:50 today: 2 h 10 min before 10:00. Two meals today.
    // 24-hour, whatever the browser's locale (design_agent c68245).
    await expect(page.locator('[data-test="meal-last"]')).toHaveText('Last meal: today 07:50, 2 h 10 min ago. 2 meals today.');
    await expect(figures(page)).toBeVisible();
  });

  test('a last meal yesterday gives its age, and today with none says so', async ({ page }) => {
    await open(page, { reads: [{ status: 200 }], items: [{ ID: 1, timestamp: at('22:10', 1), comment: '' }], saveStatus: 200 });
    await expect(page.locator('[data-test="meal-last"]')).toHaveText('Last meal: yesterday 22:10, 11 h 50 min ago. No meals today yet.');
  });

  test('past a day the date carries it, with no age', async ({ page }) => {
    await open(page, { reads: [{ status: 200 }], items: [{ ID: 1, timestamp: at('21:05', 2), comment: '' }], saveStatus: 200 });
    await expect(page.locator('[data-test="meal-last"]')).toHaveText('Last meal: 12 Nov 21:05. No meals today yet.');
  });

  test('a failed save says so under the button', async ({ page }) => {
    await open(page, { reads: [{ status: 200 }], items: meals(), saveStatus: 500 });
    await save(page).click();
    await expect(page.locator('[data-test="meal-save-error"]')).toHaveText('The meal was not saved. The server answered with an error (500).');
  });

  for (const width of [360, 390]) {
    test(`at ${width}px the date-time field fits and nothing scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, { reads: [{ status: 200 }], items: meals(), saveStatus: 200 });
      await expect(page.locator('[data-test="meal-last"]')).toBeVisible();
      const box = await page.locator('.datetime-input').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }
});
