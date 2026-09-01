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

  // #4587-H1 / #4771 — the Leave button must POST the leave endpoint before
  // navigating away. The bug: a bare router.push left membership open server
  // side, so occupancy never dropped and the one-game-per-user lock stayed held.
  test('Leave posts to the server before navigating away', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 2, player_count: 4, members: [{ user_id: 1 }, { user_id: 2 }] });

    // Record the leave POST (registered after installMock so it wins the match).
    let leftCode: string | null = null;
    await page.route(/\/constellations\/rooms\/[^/]+\/leave$/, async (route: Route) => {
      leftCode = new URL(route.request().url()).pathname.split('/').slice(-2, -1)[0];
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('leave-room').click();

    // The leave endpoint was called for this room, then we navigated to the lobby.
    await expect.poll(() => leftCode).toBe(ROOM_CODE);
    await expect(page).toHaveURL(/\/member\/shared\/constellations$/);
  });

  // #4587-H1 / #4771 — a failed leave call must never trap the player in the
  // room UI: we still navigate away (best-effort call, tolerated error).
  test('Leave still navigates when the server call fails', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 2, player_count: 4, members: [{ user_id: 1 }, { user_id: 2 }] });

    await page.route(/\/constellations\/rooms\/[^/]+\/leave$/, async (route: Route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' });
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('leave-room').click();

    await expect(page).toHaveURL(/\/member\/shared\/constellations$/);
  });

  // #4587-H2 / #4772 — the room specifies two buttons ("Read the rules; leave
  // the game"); the rules link was absent. It must surface the rulebook in a new
  // tab. The original href pointed at /api/uploads/… — the system_3 admin upload
  // store, which aspirant-server does not serve (no /uploads/:id route), so the
  // link 404'd for every member (G1 re-walk). The rulebook is now a public static
  // asset; assert the link both points at it AND actually resolves 200 for a
  // logged-in member — an href-only assertion is what masked the dead link.
  test('Read the rules links to the rulebook and it resolves for a member', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const rules = page.getByTestId('read-rules');
    await expect(rules).toBeVisible();
    await expect(rules).toHaveAttribute('href', '/constellations-rulebook.html');
    await expect(rules).toHaveAttribute('target', '_blank');
    await expect(rules).toHaveAttribute('rel', /noopener/);

    // The link target must actually be served — not 404 as the /api/uploads/…
    // target was. page.request carries the seeded member session.
    const href = await rules.getAttribute('href');
    const res = await page.request.get(href as string);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('How to play');
  });
});
