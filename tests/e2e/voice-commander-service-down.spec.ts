import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * UX walk AA4 (system_3 #11006): with its service unreachable, the voice
 * commander showed four raw "[object Object]" lines (the API's structured
 * `{code, message}` error joined into a sentence without `.message`), kept
 * Start Recording and Process Now offered into a dead service, and buried
 * Process Now inside the Filters card where on a phone it reads as an apply
 * button.
 *
 * Fixed shape: one line at the top, in words, with a retry, when the service
 * does not answer; the affected cards read "Not loaded"; no raw object or
 * transport string ever reaches the page; Start Recording is held back and
 * says so; Process Transcriptions names what it does and lives in the
 * Messages card.
 */

const gatewayError = (route: Route) =>
  route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'bad_gateway', message: 'bad gateway' } }),
  });

const ok = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const MESSAGES = { items: [{ id: 1, status: 'completed', transcription: 'buy milk', created_at: '2026-08-01T00:00:00Z' }] };
const TASKS = { items: [{ id: 1, title: 'buy milk', status: 'open', priority: 'low', label: null, due_date: null, created_at: '2026-08-01T00:00:00Z' }], total: 1 };
const NOTES = { items: [{ id: 1, content: 'a note', created_at: '2026-08-01T00:00:00Z' }], total_pages: 1 };
const VOCABULARY = { grammar: 'COMMAND <op> <table>', operations: ['create'], priorities: ['low'] };

type Answer = 'ok' | 502;

async function open(page: Page, answers: { messages?: Answer; tasks?: Answer; notes?: Answer; vocabulary?: Answer }) {
  const state = { messages: 'ok', tasks: 'ok', notes: 'ok', vocabulary: 'ok', ...answers } as Record<string, Answer>;
  await page.route(/\/api\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"not_found","message":"not stubbed"}}' }));
  await page.route(/\/api\/voice-messages$/, (route) => (state.messages === 'ok' ? ok(MESSAGES)(route) : gatewayError(route)));
  await page.route(/\/api\/commander\/tasks/, (route) => (state.tasks === 'ok' ? ok(TASKS)(route) : gatewayError(route)));
  await page.route(/\/api\/commander\/notes/, (route) => (state.notes === 'ok' ? ok(NOTES)(route) : gatewayError(route)));
  await page.route(/\/api\/commander\/vocabulary/, (route) => (state.vocabulary === 'ok' ? ok(VOCABULARY)(route) : gatewayError(route)));
  await seedAdminSession(page);
  await page.goto('/admin/voice-commander');
  await dismissMobileSidebarIfPresent(page);
  return state;
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`service fully down: one banner, four "Not loaded" cards, no raw object (${theme}, ${width}px)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page, { messages: 502, tasks: 502, notes: 502, vocabulary: 502 });

      const banner = page.locator('[data-test="service-banner"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('The voice commander service is not responding.');
      await expect(banner.getByRole('button', { name: 'Retry' })).toBeVisible();
      // First screen: the banner answers "is my recording in trouble?" with no scroll.
      const box = (await banner.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);

      await expect(page.locator('[data-test="messages-not-loaded"]')).toHaveText('Not loaded');
      await expect(page.locator('[data-test="tasks-not-loaded"]')).toHaveText('Not loaded');
      await expect(page.locator('[data-test="notes-not-loaded"]')).toHaveText('Not loaded');
      await expect(page.locator('[data-test="vocabulary-not-loaded"]')).toHaveText('Not loaded');

      await expect(page.getByText('[object Object]')).toHaveCount(0);
      await expect(page.getByText('undefined', { exact: false })).toHaveCount(0);

      // Start Recording is held back, not silently offered into a dead service.
      const startButton = page.getByRole('button', { name: 'Start Recording' });
      await expect(startButton).toBeDisabled();
      await expect(page.locator('.record-destination')).toContainText('held back');

      // Process Transcriptions names what it does and left the Filters card.
      await expect(page.locator('.filter-card').getByRole('button')).toHaveCount(0);
      await expect(page.locator('.messages-card').getByRole('button', { name: 'Process Transcriptions' })).toBeVisible();

      expect(await noSideways(page)).toBeLessThanOrEqual(0);
    });
  }
}

test('only vocabulary down: the banner names it, the other three cards show their data', async ({ page }) => {
  await open(page, { vocabulary: 502 });

  const banner = page.locator('[data-test="service-banner"]');
  await expect(banner).toContainText('Vocabulary could not be read — the voice commander service is not responding.');
  await expect(banner.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('[data-test="vocabulary-not-loaded"]')).toHaveText('Not loaded');

  await expect(page.locator('[data-test="messages-not-loaded"]')).toHaveCount(0);
  await expect(page.locator('.messages-table')).toBeVisible();
  await expect(page.locator('.tasks-table')).toBeVisible();
  await expect(page.locator('.notes-list')).toBeVisible();

  // Recording is unaffected: the messages read (what recording depends on) is fine.
  await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
  await expect(page.locator('.record-destination')).toContainText('go to the voice commander');
});

test('Retry re-reads every section, and the banner clears once they answer', async ({ page }) => {
  const state = await open(page, { messages: 502, vocabulary: 502 });
  await expect(page.locator('[data-test="service-banner"]')).toBeVisible();
  state.messages = 'ok';
  state.vocabulary = 'ok';
  await page.locator('[data-test="service-banner-retry"]').click();
  await expect(page.locator('[data-test="service-banner"]')).toHaveCount(0);
  await expect(page.locator('.messages-table')).toBeVisible();
  await expect(page.getByText('COMMAND <op> <table>')).toBeVisible();
});

test('every read answers: no banner, no "Not loaded", normal page', async ({ page }) => {
  await open(page, {});
  await expect(page.locator('[data-test="service-banner"]')).toHaveCount(0);
  await expect(page.locator('.not-loaded-text')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
  await expect(page.locator('.record-destination')).toContainText('go to the voice commander');
});
