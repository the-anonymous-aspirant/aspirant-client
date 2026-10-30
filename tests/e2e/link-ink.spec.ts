import { test, expect, type Page, type Locator } from '@playwright/test';
import { openMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #9191 (§3.121, §3.18, §3.72) — a link takes its surface's ink. The sign-in
 * links ("Create an account", "Forgot your password?") were pinned to the PAGE
 * ink in a component that also mounts on the dark sidebar, so in light they
 * measured 1:1 (#424242 on #424242) for every signed-out visitor (#9105 B2-1);
 * on the page they were body ink with no underline (B2-2) and 16px tall
 * (B3-7). Asserts the outcome: composited contrast, underline, a colour that
 * differs from the text beside it, the 24px target, and the sidebar's required
 * mark on the dark setter.
 */

/** Foreground over the nearest opaque ancestor background; parses both the
 *  rgb() and color(srgb …) forms color-mix() serialises to. */
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
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
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
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

const AA = 4.5;

/** Underlined, and not the same colour as the paragraph text around it. */
async function readsAsLink(link: Locator) {
  return link.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const parent = getComputedStyle(el.parentElement as Element);
    return {
      underlined: cs.textDecorationLine.includes('underline'),
      differs: cs.color !== parent.color,
    };
  });
}

async function open(page: Page, path: string, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/signup/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signup_enabled: false }) }),
  );
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
}

const SIGNIN_LINKS = ['[data-testid="signup-link"]', '[data-testid="forgot-link"]'];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9191 link ink (${theme})`, () => {
    test('sidebar sign-in links clear AA on the sidebar, underlined, distinct from the text', async ({ page }) => {
      await open(page, '/', theme);
      await openMobileSidebarIfPresent(page);
      for (const sel of SIGNIN_LINKS) {
        const link = page.locator(`.sidebar ${sel}`);
        await expect(link).toBeVisible();
        const ratio = await contrastRatio(link);
        console.log(`RATIO ${test.info().project.name} ` + `sidebar ${sel} @ ${theme}: ${ratio.toFixed(2)}:1`);
        expect(ratio, `sidebar ${sel} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
        expect(await readsAsLink(link), `sidebar ${sel}`).toEqual({ underlined: true, differs: true });
      }
    });

    test('the sidebar required mark clears AA on the dark sidebar', async ({ page }) => {
      await open(page, '/', theme);
      await openMobileSidebarIfPresent(page);
      const marks = page.locator('.sidebar .field__required');
      await expect(marks).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        const ratio = await contrastRatio(marks.nth(i));
        console.log(`RATIO ${test.info().project.name} ` + `sidebar * ${i} @ ${theme}: ${ratio.toFixed(2)}:1`);
        expect(ratio, `sidebar * ${i} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    });

    test('/login links clear AA on the page, underlined, distinct, 24px targets', async ({ page }) => {
      await open(page, '/login', theme);
      for (const sel of SIGNIN_LINKS) {
        const link = page.locator(`.login-view-card ${sel}`);
        await expect(link).toBeVisible();
        const ratio = await contrastRatio(link);
        console.log(`RATIO ${test.info().project.name} ` + `/login ${sel} @ ${theme}: ${ratio.toFixed(2)}:1`);
        expect(ratio, `/login ${sel} @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
        expect(await readsAsLink(link), `/login ${sel}`).toEqual({ underlined: true, differs: true });
        const box = await link.boundingBox();
        expect(box!.height, `/login ${sel} height`).toBeGreaterThanOrEqual(24);
      }
    });

    test('/signup "Go to sign in" clears AA, underlined, 24px target', async ({ page }) => {
      await open(page, '/signup', theme);
      const link = page.locator('.next', { hasText: 'Go to sign in' });
      await expect(link).toBeVisible();
      const ratio = await contrastRatio(link);
      console.log(`RATIO ${test.info().project.name} ` + `/signup .next @ ${theme}: ${ratio.toFixed(2)}:1`);
        expect(ratio, `/signup .next @ ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      expect((await readsAsLink(link)).underlined).toBe(true);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    });

    test('sidebar nav items keep their own treatment: not underlined', async ({ page }) => {
      await open(page, '/', theme);
      await openMobileSidebarIfPresent(page);
      const nav = page.locator('.sidebar a.active, .sidebar a.inactive');
      expect(await nav.count()).toBeGreaterThan(0);
      const lines = await nav.evaluateAll((els) => els.map((el) => getComputedStyle(el).textDecorationLine));
      expect(lines.every((l) => !l.includes('underline')), JSON.stringify(lines)).toBe(true);
    });
  });
}
