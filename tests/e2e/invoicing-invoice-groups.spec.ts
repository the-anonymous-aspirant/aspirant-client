import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { groupInvoicesByMonth } from '../../src/components/invoicing/listGroups.js';

/** The invoice list folds by month, drafts first (design_conventions §3.145,
 *  system_3 #10622-A2 / #10818). The module half runs with no page. The page
 *  half uses an in-memory fake that applies the server's own filters (status,
 *  client search); a catch-all /api/ → 404 is registered first. */

type Json = Record<string, any>;

const inv = (id: number, status: string, number: string | null, issued: string | null, client = 'Galerie Nord') => ({
  id, status, client_id: 1, client_name: client, invoice_number: number,
  issue_date: issued ? `${issued}T00:00:00Z` : null,
  service_date_from: '2026-08-01T00:00:00Z', service_date_to: '2026-08-01T00:00:00Z',
  vat_rate_bp: 1900, total_cents: 1000 * id, currency: 'EUR',
});

test.describe('#10818 listGroups: invoices by month', () => {
  test('Drafts first, months newest first, newest first within a month, a cancelled one in its month', () => {
    const groups = groupInvoicesByMonth([
      inv(1, 'issued', '2026-001', '2026-09-03'),
      inv(2, 'draft', null, null),
      inv(3, 'cancelled', '2026-003', '2026-11-02'),
      inv(4, 'issued', '2026-004', '2026-11-20'),
      inv(5, 'draft', null, null),
      inv(6, 'issued', '2026-002', '2026-10-11'),
      inv(7, 'issued', '2026-005', '2026-11-20'),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.rows.map((r: Json) => r.id)])).toEqual([
      ['drafts', 'Drafts', [2, 5]],
      ['2026-11', 'November 2026', [7, 4, 3]],
      ['2026-10', 'October 2026', [6]],
      ['2026-09', 'September 2026', [1]],
    ]);
    // Counts are the rows each group holds.
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(7);
  });

  test('no drafts, no Drafts group; no rows, no groups', () => {
    expect(groupInvoicesByMonth([inv(1, 'issued', '2026-001', '2026-09-03')]).map((g) => g.key)).toEqual(['2026-09']);
    expect(groupInvoicesByMonth([])).toEqual([]);
  });
});

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Fake {
  invoices: Json[];
  issueDate: string;
}

const newFake = (): Fake => ({
  invoices: [
    inv(8, 'draft', null, null),
    inv(9, 'draft', null, null, 'Studio Erfunden'),
    inv(7, 'issued', '2026-007', '2026-11-18'),
    inv(6, 'cancelled', '2026-006', '2026-11-05'),
    inv(5, 'issued', '2026-005', '2026-11-03', 'Studio Erfunden'),
    inv(4, 'issued', '2026-004', '2026-10-21'),
    inv(3, 'issued', '2026-003', '2026-10-02', 'Studio Erfunden'),
    inv(2, 'issued', '2026-002', '2026-09-12'),
  ],
  // An issue lands in an OLD month on purpose, to show that month opening.
  issueDate: '2026-09-28',
});

async function open(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 8 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/invoices' && method === 'GET') {
      const status = url.searchParams.get('status');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return json(route, 200, {
        invoices: fake.invoices.filter((i) => (!status || i.status === status) && (!q || i.client_name.toLowerCase().includes(q))),
      });
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)(\/issue)?$/);
    if (m) {
      const row = fake.invoices.find((i) => i.id === Number(m[1]))!;
      if (m[2] && method === 'POST') Object.assign(row, { status: 'issued', invoice_number: '2026-008', number: 8, issue_date: `${fake.issueDate}T00:00:00Z` });
      const items = [{ id: 1, position: 1, description: 'Wandbild', quantity_milli: 1000, unit_price_cents: row.total_cents, line_total_cents: row.total_cents }];
      return json(route, 200, { invoice: row, line_items: items, payments: [], warnings: [] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.locator('[data-test="invoice-group"]').first()).toBeVisible();
}

const groups = (page: Page) => page.locator('[data-test="invoice-group"]');
const group = (page: Page, key: string) => page.locator(`[data-test="invoice-group"][data-group="${key}"]`);
const summary = (page: Page, key: string) => group(page, key).locator('[data-test="invoice-group-summary"]');
const openStates = (page: Page) =>
  groups(page).evaluateAll((els) => els.map((e) => `${e.getAttribute('data-group')}:${(e as HTMLDetailsElement).open ? 'open' : 'folded'}`));
const visibleRows = (page: Page) => page.locator('[data-test="invoice-row"]:visible');
const tick = (page: Page, number: string) => page.getByRole('checkbox', { name: `Select invoice ${number}` });
const selectAll = (page: Page) => page.locator('[data-test="select-all-shown"]');
const mergeScope = (page: Page) => page.locator('[data-test="export-merged-scope"]');

test.describe('#10818 the invoice list folds by month', () => {
  test('Drafts and the newest month start open; older months are folded, each with its count', async ({ page }) => {
    await open(page, newFake());
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:open', '2026-10:folded', '2026-09:folded']);
    await expect(summary(page, 'drafts')).toHaveText('Drafts · 2');
    await expect(summary(page, '2026-11')).toHaveText('November 2026 · 3 invoices');
    await expect(summary(page, '2026-10')).toHaveText('October 2026 · 2 invoices');
    await expect(summary(page, '2026-09')).toHaveText('September 2026 · 1 invoice');
    // The count is the rows the group renders; only open groups show theirs.
    await expect(group(page, '2026-11').locator('[data-test="invoice-row"]')).toHaveCount(3);
    await expect(visibleRows(page)).toHaveCount(5);
    // Newest first within the month, the cancelled one in its month.
    await expect(group(page, '2026-11').locator('[data-test="invoice-row"]').nth(0)).toContainText('2026-007');
    await expect(group(page, '2026-11').locator('[data-test="invoice-row"]').nth(2)).toContainText('2026-005');
    await expect(group(page, '2026-11').locator('[data-test="invoice-row"][data-status="cancelled"]')).toContainText('2026-006');
  });

  test('a client search opens every group, and clearing it brings back zir state from before', async ({ page }) => {
    await open(page, newFake());
    // Zir own choice first: ze opens October.
    await summary(page, '2026-10').click();
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:open', '2026-10:open', '2026-09:folded']);

    await page.locator('[data-test="filter-search"]').fill('Galerie');
    await expect(summary(page, '2026-11')).toHaveText('November 2026 · 2 invoices');
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:open', '2026-10:open', '2026-09:open']);
    await expect(visibleRows(page)).toHaveCount(5);

    await page.locator('[data-test="filter-search"]').fill('');
    await expect(summary(page, '2026-11')).toHaveText('November 2026 · 3 invoices');
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:open', '2026-10:open', '2026-09:folded']);
  });

  test('a status filter opens every group too', async ({ page }) => {
    await open(page, newFake());
    await page.locator('[data-test="filter-status"]').click();
    await page.getByRole('option', { name: 'Issued', exact: true }).click();
    await expect(groups(page)).toHaveCount(3);
    expect(await openStates(page)).toEqual(['2026-11:open', '2026-10:open', '2026-09:open']);
    await expect(visibleRows(page)).toHaveCount(5);
  });

  test('"Select all" counts only open groups, and folding a group drops its ticks', async ({ page }) => {
    await open(page, newFake());
    // November is open with two issued invoices; October and September are folded.
    await expect(selectAll(page)).toContainText('Select all 2 issued shown');
    await summary(page, '2026-10').click();
    await expect(selectAll(page)).toContainText('Select all 4 issued shown');

    await tick(page, '2026-004').check();
    await tick(page, '2026-007').check();
    await expect(mergeScope(page)).toHaveText('2 ticked invoices in one PDF, in number order.');

    // Folding October takes its ticked invoice out of the selection.
    await summary(page, '2026-10').click();
    await expect(group(page, '2026-10')).not.toHaveAttribute('open', '');
    await expect(selectAll(page)).toContainText('Select all 2 issued shown');
    await expect(mergeScope(page)).toHaveText('1 ticked invoice in one PDF.');
    // Reopening it does not bring the tick back.
    await summary(page, '2026-10').click();
    await expect(tick(page, '2026-004')).not.toBeChecked();
    await expect(tick(page, '2026-007')).toBeChecked();
  });

  test('a draft issued from the editor lands in its month, which opens with the row in view', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(group(page, '2026-09')).not.toHaveAttribute('open', '');
    await group(page, 'drafts').locator('[data-test="invoice-row"]').first().click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-008');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);

    await expect(summary(page, 'drafts')).toHaveText('Drafts · 1');
    await expect(summary(page, '2026-09')).toHaveText('September 2026 · 2 invoices');
    await expect(group(page, '2026-09')).toHaveAttribute('open', '');
    await expect(group(page, '2026-09').locator('[data-test="invoice-row"]', { hasText: '2026-008' })).toBeInViewport();
    // October, which ze never touched, stays folded.
    await expect(group(page, '2026-10')).not.toHaveAttribute('open', '');
  });

  test('a month ze opened or folded stays that way when the list reloads', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await summary(page, '2026-10').click();
    await summary(page, '2026-11').click();
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:folded', '2026-10:open', '2026-09:folded']);
    // Issuing a draft reloads the list; the issued one lands in September.
    await group(page, 'drafts').locator('[data-test="invoice-row"]').first().click();
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-008');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(summary(page, '2026-09')).toHaveText('September 2026 · 2 invoices');
    expect(await openStates(page)).toEqual(['drafts:open', '2026-11:folded', '2026-10:open', '2026-09:open']);
  });

  test('on desktop the columns line up from one group to the next', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'tables are the desktop layout; a phone shows cards');
    await open(page, newFake());
    await summary(page, '2026-10').click();
    const edges = (key: string) =>
      group(page, key).locator('thead th').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
    const november = await edges('2026-11');
    expect(november).toHaveLength(7);
    expect(new Set(november).size).toBe(7);
    expect(await edges('2026-10')).toEqual(november);
    expect(await edges('drafts')).toEqual(november);
  });

  test('a list with one group shows it open', async ({ page }) => {
    const fake = newFake();
    fake.invoices = [inv(2, 'issued', '2026-002', '2026-09-12'), inv(3, 'issued', '2026-003', '2026-09-20')];
    await open(page, fake);
    expect(await openStates(page)).toEqual(['2026-09:open']);
    await expect(visibleRows(page)).toHaveCount(2);
  });
});
