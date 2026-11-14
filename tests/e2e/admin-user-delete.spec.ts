import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession } from './helpers/mockBackend';

/** Admin → Users, the row actions (system_3 #11004, UX walk AA2; D13, D12,
 *  D8, §3.99, §3.122 P5). Delete sent its request at once and a failure went
 *  to the console only; the signed-in admin's own row carried Block and
 *  Delete; and a red Close sign-up was the page's first control. Every /api
 *  call is answered here. The seeded session is `e2e-admin`. */

const json = (status: number, body: unknown) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const row = (ID: number, username: string, access_role: string) => ({
  ID,
  username,
  email: `${username}@example.com`,
  access_role,
  comment: '',
  email_verified_at: '2026-01-04T10:00:00Z',
  CreatedAt: '2026-01-04T10:00:00Z',
  UpdatedAt: '2026-01-04T10:00:00Z',
});
const USERS = [row(1, 'e2e-admin', 'Admin'), row(2, 'flora-test', 'Member')];

async function open(page: Page, deleteAnswer?: (route: Route) => Promise<void>) {
  const deletes: string[] = [];
  await page.route(/\/api\//, json(404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route('**/api/signup/status', json(200, { signup_enabled: true }));
  await page.route(
    '**/api/data_models/users',
    json(200, { items: USERS, total: 2, page: 1, page_size: 20 })
  );
  await page.route(/\/api\/data_models\/users\/\d+$/, (route) => {
    if (route.request().method() !== 'DELETE') return json(200, { status: 'ok' })(route);
    deletes.push(new URL(route.request().url()).pathname);
    return deleteAnswer ? deleteAnswer(route) : json(200, { status: 'success' })(route);
  });
  await seedAdminSession(page);
  await page.goto('/admin/users');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('row').filter({ hasText: 'flora-test' })).toBeVisible();
  return deletes;
}

const userRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: `${name}@example.com` });

test('Delete asks first, naming the account and what goes; Cancel sends nothing', async ({
  page,
}) => {
  const deletes = await open(page);
  await userRow(page, 'flora-test').locator('[data-test="delete-user"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this account?');
  await expect(dialog.locator('[data-test="delete-consequence"]')).toHaveText(
    'flora-test can no longer sign in, and the account leaves this list. There is no undo on this screen. To stop access and keep the account, block it instead.'
  );
  expect(deletes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(0);
});

test('Delete account in the confirmation sends the one request', async ({ page }) => {
  const deletes = await open(page);
  await userRow(page, 'flora-test').locator('[data-test="delete-user"]').click();
  await page.locator('[data-test="confirm-delete-user"]').click();
  await expect.poll(() => deletes).toEqual(['/api/data_models/users/2']);
  await expect(page.locator('[data-test="row-action-error"]')).toHaveCount(0);
});

test("a refused delete says so on the page, in the server's words", async ({ page }) => {
  await open(page, json(400, { error: { code: 'bad_request', message: 'User not found' } }));
  await userRow(page, 'flora-test').locator('[data-test="delete-user"]').click();
  await page.locator('[data-test="confirm-delete-user"]').click();
  await expect(page.locator('[data-test="row-action-error"]')).toHaveText(
    'Could not delete flora-test: User not found'
  );
  // It looks and sounds like a failure: announced, and in the error ink.
  const line = page.locator('[data-test="row-action-error"]');
  await expect(line).toHaveAttribute('role', 'alert');
  const inks = await line.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--feedback-error-text)';
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { got: getComputedStyle(el).color, want };
  });
  expect(inks.got).toBe(inks.want);
  // The list is still there: a refused write is not a failed read.
  await expect(userRow(page, 'flora-test')).toBeVisible();
});

test('a delete with no answer says so too', async ({ page }) => {
  await open(page, (route) => route.abort());
  await userRow(page, 'flora-test').locator('[data-test="delete-user"]').click();
  await page.locator('[data-test="confirm-delete-user"]').click();
  await expect(page.locator('[data-test="row-action-error"]')).toHaveText(
    'Could not delete flora-test: the server did not say why. It may be unreachable — try again.'
  );
});

test('the signed-in account offers neither Block nor Delete', async ({ page }) => {
  await open(page);
  const self = userRow(page, 'e2e-admin');
  await expect(self.locator('[data-test="self-row-note"]')).toHaveText('Your account');
  await expect(self.getByTestId('block-user')).toHaveCount(0);
  await expect(self.locator('[data-test="delete-user"]')).toHaveCount(0);
  await expect(self.getByRole('button', { name: 'Edit' })).toBeVisible();
  const other = userRow(page, 'flora-test');
  await expect(other.getByTestId('block-user')).toBeVisible();
  await expect(other.locator('[data-test="delete-user"]')).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`at rest nothing on the page is red, and Delete is set apart (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page);
      await expect(page.locator('.btn--destructive')).toHaveCount(0);
      await expect(page.getByTestId('signup-action')).toHaveText('Close sign-up');

      const other = userRow(page, 'flora-test');
      const block = (await other.getByTestId('block-user').boundingBox())!;
      const edit = (await other.getByRole('button', { name: 'Edit' }).boundingBox())!;
      const del = (await other.locator('[data-test="delete-user"]').boundingBox())!;
      expect(block.x - (edit.x + edit.width), 'Edit to Block').toBeGreaterThanOrEqual(8);
      expect(del.x - (block.x + block.width), 'Delete is set apart').toBeGreaterThanOrEqual(24);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      ).toBe(false);
    });
  }
}

test('red belongs to the confirmations: Close sign-up and Delete confirm in red', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('signup-action').click();
  await expect(page.getByTestId('confirm-close-signup')).toHaveClass(/btn--destructive/);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await userRow(page, 'flora-test').locator('[data-test="delete-user"]').click();
  await expect(page.locator('[data-test="confirm-delete-user"]')).toHaveClass(/btn--destructive/);
});
