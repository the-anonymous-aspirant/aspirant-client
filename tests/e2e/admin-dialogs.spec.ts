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
  await page.route(/\/api\/finance\/summary\/overview/, json({ total_transactions: 12, total_income: 1000, total_expenses: 500, banks: ['seb'], categories: [] }));
  await page.route(/\/api\/finance\/summary\/monthly/, json([]));
  await page.route(/\/api\/finance\/summary\/outliers/, json({ top_expenses: [], top_income: [] }));
  await page.route(/\/api\/finance\/transactions/, json({ transactions: [], total: 0 }));
  await page.route(/\/api\/finance\/sources/, json([{ bank: 'seb', name: 'SEB', transaction_count: 12 }]));
  // AFTER the sources list, not before: most-recently-registered wins, and
  // /api/finance/sources also matches the schema URL. Registered the other way
  // round this returns the sources ARRAY as the schema, which still opens a
  // dialog — with no columns, so every chip this spec measures is absent and
  // the failure reads as "element not found" rather than "wrong mock".
  await page.route(/\/api\/finance\/sources\/seb\/schema/, json({
    name: 'SEB',
    description: 'Kontoutdrag CSV',
    encoding: 'utf-8',
    delimiter: ';',
    currency: 'SEK',
    columns: [
      { name: 'bokforingsdatum', required: true, description: 'Posting date', aliases: ['date'] },
      { name: 'text', required: false, description: 'Free-text description', aliases: [] },
    ],
    sample_row: '2026-08-01;ICA MAXI;-249,00',
    notes: 'Amounts use a comma decimal separator.',
  }));
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

  test('Finance schema: dialog semantics, Escape closes, Back closes and stays on the page', async ({ page }) => {
    await openAdmin(page, '/admin/finance');
    await expect(page.locator('.source-folder')).toBeVisible();

    const open = page.getByRole('button', { name: 'View expected CSV schema' }).first();
    await open.click();
    await expectDialogSemantics(page, 'SEB — CSV Schema');
    await expect(page.getByTestId('finance-schema-modal')).toBeVisible();

    // Escape — which did nothing on any of the twelve hand-rolled overlays.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // ... and the Back gesture still closes it without leaving the route
    // (#4172). This is the assertion the port most easily breaks: the directive
    // that used to carry it cannot bind to a teleported component root.
    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/finance$/);

    // The entry the dialog pushed is unwound, not orphaned: one more Back now
    // leaves the route rather than being swallowed.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/admin\/finance$/);
  });

  test('Finance schema: a manual close unwinds its history entry too', async ({ page }) => {
    await openAdmin(page, '/admin/finance');
    const open = page.getByRole('button', { name: 'View expected CSV schema' }).first();
    await open.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Close dialog' }).first().click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // No orphan entry left behind by the close: the next Back leaves the route.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/admin\/finance$/);
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

    test('the Finance schema chips are legible on the DS panel', async ({ page }) => {
      await openAdmin(page, '/admin/finance');
      await page.getByRole('button', { name: 'View expected CSV schema' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Each of these PAINTS its own background, so each must declare its own
      // ink; each inherited the page's by accident while the panel was light.
      for (const [what, sel] of [
        ['delimiter chip', '.schema-props code'],
        ['optional badge', '.badge-optional'],
        ['column-name code', '.schema-table code'],
        ['example row', '.sample-code'],
        ['notes block', '.schema-notes'],
      ] as const) {
        expect(
          await contrastRatio(dialog.locator(sel)),
          `${theme}: ${what} on the dialog panel`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }

      // And the body text that does NOT paint a background: it must take the
      // panel's ink, which is the other half of the same rule.
      expect(
        await contrastRatio(dialog.locator('.schema-meta p')),
        `${theme}: description on the dialog panel`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
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
