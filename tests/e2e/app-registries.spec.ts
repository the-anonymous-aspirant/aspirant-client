import { test, expect } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSession,
  seedViewerSession,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/**
 * #4842 — the tile grids on QuizHub, GameHub and AdminView became data-driven
 * registries (an array + v-for) instead of inline <application-card> markup,
 * following the shape Applications.vue and MemberView.vue already use.
 *
 * What these tests pin is the thing a registry refactor can silently break:
 * that every registry row still reaches the DOM, and that the `route` field
 * still drives the click. They are written against rendered titles and URLs,
 * not against the arrays, so they would equally catch a hand-written tile
 * being dropped.
 *
 * The GameHub role case is a behaviour CHANGE, not a lock of existing
 * behaviour: on main the Easter Egg Hunt tile rendered for everyone while
 * router.js gates its route on ['Trusted','Admin'], so an anonymous visitor
 * was offered a card the guard bounced. `anonymous does not see it` fails on
 * main and passes here.
 *
 * No backend runs: the icon fetches (/api/fetch-object/<md5>) simply fail and
 * each card falls back to its placeholder, which is what an unauthenticated
 * visitor sees anyway. The cards under test carry their text regardless.
 */

const QUIZ_TITLES = [
  'RGB Guesser',
  'Personality Test: SQL',
  'Innovation Quiz',
  'People Quiz',
  'Conflict Quiz',
];

// The four AdminView tiles whose destination nginx serves outside the SPA.
const ADMIN_NEW_TAB_TITLES = ['Penpot Design', 'Histoire — Design System', 'System 3', 'Data Lake'];

const ADMIN_ROUTED_TITLES = [
  'Assets',
  'User Resources',
  'Voice Commander',
  'System Health',
  'Advisor',
  'Browser Flows',
];

test.describe('#4842 QuizHub registry', () => {
  test('renders one card per registry row', async ({ page }) => {
    await seedViewerSession(page); // applications require a viewer login (#5113-A3/D1)
    await page.goto('/quizzes');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.quiz-list .application-card');
    await expect(cards).toHaveCount(QUIZ_TITLES.length);
    for (const title of QUIZ_TITLES) {
      await expect(cards.filter({ hasText: title })).toHaveCount(1);
    }
  });

  test("the row's route field still drives the click", async ({ page }) => {
    await seedViewerSession(page);
    await page.goto('/quizzes');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('.application-card', { hasText: 'RGB Guesser' }).click();
    await expect(page).toHaveURL(/\/quizzes\/rbguesser$/);
  });
});

test.describe('#4842 GameHub registry', () => {
  test('a viewer is not offered the member-gated game', async ({ page }) => {
    // Applications require a viewer login (#5113-A3/D1), so GameHub is reached
    // by a viewer, not an anonymous visitor. The member-gated Easter Hunt tile
    // (minTier member) must not be offered to a viewer — the visibleGames tier
    // filter matches the router guard, so no tile the guard would bounce shows.
    await seedViewerSession(page);
    await page.goto('/games');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.game-list .application-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'WordWeaver' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Flappy Duo' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Easter Egg Hunt' })).toHaveCount(0);
  });

  test('a Trusted member is offered it, and the click reaches the route', async ({ page }) => {
    await seedTrustedSession(page);
    await page.goto('/games');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.game-list .application-card');
    await expect(cards).toHaveCount(3);

    await cards.filter({ hasText: 'Easter Egg Hunt' }).click();
    await expect(page).toHaveURL(/\/games\/easter-hunt$/);
  });

  test('a viewer-tier tile routes for a viewer', async ({ page }) => {
    // Since #5113-A3/D1 the games are viewer-tier (no longer anonymous-public),
    // so a viewer reaches the hub and a tile at or below their tier routes.
    await seedViewerSession(page);
    await page.goto('/games');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('.application-card', { hasText: 'WordWeaver' }).click();
    await expect(page).toHaveURL(/\/games\/wordweaver$/);
  });
});

test.describe('#4842 AdminView registry', () => {
  test('renders both grids — 10 app tiles and the Tools tile', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);

    const grids = page.locator('.admin-view .application-list');
    await expect(grids).toHaveCount(2);
    await expect(grids.nth(0).locator('.application-card')).toHaveCount(10);
    await expect(grids.nth(1).locator('.application-card')).toHaveCount(1);

    for (const title of [...ADMIN_ROUTED_TITLES, ...ADMIN_NEW_TAB_TITLES, 'Kvitto Maker']) {
      await expect(page.locator('.application-card').filter({ hasText: title })).toHaveCount(1);
    }
  });

  test('a routed tile pushes in-app', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('.application-card', { hasText: 'User Resources' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test('an nginx-served tile opens a new tab instead of routing', async ({ page }, testInfo) => {
    // window.open under Mobile Safari's emulation does not surface a popup
    // event the same way; the handler split is one shape, asserted on desktop.
    test.skip(testInfo.project.name !== 'chromium', 'popup behaviour asserted on desktop only');
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('.application-card', { hasText: 'Penpot Design' }).click(),
    ]);
    expect(popup.url()).toContain('/admin/penpot/');
    // The admin page itself did not navigate — that is the whole point of the
    // newTab flag, since these paths have no Vue route and would fall into the
    // NotFound catch-all (the #4081 class).
    await expect(page).toHaveURL(/\/admin$/);
    await popup.close();
  });
});
