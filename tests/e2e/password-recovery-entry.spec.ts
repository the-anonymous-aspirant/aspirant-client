import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5339 (#5296-A2) — the way to ASK for a reset link.
 *
 * `ResetPasswordView` has landed the emailed link since #5228 and calls
 * `POST /api/password/reset`. Nothing called `POST /api/password/forgot`, so
 * the half that causes that email to be sent did not exist: a person holding
 * the link could finish, and a person without one had no way to ask.
 *
 * The load-bearing test is the last one. `POST /password/forgot` returns ONE
 * identical sentence whether or not the address has an account —
 * `password_recovery.go` keeps it in a constant so "the two call sites cannot
 * drift apart; one differing word would be the oracle." The kind thing to
 * build here ("we couldn't find that account") is exactly the thing that would
 * rebuild that oracle in the client, so the spec pins that the rendered output
 * is byte-identical for both, and goes red if a helpful branch appears.
 */

const SERVER_MESSAGE = 'If that address has an account, a reset link is on its way.';

async function mockForgot(page: Page, posted: unknown[], message = SERVER_MESSAGE): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/password/forgot',
    async (route) => {
      posted.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: {}, message }),
      });
    }
  );
}

test.describe('#5339 password-recovery entry', () => {
  test('the login surface offers a way in for someone who cannot sign in', async ({ page }) => {
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);

    const link = page.getByTestId('forgot-link');
    await expect(link, 'the affordance exists').toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.locator('.token-view-card input[name="email"]')).toBeVisible();
  });

  test('the sidebar does not also render a login form on the recovery page', async ({ page }) => {
    await page.goto('/forgot-password');
    await dismissMobileSidebarIfPresent(page);

    // Same reasoning as /login and /signup: a page whose whole job is an auth
    // step should not carry a second, different auth form in the rail beside
    // it — and someone who cannot remember their password is precisely the
    // person for whom a login form is not the answer.
    await expect(page.locator('.sidebar input[name="username"]')).toHaveCount(0);
  });

  test('it posts the address the server binds', async ({ page }) => {
    const posted: unknown[] = [];
    await mockForgot(page, posted);
    await page.goto('/forgot-password');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('.token-view-card input[name="email"]').fill('someone@example.com');
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-done')).toBeVisible();

    expect(posted).toEqual([{ email: 'someone@example.com' }]);
  });

  test('a known and an unknown address are indistinguishable in the UI', async ({ page }) => {
    // THE non-oracle assertion. The server sends one sentence for both cases;
    // this pins that the client renders that sentence and adds nothing that
    // could tell them apart.
    const render = async (address: string) => {
      const posted: unknown[] = [];
      await mockForgot(page, posted);
      await page.goto('/forgot-password');
      await dismissMobileSidebarIfPresent(page);
      await page.locator('.token-view-card input[name="email"]').fill(address);
      await page.getByTestId('forgot-submit').click();
      const done = page.getByTestId('forgot-done');
      await expect(done).toBeVisible();
      return (await done.innerText()).trim();
    };

    // Both mocked with the server's single constant, because that is what the
    // server actually sends in both cases. The assertion is about what the
    // CLIENT adds on top — which must be nothing.
    const known = await render('has-an-account@example.com');
    const unknown = await render('no-such-person@example.com');

    expect(known).toBe(SERVER_MESSAGE);
    expect(unknown).toBe(known);
  });

  test('a shape complaint from the server is shown, and is not about existence', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/password/forgot',
      (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'An email address is required' } }),
        })
    );
    await page.goto('/forgot-password');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('.token-view-card input[name="email"]').fill('x@example.com');
    await page.getByTestId('forgot-submit').click();

    // A 400 is the server complaining about the FIELD, never about whether an
    // account exists — so it is safe to surface, and the success path is not
    // reached.
    await expect(page.getByTestId('forgot-error')).toContainText('email address is required');
    await expect(page.getByTestId('forgot-done')).toHaveCount(0);
  });
});
