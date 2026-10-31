import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSession,
  seedViewerSession,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/** system_3 #8634 / #8645 — the admin-only card editor's shell. Operator
 *  decision 1: the app is visible to and usable by the admin only. The router
 *  guard sends lower tiers to the admin sign-in, `/admin/login` (system_3
 *  #9270: while the Cloudflare Access gate is on, an admin account signed in
 *  through /login holds a Member session, and that page is its way to the
 *  Admin tier); display-side only, since the server gates every
 *  /cardgen/* route to Admin, walked by aspirant-server's cardgen gate tests).
 *  No backend runs: every /api call is answered 204 by the catch-all, which is
 *  all this shell needs. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

// Ordered so every click changes the tab: assets is the default and comes last.
const TABS = ['templates', 'cards', 'export', 'assets'];

test.describe('/admin/cardgen — admin-only shell', () => {
  test('a Viewer is sent to the admin sign-in, not the shell', async ({ page }) => {
    await seedViewerSession(page);
    await installNoiseCatchAll(page);
    await page.goto('/admin/cardgen');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/cardgen');
    await expect(page.locator('[data-test="cardgen-app"]')).toHaveCount(0);
  });

  test('a Member is sent to the admin sign-in, not the shell', async ({ page }) => {
    await seedTrustedSession(page);
    await installNoiseCatchAll(page);
    await page.goto('/admin/cardgen/templates');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/cardgen/templates');
    await expect(page.locator('[data-test="cardgen-app"]')).toHaveCount(0);
  });

  test('an Admin reaches the shell from the tile and switches tabs', async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.application-card', { hasText: 'Card Editor' }).click();
    await expect(page).toHaveURL(/\/admin\/cardgen$/);
    await expect(page.getByRole('heading', { name: 'Card Editor', level: 1 })).toBeVisible();

    // Default tab is assets; each tab has a panel and a URL.
    await expect(page.locator('[data-test="cardgen-panel-assets"]')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(TABS.length);
    for (const tab of TABS) {
      await page.locator(`[data-test="cardgen-tab-${tab}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/cardgen/${tab}$`));
      await expect(page.locator(`[data-test="cardgen-panel-${tab}"]`)).toBeVisible();
      await expect(page.locator(`[data-test="cardgen-tab-${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('a deep link to a tab opens that tab; an unknown tab falls back to assets', async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await page.goto('/admin/cardgen/export');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="cardgen-panel-export"]')).toBeVisible();
    await page.goto('/admin/cardgen/nonsense');
    await expect(page.locator('[data-test="cardgen-panel-assets"]')).toBeVisible();
  });
});
