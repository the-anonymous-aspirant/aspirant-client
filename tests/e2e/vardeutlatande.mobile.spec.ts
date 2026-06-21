import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

/** Mobile-only assertions on top of the shared regression spec. CSS rules
 *  scoped to @media (max-width: 768px) in ValuationStatement.vue change the
 *  comparable-sales layout from columns to per-row cards; the desktop spec
 *  exercises the column shape, this one locks the mobile-card shape.
 *
 *  Native iOS picker behavior (date wheel, multi-file sheet) is OS-level
 *  and not asserted here — Playwright cannot validate that the iOS native
 *  UI was actually presented. The attribute-level contract (`type="date"`,
 *  `multiple`) lives in the shared desktop spec; this file asserts only the
 *  CSS that *does* change between viewports. */
test.describe('Värdeutlåtande BR-flow — mobile (iPhone 13)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-safari',
      'Mobile-only assertions; the desktop project covers the shared surfaces.',
    );
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('comparable-sales table collapses into per-row cards on mobile', async ({ page }) => {
    await walkToReview(page);
    const block = page.locator('.comparables-block');
    await expect(block).toBeVisible();

    // The mobile @media block sets `tr { display: block; background: #fff }`
    // so each row reads as a card and stays light-on-light readable.
    const firstRow = page.locator('.comparables-table tbody tr').first();
    const { display, bg } = await firstRow.evaluate(el => {
      const cs = getComputedStyle(el as HTMLElement);
      return { display: cs.display, bg: cs.backgroundColor };
    });
    expect(display).toBe('block');
    expect(bg).toBe('rgb(255, 255, 255)');

    // The header row hides (display:none); the per-cell data-label CSS
    // pseudo-element carries the column title instead.
    const headerDisplay = await page
      .locator('.comparables-table thead')
      .evaluate(el => getComputedStyle(el as HTMLElement).display);
    expect(headerDisplay).toBe('none');
  });

  test('field-row stacks label-over-input on mobile', async ({ page }) => {
    await walkToReview(page);
    const firstRow = page.locator('.field-row').first();
    const cols = await firstRow.evaluate(
      el => getComputedStyle(el as HTMLElement).gridTemplateColumns,
    );
    // The desktop rule pins to "220px 1fr"; the mobile block collapses to
    // a single column so the input grows to the viewport width.
    expect(cols).not.toContain('220px');
  });
});

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/trusted/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Värdeutlåtande' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible({
    timeout: 15_000,
  });
}
