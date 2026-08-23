import { test, expect } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4184 — the trusted→member IA reshuffle. Two success criteria not covered by
 * the per-app specs: (1) every old /trusted/* bookmark (and the moved
 * /applications/remarkable-pdfs) redirects cleanly to its new
 * /member/{shared,personal}/* target; (2) the sidebar shows "Member" with the
 * Shared / Personal grouping. The router-guard needs a Trusted (or Admin)
 * session or the gated /member/* targets bounce to '/'.
 */

const REDIRECTS: Array<[string, RegExp]> = [
  ['/trusted', /\/member$/],
  ['/trusted/goals', /\/member\/shared\/goals$/],
  ['/trusted/wikipedia', /\/member\/shared\/wikipedia$/],
  ['/trusted/translator', /\/member\/shared\/translator$/],
  ['/trusted/files', /\/member\/shared\/files$/],
  ['/trusted/message-board', /\/member\/shared\/message-board$/],
  ['/trusted/pappas-pushups', /\/member\/personal\/pappas-pushups$/],
  ['/trusted/jobs', /\/member\/personal\/jobs$/],
  ['/trusted/valuation-statement', /\/member\/personal\/valuation-statement$/],
  ['/trusted/30-year-gift', /\/member\/personal\/30-year-gift$/],
  ['/trusted/ludde-analytics', /\/member\/personal\/ludde-analytics$/],
  // RemarkablePdfs moved OUT of /applications into member/shared.
  ['/applications/remarkable-pdfs', /\/member\/shared\/remarkable-pdfs$/],
];

test.describe('#4184 member IA — legacy redirects', () => {
  for (const [from, to] of REDIRECTS) {
    test(`${from} redirects to its /member target`, async ({ page }) => {
      await seedTrustedSession(page);
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }

  test('/trusted/goals/:id carries the tree id through the redirect', async ({ page }) => {
    await seedTrustedSession(page);
    await page.goto('/trusted/goals/42');
    await expect(page).toHaveURL(/\/member\/shared\/goals\/42$/);
  });
});

test.describe('#4184 member IA — sidebar structure', () => {
  test('sidebar shows a single Member link, not a per-app tree (#4198)', async ({ page }, testInfo) => {
    // The layout is one shape; assert it once on desktop chromium (the mobile
    // sidebar is off-canvas and dismissed by the shared helper).
    test.skip(testInfo.project.name !== 'chromium', 'sidebar layout asserted on desktop only');
    await seedTrustedSession(page);
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);

    // Scope to the nav list: the auth-section below it renders the user's role
    // label, which legitimately still reads "Trusted" (the role identifier is
    // unchanged — only the IA moved).
    const nav = page.locator('.nav-links');
    // Renamed entry (not "Trusted") linking to the member index.
    await expect(nav.locator('a[href="/member"]')).toContainText('Member');
    await expect(nav).not.toContainText('Trusted');

    // #4198: the sidebar must NOT expand into a per-app tree — the main-page
    // cards are the app catalog. No sub-nav, no per-app links, no headings,
    // and no user annotations in the sidebar.
    await expect(nav.locator('.member-subnav')).toHaveCount(0);
    await expect(nav.locator('.member-subhead')).toHaveCount(0);
    await expect(nav.locator('a[href="/member/shared/wikipedia"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/member/personal/pappas-pushups"]')).toHaveCount(0);
    await expect(nav).not.toContainText('father');
  });
});
