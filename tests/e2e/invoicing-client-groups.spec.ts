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

// Letters fold only when the book is long: more than 10 clients (§3.145
// Decision 3, amended 2026-11-14; system_3 #11102). `book` pads a list of
// names to `n` clients with invented ones under letters the tests do not read.
const FILLER = ['Kai Muster', 'Lena Probe', 'Moritz Beispiel', 'Nina Test', 'Paul Platzhalter', 'Rita Exempel', 'Sven Testsson', 'Tara Muster', 'Uwe Probe', 'Vera Beispiel', 'Wim Test'];
const book = (names: string[], n = 11) =>
  [...names, ...FILLER.slice(0, Math.max(0, n - names.length))].map((name, i) => client(i + 1, name));

test.describe('#10817 Clients fold by first letter (a book of more than 10)', () => {
  test('every letter starts folded, in German order, each summary counting its clients', async ({ page }) => {
    await open(page, { clients: book(['Zeller', 'Ärztin Weber', 'Anna', '3D-Druck', 'bauer'], 11) });
    const groups = page.locator('[data-test="client-group"]');
    const letters = await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-letter')));
    expect(letters.slice(0, 2)).toEqual(['A', 'B']);
    expect(letters.slice(-2)).toEqual(['Z', '#']);
    expect(await groups.evaluateAll((els) => els.every((e) => !(e as HTMLDetailsElement).open))).toBe(true);
    await expect(visibleRows(page)).toHaveCount(0);
    await expect(page.locator('[data-test="client-list"]')).toHaveCount(0);
    // The count names its noun (#11102): plural, and singular for one.
    await expect(group(page, 'A').locator('[data-test="client-group-summary"]')).toHaveText('A · 2 clients');
    await expect(group(page, 'Z').locator('[data-test="client-group-summary"]')).toHaveText('Z · 1 client');
    // The count is the rows the group renders.
    await expect(group(page, 'A').locator('[data-test="client-row"]')).toHaveCount(2);
  });

  test('opening a letter shows its clients, Ärztin among the A', async ({ page }) => {
    await open(page, { clients: book(['Zeller', 'Ärztin Weber', 'Anna']) });
    await group(page, 'A').locator('[data-test="client-group-summary"]').click();
    await expect(group(page, 'A')).toHaveAttribute('open', '');
    await expect(visibleRows(page)).toHaveCount(2);
    await expect(visibleRows(page).nth(0)).toContainText('Anna');
    await expect(visibleRows(page).nth(1)).toContainText('Ärztin Weber');
    await expect(group(page, 'Z')).not.toHaveAttribute('open', '');
  });

  test('a book of 11 under one letter shows it open', async ({ page }) => {
    await open(page, { clients: Array.from({ length: 11 }, (_, i) => client(i + 1, `Galerie ${String.fromCharCode(65 + i)}`)) });
    await expect(page.locator('[data-test="client-group"]')).toHaveCount(1);
    await expect(group(page, 'G')).toHaveAttribute('open', '');
    await expect(group(page, 'G').locator('[data-test="client-group-summary"]')).toHaveText('G · 11 clients');
    await expect(visibleRows(page)).toHaveCount(11);
  });

  test('a new client opens its letter and is in view; an opened letter stays open through the refetch', async ({ page }) => {
    await open(page, { clients: book(['Zeller', 'Anna', 'Bach']) });
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

test.describe('#11102 a book of 10 or fewer is one flat list', () => {
  test('three clients: every name on the first screen at 390x844, no letter row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { clients: [client(1, 'Zeller'), client(2, 'Ärztin Weber'), client(3, 'Anna')] });
    await expect(page.locator('[data-test="client-group"]')).toHaveCount(0);
    await expect(page.locator('[data-test="client-group-summary"]')).toHaveCount(0);
    await expect(page.locator('[data-test="client-list"]')).toHaveCount(1);
    await expect(visibleRows(page)).toHaveCount(3);
    for (const name of ['Anna', 'Ärztin Weber', 'Zeller']) {
      await expect(page.getByText(name, { exact: true })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test('the flat list keeps the German order, "#" last', async ({ page }) => {
    await open(page, { clients: [client(1, 'Zeller'), client(2, '3D-Druck'), client(3, 'Ärztin Weber'), client(4, 'bauer'), client(5, 'Anna')] });
    const names = await visibleRows(page).evaluateAll((els) => els.map((e) => (e.querySelector('.client-name, strong') as HTMLElement).innerText.trim()));
    expect(names).toEqual(['Anna', 'Ärztin Weber', 'bauer', 'Zeller', '3D-Druck']);
  });

  test('ten is still flat, eleven folds', async ({ page }) => {
    const fake = { clients: book(['Anna'], 10) };
    await open(page, fake);
    await expect(page.locator('[data-test="client-list"]')).toHaveCount(1);
    await expect(visibleRows(page)).toHaveCount(10);

    await page.locator('[data-test="client-add"]').click();
    const form = page.locator('[data-test="client-form"]');
    await form.getByLabel('Name').fill('Bruno Beispiel');
    await page.locator('[data-test="client-save"]').click();
    await expect(form).toBeHidden();
    await expect(page.locator('[data-test="client-list"]')).toHaveCount(0);
    await expect(page.locator('[data-test="client-group"]').first()).toBeAttached();
    // The new client's letter opens and the client is in view.
    await expect(group(page, 'B')).toHaveAttribute('open', '');
    await expect(group(page, 'B').locator('[data-test="client-row"]', { hasText: 'Bruno Beispiel' })).toBeInViewport();
  });
});
