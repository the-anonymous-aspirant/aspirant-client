import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5228 (under #5119) — the landing pages for the two links a sign-up email
 * can carry: `/verify-email?token=…` and `/reset-password?token=…`.
 *
 * Both tokens are SINGLE USE, and that is what shapes these tests. The pages
 * exist at all because mail scanners and link-preview fetchers follow links
 * inside messages: had the mail linked straight at a GET endpoint on the API,
 * one prefetch by a security appliance would have spent the token and left the
 * person holding a link reporting itself invalid — a failure they cannot
 * diagnose and support cannot reproduce.
 *
 * So the load-bearing assertions here are the NEGATIVE ones — that merely
 * loading the page sends nothing, and that a client-side validation failure
 * sends nothing. A page that quietly POSTs on mount would pass every happy-path
 * test in this file while giving back exactly the failure it was built to
 * avoid.
 */

const VERIFY_TOKEN = 'nS1v6W3Z8TH8V3pg_cxNU1uyXKazWgyP9c4Zh0Y7k3Y';
const RESET_TOKEN = 'Sok0p62sLuNUHiyNWsFgaW5MFrXjjgrYPpaLKQP3I-M';

/** The API's single answer for every bad-token case. */
const INVALID_TOKEN_BODY = {
  error: { code: 'bad_request', message: 'That link is invalid or has expired. Request a new one.' },
};

type Captured = { url: string; body: unknown }[];

/**
 * Navigate and clear the mobile sidebar.
 *
 * The `mobile-safari` project opens with the sidebar overlaying the page, and
 * it intercepts pointer events — so a click on either page's action button
 * times out there while passing on chromium. Every navigation in this file
 * goes through here so the two projects exercise the same thing.
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissMobileSidebarIfPresent(page);
}

/** Record every call to `path`, answering with `status` and `body`. */
async function captureApi(
  page: Page,
  path: string,
  status: number,
  body: unknown
): Promise<Captured> {
  const calls: Captured = [];
  await page.route(`**/api${path}`, async (route) => {
    calls.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return calls;
}

// --- /verify-email ----------------------------------------------------------

test.describe('/verify-email', () => {
  // THE test. Loading the page must not spend the token; only a human click
  // may. A fetcher that renders the page still sends nothing.
  test('loading the page sends no request — only the button does', async ({ page }) => {
    const calls = await captureApi(page, '/verify-email', 200, {
      status: 'success',
      data: {},
      message: 'Your address is confirmed. You can sign in now.',
    });

    await open(page, `/verify-email?token=${VERIFY_TOKEN}`);
    await expect(page.getByRole('button', { name: /confirm my address/i })).toBeVisible();

    // Give any on-mount request time to have happened.
    await page.waitForTimeout(500);
    expect(calls, 'the page confirmed on load — a mail scanner would burn the token').toHaveLength(
      0
    );

    await page.getByRole('button', { name: /confirm my address/i }).click();
    await expect(page.getByText(/your address is confirmed/i)).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ token: VERIFY_TOKEN });
  });

  test('a link with no token explains itself and sends nothing', async ({ page }) => {
    const calls = await captureApi(page, '/verify-email', 200, {});

    await open(page, '/verify-email');
    await expect(page.getByText(/missing its confirmation code/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm my address/i })).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });

  test('a spent or expired token shows the API message, unembellished', async ({ page }) => {
    await captureApi(page, '/verify-email', 400, INVALID_TOKEN_BODY);

    await open(page, `/verify-email?token=${VERIFY_TOKEN}`);
    await page.getByRole('button', { name: /confirm my address/i }).click();

    await expect(page.getByText(/that link is invalid or has expired/i)).toBeVisible();
    // The API deliberately does not distinguish expired from consumed from
    // never-existed; the page must not invent a distinction either.
    await expect(page.getByText(/expired|already used|not found/i)).toHaveCount(1);
  });

  // The token is a live credential until spent. Rendering it would put it in
  // screenshots, bug reports and shoulder-view.
  test('the token is never rendered into the page', async ({ page }) => {
    await captureApi(page, '/verify-email', 200, { status: 'success', data: {}, message: 'ok' });

    await open(page, `/verify-email?token=${VERIFY_TOKEN}`);
    await expect(page.locator('body')).not.toContainText(VERIFY_TOKEN);
  });
});

// --- /reset-password --------------------------------------------------------

test.describe('/reset-password', () => {
  async function fill(page: Page, pw: string, confirm: string): Promise<void> {
    await page.locator('input[name="new-password"]').fill(pw);
    await page.locator('input[name="confirm-password"]').fill(confirm);
    await page.getByRole('button', { name: /change my password/i }).click();
  }

  test('a valid reset sends the token and the new password', async ({ page }) => {
    const calls = await captureApi(page, '/password/reset', 200, {
      status: 'success',
      data: {},
      message: 'Your password has been changed. You can sign in now.',
    });

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    await fill(page, 'a-completely-different-one', 'a-completely-different-one');

    await expect(page.getByText(/your password has been changed/i)).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      token: RESET_TOKEN,
      password: 'a-completely-different-one',
    });
  });

  // Mistyping the confirmation must not reach the server: the token is single
  // use, so a rejected submission would burn the link and send the person back
  // to their inbox for another one.
  test('mismatched passwords are caught here and spend no token', async ({ page }) => {
    const calls = await captureApi(page, '/password/reset', 200, {});

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    await fill(page, 'a-completely-different-one', 'a-completely-different-typo');

    await expect(page.getByText(/do not match/i)).toBeVisible();
    expect(calls, 'a typo reached the server and burned the reset link').toHaveLength(0);
  });

  test('a too-short password is caught here and spends no token', async ({ page }) => {
    const calls = await captureApi(page, '/password/reset', 200, {});

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    await fill(page, 'short', 'short');

    await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  // bcrypt ignores everything past 72 bytes, so the server refuses a longer
  // password rather than silently authenticating by its first 72. The page
  // states both bounds up front and enforces the upper one before spending the
  // token.
  test('a password past bcrypt 72-byte limit is caught here and spends no token', async ({
    page,
  }) => {
    const calls = await captureApi(page, '/password/reset', 200, {});

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    const tooLong = 'x'.repeat(73);
    await fill(page, tooLong, tooLong);

    await expect(page.getByText(/at most 72 characters/i)).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  // Length is counted in BYTES, matching bcrypt and the server. Twenty emoji
  // are 20 characters and 80 bytes: `.length` would let this past here and the
  // server would refuse it, spending the token on a round trip.
  test('length is counted in bytes, not characters', async ({ page }) => {
    const calls = await captureApi(page, '/password/reset', 200, {});

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    const twentyEmoji = '😀'.repeat(20); // 20 chars, 80 bytes
    await fill(page, twentyEmoji, twentyEmoji);

    await expect(page.getByText(/at most 72 characters/i)).toBeVisible();
    expect(calls, 'an 80-byte password reached the server and spent the token').toHaveLength(0);
  });

  test('a link with no token explains itself and offers no form', async ({ page }) => {
    await open(page, '/reset-password');
    await expect(page.getByText(/missing its reset code/i)).toBeVisible();
    await expect(page.locator('input[name="new-password"]')).toHaveCount(0);
  });

  test('a spent or expired token shows the API message', async ({ page }) => {
    await captureApi(page, '/password/reset', 400, INVALID_TOKEN_BODY);

    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    await fill(page, 'a-completely-different-one', 'a-completely-different-one');

    await expect(page.getByText(/that link is invalid or has expired/i)).toBeVisible();
  });

  test('the token is never rendered into the page', async ({ page }) => {
    await open(page, `/reset-password?token=${RESET_TOKEN}`);
    await expect(page.locator('body')).not.toContainText(RESET_TOKEN);
  });
});
