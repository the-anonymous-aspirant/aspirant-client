import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4883 item 8 — "underneath the screen with the cards, can we have a box for
 * the selected relationship?"
 *
 * The board draws every connection at once, but nothing said what the pair you
 * are currently holding carries; the answer lived only in the edge's SVG
 * <title> tooltip. This box is that answer, under the board and above the
 * controls that change it.
 *
 * Also covers item 7's ALL-CAPS type naming on this surface: the box's whole
 * job is to name the type, so it is the strictest place to assert it.
 *
 * Same in-process page.route() mock family as constellations-panel.spec.ts.
 */

const ROOM_CODE = 'ABCDE';

type Relationship = {
  from_user_id: number;
  to_user_id: number;
  type_id: number;
  type_code: string;
  type_label: string;
  colour: string;
};

const MEMBERS = [
  { user_id: 11, slot: 1, game_username: 'SUPERNOVA', avatar_url: '' },
  { user_id: 12, slot: 2, game_username: 'JIM', avatar_url: '' },
  { user_id: 13, slot: 3, game_username: 'SALLY', avatar_url: '' },
];

const TYPE_ROWS = [
  { ID: 1, code: 'P', label: 'Partner', colour: '#FF6B6B', display_order: 1 },
  { ID: 2, code: 'D', label: 'Date', colour: '#FFA94D', display_order: 2 },
  { ID: 3, code: 'F+', label: 'Friends with benefits', colour: '#C792EA', display_order: 3 },
  { ID: 4, code: 'F', label: 'Friend', colour: '#6BCB77', display_order: 4 },
  { ID: 5, code: 'A', label: 'Affair', colour: '#4D96FF', display_order: 5 },
  { ID: 6, code: 'R', label: 'Rejection', colour: '#ADB5BD', display_order: 6 },
];

// A lower-case-in-the-DB label, on purpose: the ALL-CAPS assertions below have
// to be about the client's rendering, not about how the vocabulary happens to
// be seeded.
const FWB_EDGE: Relationship = {
  from_user_id: 11,
  to_user_id: 12,
  type_id: 3,
  type_code: 'F+',
  type_label: 'Friends with benefits',
  colour: '#C792EA',
};

async function installMock(page: Page, initialRelationships: Relationship[]) {
  const room = { relationships: [...initialRelationships] };

  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });

  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/constellations/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith('/constellations/relationship-types')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ relationship_types: TYPE_ROWS }),
      });
      return;
    }

    if (/\/rooms\/[^/]+\/state$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE,
          player_count: 4,
          status: 'active',
          occupancy: 3,
          members: MEMBERS,
          relationships: room.relationships,
          dice: null,
          history_cursor: null,
        }),
      });
      return;
    }

    if (/\/rooms\/[^/]+\/relationships\/set$/.test(path)) {
      const body = route.request().postDataJSON() as {
        from_user_id: number;
        to_user_id: number;
        type_id: number;
      };
      const t = TYPE_ROWS.find((row) => row.ID === body.type_id)!;
      room.relationships = [
        ...room.relationships.filter(
          (r) =>
            !(
              (r.from_user_id === body.from_user_id && r.to_user_id === body.to_user_id) ||
              (r.from_user_id === body.to_user_id && r.to_user_id === body.from_user_id)
            ),
        ),
        {
          from_user_id: body.from_user_id,
          to_user_id: body.to_user_id,
          type_id: t.ID,
          type_code: t.code,
          type_label: t.label,
          colour: t.colour,
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }

    await route.fulfill({ status: 204, body: '' });
  });
}

async function openRoom(page: Page) {
  await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByTestId('board-graph')).toBeVisible();
}

function avatar(page: Page, userId: number) {
  return page.locator(`[data-testid="board-avatar"][data-user-id="${userId}"]`);
}

test.describe('#4883 Constellations selected-relationship box', () => {
  test('sits below the board and hints what to do while no pair is held', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    const box = page.getByTestId('selected-relationship');
    await expect(box).toBeVisible();
    await expect(page.getByTestId('selected-idle')).toHaveText('Select two players');
    await expect(page.getByTestId('selected-pair')).toHaveCount(0);

    // Under the board, per the ask — geometric, so a re-pin as an overlay fails
    // here even though the DOM order would still read correctly.
    const boardBox = await page.getByTestId('board-canvas').boundingBox();
    const selectedBox = await box.boundingBox();
    expect(boardBox).not.toBeNull();
    expect(selectedBox).not.toBeNull();
    expect(selectedBox!.y).toBeGreaterThanOrEqual(boardBox!.y + boardBox!.height);

    // One player picked is still not a pair. The box NAMES who is held rather
    // than repeating the picker's own "Select one more player" a few pixels
    // below it — the name is the part the board does not otherwise show, since
    // avatar names are hover-only.
    await avatar(page, 11).click();
    await expect(page.getByTestId('selected-idle')).toHaveText('SUPERNOVA — select one more player');
    await expect(page.getByTestId('selected-pair')).toHaveCount(0);
  });

  test('names the pair and their existing connection in ALL CAPS, in the vocabulary colour', async ({
    page,
  }) => {
    await seedTrustedSession(page);
    await installMock(page, [FWB_EDGE]);
    await openRoom(page);

    await avatar(page, 11).click();
    await avatar(page, 12).click();

    const pair = page.getByTestId('selected-pair');
    await expect(pair).toContainText('SUPERNOVA');
    await expect(pair).toContainText('JIM');

    // #4883 item 7 — the DB label is "Friends with benefits"; the surface says
    // FRIENDS WITH BENEFITS.
    const type = page.getByTestId('selected-type');
    await expect(type).toHaveText(/FRIENDS WITH BENEFITS/);
    await expect(type).toHaveCSS('color', 'rgb(199, 146, 234)');
    await expect(page.getByTestId('selected-none')).toHaveCount(0);
  });

  test('a pair with no edge reads as no connection yet, and updates when one is set', async ({
    page,
  }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    // 11 and 13 carry nothing — a different state from "no pair selected".
    await avatar(page, 11).click();
    await avatar(page, 13).click();
    await expect(page.getByTestId('selected-none')).toBeVisible();
    await expect(page.getByTestId('selected-type')).toHaveCount(0);

    // Setting a type resets the selection (the picker closes on a successful
    // edit, #4806 ask 3), so the box returns to its idle hint and the new edge
    // is on the board. Re-picking the pair reads the connection back.
    await page.locator('[data-testid="type-button"][data-type-code="D"]').click();
    await expect(page.getByTestId('board-edge')).toHaveCount(1);
    await expect(page.getByTestId('selected-idle')).toHaveText('Select two players');
    await expect(page.getByTestId('selected-none')).toHaveCount(0);

    await avatar(page, 11).click();
    await avatar(page, 13).click();
    await expect(page.getByTestId('selected-type')).toHaveText(/DATE/);
  });

  test('the box is hidden when the card is flipped to another face', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    await expect(page.getByTestId('selected-relationship')).toBeVisible();
    await page.getByTestId('room-nav-settings').click();
    await expect(page.getByTestId('board-stack')).toHaveCount(0);
    await expect(page.getByTestId('dice-mount')).toHaveCount(0);

    await page.getByTestId('room-nav-game').click();
    await expect(page.getByTestId('selected-relationship')).toBeVisible();
  });
});
