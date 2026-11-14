import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { collator, groupByLetter, letterKey, monthKey, monthLabel } from '../../src/components/invoicing/listGroups.js';

/** The client book folds by first letter (design_conventions §3.145,
 *  system_3 #10622-A1 / #10817). The module half runs with no page: the
 *  grouping rules are plain functions. The page half uses an in-memory fake;
 *  a catch-all /api/ → 404 is registered first. */

test.describe('#10817 listGroups: German letter order', () => {
  test('a name files under its base letter; a digit or symbol under "#"', () => {
    expect(letterKey('Ärztin Weber')).toBe('A');
    expect(letterKey('Ölmann')).toBe('O');
    expect(letterKey('Übel & Co')).toBe('U');
    expect(letterKey('ßtudio')).toBe('S');
    expect(letterKey('bauer')).toBe('B');
    expect(letterKey('3D-Druck')).toBe('#');
    expect(letterKey('@home')).toBe('#');
    expect(letterKey('  Nord')).toBe('N');
    expect(letterKey('')).toBe('#');
  });

  test('letters run A-Z with "#" last, and names sort in German order within a letter', () => {
    const names = ['Zeller', 'bauer', 'Ärztin', 'Bach', '3D-Druck', 'Anna', 'Ölmann', 'Otto'];
    const groups = groupByLetter(names.map((name) => ({ name })), (r) => r.name);
    expect(groups.map((g) => g.key)).toEqual(['A', 'B', 'O', 'Z', '#']);
    expect(groups.map((g) => g.rows.map((r) => r.name))).toEqual([['Anna', 'Ärztin'], ['Bach', 'bauer'], ['Ölmann', 'Otto'], ['Zeller'], ['3D-Druck']]);
    // The server's byte order would put Ä after Z; the collator does not.
    expect(collator.compare('Ärztin', 'Zeller')).toBeLessThan(0);
  });

  test('month keys and labels', () => {
    expect(monthKey('2026-11-13T00:00:00Z')).toBe('2026-11');
    expect(monthKey('2026-02-01')).toBe('2026-02');
    expect(monthKey(null)).toBe('');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Fake {
  clients: Json[];
}

const client = (id: number, name: string) => ({ id, name, address: 'Weg 1', email: '', paypal_email: '', notes: '' });

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/payers/candidates') return json(route, 200, { payers: [], left_out: {} });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/clients' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const created = { ...client(100 + fake.clients.length, body.name), ...body };
      fake.clients.push(created);
      return json(route, 201, { client: created });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Clients' }).click();
  await expect(page.locator('[data-test="clients-panel"]')).toBeVisible();
}

const group = (page: Page, letter: string) => page.locator(`[data-test="client-group"][data-letter="${letter}"]`);
const visibleRows = (page: Page) => page.locator('[data-test="client-row"]:visible');

test.describe('#10817 Clients fold by first letter', () => {
  test('every letter starts folded, in German order, each summary counting its rows', async ({ page }) => {
    await open(page, { clients: [client(1, 'Zeller'), client(2, 'Ärztin Weber'), client(3, 'Anna'), client(4, '3D-Druck'), client(5, 'bauer')] });
    const groups = page.locator('[data-test="client-group"]');
    await expect(groups).toHaveCount(4);
    expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-letter')))).toEqual(['A', 'B', 'Z', '#']);
    expect(await groups.evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open))).toEqual([false, false, false, false]);
    await expect(visibleRows(page)).toHaveCount(0);
    await expect(group(page, 'A').locator('[data-test="client-group-summary"]')).toHaveText('A · 2');
    // The count is the rows the group renders.
    await expect(group(page, 'A').locator('[data-test="client-row"]')).toHaveCount(2);
  });

  test('opening a letter shows its clients, Ärztin among the A', async ({ page }) => {
    await open(page, { clients: [client(1, 'Zeller'), client(2, 'Ärztin Weber'), client(3, 'Anna')] });
    await group(page, 'A').locator('[data-test="client-group-summary"]').click();
    await expect(group(page, 'A')).toHaveAttribute('open', '');
    await expect(visibleRows(page)).toHaveCount(2);
    await expect(visibleRows(page).nth(0)).toContainText('Anna');
    await expect(visibleRows(page).nth(1)).toContainText('Ärztin Weber');
    await expect(group(page, 'Z')).not.toHaveAttribute('open', '');
  });

  test('a book with one letter shows it open', async ({ page }) => {
    await open(page, { clients: [client(1, 'Galerie Nord'), client(2, 'Gärtnerei Süd')] });
    await expect(page.locator('[data-test="client-group"]')).toHaveCount(1);
    await expect(group(page, 'G')).toHaveAttribute('open', '');
    await expect(visibleRows(page)).toHaveCount(2);
  });

  test('a new client opens its letter and is in view; an opened letter stays open through the refetch', async ({ page }) => {
    await open(page, { clients: [client(1, 'Zeller'), client(2, 'Anna'), client(3, 'Bach')] });
    await group(page, 'Z').locator('[data-test="client-group-summary"]').click();
    await expect(group(page, 'Z')).toHaveAttribute('open', '');

    await page.locator('[data-test="client-add"]').click();
    const form = page.locator('[data-test="client-form"]');
    await form.getByLabel('Name').fill('Ölmann');
    await page.locator('[data-test="client-save"]').click();
    await expect(form).toBeHidden();

    await expect(group(page, 'O')).toHaveAttribute('open', '');
    const added = group(page, 'O').locator('[data-test="client-row"]', { hasText: 'Ölmann' });
    await expect(added).toBeInViewport();
    // Zir own choice survives the refetch; the untouched letters stay folded.
    await expect(group(page, 'Z')).toHaveAttribute('open', '');
    await expect(group(page, 'A')).not.toHaveAttribute('open', '');
  });
});
