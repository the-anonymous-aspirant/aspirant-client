import { test, expect, type Page, type Route, type Request, type Locator } from '@playwright/test';
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

test.describe('Pixel-draw avatar (#4202)', () => {
  test('the draw surface opens, paints a cell, and Save PUTs the rasterized PNG', async ({
    page,
  }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page);
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    // The draw surface is collapsed until the user opts in.
    await expect(page.locator('.pixel-grid')).toHaveCount(0);
    await page.getByRole('button', { name: 'Draw an icon' }).click();
    await expect(page.locator('.pixel-grid')).toBeVisible();

    // Save is disabled on an empty canvas — nothing to upload yet.
    const saveBtn = page.getByRole('button', { name: 'Save drawing' });
    await expect(saveBtn).toBeDisabled();

    // Paint two cells (default palette colour, then a second swatch).
    await page.locator('.pixel-cell[data-idx="0"]').click();
    await page.getByRole('button', { name: 'colour #1e88e5' }).click();
    await page.locator('.pixel-cell[data-idx="25"]').click();
    await expect(saveBtn).toBeEnabled();

    // Save rasterizes to a PNG and PUTs it through the existing avatar endpoint.
    const putPromise = page.waitForRequest(
      (r) => /\/api\/profile\/avatar$/.test(r.url()) && r.method() === 'PUT',
    );
    await saveBtn.click();
    await putPromise;

    // On success the avatar image renders and the draw surface closes.
    await expect(page.getByText('Profile picture updated.')).toBeVisible();
    await expect(page.locator('.profile-card .user-avatar-img')).toBeVisible();
    await expect(page.locator('.pixel-grid')).toHaveCount(0);
  });

  test('Clear empties the canvas and re-disables Save', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page);
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    await page.getByRole('button', { name: 'Draw an icon' }).click();
    await page.locator('.pixel-cell[data-idx="0"]').click();
    await expect(page.getByRole('button', { name: 'Save drawing' })).toBeEnabled();

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('button', { name: 'Save drawing' })).toBeDisabled();
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

/** Computed foreground-over-effective-background contrast for `locator`.
 *  Same measurement as tests/e2e/trusted-contrast.spec.ts (#3027 / #3014):
 *  asserts the outcome (>= WCAG AA 4.5:1), not the token, so a regression is
 *  caught however it is reintroduced. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let bg = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

test.describe('Sidebar single Profile entry + display-name legibility (#4201)', () => {
  test('the who-am-I avatar is the single, clickable Profile entry', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page);
    await page.goto('/');

    // Defect A: the redundant upper "Profile" sidebar entry is removed — there
    // is exactly one /profile link, and it is the who-am-I avatar strip.
    await expect(page.locator('a[href="/profile"]')).toHaveCount(1);
    const avatarLink = page.locator('a.user-avatar-link[href="/profile"]');
    await expect(avatarLink).toHaveCount(1);
    // The link wraps the avatar (a real anchor → clickable navigation to /profile).
    await expect(avatarLink.locator('.user-avatar-initials, .user-avatar-img')).toHaveCount(1);
  });

  test('the display-name input text clears WCAG AA contrast on its surface', async ({ page }) => {
    await seedTrustedSession(page);
    await installProfileMocks(page, { display_name: 'Visible Name' });
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    // Defect B: the value was white-over-white (invisible). The input text must
    // clear AA against its own --surface-elevated background.
    const input = page.locator('#display-name');
    await expect(input).toHaveValue('Visible Name');
    expect(await contrastRatio(input)).toBeGreaterThanOrEqual(4.5);
  });
});
