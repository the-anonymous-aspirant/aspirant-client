import { test, expect, type Page } from '@playwright/test';
import { open } from './helpers/pageGutter';

/**
 * system_3 #9582 (UX walk 2026-11-02, #9574 AC3-AC5), public pages:
 * - AC3: the /support footer was text-on-light at opacity .7, composited
 *   3.75:1 in light. Muted ink by token, full opacity: >= 4.5:1.
 * - AC4: on /login and /signup with nobody signed in, the sidebar's auth
 *   section rendered empty and still drew its top border under the nav.
 * - AC5: the BTC address sat in a flex row beside a nowrap hint and was
 *   squeezed into a 10-character column. It is one wrapping line now, with
 *   the copy action as a link button under it.
 */

/** Contrast of `selector`'s text against the first opaque ground behind it,
 *  compositing the text colour's alpha and any opacity on the way up. */
function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    // rgb()/rgba() in 0-255, or color(srgb r g b / a) in 0-1, the form a
    // color-mix() token computes to. Anything else throws, never guesses.
    const parse = (c: string) => {
      const srgb = c.match(/^color\(srgb ([^)]+)\)$/);
      if (srgb) {
        const [r, g, b, a = '1'] = srgb[1].split(/[ /]+/).filter(Boolean);
        return [Number(r) * 255, Number(g) * 255, Number(b) * 255, Number(a)];
      }
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) throw new Error(`unparsed colour ${c}`);
      const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    };
    const el = document.querySelector(sel) as HTMLElement;
    let ground: number[] | null = null;
    let opacity = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      opacity *= Number(cs.opacity);
      const bg = parse(cs.backgroundColor);
      if (!ground && n !== el && bg[3] === 1) ground = bg;
    }
    ground = ground ?? parse(getComputedStyle(document.body).backgroundColor);
    const fg = parse(getComputedStyle(el).color);
    const alpha = fg[3] * opacity;
    const mix = [0, 1, 2].map((i) => fg[i] * alpha + ground![i] * (1 - alpha));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(mix), lum(ground)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9582 public polish (${theme})`, () => {
    test('AC3: the support footer reads at least 4.5:1 at full opacity', async ({ page }) => {
      await open(page, '/support', theme);
      const ratio = await contrastOf(page, '.support-footer');
      const opacity = await page
        .locator('.support-footer')
        .evaluate((e) => getComputedStyle(e).opacity);
      console.log(`AC3 ${theme} footer contrast=${ratio.toFixed(2)} opacity=${opacity}`);
      expect(opacity).toBe('1');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    for (const path of ['/login', '/signup']) {
      test(`AC4: ${path} signed out leaves no bordered element under the sidebar nav`, async ({
        page,
      }) => {
        const phone = (page.viewportSize()?.width ?? 1280) < 768;
        await open(page, path, theme);
        if (phone) await page.locator('.mobile-menu-toggle').click();
        const stray = await page.evaluate(() => {
          const sidebar = document.querySelector('.sidebar') as HTMLElement;
          const nav = sidebar.querySelector('.nav-links') as HTMLElement;
          const navBottom = nav.getBoundingClientRect().bottom;
          const out: string[] = [];
          for (const el of Array.from(sidebar.querySelectorAll<HTMLElement>('*'))) {
            const r = el.getBoundingClientRect();
            if (r.top < navBottom || r.width === 0) continue;
            const cs = getComputedStyle(el);
            if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none')
              out.push(`${el.tagName.toLowerCase()}.${el.className}`);
          }
          return out;
        });
        console.log(`AC4 ${theme} ${path} bordered-below-nav=${stray.join(',') || '-'}`);
        expect(stray).toEqual([]);
      });
    }

    test('AC5: the BTC address is one wrapping line with the copy control under it', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: () => Promise.resolve() },
          configurable: true,
        });
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, '/support', theme);
      const code = page.locator('.address-box code');
      const geo = await code.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const lh =
          parseFloat(getComputedStyle(el).lineHeight) ||
          parseFloat(getComputedStyle(el).fontSize) * 1.2;
        const box = (el.parentElement as HTMLElement).getBoundingClientRect();
        return {
          lines: Math.round(r.height / lh),
          width: r.width,
          boxWidth: box.width,
          bottom: r.bottom,
        };
      });
      const copy = page.getByRole('button', { name: 'Click to copy' });
      const copyTop = (await copy.boundingBox())!.y;
      console.log(
        `AC5 ${theme} address lines=${geo.lines} width=${geo.width}/${geo.boxWidth} copyTop=${copyTop} codeBottom=${geo.bottom}`
      );
      expect(geo.lines).toBeLessThanOrEqual(2);
      // Visible to Playwright is not readable: the link inherits its ink, and
      // on a card that set none it measured 1:1 (#9582).
      const linkRatio = await contrastOf(page, '.copy-address');
      console.log(`AC5 ${theme} copy link contrast=${linkRatio.toFixed(2)}`);
      expect(linkRatio).toBeGreaterThanOrEqual(4.5);
      expect(copyTop).toBeGreaterThanOrEqual(geo.bottom);
      await copy.click();
      await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
    });
  });
}
