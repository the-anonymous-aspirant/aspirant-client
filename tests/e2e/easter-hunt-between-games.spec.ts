import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * Between hunts, the Easter hunt says what happens next, and the board then
 * appears on its own; a failed read says it failed and offers a retry; and the
 * rules greet nobody (system_3 #10998, UX walk AG6; design_conventions D2, S3,
 * S4; design_agent's ack c69515 on the task).
 *
 * Before this, a 404 ("no active game") and a failed read both showed "No active
 * game right now", and the rules ended by greeting five fixed names.
 *
 * Every /api call is answered here.
 */

type Json = Record<string, unknown> | null;
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Shaped like aspirant-server handlers/easter_hunt.go::GetEasterHuntStateHandler.
const RUNNING = {
  game_id: 1,
  seed: 42,
  lock_at: '2099-01-01T00:00:00Z',
  is_locked: false,
  board: {
    width: 128,
    height: 128,
    revealed: [],
    eggs: [{ egg_id: 0, color: '#FF6B6B', squares: 20, revealed: 5, completed: false, completed_by: null }],
  },
  scores: [
    { user_id: 3, username: 'Alex Example', score: 2 },
    { user_id: 5, username: 'Jo', score: 1 },
  ],
};

async function mock(page: Page, state: (n: number) => [number, Json]): Promise<void> {
  let n = 0;
  await page.route(/\/api\/games\/easter-hunt\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/state')) {
      const [status, body] = state(n++);
      return json(route, status, body);
    }
    if (path.endsWith('/cooldown')) {
      return json(route, 200, { data: { clicks_remaining: 3, next_refill_seconds: 60, next_refill_at: '2099-01-01T00:00:00Z' } });
    }
    return json(route, 404, { error: 'not stubbed' });
  });
}

async function open(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await seedTrustedSession(page);
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/games/easter-hunt');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Easter Egg Hunt' })).toBeVisible();
}

const rulesNameNoOne = async (page: Page) => {
  // An exact match on the greeting fails on ANY name a later edit adds back,
  // not only the five fixed names this PR removes (security review c69518 on
  // #10998: those names must not reappear in this file, the changelog, or the
  // PR body, even as a negative-assertion fixture).
  await expect(page.locator('.encouragement')).toHaveText("Ready? Let's go!");
};

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`#10998 at ${width}px (${theme})`, () => {
      test('between hunts the page says no hunt is running and what happens next, and greets nobody', async ({ page }) => {
        await mock(page, () => [404, { error: 'No active game' }]);
        await open(page, width, theme);
        const idle = page.locator('[data-test="hunt-idle"]');
        await expect(idle).toBeVisible();
        await expect(idle).toContainText('No hunt is running right now.');
        await expect(idle).toContainText('its board appears here under Game on its own');
        await expect(idle).toContainText('ask the person who sent you the link');
        await expect(page.locator('[data-test="hunt-load-error"]')).toHaveCount(0);
        // On the first screen, above the tabs.
        const box = await idle.boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(width === 390 ? 844 : 900);
        await rulesNameNoOne(page);
        expect(await noSideways(page)).toBeLessThanOrEqual(0);
      });

      test('when a hunt opens, its board appears on the next poll with no reload', async ({ page }) => {
        await page.clock.install();
        await mock(page, (n) => (n === 0 ? [404, { error: 'No active game' }] : [200, { data: RUNNING }]));
        let loads = 0;
        page.on('load', () => { loads += 1; });
        await open(page, width, theme);
        await expect(page.locator('[data-test="hunt-idle"]')).toBeVisible();
        const loadsBefore = loads;
        await page.clock.fastForward(11_000);
        await expect(page.locator('[data-test="hunt-idle"]')).toHaveCount(0);
        await expect(page.locator('.page-subtitle')).toContainText('remaining');
        await page.getByRole('tab', { name: 'Game', exact: true }).click();
        await expect(page.locator('#eh-panel-game canvas')).toBeVisible();
        expect(loads, 'the board came without a reload').toBe(loadsBefore);
      });

      test('a failed read says so, apart from an idle hunt, and Try again re-reads', async ({ page }) => {
        await mock(page, (n) => (n === 0 ? [500, { error: 'boom' }] : [200, { data: RUNNING }]));
        await open(page, width, theme);
        const err = page.locator('[data-test="hunt-load-error"]');
        await expect(err).toBeVisible();
        await expect(err).toContainText('The hunt could not be loaded (server error 500).');
        await expect(page.locator('[data-test="hunt-idle"]')).toHaveCount(0);
        await err.getByRole('button', { name: 'Try again' }).click();
        await expect(err).toHaveCount(0);
        await expect(page.locator('.page-subtitle')).toContainText('remaining');
        expect(await noSideways(page)).toBeLessThanOrEqual(0);
      });

      test("a running hunt's rules name no one either", async ({ page }) => {
        await mock(page, () => [200, { data: RUNNING }]);
        await open(page, width, theme);
        await expect(page.locator('[data-test="hunt-idle"]')).toHaveCount(0);
        await rulesNameNoOne(page);
      });
    });
  }
}
