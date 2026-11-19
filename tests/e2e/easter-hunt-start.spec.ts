import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * Starting a hunt asks when it ends (system_3 #11313; design ack on that
 * task). Between hunts an admin starts the next hunt with an end time, and a
 * reset on a running hunt asks for one too: the server's own default end is in
 * the past, so a start without a time opened a hunt that was already over.
 * Every /api call is answered here. The browser runs in Europe/Berlin, so the
 * offset sent and the zone named are known.
 */

test.use({ timezoneId: 'Europe/Berlin' });

type Json = Record<string, unknown> | null;
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const runningUntil = (lockAt: string) => ({
  game_id: 1,
  seed: 42,
  lock_at: lockAt,
  is_locked: false,
  board: { width: 128, height: 128, revealed: [], eggs: [{ egg_id: 0, color: '#FF6B6B', squares: 20, revealed: 0, completed: false, completed_by: null }] },
  scores: [],
});

interface Fake {
  state: Json; // null = between hunts (404)
  resets: Array<Record<string, unknown>>;
  refuse?: string;
}

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\/games\/easter-hunt\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/state')) return fake.state ? json(route, 200, { data: fake.state }) : json(route, 404, { error: { code: 'not_found', message: 'no active game' } });
    if (path.endsWith('/cooldown')) return json(route, 200, { data: { clicks_remaining: 3, next_refill_seconds: 60, next_refill_at: '2099-01-01T00:00:00Z' } });
    if (path.endsWith('/admin/reset') && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      fake.resets.push(body);
      if (fake.refuse) return json(route, 400, { error: { code: 'bad_request', message: fake.refuse } });
      fake.state = runningUntil(new Date(String(body.lock_at)).toISOString());
      return json(route, 200, { data: { game_id: 2, lock_at: body.lock_at } });
    }
    return json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } });
  });
}

async function open(page: Page, fake: Fake, role: 'admin' | 'member' = 'admin'): Promise<void> {
  await mock(page, fake);
  if (role === 'admin') await seedAdminSession(page);
  else await seedTrustedSession(page);
  await page.goto('/games/easter-hunt');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Easter Egg Hunt' })).toBeVisible();
}

// A local "YYYY-MM-DDTHH:MM" some days from now, in the page's own clock.
const localIn = (page: Page, days: number) =>
  page.evaluate((d) => {
    const t = new Date(Date.now() + d * 86400000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T18:00`;
  }, days);

test.describe('#11313 an admin starts the next hunt with its end time', () => {
  test('between hunts: no time leaves Start disabled with its line; the zone is named', async ({ page }) => {
    await open(page, { state: null, resets: [] });
    const form = page.locator('[data-test="hunt-start-form"]');
    await expect(form.getByRole('heading', { name: 'Start a hunt' })).toBeVisible();
    await expect(form.getByLabel('Ends at')).toHaveValue('');
    await expect(form.locator('[data-test="hunt-end-submit"]')).toHaveText('Start the hunt');
    await expect(form.locator('[data-test="hunt-end-submit"]')).toBeDisabled();
    await expect(form.locator('[data-test="hunt-ends-needed"]')).toHaveText('Choose when the hunt ends.');
    await expect(form.locator('[data-test="hunt-ends-zone"]')).toHaveText('In your time zone, Europe/Berlin.');
  });

  test('a past time is refused at the press and nothing is sent', async ({ page }) => {
    const fake: Fake = { state: null, resets: [] };
    await open(page, fake);
    const form = page.locator('[data-test="hunt-start-form"]');
    await form.getByLabel('Ends at').fill('2020-04-05T18:00');
    await form.locator('[data-test="hunt-end-submit"]').click();
    await expect(form.locator('[data-test="hunt-ends-refusal"]')).toHaveText('Choose a time after now.');
    expect(fake.resets).toEqual([]);
  });

  test('a future time starts the hunt with that end, sent with the browser\'s offset, and the board counts to it', async ({ page }) => {
    const fake: Fake = { state: null, resets: [] };
    await open(page, fake);
    const value = await localIn(page, 3);
    const form = page.locator('[data-test="hunt-start-form"]');
    await form.getByLabel('Ends at').fill(value);
    await form.locator('[data-test="hunt-end-submit"]').click();
    await expect.poll(() => fake.resets.length).toBe(1);
    // Europe/Berlin in November and March is +01:00; in summer +02:00.
    expect(String(fake.resets[0].lock_at)).toMatch(new RegExp(`^${value}:00\\+0[12]:00$`));
    await expect(page.locator('h2.page-subtitle')).toHaveText(/^[23]d \d+h remaining$/);
    await expect(page.locator('[data-test="hunt-start-form"]')).toHaveCount(0);
  });

  test('a refusal from the server is said under the button', async ({ page }) => {
    const fake: Fake = { state: null, resets: [], refuse: 'Invalid lock_at format, use RFC3339' };
    await open(page, fake);
    const form = page.locator('[data-test="hunt-start-form"]');
    await form.getByLabel('Ends at').fill(await localIn(page, 2));
    await form.locator('[data-test="hunt-end-submit"]').click();
    await expect(form.locator('[data-test="hunt-end-failure"]')).toHaveText('The hunt was not started: Invalid lock_at format, use RFC3339');
    await expect(form).toBeVisible();
  });

  test('a member sees the idle page with no start control', async ({ page }) => {
    await open(page, { state: null, resets: [] }, 'member');
    await expect(page.locator('[data-test="hunt-idle"]')).toBeVisible();
    await expect(page.locator('[data-test="hunt-start-form"]')).toHaveCount(0);
  });
});

test.describe('#11313 a reset on a running hunt asks for the new end time', () => {
  async function openGame(page: Page, fake: Fake, role: 'admin' | 'member' = 'admin') {
    await open(page, fake, role);
    await page.getByRole('tab', { name: 'Game' }).click();
  }

  test('Reset Game opens the field, the warning and "Delete scores and start"; Cancel sends nothing; no browser dialog', async ({ page }) => {
    const fake: Fake = { state: runningUntil('2099-01-01T00:00:00Z'), resets: [] };
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs += 1; void d.dismiss(); });
    await openGame(page, fake);
    await page.locator('[data-test="hunt-reset-open"]').click();
    const form = page.locator('[data-test="hunt-reset-form"]');
    await expect(form.getByRole('heading', { name: 'Start a new hunt' })).toBeVisible();
    await expect(form.locator('[data-test="hunt-end-warning"]')).toHaveText('This deletes all clicks and scores.');
    await expect(form.locator('[data-test="hunt-end-submit"]')).toHaveText('Delete scores and start');
    await expect(form.locator('[data-test="hunt-end-submit"]')).toBeDisabled();
    await form.locator('[data-test="hunt-end-cancel"]').click();
    await expect(form).toHaveCount(0);
    await expect(page.locator('[data-test="hunt-reset-open"]')).toBeVisible();
    expect(fake.resets).toEqual([]);
    expect(dialogs).toBe(0);
  });

  test('a reset with a future time sends it, with the offset, and the board counts to it', async ({ page }) => {
    const fake: Fake = { state: runningUntil('2099-01-01T00:00:00Z'), resets: [] };
    await openGame(page, fake);
    await page.locator('[data-test="hunt-reset-open"]').click();
    const form = page.locator('[data-test="hunt-reset-form"]');
    const value = await localIn(page, 1);
    await form.getByLabel('Ends at').fill(value);
    await form.locator('[data-test="hunt-end-submit"]').click();
    await expect.poll(() => fake.resets.length).toBe(1);
    expect(String(fake.resets[0].lock_at)).toMatch(new RegExp(`^${value}:00\\+0[12]:00$`));
    await expect(page.locator('h2.page-subtitle')).toHaveText(/remaining$/);
    await expect(form).toHaveCount(0);
  });

  test('a member sees no reset', async ({ page }) => {
    await openGame(page, { state: runningUntil('2099-01-01T00:00:00Z'), resets: [] }, 'member');
    await expect(page.locator('[data-test="hunt-reset-open"]')).toHaveCount(0);
  });
});
