import { test, expect, type Route } from '@playwright/test';

import { seedTrustedSession } from './helpers/mockBackend';

// #4223 item 4 (operator ask #1544): the message-board author strip must prefer
// a user's display name over the raw username. The board reads
// /api/data_models/users (now carrying display_name, aspirant-server side) and
// /api/data_models/message; formatSender picks display_name || username.

test.describe('#4223 message-board author display name', () => {
  test('the author strip shows display_name, not the raw username', async ({ page }) => {
    await seedTrustedSession(page);

    // Catch-all first (reverse-order match: specific routes registered after
    // win) so incidental /api calls (profile avatar, assets) don't hang.
    await page.route(/\/api\//, (route: Route) => route.fulfill({ status: 204, body: '' }));

    await page.route(/\/api\/data_models\/users(\?|$)/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ ID: 7, username: 'user7', display_name: 'Vinoly', avatar_url: '' }],
        }),
      }),
    );
    await page.route(/\/api\/data_models\/message(\?|$)/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { SenderID: 7, Content: 'hello board', SentAt: '2026-08-24T10:00:00Z' },
          ],
        }),
      }),
    );

    await page.goto('/member/shared/message-board');

    const author = page.locator('.sender-info').first();
    await expect(author).toHaveText(/Vinoly/);
    await expect(author).not.toHaveText(/user7/);
  });
});
