import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #2195-C1 / #2198: Penpot is nginx-served at /admin/penpot/
 *  (auth_request-gated reverse proxy — not a Vue route), and the admin page
 *  card opens it in a new tab. Only the SPA side is testable here; the nginx
 *  location itself is exercised at cell dogfood. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('Penpot design service entry', () => {
  test.beforeEach(async ({ page }) => {
    await installNoiseCatchAll(page);
  });

  test('anonymous visitor is redirected away from the admin page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('admin card opens Penpot in a new tab at /admin/penpot/', async ({ page, context }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    const card = page.getByText('Penpot Design', { exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const popupPromise = context.waitForEvent('page');
    await card.click();
    const popup = await popupPromise;
    expect(new URL(popup.url()).pathname).toBe('/admin/penpot/');
  });

  test('card copy flags the new-tab (no iframe embed) behavior', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByText(/Opens in a new tab \(full canvas, not an iframe embed\)/)).toBeVisible();
  });
});
