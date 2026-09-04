import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4807-B2 — goal selection + private goal state + achievement indicator. The
 * operator's ask: "a clickable button to select if that is your goal, and for
 * the game to automatically detect if you have achieved that goal." Detection is
 * server-side (A2) and surfaces as /state.goal.achieved; this spec drives the
 * client half against a mocked backend that folds the set/clear call into the
 * goal it returns on the next poll.
 */

const ROOM_CODE = 'ABCDE';
const TYPE_ROWS = [
  { ID: 1, code: 'P', label: 'Partner', colour: '#FF6B6B' },
  { ID: 2, code: 'D', label: 'Date', colour: '#FFA94D' },
];
const GOAL_CARDS = [
  { ID: 1, code: 'v', name: 'V', victory_condition: 'Obtain two F+/dates/partners...', min_players: null },
  { ID: 2, code: 'triad', name: 'TRIAD', victory_condition: 'Obtain two F+/dates/partners...', min_players: null },
];

// Installs a stateful mock: the goal the caller sets is echoed back in the next
// /state poll (private to them), and the test can force it achieved.
function installGoalMock(page: Page, opts: { achieved?: boolean } = {}) {
  const store: { goal: null | { card_id: number; code: string; name: string; victory_condition: string; achieved: boolean } } = { goal: null };
  const setCalls: number[] = [];
  const clearCalls: number[] = [];

  const install = async () => {
    await page.route(/qrserver\.com/, (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
    await page.route(/\/api\//, (r: Route) => r.fulfill({ status: 204, body: '' }));
    await page.route('**/api/constellations/**', async (route: Route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (/\/rooms\/[^/]+\/join$/.test(url.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2, slot: 1 }) });
      }
      if (/\/relationship-types$/.test(url.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationship_types: TYPE_ROWS }) });
      }
      if (/\/goal-cards$/.test(url.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goal_cards: GOAL_CARDS }) });
      }
      if (/\/goal\/set$/.test(url.pathname) && method === 'POST') {
        const body = route.request().postDataJSON() as { goal_card_id: number };
        setCalls.push(body.goal_card_id);
        const card = GOAL_CARDS.find((c) => c.ID === body.goal_card_id)!;
        store.goal = { card_id: card.ID, code: card.code, name: card.name, victory_condition: card.victory_condition, achieved: !!opts.achieved };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goal_card_id: card.ID, code: card.code, name: card.name }) });
      }
      if (/\/goal\/clear$/.test(url.pathname) && method === 'POST') {
        clearCalls.push(1);
        store.goal = null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cleared: true }) });
      }
      if (/\/rooms\/[^/]+\/state$/.test(url.pathname)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: ROOM_CODE, player_count: 4, status: 'active', occupancy: 2, members: [{ user_id: 1 }, { user_id: 2 }], relationships: [], dice: null, history_cursor: null, goal: store.goal }),
        });
      }
      return route.fulfill({ status: 204, body: '' });
    });
  };
  return { install, setCalls, clearCalls };
}

async function openDictionary(page: Page) {
  await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
  await dismissMobileSidebarIfPresent(page);
  await page.getByTestId('room-nav-dictionary').click();
  await page.getByTestId('dictionary-face').waitFor({ state: 'visible' });
}

test.describe('#4807-B2 Constellations goal selection', () => {
  test('selecting a goal calls the endpoint and marks it as mine on the next poll', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = installGoalMock(page);
    await mock.install();

    await openDictionary(page);
    // Every card offers a select button until one is chosen.
    const firstSelect = page.getByTestId('goal-card-select').first();
    await firstSelect.click();

    // The V card (id 1) becomes mine; its "Your goal" marker and a Clear appear.
    const vCard = page.locator('li[data-goal-code="v"]');
    await expect(vCard.getByTestId('goal-card-mine')).toBeVisible();
    await expect(vCard.getByTestId('goal-card-clear')).toBeVisible();
    expect(mock.setCalls).toContain(1);

    // Clearing it returns the card to the select affordance.
    await vCard.getByTestId('goal-card-clear').click();
    await expect(vCard.getByTestId('goal-card-select')).toBeVisible();
    expect(mock.clearCalls.length).toBe(1);
  });

  // #4945 item 6: the chosen goal sorts to the top of the deck (so it never
  // has to be scrolled to) and carries a distinct highlight. Selecting the
  // SECOND card must move it to the front.
  test('the chosen goal sorts to the top of the deck and is highlighted', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = installGoalMock(page);
    await mock.install();

    await openDictionary(page);
    const cards = page.getByTestId('dictionary-cards').locator('li');
    // Before selection the deck is in server order: V, then TRIAD.
    await expect(cards.first()).toHaveAttribute('data-goal-code', 'v');

    // Choose the second card (TRIAD, id 2).
    await page.locator('li[data-goal-code="triad"]').getByTestId('goal-card-select').click();

    // It moves to the front and reads as selected.
    await expect(cards.first()).toHaveAttribute('data-goal-code', 'triad');
    await expect(cards.first()).toHaveClass(/is-selected/);
    await expect(cards.first().getByTestId('goal-card-mine')).toBeVisible();
    expect(mock.setCalls).toContain(2);
  });

  test('an achieved goal shows the achievement badge', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = installGoalMock(page, { achieved: true });
    await mock.install();

    await openDictionary(page);
    await page.getByTestId('goal-card-select').first().click();

    const vCard = page.locator('li[data-goal-code="v"]');
    await expect(vCard.getByTestId('goal-achieved-badge')).toBeVisible();
    await expect(vCard).toHaveClass(/is-achieved/);
  });

  test('a player with no selected goal sees only select buttons (privacy)', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = installGoalMock(page);
    await mock.install();

    await openDictionary(page);
    // Nothing is marked as mine when /state carries goal:null.
    await expect(page.getByTestId('goal-card-mine')).toHaveCount(0);
    await expect(page.getByTestId('goal-card-select')).toHaveCount(GOAL_CARDS.length);
  });
});
