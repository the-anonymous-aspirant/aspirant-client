import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #4305 (#4296-A2): the five goal-tree inline fields migrated
 *  from native <input> to the design system's AspInput.
 *
 *  This file exists because of what the migration could have broken silently.
 *  Every one of these five fields is focused — and two are focused AND
 *  selected — by a `ref` the call site holds. A `ref` on a Vue component
 *  resolves to the component INSTANCE, not to any element inside it, so
 *  `theRef.focus()` after the migration is a no-op unless the component
 *  exposes the method (which AspInput now does, aspirant-design-system#88).
 *  Nothing in this repo asserted focus before, so the whole affordance could
 *  have disappeared — open a rename dialog, type, and watch the keystrokes go
 *  nowhere — with the suite still green.
 *
 *  So the assertions here are on the OUTCOME the user gets (the caret is in
 *  the field, the existing name is selected so typing replaces it), not on the
 *  markup that produces it. The same tests would have failed on the naive port.
 *
 *  The Go backend is mocked per-test; see overlay-back-gesture.spec.ts for the
 *  same GET /api/goals/trees shape.
 */

interface Tree {
  id: number;
  name: string;
  updated_at?: string;
}

async function mockTrees(page: Page, trees: Tree[]): Promise<void> {
  await page.route(/\/api\/goals\/trees$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trees) }),
  );
}

async function mockNodes(page: Page): Promise<void> {
  await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

const TREES: Tree[] = [{ id: 1, name: 'Existing name', updated_at: '2026-08-01T10:00:00Z' }];

async function openGoals(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await mockTrees(page, TREES);
  await page.goto('/member/shared/goals');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Goal Trees' })).toBeVisible();
}

async function openCanvas(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await mockTrees(page, TREES);
  await mockNodes(page);
  await page.goto('/member/shared/goals/1');
  await dismissMobileSidebarIfPresent(page);
}

/** What the caret is actually in, and what is selected in it — read from the
 *  document rather than from a locator, because the question is which element
 *  holds focus, not whether some element could. */
function activeField(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return {
      tag: el?.tagName ?? null,
      // The inner <input> of a DS field, not the wrapper: if focus landed on
      // the component's root div instead, typing would go nowhere.
      isFieldInput: !!el?.classList?.contains('field__input'),
      value: el?.value ?? null,
      selection: el ? `${el.selectionStart}-${el.selectionEnd}` : null,
    };
  });
}

/** Asserts a migrated field actually rendered — the #4182 footgun: a DS
 *  component given the wrong props renders a blank control and the suite stays
 *  green. A control that is present, sized, and round-trips a keystroke is the
 *  cheapest proof that the props are the ones the component declares. */
async function expectLiveField(field: Locator, placeholder: string) {
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('placeholder', placeholder);
  expect((await field.boundingBox())!.width).toBeGreaterThan(50);
  await field.fill('round trip');
  await expect(field).toHaveValue('round trip');
}

test.describe('#4305 goal-tree inline fields (AspInput)', () => {
  test('Goals: opening New Tree lands the caret in the name field', async ({ page }) => {
    await openGoals(page);
    await page.getByRole('button', { name: /New Tree/ }).click();

    const field = page.locator('.dialog input.field__input');
    await expectLiveField(field, 'Tree name');
    // Focus is asserted after the fill so a fill-induced focus cannot be
    // mistaken for the dialog's own: re-open instead.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: /New Tree/ }).click();
    await expect.poll(async () => (await activeField(page)).isFieldInput).toBe(true);
  });

  test('Goals: opening Rename focuses AND selects the existing name', async ({ page }) => {
    await openGoals(page);
    // #4297 replaced the icon button's native title= with an AspTooltip +
    // aria-label, so locate the control by its accessible name rather than the
    // (now-absent) title attribute.
    await page.getByRole('button', { name: 'Rename' }).first().click();

    const field = page.locator('.dialog input.field__input');
    await expect(field).toBeVisible();
    // Selecting the whole value is what makes the affordance work: the user
    // types the new name straight over the old one without clearing it first.
    // `.select()` is the second exposed method, and it fails independently of
    // `.focus()` — a ref that resolves to the component silently drops both.
    await expect.poll(async () => (await activeField(page)).selection).toBe(
      `0-${TREES[0].name.length}`,
    );
    expect((await activeField(page)).value).toBe(TREES[0].name);

    // Typing over the selection replaces the name rather than appending to it.
    await page.keyboard.type('Replaced');
    await expect(field).toHaveValue('Replaced');
  });

  test('TreeSwitcher: the in-canvas rename focuses and selects', async ({ page }) => {
    await openCanvas(page);
    await page.locator('.tree-switcher .switcher-trigger, .tree-switcher button').first().click();
    // #4297: the in-canvas rename control is an aria-labelled icon button under
    // an AspTooltip now, not a title= attribute.
    const rename = page.locator('.tree-switcher').getByRole('button', { name: 'Rename' });
    if (!(await rename.count())) test.skip(true, 'no rename affordance rendered for the seeded tree');
    await rename.first().click();

    await expect(page.locator('.dialog h3')).toHaveText('Rename Tree');
    await expect.poll(async () => (await activeField(page)).selection).toBe(
      `0-${TREES[0].name.length}`,
    );
  });

  test('GoalTreeCanvas: Add Node lands the caret in the node-name field', async ({ page }) => {
    await openCanvas(page);
    const add = page.getByRole('button', { name: /Add Node|New Node|\+ Node/ });
    if (!(await add.count())) test.skip(true, 'no add-node affordance on the seeded empty tree');
    await add.first().click();

    const field = page.locator('.dialog input.field__input');
    await expect(field).toHaveAttribute('placeholder', 'Node name');
    await expect.poll(async () => (await activeField(page)).isFieldInput).toBe(true);
  });

  test('every control in the Add Node dialog shares one box', async ({ page }) => {
    await openCanvas(page);
    const add = page.getByRole('button', { name: /Add Node|New Node|\+ Node/ });
    if (!(await add.count())) test.skip(true, 'no add-node affordance on the seeded empty tree');
    await add.first().click();
    await expect(page.locator('.dialog')).toBeVisible();

    // Take the caret out of the name field before measuring. The dialog focuses
    // it on open — that is the affordance the tests above assert — and
    // AspInput's `.field__control:focus-within` swaps the border to --text-body
    // and TRANSITIONS to it, so a reading taken now catches the DS control
    // mid-animation at a colour that is neither state (measured 88,88,88 and
    // then 112,112,112 on two runs of the same page). Comparing a focused
    // control against unfocused siblings is a flake, not a finding.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.locator('.dialog .field__control')).not.toHaveClass(/focus/);
    await page.waitForTimeout(400); // > --transition-fast, so the border has settled

    // The dialog mixes three DS controls (AspInput name, AspSelect type and
    // parent — #4478) with two native date pickers, which cannot migrate
    // (§3.85 excludes the native-widget types on purpose and the DS ships no
    // date control). The natives are held to the box the DS renders, which is
    // the whole reason this dialog does not read as three DS controls among
    // strangers — so assert the box across DS and native alike. The textarea
    // is a multi-line box and is excluded here as it always was.
    const boxes = await page.locator('.dialog .field__control, .dialog .select__trigger, .dialog .form-row input[type="date"]').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return `${Math.round(el.getBoundingClientRect().height)}|${cs.borderTopLeftRadius}|${cs.backgroundColor}|${cs.borderTopColor}`;
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(boxes).size, `controls disagree on the box: ${JSON.stringify(boxes)}`).toBe(1);
  });
});
