import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The admin sign-in (system_3 #8798, #9270).
 *
 *  /admin/login posts to /admin/sign-in, which nginx proxies to aspirant-server's
 *  POST /login/admin inside the /admin Cloudflare Access application. While the
 *  Access gate is on, /api/login gives an admin account Member, so the router
 *  sends every admin route here: anonymous visitors, and sessions below the
 *  admin tier. These tests pin the SPA's half: which endpoint each form posts
 *  to, where the guard sends a visitor, and that a capped session is not
 *  bounced off the one page it needs. The server's half has its own tests in
 *  aspirant-server (admin_login_test.go). */

async function recordLogins(page: Page): Promise<string[]> {
  const posted: string[] = [];
  const answer = async (route: Route) => {
    posted.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { username: 'e2e-admin', role: 'Admin' } }),
    });
  };
  await page.route(/\/admin\/sign-in$/, answer);
  await page.route(/\/api\/login$/, answer);
  return posted;
}

async function fillAndSubmit(page: Page): Promise<void> {
  await page.locator('input[name="username"]').fill('e2e-admin');
  await page.locator('input[name="password"]').fill('hunter2');
  await page.getByRole('button', { name: 'Login' }).click();
}

test.describe('Admin sign-in at /admin/login', () => {
  test('shows the admin form, without the sign-up or recovery links', async ({ page }) => {
    await page.goto('/admin/login');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
    // One form on the page: the sidebar's own login is suppressed here too.
    await expect(page.locator('input[name="username"]')).toHaveCount(1);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.getByTestId('signup-link')).toHaveCount(0);
    await expect(page.getByTestId('forgot-link')).toHaveCount(0);
  });

  test('posts to /admin/sign-in, never to /api/login', async ({ page }) => {
    const posted = await recordLogins(page);
    await page.goto('/admin/login?redirect=/admin');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmit(page);
    await expect.poll(() => posted).toEqual(['/admin/sign-in']);
  });

  test('the member login still posts to /api/login', async ({ page }) => {
    const posted = await recordLogins(page);
    await page.goto('/login?redirect=/');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmit(page);
    await expect.poll(() => posted).toEqual(['/api/login']);
  });

  test('an anonymous visit to an admin route lands on the admin sign-in', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/users');
  });

  test('a session below the admin tier on an admin route lands on the admin sign-in', async ({ page }) => {
    // While the gate is on, an admin account signed in through /login holds a
    // Member-tier session; this is how it reaches the Admin tier.
    await seedTrustedSession(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/users');
  });

  test('a session below the admin tier is not bounced off /admin/login', async ({ page }) => {
    await seedTrustedSession(page);
    await page.goto('/admin/login');
    await expect(page).toHaveURL('/admin/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
  });

  test('an Admin session visiting /admin/login moves along home', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/admin/login');
    await expect(page).toHaveURL('/');
  });

  test('a member route still sends an anonymous visitor to /login', async ({ page }) => {
    await page.goto('/applications');
    await expect(page).toHaveURL('/login?redirect=/applications');
  });
});
