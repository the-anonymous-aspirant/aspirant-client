import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
} from './helpers/mockBackend';

/**
 * system_3 #8465: "Tidigare värderingar" was a 651px six-column table that
 * scrolled a 390px phone sideways by 309px. Below 640px each valuation is now a
 * card (design_agent's ruling c52088, §3.114 decision 6). Names and properties
 * are invented.
 */

const LONG = 'LGH 1201 Bostadsrättsföreningen Testgårdens Kvarter Norra Upplagan (769600-0000)';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 640;

async function openHistory(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Tidigare värderingar' }).click();
  await expect(page.locator('[data-test-row-id]').first()).toBeVisible();
}

/** WCAG relative luminance contrast of two opaque sRGB colours. */
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

test.describe('#8465 Tidigare värderingar on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
    seedProcessedRows([
      {
        id: 'long',
        name: `2026-08-12_${LONG}`,
        final_values: { objekt: LONG, objekt_short: LONG, adress: 'Exempelgatan 1', marknadsvarde_kr: '12 500 000' },
        created_at: '2026-08-12T09:00:00Z',
      },
      {
        id: 'house',
        name: 'Kunden återkom',
        final_values: { objekt_short: 'Testby Eklunda 1:76', marknadsvarde_kr: '3 050 000' },
        created_at: '2026-08-10T09:00:00Z',
      },
    ]);
  });

  test('a card per valuation below 640px, the table above; no sideways scroll', async ({ page }) => {
    await openHistory(page);
    if (isPhone(page)) {
      await expect(page.locator('[data-test="history-cards"]')).toBeVisible();
      await expect(page.locator('[data-test="history-table"]')).toHaveCount(0);
    } else {
      await expect(page.locator('[data-test="history-table"]')).toBeVisible();
      await expect(page.locator('[data-test="history-cards"]')).toHaveCount(0);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBe(0);
  });

  test('card: property at the left padding edge, value flush right on one line', async ({ page }) => {
    test.skip(!isPhone(page), 'cards render below 640px');
    await openHistory(page);
    const cards = await page.locator('.history-card').evaluateAll((els) =>
      els.map((card) => {
        const cs = getComputedStyle(card);
        const box = card.getBoundingClientRect();
        const prop = card.querySelector('.history-card__property')!.getBoundingClientRect();
        const value = card.querySelector('.history-card__value')!;
        const v = value.getBoundingClientRect();
        return {
          id: card.getAttribute('data-test-row-id'),
          leftEdge: Math.abs(prop.left - (box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft))),
          rightEdge: Math.abs(v.right - (box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight))),
          valueLines: value.getClientRects().length,
          value: value.textContent?.trim(),
        };
      }),
    );
    expect(cards.map((c) => c.value)).toEqual(['12 500 000 kr', '3 050 000 kr']);
    for (const c of cards) {
      expect(c.leftEdge, `${c.id} property edge`).toBeLessThanOrEqual(1);
      expect(c.rightEdge, `${c.id} value edge`).toBeLessThanOrEqual(1);
      expect(c.valueLines, `${c.id} value one line`).toBe(1);
    }
  });

  test('card: the menu opens fully in view and every action is reachable; the target is 44px', async ({ page }) => {
    test.skip(!isPhone(page), 'cards render below 640px');
    await openHistory(page);
    const card = page.locator('.history-card[data-test-row-id="house"]');
    const trigger = card.locator('.row-menu-trigger');
    const t = await trigger.boundingBox();
    expect(Math.min(t!.width, t!.height)).toBeGreaterThanOrEqual(44);
    await trigger.click();
    for (const name of ['Redigera', '.docx', '.pdf', 'Radera']) {
      const item = card.getByRole('menuitem', { name, exact: true });
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    // Redigera still opens the review with the row's values.
    await card.getByRole('menuitem', { name: 'Redigera', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`card (${scheme}): rename still saves; on a touch screen the name field shows its boundary at rest (≥ 3:1)`, async ({ page }) => {
      test.skip(!isPhone(page), 'cards render below 640px');
      await page.emulateMedia({ colorScheme: scheme });
      await openHistory(page);
      const input = page.locator('.history-card[data-test-row-id="house"] .history-name-input');
      const rest = await input.evaluate((el) => {
        // rgb()/rgba() carry 0–255 channels; WebKit serializes a color-mix()
        // result as `color(srgb r g b / a)` with 0–1 channels.
        const parse = (c: string) => {
          const n = (c.match(/[\d.]+/g) || []).map(Number);
          const k = c.startsWith('color(') ? 255 : 1;
          return [(n[0] ?? 0) * k, (n[1] ?? 0) * k, (n[2] ?? 0) * k, n.length > 3 ? n[3] : 1];
        };
        const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
        // The painted surface behind the field: every ancestor's background,
        // blended from the root down over the white canvas — translucent
        // layers included, which a first-opaque-ancestor read gets wrong.
        const chain: Element[] = [];
        for (let n: Element | null = el.parentElement; n; n = n.parentElement) chain.unshift(n);
        let surface = [255, 255, 255];
        for (const n of chain) surface = over(parse(getComputedStyle(n).backgroundColor), surface);
        const border = parse(getComputedStyle(el).borderTopColor);
        return { hoverNone: matchMedia('(hover: none)').matches, raw: getComputedStyle(el).borderTopColor, border: over(border, surface), surface, alpha: border[3] };
      });
      // The WebKit iPhone project is a touch device; if this ever stops holding,
      // the boundary assertion below would be testing nothing.
      expect(rest.hoverNone).toBe(true);
      expect(rest.alpha).toBeGreaterThan(0);
      expect(contrast(rest.border, rest.surface), JSON.stringify(rest)).toBeGreaterThanOrEqual(3);

      await input.fill('Ny etikett');
      await input.press('Enter');
      await input.blur();
      await expect(input).toHaveValue('Ny etikett');
    });
  }

  test('toolbar below 640px: stacked full width, CSV first', async ({ page }) => {
    test.skip(!isPhone(page), 'stacks below 640px');
    await openHistory(page);
    const bar = await page.locator('.history-toolbar').boundingBox();
    const csv = await page.getByRole('button', { name: /Exportera alla till CSV/ }).boundingBox();
    const reload = await page.getByRole('button', { name: 'Ladda om listan' }).boundingBox();
    expect(csv!.y).toBeLessThan(reload!.y);
    expect(Math.abs(csv!.width - bar!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(reload!.width - bar!.width)).toBeLessThanOrEqual(1);
  });
});
