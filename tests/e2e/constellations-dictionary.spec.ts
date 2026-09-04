import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4807-B1 — the relationship + goal-card dictionary. The operator asked for a
 * dictionary of the relationships and the victory condition to achieve each,
 * sitting next to "Read the rules" / "Leave room", reached by the same in-place
 * flip (#4811). This spec drives the board with a mocked backend (no
 * aspirant-server): it flips to the dictionary, asserts the six-type legend and
 * the 16 server-sourced goal cards render with their victory conditions, and
 * checks the flip does not disturb the existing "Read the rules" face.
 */

const ROOM_CODE = 'ABCDE';

const TYPE_ROWS = [
  { ID: 1, code: 'P', label: 'Partner', colour: '#FF6B6B' },
  { ID: 2, code: 'D', label: 'Date', colour: '#FFA94D' },
  { ID: 3, code: 'F+', label: 'Friends with benefits', colour: '#C792EA' },
  { ID: 4, code: 'F', label: 'Friend', colour: '#6BCB77' },
  { ID: 5, code: 'A', label: 'Affair', colour: '#4D96FF' },
  { ID: 6, code: 'R', label: 'Rejection', colour: '#ADB5BD' },
];

// A representative slice of the A1 deck, plus enough rows to total 16 so the
// "all cards render" assertion is meaningful. The exact text mirrors the
// server seed (constellation_goal_card.go).
const GOAL_CARDS = [
  { ID: 1, code: 'v', name: 'V', victory_condition: 'Obtain two F+/dates/partners. These two players must NOT share a date/partner/F+ relationship with each other.', min_players: null },
  { ID: 2, code: 'triad', name: 'TRIAD', victory_condition: 'Obtain two F+/dates/partners. These two players MUST share a date/partner/F+ relationship with each other.', min_players: null },
  { ID: 3, code: 'quad', name: 'quad', victory_condition: 'Obtain three dates/partners. They must not have rejections between each other. (Not playable with less than 6 players.)', min_players: 6 },
  { ID: 4, code: 'monogamy', name: 'monogamy', victory_condition: '4 players: one partner and one friend. 5+ players: one partner and two friends. Neither you nor your partner can have any other dates/F+/partners.', min_players: null },
  { ID: 5, code: 'single', name: 'SINGLE', victory_condition: '4 players: two friends and one rejection. 5+ players: two friends and two rejections. You must NOT have any F+/dates/partners/affairs.', min_players: null },
  { ID: 6, code: 'kitchen_table_polyamory', name: 'KITCHEN TABLE POLYAMORY', victory_condition: 'Obtain at least two dates/partners/F+. Your dates/partners/F+ must be connected but not by a rejection.', min_players: null },
  { ID: 7, code: 'unethical_non_monogamy', name: 'UNETHICAL NON-MONOGAMY', victory_condition: 'Obtain one F+/date/partner and one affair.', min_players: null },
  { ID: 8, code: 'hierarchical_polyamory', name: 'HIERARCHICAL POLYAMORY', victory_condition: 'Obtain one F+, one date, and one partner. You may NOT have multiple relationships of the same type, aside from friends. (Not playable with less than 6 players.)', min_players: 6 },
  { ID: 9, code: 'polygamy', name: 'polygamy', victory_condition: 'Obtain at least two partners. These partners must not have date/partner/F+ relationships with anyone but you.', min_players: null },
  { ID: 10, code: 'relationship_anarchy', name: 'RELATIONSHIP ANARCHY', victory_condition: 'Obtain a relationship with at least three other players. You must not have rejections.', min_players: null },
  { ID: 11, code: 'unicorn_hunter', name: 'unicorn hunter', victory_condition: 'Obtain one partner FIRST, then one date. Your date and your partner must be dating as well.', min_players: null },
  { ID: 12, code: 'the_cheater', name: 'THE CHEATER', victory_condition: 'Obtain one F+/date/partner and two affairs.', min_players: null },
  { ID: 13, code: 'open_relationship', name: 'open relationship', victory_condition: 'Obtain three F+/dates/partners. You must not have rejections.', min_players: null },
  { ID: 14, code: 'unicorn', name: 'UNICORN', victory_condition: 'Obtain two dates who share a F+/date/partner relationship.', min_players: null },
  { ID: 15, code: 'unethical_polycurious', name: 'UNETHICAL POLYCURIOUS', victory_condition: 'Obtain two F+/dates and one affair.', min_players: null },
  { ID: 16, code: 'the_escalator', name: 'THE ESCALATOR', victory_condition: 'Obtain two relationships of any kind, but one of these must escalate at some point: F -> F+ -> D -> P.', min_players: null },
];

async function installDictionaryMock(page: Page) {
  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });
  // Bare catch-all first; specific handlers below win (later route wins).
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/constellations/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (/\/constellations\/rooms\/[^/]+\/join$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2, slot: 1 }),
      });
      return;
    }
    if (/\/constellations\/relationship-types$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationship_types: TYPE_ROWS }) });
      return;
    }
    if (/\/constellations\/goal-cards$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goal_cards: GOAL_CARDS }) });
      return;
    }
    if (/\/constellations\/rooms\/[^/]+\/state$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2,
          members: [{ user_id: 1 }, { user_id: 2 }], relationships: [], dice: null, history_cursor: null, goal: null,
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('#4807-B1 Constellations dictionary', () => {
  test('flips to the dictionary and renders the legend + all 16 goal cards', async ({ page }) => {
    await seedTrustedSession(page);
    await installDictionaryMock(page);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const board = page.getByTestId('board-canvas');
    await expect(board).not.toHaveClass(/is-flipped/);

    // #4848: the dictionary ("Cards") is reached from the icon nav now.
    await page.getByTestId('room-nav-dictionary').click();

    // The board flips in place (no navigation) and the dictionary face shows.
    await expect(board).toHaveClass(/is-flipped/);
    await expect(page).toHaveURL(new RegExp(`/room/${ROOM_CODE}$`));
    await expect(page.getByTestId('dictionary-face')).toBeVisible();
    await expect(page.getByTestId('room-nav-dictionary')).toHaveAttribute('aria-pressed', 'true');

    // The six connection types form the legend, their names ALL CAPS (#4883
    // item 7 — the seeded labels are "Partner" / "Friends with benefits", so
    // this asserts the client's rendering, not the seed).
    const legend = page.getByTestId('dictionary-legend');
    await expect(legend.locator('li')).toHaveCount(6);
    await expect(legend.locator('li[data-type-code="P"]')).toContainText('PARTNER');
    await expect(legend.locator('li[data-type-code="F+"]')).toContainText('FRIENDS WITH BENEFITS');

    // All 16 goal cards render, each with its name and victory condition.
    await expect(page.getByTestId('dictionary-cards').locator('li')).toHaveCount(16);
    await expect(page.getByText('THE ESCALATOR')).toBeVisible();
    await expect(page.getByText('Obtain one F+/date/partner and two affairs.')).toBeVisible();
    // The V card — the one the text-only extraction had dropped — is present.
    await expect(page.getByTestId('dictionary-cards').locator('li[data-goal-code="v"]')).toBeVisible();

    // #4945 item 4: goal-card names render ALL CAPS too (the operator's
    // "Monogamy" example). The seed name here is lowercase 'monogamy', so this
    // pins the client's uppercasing, not the fixture.
    const monogamyName = page
      .locator('li[data-goal-code="monogamy"]')
      .getByTestId('goal-card-name');
    await expect(monogamyName).toHaveText('MONOGAMY');

    // Flipping back returns to the game (tap the active control again).
    await page.getByTestId('room-nav-dictionary').click();
    await expect(board).not.toHaveClass(/is-flipped/);
    await expect(page.getByTestId('room-nav-dictionary')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the dictionary and the rulebook are separate faces of the same flip', async ({ page }) => {
    await seedTrustedSession(page);
    await installDictionaryMock(page);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const board = page.getByTestId('board-canvas');

    // Read the rules still flips to the rulebook (regression on #4811).
    await page.getByTestId('room-nav-rules').click();
    await expect(board).toHaveClass(/is-flipped/);
    await expect(page.getByTestId('rules-face')).toBeVisible();
    await expect(page.getByTestId('dictionary-face')).toHaveCount(0);

    // Switching to the dictionary swaps the back face; the rulebook is gone.
    await page.getByTestId('room-nav-dictionary').click();
    await expect(board).toHaveClass(/is-flipped/);
    await expect(page.getByTestId('dictionary-face')).toBeVisible();
    await expect(page.getByTestId('rules-face')).toHaveCount(0);
  });
});
