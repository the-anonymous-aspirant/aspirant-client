import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession } from './helpers/mockBackend';

/**
 * The SQL quiz's step numerals read in both themes (system_3 #10996, UX walk
 * AG4; design_conventions D9, D7).
 *
 * An upcoming step is filled with --border-subtle, #cccccc in BOTH themes, but
 * its numeral took --text-on-light, which flips to #e0e0e0 in dark: about
 * 1.2:1. A completed step's translucent amber composited to rgb(155,116,25) on
 * the dark card, where its #424242 numeral measured 2.35:1. Every step now pairs
 * a theme-fixed fill with the fixed-surface ink. This measures every numeral
 * against its circle as rendered, compositing each translucent layer down to
 * the first opaque one (a first-opaque-ancestor read would skip a translucent
 * fill and measure the wrong background).
 */

async function stepRatios(page: Page) {
  return page.locator('.progress-step').evaluateAll((els) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return [255 * +m[1], 255 * +m[2], 255 * +m[3], m[4] === undefined ? 1 : +m[4]];
      return null;
    };
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (top: number[], bot: number[]) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
    return els.map((el) => {
      const layers: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] === 1) break; }
      }
      let bg = layers.pop()!;
      while (layers.length) bg = over(layers.pop()!, bg);
      const fg = over(parse(getComputedStyle(el).color)!, bg);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return { n: el.textContent!.trim(), cls: el.className.replace('progress-step', '').trim() || 'pending', ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), bg: bg.slice(0, 3).map(Math.round).join(',') };
    });
  });
}
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`every step numeral clears AA, ${theme}, ${size.name}`, async ({ page }) => {
      await seedViewerSession(page);
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/quizzes/sql');
      await expect(page.locator('.progress-step')).toHaveCount(10);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

      // On load: step 1 active, 2 to 10 upcoming.
      const atLoad = await stepRatios(page);
      for (const s of atLoad) expect(s.ratio, `step ${s.n} (${s.cls}) at load`).toBeGreaterThanOrEqual(4.5);

      // After one answer: step 1 completed, 2 active.
      await page.locator('.option input[type=radio]').first().check();
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.locator('.progress-step.completed')).toHaveCount(1);
      const afterOne = await stepRatios(page);
      for (const s of afterOne) expect(s.ratio, `step ${s.n} (${s.cls}) after one answer`).toBeGreaterThanOrEqual(4.5);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      ).toBe(false);
    });
  }
}
