import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4598 / #4587-B3 — the Constellations landing lobby. Covers the B3 acceptance
 * criteria: (1) the app appears on the member applications grid and opens the
 * landing view; (2) a game username can be set; (3) create and (4) join both
 * land on the in-room route (/member/shared/constellations/room/:code).
 *
 * The constellations API (#4593 room lifecycle, #4595 game identity) is mocked
 * in-process via page.route() — no aspirant-server is required. The real
 * end-to-end flow against the merged server is exercised as the task's Dogfood
 * evidence after deploy. The board itself is #4601; here the room route is the
 * minimal placeholder this row ships.
 */

type Profile = { game_username: string; avatar_url: string };

const ROOM_CODE = 'ABCDE';

// Installs a stateful mock for the constellations + avatar surface. Returns
// handles to inspect what the view sent.
async function installMock(page: Page, initial: Profile) {
  const profile: Profile = { ...initial };
  const putUsernames: string[] = [];
  const createBodies: Array<{ player_count: number }> = [];
  const joinCodes: string[] = [];

  // Bare /api catch-all first so unrelated background calls resolve quietly;
  // the specific handler registered below wins at match time (later route wins).
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/constellations/**', async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;

    // GET/PUT /api/constellations/profile
    if (path.endsWith('/constellations/profile')) {
      if (method === 'PUT') {
        const body = req.postDataJSON() as { game_username: string };
        profile.game_username = body.game_username;
        putUsernames.push(body.game_username);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }

    // POST /api/constellations/rooms/:code/join
    const joinMatch = path.match(/\/constellations\/rooms\/([^/]+)\/join$/);
    if (joinMatch && method === 'POST') {
      const code = decodeURIComponent(joinMatch[1]).toUpperCase();
      joinCodes.push(code);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code, player_count: 4, status: 'active', occupancy: 2, slot: 2, members: [] }),
      });
      return;
    }

    // POST /api/constellations/rooms
    if (path.endsWith('/constellations/rooms') && method === 'POST') {
      const body = req.postDataJSON() as { player_count: number };
      createBodies.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE,
          player_count: body.player_count,
          status: 'active',
          occupancy: 1,
          slot: 1,
          members: [{ user_id: 1, slot: 1 }],
        }),
      });
      return;
    }

    // GET /api/constellations/rooms/:code (state) and anything else
    await route.fulfill({ status: 204, body: '' });
  });

  return { putUsernames, createBodies, joinCodes };
}

test.describe('#4598 Constellations landing lobby', () => {
  test('appears on the member grid and opens the landing view', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { game_username: '', avatar_url: '' });
    await page.goto('/member');
    await dismissMobileSidebarIfPresent(page);

    const card = page.locator('.application-card', { hasText: 'Constellations' });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/member\/shared\/constellations$/);
    await expect(page.getByTestId('game-username')).toBeVisible();
  });

  test('saves a game username', async ({ page }) => {
    await seedTrustedSession(page);
    const handles = await installMock(page, { game_username: '', avatar_url: '' });
    await page.goto('/member/shared/constellations');
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('game-username').fill('Vega');
    await page.getByTestId('save-username').click();

    await expect.poll(() => handles.putUsernames).toContain('Vega');
    await expect(page.locator('.constellations-notice')).toContainText('saved');
  });

  test('creating a room lands on the in-room route with the code', async ({ page }) => {
    await seedTrustedSession(page);
    // Username already set → create is enabled on mount.
    const handles = await installMock(page, { game_username: 'Vega', avatar_url: '' });
    await page.goto('/member/shared/constellations');
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('create-room').click();

    await expect(page).toHaveURL(new RegExp(`/member/shared/constellations/room/${ROOM_CODE}$`));
    await expect(page.getByTestId('room-code')).toHaveText(ROOM_CODE);
    expect(handles.createBodies.length).toBe(1);
    expect(handles.createBodies[0].player_count).toBeGreaterThanOrEqual(2);
  });

  test('joining a room by code lands on the in-room route', async ({ page }) => {
    await seedTrustedSession(page);
    const handles = await installMock(page, { game_username: 'Vega', avatar_url: '' });
    await page.goto('/member/shared/constellations');
    await dismissMobileSidebarIfPresent(page);

    // Switch to the Join panel via the segmented control (scoped so it doesn't
    // collide with the "Join room" action button).
    await page.locator('.segmented__item', { hasText: 'Join' }).click();
    await page.getByTestId('join-code').fill('xbvgr');
    await page.getByTestId('join-room').click();

    await expect(page).toHaveURL(/\/member\/shared\/constellations\/room\/XBVGR$/);
    await expect.poll(() => handles.joinCodes).toContain('XBVGR');
  });
});
