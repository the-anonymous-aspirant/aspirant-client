import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4512 — the six year steppers in GameTimeline's Precision mode are AspButton
 * (`size="sm"`, `variant="secondary"`), the last native `<button>` migration in
 * this file that had a DS answer.
 *
 * The other six natives here are recorded holds, not oversights: two `.mode-btn`
 * cards (a content card, not a labelled control) and four `.tab-btn` strips
 * (AspSegmented's icon slot is a text glyph, `AspSegmented.vue:142`, while these
 * render an `<img>` from AssetManager). The rationale now lives in the template
 * next to each; #4246's census claimed every survivor carried one and was wrong
 * about exactly these twelve (`failure_mode` 2485).
 *
 * Three things are asserted, because each fails differently:
 *  1. the control IS the DS button — a class-list read, which is what catches a
 *     silent revert to `<button class="year-btn">`;
 *  2. it still STEPS — the arithmetic and both clamps, which a class-list read
 *     cannot see and which is the only thing the player actually notices;
 *  3. it stays LEGIBLE in both themes — the ratio, not the token, per the
 *     construction #4493 established after two defects rendered a perfectly
 *     correct class list.
 */

const AA_TEXT = 4.5;

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Foreground over the composited ancestor background stack — identical to
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

async function withTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
}

/** Precision mode on the tech timeline: sliderMin -10000, defaultYear 1500
 *  (GameTimelineTech.vue:24-25), so the display opens on "1500 CE". */
async function openPrecisionMode(page: Page): Promise<void> {
  await seedTrustedSession(page);
  await page.route(/\/api\//, json({}));
  await page.goto('/quizzes/timeline-tech');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('.mode-selector button.mode-btn').nth(1).click();
  await expect(page.locator('.year-display')).toHaveText('1500 CE');
}

const step = (page: Page, label: string) =>
  page.locator('.year-adjust').getByRole('button', { name: label, exact: true });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#4512 GameTimeline year steppers — ${theme}`, () => {
    test('the six steppers are DS buttons, not native ones', async ({ page }) => {
      await withTheme(page, theme);
      await openPrecisionMode(page);

      const steppers = page.locator('.year-adjust button');
      await expect(steppers).toHaveCount(6);

      // The DS root class is what a silent revert to `<button class="year-btn">`
      // would drop. `btn--size-sm` specifically: `size="icon"` would pin 44x44
      // and break the row, which is the reason this migration was held before.
      for (const label of ['-100', '-10', '-1', '+1', '+10', '+100']) {
        await expect(step(page, label), `${theme}: ${label} is the DS button`)
          .toHaveClass(/\bbtn\b.*\bbtn--secondary\b.*\bbtn--size-sm\b/);
      }
    });

    test('they still step the year by their stated amounts', async ({ page }) => {
      await withTheme(page, theme);
      await openPrecisionMode(page);
      const display = page.locator('.year-display');

      await step(page, '+100').click();
      await expect(display, `${theme}: +100 from 1500`).toHaveText('1600 CE');
      await step(page, '-1').click();
      await expect(display, `${theme}: -1 from 1600`).toHaveText('1599 CE');
      await step(page, '-10').click();
      await expect(display, `${theme}: -10 from 1599`).toHaveText('1589 CE');
      await step(page, '+10').click();
      await expect(display, `${theme}: +10 from 1589`).toHaveText('1599 CE');
      await step(page, '+1').click();
      await expect(display, `${theme}: +1 from 1599`).toHaveText('1600 CE');
      await step(page, '-100').click();
      await expect(display, `${theme}: -100 from 1600`).toHaveText('1500 CE');
    });

    test('the upper clamp still holds at 2025', async ({ page }) => {
      await withTheme(page, theme);
      await openPrecisionMode(page);
      const display = page.locator('.year-display');

      // 1500 + 6 x 100 = 2100, which Math.min(2025, …) must pull back to 2025.
      for (let i = 0; i < 6; i += 1) await step(page, '+100').click();
      await expect(display, `${theme}: clamped at the present`).toHaveText('2025 CE');
    });

    /* Two ratio assertions, because they fail from different directions and
       only the second one can be broken from inside this file.

       The stepper is `variant="secondary"`, which carries its OWN opaque
       `--surface-elevated` fill, so the ancestor walk stops at the button and
       the ratio is decided entirely by the DS pair. Verified, not assumed:
       pinning `.guess-section` to a near-white literal — the exact shape of the
       #4493 D2/D3 defect — leaves this assertion green. It is worth keeping as
       a guard on the DS pair itself, but it is NOT a surface-pairing guard for
       this view, and calling it one would be the false comfort #4493 was about.

       `.year-display` sits in the same row on a translucent white, so its walk
       composites down to `.guess-section` and it DOES move with the panel. That
       is the one that fails if this file's surface goes wrong. */
    test('the stepper carries its own legible DS pair', async ({ page }) => {
      await withTheme(page, theme);
      await openPrecisionMode(page);

      const plus = step(page, '+1');
      await expect(plus).toBeVisible();
      expect(
        await contrastRatio(plus),
        `${theme}: stepper ink over its own DS fill`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    test('the year display beside them stays legible on the panel', async ({ page }) => {
      await withTheme(page, theme);
      await openPrecisionMode(page);

      const display = page.locator('.year-display');
      await expect(display).toBeVisible();
      expect(
        await contrastRatio(display),
        `${theme}: year display over the composited panel`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
}
