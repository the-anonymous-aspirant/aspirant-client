import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #3342: a dedicated /login page for visitors bounced off a
 *  gated surface (nginx @browser_flows_login / @penpot_login), landing on a
 *  focused form instead of the home page.
 *
 *  Parity with the sidebar login is by construction — LoginView.vue renders
 *  the same Login.vue component, so these tests exercise the /login route's
 *  own responsibilities (mount, already-logged-in bypass, post-login return,
 *  open-redirect guard) rather than re-testing the login POST itself, which
 *  is already covered by the component the route reuses. */

async function mockLoginSuccess(page: Page, role = 'Admin'): Promise<void> {
  await page.route(/\/api\/login$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { username: 'e2e-tester', role } }),
    });
  });
}

async function fillAndSubmitLogin(page: Page): Promise<void> {
  await page.locator('#username').fill('e2e-tester');
  await page.locator('#password').fill('hunter2');
  await page.getByRole('button', { name: 'Login' }).click();
}

test.describe('Dedicated /login page', () => {
  test('anonymous visitor sees the shared login form', async ({ page }) => {
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('already-logged-in visitor is bounced off /login to home', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });

  test('a visitor bounced here with stale login display-state sees the form and does NOT loop (system_3 #4155)', async ({
    page,
  }) => {
    // The #4155 loop: nginx's auth_request bounces an INVALID session off a
    // gated surface to /login?redirect=<surface>. `user_name` is cached
    // display state that OUTLIVES the HttpOnly cookie, so it is still set on a
    // dead session. The old created() auto-forwarded on that stale flag → the
    // forwarded GET is rejected again → 302 /login → forward → an infinite
    // full-page reload (the flickering, shaking screen with an unclickable
    // sidebar the operator reported). The fix: a `redirect` param means this
    // session was just rejected for the target, so show the form — never
    // forward on stale display-state.
    await seedAdminSession(page);
    await page.goto('/login?redirect=/trusted');
    await dismissMobileSidebarIfPresent(page);
    await expect(page).toHaveURL('/login?redirect=/trusted');
    await expect(page.locator('#username')).toBeVisible();
  });

  test('a visitor bounced here is NOT auto-forwarded to a proxied surface — the redirect-loop guard (system_3 #4155, supersedes #4081)', async ({
    page,
  }) => {
    // #4081 auto-forwarded an already-"logged-in" visitor to the proxied
    // redirect target via a full-page GET. The premise is unsound: you only
    // reach /login?redirect=<proxied> because nginx's auth_request REJECTED the
    // session for it, so the forwarded GET is rejected again and bounces
    // straight back — the #4155 loop. #4081's own test masked this by stubbing
    // the proxied target to 200, bypassing the real gate. The guard now: with a
    // redirect param present, created() must NOT navigate — it shows the form,
    // and onLogin() forwards once a fresh credential is valid. If created()
    // wrongly forwarded, the stub below would fire.
    await seedAdminSession(page);
    const proxied = '/admin/apps/system_3/';
    let forwarded = false;
    await page.route(proxied, (route) => {
      forwarded = true;
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>should not be reached</h1></body></html>',
      });
    });
    await page.goto('/login?redirect=' + encodeURIComponent(proxied));
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(forwarded).toBe(false);
  });

  test('successful login with no redirect param lands on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });

  test('successful login returns the visitor to the originally requested URL', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=/trusted');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/trusted');
  });

  test('successful login updates the sidebar to the logged-in state', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  // Open-redirect guard: a `redirect` value that does not point same-origin
  // must never be honoured, or a crafted /login?redirect=https://evil link
  // could hand a fresh credential holder's next click to another origin.
  test('a protocol-relative redirect target is rejected, landing on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=//evil.example.com');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });

  test('an absolute external redirect target is rejected, landing on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=https://evil.example.com');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });
});
