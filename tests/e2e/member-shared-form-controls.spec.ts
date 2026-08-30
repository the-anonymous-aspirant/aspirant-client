import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #4478 (#4476-C5b): the member/shared native form controls
 *  migrated to the design system — Translator's four <select>s and its
 *  <textarea>, GoalTreeCanvas's Type/Parent <select>s and description
 *  <textarea>, and the Scratchpad editor.
 *
 *  AspSelect is a DOM-shape change, not a tag swap: a `role="combobox"` button
 *  whose text is the chosen option's label, plus a `role="listbox"` panel. So
 *  every assertion here is on what the user gets — the accessible name, the
 *  option labels rendered from the response, the state the choice writes, the
 *  handler the choice fires — rather than on markup. A wrong prop name on a DS
 *  component renders an empty control and still passes an "it exists" check
 *  (#4182), which is why the option labels and the resulting state are read
 *  back rather than the trigger's presence.
 *
 *  Backends are mocked per-test with page.route(); the shapes match
 *  member-shared-icon-buttons.spec.ts (translator) and goal-inline-fields.spec.ts
 *  (goals).
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const LANGUAGES = {
  installed_pairs: 1,
  total_pairs: 3,
  languages: [
    {
      code: 'en',
      name: 'English',
      targets: [
        { code: 'sv', name: 'Swedish', installed: true },
        { code: 'de', name: 'German', installed: false },
      ],
    },
    { code: 'sv', name: 'Swedish', targets: [{ code: 'en', name: 'English', installed: false }] },
  ],
};

async function openTranslator(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\/translator\/languages(\?.*)?$/, json(LANGUAGES));
  await page.goto('/member/shared/translator');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('.translate-card')).toBeVisible();
}

test.describe('Translator — AspSelect pickers and AspTextarea input', () => {
  test('the four pickers are named comboboxes whose options are built from the response', async ({ page }) => {
    await openTranslator(page);

    for (const name of ['From', 'To', 'Source', 'Target']) {
      await expect(page.getByRole('combobox', { name }), name).toBeVisible();
    }

    // Placeholder text is the old disabled first <option>.
    const from = page.getByRole('combobox', { name: 'From' });
    await expect(from).toHaveText(/Select language/);

    await from.click();
    const listbox = page.getByRole('listbox', { name: 'From' });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option')).toHaveText(['English (en)', 'Swedish (sv)']);
    await listbox.getByRole('option', { name: 'Swedish (sv)' }).click();
    await expect(listbox).toBeHidden();
    await expect(from).toHaveText(/Swedish \(sv\)/);
  });

  test('Target still depends on Source, and installed targets keep their suffix', async ({ page }) => {
    await openTranslator(page);

    const target = page.getByRole('combobox', { name: 'Target' });
    await target.click();
    await expect(page.getByRole('listbox', { name: 'Target' })).toContainText('No options');
    await page.keyboard.press('Escape');

    await page.getByRole('combobox', { name: 'Source' }).click();
    await page.getByRole('option', { name: 'English (en)' }).click();

    await target.click();
    await expect(page.getByRole('listbox', { name: 'Target' }).getByRole('option')).toHaveText([
      'sv (installed)',
      'de',
    ]);
    await page.getByRole('option', { name: 'de', exact: true }).click();
    await expect(target).toHaveText(/^\s*de\s*▾?\s*$/);
    // Both halves chosen — the install action unlocks.
    await expect(page.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  test('the input is a DS textarea; the counter and the Translate gate follow it', async ({ page }) => {
    await openTranslator(page);

    const input = page.getByRole('textbox', { name: 'Text to translate' });
    await expect(input).toHaveClass(/field__textarea/);
    await expect(input).toHaveAttribute('maxlength', '5000');
    await expect(page.locator('.char-counter')).toHaveText('0 / 5000');

    const translate = page.getByRole('button', { name: 'Translate' });
    await expect(translate).toBeDisabled();

    await input.fill('hello');
    await expect(page.locator('.char-counter')).toHaveText('5 / 5000');
    // Text alone is not enough — both languages still gate the action.
    await expect(translate).toBeDisabled();

    await page.getByRole('combobox', { name: 'From' }).click();
    await page.getByRole('option', { name: 'English (en)' }).click();
    await page.getByRole('combobox', { name: 'To' }).click();
    await page.getByRole('option', { name: 'Swedish (sv)' }).click();
    await expect(translate).toBeEnabled();
  });
});

interface Node {
  id: number;
  name: string;
  type: string;
  parent_id: number | null;
  description: string;
  color: string;
  status?: string;
  completed?: boolean;
  x?: number;
  y?: number;
}

const SEEDED: Node[] = [
  { id: 7, name: 'Learn Swedish', type: 'goal', parent_id: null, description: '', color: '#ffb300', status: 'active', completed: false, x: 100, y: 100, position: { x: 100, y: 100 } },
];

async function openCanvas(page: Page): Promise<{ posts: Record<string, unknown>[] }> {
  const posts: Record<string, unknown>[] = [];
  await seedTrustedSession(page);
  await page.route(/\/api\/goals\/trees$/, json([{ id: 1, name: 'Existing name', updated_at: '2026-08-01T10:00:00Z' }]));
  await page.route(/\/api\/goals\/trees\/1\/nodes$/, async (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      posts.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 8, ...body }),
      });
      return;
    }
    await json(SEEDED)(route);
  });
  await page.goto('/member/shared/goals/1');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('button', { name: '+ Add Node' }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  return { posts };
}

test.describe('GoalTreeCanvas Add Node — AspSelect type/parent and AspTextarea description', () => {
  test('choosing a type still writes that type\'s template into the description', async ({ page }) => {
    await openCanvas(page);

    const description = page.getByRole('textbox', { name: 'Description' });
    await expect(description).toHaveClass(/field__textarea/);
    // The default node type is `step`, whose template opens with "## Action".
    await expect(description).toHaveValue(/^## Action/);

    const type = page.getByRole('combobox', { name: 'Type' });
    await expect(type).toHaveText(/Step/);
    await type.click();
    await expect(page.getByRole('listbox', { name: 'Type' }).getByRole('option')).toHaveText(['Goal', 'Milestone', 'Step']);
    await page.getByRole('option', { name: 'Milestone' }).click();

    // This is onTypeChange surviving the move from @change to update:modelValue:
    // the assignment lands first, then the template for the NEW type.
    await expect(type).toHaveText(/Milestone/);
    await expect(description).toHaveValue(/^## Definition/);
  });

  test('the parent picker lists the seeded node and posts its id as a number', async ({ page }) => {
    const { posts } = await openCanvas(page);

    const parent = page.getByRole('combobox', { name: 'Parent' });
    await expect(parent).toHaveText(/None \(root\)/);
    await parent.click();
    await expect(page.getByRole('listbox', { name: 'Parent' }).getByRole('option')).toHaveText(['None (root)', 'Learn Swedish']);
    await page.getByRole('option', { name: 'Learn Swedish' }).click();
    await expect(parent).toHaveText(/Learn Swedish/);

    await page.getByRole('textbox', { name: 'Node name' }).fill('Finish chapter 3');
    await page.getByRole('button', { name: 'Create' }).click();

    // A <select> would have coerced the option value to "7"; AspSelect keeps
    // the number the option was built with, which is what the API takes.
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ name: 'Finish chapter 3', type: 'step', parent_id: 7 });
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });
});

test.describe('Scratchpad — AspTextarea editor', () => {
  test('the editor is the DS textarea and still syncs on input', async ({ page }) => {
    await seedTrustedSession(page);
    const puts: string[] = [];
    await page.route(/\/api\//, (route: Route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/users/me/scratchpad', async (route: Route) => {
      if (route.request().method() === 'PUT') {
        puts.push((route.request().postDataJSON() as { text: string }).text);
        await json({ text: puts.at(-1), updated_at: '2026-08-22T00:00:01Z' })(route);
        return;
      }
      await json({ text: 'seeded', updated_at: '2026-08-22T00:00:00Z' })(route);
    });

    await page.goto('/member/shared/scratchpad');
    await dismissMobileSidebarIfPresent(page);

    // The class scratchpad.spec.ts locates by is delivered to the inner
    // <textarea> (AspTextarea binds $attrs there), which is also the element
    // carrying the DS box — one node, both roles.
    const editor = page.locator('.scratchpad-editor');
    await expect(editor).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(editor).toHaveClass(/field__textarea/);
    await expect(editor).toHaveAttribute('spellcheck', 'false');
    await expect(editor).toHaveValue('seeded');

    await editor.fill('typed on device A');
    await expect.poll(() => puts.at(-1)).toBe('typed on device A');
    await expect(page.locator('.scratchpad-status')).toHaveText('Saved');
  });
});
