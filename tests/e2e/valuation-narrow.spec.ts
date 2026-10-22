import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

/**
 * system_3 #8423: on a 390px phone the review step was 451px wide — the tab
 * panel, a flex item with `min-width: auto`, grew to its widest content (a
 * provenance row, the side-by-side action buttons) — so 30px were clipped on
 * each side. Rulings: design_agent c51877. Names and beteckningar are invented.
 */

const REVIEW_LEGEND = 'Granska och justera';
const LONG = 'LGH 1201 Bostadsrättsföreningen Testgårdens Kvarter Norra Upplagan (769600-0000)';

const BANNERS = {
  documents: [
    {
      filename: 'fastighetsutdrag-med-ett-mycket-langt-filnamn-2026-10-22.pdf',
      fields: [
        { key: 'source_class', value: 'fastighetsutdrag', confidence: 'confident', source_page: 1 },
        { key: 'property_shape', value: 'bostadsratt', confidence: 'confident', source_page: 1 },
        { key: 'objekt', value: LONG, confidence: 'confident', source_page: 1 },
        { key: 'objekt_short', value: LONG, confidence: 'confident', source_page: 1 },
        { key: 'document_date', value: '2026-09-15', confidence: 'confident', source_page: 1 },
      ],
      outcome: 'extracted',
      samintecknad: true,
      samintecknad_evidence: [{ section: 'inteckningar', row: '2', other_property: 'Testby EKLUNDA 1:11' }],
      diagnostics: { ocr_used: true, outcome: 'extracted' },
    },
  ],
  operator_defaults: {},
};

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 640;

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
  const modal = page.getByRole('dialog', { name: 'OBS! samintecknad' });
  if (await modal.isVisible().catch(() => false)) await modal.getByRole('button', { name: 'Jag förstår' }).click();
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('#8423 the Värdeutlåtande fits a phone', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('the review step has no sideways page scroll, with "Visa rådata" closed and open', async ({ page }) => {
    await installCommanderMocks(page);
    await walkToReview(page);
    // Polled: the phone sidebar's slide-out briefly widens the page as it closes.
    await expect.poll(() => pageOverflow(page)).toBe(0);

    await page.getByText('Visa rådata från extraheringen').click();
    await expect.poll(() => pageOverflow(page)).toBe(0);
    // The raw table may be wider than the card; then it scrolls in its own island.
    const island = await page.locator('.provenance-scroll').first().evaluate(el => ({
      overflowX: getComputedStyle(el).overflowX,
      fits: el.getBoundingClientRect().right <= document.documentElement.clientWidth,
    }));
    expect(island).toEqual({ overflowX: 'auto', fits: true });
  });

  test('banners: badge above the text on a phone, one row on desktop', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: BANNERS });
    await walkToReview(page);
    const banners = page.locator('.extract-warning');
    expect(await banners.count()).toBeGreaterThanOrEqual(2);
    const geometry = await banners.evaluateAll(els =>
      els.map(el => {
        const badge = (el.firstElementChild as HTMLElement).getBoundingClientRect();
        const text = (el.querySelector(':scope > div') as HTMLElement).getBoundingClientRect();
        return {
          id: el.getAttribute('data-testid'),
          dx: Math.abs(badge.left - text.left),
          textBelowBadge: text.top >= badge.bottom - 0.5,
          topsEqual: Math.abs(badge.top - text.top) <= 1,
          overflow: el.scrollWidth - el.clientWidth,
        };
      }),
    );
    for (const g of geometry) {
      expect(g.overflow, `${g.id} overflows`).toBe(0);
      if (isPhone(page)) {
        expect(g.dx, `${g.id} badge/text edge`).toBeLessThanOrEqual(1);
        expect(g.textBelowBadge, `${g.id} text below badge`).toBe(true);
      } else {
        expect(g.topsEqual, `${g.id} one row`).toBe(true);
      }
    }
    await expect.poll(() => pageOverflow(page)).toBe(0);
  });

  test('the action row: stacked, primary first, full width on a phone; a row on desktop', async ({ page }) => {
    await installCommanderMocks(page);
    await walkToReview(page);
    const row = page.locator('.action-row');
    const primary = row.getByRole('button', { name: /Generera värdeutlåtande/ });
    const cancel = row.getByRole('button', { name: 'Avbryt' });
    const [r, p, c] = [await row.boundingBox(), await primary.boundingBox(), await cancel.boundingBox()];
    if (isPhone(page)) {
      expect(p!.y).toBeLessThan(c!.y);
      expect(Math.abs(p!.width - r!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(c!.width - r!.width)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(p!.y - c!.y)).toBeLessThanOrEqual(1);
      expect(c!.x).toBeLessThan(p!.x);
    }
  });

  test('the about tab has no sideways page scroll either', async ({ page }) => {
    await installCommanderMocks(page);
    await page.goto('/member/personal/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: 'Om verktyget' }).click();
    await expect(page.getByRole('tab', { name: 'Om verktyget' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => pageOverflow(page)).toBe(0);
  });
});
