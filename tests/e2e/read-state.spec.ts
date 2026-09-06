import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession, seedTrustedSession } from './helpers/mockBackend';

/**
 * system_3 #5302 (#5278-A1) — the read-state grammar, on the two renders that
 * had no read state at all.
 *
 * The #5260 cohesion walk found one condition shipping three grammars. These
 * two pages had the worst of them: `MessageBoardView` caught every failure into
 * `console.error` and left the same empty rectangle a thread with no messages
 * produces, and `/admin/system-health` rendered a heading, a Refresh button and
 * nothing.
 *
 * That is why these two carry the component's first tests. On a page that
 * already distinguished empty from failed, "empty and failed look different"
 * passes whether or not the change works; here it cannot.
 *
 * Every case below pairs the state under test with its sibling, because the
 * claim is about the DIFFERENCE. A test that only asserted "the failed state is
 * visible" would pass against a component that rendered the same thing for all
 * three.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const dead = (route: Route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });

const MESSAGE = {
  ID: 1,
  Content: 'first post',
  SenderID: 1,
  SentAt: '2026-09-01T10:00:00Z',
};

async function board(page: Page, opts: { messages: 'some' | 'none' | 'fail' }): Promise<void> {
  await seedTrustedSession(page);
  await page.route('**/api/data_models/users', json({ items: [{ ID: 1, username: 'someone', display_name: 'Someone' }] }));
  await page.route('**/api/data_models/message', (route) => {
    if (opts.messages === 'fail') return dead(route);
    return json({ items: opts.messages === 'some' ? [MESSAGE] : [] })(route);
  });
  await page.goto('/member/shared/message-board');
  await dismissMobileSidebarIfPresent(page);
}

test.describe('#5302 message board read states', () => {
  test('a failed read and an empty board do not look the same', async ({ page }) => {
    // The defect, stated as a test. Both used to render an empty rectangle.
    await board(page, { messages: 'fail' });
    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    await expect(page.getByTestId('read-state-empty')).toHaveCount(0);

    await board(page, { messages: 'none' });
    await expect(page.getByTestId('read-state-empty')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });

  test('a board with messages renders the messages and no state at all', async ({ page }) => {
    // The control for both cases above: with data, neither state appears, so a
    // component that rendered its states unconditionally would fail here.
    await board(page, { messages: 'some' });
    await expect(page.getByText('first post')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
    await expect(page.getByTestId('read-state-empty')).toHaveCount(0);
  });

  test('the failed state says what failed and what still works, in the product voice', async ({
    page,
  }) => {
    await board(page, { messages: 'fail' });
    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toContainText('The message board did not load');
    await expect(page.getByTestId('read-state-still-works')).toContainText('You can still post');

    // The whole point of the grammar: no transport detail on the page. Asserted
    // against the page body, not against the component, because a leak can
    // arrive from anywhere on the route.
    await expect(page.locator('body')).not.toContainText('status code');
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('the failed state offers a retry that actually re-reads', async ({ page }) => {
    await seedTrustedSession(page);
    await page.route('**/api/data_models/users', json({ items: [] }));
    let attempts = 0;
    await page.route('**/api/data_models/message', (route) => {
      attempts += 1;
      // Fail once, then succeed — so the retry has something to prove.
      if (attempts === 1) return dead(route);
      return json({ items: [MESSAGE] })(route);
    });
    await page.goto('/member/shared/message-board');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    await page.getByTestId('read-state-retry').click();
    await expect(page.getByText('first post')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

test.describe('#5302 system health read states', () => {
  const HEALTH_ROUTES = [
    '**/api/health',
    '**/api/system/containers',
    '**/api/system/disk',
    '**/api/system/db-stats',
  ];

  test('every endpoint down renders a failure, not an empty page', async ({ page }) => {
    // Before this the page rendered its heading, its Refresh button and nothing
    // — which is also what a page with no data looks like.
    await seedAdminSession(page);
    for (const r of HEALTH_ROUTES) await page.route(r, dead);
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('System health did not load');
    await expect(page.getByTestId('read-state-still-works')).toContainText('rest of the admin area');
    await expect(page.locator('body')).not.toContainText('status code');
    await expect(page.locator('body')).not.toContainText('Unexpected error');
  });

  test('control: endpoints answering renders the data and no read state', async ({ page }) => {
    await seedAdminSession(page);
    await page.route('**/api/health', json({ data: { status: 'ok', uptime_seconds: 10 } }));
    await page.route('**/api/system/containers', json({ containers: [] }));
    await page.route('**/api/system/disk', json({ disks: [], volumes: [], images: {} }));
    await page.route('**/api/system/db-stats', json({ data: { size_mb: 1 } }));
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByText('OK')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });

  test('a partial failure is not a failure — the page shows what answered', async ({ page }) => {
    // The existing behaviour worth keeping: this page fans out to four
    // endpoints and only a total failure is a failed read. A grammar that
    // blanked the page whenever one endpoint was down would be a regression
    // dressed as a fix.
    await seedAdminSession(page);
    await page.route('**/api/health', json({ data: { status: 'ok', uptime_seconds: 10 } }));
    await page.route('**/api/system/containers', dead);
    await page.route('**/api/system/disk', dead);
    await page.route('**/api/system/db-stats', dead);
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByText('OK')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});
