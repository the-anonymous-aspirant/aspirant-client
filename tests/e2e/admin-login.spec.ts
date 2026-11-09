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

  // system_3 #8798-B2: nginx's auth_request 302s an already-Admin session
  // here after the Cloudflare PIN hop, because the PIN redirect is a
  // cross-site navigation and the SameSite=Strict auth_token cookie does not
  // ride it. These two tests pin the live /api/profile check that tells a
  // merely-stale cached role apart from a genuinely dead one, so the form
  // only shows when the cookie is actually no longer good.
  test.describe('the redirect case: admin + ?redirect, cookie verified live', () => {
    test('a live Admin cookie goes straight to the redirect target, no form', async ({ page }) => {
      // seedAdminSession also stubs GET /api/profile -> 200 (a live cookie).
      await seedAdminSession(page);
      await page.goto('/admin/login?redirect=/admin');
      await expect(page).toHaveURL('/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toHaveCount(0);
    });

    test('a cached Admin flag whose cookie has actually expired still shows the form', async ({ page }) => {
      await seedAdminSession(page);
      // Registered after the seed, so it wins (routes match most-recent
      // first): the live check this time finds a dead cookie.
      await page.route(/\/api\/profile$/, (route: Route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Authentication required' } }),
        }),
      );
      await page.goto('/admin/login?redirect=/admin');
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
    });

    test('an anonymous visitor bounced here by the guard still sees the form (no cached role at all)', async ({ page }) => {
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
    });

    // design_agent's ack (c63362) on this task spells out three more states
    // by number; these three tests pin them.
    test('state 3: shows "Checking your session…" in place of the form while the check is in flight', async ({ page }) => {
      await seedAdminSession(page);
      await page.route(/\/api\/profile$/, async (route: Route) => {
        await new Promise(resolve => setTimeout(resolve, 1_200));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'e2e-admin' }) });
      });
      await page.goto('/admin/login?redirect=/admin');
      // Checked before dismissMobileSidebarIfPresent: that call itself takes
      // time the delayed response could outlast, racing the very state this
      // test exists to observe.
      await expect(page.getByRole('status')).toHaveText('Checking your session…');
      await expect(page.locator('input[name="username"]')).toHaveCount(0);
      await expect(page).toHaveURL('/admin'); // once the delayed answer lands
    });

    test('state 6: a second arrival for the same target inside the loop window shows the form without re-checking', async ({ page }) => {
      await seedAdminSession(page);
      let profileCalls = 0;
      await page.route(/\/api\/profile$/, (route: Route) => {
        profileCalls++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'e2e-admin' }) });
      });
      // Simulate "we already forwarded to /admin a moment ago and landed
      // right back here" — the shape a disagreeing auth_request produces.
      await page.addInitScript((target) => {
        sessionStorage.setItem('admin_login_last_forward', JSON.stringify({ target, at: Date.now() }));
      }, '/admin');
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      // Sidebar.vue fetches GET /api/profile on its own, for the avatar,
      // independent of this guard (mockBackend's answerSeededProfile exists
      // for exactly that read) — that is the one call. The loop breaker is
      // proven by there being no SECOND one from LoginView's own check.
      expect(profileCalls).toBe(1);
    });

    test('states 3+5: a check that neither answers nor fails within ~2s falls back to the form, and a later answer is ignored', async ({ page }) => {
      await seedAdminSession(page);
      await page.route(/\/api\/profile$/, async (route: Route) => {
        await new Promise(resolve => setTimeout(resolve, 3_000));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'e2e-admin' }) });
      });
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      // The 2s cap puts the form up well before the 3s answer arrives.
      await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible({ timeout: 2_500 });
      await expect(page.locator('input[name="username"]')).toBeVisible();
      // Give the late 3s answer time to land, then confirm it changed nothing:
      // still the form, still this URL — the late answer must not pull the
      // form away or navigate out from under the operator (D13).
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      await expect(page.locator('input[name="username"]')).toBeVisible();
    });
  });
});
