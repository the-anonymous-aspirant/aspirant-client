import { test, expect, type Page } from '@playwright/test';

/**
 * #4245 (#4240-B2) — theme activation, audit #4241 report #72 finding F3.
 *
 * The design-system dark block already shipped in this bundle before this
 * change; what was missing was anything setting `[data-theme]`, so the dark
 * values were present-but-unreachable and the app was effectively light-only
 * while the system_3 console on the same origin was dark-capable.
 *
 * These tests assert the OUTCOME on the built bundle — the colour the root
 * element actually PAINTS — not the presence of the attribute. `[data-theme]`
 * set on a root whose paint does not change is precisely the shape F3
 * describes, and an attribute assertion alone would pass on the broken
 * version too. The attribute is checked as the mechanism; the painted
 * background is the claim.
 *
 * Reference values come from the DS build (`@aspirant/design-system`
 * tokens.css): `--surface-page` is `#e4e4e4` light, `#1a1a1a` dark; `src/
 * style.css` paints `:root { background-color: var(--surface-page) }`.
 * getComputedStyle serialises the painted colour as rgb(); a custom property
 * comes back as its raw token text, so the two are spelled differently on
 * purpose below.
 */

const LIGHT_SURFACE_PAINTED = 'rgb(228, 228, 228)';
const DARK_SURFACE_PAINTED = 'rgb(26, 26, 26)';

/** What <html> actually paints — the token resolved, substituted and used. */
function paintedRootBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

function themeAttr(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

test.describe('#4245 theme activation', () => {
  test('a stored dark choice reaches the DS dark palette', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');

    expect(await themeAttr(page)).toBe('dark');
    expect(await paintedRootBackground(page)).toBe(DARK_SURFACE_PAINTED);
  });

  test('a stored light choice stays light even when the OS prefers dark', async ({ page }) => {
    // The stored choice must WIN over the OS preference — otherwise a user who
    // deliberately picked light in the system_3 console (same origin, same
    // `theme` key) is dragged back to dark here on every load.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/');

    expect(await themeAttr(page)).toBe('light');
    expect(await paintedRootBackground(page)).toBe(LIGHT_SURFACE_PAINTED);
  });

  test('with no stored choice the OS preference decides', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    expect(await themeAttr(page)).toBe('dark');
    expect(await paintedRootBackground(page)).toBe(DARK_SURFACE_PAINTED);
  });

  test('light remains the default: no stored choice, OS light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    expect(await themeAttr(page)).toBe('light');
    expect(await paintedRootBackground(page)).toBe(LIGHT_SURFACE_PAINTED);
  });

  test('an OS flip moves an open tab while no choice is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await paintedRootBackground(page)).toBe(LIGHT_SURFACE_PAINTED);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => paintedRootBackground(page)).toBe(DARK_SURFACE_PAINTED);
    expect(await themeAttr(page)).toBe('dark');
  });

  test('an OS flip does NOT move a tab whose user has chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/');
    expect(await paintedRootBackground(page)).toBe(LIGHT_SURFACE_PAINTED);

    await page.emulateMedia({ colorScheme: 'dark' });
    // Same settling window the poll above gets, so this is a real negative and
    // not just a faster read.
    await page.waitForTimeout(500);
    expect(await paintedRootBackground(page)).toBe(LIGHT_SURFACE_PAINTED);
    expect(await themeAttr(page)).toBe('light');
  });

  test('dark ink flips with the dark surface, not just the background', async ({ page }) => {
    // Half a theme is worse than none: a dark surface under unflipped dark ink
    // is the contrast collapse this app already paid for twice (#3014, #3027).
    // Assert both sides of the pair, measured as painted colours on a real
    // element rather than as token text.
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');

    const probe = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.color = 'var(--text-body)';
      el.style.backgroundColor = 'var(--surface-card)';
      document.body.appendChild(el);
      const s = getComputedStyle(el);
      const out = { color: s.color, background: s.backgroundColor };
      el.remove();
      return out;
    });
    expect(probe.color).toBe('rgb(224, 224, 224)');
    expect(probe.background).toBe('rgb(42, 42, 42)');
  });
});
