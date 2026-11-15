import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent, openMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * UX walk AG7 (system_3 #10999): on the test stack, with no icon asset
 * reachable at all, every sidebar entry showed a solid red status block and
 * the logo slot a solid amber one (D8: status colours mean status). An
 * application-card icon that failed the same way left a reserved, visibly
 * empty 60px box above the card's text.
 *
 * Both failure-fetch helpers 404 every /api/fetch-object/ call, matching
 * `asset-fallback.spec.ts`'s existing "the default is missing too" control.
 */

async function failEveryAssetFetch(page: Page): Promise<void> {
  await page.route(/\/api\/fetch-object\//, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [390, 1440]) {
  test.describe(`AG7 at ${width}px`, () => {
    test('a failed sidebar icon and the stuck logo both take the neutral box, not red or amber', async ({ page }) => {
      await failEveryAssetFetch(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/');
      if (width === 390) await openMobileSidebarIfPresent(page);
      else await dismissMobileSidebarIfPresent(page);

      const errorIcon = page.locator('.sidebar-image.error').first();
      await expect(errorIcon).toBeVisible();
      const logo = page.locator('.aspiring-hand-logo.logo-failed');
      await expect(logo).toBeVisible();

      // The reference neutral box this task reuses: AspInput's control
      // background, right below in the same sidebar's sign-in form.
      const referenceBox = page.locator('.sidebar input[name="username"]').locator('..');
      await expect(referenceBox).toBeVisible();
      const [iconColor, logoColor, referenceColor] = await Promise.all([
        errorIcon.evaluate((el) => getComputedStyle(el).backgroundColor),
        logo.evaluate((el) => getComputedStyle(el).backgroundColor),
        referenceBox.evaluate((el) => getComputedStyle(el).backgroundColor),
      ]);

      expect(iconColor, 'failed icon matches the neutral reference box').toBe(referenceColor);
      expect(logoColor, 'stuck logo matches the neutral reference box').toBe(referenceColor);

      expect(await noSideways(page)).toBeLessThanOrEqual(0);
    });

    test('a card whose icon and the fallback both fail closes up the empty box', async ({ page }) => {
      await failEveryAssetFetch(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await seedViewerSession(page);
      await page.goto('/quizzes');
      await dismissMobileSidebarIfPresent(page);

      const card = page.locator('.quiz-list .application-card').first();
      await expect(card).toBeVisible();
      const placeholder = card.locator('.app-image-placeholder');
      await expect(placeholder).toHaveCount(1);
      const box = await placeholder.boundingBox();
      expect(box?.height ?? -1, 'the empty box reserves no height').toBe(0);

      expect(await noSideways(page)).toBeLessThanOrEqual(0);
    });
  });
}
