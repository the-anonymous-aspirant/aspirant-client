import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4517 (#4246-C10) — the goals-cluster dialog overlays are `AspModal`.
 *
 * Census this rests on (whole-repo greps over `src/**` before this task):
 * `role="dialog"` 0, `aria-modal` 0, focus trap 0, Escape-to-close 0 across all
 * twelve hand-rolled scrims. This cluster ports seven of them — three in
 * `Goals.vue` (Options API, `overlayHistoryWatch`), three in `TreeSwitcher.vue`
 * and one in `GoalTreeCanvas.vue` (both `setup()`, `useOverlayHistory`).
 *
 * What is asserted is the OUTCOME an AT user gets — a dialog role, an accessible
 * name, focus that lands inside and stays, Escape and Back both closing through
 * one state — not that a component is mounted. A rewrite that kept the behaviour
 * stays green; a port that mounts `AspModal` and drops Back does not.
 *
 * Negative control (§4.13): every semantics assertion addresses `[role="dialog"]`,
 * which does not exist in the DOM until the dialog opens. A check that would
 * stay green if the dialog never opened is not a guard — the role node's
 * absence-until-open is what makes these real. The Back cases go one step
 * further: they assert the pushed history entry is UNWOUND (one more Back leaves
 * the route), so a port that closes the dialog but orphans its entry — the
 * failure the state-edge binding exists to prevent — fails here rather than
 * passing quietly.
 */

const TREES = [
  { id: 1, name: 'Tree A', updated_at: '2026-07-01T09:00:00Z' },
  { id: 2, name: 'Tree B', updated_at: '2026-07-02T09:00:00Z' },
];

const arr = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function seedGoals(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\/goals\/trees$/, (route: Route) => {
    if (route.request().method() === 'GET') return arr(TREES)(route);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 3, name: 'New' }) });
  });
  await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, arr([]));
  await page.route(/\/api\/goals\/trees\/\d+$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

/** Land on the route with a real prior history entry (/) so a Back gesture has
 *  somewhere to go and cannot be mistaken for a no-op. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto('/');
  await dismissMobileSidebarIfPresent(page);
  await page.goto(route);
  await dismissMobileSidebarIfPresent(page);
}

/** The four properties the hand-rolled scrims did not have between them. */
async function expectDialogSemantics(page: Page, name: RegExp | string): Promise<Locator> {
  const dialog = page.getByRole('dialog');
  await expect(dialog, 'is announced as a dialog').toBeVisible();
  await expect(dialog, 'is modal to assistive tech').toHaveAttribute('aria-modal', 'true');
  await expect(dialog, 'carries an accessible name').toHaveAccessibleName(name);
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), {
      message: 'focus lands inside the dialog',
    })
    .toBe(true);
  return dialog;
}

test.describe('#4517 the goals-cluster dialogs are AspModal', () => {
  test.beforeEach(async ({ page }) => {
    await seedGoals(page);
  });

  test('Goals create (Options / overlayHistoryWatch): semantics, Escape, Back unwinds', async ({ page }) => {
    await open(page, '/member/shared/goals');
    await expect(page.getByRole('heading', { name: 'Goal Trees' })).toBeVisible();

    const trigger = page.getByRole('button', { name: /New Tree/ });
    await trigger.click();
    await expectDialogSemantics(page, 'Create New Tree');

    // Escape — which did nothing on any of the twelve hand-rolled overlays.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Back closes without leaving the route, and the entry is unwound: a second
    // Back then leaves. The directive that used to carry this could not bind to
    // AspModal's teleported root — the state-edge watch does.
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/member\/shared\/goals$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/member\/shared\/goals$/);
  });

  test('Goals delete: Cancel and Back reach one state, and the delete still fires', async ({ page }) => {
    await open(page, '/member/shared/goals');
    await expect(page.locator('.tree-name').first()).toBeVisible();

    let deleted = false;
    await page.route(/\/api\/goals\/trees\/\d+$/, (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return route.fallback();
    });

    const del = page.getByRole('button', { name: 'Delete' }).first();
    await del.click();
    await expectDialogSemantics(page, 'Delete Tree');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.tree-name').first()).toBeVisible(); // a cancel is a cancel

    await del.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => deleted, { message: 'DELETE /api/goals/trees was sent' }).toBe(true);
  });

  test('GoalTreeCanvas Add Node (setup / useOverlayHistory): semantics and Escape', async ({ page }) => {
    await open(page, '/member/shared/goals/1');
    const add = page.getByRole('button', { name: /Add Node/ });
    await add.first().click();
    await expectDialogSemantics(page, 'Add Node');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('TreeSwitcher rename (setup / useOverlayHistory): semantics and Back unwinds', async ({ page }) => {
    await open(page, '/member/shared/goals/1');
    // Open the switcher dropdown, then the rename dialog on the active tree.
    await page.locator('.switcher-trigger').click();
    await page.locator('.switcher-dropdown').getByRole('button', { name: 'Rename' }).first().click();
    await expectDialogSemantics(page, 'Rename Tree');

    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/member\/shared\/goals\/1$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/member\/shared\/goals\/1$/);
  });
});
