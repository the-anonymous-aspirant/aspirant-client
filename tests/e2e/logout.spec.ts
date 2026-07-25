import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession } from './helpers/mockBackend';

/** Covers system_3 #2589 / #2591: logging out has to reach the server.
 *
 *  The session is the server's auth_token cookie, which is HttpOnly — a
 *  document.cookie write against it is a silent no-op, so the SPA cannot end a
 *  session by itself. Before this, clicking Logout cleared localStorage and
 *  left a valid Admin credential in the browser for the token's full 24h while
 *  the UI showed a logged-out state.
 *
 *  What is assertable here is that the client ASKS: the POST fires, and local
 *  state clears either way. That the cookie actually expires is the server's
 *  contract, locked by aspirant-server's logout_test.go, and end-to-end it is
 *  a cell dogfood — the e2e suite runs vite preview with a mocked backend and
 *  has no real cookie in play. */

/** Registered BEFORE captureLogout in every test: Playwright matches routes in
 *  reverse registration order, so a catch-all installed last would shadow the
 *  specific /api/logout handler and the assertion would silently see no call. */
async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

/** Records every POST /api/logout, so a test can assert the call was made
 *  rather than merely that the UI looked right afterwards. */
async function captureLogout(page: Page, opts: { fail?: boolean } = {}): Promise<string[]> {
  const calls: string[] = [];
  await page.route(/\/api\/logout$/, async (route: Route) => {
    calls.push(route.request().method());
    if (opts.fail) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Logout successful' }),
    });
  });
  return calls;
}

async function clickLogout(page: Page): Promise<void> {
  await page.goto('/');
  const logout = page.getByRole('button', { name: 'Logout' });
  await logout.waitFor({ state: 'visible' });
  await logout.click();
}

test.describe('Logout reaches the server', () => {
  test('clicking Logout POSTs /api/logout', async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    const calls = await captureLogout(page);

    await clickLogout(page);

    await expect.poll(() => calls).toEqual(['POST']);
  });

  test('local state is cleared after logout', async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    await captureLogout(page);

    await clickLogout(page);

    await expect
      .poll(() => page.evaluate(() => [
        localStorage.getItem('user_name'),
        localStorage.getItem('user_role'),
      ]))
      .toEqual([null, null]);
  });

  // The failure path is the one worth pinning: if a failed logout call left
  // the UI logged in, a user offline (or hitting a 5xx) would be stuck in a
  // state they cannot leave. The cookie expires on its own regardless.
  test('local state is cleared even when the logout call fails', async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    const calls = await captureLogout(page, { fail: true });

    await clickLogout(page);

    await expect.poll(() => calls).toEqual(['POST']);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('user_role')))
      .toBe(null);
  });
});
