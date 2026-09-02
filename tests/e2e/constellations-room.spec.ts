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
  const joinCalls: string[] = [];

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
    // #4806 ask 1: the room route joins before it reads. Default the join to
    // the seated 200 so every pre-existing case still reaches the board; the
    // refusal cases below override this route with their own handler.
    if (/\/constellations\/rooms\/[^/]+\/join$/.test(url.pathname)) {
      joinCalls.push(url.pathname.split('/').slice(-2, -1)[0]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE,
          player_count: room.player_count,
          status: 'active',
          occupancy: room.occupancy,
          slot: 1,
        }),
      });
      return;
    }
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
    joinCalls,
  };
}

// Installs a mock whose join endpoint REFUSES with #4808's discriminated
// error body. Registered after installMock so it wins the match.
async function refuseJoin(
  page: Page,
  status: number,
  error: Record<string, unknown>,
) {
  await page.route(/\/constellations\/rooms\/[^/]+\/join$/, async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error }),
    });
  });
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

  // #4587-H2 / #4772 established that the rulebook must actually be SERVED —
  // the original /api/uploads/… href 404'd for every member and an href-only
  // assertion is what masked it. #4806 ask 5 changes only how it is REACHED
  // (in-place flip, not a new tab), so that 200 check survives the change and
  // is asserted here independently of the flip.
  test('the rulebook asset resolves 200 for a member', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const res = await page.request.get('/constellations-rulebook.html');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('How to play');
  });

  // #4806 ask 5 — "the 'Read the rules' should not bring you to an entirely new
  // page, just do a flip of the game room, and then reveal the scorllable rules
  // - replacing the 'Read the rules' with 'Back to the game'." #4772 opened it
  // in a new tab; that is what this supersedes.
  test('Read the rules flips the board in place instead of navigating', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    const roomUrl = `/member/shared/constellations/room/${ROOM_CODE}`;
    await page.goto(roomUrl);
    await dismissMobileSidebarIfPresent(page);

    const rules = page.getByTestId('read-rules');
    await expect(rules).toHaveText('Read the rules');
    // It is a button now, not an anchor — there is no target to open a tab on.
    expect(await rules.evaluate((el) => el.tagName)).toBe('BUTTON');

    await rules.click();

    await expect(page).toHaveURL(new RegExp(`${ROOM_CODE}$`));
    await expect(page.getByTestId('board-canvas')).toHaveClass(/is-flipped/);
    await expect(page.getByTestId('rules-face')).toBeVisible();
    await expect(rules).toHaveText('Back to the game');
    await expect(rules).toHaveAttribute('aria-expanded', 'true');
  });

  test('Back to the game flips the board back', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const rules = page.getByTestId('read-rules');
    await rules.click();
    await expect(rules).toHaveText('Back to the game');

    await rules.click();
    await expect(rules).toHaveText('Read the rules');
    await expect(page.getByTestId('board-canvas')).not.toHaveClass(/is-flipped/);
    await expect(rules).toHaveAttribute('aria-expanded', 'false');
    // The board is back and usable — the dice affordance is on screen again.
    await expect(page.getByTestId('dice-roll')).toBeVisible();
  });

  // "reveal the scorllable rules" — the rules scroll INSIDE the board, they do
  // not grow the card down the page.
  test('the rules face scrolls inside the board rather than growing it', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { occupancy: 1, player_count: 4, members: [{ user_id: 1 }] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    // offsetHeight, not boundingBox: the card is mid-rotateY under perspective
    // while the flip runs, so its *projected* box legitimately shrinks. The
    // claim under test is a layout one — the card does not grow — and layout
    // height is what offsetHeight reports, transform or no transform.
    const board = page.getByTestId('board-canvas');
    const heightBefore = await board.evaluate((el) => (el as HTMLElement).offsetHeight);

    await page.getByTestId('read-rules').click();
    const frame = page.getByTestId('rules-face');
    await expect(frame).toBeVisible();

    const heightAfter = await board.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(Math.abs(heightAfter - heightBefore)).toBeLessThan(2);

    // The embedded document is taller than the frame, i.e. there is something
    // to scroll — measured inside the iframe, not asserted from CSS.
    const content = page.frameLocator('[data-testid="rules-face"]').locator('body');
    await expect(content).toContainText('How to play');
    const overflow = await content.evaluate(
      (el) => el.ownerDocument.documentElement.scrollHeight - el.ownerDocument.documentElement.clientHeight,
    );
    expect(overflow).toBeGreaterThan(0);
  });
});

/**
 * #4806 ask 1 / #4810 — the scanned room link joins you automatically, and when
 * it cannot, says WHICH condition blocked.
 *
 * Before this, the room route went straight to the D1 poll, which answers a
 * non-member with 403 "Only a member of the room may view its state" — the
 * sentence the operator objected to, rendered verbatim.
 *
 * The `reason` discriminator these mocks carry is aspirant-server's, added by
 * #4808 (merged 2026-09-02, `54e4f59a`): error.code is derived from the HTTP
 * status, so a full room and a caller seated elsewhere are both `conflict`.
 */
test.describe('#4810 Constellations scanned-link auto-join', () => {
  const SEATED: RoomState = { occupancy: 2, player_count: 4, members: [{ user_id: 1 }, { user_id: 2 }] };

  test('a scanned room link joins automatically and lands on the board', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, SEATED);

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('board-canvas')).toBeVisible();
    await expect.poll(() => mock.joinCalls).toEqual([ROOM_CODE]);
    // The 403 poll prose must never reach the player.
    await expect(page.getByTestId('room-error')).toHaveCount(0);
    await expect(page.getByTestId('blocked-state')).toHaveCount(0);
  });

  test('an existing member opening the room never flashes the blocked state', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    // Watched across the whole entry, not merely asserted at the end: a naive
    // "render the board, then correct it" would show the panel for a frame to
    // every returning player.
    for (let i = 0; i < 6; i++) {
      await expect(page.getByTestId('blocked-state')).toHaveCount(0);
      await page.waitForTimeout(200);
    }
    await expect(page.getByTestId('board-canvas')).toBeVisible();
  });

  test('a full room explains that it is full and names the size', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 409, {
      code: 'conflict',
      reason: 'room_full',
      message: 'Room ABCDE is full — all 4 seats are taken.',
      room_player_count: 4,
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('blocked-state')).toBeVisible();
    await expect(page.getByTestId('blocked-title')).toHaveText('This game is full');
    await expect(page.getByTestId('blocked-message')).toContainText('all 4 seats are taken');
    await expect(page.getByTestId('blocked-guidance')).toContainText('All 4 seats are taken');
    await expect(page.getByTestId('board-canvas')).toHaveCount(0);
  });

  test('an ended game says the game has ended, not that the code is unknown', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 404, {
      code: 'not_found',
      reason: 'room_ended',
      message: 'That game has ended',
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('blocked-title')).toHaveText('This game has ended');
    // The two 404 reasons must not collapse into one explanation — that
    // collapse is precisely what #4808 separated on the server.
    await expect(page.getByTestId('blocked-title')).not.toHaveText('No room with that code');
  });

  test('an unknown code says the code is unknown', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 404, {
      code: 'not_found',
      reason: 'room_not_found',
      message: 'Room not found',
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('blocked-title')).toHaveText('No room with that code');
    await expect(page.getByTestId('blocked-guidance')).toContainText('five characters');
  });

  test('already in another game names that room and links to it', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 409, {
      code: 'conflict',
      reason: 'already_in_game',
      message: 'You are already in game ZK4TQ — leave it before starting or joining another.',
      active_room_code: 'ZK4TQ',
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('blocked-title')).toHaveText('You’re already in another game');
    await expect(page.getByTestId('blocked-message')).toContainText('ZK4TQ');
    const link = page.getByTestId('go-to-active-room');
    await expect(link).toHaveText('Go to room ZK4TQ');
    await expect(link).toHaveAttribute('href', '/member/shared/constellations/room/ZK4TQ');
  });

  test('every blocked state offers a way back to the lobby', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 409, { code: 'conflict', reason: 'room_full', message: 'Room is full' });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('back-to-lobby').click();
    await expect(page).toHaveURL(/\/member\/shared\/constellations$/);
  });

  test('a reason this client does not know still renders the server message', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, SEATED);
    await refuseJoin(page, 409, {
      code: 'conflict',
      reason: 'some_future_reason',
      message: 'The room is sealed for the next round.',
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('blocked-title')).toHaveText('You could not join this room');
    await expect(page.getByTestId('blocked-message')).toHaveText('The room is sealed for the next round.');
    await expect(page.getByTestId('back-to-lobby')).toBeVisible();
  });
});
