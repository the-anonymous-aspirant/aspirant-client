import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent, openMobileSidebarIfPresent } from './helpers/mockBackend';

/** "Create an account" while sign-up is closed (system_3 #10980, UX walk
 *  finding AP4). The sidebar sign-in renders for every signed-out visitor on
 *  every page, and it offered the link even while sign-up was closed; the page
 *  it opened was headed "Create an account" above "Sign-up is closed".
 *
 *  The link goes only when sign-up is KNOWN closed. A failed read, or a server
 *  without the switch (404), keeps it: not knowing is not closed (#5338). */

async function status(page: Page, code: number, body: unknown): Promise<string[]> {
  const reads: string[] = [];
  await page.route(/\/api\//, (r) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await page.route(
    (url) => url.pathname === '/api/signup/status',
    (route) => {
      reads.push(route.request().url());
      return route.fulfill({
        status: code,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
  return reads;
}

const signupLinks = (page: Page) => page.getByTestId('signup-link');
const forgotLinks = (page: Page) => page.getByTestId('forgot-link');

for (const width of [390, 1440]) {
  test.describe(`#10980 at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('closed: neither sign-in on /login offers "Create an account"', async ({ page }) => {
      await status(page, 200, { signup_enabled: false });
      await page.goto('/login');
      await dismissMobileSidebarIfPresent(page);
      // The sign-in itself is there; only the dead-end door is gone.
      await expect(page.locator('.login-view-card').getByTestId('forgot-link')).toBeVisible();
      await expect(signupLinks(page)).toHaveCount(0);
    });

    test('closed: the sidebar sign-in on the home page offers no "Create an account"', async ({
      page,
    }) => {
      await status(page, 200, { signup_enabled: false });
      await page.goto('/');
      await openMobileSidebarIfPresent(page);
      await expect(page.locator('.sidebar').getByTestId('forgot-link')).toBeVisible();
      await expect(page.locator('.sidebar').getByTestId('signup-link')).toHaveCount(0);
    });

    test('closed: /signup is headed "Sign-up is closed"', async ({ page }) => {
      await status(page, 200, { signup_enabled: false });
      await page.goto('/signup');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByTestId('signup-closed')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign-up is closed');
      await expect(page.getByRole('heading', { name: 'Create an account' })).toHaveCount(0);
    });

    test('open: the link is offered and /signup is headed "Create an account"', async ({
      page,
    }) => {
      await status(page, 200, { signup_enabled: true });
      await page.goto('/login');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('.login-view-card').getByTestId('signup-link')).toBeVisible();
      await page.goto('/signup');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create an account');
    });
  });
}

test.describe('#10980 not knowing is not closed', () => {
  test('a failed read keeps the link, and /signup keeps its form and hint', async ({ page }) => {
    await status(page, 500, { error: 'boom' });
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.login-view-card').getByTestId('signup-link')).toBeVisible();
    await page.goto('/signup');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create an account');
    await expect(page.getByTestId('signup-status-unknown')).toBeVisible();
  });

  test('a server without the switch (404) keeps the link', async ({ page }) => {
    await status(page, 404, {});
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.login-view-card').getByTestId('signup-link')).toBeVisible();
    await expect(forgotLinks(page).first()).toBeVisible();
  });

  test('the sidebar and /signup share one read, so they cannot disagree', async ({ page }) => {
    const reads = await status(page, 200, { signup_enabled: false });
    await page.goto('/signup');
    await expect(page.getByTestId('signup-closed')).toBeVisible();
    await page.waitForTimeout(300);
    expect(reads).toHaveLength(1);
  });
});
