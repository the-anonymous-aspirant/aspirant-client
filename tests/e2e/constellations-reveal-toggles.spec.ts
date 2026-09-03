import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4835-B1 — the two creator-only transparency toggles on the Settings face.
 * The server (#4835-A1) persists the room creator and echoes is_creator +
 * reveal_connections/reveal_cards on the room-state DTO, and owns the
 * authorization (a non-creator's POST /settings 403s). This face renders the
 * section only for the creator and POSTs one field per toggle.
 *
 * Mocked backend (no aspirant-server), same page.route() pattern as the history
 * spec.
 */

const ROOM_CODE = 'ABCDE';

const MEMBERS = [
  { user_id: 1, slot: 1, game_username: 'Vega', avatar_url: '' },
  { user_id: 2, slot: 2, game_username: 'Rigel', avatar_url: '' },
];

type StateOpts = {
  isCreator?: boolean;
  revealConnections?: boolean;
  revealCards?: boolean;
};

async function installRoomMock(
  page: Page,
  opts: StateOpts & { settingsCalls?: Array<Record<string, unknown>> } = {},
) {
  const { isCreator = true, revealConnections = false, revealCards = false, settingsCalls } = opts;

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
    if (/\/constellations\/rooms\/[^/]+\/settings$/.test(url.pathname)) {
      if (settingsCalls) settingsCalls.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reveal_connections: revealConnections, reveal_cards: revealCards }) });
      return;
    }
    if (/\/constellations\/rooms\/[^/]+\/state$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2,
          members: MEMBERS, relationships: [], dice: null, history_cursor: null, goal: null,
          is_creator: isCreator, reveal_connections: revealConnections, reveal_cards: revealCards,
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function openSettings(page: Page) {
  await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
  await dismissMobileSidebarIfPresent(page);
  await page.getByTestId('room-nav-settings').click();
  await expect(page.getByTestId('settings-face')).toBeVisible();
}

test.describe('#4835 Constellations creator-only transparency toggles', () => {
  test('the creator sees both toggles reflecting current state', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page, { isCreator: true, revealConnections: true, revealCards: false });

    await openSettings(page);

    await expect(page.getByTestId('settings-transparency')).toBeVisible();
    await expect(page.getByTestId('toggle-reveal-connections')).toBeChecked();
    await expect(page.getByTestId('toggle-reveal-cards')).not.toBeChecked();
  });

  test('toggling a setting POSTs that one field to the settings endpoint', async ({ page }) => {
    const settingsCalls: Array<Record<string, unknown>> = [];
    await seedTrustedSession(page);
    await installRoomMock(page, { isCreator: true, revealConnections: false, revealCards: false, settingsCalls });

    await openSettings(page);
    await page.getByTestId('toggle-reveal-cards').check();

    await expect.poll(() => settingsCalls.length).toBeGreaterThan(0);
    expect(settingsCalls[settingsCalls.length - 1]).toEqual({ reveal_cards: true });
  });

  test('a non-creator does not see the transparency section', async ({ page }) => {
    await seedTrustedSession(page);
    await installRoomMock(page, { isCreator: false });

    await openSettings(page);

    await expect(page.getByTestId('settings-transparency')).toHaveCount(0);
    // The rest of the settings face still renders for a non-creator.
    await expect(page.getByTestId('leave-room')).toBeVisible();
  });
});
