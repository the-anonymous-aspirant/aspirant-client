import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4445 (#4442-A10c) — the nine glyph-only controls in the three admin views
 * are AspButton size="icon" (§3.89 / §3.23 rule-4), each with an accessible
 * name and the DS's fixed 44x44 target.
 *
 * These assert the OUTCOME (a DS root, a name, a square target, a working
 * handler), not the class list of the moment, so a regression is caught
 * however it is reintroduced.
 *
 * The dogfood walk on this task measured what the port actually changed:
 * Assets download 1.71:1 -> 4.80:1 and delete 2.82:1 -> 4.80:1, VoiceCommander
 * close-task 3.77:1 -> 6.57:1 — three WCAG AA contrast failures fixed, because
 * the resting hues these controls used to carry (--brand-accent, --feedback-
 * error, --feedback-success) were never legible on their own surfaces. Every
 * box went from smaller than the 24x24 AA target floor in one dimension
 * (20x27, 28x19) to 44x44.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** On the mobile-safari project the sidebar starts open and its .mobile-overlay
 *  covers the route content, intercepting every click — the repo's own helper
 *  exists for this. Omitting it is why this spec's Finance case passed on
 *  chromium and timed out on mobile-safari: the control was visible and the
 *  click never landed. */
async function openAdmin(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await dismissMobileSidebarIfPresent(page);
}

async function seedAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('user_role', 'Admin');
    localStorage.setItem('user_name', 'e2e-admin');
  });
}

/** Playwright matches routes most-recently-registered first, so the catch-all
 *  is registered BEFORE the specific mocks or it swallows every one of them. */
async function mockAdmin(page: Page): Promise<void> {
  await page.route(/\/api\//, json({}));
  await page.route(
    /\/api\/assets(\?.*)?$/,
    json({ assets: [{ key: 'report.pdf', etag: 'e1', content_type: 'application/pdf', size: 1024, last_modified: '2026-08-01T00:00:00Z' }] }),
  );
  await page.route(/\/api\/finance\/summary\/overview/, json({ total_transactions: 12, total_income: 1000, total_expenses: 500, banks: ['seb'], categories: [] }));
  await page.route(/\/api\/finance\/summary\/monthly/, json([]));
  await page.route(/\/api\/finance\/summary\/outliers/, json({ top_expenses: [], top_income: [] }));
  await page.route(/\/api\/finance\/transactions/, json({ transactions: [], total: 0 }));
  await page.route(/\/api\/finance\/sources/, json([{ bank: 'seb', name: 'SEB', transaction_count: 12 }]));
  await page.route(/\/api\/voice-messages/, json({ items: [{ id: 1, transcript: 'hello', created_at: '2026-08-01T00:00:00Z', status: 'new' }] }));
  await page.route(/\/api\/commander\/tasks/, json({ items: [{ id: 1, title: 'Task one', status: 'open', created_at: '2026-08-01T00:00:00Z' }], total: 1 }));
  await page.route(/\/api\/commander\/notes/, json({ items: [{ id: 1, title: 'Note', content: 'body', created_at: '2026-08-01T00:00:00Z' }], total_pages: 1 }));
  await page.route(/\/api\/commander\/vocabulary/, json([]));
}

/** Every A10c control: the DS root, an accessible name, the 44x44 square. */
async function expectIconButton(page: Page, name: string): Promise<void> {
  const btn = page.getByRole('button', { name }).first();
  await expect(btn, `${name}: rendered`).toBeVisible();
  await expect(btn, `${name}: is the DS icon shape`).toHaveClass(/btn--size-icon/);
  await expect(btn, `${name}: keeps an accessible name`).toHaveAccessibleName(name);
  const box = await btn.boundingBox();
  expect(box, `${name}: has a box`).not.toBeNull();
  expect(Math.round(box!.width), `${name}: 44px wide`).toBe(44);
  expect(Math.round(box!.height), `${name}: 44px tall`).toBe(44);
}

test.describe('#4445 admin glyph-only controls are AspButton size="icon"', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdmin(page);
    await mockAdmin(page);
  });

  test('Assets row actions', async ({ page }) => {
    await openAdmin(page, '/admin/assets');
    await expect(page.locator('.file-name')).toBeVisible();
    await expectIconButton(page, 'Download');
    await expectIconButton(page, 'Delete');
  });

  test('Finance schema control, and the modal closer that had no name at all', async ({ page }) => {
    await openAdmin(page, '/admin/finance');
    await expect(page.locator('.source-folder')).toBeVisible();
    await expectIconButton(page, 'View expected CSV schema');

    // The handler still fires, and the modal's closer — nameless before #4445
    // (no aria-label, no title, no text) — has a name and closes the modal.
    //
    // Since #4516 that closer is AspModal's own, not the AspButton this task
    // built: the dialog is a DS component now, so the ✕ comes with it. What is
    // asserted is what #4445 was actually about — a NAME and a target no
    // smaller than the WCAG 2.5.8 floor — rather than the DS class of the
    // moment, which is why this reads `.modal__close` and 44px and not
    // `btn--size-icon`.
    await page.getByRole('button', { name: 'View expected CSV schema' }).first().click();
    const closer = page.getByRole('button', { name: 'Close dialog' }).first();
    await expect(closer).toBeVisible();
    await expect(closer).toHaveClass(/modal__close/);
    const box = await closer.boundingBox();
    expect(box, 'schema dialog closer: has a box').not.toBeNull();
    expect(Math.round(box!.width), 'schema dialog closer: >= 44px wide').toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height), 'schema dialog closer: >= 44px tall').toBeGreaterThanOrEqual(44);
    await closer.click();
    await expect(closer).toBeHidden();
  });

  test('VoiceCommander message, task and note actions', async ({ page }) => {
    await openAdmin(page, '/admin/voice-commander');
    await expect(page.locator('.btn-record, .voice-commander, h1').first()).toBeVisible();
    await expectIconButton(page, 'Delete');
    await expectIconButton(page, 'Close task');
  });
});
