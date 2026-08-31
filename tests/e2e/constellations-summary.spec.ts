import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4605 / #4587-F4 — the relationship-summary prose. Covers the F4 acceptance:
 * the summary reflects the live graph and renders each connection's
 * vocabulary term bold, in its A2-stored colour. Mounted bottom-centre
 * (gate resolved in #4605's design comment, c26480 — the wireframe's
 * POLYAMORY box, not the written spec's bottom-left).
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

test.describe('#4605 Constellations relationship summary', () => {
  test('renders one sentence per relationship with the vocabulary bold in its A2 colour', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE, DATE_EDGE],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const summary = page.getByTestId('summary-text');
    await expect(summary).toContainText('DIANA is partnered with VICTOR');
    await expect(summary).toContainText('VICTOR is dating HANNA');

    const partnerTerm = summary.locator('strong', { hasText: 'partnered' });
    await expect(partnerTerm).toHaveCSS('color', 'rgb(255, 107, 107)'); // #FF6B6B
    const dateTerm = summary.locator('strong', { hasText: 'dating' });
    await expect(dateTerm).toHaveCSS('color', 'rgb(255, 169, 77)'); // #FFA94D
  });

  test('shows an empty state when the graph has no relationships', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, {
      occupancy: 2,
      player_count: 4,
      members: MEMBERS,
      relationships: [],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('summary-text')).toHaveText('No connections yet.');
  });

  test('a relationship added between polls appears in the summary without a reload', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, {
      occupancy: 3,
      player_count: 4,
      members: MEMBERS,
      relationships: [PARTNER_EDGE],
    });

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const summary = page.getByTestId('summary-text');
    await expect(summary).toContainText('DIANA is partnered with VICTOR');
    await expect(summary).not.toContainText('dating');

    mock.setRelationships([PARTNER_EDGE, DATE_EDGE]);
    await expect(summary).toContainText('VICTOR is dating HANNA');
  });
});
