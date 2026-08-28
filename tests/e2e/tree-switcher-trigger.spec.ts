import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** system_3 #4513 (#4246-C8) — the goal-tree switcher trigger, ported from a
 *  hand-painted native <button> to AspButton variant="secondary" with the
 *  disclosure arrow on #iconRight.
 *
 *  Two of the three assertions here guard something that could actually break;
 *  the third records a capability the port ADDED. They are labelled as such,
 *  because #4493 and #4512 both turned up assertions that looked like guards
 *  and were not, and an unlabelled green test is the expensive kind of wrong.
 *
 *  GUARD 1 — the emit. The native's @click was a DOM listener; AspButton emits
 *  its own `click` and calls preventDefault when blocked. A port that renders
 *  perfectly and drops the handler is a trigger that opens nothing.
 *
 *  GUARD 2 — the ellipsis, and this is the one the port really risked. The
 *  native put `max-width: 240px` on itself and the ellipsis on its own
 *  `.trigger-label` span. After the port the name rides `.btn__label`, a span
 *  the DS renders and gives NO rule of its own (AspButton.vue:94), so the clip
 *  has to be reached through `:deep()` — and a flex item will not shrink below
 *  its content without `min-width: 0`, so the clip needs both halves to be
 *  right.
 *
 *  Negative control, measured rather than assumed: with the `:deep(.btn__label)`
 *  block deleted, the BUTTON still measures 240px — `max-width` on the root
 *  keeps its promise — while the label inside it renders 616.5px wide starting
 *  195px to the LEFT of the button, i.e. the tree name paints straight across
 *  the "← Trees" control beside it. So the box-width assertion alone would have
 *  stayed green through the whole defect. What actually catches it is asserting
 *  that the label's own box sits INSIDE the button's, and the two assertions
 *  below are ordered so the useful one is not mistaken for a consequence of the
 *  weak one. Test 1 and test 3 stay green in that state; only this one fails.
 *
 *  ADDED, not guarded — the ARIA. The native announced nothing about the menu
 *  it opens: no aria-haspopup, no aria-expanded. The port carries both through
 *  AspButton's attribute fall-through. There is no regression to protect here
 *  because there was no behaviour to lose; the test exists so that a later
 *  rewrite has to keep it.
 *
 *  Also guarded, incidentally but deliberately: every locator here addresses
 *  the trigger BY ITS NAME. Until #4513 the name never resolved — `t.id` from
 *  the API is a JSON number, `route.params.id` is a string, and the `===`
 *  between them meant the trigger read the "Select tree" placeholder for every
 *  tree in production. A regression to that bug turns all three tests red.
 */

const LONG_NAME = 'A tree whose name is long enough to need clipping in the toolbar';

interface Tree {
  id: number;
  name: string;
  updated_at?: string;
}

async function openCanvas(page: Page, trees: Tree[]): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\/goals\/trees$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trees) }),
  );
  await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.goto('/member/shared/goals/1');
  await dismissMobileSidebarIfPresent(page);
}

test.describe('#4513 tree-switcher trigger (AspButton port)', () => {
  test('GUARD: the click still reaches the parent and toggles the dropdown', async ({ page }) => {
    await openCanvas(page, [{ id: 1, name: 'Existing name' }]);

    const trigger = page.getByRole('button', { name: 'Existing name', exact: true });
    await expect(trigger).toBeVisible();

    const dropdown = page.locator('.switcher-dropdown');
    await expect(dropdown).toBeHidden();

    await trigger.click();
    await expect(dropdown).toBeVisible();

    await trigger.click();
    await expect(dropdown).toBeHidden();
  });

  test('GUARD: a long tree name is clipped inside the 240px cap, not laid out past it', async ({
    page,
  }) => {
    await openCanvas(page, [{ id: 1, name: LONG_NAME }]);

    const trigger = page.getByRole('button', { name: LONG_NAME, exact: true });
    await expect(trigger).toBeVisible();

    const box = (await trigger.boundingBox())!;
    const label = trigger.locator('.btn__label');
    const labelBox = (await label.boundingBox())!;

    // THE assertion. Without `min-width: 0` the label is a flex item that
    // refuses to shrink, so it renders at its full content width and overhangs
    // the button on both sides — while the button itself still measures 240.
    expect(labelBox.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(box.x + box.width + 1);

    // The cap itself, and the clip that makes the overhang impossible rather
    // than merely absent: content wider than the box is what ellipsis eats.
    expect(box.width).toBeLessThanOrEqual(241);
    const overflow = await label.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeGreaterThan(0);
    await expect(label).toHaveCSS('text-overflow', 'ellipsis');
  });

  test('GUARD: the resolved name does not widen the mobile toolbar', async ({ page }) => {
    // Making the name resolve is a correctness fix that costs width: the
    // trigger goes from the 155px "Select tree" placeholder to whatever the
    // cap allows. The goal toolbar (back / switcher / spacer / add-node, one
    // non-wrapping row) ALREADY overflows a 390px viewport on the merge-base —
    // documentElement.scrollWidth 483 against clientWidth 390 — so a flat
    // 240px cap would have taken that to 568 and quietly made a pre-existing
    // defect 85px worse. The mobile half of the cap holds it at 156px, one
    // pixel of overflow from where this branch found it (484).
    //
    // Asserting the fraction rather than 156px keeps this about the rule and
    // not about the current font: a control that carries a user-entered name
    // does not get to claim more than 40% of a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await openCanvas(page, [{ id: 1, name: LONG_NAME }]);

    const trigger = page.getByRole('button', { name: LONG_NAME, exact: true });
    const box = (await trigger.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390 * 0.4 + 1);
  });

  test('ADDED: the trigger now announces the menu it opens', async ({ page }) => {
    await openCanvas(page, [{ id: 1, name: 'Existing name' }]);

    const trigger = page.getByRole('button', { name: 'Existing name', exact: true });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
