import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession } from './helpers/mockBackend';

/**
 * system_3 #5291 (#5120-B1) — the operator's moderation screen.
 *
 * Two server halves stand behind this view: the sign-up kill-switch (#5289,
 * aspirant-server#110) and the moderation that actually takes effect (#5290,
 * aspirant-server#111). What is asserted here is what the operator can SEE and
 * DO — the state of the switch on load, that closing it is confirmed and
 * opening it is not, that an unverified account is distinguishable at a glance,
 * and that blocking names its consequence before it happens.
 *
 * The requests the view issues are asserted too, because a control that renders
 * correctly and PUTs the wrong body is the failure this screen cannot afford:
 * `access_role: "Blocked"` is what ends an abusive session, and nothing else in
 * the page would show it had been sent wrong.
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
    CreatedAt: '2026-01-04T10:00:00Z',
    UpdatedAt: '2026-01-04T10:00:00Z',
  },
  {
    ID: 2,
    username: 'probably-a-bot',
    email: 'bot@example.com',
    access_role: 'Viewer',
    comment: '',
    email_verified_at: null,
    CreatedAt: '2026-09-01T10:00:00Z',
    UpdatedAt: '2026-09-01T10:00:00Z',
  },
];

type Options = { signupEnabled?: boolean; signupStatus?: number };

/** Mounts the admin roster with the two backends this view reads. */
async function openUserAdmin(page: Page, options: Options = {}): Promise<void> {
  const { signupEnabled = true, signupStatus = 200 } = options;

  await seedAdminSession(page);
  await page.route('**/api/data_models/users', json({ items: USERS, total: USERS.length, page: 1, page_size: 20 }));
  await page.route('**/api/signup/status', (route) => {
    if (signupStatus !== 200) {
      return route.fulfill({ status: signupStatus, contentType: 'application/json', body: '{}' });
    }
    return json({ signup_enabled: signupEnabled })(route);
  });
  await page.goto('/admin/users');
  // On the mobile project the sidebar overlay sits over the page and eats every
  // click; the other admin specs dismiss it the same way.
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByTestId('signup-state')).toBeVisible();
}

test.describe('admin sign-up kill-switch', () => {
  test('reports an open switch and offers to close it', async ({ page }) => {
    await openUserAdmin(page, { signupEnabled: true });

    await expect(page.getByTestId('signup-state')).toHaveText('Open');
    await expect(page.getByTestId('signup-action')).toHaveText('Close sign-up');
  });

  test('reports a closed switch on load rather than assuming the default', async ({ page }) => {
    // The state has to come from the server. A control that renders "Open"
    // because open is the default would tell the operator the opposite of the
    // truth on exactly the page they went to in order to check.
    await openUserAdmin(page, { signupEnabled: false });

    await expect(page.getByTestId('signup-state')).toHaveText('Closed');
    await expect(page.getByTestId('signup-action')).toHaveText('Open sign-up');
  });

  test('closing asks first, and sends enabled:false only after the confirmation', async ({ page }) => {
    await openUserAdmin(page, { signupEnabled: true });

    const bodies: unknown[] = [];
    await page.route('**/api/settings/signup', (route) => {
      bodies.push(route.request().postDataJSON());
      return json({ status: 'ok' })(route);
    });

    await page.getByTestId('signup-action').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // The ask is not sent while the dialog is up: a confirmation the action has
    // already outrun is decoration.
    expect(bodies).toHaveLength(0);

    await page.getByTestId('confirm-close-signup').click();
    await expect.poll(() => bodies).toEqual([{ enabled: false }]);
  });

  test('opening does not ask — it restores the default', async ({ page }) => {
    await openUserAdmin(page, { signupEnabled: false });

    const bodies: unknown[] = [];
    await page.route('**/api/settings/signup', (route) => {
      bodies.push(route.request().postDataJSON());
      return json({ status: 'ok' })(route);
    });

    await page.getByTestId('signup-action').click();
    await expect.poll(() => bodies).toEqual([{ enabled: true }]);
  });

  test('a server without the endpoint says so instead of showing a dead control', async ({ page }) => {
    // The client and the server deploy separately. On a server that predates
    // #5289 the status route 404s, and the honest answer is that the switch
    // cannot be read — not a button that silently fails when pressed.
    await openUserAdmin(page, { signupStatus: 404 });

    await expect(page.getByTestId('signup-state')).toContainText('Unknown');
    await expect(page.getByTestId('signup-action')).toHaveCount(0);
  });
});

test.describe('admin user roster', () => {
  test('an account that never verified is distinguishable at a glance', async ({ page }) => {
    await openUserAdmin(page);

    const row = page.getByRole('row').filter({ hasText: 'probably-a-bot' });
    await expect(row.getByTestId('unverified-badge')).toBeVisible();

    const admin = page.getByRole('row').filter({ hasText: 'admin@example.com' });
    await expect(admin.getByTestId('verified-badge')).toBeVisible();
  });

  test('blocking names the sign-out consequence before it happens', async ({ page }) => {
    await openUserAdmin(page);

    const bodies: unknown[] = [];
    await page.route('**/api/data_models/users/2', (route) => {
      bodies.push(route.request().postDataJSON());
      return json({ status: 'ok' })(route);
    });

    const row = page.getByRole('row').filter({ hasText: 'probably-a-bot' });
    await row.getByTestId('block-user').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Since #5290 a block ends the account's live sessions. The operator is
    // told that before they press it, because it is the part of the action
    // they cannot undo by pressing the button again.
    await expect(dialog).toContainText('signed out immediately');
    expect(bodies).toHaveLength(0);

    await page.getByTestId('confirm-block-user').click();
    await expect.poll(() => bodies).toHaveLength(1);
    expect((bodies[0] as { access_role: string }).access_role).toBe('Blocked');
  });

  test('a roster read that fails says so instead of rendering an empty table', async ({ page }) => {
    // This view used to swallow every failure into console.error, so a backend
    // that was down and a site with no accounts looked identical — on the one
    // screen where "there are no users" would be alarming news.
    await seedAdminSession(page);
    await page.route('**/api/signup/status', json({ signup_enabled: true }));
    await page.route('**/api/data_models/users', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/admin/users');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('roster-error')).toBeVisible();
    await expect(page.getByText('No users.')).toHaveCount(0);
  });
});
