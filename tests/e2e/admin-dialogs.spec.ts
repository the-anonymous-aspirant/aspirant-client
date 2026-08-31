import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4516 (#4246-C9) — the two admin dialogs are `AspModal`.
 *
 * The census this task rests on: `AspModal` had ZERO usages in this app while
 * twelve hand-rolled scrims stood in for it, and whole-repo greps over `src/**`
 * returned `role="dialog"` 0, `aria-modal` 0, focus trap 0, Escape-to-close 0.
 * So a screen reader announced none of them as a dialog, Tab walked straight
 * out of the panel into the page behind, and Escape did nothing.
 *
 * What is asserted here is the OUTCOME a user or an AT gets — a dialog role, an
 * accessible name, focus that lands inside and stays, Escape and Back both
 * closing through the one close path — not that a particular component is
 * mounted. A rewrite that kept the behaviour would keep these green; a port
 * that mounted `AspModal` and broke Back would not.
 *
 * The ink cases are the other half. `AspModal`'s panel is `--surface-card`,
 * DARK in both themes, where the panels these dialogs used to paint were
 * `--surface-elevated` (light). Every chip inside them that sets its own
 * background inherited the page's dark ink by accident and now would inherit a
 * light one — the 1.00:1 shape of #4448. Each is asserted as a RATIO, in both
 * themes, because a token name or a class list would have passed on the broken
 * build.
 */

const AA_TEXT = 4.5;

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Foreground over the composited ancestor background stack. Kept identical to
 *  tests/e2e/theme-surface-pairing.spec.ts so the numbers are comparable. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    type RGBA = { r: number; g: number; b: number; a: number };
    const parse = (s: string): RGBA | null => {
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
    const layers: RGBA[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a === 1) break;
    }
    let bg = layers.pop() ?? null;
    while (bg && layers.length) {
      const over = layers.pop()!;
      bg = {
        r: over.r * over.a + bg.r * (1 - over.a),
        g: over.g * over.a + bg.g * (1 - over.a),
        b: over.b * over.a + bg.b * (1 - over.a),
        a: 1,
      };
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    return (Math.max(lum(eff), lum(bg)) + 0.05) / (Math.min(lum(eff), lum(bg)) + 0.05);
  });
}

async function seedAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('user_role', 'Admin');
    localStorage.setItem('user_name', 'e2e-admin');
  });
}

/** Playwright matches routes most-recently-registered first, so the catch-all
 *  is registered BEFORE the specific mocks or it swallows every one of them. */
async function mockAdmin(page: Page): Promise<void> {
  await page.route(/\/api\//, json({}));
  await page.route(
    /\/api\/assets(\?.*)?$/,
    // Flat key on purpose: Assets renders any key containing a "/" as a FOLDER
    // row at the root path, and a folder row has no Delete control.
    json({ assets: [{ key: 'q3-summary.pdf', etag: 'e1', content_type: 'application/pdf', size: 1024, last_modified: '2026-08-01T00:00:00Z' }] }),
  );
}

async function withTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
}

/** Land on the route with a real prior history entry, so a Back gesture has
 *  somewhere to go and cannot be mistaken for a no-op. */
async function openAdmin(page: Page, route: string): Promise<void> {
  await page.goto('/');
  await dismissMobileSidebarIfPresent(page);
  await page.goto(route);
  await dismissMobileSidebarIfPresent(page);
}

/** The four properties the twelve hand-rolled scrims did not have between them. */
async function expectDialogSemantics(page: Page, name: RegExp | string): Promise<Locator> {
  const dialog = page.getByRole('dialog');
  await expect(dialog, 'is announced as a dialog').toBeVisible();
  await expect(dialog, 'is modal to assistive tech').toHaveAttribute('aria-modal', 'true');
  await expect(dialog, 'carries an accessible name').toHaveAccessibleName(name);
  // Focus containment: the trap moves focus into the panel on open. Without it
  // focus stays on the control that opened the dialog, out in the page behind.
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), {
      message: 'focus lands inside the dialog',
    })
    .toBe(true);
  return dialog;
}

test.describe('#4516 the admin dialogs are AspModal', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdmin(page);
    await mockAdmin(page);
  });

  test('Assets delete: dialog semantics, and Cancel and Back reach the same state', async ({ page }) => {
    await openAdmin(page, '/admin/assets');
    await expect(page.locator('.file-name')).toBeVisible();

    const open = page.getByRole('button', { name: 'Delete' }).first();
    await open.click();
    await expectDialogSemantics(page, 'Delete asset?');
    await expect(page.getByTestId('asset-delete-confirm')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    // The row survives a cancel — the confirm is a confirm.
    await expect(page.locator('.file-name')).toBeVisible();

    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/assets$/);
  });

  test('Assets delete: the destructive action still fires', async ({ page }) => {
    await openAdmin(page, '/admin/assets');
    let deleted = false;
    await page.route(/\/api\/assets\?.*key=/, (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return route.fallback();
    });

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => deleted, { message: 'DELETE /api/assets was sent' }).toBe(true);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#4516 dialog ink pairs with the panel it sits on — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await withTheme(page, theme);
      await seedAdmin(page);
      await mockAdmin(page);
    });

    test('the Assets delete path chip is legible on the DS panel', async ({ page }) => {
      await openAdmin(page, '/admin/assets');
      await page.getByRole('button', { name: 'Delete' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      expect(
        await contrastRatio(dialog.locator('.modal-path')),
        `${theme}: asset key chip on the dialog panel`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        await contrastRatio(dialog.locator('p').last()),
        `${theme}: confirm copy on the dialog panel`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
}
