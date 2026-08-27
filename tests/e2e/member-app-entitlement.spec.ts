import { test, expect, type Page } from '@playwright/test';
import {
  seedTrustedSession,
  seedTrustedSessionAs,
  seedAdminSession,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/** Covers system_3 #4331 — the operator reported that Robert, logged in on
 *  /member, saw all five personal apps (Ludde, Väggen, Värdeutlåtande, Jobs,
 *  Pappas pushups) when he owns only Pappas pushups.
 *
 *  The index used to render the whole PERSONAL_APPS roster with no identity
 *  check, so every Trusted member advertised every other member's app. The
 *  server already 403s a non-owner on the gated routes (routes.go's
 *  ValidateUserOrAdmin), so what was leaking is visibility, not data — and
 *  visibility is what these tests pin.
 *
 *  The owner map under test (src/views/member/apps.js): ludde-analytics,
 *  30-year-gift and valuation-statement → jenny; pappas-pushups → robert;
 *  jobs → vinoly.
 */

const ALL_PERSONAL = [
  'Ludde Meal Tracker',
  'Den Stökiga Väggen',
  'Värdeutlåtande',
  'Pappas pushups',
  'Jobs',
];

const SHARED_SAMPLE = ['Files', 'Message Board', 'Goal Trees', 'Scratchpad'];

async function openMember(page: Page): Promise<void> {
  await page.goto('/member');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Member', level: 1 })).toBeVisible();
}

/** Asserts the personal cards on the index are exactly `expected`. Card titles
 *  are read from the DOM rather than probed one at a time so an app that leaks
 *  back in fails the test by appearing in the list, not by being unasserted. */
async function personalCardTitles(page: Page): Promise<string[]> {
  const section = page.locator('[data-test="member-personal-section"]');
  if ((await section.count()) === 0) return [];
  return (await section.locator('.application-card .card-content h2').allTextContents())
    .map((t) => t.trim())
    .filter(Boolean);
}

test.describe('#4331 /member personal apps are filtered to their owner', () => {
  test('robert sees Pappas pushups and nothing else personal', async ({ page }) => {
    await seedTrustedSessionAs(page, 'robert');
    await openMember(page);

    expect(await personalCardTitles(page)).toEqual(['Pappas pushups']);
    for (const title of ALL_PERSONAL.filter((t) => t !== 'Pappas pushups')) {
      await expect(page.locator('.application-card', { hasText: title })).toHaveCount(0);
    }
  });

  test('jenny sees her three and not robert or vinoly apps', async ({ page }) => {
    await seedTrustedSessionAs(page, 'jenny');
    await openMember(page);

    expect((await personalCardTitles(page)).sort()).toEqual(
      ['Den Stökiga Väggen', 'Ludde Meal Tracker', 'Värdeutlåtande'].sort(),
    );
    await expect(page.locator('.application-card', { hasText: 'Pappas pushups' })).toHaveCount(0);
    await expect(page.locator('.application-card', { hasText: 'Jobs' })).toHaveCount(0);
  });

  test('vinoly sees Jobs only', async ({ page }) => {
    await seedTrustedSessionAs(page, 'vinoly');
    await openMember(page);

    expect(await personalCardTitles(page)).toEqual(['Jobs']);
  });

  test('a Trusted member who owns nothing gets no Personal section at all', async ({ page }) => {
    // seedTrustedSession is the generic `e2e-tester`, in the map as nobody.
    await seedTrustedSession(page);
    await openMember(page);

    await expect(page.locator('[data-test="member-personal-section"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Personal' })).toHaveCount(0);
    for (const title of ALL_PERSONAL) {
      await expect(page.locator('.application-card', { hasText: title })).toHaveCount(0);
    }
  });

  test('an Admin sees the whole estate, mirroring ValidateUserOrAdmin', async ({ page }) => {
    await seedAdminSession(page);
    await openMember(page);

    expect((await personalCardTitles(page)).sort()).toEqual([...ALL_PERSONAL].sort());
  });

  test('the shared roster is untouched for a member who owns no personal app', async ({ page }) => {
    await seedTrustedSession(page);
    await openMember(page);

    for (const title of SHARED_SAMPLE) {
      await expect(page.locator('.application-card', { hasText: title })).toBeVisible();
    }
  });
});
