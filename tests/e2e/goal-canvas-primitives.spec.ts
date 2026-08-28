import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #4443 (#4442-A10a): the goal-canvas glyph-only buttons
 *  migrated to AspButton size="icon", and the timeline mode strip migrated to
 *  AspSegmented.
 *
 *  These two ports fail in different ways, so they are asserted differently.
 *
 *  The BUTTON port is an attribute-passthrough bet. AspButton does not set
 *  `inheritAttrs: false`, so `aria-label` is supposed to land on the rendered
 *  <button>. If that read of the DS were wrong, every one of these controls
 *  would lose its accessible name and become unnameable to a screen reader —
 *  and nothing in the existing suite would say so, because the controls would
 *  still be present and still clickable. So the assertions here are on the
 *  accessible name and on the 44px square the DS pins (§3.23 rule-4), not on
 *  any class.
 *
 *  The STRIP port is a state-rewiring bet. The three modes were three click
 *  handlers assigning `localMode`; they are now one `v-model` on a component
 *  that owns its own keyboard behaviour. The failure mode is a strip that
 *  renders correctly and selects nothing — visibly fine, functionally inert.
 *  So the assertion is that selection actually moves, including via the arrow
 *  keys the primitive is responsible for, and via the role/aria-checked
 *  contract a radiogroup owes assistive tech.
 */

interface Tree {
  id: number;
  name: string;
  updated_at?: string;
}

const TREES: Tree[] = [{ id: 1, name: 'Existing name', updated_at: '2026-08-01T10:00:00Z' }];

async function openCanvas(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\/goals\/trees$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TREES) }),
  );
  await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.goto('/member/shared/goals/1');
  await dismissMobileSidebarIfPresent(page);
}

const CANVAS_CONTROLS = ['Zoom in', 'Zoom out', 'Fit view', 'Reset'];

test.describe('#4443 goal-canvas primitives (AspButton size="icon" / AspSegmented)', () => {
  test('canvas controls keep their accessible names and get the 44px touch target', async ({
    page,
  }) => {
    await openCanvas(page);

    for (const name of CANVAS_CONTROLS) {
      const btn = page.getByRole('button', { name, exact: true });
      await expect(btn).toBeVisible();

      // The DS pins width/height/min-width/min-height to 44px for size="icon".
      // Asserting the rendered box rather than the class is what catches the
      // real regression: a surviving local `.control-btn { width: 36px }` rule
      // would keep the class list intact and still shrink the control.
      const box = (await btn.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('canvas controls are still wired to the canvas', async ({ page }) => {
    await openCanvas(page);

    // A port that renders perfectly but drops @click is the quiet failure:
    // AspButton emits its own click, so the handler had to survive the swap.
    // Zooming changes the vue-flow transform; reading it before and after is
    // the cheapest end-to-end proof the emit still reaches the parent.
    const transform = () =>
      page.locator('.vue-flow__transformationpane').first().evaluate((el) => getComputedStyle(el).transform);

    const before = await transform();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(transform).not.toBe(before);
  });

  test('timeline mode strip is a radiogroup and selection actually moves', async ({ page }) => {
    await openCanvas(page);

    const strip = page.getByRole('radiogroup', { name: 'Timeline mode' });
    await expect(strip).toBeVisible();

    const planned = page.getByRole('radio', { name: 'Planned' });
    const achieved = page.getByRole('radio', { name: 'Achieved' });
    const combined = page.getByRole('radio', { name: 'Combined' });

    // The old markup had no role at all — three plain buttons with an `active`
    // class. aria-checked is the contract the strip now owes assistive tech,
    // and it is what a screen-reader user hears instead of a colour.
    //
    // Deliberately NOT asserting which member starts selected: that is the
    // view's default (`useTimelineFilter` opens on 'combined'), not something
    // this migration owns, and pinning it here would make an unrelated product
    // decision unchangeable without editing a DS-adoption test. What the strip
    // owes is that exactly one member is checked and that selection MOVES.
    await expect(strip.getByRole('radio', { checked: true })).toHaveCount(1);

    await achieved.click();
    await expect(achieved).toHaveAttribute('aria-checked', 'true');
    await expect(planned).toHaveAttribute('aria-checked', 'false');
    await expect(combined).toHaveAttribute('aria-checked', 'false');

    // Arrow-key selection is behaviour the native buttons never had and that
    // only the primitive can provide — so it is also the clearest signal that
    // AspSegmented is genuinely driving this strip rather than merely painting
    // something that looks like it.
    await achieved.press('ArrowRight');
    await expect(combined).toHaveAttribute('aria-checked', 'true');
  });

  test('selecting a mode reaches the parent view, not just the strip', async ({ page }) => {
    await openCanvas(page);

    // v-model on a component wraps an emit the parent must still receive.
    // GoalTreeCanvas surfaces the filter state as a visible badge once a
    // filter is applied, so the badge is the parent-side observation.
    await page.getByRole('radio', { name: 'Achieved' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.filter-active-badge')).toBeVisible();
  });
});
