import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5338 (#5296-A1) — the public sign-up entry.
 *
 * `POST /signup` shipped in #5220 and nothing in the client called it, so the
 * server's self-service flow had a working second half (VerifyEmailView lands
 * the confirmation link, ResetPasswordView lands the reset link) and no first
 * half at all.
 *
 * The load-bearing test here is the LAST one. `POST /signup` answers a created
 * account, a taken username and a taken email with ONE identical sentence, on
 * purpose — `server/handlers/signup.go` says its shape "is dominated by one
 * requirement: an unauthenticated caller must not be able to learn whether an
 * account exists," and the server tests assert that byte-for-byte. The obvious,
 * friendly client behaviour ("that username is taken") would rebuild that
 * oracle at the front end. So the spec pins that the rendered output is
 * IDENTICAL for a created account and a duplicate, and it should go red if
 * someone later adds a helpful branch.
 */

const SERVER_MESSAGE =
  'If that username and address are available, a verification link has been sent. Check your inbox.';

/** The status endpoint decides whether the form or the closed state renders. */
async function mockSignupStatus(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/signup/status',
    (route) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/** Capture what the form actually posts, and answer as the server would. */
async function mockSignupPost(page: Page, bodies: unknown[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/signup',
    async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: {}, message: SERVER_MESSAGE }),
      });
    }
  );
}

async function fillForm(page: Page, over: Partial<Record<string, string>> = {}): Promise<void> {
  await page.locator('.token-view-card input[name="username"]').fill(over.username ?? 'new-person');
  await page
    .locator('.token-view-card input[name="email"]')
    .fill(over.email ?? 'new-person@example.com');
  await page
    .locator('.token-view-card input[name="new-password"]')
    .fill(over.password ?? 'correct-horse-battery');
}

test.describe('#5338 public sign-up entry', () => {
  test('the login surface offers a way in for someone with no account', async ({ page }) => {
    await mockSignupStatus(page, { signup_enabled: true });
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);

    const link = page.getByTestId('signup-link');
    await expect(link, 'the affordance exists').toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator('.token-view-card input[name="username"]')).toBeVisible();
  });

  test('an open switch renders the form', async ({ page }) => {
    await mockSignupStatus(page, { signup_enabled: true });
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('signup-submit')).toBeVisible();
    await expect(page.getByTestId('signup-closed')).toHaveCount(0);
  });

  test('a closed switch replaces the form with a closed state', async ({ page }) => {
    await mockSignupStatus(page, { signup_enabled: false });
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('signup-closed')).toBeVisible();
    // Not merely disabled — a form that will 403 is a door painted on a wall.
    await expect(
      page.locator('.token-view-card input[name="username"]'),
      'no form behind the closed state'
    ).toHaveCount(0);
    await expect(page.getByTestId('signup-submit')).toHaveCount(0);
  });

  test('a failed status read is not rendered as a closed switch', async ({ page }) => {
    await mockSignupStatus(page, { error: 'boom' }, 500);
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    // Not knowing and being closed are different states, and only one of them
    // is a claim we can make. The form renders; the server remains the
    // enforcement point and will say so if it is actually closed.
    await expect(page.getByTestId('signup-status-unknown')).toBeVisible();
    await expect(page.getByTestId('signup-submit')).toBeVisible();
    await expect(page.getByTestId('signup-closed')).toHaveCount(0);
  });

  test('a 404 status read means the server predates the switch, so the form renders', async ({
    page,
  }) => {
    await mockSignupStatus(page, {}, 404);
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('signup-submit')).toBeVisible();
    await expect(page.getByTestId('signup-closed')).toHaveCount(0);
    // A 404 is not a failure to report as one — sign-up simply cannot be
    // closed on that server. Same reading UserAdmin.vue takes.
    await expect(page.getByTestId('signup-status-unknown')).toHaveCount(0);
  });

  test('the form posts the three fields the server binds', async ({ page }) => {
    const posted: unknown[] = [];
    await mockSignupStatus(page, { signup_enabled: true });
    await mockSignupPost(page, posted);
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    await fillForm(page);
    await page.getByTestId('signup-submit').click();
    await expect(page.getByTestId('signup-done')).toBeVisible();

    expect(posted).toEqual([
      {
        username: 'new-person',
        email: 'new-person@example.com',
        password: 'correct-horse-battery',
      },
    ]);
  });

  test('a too-short password is refused before it costs a round trip', async ({ page }) => {
    const posted: unknown[] = [];
    await mockSignupStatus(page, { signup_enabled: true });
    await mockSignupPost(page, posted);
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);

    await fillForm(page, { password: 'short' });
    await page.getByTestId('signup-submit').click();

    await expect(page.getByTestId('signup-error')).toContainText('at least 10');
    expect(posted, 'nothing was sent').toEqual([]);
  });

  test('a duplicate and a fresh account are indistinguishable in the UI', async ({ page }) => {
    // THE non-oracle assertion. The server sends one sentence for both cases;
    // this pins that the client renders that sentence and nothing else, so a
    // later "that username is taken" branch reds here instead of shipping.
    await mockSignupStatus(page, { signup_enabled: true });

    const render = async (message: string) => {
      await page.route(
        (url) => url.pathname === '/api/signup',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: {}, message }),
          })
      );
      await page.goto('/signup');
      await dismissMobileSidebarIfPresent(page);
      await fillForm(page);
      await page.getByTestId('signup-submit').click();
      const done = page.getByTestId('signup-done');
      await expect(done).toBeVisible();
      return (await done.innerText()).trim();
    };

    // The server would send SERVER_MESSAGE for a created account and for a
    // taken one; both are mocked with that same body, and the assertion is
    // that the client adds nothing that could tell them apart.
    const fresh = await render(SERVER_MESSAGE);
    const duplicate = await render(SERVER_MESSAGE);

    expect(fresh).toBe(SERVER_MESSAGE);
    expect(duplicate).toBe(fresh);
  });
});
