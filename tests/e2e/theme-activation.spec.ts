import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

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

/**
 * The second half of #4245: activation is only correct if what it activates is
 * legible. `--brand-primary` (#ffb300) is the SAME amber in both themes, but
 * `--text-on-light` INVERTS under `[data-theme='dark']` — so every primary
 * button in this app painted its label #e0e0e0 on #ffb300 (~1.34:1) the moment
 * dark became reachable. The design system marks `--text-on-light` deprecated
 * for exactly this reason (Task-#2417) and ships `--text-on-fixed-light`, which
 * carries no dark override; this suite is the outcome check on that swap.
 *
 * The assertion is DARK-VS-LIGHT PARITY, not an absolute AA floor, and the
 * distinction is deliberate. An absolute floor would also fail on ink that is
 * equally poor in both themes — `.login-button` paints `--text-on-dark`
 * (#ffffff, no dark override) on amber at 1.79:1 and did so long before dark
 * was reachable. That was real, and it was not this task's defect; failing on
 * it here would either have forced an unrelated light-mode change into a
 * theme-activation PR or pushed someone to bolt an exclusion list onto the
 * test, which is where the next genuine regression would hide. (Fixed since:
 * `.login-button` moved to AspButton's `.btn--primary`, which pairs
 * `--brand-primary` with `--text-on-fixed-light` — #4282, trusted-contrast
 * .spec.ts now carries the absolute-floor lock for this button.) Parity fails
 * exactly when
 * activation makes something WORSE than it was in light — which is the claim
 * #4245 actually owes — and it needs no selector list, so a button added
 * tomorrow is covered too.
 */

/** Every element painting `background` with its own visible label, with the
 *  contrast of its ink. Same luminance maths as tests/e2e/trusted-contrast
 *  .spec.ts (#3014/#3027). */
async function amberLabelContrast(page: Page) {
  return page.evaluate((bgWanted) => {
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const out: Record<string, number> = {};
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor !== bgWanted) continue;
      const text = (el.textContent || '').trim();
      // Only elements carrying their own label: a bare amber bar has no ink
      // that could become unreadable. A button wrapping its label in a <span>
      // still counts — the span inherits `color`, so the button's own ink IS
      // the label's ink — but a container that merely encloses another opaque
      // surface does not, or the parent would be scored on ink it never paints.
      if (!text) continue;
      const paintsOwnSurface = (n: Element) => {
        const c = parse(getComputedStyle(n).backgroundColor);
        return !!c && c.a === 1;
      };
      if (Array.from(el.querySelectorAll('*')).some(paintsOwnSurface)) continue;
      const fg = parse(cs.color);
      const bg = parse(cs.backgroundColor);
      if (!fg || !bg) continue;
      const l1 = lum(fg);
      const l2 = lum(bg);
      const key = `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)} "${text.slice(0, 30)}"`;
      out[key] = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    return out;
  }, 'rgb(255, 179, 0)');
}

/** Measure the page's amber labels in light, then in dark, on one navigation
 *  each. Theme is set through the same localStorage key the app reads, so this
 *  exercises the shipped mechanism rather than a test-only hook. */
async function amberContrastBothThemes(page: Page, url: string, ready: string) {
  await page.goto(url);
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator(ready).first()).toBeVisible();
  const light = await amberLabelContrast(page);

  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator(ready).first()).toBeVisible();
  const dark = await amberLabelContrast(page);

  return { light, dark };
}

test.describe('#4245 activating dark does not degrade brand-amber labels', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('/about swatches hold their light-theme contrast in dark', async ({ page }) => {
    const { light, dark } = await amberContrastBothThemes(page, '/about', '.swatches p');

    expect(Object.keys(light).length, 'no amber-painted labels found — the probe went blind').toBeGreaterThan(0);
    for (const [key, lightRatio] of Object.entries(light)) {
      expect(dark[key], `${key} vanished from the dark render`).toBeDefined();
      // 0.05 absorbs float noise only; a flipping ink token loses ~10x, not 5%.
      expect(dark[key], `${key} degraded in dark (light ${lightRatio.toFixed(2)}:1)`)
        .toBeGreaterThanOrEqual(lightRatio - 0.05);
    }
  });

  test('/member/shared/translator primary action holds its contrast in dark', async ({ page }) => {
    await page.route(/\/api\/translator\/languages(\?.*)?$/, async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          installed_pairs: 1,
          total_pairs: 2,
          languages: [
            { code: 'en', name: 'English', targets: [{ code: 'sv', name: 'Swedish', installed: true }] },
            { code: 'sv', name: 'Swedish', targets: [{ code: 'en', name: 'English', installed: false }] },
          ],
        }),
      });
    });

    const { light, dark } = await amberContrastBothThemes(page, '/member/shared/translator', '.translate-card');

    // The Translate action is an AspButton variant="primary" now (#4338): the
    // amber it paints is the DS .btn--primary, and the .btn-translate class it
    // still carries is layout-only (align-self). Anchor on the DS class, so
    // this keeps asserting "the probe actually sampled the primary action"
    // rather than "an app class happens to still be on the element".
    const translate = Object.keys(light).find(
      (k) => k.includes('btn--primary') && k.includes('Translate'),
    );
    expect(translate, 'the primary Translate action was not among the amber labels measured').toBeTruthy();

    for (const [key, lightRatio] of Object.entries(light)) {
      expect(dark[key], `${key} vanished from the dark render`).toBeDefined();
      expect(dark[key], `${key} degraded in dark (light ${lightRatio.toFixed(2)}:1)`)
        .toBeGreaterThanOrEqual(lightRatio - 0.05);
    }
  });
});
