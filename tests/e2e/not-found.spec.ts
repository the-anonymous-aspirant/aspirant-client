import { test, expect } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * The catch-all route renders NotFound.vue for any path the router does
 * not match. Vite preview (the test server) does not apply the nginx
 * `rewrite ^/trusted/pappas-armhavningar/?$ /trusted/pappas-pushups
 * permanent;` rule from default.conf, so the renamed URL falls through
 * to the Vue catch-all here — which is the safety net the nginx layer
 * is meant to complement. The nginx 301 is verified by inspecting
 * default.conf; production traffic never reaches the catch-all for the
 * renamed path because nginx redirects first.
 */

test.describe('Graceful 404 catch-all', () => {
  test('unknown root-level path renders NotFound for anonymous visitor', async ({ page }) => {
    await page.goto('/totally-nonexistent-page');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.not-found-title')).toHaveText('404');
    await expect(page.locator('.not-found-attempted code'))
      .toHaveText('/totally-nonexistent-page');
    await expect(page.locator('.not-found-home')).toBeVisible();
  });

  test('unknown trusted-prefix path renders NotFound for anonymous visitor', async ({ page }) => {
    await page.goto('/trusted/nonexistent-page');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.not-found-title')).toHaveText('404');
  });

  test('renamed route falls through to NotFound when nginx layer absent', async ({ page }) => {
    // In production nginx 301s this to /trusted/pappas-pushups before Vue
    // sees the request; in test (vite preview) the SPA fallback delivers
    // index.html and the Vue catch-all takes over. Either terminal state
    // is acceptable per the task contract — this test pins the in-app
    // safety net.
    await page.goto('/trusted/pappas-armhavningar');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.not-found-title')).toHaveText('404');
  });

  test('NotFound link returns to home', async ({ page }) => {
    await page.goto('/some-typo');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.not-found-home').click();
    await expect(page).toHaveURL('/');
  });

  test('valid route still works (catch-all does not shadow named routes)', async ({ page }) => {
    await seedTrustedSession(page);
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.not-found-title')).toHaveCount(0);
  });
});
