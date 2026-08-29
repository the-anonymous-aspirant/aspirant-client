import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4518 (#4246-C11) — GameTimeline's Item Details modal is `AspModal`.
 *
 * It was the one of the C11 cluster's three sites that IS a dialog: a modal
 * overlay showing an item's name (heading) and description (plus an optional
 * Wikipedia link). The census this rests on found it, like the other eleven
 * hand-rolled scrims, with `role="dialog"` 0, `aria-modal` 0, focus trap 0 and
 * no Escape. (The cluster's other two — ThirtyYearGift's QR reveal and
 * NodeDetailPanel's side sheet — are sited holds, not ports; see task #4518.)
 *
 * What is asserted is the AT outcome, not that a component mounted: a dialog
 * role, an accessible name equal to the item's own name, focus that lands
 * inside, Escape closing, and — the §4.13 negative control — a Back gesture
 * that UNWINDS the pushed history entry (a second Back then leaves the route),
 * so a port that closes the dialog but orphans its entry fails here rather than
 * passing quietly. `[role="dialog"]` does not exist until the modal opens, so a
 * check that stayed green with the modal shut would not be a guard.
 *
 * GameTimeline is Options API, so Back binds via `overlayHistoryWatch` on the
 * `selectedItem` edge — the directive cannot reach AspModal's teleported root
 * (#4446).
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Land on the route with a real prior entry (/) so a Back gesture has
 *  somewhere to go and cannot be mistaken for a no-op, then start the timeline
 *  game and surface the current item's clickable card. */
async function openTimelineGame(page: Page): Promise<Locator> {
  await seedTrustedSession(page);
  await page.route(/\/api\//, json({}));
  await page.goto('/');
  await dismissMobileSidebarIfPresent(page);
  await page.goto('/quizzes/timeline-tech');
  await dismissMobileSidebarIfPresent(page);
  // First mode button is startGame('timeline'); the second is 'guess'.
  await page.locator('.mode-selector button.mode-btn').first().click();
  const card = page.locator('.current-item-area .item-card.draggable');
  await expect(card).toBeVisible();
  return card;
}

/** The four properties the hand-rolled `.item-modal` did not have. */
async function expectDialogSemantics(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog, 'is announced as a dialog').toBeVisible();
  await expect(dialog, 'is modal to assistive tech').toHaveAttribute('aria-modal', 'true');
  await expect(dialog, 'carries the item name as its accessible name').toHaveAccessibleName(name);
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), {
      message: 'focus lands inside the dialog',
    })
    .toBe(true);
}

test.describe('#4518 GameTimeline Item Details is AspModal', () => {
  test('semantics + Escape: the item card opens a real dialog that Escape closes', async ({ page }) => {
    const card = await openTimelineGame(page);
    const itemName = (await card.locator('.item-name').innerText()).trim();
    expect(itemName.length, 'the seeded timeline has a current item with a name').toBeGreaterThan(0);

    await card.click();
    await expectDialogSemantics(page, itemName);
    // The description renders in the dialog body.
    await expect(page.getByRole('dialog')).toContainText(/\S/);

    // Escape — which did nothing on the hand-rolled overlay.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('Back closes the dialog and unwinds its history entry', async ({ page }) => {
    const card = await openTimelineGame(page);
    const itemName = (await card.locator('.item-name').innerText()).trim();

    await card.click();
    await expectDialogSemantics(page, itemName);

    // One Back closes the dialog without leaving the route...
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/quizzes\/timeline-tech$/);
    // ...and the pushed entry is unwound, so a second Back leaves the route.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/quizzes\/timeline-tech$/);
  });
});
