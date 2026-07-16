import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #2195-C1: /admin/penpot renders the launch surface and a
 *  live status banner fed by the nginx-proxied /penpot-status probe. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('/admin/penpot — design service entry', () => {
  test.beforeEach(async ({ page }) => {
    await installNoiseCatchAll(page);
  });

  test('anonymous visitor is redirected away from the admin route', async ({ page }) => {
    await page.goto('/admin/penpot');
    await expect(page).not.toHaveURL(/\/admin\/penpot/);
  });

  test('admin sees ONLINE banner when /penpot-status responds', async ({ page }) => {
    await seedAdminSession(page);
    await page.route('**/penpot-status', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'OK' });
    });
    await page.goto('/admin/penpot');
    await expect(page.locator('h1')).toHaveText('Penpot Design');
    await expect(page.locator('.status-label')).toHaveText('ONLINE');
    const launch = page.locator('a.launch-button');
    await expect(launch).toHaveAttribute('href', 'https://design.the-aspirant.com');
    await expect(launch).toHaveAttribute('target', '_blank');
  });

  test('admin sees UNREACHABLE banner when the probe fails', async ({ page }) => {
    await seedAdminSession(page);
    await page.route('**/penpot-status', async (route: Route) => {
      await route.fulfill({ status: 502, contentType: 'text/plain', body: 'bad gateway' });
    });
    await page.goto('/admin/penpot');
    await expect(page.locator('.status-label')).toHaveText('UNREACHABLE');
  });

  test('admin page lists the Penpot Design card routing here', async ({ page }) => {
    await seedAdminSession(page);
    await page.route('**/penpot-status', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'OK' });
    });
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    const card = page.getByText('Penpot Design', { exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/admin\/penpot$/);
  });
});
