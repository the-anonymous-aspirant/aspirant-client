import { test, expect, type Page } from '@playwright/test';

import { seedAdminSession, seedTrustedSession } from './helpers/mockBackend';

// #4223 item 1 (operator ask #1544): the who-am-I strip in the left sidebar
// showed the raw role IDENTIFIER 'Trusted', but the area is surfaced to the
// user as "Member". The identifier stays 'Trusted' in code and on the wire
// (renaming it is a breaking change — router.js MEMBER_ROLES); only the DISPLAY
// changes. Admin keeps its own label.

/** The sidebar's role line renders only for a logged-in, non-collapsed rail. */
const roleLine = (page: Page) => page.locator('.user-role');

test.describe('#4223 sidebar role label', () => {
  test('a Trusted session reads "Member", not the internal identifier', async ({ page }) => {
    await seedTrustedSession(page);
    await page.goto('/');
    await expect(roleLine(page)).toHaveText('Member');
    await expect(roleLine(page)).not.toHaveText('Trusted');
  });

  test('an Admin session still reads "Admin"', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/');
    await expect(roleLine(page)).toHaveText('Admin');
  });
});
