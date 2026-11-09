import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The income-and-expenses book (system_3 #10414-C): payments and
 *  hand-entered expenses merged into one dated list, grouped by month, with
 *  a per-month In/Out/Result head line. Every call is answered by an
 *  in-memory fake; a catch-all /api/ → 404 is registered FIRST so nothing
 *  reaches the live server. */

type Json = Record<string, any>;

const DEFAULT_CATEGORIES = [
  'materials and supplies', 'studio rent and energy', 'insurance and fees', 'advertising',
  'travel', 'office and postage', 'phone and internet', 'advice', 'training', 'other',
];

interface Fake {
  clients: Json[];
  payments: Json[];
  expenses: Json[];
  categories: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
  nextExpenseId: number;
  nextCategoryId: number;
}

const incomeRow = (over: Json = {}) => ({
  id: 10, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: 'M-1',
  method: 'bank_transfer', reference: '', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR',
  gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild Juli',
  category: 'paid_work', client_id: 1, on_invoice: false, ...over,
});

const expenseRow = (id: number, over: Json = {}) => ({
  id, source: 'manual', transaction_id: `M-e${id}`, paid_on: '2026-07-20T00:00:00Z',
  currency: 'EUR', amount_cents: 4599, note: 'Guitar strings', category: 'materials and supplies',
  client_id: null, entry: 'manual', reference: '', ...over,
});

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin' }],
    payments: [],
    expenses: [],
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })),
    requests: [],
    nextExpenseId: 100,
    nextCategoryId: DEFAULT_CATEGORIES.length + 1,
    ...over,
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: fake.categories });
    if (path === '/invoicing/expense-categories' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      if (fake.categories.some((c) => c.name.toLowerCase() === String(body.name).toLowerCase())) {
        return json(route, 409, { error: { code: 'duplicate_category', message: `category "${body.name}" already exists` } });
      }
      const category = { id: fake.nextCategoryId, name: body.name, counts_as: body.counts_as || 'other', created_at: '2026-07-20T00:00:00Z' };
      fake.nextCategoryId += 1;
      fake.categories.push(category);
      return json(route, 201, { category });
    }
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      if (!fake.categories.some((c) => c.name === body.category)) {
        return json(route, 400, { error: { code: 'invalid_field', message: 'category is not one of your expense categories' } });
      }
      const expense = expenseRow(fake.nextExpenseId, body);
      fake.nextExpenseId += 1;
      fake.expenses.push(expense);
      return json(route, 201, { expense });
    }
    const del = path.match(/^\/invoicing\/expenses\/(\d+)$/);
    if (del && method === 'DELETE') {
      fake.expenses = fake.expenses.filter((e) => e.id !== Number(del[1]));
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Book' }).click();
  await expect(page.locator('[data-test="book-panel"]')).toBeVisible();
}

test.describe('#10414-C Invoices app — the income-and-expenses book', () => {
  test('with nothing in the book, the empty state shows', async ({ page }) => {
    await open(page, newFake());
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="book-month"]')).toHaveCount(0);
  });

  test('a payment and an expense in the same month are combined, grouped, signed and totalled', async ({ page }) => {
    const fake = newFake({
      payments: [incomeRow()],
      expenses: [expenseRow(101)],
    });
    await open(page, fake);

    await expect(page.locator('[data-test="book-month"]')).toHaveCount(1);
    const month = page.locator('[data-test="book-month"]');
    await expect(month.locator('[data-test="month-head"]')).toContainText('July 2026');
    await expect(month.locator('[data-test="month-head"]')).toContainText('In €350.00');
    await expect(month.locator('[data-test="month-head"]')).toContainText('Out €45.99');
    await expect(month.locator('[data-test="month-head"]')).toContainText('Result €304.01');

    const rows = month.locator('[data-test="book-row"]');
    await expect(rows).toHaveCount(2);
    // Oldest first within the month, matching the rest of the app's convention.
    await expect(rows.nth(0)).toContainText('Wandbild Juli');
    await expect(rows.nth(1)).toContainText('Guitar strings');
    await expect(rows.nth(1)).toContainText('-€45.99');
  });

  test('a withdrawal is not income: it does not appear in the book', async ({ page }) => {
    const fake = newFake({
      payments: [incomeRow(), incomeRow({ id: 11, kind: 'withdrawal', paid_on: '2026-07-15T00:00:00Z', note: 'To bank', gross_cents: 100000 })],
    });
    await open(page, fake);
    await expect(page.locator('[data-test="book-row"]')).toHaveCount(1);
  });

  test('two different months render as two separate groups', async ({ page }) => {
    const fake = newFake({
      payments: [incomeRow(), incomeRow({ id: 11, paid_on: '2026-08-02T00:00:00Z' })],
    });
    await open(page, fake);
    await expect(page.locator('[data-test="book-month"]')).toHaveCount(2);
    await expect(page.locator('[data-test="month-head"]').nth(0)).toContainText('July 2026');
    await expect(page.locator('[data-test="month-head"]').nth(1)).toContainText('August 2026');
  });

  test('entering an expense by hand stores it and it appears in the book', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();

    await page.locator('[data-test="expense-new"]').click();
    await expect(page.getByRole('dialog', { name: 'Enter expense by hand' })).toBeVisible();

    await page.locator('[data-test="expense-save"]').click();
    await expect(page.locator('[data-test="expense-error"]')).toHaveText('Enter the date the expense was paid.');
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);

    await page.locator('[data-test="expense-date"]').fill('2026-07-20');
    await page.locator('[data-test="expense-amount"]').fill('45,99');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'materials and supplies' }).click();
    await page.locator('[data-test="expense-note"]').fill('Guitar strings');
    await page.locator('[data-test="expense-save"]').click();

    await expect(page.locator('[data-test="book-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/expenses/manual');
    expect(JSON.parse(posts[0].body)).toEqual({
      paid_on: '2026-07-20', amount_cents: 4599, category: 'materials and supplies', reference: '', note: 'Guitar strings',
    });
  });

  test('adding a category inline makes it usable on the same expense', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-add-category-link"]').click();
    await page.locator('[data-test="expense-new-category-name"]').fill('Guitar strings');
    await page.locator('[data-test="expense-add-category-save"]').click();
    await expect(page.locator('[data-test="expense-add-category-link"]')).toBeVisible();

    await page.locator('[data-test="expense-date"]').fill('2026-07-20');
    await page.locator('[data-test="expense-amount"]').fill('12,00');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'Guitar strings', exact: true }).click();
    await page.locator('[data-test="expense-save"]').click();

    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
  });

  test('a duplicate category name is refused', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-add-category-link"]').click();
    await page.locator('[data-test="expense-new-category-name"]').fill('Travel');
    await page.locator('[data-test="expense-add-category-save"]').click();
    await expect(page.locator('[data-test="expense-category-error"]')).toContainText('already exists');
  });

  test('deleting an expense, with a confirm step', async ({ page }) => {
    const fake = newFake({ expenses: [expenseRow(101)] });
    await open(page, fake);
    const button = page.locator('[data-test="book-expense-delete"]');
    await expect(button).toHaveText('Delete');
    await button.click();
    await expect(button).toHaveText('Delete this expense');
    await button.click();
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();
    expect(fake.requests.some((r) => r.method === 'DELETE' && r.path === '/invoicing/expenses/101')).toBe(true);
  });
});
