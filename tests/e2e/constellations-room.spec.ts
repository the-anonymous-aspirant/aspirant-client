import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4601 / #4587-E1 — the in-room board shell + live-state polling. Covers the
 * E1 acceptance: entering a room renders the shell (title, room code, occupancy)
 * and the occupancy/room-code update live from the D1 short-poll
 * (`GET /api/constellations/rooms/:code/state`, #4600).
 *
 * The state aggregate is mocked in-process via page.route() — no aspirant-server
 * is required. The external QR service (api.qrserver.com, the QrGenerator.vue
 * precedent) is stubbed so the test never touches the network. The board
 * internals (avatars/lines/dice/summary) are F1–F4 (#4602–4606) and are not
 * exercised here; this row is the shell they mount into.
 */

const ROOM_CODE = 'ABCDE';

type RoomState = { occupancy: number; player_count: number; members: unknown[] };

// Installs a stateful mock for the room-state aggregate. Returns a setter the
// test uses to simulate other players arriving/leaving between polls.
async function installMock(page: Page, initial: RoomState) {
  const room: RoomState = { ...initial };

  // Stub the external QR image so the shell's <img> never hits the network.
  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });

  // Bare /api catch-all first so unrelated background calls resolve quietly;
  // the specific handler below wins at match time (later route wins).
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/constellations/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (/\/constellations\/rooms\/[^/]+\/state$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE,
          player_count: room.player_count,
          status: 'active',
          occupancy: room.occupancy,
          members: room.members,
          relationships: [],
          dice: null,
          history_cursor: null,
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  return {
    setOccupancy(n: number) {
      room.occupancy = n;
    },
  };
}

test.describe('#4601 Constellations in-room shell', () => {
  test('renders the shell with room code and occupancy from the poll', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 2, player_count: 4, members: [{ user_id: 1 }, { user_id: 2 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('.constellations-room-title')).toHaveText('Constellations');
    await expect(page.getByTestId('room-code')).toHaveText(ROOM_CODE);
    await expect(page.getByTestId('occupancy')).toContainText('2 / 4');
  });

  test('occupancy updates live when the poll changes', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('occupancy')).toContainText('1 / 4');

    // Another player joins — the next poll must reflect it without a reload.
    mock.setOccupancy(3);
    await expect(page.getByTestId('occupancy')).toContainText('3 / 4');
  });
});
