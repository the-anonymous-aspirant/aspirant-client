import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession } from './helpers/mockBackend';

/**
 * system_3 #11010 (UX walk AA8, report 990, AA-9 and AA-3): the admin pages
 * share one grammar. One name per page on the tile, the title and the tab;
 * the house time spelling (§3.120 Q5); card headings at the card step
 * (§3.120 Q1); Upload in the primary amber (D8); a user card headed by the
 * username (§3.122 P5); a link on a dark card in the card's ink (D9, §3.121).
 *
 * Every user and value here is invented.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const USERS = [
  {
    ID: 1,
    username: 'admin',
    email: 'admin@example.com',
    access_role: 'Admin',
    comment: '',
    email_verified_at: '2026-01-04T10:00:00Z',
    CreatedAt: '2026-01-04T09:05:00Z',
    UpdatedAt: '2026-02-11T17:42:00Z',
  },
  {
    ID: 2,
    username: 'test-member',
    email: 'member@example.com',
    access_role: 'Member',
    comment: '',
    email_verified_at: null,
    CreatedAt: '2026-09-01T10:00:00Z',
    UpdatedAt: '2026-09-01T10:00:00Z',
  },
];

/** Every /api/ read refused unless a later route answers it: the pages'
 *  headings and actions render either way, which is what is asserted. */
async function openAdmin(page: Page, path: string): Promise<void> {
  await seedAdminSession(page);
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await page.route(
    '**/api/data_models/users',
    json({ items: USERS, total: USERS.length, page: 1, page_size: 20 })
  );
  await page.route('**/api/signup/status', json({ signup_enabled: true }));
  await page.route(
    /\/api\/health$/,
    json({ status: 'healthy', service: 'aspirant-server', checks: { database: 'ok' } })
  );
  await page.goto(path);
  await dismissMobileSidebarIfPresent(page);
}

/** sRGB channels 0..1 from `rgb()`, `rgba()` or `color(srgb …)`. */
function channels(css: string): number[] {
  const nums = (css.match(/[\d.]+/g) ?? []).map(Number);
  if (css.startsWith('color(')) return nums.slice(0, 3);
  return nums.slice(0, 3).map((n) => n / 255);
}

function contrast(a: string, b: string): number {
  const lum = (css: string) => {
    const [r, g, bl] = channels(css).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('one name per page: tile, title and tab', () => {
  for (const [tile, path] of [
    ['Users', '/admin/users'],
    ['Assets', '/admin/assets'],
    ['System Health', '/admin/system-health'],
    ['Voice Commander', '/admin/voice-commander'],
    ['Advisor', '/admin/advisor'],
  ] as const) {
    test(`the "${tile}" tile opens a page titled "${tile}"`, async ({ page }) => {
      await openAdmin(page, '/admin');
      await expect(page.locator('.application-card', { hasText: tile }).first()).toBeVisible();
      await expect(page).toHaveTitle('Admin · The Aspirant');
      await page.goto(path);
      await expect(page.locator('h1')).toHaveText(tile);
      await expect(page).toHaveTitle(`${tile} · The Aspirant`);
    });
  }
});

test('Users spells every date the house way', async ({ page }) => {
  await openAdmin(page, '/admin/users');
  const body = page.locator('.table-wrapper');
  await expect(body).toContainText('2026-01-04 09:05 UTC');
  await expect(body).toContainText('2026-02-11 17:42 UTC');
  await expect(page.getByTestId('verified-badge')).toHaveText('2026-01-04 10:00 UTC');
  await expect(body).not.toContainText(/\d{1,2}\/\d{1,2}\/\d{4}/);
});

test('card headings sit one step below the page title on every admin page', async ({ page }) => {
  const sizes: Record<string, Set<string>> = {};
  for (const path of ['/admin/system-health', '/admin/advisor', '/admin/voice-commander']) {
    await openAdmin(page, path);
    const h1 = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontSize);
    const cardHeads = page.locator('h3');
    await expect(cardHeads.first()).toBeVisible();
    // A heading in a card; System Health's "Containers" heads a section on
    // the page ground and takes the section step instead.
    const got = await cardHeads.evaluateAll((els) =>
      els
        .filter((el) => !el.closest('.section-header'))
        .map((el) => `${getComputedStyle(el).fontSize}/${getComputedStyle(el).fontWeight}`)
    );
    sizes[path] = new Set(got);
    for (const s of got) {
      expect(parseFloat(s), `${path}: a card heading is smaller than the page title`).toBeLessThan(
        parseFloat(h1)
      );
    }
  }
  const all = new Set(Object.values(sizes).flatMap((s) => [...s]));
  expect([...all], 'one card heading size and weight across the admin pages').toHaveLength(1);
});

test('Upload is the primary amber, not a status green', async ({ page }) => {
  await openAdmin(page, '/admin/users');
  const primary = await page
    .getByRole('button', { name: 'Add New User' })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.goto('/admin/assets');
  const upload = page.getByRole('button', { name: 'Upload' });
  await expect(upload).toBeVisible();
  expect(await upload.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(primary);
  // It still opens the file picker.
  const chooser = page.waitForEvent('filechooser');
  await upload.click();
  await chooser;
});

test('a user card on a phone is headed by the username, the role at its right', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAdmin(page, '/admin/users');
  const card = page.locator('tbody tr', { hasText: 'test-member' });
  await expect(card.locator('.data-table__card-cell--identity')).toHaveText('test-member');
  await expect(card.locator('.data-table__card-cell--figure')).toHaveText('Member');
  const id = await card.locator('.data-table__card-cell--identity').boundingBox();
  const role = await card.locator('.data-table__card-cell--figure').boundingBox();
  expect(role!.x, 'the role is right of the username').toBeGreaterThan(id!.x);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(0);
});

test.describe('"Draw an icon" on the dark profile card', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`reads at 4.5:1 or better in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seedAdminSession(page);
      await page.route(
        /\/api\/profile$/,
        json({
          ID: 1,
          username: 'admin',
          display_name: 'admin',
          email: 'admin@example.com',
          avatar_url: '',
          CreatedAt: '2026-01-04T10:00:00Z',
        })
      );
      await page.goto('/profile');
      const link = page.getByRole('button', { name: 'Draw an icon' });
      await expect(link).toBeVisible();
      const ink = await link.evaluate((el) => getComputedStyle(el).color);
      const ground = await page
        .locator('.profile-card')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(contrast(ink, ground), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
