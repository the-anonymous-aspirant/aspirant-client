import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4605 / #4587-F4 — the relationship-status line, re-shaped by #4812 (epic
 * #4806 ask 6: "just fade in and then fade out shortly, a single item at a
 * time, so we don't make a mess of text if multiple people are playing").
 *
 * It used to render EVERY current connection concatenated into one paragraph,
 * so the assertions here changed with the behaviour: a connection announces
 * itself ONCE, alone, when it is made, and the line is empty the rest of the
 * time. What did NOT change is the vocabulary contract — the term is bold and
 * carries its A2-stored colour from the payload, never a frontend constant.
 * Mounted bottom-centre (gate resolved in #4605's design comment, c26480 —
 * the wireframe's POLYAMORY box, not the written spec's bottom-left).
 *
 * Same in-process page.route() state mock as constellations-board.spec.ts —
 * no aspirant-server required.
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
  { user_id: 21, slot: 1, game_username: 'DIANA', avatar_url: '' },
  { user_id: 22, slot: 2, game_username: 'VICTOR', avatar_url: '' },
  { user_id: 23, slot: 3, game_username: 'HANNA', avatar_url: '' },
];

const PARTNER_EDGE: Relationship = {
  from_user_id: 21,
  to_user_id: 22,
  type_id: 1,
  type_code: 'P',
  type_label: 'Partner',
  colour: '#FF6B6B',
};

const DATE_EDGE: Relationship = {
  from_user_id: 22,
  to_user_id: 23,
  type_id: 2,
  type_code: 'D',
  type_label: 'Date',
  colour: '#FFA94D',
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

test.describe('#4605 Constellations relationship status line', () => {
  test('a new connection announces itself with the vocabulary bold in its A2 colour', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    mock.setRelationships([PARTNER_EDGE]);

    const summary = page.getByTestId('summary-text');
    await expect(summary).toContainText('DIANA is partnered with VICTOR');

    const partnerTerm = summary.locator('strong', { hasText: 'partnered' });
    await expect(partnerTerm).toHaveCSS('color', 'rgb(255, 107, 107)'); // #FF6B6B
  });

  // The ask, asserted directly: two connections landing together must not both
  // be on screen. Before #4812 they were concatenated into one paragraph.
  test('two connections landing together show one at a time, not both at once', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    mock.setRelationships([PARTNER_EDGE, DATE_EDGE]);

    const summary = page.getByTestId('summary-text');
    await expect(summary).toContainText('DIANA is partnered with VICTOR');
    // Exactly one item is mounted, and it is not the second sentence.
    await expect(page.getByTestId('summary-item')).toHaveCount(1);
    await expect(summary).not.toContainText('dating');

    // The second dequeues after the first has faded out.
    await expect(summary).toContainText('VICTOR is dating HANNA', { timeout: 8000 });
    await expect(page.getByTestId('summary-item')).toHaveCount(1);
    await expect(summary).not.toContainText('partnered');
  });

  // "fade in and then fade out shortly" — the line does not hold the last
  // message forever, and there is no permanent standing text.
  test('an announced connection fades out, leaving the line empty', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    mock.setRelationships([PARTNER_EDGE]);
    await expect(page.getByTestId('summary-item')).toHaveCount(1);
    await expect(page.getByTestId('summary-item')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('summary-text')).toHaveText('');
  });

  // A player opening a room mid-game must not be replayed the whole graph:
  // the edges already on the board are adopted silently.
  test('connections already on the board when the room opens are not announced', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE, DATE_EDGE],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    // Give the poll several ticks to prove nothing is queued behind the load.
    await expect(page.getByTestId('summary-text')).toBeVisible();
    await page.waitForTimeout(4000);
    await expect(page.getByTestId('summary-item')).toHaveCount(0);
    await expect(page.getByTestId('summary-text')).toHaveText('');
  });

  // Re-typing a pair is news; a poll that repeats an unchanged edge is not.
  test('re-typing an existing pair announces again, an unchanged poll does not', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    // Seeded silently, and repeated polls of the same edge stay silent.
    await page.waitForTimeout(4000);
    await expect(page.getByTestId('summary-item')).toHaveCount(0);

    // Same pair, new type — a change, so it announces.
    mock.setRelationships([{ ...DATE_EDGE, from_user_id: 21, to_user_id: 22 }]);
    await expect(page.getByTestId('summary-text')).toContainText('DIANA is dating VICTOR');
  });
});
