import { test, expect, type Locator, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4444 (#4442-A10b) — the shared-component slice of the §3.89 residue.
 *
 * Two of the three files change and one deliberately does not:
 *  - BackButton.vue ADOPTS the DS AspBackButton wholesale (§3.13
 *    build-in-DS-first; docs/COMPONENTS.md §9 names this file as the component
 *    it was ported from), which is why the assertions below are on the DS root
 *    and on the corrected no-history behaviour, not on a ported inner button.
 *  - RobbansTusen's transport becomes AspButton size="icon".
 *  - PixelAvatarDraw's palette is HELD — every member carries aria-pressed and
 *    a colour swatch IS its content, both out of AspButton's contract by
 *    construction (§3.89). The last test locks that hold so a later sweep has
 *    to revisit the ruling rather than quietly port it.
 */

/** Foreground contrast over the COMPOSITED ancestor background stack.
 *  The nearest-opaque shortcut used by tests/e2e/trusted-contrast.spec.ts:25
 *  cannot read the Robbans widget: it paints rgba(255,255,255,.15) over
 *  rgba(0,0,0,.72) and the shortcut would compare white ink against the light
 *  page underneath, reporting ~1.3:1 for a control that is plainly legible. */
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

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('#4444 shared components adopt the DS primitives', () => {
  test.beforeEach(async ({ page }) => { await seedTrustedSession(page); });

  test('BackButton renders the DS AspBackButton, named and legible on its pill', async ({ page }) => {
    await page.route(/\/api\/goals\/trees$/, json([]));
    await page.goto('/member/shared/goals');
    await dismissMobileSidebarIfPresent(page);

    const back = page.locator('.back-button-container button').first();
    await expect(back, 'renders').toBeVisible();
    await expect(back, 'is the DS component root').toHaveClass(/back-btn/);
    await expect(back, 'keeps an accessible name').toHaveAccessibleName('Back');

    const box = await back.boundingBox();
    expect(Math.round(box!.height), 'DS 44px minimum target').toBeGreaterThanOrEqual(44);
    expect(await contrastRatio(back), 'glyph reads on the pill (WCAG AA)').toBeGreaterThanOrEqual(4.5);
  });

  test('BackButton lands on home when there is no in-app history to pop', async ({ page }) => {
    await page.route(/\/api\/goals\/trees$/, json([]));
    // A direct load is the first entry in this tab: window.history.length is
    // already > 1 in a driven browser, which is exactly why the old
    // length-based check could pop the user out of the app. AspBackButton
    // reads history.state.back instead and pushes `to` when there is nothing
    // of ours behind.
    await page.goto('/member/shared/goals');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.back-button-container button').first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('BackButton stays absent on the home route', async ({ page }) => {
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.back-button-container')).toHaveCount(0);
  });

  test('Robbans transport is an icon AspButton and reads on its own pill', async ({ page }) => {
    await page.route(/\/api\//, json({}));
    await page.goto('/member/personal/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);

    const rt = page.locator('.robbans-tusen button').first();
    await expect(rt, 'renders').toBeVisible();
    await expect(rt, 'is the DS icon shape').toHaveClass(/btn--size-icon/);
    await expect(rt, 'keeps its Swedish accessible name').toHaveAccessibleName(/Robbans Tusen/);

    const box = await rt.boundingBox();
    expect(Math.round(box!.width), '44px wide').toBe(44);
    expect(Math.round(box!.height), '44px tall').toBe(44);
    // The pill composited to ~#666 at its old 0.55 alpha and this glyph
    // measured 4.09:1 there, under AA before the port. The surface owns that,
    // not the button.
    expect(await contrastRatio(rt), 'glyph reads on the pill (WCAG AA)').toBeGreaterThanOrEqual(4.5);
  });

  test('the pixel palette is still native, and still one uniform toolbar', async ({ page }) => {
    await page.route(/\/api\//, json({}));
    await page.route(/\/api\/profile/, json({
      ID: 7, username: 'e2e-tester', display_name: 'e2e-tester',
      email: 'e2e@example.com', avatar_url: '', CreatedAt: '2026-03-15T10:00:00Z',
    }));
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);
    // The drawing surface is behind its own disclosure.
    await page.getByRole('button', { name: 'Draw an icon' }).click();

    const palette = page.locator('.pixel-palette');
    await expect(palette).toBeVisible();
    // Held on purpose (§3.89: no pressed state on AspButton, and a colour
    // swatch IS its content). Porting the eraser alone would drop one 44x44 DS
    // box into a row of swatches, so the whole toolbar stays native.
    await expect(palette.locator('.btn--size-icon'), 'no DS icon button in the palette').toHaveCount(0);
    const sizes = await palette.locator('button').evaluateAll((els) =>
      els.map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
    );
    expect(new Set(sizes).size, `every palette member is one size, got ${sizes.join(' ')}`).toBe(1);
  });
});
