import { test, expect, type Page, type Route, type Request } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers #4170: the user profile surface — sidebar entry, display-name edit,
 *  avatar upload/clear, member-since, and avatar propagation to the message
 *  board author strip. The Go backend is mocked per-test (Playwright runs
 *  against the built SPA with no server), so these lock the client contract:
 *  which endpoints are called, with what payload, and how the UI re-renders. */

// A 1×1 PNG — enough for the browser to load an <img> without a console error.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

interface ProfileState {
  ID: number;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string;
  CreatedAt: string;
}

/** Install the /api/profile family plus the avatar-bytes route. The mock holds
 *  a mutable `state` so PATCH/PUT/DELETE persist within a test (and survive a
 *  reload, which re-hits GET) — modelling real round-trips. */
async function installProfileMocks(
  page: Page,
  initial: Partial<ProfileState> = {},
): Promise<{ patchBodies: any[]; state: ProfileState }> {
  const state: ProfileState = {
    ID: 7,
    username: 'e2e-tester',
    display_name: 'e2e-tester',
    email: 'e2e@example.com',
    avatar_url: '',
    CreatedAt: '2026-03-15T10:00:00Z',
    ...initial,
  };
  const patchBodies: any[] = [];

  await page.route(/\/api\/profile$/, async (route: Route, req: Request) => {
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: state }),
      });
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      patchBodies.push(body);
      state.display_name = (body.display_name || '').trim();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: state }),
      });
    }
    return route.fallback();
  });

  await page.route(/\/api\/profile\/avatar$/, async (route: Route, req: Request) => {
    if (req.method() === 'PUT') {
      state.avatar_url = '/api/data_models/users/7/avatar?v=deadbeef';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: { avatar_url: state.avatar_url } }),
      });
    }
    if (req.method() === 'DELETE') {
      state.avatar_url = '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: { avatar_url: '' } }),
      });
    }
    return route.fallback();
  });

  // The avatar <img> src → serve bytes so it loads cleanly.
  await page.route(/\/api\/data_models\/users\/\d+\/avatar/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
  });

  return { patchBodies, state };
}

test.describe('Profile surface (#4170)', () => {
  test('a logged-in user has a Profile entry in the sidebar', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page);
    await page.goto('/');
    // Attached (not necessarily visible — the mobile sidebar is off-canvas).
    await expect(page.locator('a[href="/profile"]')).toHaveCount(1);
  });

  test('the profile page shows display name and member-since', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page, { display_name: 'Ada L.' });
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('#display-name')).toHaveValue('Ada L.');
    await expect(page.getByText('Member since')).toBeVisible();
    // Locale-agnostic: the year is always present in the formatted date.
    await expect(page.locator('.profile-card')).toContainText('2026');
    await expect(page.locator('.profile-card')).toContainText('e2e-tester'); // username, read-only
  });

  test('editing the display name PATCHes the new value and confirms', async ({ page }) => {
    await seedTrustedSession(page);
    const { patchBodies } = await installProfileMocks(page);
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('#display-name').fill('New Name');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Display name saved.')).toBeVisible();
    expect(patchBodies).toContainEqual({ display_name: 'New Name' });

    // Persists across a reload (GET now returns the updated state).
    await page.reload();
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('#display-name')).toHaveValue('New Name');
  });

  test('uploading a picture PUTs it and renders the avatar image', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page);
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    // Before upload: initials placeholder, no <img> in the profile card avatar.
    await expect(page.locator('.profile-card .user-avatar-initials')).toBeVisible();

    const putPromise = page.waitForRequest(
      (r) => /\/api\/profile\/avatar$/.test(r.url()) && r.method() === 'PUT',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    });
    await putPromise;

    await expect(page.getByText('Profile picture updated.')).toBeVisible();
    await expect(page.locator('.profile-card .user-avatar-img')).toBeVisible();
  });

  test('clearing the picture DELETEs it and the placeholder returns', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page, { avatar_url: '/api/data_models/users/7/avatar?v=seed' });
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    // Starts with an avatar image.
    await expect(page.locator('.profile-card .user-avatar-img')).toBeVisible();

    const delPromise = page.waitForRequest(
      (r) => /\/api\/profile\/avatar$/.test(r.url()) && r.method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Remove' }).click();
    await delPromise;

    await expect(page.getByText('Profile picture removed.')).toBeVisible();
    await expect(page.locator('.profile-card .user-avatar-initials')).toBeVisible();
  });

  test('a logged-out visitor has no Profile entry and /profile redirects home', async ({ page }) => {
    // No seedTrustedSession → anonymous.
    await installProfileMocks(page);
    await page.goto('/profile');
    await expect(page).toHaveURL('/');
    await expect(page.locator('a[href="/profile"]')).toHaveCount(0);
  });
});

test.describe('Message board avatar propagation (#4170)', () => {
  async function installBoardMocks(page: Page): Promise<void> {
    // Two users: one with an avatar, one without → the strip must show the
    // image for the first and the initials placeholder for the second (no
    // mixed state where only some author strips carry the avatar).
    await page.route(/\/api\/data_models\/users$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { ID: 1, username: 'hasavatar', avatar_url: '/api/data_models/users/1/avatar?v=a' },
            { ID: 2, username: 'noavatar', avatar_url: '' },
          ],
          total: 2,
          page: 1,
          page_size: 20,
        }),
      });
    });
    await page.route(/\/api\/data_models\/message$/, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { Content: 'from a user with an avatar', SenderID: 1, SentAt: '2026-08-01T09:00:00Z' },
            { Content: 'from a user without one', SenderID: 2, SentAt: '2026-08-01T10:00:00Z' },
          ],
        }),
      });
    });
    await page.route(/\/api\/data_models\/users\/\d+\/avatar/, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 });
    });
    // The board also loads a shared static icon asset; let it 404 harmlessly.
    await page.route(/\/api\/fetch-object\//, (route) => route.fulfill({ status: 404, body: '' }));
  }

  test('author strips render the avatar when set and initials otherwise', async ({ page }) => {
    await seedTrustedSession(page);
    await installBoardMocks(page);
    await page.goto('/member/shared/message-board');
    await dismissMobileSidebarIfPresent(page);

    const items = page.locator('.message-item');
    await expect(items).toHaveCount(2);

    // First author: real avatar image.
    await expect(items.nth(0).locator('.user-avatar-img')).toBeVisible();
    // Second author: initials placeholder, no image.
    await expect(items.nth(1).locator('.user-avatar-initials')).toBeVisible();
    await expect(items.nth(1).locator('.user-avatar-img')).toHaveCount(0);
  });
});
