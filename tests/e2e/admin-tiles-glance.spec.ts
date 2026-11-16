import { test, expect, type Page } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSessionAs,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/** UX walk AA7 (system_3 #11009): the admin home is the operator's "does
 *  anything need me, and where do I go?" page.
 *
 *  §3.107 keeps a 3-line clamp on a tile's description, so a description
 *  that does not fit is cut, and on four admin tiles the cut fell on "Opens in
 *  a new tab", the one fact that changes what a tap does. The fix keeps the
 *  clamp (a ruling) and makes every description fit it; the new-tab notice
 *  moves to the unclamped title row. */

/** Titles of every tile on the page whose description's clamp is engaged,
 *  i.e. whose text is cut. Empty means every description reads in full. */
async function clampedTitles(page: Page): Promise<string[]> {
  await expect(page.locator('.application-card').first()).toBeVisible();
  return page.locator('.application-card').evaluateAll((cards) =>
    cards
      .filter((card) => {
        const p = card.querySelector('.card-description') as HTMLElement | null;
        return !!p && p.scrollHeight > p.clientHeight + 1;
      })
      .map((card) => card.querySelector('.card-title')?.textContent?.trim() || '?'),
  );
}

const NEW_TAB_TITLES = ['Penpot Design', 'Histoire — Design System', 'System 3', 'Data Lake'];

const card = (page: Page, title: string) =>
  page.locator('.application-card').filter({ has: page.locator('.card-title', { hasText: title }) });

async function mockReads(page: Page, opts: { health?: object | number; failures?: object[] | number }) {
  await page.route(/\/api\/health$/, (route) =>
    typeof opts.health === 'number'
      ? route.fulfill({ status: opts.health, body: '' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.health) }),
  );
  await page.route(/\/api\/admin\/invoicing\/import-failures$/, (route) =>
    typeof opts.failures === 'number'
      ? route.fulfill({ status: opts.failures, body: '' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { failures: opts.failures } }),
        }),
  );
}

test.describe('#11009 the admin home answers "does anything need me?"', () => {
  test('a tile that leaves the site says so in its title row; an in-app tile does not', async ({ page }) => {
    await seedAdminSession(page);
    await mockReads(page, { health: { status: 'ok', checks: {} }, failures: [] });
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    for (const title of NEW_TAB_TITLES) {
      await expect(card(page, title).locator('h2 [data-test="new-tab-mark"]'), title).toHaveText('↗ new tab');
      await expect(card(page, title).locator('.card-description'), title).not.toContainText('new tab');
    }
    await expect(card(page, 'Assets').locator('[data-test="new-tab-mark"]')).toHaveCount(0);
  });

  test('System Health and Failed imports come first, each with its state', async ({ page }) => {
    await seedAdminSession(page);
    await mockReads(page, {
      health: { status: 'healthy', service: 'server', checks: { database: 'ok' } },
      failures: [{}, {}, {}],
    });
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    const titles = page.locator('.admin-view .application-list').first().locator('.card-title');
    await expect(titles.nth(0)).toHaveText('System Health');
    await expect(titles.nth(1)).toHaveText('Failed imports');
    const health = card(page, 'System Health').locator('[data-test="card-status"]');
    await expect(health).toHaveText('Server and database HEALTHY');
    await expect(health).toHaveAttribute('data-tone', 'ok');
    const failed = card(page, 'Failed imports').locator('[data-test="card-status"]');
    await expect(failed).toHaveText('3 failed uploads');
    await expect(failed).toHaveAttribute('data-tone', 'warn');
    // Both share the first row: the same top edge at either width.
    const [a, b] = await Promise.all([card(page, 'System Health').boundingBox(), card(page, 'Failed imports').boundingBox()]);
    expect(Math.abs(a!.y - b!.y), 'same row').toBeLessThanOrEqual(1);
  });

  test('none failed reads as none, in one word, not as a zero', async ({ page }) => {
    await seedAdminSession(page);
    await mockReads(page, { health: { status: 'ok', checks: {} }, failures: [] });
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    await expect(card(page, 'Failed imports').locator('[data-test="card-status"]')).toHaveText('No failed uploads');
    await expect(card(page, 'System Health').locator('[data-test="card-status"]')).toHaveText('Server OK');
  });

  test('a read that fails says "Not read", never a zero or an OK', async ({ page }) => {
    await seedAdminSession(page);
    await mockReads(page, { health: 502, failures: 502 });
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    for (const title of ['System Health', 'Failed imports']) {
      const status = card(page, title).locator('[data-test="card-status"]');
      await expect(status, title).toHaveText('Not read');
      await expect(status, title).toHaveAttribute('data-tone', 'unknown');
    }
  });
});

for (const width of [390, 1440]) {
  test.describe(`#11009 tile descriptions fit their clamp at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test('admin home: no description is cut', async ({ page }) => {
      await seedAdminSession(page);
      await page.goto('/admin');
      await dismissMobileSidebarIfPresent(page);
      expect(await clampedTitles(page)).toEqual([]);
    });

    test('member home: no description is cut', async ({ page }) => {
      await seedTrustedSessionAs(page, 'vinoly');
      await page.goto('/member');
      await dismissMobileSidebarIfPresent(page);
      expect(await clampedTitles(page)).toEqual([]);
    });
  });
}
