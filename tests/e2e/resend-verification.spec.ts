import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #11143-A2 — the other half of #10979's dead-link sentence. A confirmation
 * link that is spent, expired or cut short left no way to ask for a new one;
 * this page is that way, linked from VerifyEmailView's dead-link and
 * missing-code branches (design ack c71363).
 *
 * Built like ForgotPasswordView (password-recovery-entry.spec.ts) for the
 * same reason: `POST /verify-email/resend` (aspirant-server #11391) answers
 * one identical sentence whether or not the address has an account waiting
 * for confirmation, constant in bytes and time, so the client must never add
 * a kinder branch of its own — that would rebuild the account-existence
 * oracle the server deliberately does not have.
 */

const SERVER_MESSAGE = 'If that address has an account waiting for confirmation, a new link is on its way.';

async function mockResend(page: Page, posted: unknown[], status = 200, body?: unknown): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/verify-email/resend',
    async (route) => {
      posted.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body ?? { status: 'success', data: {}, message: SERVER_MESSAGE }),
      });
    }
  );
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissMobileSidebarIfPresent(page);
}

test.describe('#11143-A2 resend a confirmation link', () => {
  test('a dead confirmation link leads here', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/verify-email',
      (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'bad_request', message: 'bad token' } }),
        })
    );
    await open(page, '/verify-email?token=t');
    await page.getByRole('button', { name: /confirm my address/i }).click();

    const link = page.locator('.next');
    await expect(link).toHaveText('Get a new confirmation link');
    await expect(link).toHaveAttribute('href', '/resend-verification');
    await link.click();
    await expect(page).toHaveURL(/\/resend-verification$/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('a link missing its code also leads here', async ({ page }) => {
    await open(page, '/verify-email');

    await expect(page.locator('[data-test="verify-no-code"]')).toContainText('missing its confirmation code');
    const link = page.locator('.next');
    await expect(link).toHaveText('Get a new confirmation link');
    await expect(link).toHaveAttribute('href', '/resend-verification');
    await link.click();
    await expect(page).toHaveURL(/\/resend-verification$/);
  });

  test('it posts the address the server binds', async ({ page }) => {
    const posted: unknown[] = [];
    await mockResend(page, posted);
    await open(page, '/resend-verification');

    await page.locator('input[name="email"]').fill('someone@example.com');
    await page.locator('[data-test="resend-submit"]').click();
    await expect(page.locator('[data-test="resend-done"]')).toBeVisible();
    // The one line that helps the one person the constant message does not:
    // an already-confirmed owner, sent nothing (design ack c71363).
    await expect(page.locator('[data-test="resend-try-sign-in"]').getByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/login');

    expect(posted).toEqual([{ email: 'someone@example.com' }]);
  });

  test('a known address, an unknown one and an already-confirmed one are indistinguishable', async ({ page }) => {
    const render = async (address: string) => {
      const posted: unknown[] = [];
      await mockResend(page, posted);
      await open(page, '/resend-verification');
      await page.locator('input[name="email"]').fill(address);
      await page.locator('[data-test="resend-submit"]').click();
      const done = page.locator('[data-test="resend-done"]');
      await expect(done).toBeVisible();
      return (await done.innerText()).trim();
    };

    const waiting = await render('waiting-to-confirm@example.com');
    const confirmed = await render('already-confirmed@example.com');
    const unknown = await render('no-such-person@example.com');

    expect(waiting).toBe(SERVER_MESSAGE);
    expect(confirmed).toBe(waiting);
    expect(unknown).toBe(waiting);
    // Nothing on the page states a fact about the account the address names.
    await expect(page.locator('body')).not.toContainText(/already confirmed|no account|does not exist/i);
  });

  test('a 429 reads as the server\'s own rate-limit sentence, never as anything about the address', async ({ page }) => {
    // The route's own body is `{ error: "<string>" }`, not `{ error: {
    // message } }` (middleware/public_auth_rate_limit.go), and design ack
    // c71363 asks for it verbatim, not a client sentence of its own.
    await page.route(
      (url) => url.pathname === '/api/verify-email/resend',
      (route) =>
        route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many attempts, please try again later' }) })
    );
    await open(page, '/resend-verification');
    await page.locator('input[name="email"]').fill('x@example.com');
    await page.locator('[data-test="resend-submit"]').click();

    const error = page.locator('[data-test="resend-error"]');
    await expect(error).toHaveText('Too many attempts, please try again later');
    await expect(error).not.toContainText(/address|account|email/i);
    await expect(page.locator('[data-test="resend-done"]')).toHaveCount(0);
  });

  test('a 403 shows the sign-up-closed message', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/verify-email/resend',
      (route) =>
        route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'forbidden', message: 'Sign-up is currently closed.' } }) })
    );
    await open(page, '/resend-verification');
    await page.locator('input[name="email"]').fill('x@example.com');
    await page.locator('[data-test="resend-submit"]').click();

    await expect(page.locator('[data-test="resend-error"]')).toHaveText('Sign-up is currently closed.');
    await expect(page.locator('[data-test="resend-done"]')).toHaveCount(0);
  });

  test('a shape complaint from the server is shown, and is not about existence', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/verify-email/resend',
      (route) =>
        route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'An email address is required' } }) })
    );
    await open(page, '/resend-verification');
    await page.locator('input[name="email"]').fill('x@example.com');
    await page.locator('[data-test="resend-submit"]').click();

    await expect(page.locator('[data-test="resend-error"]')).toContainText('email address is required');
    await expect(page.locator('[data-test="resend-done"]')).toHaveCount(0);
  });

  test('a network failure says the server could not be reached', async ({ page }) => {
    await page.route((url) => url.pathname === '/api/verify-email/resend', (route) => route.abort());
    await open(page, '/resend-verification');
    await page.locator('input[name="email"]').fill('x@example.com');
    await page.locator('[data-test="resend-submit"]').click();

    await expect(page.locator('[data-test="resend-error"]')).toContainText('Could not reach the server');
  });
});
