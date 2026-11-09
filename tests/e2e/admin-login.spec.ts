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
    // design_agent's ack was amended (c63391) after security found the
    // original zero-click forward (c63381): ANY same-site arrival at this
    // URL with a cached Admin role and a live cookie forwarded automatically
    // — including one a cross-site attacker's link could produce, since the
    // browser cannot tell that from the real PIN hop. The fix is a click:
    // this test's core assertion (no navigation away from /admin/login
    // without one) is the regression guard and fails against the pre-fix
    // e0e6beb, which navigated automatically with no Continue state at all.
    test('a live Admin cookie shows a one-click Continue card, naming the target, with no auto-navigation', async ({ page }) => {
      await seedAdminSession(page); // also stubs GET /api/profile -> 200 (a live cookie)
      const target = '/admin/apps/system_3/tasks/8798'; // a deep, non-landing path
      await page.goto(`/admin/login?redirect=${target}`);
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('status')).toHaveText('Your session is still active.');
      await expect(page.getByText(target, { exact: true })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toHaveCount(0);
      // No auto-navigation: give it a beat, confirm the URL hasn't moved.
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(`/admin/login?redirect=${target}`);
      // Past the ~500ms arm delay (security c63400), so the click below
      // exercises the normal armed path, not the unarmed one (its own test).
      // Waited on the DOM's own signal, not a fixed ms margin from goto()
      // (engine startup speed varies — see the dedicated arm-delay test).
      await expect(page.locator('[data-continue-armed]')).toHaveAttribute('data-continue-armed', 'true');

      // The click is the only way forward, and it lands on exactly the target.
      await page.getByRole('link', { name: 'Continue' }).click();
      await expect(page).toHaveURL(target);
    });

    // security c63400, P2 hardening after the P1 fix above: neither a held
    // key nor a "DoubleClickjacking" popup needs a frame (frame-ancestors
    // only stops the framed variant), and both ride a gesture the operator
    // made on the ATTACKER's page onto our freshly-focused Continue control.
    test('security P2: the Continue control ignores activation for ~500ms after it renders', async ({ page }) => {
      // A fake clock, not a wall-clock race: goto()-to-render time varies
      // enough by itself (engine, machine load) that a fixed-ms margin
      // measured from goto flipped both ways in practice — too short on a
      // slow run, already elapsed on a fast one. Freezing time and advancing
      // it explicitly makes the "still inside the window" and "past it"
      // halves of this test deterministic on any engine or load.
      await page.clock.install();
      await page.clock.pauseAt(new Date()); // freeze: install() alone still ticks in realtime
      await seedAdminSession(page);
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      const link = page.getByRole('link', { name: 'Continue' });
      await expect(link).toBeVisible();
      await expect(page.locator('[data-continue-armed]')).toHaveAttribute('data-continue-armed', 'false');
      // Click while unarmed (clock frozen at render time): must not navigate.
      await link.click();
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      // Advance the fake clock past the arm delay: the identical click now navigates.
      await page.clock.runFor(600);
      await expect(page.locator('[data-continue-armed]')).toHaveAttribute('data-continue-armed', 'true');
      await link.click();
      await expect(page).toHaveURL('/admin');
    });

    test('security P2: a repeated keydown (a held key) is swallowed, never activating Continue', async ({ page }) => {
      await seedAdminSession(page);
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      const link = page.getByRole('link', { name: 'Continue' });
      await expect(link).toBeFocused();
      await page.waitForTimeout(600); // past the arm delay
      // A synthetic repeat:true keydown exercises onContinueKeydown's guard
      // directly (a dispatched event carries no real browser default action
      // to observe, so the assertion is on the guard itself: it must call
      // preventDefault on a repeat, which a build without the guard does not).
      const prevented = await link.evaluate((el) => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', repeat: true, bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(prevented).toBe(true);
      await page.waitForTimeout(200);
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
    });

    test('the Continue control is focused on arrival, so a keyboard user can act with one key', async ({ page }) => {
      await seedAdminSession(page);
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('link', { name: 'Continue' })).toBeFocused();
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
      // A fake clock, not just a held route: the component's own 2s
      // give-up fallback (fallBackToForm) runs on real wall-clock from
      // created(), independent of the network gate below — on a slow
      // engine under load (mobile-safari), goto()-to-first-assertion time
      // alone exceeded 2s, so the fallback had already fired and swapped
      // "Checking" for the plain form before the assertion ever polled
      // ("element(s) not found", not a wrong-text mismatch). Freezing time
      // decouples the assertion from how long startup itself takes.
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await seedAdminSession(page);
      // A gate the test controls, not a wall-clock delay: holding the route
      // open until the test itself releases it makes the "Checking"-to-
      // "Continue" transition race-free on any engine or load.
      let resolveProfile: () => void = () => {};
      const profileGate = new Promise<void>(resolve => { resolveProfile = resolve; });
      await page.route(/\/api\/profile$/, async (route: Route) => {
        await profileGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'e2e-admin' }) });
      });
      await page.goto('/admin/login?redirect=/admin');
      await expect(page.getByRole('status')).toHaveText('Checking your session…');
      await expect(page.locator('input[name="username"]')).toHaveCount(0);
      resolveProfile();
      // Once the answer lands: the Continue card, not an auto-forward.
      await expect(page.getByRole('status')).toHaveText('Your session is still active.');
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
    });

    test('state 6: a second arrival for the same target inside the loop window (after a Continue click) shows the form without re-checking', async ({ page }) => {
      await seedAdminSession(page);
      let profileCalls = 0;
      await page.route(/\/api\/profile$/, (route: Route) => {
        profileCalls++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'e2e-admin' }) });
      });
      // Simulate "the operator already clicked Continue for /admin a moment
      // ago and landed right back here" — the shape a disagreeing
      // auth_request produces (amended: the mark is written on the click,
      // not on an automatic forward, since there is no longer one).
      await page.addInitScript((target) => {
        sessionStorage.setItem('admin_login_last_continue_click', JSON.stringify({ target, at: Date.now() }));
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

    test('a Continue click that lands back here (the loop breaker) shows the form, not a second Continue card', async ({ page }) => {
      await seedAdminSession(page);
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      // Past the arm delay (security c63400) — the DOM's own signal, not a
      // fixed ms margin from goto() (see the dedicated arm-delay test).
      await expect(page.locator('[data-continue-armed]')).toHaveAttribute('data-continue-armed', 'true');
      await page.getByRole('link', { name: 'Continue' }).click();
      await expect(page).toHaveURL('/admin');
      // Simulate auth_request having refused /admin after all (profile and
      // verify-admin disagree) by returning to the same URL within the
      // loop window — sessionStorage persists across this in-tab navigation.
      await page.goto('/admin/login?redirect=/admin');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Admin sign-in' })).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
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
      // still the form, still this URL, and no Continue card appeared behind
      // it — the late answer must not pull the form away or navigate out
      // from under the operator (D13).
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL('/admin/login?redirect=/admin');
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);
    });
  });
});
