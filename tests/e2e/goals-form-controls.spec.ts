import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4479 (#4476-C5c) — the native form controls in the goals components are DS
 * components: AspTextarea for NodeDetailPanel's three composers, AspSelect for
 * TimelineFilter's period and UserForm's access role.
 *
 * Each assertion names the failure it is buying against, because these ports
 * fail quietly in three different ways:
 *
 *  - AspTextarea sets inheritAttrs: false and binds $attrs to the inner
 *    <textarea>, so keydown modifiers and placeholders ride through but a
 *    consumer CLASS does not reach the root. A port that keeps a layout class
 *    on the component renders correctly and lays out wrong (#4477 measured a
 *    190px field in a 784px row on exactly this mistake).
 *  - AspSelect emits only update:modelValue. A port that keeps `v-model` and
 *    drops the handler the native's @change ran renders perfectly and silently
 *    stops doing the thing the control existed for.
 *  - AspSelect's caption is --text-xs where AspInput's and AspTextarea's is
 *    --text-sm/medium (DS defect #4484), so a form built from all three carries
 *    two label treatments unless one caption stays consumer-authored.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const NODE = {
  id: 7,
  name: 'Ship the convergence',
  type: 'goal',
  description: '# heading\n\nbody text',
  completed_at: null,
  parent_id: null,
  planned_start: '2026-08-01',
  planned_end: '2026-09-01',
  color: '#ffb300',
};

async function openCanvas(page: Page, nodes: unknown[] = [NODE]): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\/goals\/trees$/, json([{ id: 1, name: 'Tree', updated_at: '2026-08-01T10:00:00Z' }]));
  await page.route(/\/api\/goals\/trees\/\d+\/nodes\/\d+\/comments/, json([]));
  await page.route(/\/api\/goals\/trees\/\d+\/nodes$/, json(nodes));
  await page.goto('/member/shared/goals/1');
  await dismissMobileSidebarIfPresent(page);
}

/** The rest boundary of a control, against the surface immediately AROUND it —
 *  not its own fill, which the border sits on top of. */
async function restBoundary(locator: ReturnType<Page['locator']>): Promise<number | null> {
  return locator.evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const cs = getComputedStyle(el as HTMLElement);
    let surround = null;
    for (let n = (el as HTMLElement).parentElement; n && !surround; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) surround = c;
    }
    if (!surround) return null;
    // Whichever of border or fill differs more from the surround is what draws
    // the edge; a box may legitimately be identified by either.
    const cands = [parse(cs.borderColor), parse(cs.backgroundColor)].filter(Boolean) as { r: number; g: number; b: number }[];
    const ratios = cands.map((c) => {
      const l1 = lum(c), l2 = lum(surround!);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    return ratios.length ? Math.max(...ratios) : null;
  });
}

test.describe('#4479 goals form controls are DS components', () => {
  test('TimelineFilter period is AspSelect and still drives the custom-range reveal', async ({ page }) => {
    await openCanvas(page);
    const period = page.getByRole('combobox', { name: 'Period' });
    await expect(period).toBeVisible();
    await expect(period).toHaveAccessibleName('Period');
    await expect(page.locator('.filter-date')).toHaveCount(0);

    await period.click();
    const listbox = page.getByRole('listbox').first();
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: 'Custom', exact: true }).click();

    // The reveal is the v-model side-effect a dropped binding would kill while
    // leaving a perfectly rendered dropdown behind.
    await expect(page.locator('.filter-date')).toHaveCount(2);
    await expect(period).toContainText('Custom');
  });

  test('NodeDetailPanel composers are AspTextarea, keydown and all', async ({ page }) => {
    await openCanvas(page);
    await page.locator('.vue-flow__node, .node-card, [data-id]').first().click();

    const panel = page.locator('.panel');
    await expect(panel).toBeVisible();

    // Comment composer: the placeholder rides $attrs to the real element.
    const composer = panel.getByPlaceholder('Add a comment...');
    await expect(composer).toBeVisible();
    await expect(composer, 'the DS renders the real textarea').toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(composer).toHaveClass(/field__textarea/);

    const post = panel.getByRole('button', { name: 'Post' });
    await expect(post, 'gated on the bound value, not on the DOM').toBeDisabled();
    await composer.fill('a comment');
    await expect(post).toBeEnabled();

    // .add-comment is a flex column with align-items: flex-end, which shrinks
    // every item to its content width — the composer measured 190px in a 430px
    // panel before a wrapper took over the width the deleted consumer rule used
    // to set. Nothing about that failure is visible to a render assertion.
    const composerBox = await composer.boundingBox();
    const sectionBox = await panel.locator('.add-comment').boundingBox();
    expect(composerBox!.width, 'composer fills its column').toBeGreaterThan(sectionBox!.width * 0.9);

    // Description editor: Ctrl+Enter saves. The modifiers ride $attrs to the
    // inner element; if they landed on the wrapper the field would look right
    // and the shortcut would be dead.
    await panel.getByRole('button', { name: 'Edit' }).click();
    const editor = panel.locator('.description-editor textarea');
    await expect(editor).toBeVisible();
    await expect(editor, 'Markdown source keeps its monospace face').toHaveCSS('font-family', /mono/i);
    const save = page.waitForRequest((r) => r.method() === 'PATCH' && /\/nodes\/7$/.test(r.url()));
    await editor.fill('rewritten body');
    await editor.press('Control+Enter');
    await save;
  });

  test('the completion checkbox keeps a visible rest boundary on the panel surface', async ({ page }) => {
    await openCanvas(page);
    await page.locator('.vue-flow__node, .node-card, [data-id]').first().click();
    const box = page.locator('.completion-row input[type=checkbox]').first();
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();

    // #4482 held a native toggle on a near-white page because AspCheckbox's
    // --border-subtle measured 1.26:1 there. This control sits on
    // --surface-card, dark in both themes, where the DS box's near-white FILL
    // carries the edge instead of its border — which is why the same component
    // can be right here and wrong there, and why this is measured rather than
    // reasoned. The assertion is on the outcome, so it holds whichever control
    // is rendering.
    const ratio = await restBoundary(box);
    expect(ratio, 'boundary is measurable').not.toBeNull();
    expect(ratio!, 'unchecked boundary clears WCAG 1.4.11 3:1').toBeGreaterThanOrEqual(3);
  });

  test('UserForm renders one caption treatment across four DS controls and one consumer label', async ({ page }) => {
    await seedTrustedSession(page);
    await page.addInitScript(() => localStorage.setItem('user_role', 'Admin'));
    await page.route(/\/api\//, json({}));
    await page.route(/\/api\/data_models\/roles/, json({ items: [{ ID: 1, role_name: 'Admin' }, { ID: 2, role_name: 'Trusted' }] }));
    await page.route(/\/api\/data_models\/users/, json({ items: [{ ID: 1, username: 'someone', access_role: 'Trusted', comment: '' }] }));
    await page.goto('/admin/users');
    await dismissMobileSidebarIfPresent(page);

    const form = page.locator('.user-form');
    if (!(await form.isVisible().catch(() => false))) {
      const add = page.getByRole('button', { name: /add user|new user|create/i }).first();
      if (await add.count()) await add.click();
    }
    await expect(form).toBeVisible();

    const role = form.getByRole('combobox', { name: 'Access Role' });
    await expect(role).toBeVisible();
    const comment = form.locator('textarea');
    await expect(comment).toHaveClass(/field__textarea/);

    // The consumer caption held by #4484 must resolve identically to the DS one
    // beside it. This fails the day someone tidies it into AspSelect's `label`
    // prop, which is exactly the regression the hold exists to prevent.
    const consumerLabel = form.locator('label').first();
    const dsLabel = form.locator('.field__label').first();
    for (const prop of ['font-size', 'font-weight', 'line-height']) {
      const a = await consumerLabel.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      const b = await dsLabel.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      expect(a, `consumer caption and DS caption agree on ${prop}`).toBe(b);
    }
  });
});
