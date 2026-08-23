import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers #4172: the browser/OS Back gesture (swipe-back on iOS Safari /
 *  Android Chrome, the Android back button, the browser back control) closes
 *  the top-most open overlay first, leaving the user on the underlying screen,
 *  instead of navigating away. A second Back then navigates as before.
 *
 *  Runs on both configured projects — chromium (Desktop Chrome) and
 *  mobile-safari (iPhone 13) — so the mobile swipe-back path is exercised too;
 *  Playwright's page.goBack() drives the same history traversal the gesture
 *  fires. The overlay integration is a directive (v-overlay-history) applied to
 *  every v-if-gated overlay scrim; Goals is the worked example (three dialogs),
 *  and its mechanism is shared by every other retrofitted overlay.
 *
 *  The Go backend is mocked per-test (the app runs against the built SPA with
 *  no server). GET /api/goals/trees returns the tree list array directly. */

interface Tree {
  id: number;
  name: string;
  updated_at?: string;
}

/** Mock the goal-trees list. Returns the array verbatim (Goals sets
 *  this.trees = resp.data). */
async function mockTrees(page: Page, trees: Tree[] = []): Promise<void> {
  await page.route(/\/api\/goals\/trees$/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(trees),
    }),
  );
}

/** Land on /member/shared/goals with a real prior history entry (/) so a Back gesture
 *  has somewhere to go, and clear the mobile sidebar so buttons are clickable. */
async function openGoals(page: Page, trees: Tree[] = []): Promise<void> {
  await seedTrustedSession(page);
  await mockTrees(page, trees);
  await page.goto('/');
  await dismissMobileSidebarIfPresent(page);
  await page.goto('/member/shared/goals');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Goal Trees' })).toBeVisible();
}

test.describe('overlay back-gesture (#4172)', () => {
  test('Back closes an open dialog and keeps the user on the page', async ({ page }) => {
    await openGoals(page);

    await page.getByRole('button', { name: /New Tree/ }).click();
    await expect(page.locator('.dialog-overlay')).toBeVisible();

    // The browser Back gesture closes the dialog — it does NOT leave the page.
    await page.goBack();
    await expect(page.locator('.dialog-overlay')).toBeHidden();
    await expect(page).toHaveURL(/\/member\/shared\/goals$/);
    await expect(page.getByRole('heading', { name: 'Goal Trees' })).toBeVisible();
  });

  test('a second Back, after the overlay is closed, navigates away', async ({ page }) => {
    await openGoals(page);

    await page.getByRole('button', { name: /New Tree/ }).click();
    await expect(page.locator('.dialog-overlay')).toBeVisible();

    await page.goBack(); // closes the dialog
    await expect(page.locator('.dialog-overlay')).toBeHidden();
    await expect(page).toHaveURL(/\/member\/shared\/goals$/);

    await page.goBack(); // now leaves the screen
    await expect(page).not.toHaveURL(/\/member\/shared\/goals/);
  });

  test('manual close unwinds the pushed history — Back then leaves the page (no orphan entry)', async ({
    page,
  }) => {
    await openGoals(page);

    await page.getByRole('button', { name: /New Tree/ }).click();
    await expect(page.locator('.dialog-overlay')).toBeVisible();

    // Close via the Cancel button (the same handler the scrim uses). This must
    // unwind the history entry the open pushed, so a subsequent Back leaves the
    // page rather than re-opening the just-closed dialog.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.dialog-overlay')).toBeHidden();
    // let the directive's unmount → history.back() unwind settle (same URL, so
    // there is no navigation event to await).
    await page.waitForTimeout(200);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/member\/shared\/goals/);
  });

  test('the same behavior applies to another overlay (delete-confirm dialog)', async ({ page }) => {
    await openGoals(page, [{ id: 1, name: 'Tree A', updated_at: '2026-08-01T00:00:00Z' }]);

    // Open the delete-confirm dialog from the tree row.
    await page.locator('button[title="Delete"]').click();
    await expect(page.locator('.dialog-overlay')).toBeVisible();
    await expect(page.locator('.dialog-overlay')).toContainText('Tree A');

    await page.goBack();
    await expect(page.locator('.dialog-overlay')).toBeHidden();
    await expect(page).toHaveURL(/\/member\/shared\/goals$/);
  });
});
