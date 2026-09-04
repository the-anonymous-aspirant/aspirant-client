import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4602 / #4587-F1 — the relationship graph canvas. Covers the F1 acceptance:
 * the board draws the current graph (one avatar per seated member, one typed
 * coloured edge per relationship, colours from the A2 vocabulary carried in
 * the D1 payload), hovering a player reveals their name, and a relationship
 * added between polls appears without a reload.
 *
 * Same in-process page.route() state mock as constellations-room.spec.ts —
 * no aspirant-server required. Avatar URLs are left empty so the nodes render
 * their initial fallback and never fetch an image.
 */

const ROOM_CODE = 'ABCDE';

type Member = { user_id: number; slot: number; game_username: string; avatar_url: string };
type Relationship = {
  from_user_id: number;
  to_user_id: number;
  type_id: number;
  type_code: string;
  type_label: string;
  colour: string;
};
type RoomState = { occupancy: number; player_count: number; members: Member[]; relationships: Relationship[] };

const MEMBERS: Member[] = [
  { user_id: 11, slot: 1, game_username: 'SUPERNOVA', avatar_url: '' },
  { user_id: 12, slot: 2, game_username: 'JIM', avatar_url: '' },
  { user_id: 13, slot: 3, game_username: 'SALLY', avatar_url: '' },
];

const PARTNER_EDGE: Relationship = {
  from_user_id: 11,
  to_user_id: 12,
  type_id: 1,
  type_code: 'P',
  type_label: 'Partner',
  colour: '#FF6B6B',
};

const FRIEND_EDGE: Relationship = {
  from_user_id: 12,
  to_user_id: 13,
  type_id: 4,
  type_code: 'F',
  type_label: 'Friend',
  colour: '#6BCB77',
};

async function installMock(page: Page, initial: RoomState) {
  const room: RoomState = { ...initial };

  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });

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
          relationships: room.relationships,
          dice: null,
          history_cursor: null,
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  return {
    setRelationships(rels: Relationship[]) {
      room.relationships = rels;
    },
  };
}

test.describe('#4602 Constellations relationship graph', () => {
  test('draws one avatar per member and one edge per relationship with A2 colours', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE, FRIEND_EDGE],
    });

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('board-graph')).toBeVisible();
    await expect(page.getByTestId('board-avatar')).toHaveCount(3);
    await expect(page.getByTestId('board-edge')).toHaveCount(2);

    // Edge colours come from the payload (relationship_types.colour, A2) —
    // the per-type colour acceptance line.
    const partner = page.locator('[data-testid="board-edge"][data-type-code="P"]');
    await expect(partner).toHaveAttribute('stroke', '#FF6B6B');
    const friend = page.locator('[data-testid="board-edge"][data-type-code="F"]');
    await expect(friend).toHaveAttribute('stroke', '#6BCB77');
  });

  test('hovering a player reveals their name', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE],
    });

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const jim = page.locator('[data-testid="board-avatar"][data-user-id="12"]');
    const jimName = jim.getByTestId('avatar-name');
    await expect(jimName).toHaveText('JIM');
    // The name is faded out until hover (opacity, not display — Playwright
    // visibility does not track opacity, so assert the computed style).
    await expect(jimName).toHaveCSS('opacity', '0');
    await jim.hover();
    await expect(jimName).toHaveCSS('opacity', '1');
  });

  test('a relationship added between polls appears without a reload', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE],
    });

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('board-edge')).toHaveCount(1);

    mock.setRelationships([PARTNER_EDGE, FRIEND_EDGE]);
    await expect(page.getByTestId('board-edge')).toHaveCount(2);
    await expect(page.locator('[data-testid="board-edge"][data-type-code="F"]')).toHaveAttribute(
      'stroke',
      '#6BCB77',
    );
  });
});
