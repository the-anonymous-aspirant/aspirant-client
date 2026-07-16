import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #2218 (#2221): the Histoire workbench is nginx-served at
 *  /admin/histoire/ (auth_request-gated reverse proxy — not a Vue route),
 *  and the admin page card opens it in a new tab. Only the SPA side is
 *  testable here; the nginx location is exercised at cell dogfood. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('Histoire design-system entry', () => {
  test.beforeEach(async ({ page }) => {
    await installNoiseCatchAll(page);
  });

  test('admin card opens Histoire in a new tab at /admin/histoire/', async ({ page, context }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    const card = page.getByText('Histoire — Design System', { exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const popupPromise = context.waitForEvent('page');
    await card.click();
    const popup = await popupPromise;
    expect(new URL(popup.url()).pathname).toBe('/admin/histoire/');
  });
});
