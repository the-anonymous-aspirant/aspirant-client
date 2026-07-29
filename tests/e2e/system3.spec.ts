import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #2867 (#2865-B): the system_3 fleet Vue is nginx-served at
 *  /admin/apps/system_3/ (auth_request-gated reverse proxy to the cell backend
 *  — not a Vue route), and the admin page card opens it in a new tab. Only the
 *  SPA side is testable here; the nginx location + the live auth gate are
 *  exercised at the cell cutover dogfood once the backend is up. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('system_3 admin app entry', () => {
  test.beforeEach(async ({ page }) => {
    await installNoiseCatchAll(page);
  });

  test('admin card opens system_3 in a new tab at /admin/apps/system_3/', async ({ page, context }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    const card = page.getByText('system_3', { exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const popupPromise = context.waitForEvent('page');
    await card.click();
    const popup = await popupPromise;
    expect(new URL(popup.url()).pathname).toBe('/admin/apps/system_3/');
  });
});
