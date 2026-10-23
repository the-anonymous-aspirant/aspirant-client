import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
} from './helpers/mockBackend';

/**
 * system_3 #8503: the history's inline-rename field revealed its box with
 * tokens made for the inside of the dark card, so in light the focused name
 * read 3.84:1 and its border 1.41:1. It now reveals AspInput's box: the field
 * fill and control border on hover, the --text-body border + --shadow-focus
 * ring on focus. Contrasts are composited over the painted surface behind it.
 */

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 640;

async function openHistory(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Tidigare värderingar' }).click();
  await expect(page.locator('[data-test-row-id="row"]')).toBeVisible();
}

const field = (page: Page) => page.locator('[data-test-row-id="row"] .history-name-input');

function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The field's text, fill and border, each composited over the surface painted
 *  behind the field; plus its focus styling and the resolved --shadow-focus. */
function read(el: Locator) {
  return el.evaluate((input) => {
    // rgb()/rgba() carry 0–255 channels; WebKit serializes color-mix() and
    // some tokens as `color(srgb r g b / a)` with 0–1 channels.
    const parse = (c: string) => {
      const n = (c.match(/[\d.]+/g) || []).map(Number);
      const k = c.startsWith('color(') ? 255 : 1;
      return [(n[0] ?? 0) * k, (n[1] ?? 0) * k, (n[2] ?? 0) * k, n.length > 3 ? n[3] : 1];
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
    const chain: Element[] = [];
    for (let n: Element | null = input.parentElement; n; n = n.parentElement) chain.unshift(n);
    let surface = [255, 255, 255];
    for (const n of chain) surface = over(parse(getComputedStyle(n).backgroundColor), surface);
    const cs = getComputedStyle(input);
    const fill = over(parse(cs.backgroundColor), surface);
    // --shadow-focus as the browser computes it, for a like-for-like compare.
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--shadow-focus)';
    input.parentElement!.appendChild(probe);
    const focusShadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return {
      surface,
      fill,
      text: over(parse(cs.color), fill),
      border: over(parse(cs.borderTopColor), surface),
      borderAlpha: parse(cs.borderTopColor)[3],
      bgAlpha: parse(cs.backgroundColor)[3],
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
      focusShadow,
    };
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`#8503 the history name field (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedTrustedSession(page);
      await installCommanderMocks(page);
      seedProcessedRows([{ id: 'row', name: 'Kunden återkom', final_values: { objekt_short: 'Testby Eklunda 1:76' } }]);
      await openHistory(page);
    });

    test('focus: AspInput\'s pair — text ≥ 4.5:1 on its fill, border ≥ 3:1, the house ring, no UA outline', async ({ page }) => {
      await field(page).focus();
      const f = await read(field(page));
      expect(contrast(f.text, f.fill), JSON.stringify(f)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(f.border, f.surface), JSON.stringify(f)).toBeGreaterThanOrEqual(3);
      expect(f.boxShadow).toBe(f.focusShadow);
      expect(f.boxShadow).not.toBe('none');
      expect(f.outlineStyle).toBe('none');
    });

    test('hover (desktop): the field fill and a ≥ 3:1 control border', async ({ page }) => {
      test.skip(isPhone(page), 'no hover on a touch screen');
      await field(page).hover();
      const h = await read(field(page));
      expect(contrast(h.text, h.fill), JSON.stringify(h)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(h.border, h.surface), JSON.stringify(h)).toBeGreaterThanOrEqual(3);
    });

    test('rest: transparent in the table; the at-rest boundary on a touch card', async ({ page }) => {
      await page.mouse.move(0, 0);
      const r = await read(field(page));
      expect(r.bgAlpha).toBe(0);
      if (isPhone(page)) {
        expect(contrast(r.border, r.surface), JSON.stringify(r)).toBeGreaterThanOrEqual(3);
      } else {
        expect(r.borderAlpha).toBe(0);
      }
    });
  });
}
