import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4848 — the room's new History and Settings faces, reached from the compact
 * icon nav that replaced the old text-button row. History reads A1's append-only
 * relationship-event log (#4847) and renders the sequence of relationship-forming
 * messages, scrollably, with names resolved from room state and type labels from
 * the A2 vocabulary. Privacy is the server's (A1 scopes to the viewer's edges);
 * this face renders whatever the endpoint returns. Settings carries the chrome
 * moved off the board — room id, occupancy, Scan-to-join, Leave — plus the
 * signed-in player's own avatar and game name.
 *
 * Driven with a mocked backend (no aspirant-server), same page.route() pattern
 * as the dictionary spec.
 */

const ROOM_CODE = 'ABCDE';

const TYPE_ROWS = [
  { ID: 1, code: 'P', label: 'Partner', colour: '#FF6B6B' },
  { ID: 4, code: 'F', label: 'Friend', colour: '#6BCB77' },
];

const MEMBERS = [
  { user_id: 1, slot: 1, game_username: 'Vega', avatar_url: '' },
  { user_id: 2, slot: 2, game_username: 'Rigel', avatar_url: '' },
];

const HISTORY_EVENTS = [
  { id: 10, kind: 'set', type_id: 1, pair_low: 1, pair_high: 2, from_user_id: 1, to_user_id: 2, created_at: '2026-09-02T20:00:00Z' },
  { id: 11, kind: 'clear', type_id: 0, pair_low: 1, pair_high: 2, from_user_id: 0, to_user_id: 0, created_at: '2026-09-02T20:05:00Z' },
];

async function installRoomMock(page: Page, opts: { history?: unknown[] } = {}) {
  const history = opts.history ?? HISTORY_EVENTS;
  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });
  // Bare catch-all FIRST; specific handlers below win (later route wins).
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/profile$/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ID: 1 }) });
  });
  await page.route('**/api/constellations/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (/\/constellations\/rooms\/[^/]+\/join$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2, slot: 1 }) });
      return;
    }
    if (/\/constellations\/relationship-types$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationship_types: TYPE_ROWS }) });
      return;
    }
    if (/\/constellations\/rooms\/[^/]+\/history$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: history, next_after_id: 0, has_more: false }) });
      return;
    }
    if (/\/constellations\/rooms\/[^/]+\/state$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2, members: MEMBERS, relationships: [], dice: null, history_cursor: null, goal: null }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('#4848 Constellations history + settings faces', () => {
  test('History lists the relationship events with resolved names and type labels', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page);

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('room-nav-history').click();

    const face = page.getByTestId('history-face');
    await expect(face).toBeVisible();
    await expect(page.getByTestId('board-canvas')).toHaveClass(/is-flipped/);

    const items = page.getByTestId('history-list').locator('li');
    await expect(items).toHaveCount(2);
    // A `set` reads as "<from> → <to>" with the type label.
    await expect(items.nth(0)).toContainText('Vega');
    await expect(items.nth(0)).toContainText('Rigel');
    await expect(items.nth(0)).toContainText('Partner');
    // A `clear` reads from the normalized pair and says the connection cleared.
    await expect(items.nth(1)).toContainText('connection cleared');
  });

  test('History shows an empty state when the log has no events', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page, { history: [] });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('room-nav-history').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('Settings carries the moved chrome and the signed-in identity', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page);

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('room-nav-settings').click();

    await expect(page.getByTestId('settings-face')).toBeVisible();
    // The chrome that used to sit on the board now lives here.
    await expect(page.getByTestId('room-code')).toHaveText(ROOM_CODE);
    await expect(page.getByTestId('occupancy')).toContainText('2 / 4');
    await expect(page.getByTestId('join-qr')).toBeVisible();
    await expect(page.getByTestId('leave-room')).toBeVisible();
    // The signed-in player's own game name (profile ID 1 -> Vega), not a slot's.
    await expect(page.getByTestId('settings-username')).toHaveText('Vega');
  });

  test('the board no longer carries the room code or occupancy chrome', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page);

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    // Before opening settings, the board is clear of the moved chrome (#4848).
    await expect(page.getByTestId('room-code')).toHaveCount(0);
    await expect(page.getByTestId('occupancy')).toHaveCount(0);
    await expect(page.getByTestId('join-qr')).toHaveCount(0);
  });
});
