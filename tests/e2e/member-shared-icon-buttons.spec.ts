import { test, expect, type Page, type Locator, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4448 (#4442-A10f) — the five glyph-only controls across the member/shared
 * views become AspButton size="icon" (§3.89 / §3.23 rule-4), and FilesManager's
 * two-member source strip becomes AspSegmented as="radiogroup" (§3.89 Q1).
 *
 * The contrast assertions are the point of this file, not decoration. AspButton's
 * ghost ink is deliberately a currentColor mix, so it inherits whatever ink the
 * consumer's surface declares — and two of these surfaces declared none while
 * painting a dark background (#3027 / §3.18). Before this port the Goals card's
 * row glyphs measured 1.00:1, literally invisible, and porting them without
 * pairing the surface's ink would have collapsed another dark-surface toolbar
 * from 10.05:1 to 1.08:1. Nothing in the suite would have said so: the old rules that carried
 * the ink were the very rules a port deletes. So each control is asserted at the
 * OUTCOME — a DS root, a name, a 44x44 square, and readable ink on its own
 * surface — not on the class list of the moment.
 */

/** Foreground-over-effective-background contrast, the construction used by
 *  tests/e2e/trusted-contrast.spec.ts:25. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
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
    let bg = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    return (Math.max(lum(eff), lum(bg)) + 0.05) / (Math.min(lum(eff), lum(bg)) + 0.05);
  });
}

/** The DS root, the 44x44 square, and ink that reads on its own surface. */
async function expectIconButton(page: Page, name: string): Promise<void> {
  const btn = page.getByRole('button', { name }).first();
  await expect(btn, `${name}: rendered`).toBeVisible();
  await expect(btn, `${name}: is the DS icon shape`).toHaveClass(/btn--size-icon/);
  await expect(btn, `${name}: keeps an accessible name`).toHaveAccessibleName(name);
  const box = await btn.boundingBox();
  expect(Math.round(box!.width), `${name}: 44px wide`).toBe(44);
  expect(Math.round(box!.height), `${name}: 44px tall`).toBe(44);
  expect(await contrastRatio(btn), `${name}: glyph reads on its surface (WCAG AA)`).toBeGreaterThanOrEqual(4.5);
}

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('#4448 member/shared glyph-only controls + file-source strip', () => {
  test.beforeEach(async ({ page }) => { await seedTrustedSession(page); });

  test('Goals row actions read on the card they sit on, and still open the dialogs', async ({ page }) => {
    await page.route(/\/api\/goals\/trees$/, json([{ id: 1, name: 'Existing name', updated_at: '2026-08-01T10:00:00Z' }]));
    await page.goto('/member/shared/goals');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.tree-item').first()).toBeVisible();

    await expectIconButton(page, 'Rename');
    await expectIconButton(page, 'Delete');

    // The row itself opens the tree; the actions must not.
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByRole('heading', { name: 'Rename Tree' })).toBeVisible();
    expect(page.url()).toContain('/member/shared/goals');
    expect(page.url()).not.toContain('/goals/1');
  });

  test('Translator swap is an icon AspButton and swaps the two languages', async ({ page }) => {
    await page.route(/\/api\/translator\/languages(\?.*)?$/, json({
      installed_pairs: 1,
      total_pairs: 2,
      languages: [
        { code: 'en', name: 'English', targets: [{ code: 'sv', name: 'Swedish', installed: true }] },
        { code: 'sv', name: 'Swedish', targets: [{ code: 'en', name: 'English', installed: false }] },
      ],
    }));
    await page.goto('/member/shared/translator');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.translate-card')).toBeVisible();

    await expectIconButton(page, 'Swap languages');

    // The pickers are AspSelect since #4478: a combobox trigger whose text is
    // the selected option's label, not a <select> with a value. Choose through
    // the listbox and read the swap back off the trigger text.
    const from = page.getByRole('combobox', { name: 'From' });
    const to = page.getByRole('combobox', { name: 'To' });
    await from.click();
    await page.getByRole('option', { name: 'English (en)' }).click();
    await to.click();
    await page.getByRole('option', { name: 'Swedish (sv)' }).click();
    await page.getByRole('button', { name: 'Swap languages' }).click();
    await expect(from).toHaveText(/Swedish \(sv\)/);
    await expect(to).toHaveText(/English \(en\)/);
  });

  test('FilesManager source strip is a named radiogroup that still refetches on switch', async ({ page }) => {
    await page.route(/\/api\/files\/usage/, json({ used_bytes: 0, quota_bytes: 1000 }));
    const listed: string[] = [];
    await page.route(/\/api\/files\/(shared\/)?list/, (route) => {
      listed.push(new URL(route.request().url()).pathname);
      return json({ files: [], folders: [] })(route);
    });
    await page.goto('/member/shared/files');
    await dismissMobileSidebarIfPresent(page);

    // as="radiogroup", not "tabs": both members drive the same file list, so
    // the members carry role=radio and aria-checked, not role=tab.
    const group = page.getByRole('radiogroup', { name: 'File source' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio')).toHaveText(['My Files', 'Shared Files']);
    await expect(page.getByRole('radio', { name: 'My Files' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('tab')).toHaveCount(0);

    // switchTab does more than assign — it refetches against the other
    // endpoint. That side effect has to survive the move to update:modelValue.
    await page.getByRole('radio', { name: 'Shared Files' }).click();
    await expect(page.getByRole('radio', { name: 'Shared Files' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => listed.some((p) => p.includes('/shared/list'))).toBe(true);
  });
});
