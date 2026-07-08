import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

/** Mobile-only assertions on top of the shared regression spec. Native
 *  iOS picker behavior (date wheel, multi-file sheet) is OS-level and not
 *  asserted here — Playwright cannot validate that the iOS native UI was
 *  actually presented. The attribute-level contract (`type="date"`,
 *  `multiple`) lives in the shared desktop spec; this file asserts only
 *  the CSS that *does* change between viewports. */
test.describe('Värdeutlåtande BR-flow — mobile (iPhone 13)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-safari',
      'Mobile-only assertions; the desktop project covers the shared surfaces.',
    );
    await seedTrustedSession(page);
    await installCommanderMocks(page);
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
