import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4603 / #4587-F2 — the relationship control panel + edit interaction.
 * Covers the F2 acceptance: selecting two avatars enables the P/D/F+/F/A/R
 * controls, choosing a type calls B1 `set` and the edge draws from the
 * refreshed state without a reload, Clear removes it, and the back/forward
 * arrows call C1 undo/redo.
 *
 * Same in-process page.route() mock family as constellations-board.spec.ts.
 * The vocabulary GET serves gorm-shaped rows ("ID" from the untagged
 * gorm.Model, lowercase tagged fields) to pin the client's normalization.
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

const MEMBERS: Member[] = [
  { user_id: 11, slot: 1, game_username: 'SUPERNOVA', avatar_url: '' },
  { user_id: 12, slot: 2, game_username: 'JIM', avatar_url: '' },
  { user_id: 13, slot: 3, game_username: 'SALLY', avatar_url: '' },
];

// gorm-shaped vocabulary rows as the server serializes them.
const TYPE_ROWS = [
  { ID: 1, code: 'P', label: 'Partner', colour: '#FF6B6B', display_order: 1 },
  { ID: 2, code: 'D', label: 'Date', colour: '#FFA94D', display_order: 2 },
  { ID: 3, code: 'F+', label: 'Friends with benefits', colour: '#C792EA', display_order: 3 },
  { ID: 4, code: 'F', label: 'Friend', colour: '#6BCB77', display_order: 4 },
  { ID: 5, code: 'A', label: 'Affair', colour: '#4D96FF', display_order: 5 },
  { ID: 6, code: 'R', label: 'Rejection', colour: '#ADB5BD', display_order: 6 },
];

const PARTNER_EDGE: Relationship = {
  from_user_id: 11,
  to_user_id: 12,
  type_id: 1,
  type_code: 'P',
  type_label: 'Partner',
  colour: '#FF6B6B',
};

type Captured = { set: unknown[]; clear: unknown[]; undo: number; redo: number };

async function installMock(page: Page, initialRelationships: Relationship[]) {
  const room = { relationships: [...initialRelationships] };
  const captured: Captured = { set: [], clear: [], undo: 0, redo: 0 };

  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });

  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/constellations/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

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
      captured.set.push(body);
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

    if (/\/rooms\/[^/]+\/relationships\/clear$/.test(path)) {
      const body = route.request().postDataJSON() as { from_user_id: number; to_user_id: number };
      captured.clear.push(body);
      room.relationships = room.relationships.filter(
        (r) =>
          !(
            (r.from_user_id === body.from_user_id && r.to_user_id === body.to_user_id) ||
            (r.from_user_id === body.to_user_id && r.to_user_id === body.from_user_id)
          ),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cleared: true }),
      });
      return;
    }

    if (/\/rooms\/[^/]+\/relationships\/undo$/.test(path)) {
      captured.undo += 1;
      // Simulate reverting the last set: drop the newest edge.
      room.relationships = room.relationships.slice(0, -1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ relationships: room.relationships, applied: true }),
      });
      return;
    }

    if (/\/rooms\/[^/]+\/relationships\/redo$/.test(path)) {
      captured.redo += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ relationships: room.relationships, applied: false }),
      });
      return;
    }

    await route.fulfill({ status: 204, body: '' });
  });

  return captured;
}

async function openRoom(page: Page) {
  await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByTestId('board-graph')).toBeVisible();
}

function avatar(page: Page, userId: number) {
  return page.locator(`[data-testid="board-avatar"][data-user-id="${userId}"]`);
}

test.describe('#4603 Constellations relationship control panel', () => {
  // #4806 ask 3 — the picker used to render unconditionally, standing on the
  // board with every button disabled. It is now scoped to a live selection.
  test('the pair picker is absent until a player is clicked, then renders the six A2 type buttons plus Clear', async ({
    page,
  }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    const typeButtons = page.getByTestId('type-button');
    await expect(page.getByTestId('pair-picker')).toHaveCount(0);
    await expect(typeButtons).toHaveCount(0);
    await expect(page.getByTestId('panel-hint')).toHaveCount(0);
    await expect(page.getByTestId('clear-button')).toHaveCount(0);

    // One selected — the picker appears; the edit buttons wait for the pair.
    await avatar(page, 11).click();
    await expect(page.getByTestId('pair-picker')).toBeVisible();
    await expect(typeButtons).toHaveCount(6);
    await expect(typeButtons.first()).toHaveText(/P/);
    await expect(typeButtons.first()).toBeDisabled();
    await expect(page.getByTestId('clear-button')).toBeDisabled();

    // Two — enabled.
    await avatar(page, 12).click();
    await expect(typeButtons.first()).toBeEnabled();
    await expect(page.getByTestId('clear-button')).toBeEnabled();
  });

  // The regression lock for the trap in ask 3: the C1 arrows are board-scoped,
  // not part of the select-two-players gesture. Hiding them with the picker
  // would put undo out of reach exactly when it is wanted — right after a
  // mis-click that has already been committed and deselected.
  test('the history arrows stay reachable with no selection in progress', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    await expect(page.getByTestId('pair-picker')).toHaveCount(0);
    await expect(page.getByTestId('undo-button')).toBeVisible();
    await expect(page.getByTestId('redo-button')).toBeVisible();
    await expect(page.getByTestId('undo-button')).toBeEnabled();
  });

  test('the hint tracks how many players are selected', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, []);
    await openRoom(page);

    await avatar(page, 11).click();
    // Not "Select two players" — you have already selected one, and the panel
    // only exists because you did.
    await expect(page.getByTestId('panel-hint')).toHaveText('Select one more player');

    await avatar(page, 12).click();
    await expect(page.getByTestId('panel-hint')).toHaveText('Set the pair’s connection');
  });

  test('the picker can be dismissed without editing', async ({ page }) => {
    await seedTrustedSession(page);
    const captured = await installMock(page, []);
    await openRoom(page);

    await avatar(page, 11).click();
    await expect(page.getByTestId('pair-picker')).toBeVisible();

    await page.getByTestId('dismiss-picker').click();
    await expect(page.getByTestId('pair-picker')).toHaveCount(0);
    expect(captured.set).toEqual([]);
    expect(captured.clear).toEqual([]);
  });

  test('choosing a type POSTs set for the selected pair and draws the edge live', async ({ page }) => {
    await seedTrustedSession(page);
    const captured = await installMock(page, []);
    await openRoom(page);

    await avatar(page, 11).click();
    await avatar(page, 12).click();
    await page.locator('[data-testid="type-button"][data-type-code="P"]').click();

    await expect(page.getByTestId('board-edge')).toHaveCount(1);
    await expect(page.locator('[data-testid="board-edge"][data-type-code="P"]')).toHaveAttribute(
      'stroke',
      '#FF6B6B',
    );
    expect(captured.set).toEqual([{ from_user_id: 11, to_user_id: 12, type_id: 1 }]);

    // The selection resets after a successful edit, and no error is shown
    // (guards the refresh-not-destructured ReferenceError class of bug, where
    // the POST succeeds but the post-edit refresh throws into the catch).
    // Since #4806 ask 3 the reset also CLOSES the picker — it does not linger
    // on the board with its buttons disabled again.
    await expect(page.getByTestId('pair-picker')).toHaveCount(0);
    await expect(page.getByTestId('edit-error')).toHaveCount(0);
  });

  test('Clear POSTs clear for the pair and removes the edge', async ({ page }) => {
    await seedTrustedSession(page);
    const captured = await installMock(page, [PARTNER_EDGE]);
    await openRoom(page);

    await expect(page.getByTestId('board-edge')).toHaveCount(1);
    await avatar(page, 11).click();
    await avatar(page, 12).click();
    await page.getByTestId('clear-button').click();

    await expect(page.getByTestId('board-edge')).toHaveCount(0);
    expect(captured.clear).toEqual([{ from_user_id: 11, to_user_id: 12 }]);
  });

  test('the history arrows call undo and redo and re-render the graph', async ({ page }) => {
    await seedTrustedSession(page);
    const captured = await installMock(page, [PARTNER_EDGE]);
    await openRoom(page);

    await expect(page.getByTestId('board-edge')).toHaveCount(1);
    await page.getByTestId('undo-button').click();
    await expect(page.getByTestId('board-edge')).toHaveCount(0);
    expect(captured.undo).toBe(1);

    await page.getByTestId('redo-button').click();
    await expect
      .poll(() => captured.redo, { message: 'redo endpoint called' })
      .toBe(1);
  });
});
