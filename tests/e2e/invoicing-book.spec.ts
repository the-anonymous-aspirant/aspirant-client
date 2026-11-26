import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';
import { fillEmptyMonths } from '../../src/components/invoicing/listGroups.js';
import { bookPdfCaption, bookPdfDoc, bookPdfFileName, fileNameSlug } from '../../src/components/invoicing/bookPdf.js';

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
  requests: Array<{ method: string; path: string; body: string; search?: string }>;
  nextExpenseId: number;
  nextCategoryId: number;
  reportStatus?: number;
  // The status of GET /invoicing/book/selection; anything but 200 leaves the
  // Book unread.
  selectionStatus?: number;
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
    fake.requests.push({ method, path, body: req.postData() || '', search: new URL(req.url()).search });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    // What the Book counts (system_3 #10635): the starting selection, Work only.
    if (path === '/invoicing/book/selection' && method === 'GET' && fake.selectionStatus && fake.selectionStatus !== 200) return json(route, fake.selectionStatus, { error: { code: 'server_error', message: 'could not read the selection' } });
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
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
      // A typed category saves with its expense, both or neither (server
      // system_3 #11579): a name over 100 characters is refused, as the
      // server's expenseCategoryNameRefusal does.
      if (body.create_category) {
        if ([...String(body.category)].length > 100) {
          return json(route, 400, { error: { code: 'invalid_category', message: 'category must be one line of 1-100 characters' } });
        }
        if (!fake.categories.some((c) => c.name.toLowerCase() === String(body.category).toLowerCase())) {
          fake.categories.push({ id: fake.nextCategoryId, name: body.category, counts_as: 'other', created_at: '2026-07-20T00:00:00Z', removed_at: null });
          fake.nextCategoryId += 1;
        }
        delete body.create_category;
      }
      if (!fake.categories.some((c) => c.name === body.category)) {
        return json(route, 400, { error: { code: 'invalid_field', message: 'category is not one of your expense categories' } });
      }
      const expense = expenseRow(fake.nextExpenseId, body);
      fake.nextExpenseId += 1;
      fake.expenses.push(expense);
      return json(route, 201, { expense });
    }
    // The edit dialogs a Book row opens (system_3 #10729): PATCH changes the
    // row, remove takes it out of the live lists.
    const edit = path.match(/^\/invoicing\/(payments|expenses)\/(\d+)(\/remove)?$/);
    if (edit && (method === 'PATCH' || (method === 'POST' && edit[3]))) {
      const list = edit[1] === 'payments' ? 'payments' : 'expenses';
      const row = (fake[list] as Json[]).find((x) => x.id === Number(edit[2]));
      if (!row) return json(route, 404, { error: { code: 'not_found', message: 'no such row' } });
      if (method === 'PATCH') {
        Object.assign(row, JSON.parse(req.postData() || '{}'));
        return json(route, 200, { [list === 'payments' ? 'payment' : 'expense']: row });
      }
      if (list === 'payments') fake.payments = fake.payments.filter((x) => x.id !== row.id);
      else fake.expenses = fake.expenses.filter((x) => x.id !== row.id);
      return json(route, 200, { removed: 1 });
    }
    const del = path.match(/^\/invoicing\/expenses\/(\d+)$/);
    if (del && method === 'DELETE') {
      fake.expenses = fake.expenses.filter((e) => e.id !== Number(del[1]));
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/invoicing/export/book-report.csv' && method === 'GET') {
      if (fake.reportStatus && fake.reportStatus !== 200) {
        return json(route, fake.reportStatus, { error: { code: 'server_error', message: 'could not build the report' } });
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="Buchhaltung-2026-11-09-1200.csv"' },
        body: '﻿Kategorie;2026-07;Gesamt\r\nEinnahmen;350,00;350,00\r\n',
      });
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

// "Enter expense by hand" sits on Transactions since system_3 #10627 (§3.143
// Decision 2), so a hand entry starts there and is read back on the Book.
async function openTransactions(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

const showBook = async (page: Page) => {
  await page.getByRole('tab', { name: 'Book' }).click();
  await expect(page.locator('[data-test="book-panel"]')).toBeVisible();
};

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
    // Newest day first within the month (§3.145 Decision 1, system_3 #10636):
    // the expense of the 20th above the payment of the 14th.
    await expect(rows.nth(0)).toContainText('Guitar strings');
    await expect(rows.nth(0)).toContainText('-€45.99');
    await expect(rows.nth(1)).toContainText('Wandbild Juli');
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
    // Newest month first, and open; the older one folded, its line still shown
    // (§3.145 Decisions 1, 3 and 4, system_3 #10636).
    await expect(page.locator('[data-test="month-head"]').nth(0)).toContainText('August 2026');
    await expect(page.locator('[data-test="month-head"]').nth(1)).toContainText('July 2026');
    await expect(page.locator('[data-test="book-month"]').nth(0)).toHaveAttribute('open', '');
    await expect(page.locator('[data-test="book-month"]').nth(1)).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-test="month-head"]').nth(1)).toBeVisible();
  });

  test('entering an expense by hand stores it and it appears in the book', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();

    await page.getByRole('tab', { name: 'Transactions' }).click();
    await openWaysIn(page);
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

    await showBook(page);
    await expect(page.locator('[data-test="book-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/expenses/manual');
    expect(JSON.parse(posts[0].body)).toEqual({
      // "Paid to (optional)" is sent as payee, empty when left blank (system_3 #10695).
      paid_on: '2026-07-20', amount_cents: 4599, category: 'materials and supplies', payee: '', reference: '', note: 'Guitar strings',
    });
  });

  // system_3 #11580 (§3.161): a new category is typed in the list and
  // saved with the expense.
  test('a category typed in the list is saved with the expense', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-date"]').fill('2026-07-20');
    await page.locator('[data-test="expense-amount"]').fill('12,00');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.keyboard.type('Guitar strings');
    await page.getByRole('option', { name: 'Add “Guitar strings”' }).click();
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText('Guitar strings');
    await page.locator('[data-test="expense-save"]').click();

    await showBook(page);
    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/expenses/manual');
    expect(JSON.parse(posts[0].body)).toMatchObject({ category: 'Guitar strings', create_category: true });
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/invoicing/expense-categories'), 'no separate category request').toBe(false);
  });

  test('a refused category name keeps the dialog open, the reason under the field', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-date"]').fill('2026-07-20');
    await page.locator('[data-test="expense-amount"]').fill('12,00');
    await page.getByRole('combobox', { name: 'Category' }).click();
    const long = 'Studio snacks '.repeat(8).trim();
    await page.keyboard.type(long);
    await page.getByRole('option', { name: `Add “${long}”` }).click();
    await page.locator('[data-test="expense-save"]').click();
    await expect(page.locator('[data-test="expense-category-error"]')).toHaveText('category must be one line of 1-100 characters');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(long);
    expect(fake.expenses).toHaveLength(0);
  });

});

// system_3 #10729, §3.143 Decision 7: a Book row opens the same edit dialog
// as on Transactions, by its Edit on desktop and a tap on its card on a phone.
// The row's own Delete is gone; removing lives in the dialog (Decision 5),
// and Receipt stays on expense rows.
const narrowOf = (page: Page) => page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);

async function openRowEdit(page: Page, type: 'in' | 'out') {
  const row = page.locator(`[data-test="book-row"][data-type="${type}"]:visible`).first();
  if (await narrowOf(page)) await row.locator('[data-test="book-row-description"]').click();
  else await row.locator('[data-test="book-row-edit"]').click();
  const dialog = page.getByRole('dialog', { name: type === 'in' ? 'Edit payment' : 'Edit expense' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('#10729 a Book row opens its edit dialog', () => {
  test('a payment row and an expense row each open their own edit dialog', async ({ page }) => {
    const fake = newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] });
    await open(page, fake);
    let dialog = await openRowEdit(page, 'in');
    await expect(dialog.locator('[data-test="manual-amount"]')).toHaveValue('350');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    dialog = await openRowEdit(page, 'out');
    await expect(dialog.locator('[data-test="expense-amount"]')).toHaveValue('45,99');
    await expect(dialog.locator('[data-test="edit-history"]')).toHaveCount(1);
  });

  test('the row keeps Receipt and loses its own Delete', async ({ page }) => {
    const fake = newFake({ expenses: [expenseRow(101)] });
    await open(page, fake);
    await expect(page.locator('[data-test="book-panel"] [data-test="book-expense-receipt"]:visible')).toHaveCount(1);
    await expect(page.locator('[data-test="book-expense-delete"]')).toHaveCount(0);
  });

  test('Save on an expense from the Book refetches the Book with its new category', async ({ page }) => {
    const fake = newFake({ expenses: [expenseRow(101)] });
    await open(page, fake);
    const dialog = await openRowEdit(page, 'out');
    await dialog.locator('[data-test="expense-category"]').click();
    await page.getByRole('option', { name: 'travel', exact: true }).click();
    const before = fake.requests.length;
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    const patch = fake.requests.find((r) => r.method === 'PATCH');
    expect(patch && { path: patch.path, body: JSON.parse(patch.body) }).toEqual({ path: '/invoicing/expenses/101', body: { category: 'travel' } });
    // The Book reads its rows again, so the row shows its new category. (It
    // cannot leave the Book over a category until the Book counts by category,
    // system_3 #10635.)
    await expect.poll(() => fake.requests.slice(before).some((r) => r.method === 'GET' && r.path === '/invoicing/expenses')).toBe(true);
    await expect(page.locator('[data-test="book-row"][data-type="out"]:visible').first()).toContainText('travel');
  });

  test('Save on a payment from the Book sends only what changed', async ({ page }) => {
    const fake = newFake({ payments: [incomeRow()] });
    await open(page, fake);
    const dialog = await openRowEdit(page, 'in');
    await dialog.locator('[data-test="manual-note"]').fill('Wandbild August');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    const patch = fake.requests.find((r) => r.method === 'PATCH');
    expect(patch && { path: patch.path, body: JSON.parse(patch.body) }).toEqual({ path: '/invoicing/payments/10', body: { note: 'Wandbild August' } });
    await expect(page.locator('[data-test="book-row"][data-type="in"]:visible').first()).toContainText('Wandbild August');
  });

  test('Remove from the Book arms first, then takes the row off the Book', async ({ page }) => {
    const fake = newFake({ expenses: [expenseRow(101)] });
    await open(page, fake);
    const dialog = await openRowEdit(page, 'out');
    const remove = dialog.locator('[data-test="edit-remove"]');
    await remove.click();
    await expect(remove).toHaveText('Remove this expense');
    expect(fake.requests.some((r) => r.method === 'POST' && r.path.endsWith('/remove'))).toBe(false);
    await remove.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/invoicing/expenses/101/remove')).toBe(true);
    // The restorable remove, never the legacy hard DELETE.
    expect(fake.requests.some((r) => r.method === 'DELETE')).toBe(false);
  });
});

// system_3 #10414-D: a monthly income-vs-expenses bar chart, zero-filled to
// this month like InvoicesChart.vue's own charts, on the same month axis
// shape. Colours per design_agent c63777/c63825 (operator c63803: "let's go
// with black"): income in the book's own ink, expenses in its red.
test.describe('#10414-D Invoices app — the Book chart', () => {
  test('with nothing in the book, there is no chart', async ({ page }) => {
    await open(page, newFake());
    await expect(page.locator('[data-test="book-chart"]')).toHaveCount(0);
  });

  test('bars per month, income and expenses, zero-filled to this month', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    const fake = newFake({
      payments: [incomeRow()],
      expenses: [expenseRow(101)],
    });
    await open(page, fake);
    const chart = page.locator('[data-test="book-chart"]');
    await expect(chart).toHaveAttribute('data-labels', 'Jul 2026,Aug 2026,Sep 2026');
    await expect(chart).toHaveAttribute('data-income', '350,0,0');
    await expect(chart).toHaveAttribute('data-expenses', '45.99,0,0');
    await expect(page.locator('.asp-chart[data-rendered="true"]')).toHaveCount(1);
  });

  // system_3 #12282: the month labels wrap and never rotate, the money ticks
  // are written one way, and the caption is a sentence with its "so far".
  test('at 390 no month label rotates, the ticks are written one way, and the caption is a sentence', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
    const fake = newFake({
      payments: [
        incomeRow(),
        incomeRow({ id: 12, paid_on: '2026-04-10T00:00:00Z', gross_cents: 100000 }),
        incomeRow({ id: 13, paid_on: '2026-09-10T00:00:00Z', gross_cents: 12000 }),
      ],
      expenses: [expenseRow(101)],
    });
    await open(page, fake);
    const el = page.locator('[data-test="book-chart"] .asp-chart');
    await expect(el).toHaveAttribute('data-shown-months', /\d/);
    await expect(el).toHaveAttribute('data-label-rotation', '0');
    await expect(page.locator('[data-test="book-chart"]')).toHaveAttribute('data-labels', 'Apr 2026,May 2026,Jun 2026,Jul 2026,Aug 2026,Sep 2026');
    expect((await el.getAttribute('data-shown-months'))!.split(',')).toEqual(['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026']);
    const ticks = (await el.getAttribute('data-y-ticks'))!.split(',');
    expect(ticks.some((t) => t.endsWith('k')), `${ticks}`).toBe(true);
    for (const t of ticks) expect(t).not.toMatch(/\.0k$/);
    for (const t of ticks) expect(t).toMatch(/^€(\d+|\d+(\.[1-9])?k)$/);
    const caption = page.locator('[data-test="book-chart-range"]');
    await expect(caption).toHaveText('Income and expenses by the month they were paid. Sep so far: income €120.00, expenses €0.00.');
    await expect(caption).toHaveCSS('text-align', 'left');
  });

  test('a withdrawal does not count as income on the chart either', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-15T12:00:00Z'));
    const fake = newFake({
      payments: [incomeRow(), incomeRow({ id: 11, kind: 'withdrawal', paid_on: '2026-07-15T00:00:00Z', gross_cents: 100000 })],
    });
    await open(page, fake);
    await expect(page.locator('[data-test="book-chart"]')).toHaveAttribute('data-income', '350');
  });

  test('income is in the ink colour, expenses in the error-red colour, and both flip live with the theme', async ({ page }) => {
    const fake = newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] });
    await open(page, fake);
    const chart = page.locator('[data-test="book-chart"]');
    await expect(chart).toHaveAttribute('data-income-color', '#424242');
    await expect(chart).toHaveAttribute('data-expense-color', '#8b0f10');

    // The console's own theme toggle sets this attribute on the root element
    // live, with no reload (#4245) — simulate exactly that.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(chart).toHaveAttribute('data-income-color', '#e0e0e0');
    await expect(chart).toHaveAttribute('data-expense-color', '#ff7a7c');
  });
});

// system_3 #10414-E: the Book tab's income and expenses as a standard
// bookkeeping CSV (design_agent ruling, report 886 §2; operator c63757).
test.describe('#10414-E Invoices app — the bookkeeping report export', () => {
  test('clicking the button downloads the server-named CSV', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const download = page.waitForEvent('download');
    await page.locator('[data-test="book-report-csv"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Buchhaltung-2026-11-09-1200.csv');
    expect(fake.requests.some((r) => r.method === 'GET' && r.path === '/invoicing/export/book-report.csv')).toBe(true);
  });

  test('a failed export says so instead of silently doing nothing', async ({ page }) => {
    const fake = newFake({ reportStatus: 500 });
    await open(page, fake);
    await page.locator('[data-test="book-report-csv"]').click();
    // Beside the button, in the Export group, not on the tab's top line
    // (system_3 #11500): the button is the last thing on the tab now.
    const error = page.locator('[data-test="book-export"] [data-test="book-report-error"]');
    await expect(error).toContainText('could not build the report');
    await expect(error).toBeInViewport();
    await expect(page.locator('[data-test="book-error"]')).toHaveCount(0);
  });
});

// system_3 #10459 (Design ack c64353): an imported row's note is the bank's
// booking text, which does not say who was paid. The counterparty leads the
// "What it was for" cell in body ink; the booking text follows, muted. A part
// that already contains the other is shown once. A hand-entered expense's
// free-text `reference` is never shown as a counterparty.
test.describe('#10459 Invoices app — the Book shows who was paid', () => {
  const descriptions = (page: Page) => page.locator('[data-test="book-row-description"]');

  // The computed colour of the cell's own text and of its muted note, next to
  // the resolved tokens they must equal.
  const inks = (page: Page, n: number) =>
    descriptions(page).nth(n).evaluate((el) => {
      const probe = (v: string) => {
        const s = document.createElement('span');
        s.style.color = v;
        document.body.appendChild(s);
        const c = getComputedStyle(s).color;
        s.remove();
        return c;
      };
      const root = getComputedStyle(document.documentElement);
      const note = el.querySelector('span');
      return {
        cell: getComputedStyle(el).color,
        note: note ? getComputedStyle(note).color : null,
        body: probe(root.getPropertyValue('--text-body').trim()),
        muted: probe(root.getPropertyValue('--text-muted').trim()),
      };
    });

  test('an imported expense shows its payee in body ink, then the booking text muted', async ({ page }) => {
    await open(page, newFake({
      expenses: [expenseRow(101, { source: 'n26', entry: 'import', reference: 'Colorificio Esempio', note: 'Pagamento con carta' })],
    }));
    await expect(descriptions(page)).toHaveText(['Colorificio Esempio · Pagamento con carta']);
    const c = await inks(page, 0);
    expect(c.body).not.toBe(c.muted);
    expect(c.cell).toBe(c.body);
    expect(c.note).toBe(c.muted);
  });

  test('an imported expense with no booking text shows the payee alone', async ({ page }) => {
    await open(page, newFake({
      expenses: [expenseRow(101, { source: 'paypal', entry: 'import', reference: 'Print Shop', note: '' })],
    }));
    await expect(descriptions(page)).toHaveText(['Print Shop']);
  });

  test('a part that already contains the other is shown once, the longer one, in body ink', async ({ page }) => {
    await open(page, newFake({
      expenses: [
        expenseRow(101, { source: 'paypal', entry: 'import', reference: 'print shop', note: 'Payment to Print Shop GmbH' }),
        expenseRow(102, { source: 'n26', entry: 'import', paid_on: '2026-07-21T00:00:00Z', reference: 'Tipografia Esempio SRL', note: ' tipografia esempio ' }),
      ],
    }));
    // Newest day first (§3.145): the 21st above the 20th.
    await expect(descriptions(page)).toHaveText(['Tipografia Esempio SRL', 'Payment to Print Shop GmbH']);
    const c = await inks(page, 1);
    expect(c.note).toBe(c.body);
  });

  test('a hand-entered expense never shows its reference as a counterparty', async ({ page }) => {
    await open(page, newFake({
      expenses: [
        expenseRow(101, { reference: 'RE-2026-17', note: 'Guitar strings' }),
        expenseRow(102, { paid_on: '2026-07-21T00:00:00Z', reference: 'RE-2026-18', note: '' }),
      ],
    }));
    // With a note, the note alone; with none, the reference stands in, as before.
    await expect(descriptions(page)).toHaveText(['RE-2026-18', 'Guitar strings']);
    const c = await inks(page, 1);
    expect(c.note).toBe(c.body);
  });

  test('income shows who paid before the note, or either alone', async ({ page }) => {
    await open(page, newFake({
      payments: [
        incomeRow(),
        incomeRow({ id: 11, paid_on: '2026-07-15T00:00:00Z', sender_name: '', note: 'Cash at the market' }),
        incomeRow({ id: 12, paid_on: '2026-07-16T00:00:00Z', sender_name: 'Mara Esempio', note: '' }),
        incomeRow({ id: 13, paid_on: '2026-07-17T00:00:00Z', sender_name: '', note: '' }),
      ],
    }));
    // Newest day first (§3.145): the 17th down to the 14th.
    await expect(descriptions(page)).toHaveText(['—', 'Mara Esempio', 'Cash at the market', 'Galerie Nord · Wandbild Juli']);
  });
});

/* UX walk AM6 (system_3 #11023): "what did I earn this quarter, and this
 * year?" took three month heads added by hand, or the CSV, and a month with
 * nothing in it was missing rather than zero. The clock is the walk's own
 * day, 2026-11-14, so "this quarter" is Q4 2026. */
const AM6_DAY = new Date('2026-11-14T12:00:00Z');
const emptyMonths = (page: Page) => page.locator('[data-test="book-month-empty"]');
const groupKeys = (page: Page) =>
  page.locator('[data-test="book-month"], [data-test="book-month-empty"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));

test.describe('#11023 the period line, and a month with no entries', () => {
  test('the walk case: an empty current month shows as "No entries", and the newest month with entries stays open', async ({ page }) => {
    await page.clock.setFixedTime(AM6_DAY);
    await open(page, newFake({
      payments: [incomeRow(), incomeRow({ id: 11, transaction_id: 'M-2', paid_on: '2026-09-05T00:00:00Z', gross_cents: 12000 })],
      expenses: [expenseRow(101)],
    }));
    expect(await groupKeys(page)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08', '2026-07']);
    await expect(emptyMonths(page)).toHaveCount(3);
    for (const key of ['2026-11', '2026-10', '2026-08']) {
      const month = page.locator(`[data-test="book-month-empty"][data-group="${key}"]`);
      await expect(month, key).toContainText('No entries');
      // Nothing to open: no fold, no caret.
      await expect(month.locator('details, summary'), key).toHaveCount(0);
    }
    await expect(page.locator('[data-test="book-month"][data-group="2026-09"]')).toHaveAttribute('open', '');
    // Q4 had nothing: a real zero, said as one.
    await expect(page.locator('[data-test="book-period-quarter"]')).toHaveText(/This quarter, Q4 2026\s*In €0\.00\s*Out €0\.00\s*Result €0\.00/);
    await expect(page.locator('[data-test="book-period-year"]')).toHaveText(/Year to date, 2026\s*In €470\.00\s*Out €45\.99\s*Result €424\.01/);
  });

  test('the quarter and the year add up the counted rows, so far, and stop at the year', async ({ page }) => {
    await page.clock.setFixedTime(AM6_DAY);
    await open(page, newFake({
      payments: [
        incomeRow(), // 2026-07-14, €350.00
        incomeRow({ id: 11, transaction_id: 'M-2', paid_on: '2026-09-05T00:00:00Z', gross_cents: 12000 }),
        incomeRow({ id: 12, transaction_id: 'M-3', paid_on: '2026-10-02T00:00:00Z', gross_cents: 20000 }),
        incomeRow({ id: 14, transaction_id: 'M-5', paid_on: '2025-12-10T00:00:00Z', gross_cents: 5000 }),
      ],
      expenses: [expenseRow(101), expenseRow(102, { paid_on: '2026-11-03T00:00:00Z', amount_cents: 1000 })],
    }));
    await expect(page.locator('[data-test="book-period-quarter"]')).toHaveText(/This quarter, Q4 2026\s*In €200\.00\s*Out €10\.00\s*Result €190\.00/);
    // December 2025 is not this year's.
    await expect(page.locator('[data-test="book-period-year"]')).toHaveText(/Year to date, 2026\s*In €670\.00\s*Out €55\.99\s*Result €614\.01/);
    // Every month from the oldest with entries through this one, newest first;
    // nothing before 2025-12.
    expect(await groupKeys(page)).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05',
      '2026-04', '2026-03', '2026-02', '2026-01', '2025-12',
    ]);
    await expect(emptyMonths(page)).toHaveCount(7);
    // The existing month heads still count only months with entries.
    await expect(page.locator('[data-test="book-month"]')).toHaveCount(5);
    await expect(page.locator('[data-test="book-month"]').first()).toHaveAttribute('open', '');
  });

  test('on a 390×844 phone the period line is on the first screen, with nothing sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(AM6_DAY);
    await open(page, newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] }));
    const year = page.locator('[data-test="book-period-year"]');
    await expect(year).toBeVisible();
    expect((await year.boundingBox())!.y + (await year.boundingBox())!.height, 'year line ends on the first screen').toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('fillEmptyMonths fills through this month, keeps gaps, adds nothing before the oldest, and keeps the undated group last', async () => {
    const g = (key: string) => ({ key, label: key, rows: [{}] });
    expect(fillEmptyMonths([g('2026-09'), g('2026-07')], '2026-11').map((m) => `${m.key}${m.empty ? '·' : ''}`)).toEqual([
      '2026-11·', '2026-10·', '2026-09', '2026-08·', '2026-07',
    ]);
    // A "through" month older than the newest data adds nothing after it.
    expect(fillEmptyMonths([g('2026-09')], '2026-06').map((m) => m.key)).toEqual(['2026-09']);
    // Across a year end.
    expect(fillEmptyMonths([g('2026-01'), g('2025-11')], '').map((m) => m.key)).toEqual(['2026-01', '2025-12', '2025-11']);
    // The undated group stays last; no dated group means nothing to fill.
    expect(fillEmptyMonths([g('2026-02'), g('')], '2026-03').map((m) => m.key)).toEqual(['2026-03', '2026-02', '']);
    expect(fillEmptyMonths([g('')], '2026-03').map((m) => m.key)).toEqual(['']);
    expect(fillEmptyMonths([], '2026-03')).toEqual([]);
  });
});

// §3.159 Decision 6 (system_3 #11502, epic #11497 item 6): a column that holds
// the same thing has the same header on both tabs. The Book headed its
// "{who} · {what}" cell "What it was for", so the payer in it read as the
// wrong value; Transactions headed the same day "Date".
test.describe('#11502 the Book and Transactions head the same columns the same way', () => {
  test.skip(({ isMobile }) => isMobile, 'the tables and their headers are the desktop layout; a phone shows cards');

  const headers = (page: Page) => page.getByRole('columnheader').allInnerTexts().then((all) => all.map((t) => t.trim()).filter(Boolean));

  test('both read "Date paid" and "Who and what for"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTransactions(page, newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] }));
    const transactions = await headers(page);
    expect(transactions.slice(0, 2), 'Transactions').toEqual(['Date paid', 'Who and what for']);
    expect(transactions, 'Transactions has no bare "Date"').not.toContain('Date');

    await showBook(page);
    await expect(page.locator('[data-test="book-row-description"]').first()).toBeVisible();
    const book = await headers(page);
    expect(book.slice(0, 2), 'the Book').toEqual(['Date paid', 'Who and what for']);
    expect(book, 'the Book has no "What it was for"').not.toContain('What it was for');
  });
});

// §3.159 Decisions 1 and 2 (system_3 #11500, epic #11497 item 8): Export is
// the last part of every tab that exports. The Book's "Bookkeeping report
// (CSV)" stood first, in a head row; it now closes the tab, below the chart,
// built like the groups on Invoices and Clients.
test.describe('#11500 the Book ends with its Export group', () => {
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    test(`at ${width}×${height} nothing stands above the counting line, and Export is last, below the chart`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] }));
      const panel = page.locator('[data-test="book-panel"]');
      const group = page.locator('[data-test="book-export"]');
      const button = page.locator('[data-test="book-report-csv"]');
      const caption = page.locator('[data-test="book-report-caption"]');

      // The tab opens on the counting line: the first thing ze sees in it.
      const top = (await panel.boundingBox())!.y;
      const counting = (await page.locator('[data-test="book-counting"]').boundingBox())!;
      expect(counting.y - top, 'the counting line starts the tab').toBeLessThanOrEqual(2);

      // Export: a heading, then the button with its caption directly under it.
      await expect(group.getByRole('heading', { name: 'Export', level: 3 })).toBeVisible();
      await expect(button).toHaveText('Bookkeeping report (CSV)');
      await expect(button).toHaveClass(/btn--secondary/);
      await expect(caption).toHaveText('The entries counted with Work only, by month and category');
      await expect(button).toHaveAttribute('aria-describedby', 'book-report-caption');
      const b = (await button.boundingBox())!;
      const c = (await caption.boundingBox())!;
      expect(c.y, 'the caption is under the button').toBeGreaterThanOrEqual(b.y + b.height);
      expect(Math.abs(c.x - b.x), 'and starts where the button starts').toBeLessThanOrEqual(1);

      // Last on the tab, below the chart.
      const chart = (await page.locator('[data-test="book-chart"]').boundingBox())!;
      const g = (await group.boundingBox())!;
      const p = (await panel.boundingBox())!;
      expect(g.y, 'below the chart').toBeGreaterThanOrEqual(chart.y + chart.height);
      expect(Math.abs(g.y + g.height - (p.y + p.height)), 'nothing follows it in the tab').toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('with nothing recorded the group still renders, and the button still downloads', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="book-export"]')).toBeVisible();
    await expect(page.locator('[data-test="book-report-csv"]')).toBeEnabled();
  });
});

// system_3 #11635 (#11497 item 12; operator c70883 on #10985; design ack on
// #11635): the Book's Export group offers one month as well as the whole
// book. One select, "Paid in", scopes the one button's file; the caption says
// what the file will hold before the click.
test.describe('#11635 the Book exports one month or the whole book', () => {
  // "Today" is fixed so the months the Book shows are known: July (entries),
  // August (none), September (entries). October is the current month, empty.
  const DAY = new Date('2026-10-10T12:00:00Z');
  const fakeBook = () =>
    newFake({
      payments: [
        incomeRow({ id: 21, note: 'September work', paid_on: '2026-09-12T00:00:00Z' }),
        incomeRow({ id: 22, note: 'July work', paid_on: '2026-07-14T00:00:00Z' }),
      ],
      expenses: [expenseRow(101)],
    });
  const select = (page: Page) => page.getByRole('combobox', { name: 'Paid in' });
  const caption = (page: Page) => page.locator('[data-test="book-report-caption"]');
  const reportRequests = (fake: Fake) => fake.requests.filter((r) => r.method === 'GET' && r.path === '/invoicing/export/book-report.csv');
  async function openAt(page: Page, fake: Fake) {
    await page.clock.setFixedTime(DAY);
    await open(page, fake);
  }
  async function choose(page: Page, option: string) {
    await select(page).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  async function download(page: Page) {
    const done = page.waitForEvent('download');
    await page.locator('[data-test="book-report-csv"]').click();
    await done;
  }

  test('the select lists "All months", then the months the Book shows, newest first, marking the empty ones', async ({ page }) => {
    await openAt(page, fakeBook());
    await expect(select(page)).toContainText('All months');
    await select(page).click();
    const options = (await page.getByRole('option').allTextContents()).map((t) => t.trim());
    expect(options).toEqual(['All months', 'October 2026 · no entries', 'September 2026', 'August 2026 · no entries', 'July 2026']);
    // The Book's own order and marks, read from the page: the same months,
    // newest first, with the same two marked empty.
    const shown = await page.locator('[data-test="book-month"], [data-test="book-month-empty"]').evaluateAll((els) =>
      els.map((el) => ({ key: el.getAttribute('data-group'), empty: el.getAttribute('data-test') === 'book-month-empty' }))
    );
    expect(shown).toEqual([
      { key: '2026-10', empty: true },
      { key: '2026-09', empty: false },
      { key: '2026-08', empty: true },
      { key: '2026-07', empty: false },
    ]);
  });

  test('"All months" sends no month and keeps today\'s caption', async ({ page }) => {
    const fake = fakeBook();
    await openAt(page, fake);
    await expect(caption(page)).toHaveText('The entries counted with Work only, by month and category');
    await download(page);
    expect(reportRequests(fake)).toHaveLength(1);
    expect(reportRequests(fake)[0].search).toBe('');
  });

  test('a month with entries sends its month, says so before the click, and stays chosen after the download', async ({ page }) => {
    const fake = fakeBook();
    await openAt(page, fake);
    await choose(page, 'July 2026');
    await expect(caption(page)).toHaveText('The entries counted with Work only that were paid in July 2026, by category');
    await download(page);
    expect(reportRequests(fake)[0].search).toBe('?month=2026-07');
    await expect(select(page)).toContainText('July 2026');
    // The same month again, without choosing again.
    await download(page);
    expect(reportRequests(fake).map((r) => r.search)).toEqual(['?month=2026-07', '?month=2026-07']);
  });

  test('a month with no entries is offered, sends its month, and says every amount is zero', async ({ page }) => {
    const fake = fakeBook();
    await openAt(page, fake);
    await choose(page, 'August 2026 · no entries');
    await expect(caption(page)).toHaveText('Nothing counted with Work only was paid in August 2026. Every amount in the file is zero.');
    await expect(page.locator('[data-test="book-report-csv"]')).toBeEnabled();
    await download(page);
    expect(reportRequests(fake)[0].search).toBe('?month=2026-08');
  });

  test('a chosen month the Book stops showing stays listed, marked, and still sends its month', async ({ page }) => {
    // July holds one expense and nothing else, so removing it takes July,
    // the oldest month, off the Book. It happens on the Book itself: leaving
    // the tab and coming back resets the select to "All months" by design.
    const fake = newFake({
      payments: [incomeRow({ id: 21, note: 'September work', paid_on: '2026-09-12T00:00:00Z' })],
      expenses: [expenseRow(101)],
    });
    await openAt(page, fake);
    await choose(page, 'July 2026');
    // July is folded: only the newest month with entries opens by itself.
    await page.locator('[data-test="book-month"]', { hasText: 'July 2026' }).locator('[data-test="month-head"]').click();
    const dialog = await openRowEdit(page, 'out');
    const remove = dialog.locator('[data-test="edit-remove"]');
    await remove.click();
    await remove.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="book-row"]:visible')).toHaveCount(1);

    await expect(select(page)).toContainText('July 2026 · no entries');
    await expect(caption(page)).toHaveText('Nothing counted with Work only was paid in July 2026. Every amount in the file is zero.');
    await select(page).click();
    const options = (await page.getByRole('option').allTextContents()).map((t) => t.trim());
    // Still newest first, with the kept month in its place at the end.
    expect(options).toEqual(['All months', 'October 2026 · no entries', 'September 2026', 'July 2026 · no entries']);
    await page.keyboard.press('Escape');
    await download(page);
    expect(reportRequests(fake)[0].search).toBe('?month=2026-07');
  });

  test('on a wide screen the select keeps one width, wide enough for its longest option, whatever is chosen', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'a desktop width');
    await openAt(page, fakeBook());
    const width = async () => (await select(page).boundingBox())!.width;
    const all = await width();
    await choose(page, 'July 2026');
    const short = await width();
    await choose(page, 'October 2026 · no entries');
    const long = await width();
    expect([all, short, long].map((w) => Math.round(w)), 'one width for every choice').toEqual([Math.round(long), Math.round(long), Math.round(long)]);
    // The longest label is on one line and not cut.
    const fit = await select(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  });

  test('at 360px the select and the button are full width, the select first, and nothing scrolls sideways', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-safari', 'a phone width');
    await page.setViewportSize({ width: 360, height: 780 });
    await openAt(page, fakeBook());
    const group = (await page.locator('[data-test="book-export"] .export').boundingBox())!;
    const sel = (await select(page).boundingBox())!;
    const button = (await page.locator('[data-test="book-report-csv"]').boundingBox())!;
    expect(Math.abs(sel.width - group.width), `select ${sel.width}px of ${group.width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(button.width - group.width), `button ${button.width}px of ${group.width}px`).toBeLessThanOrEqual(1);
    expect(sel.y, 'the select is above the button').toBeLessThan(button.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// system_3 #11512 (#11497 item 13; operator c70883 on #10985; design ack on
// #11512): the Book's entries as a PDF, beside the CSV. The file is made in
// the browser from what the tab holds. The tab announces the document it is
// about to draw as a "book-pdf" event, so these tests read the document and
// not the drawn pages.
test.describe('#11512 the Book exports its entries as a PDF', () => {
  // "Today" is 2026-10-10, 14:00 in Berlin. The Book then shows October (no
  // entries), September, August (no entries) and July.
  const DAY = new Date('2026-10-10T12:00:00Z');
  const fakeBook = () =>
    newFake({
      payments: [
        incomeRow({ id: 21, sender_name: 'Atelier Süd', note: 'September work', gross_cents: 12000, paid_on: '2026-09-12T00:00:00Z' }),
        incomeRow({ id: 22, note: 'Wandbild Juli', paid_on: '2026-07-14T00:00:00Z' }),
        incomeRow({ id: 23, sender_name: '', note: '', gross_cents: 500, paid_on: '2026-07-02T00:00:00Z' }),
        incomeRow({ id: 24, note: 'unsorted', category: 'uncategorised', paid_on: '2026-07-03T00:00:00Z' }),
        incomeRow({ id: 25, note: 'unsorted', category: 'uncategorised', paid_on: '2026-09-03T00:00:00Z' }),
        incomeRow({ id: 26, note: 'unsorted', category: 'uncategorised', paid_on: '2026-09-04T00:00:00Z' }),
      ],
      expenses: [expenseRow(101)],
    });
  const button = (page: Page) => page.locator('[data-test="book-pdf"]');
  const caption = (page: Page) => page.locator('[data-test="book-pdf-caption"]');
  async function openAt(page: Page, fake: Fake) {
    await page.clock.setFixedTime(DAY);
    await open(page, fake);
  }
  async function choose(page: Page, option: string) {
    await page.getByRole('combobox', { name: 'Paid in' }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  // Presses the button and returns the file and the document it was drawn
  // from (functions, the footer, do not survive the copy).
  async function press(page: Page) {
    await page.evaluate(() => {
      document.addEventListener('book-pdf', (e) => { (window as any).__bookPdf = JSON.stringify((e as CustomEvent).detail); }, { once: true });
    });
    const done = page.waitForEvent('download');
    await button(page).click();
    const file = await done;
    const detail = JSON.parse(await page.evaluate(() => (window as any).__bookPdf));
    return { file, doc: detail.doc as Json, fileName: detail.fileName as string };
  }
  const tables = (doc: Json) => (doc.content as Json[]).filter((n) => n.table);
  const headOf = (table: Json) => ({ label: table.table.body[0][0].columns[0].text, totals: table.table.body[0][0].columns[1].text });
  const cells = (row: Json[]) => row.map((c) => c.text);
  const texts = (doc: Json) => JSON.stringify(doc.content);

  test('the document for all months: the title line, what it counts, the columns, the rows and every total', async ({ page }) => {
    const fake = fakeBook();
    await openAt(page, fake);
    const before = fake.requests.length;
    const { doc } = await press(page);

    expect(doc.content[0].text).toBe('Book entries · Work only · all months · made 2026-10-10');
    // The tab's own counting sentence and its Uncategorised continuation,
    // word for word, without the button.
    const onTab = `${(await page.locator('[data-test="book-counting-line"]').textContent())!.trim()} ${(await page.locator('[data-test="book-uncategorised"]').textContent())!.trim()}`;
    expect(doc.content[1].text).toBe(onTab);
    expect(doc.content[1].text).toBe('Counting with Work only: payments marked Paid work, and every expense except Private. 3 payments are still Uncategorised and not counted.');

    // Newest first, as on the tab: October (empty), September, August
    // (empty), July, then the closing line.
    const order = (doc.content as Json[]).slice(2).map((n) => (n.table ? headOf(n).label : n.stack[0].text || n.stack[1].columns[0].text));
    expect(order).toEqual(['October 2026', 'September 2026', 'August 2026', 'July 2026', 'All months in this file']);
    const [october, , august] = (doc.content as Json[]).slice(2);
    expect(october.stack.map((n: Json) => n.text)).toEqual(['October 2026', 'No entries']);
    expect(august.stack.map((n: Json) => n.text)).toEqual(['August 2026', 'No entries']);

    const [september, july] = tables(doc);
    // The tab's columns, in the tab's order, repeated with the month's head
    // on every page the month runs over. Invoice is the tab's since #11509;
    // no payment here is on an issued invoice, so its cells are empty.
    expect(cells(july.table.body[1])).toEqual(['Date paid', 'Who and what for', 'Category', 'Invoice', 'In', 'Out']);
    expect(july.table.headerRows).toBe(2);
    expect(july.table.keepWithHeaderRows).toBe(1);
    // "who · what"; "—" when both are empty; the minus on Out.
    expect(july.table.body.slice(2).map(cells)).toEqual([
      ['2026-07-20', 'Guitar strings', 'materials and supplies', '', '', '-€45.99'],
      ['2026-07-14', 'Galerie Nord · Wandbild Juli', 'Paid work', '', '€350.00', ''],
      ['2026-07-02', '—', 'Paid work', '', '€5.00', ''],
    ]);
    expect(headOf(july)).toEqual({ label: 'July 2026', totals: 'In €355.00    Out -€45.99    Result €309.01' });
    expect(headOf(september)).toEqual({ label: 'September 2026', totals: 'In €120.00    Out €0.00    Result €120.00' });
    expect(september.table.body.slice(2).map(cells)).toEqual([['2026-09-12', 'Atelier Süd · September work', 'Paid work', '', '€120.00', '']]);

    // The month's In, Out and Result are the tab's month head's, with the
    // minus added to Out.
    const head = page.locator('[data-test="book-month"][data-group="2026-07"] .month__totals');
    const onHead = (await head.locator('span').allTextContents()).map((t) => t.trim());
    expect(onHead).toEqual(['In €355.00', 'Out €45.99', 'Result €309.01']);

    const closing = (doc.content as Json[])[doc.content.length - 1];
    expect(closing.stack[1].columns.map((c: Json) => c.text)).toEqual(['All months in this file', 'In €475.00    Out -€45.99    Result €429.01']);

    expect(doc.pageSize).toBe('A4');
    expect(doc.pageOrientation).toBe('portrait');
    // Made from what the tab holds: the press sends nothing.
    expect(fake.requests.length).toBe(before);
  });

  test('the document for one month: the title names it, the Uncategorised count is that month\'s, and no closing line', async ({ page }) => {
    await openAt(page, fakeBook());
    await choose(page, 'July 2026');
    const july = await press(page);
    expect(july.doc.content[0].text).toBe('Book entries · Work only · paid in July 2026 · made 2026-10-10');
    expect(july.doc.content[1].text).toBe('Counting with Work only: payments marked Paid work, and every expense except Private. 1 payment is still Uncategorised and not counted.');
    expect(tables(july.doc).map((t) => headOf(t).label)).toEqual(['July 2026']);
    expect(texts(july.doc)).not.toContain('All months in this file');

    // A month with no entries keeps its heading and says so. August has no
    // Uncategorised payment, so the continuation is absent.
    await choose(page, 'August 2026 · no entries');
    await expect(caption(page)).toHaveText('Nothing counted with Work only was paid in August 2026. The file says so.');
    const august = await press(page);
    expect(august.doc.content[1].text).toBe('Counting with Work only: payments marked Paid work, and every expense except Private.');
    expect(tables(august.doc)).toHaveLength(0);
    expect((august.doc.content as Json[])[2].stack.map((n: Json) => n.text)).toEqual(['August 2026', 'No entries']);
    expect(texts(august.doc)).not.toContain('All months in this file');
  });

  test('each caption says what the file will hold, with its count', async ({ page }) => {
    await openAt(page, fakeBook());
    await expect(button(page)).toHaveText('Book entries (PDF)');
    await expect(button(page)).toHaveAttribute('aria-describedby', 'book-pdf-caption');
    await expect(caption(page)).toHaveText("4 entries counted with Work only, month by month, with each month's totals");
    await choose(page, 'July 2026');
    await expect(caption(page)).toHaveText("3 entries counted with Work only that were paid in July 2026, with the month's totals");
    await choose(page, 'September 2026');
    await expect(caption(page)).toHaveText("1 entry counted with Work only that was paid in September 2026, with the month's totals");
    // The CSV's caption is its own and unchanged.
    await expect(page.locator('[data-test="book-report-caption"]')).toHaveText('The entries counted with Work only that were paid in September 2026, by category');
    expect(bookPdfCaption({ loaded: true, entries: 1, selectionName: 'Work only' })).toBe("1 entry counted with Work only, month by month, with each month's totals");
  });

  test('the file is a real PDF, named as the CSV is, for all months and for one', async ({ page }) => {
    const fs = await import('node:fs');
    await openAt(page, fakeBook());
    // Nothing leaves the browser while the file is made (security's
    // condition on #11512): no request of any kind, to this origin or any
    // other, between the press and the download. The fonts are the bundled
    // ones and the document has no image.
    const sent: string[] = [];
    const record = (r: { url(): string }) => sent.push(r.url());
    page.on('request', record);
    const all = await press(page);
    page.off('request', record);
    expect(sent, 'requests between the press and the download').toEqual([]);
    expect(all.file.suggestedFilename()).toBe('book-entries-work-only-2026-10-10-1400.pdf');
    expect(all.fileName).toBe(all.file.suggestedFilename());
    const bytes = fs.readFileSync((await all.file.path())!);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.subarray(-32).toString('latin1')).toContain('%%EOF');
    expect(bytes.length).toBeGreaterThan(5000);

    await choose(page, 'July 2026');
    const july = await press(page);
    expect(july.file.suggestedFilename()).toBe('book-entries-work-only-month-2026-07-2026-10-10-1400.pdf');
    // The choice stays after a download, and the button is ready again.
    await expect(page.getByRole('combobox', { name: 'Paid in' })).toContainText('July 2026');
    await expect(button(page)).toBeEnabled();
  });

  test('the file name writes the selection as the server\'s CSV name does', () => {
    const now = new Date('2026-01-05T08:07:00Z'); // 09:07 in Berlin
    const presets = [
      { id: 'work_only', name: 'Work only' },
      { id: 'p7', name: 'Büro Köln & Straße' },
      { id: 'p9', name: '!!!' },
    ];
    const name = (selection: Json, monthKey = '') => bookPdfFileName({ selection, presets, monthKey, now });
    expect(name({ preset: 'work_only', changed: false })).toBe('book-entries-work-only-2026-01-05-0907.pdf');
    expect(name({ preset: 'p7', changed: false })).toBe('book-entries-buero-koeln-strasse-2026-01-05-0907.pdf');
    expect(name({ preset: 'p7', changed: true }, '2025-12')).toBe('book-entries-buero-koeln-strasse-changed-month-2025-12-2026-01-05-0907.pdf');
    expect(name({ preset: 'gone', changed: false })).toBe('book-entries-custom-2026-01-05-0907.pdf');
    expect(name({ preset: 'p9', changed: false })).toBe('book-entries-preset-p9-2026-01-05-0907.pdf');
    expect(fileNameSlug('  Ärger – 2026 ')).toBe('aerger-2026');
  });

  test('before the Book has loaded the button is disabled and its caption is the reason', async ({ page }) => {
    await openAt(page, newFake({ payments: [incomeRow()], selectionStatus: 500 }));
    await expect(button(page)).toBeDisabled();
    await expect(caption(page)).toHaveText('Available once the Book has loaded.');
    // The server builds the CSV, so its button stays as it is.
    await expect(page.locator('[data-test="book-report-csv"]')).toBeEnabled();
  });

  test('a loaded Book with nothing counted still exports, and the file says "No entries"', async ({ page }) => {
    await openAt(page, newFake());
    await expect(caption(page)).toHaveText('Nothing is counted with Work only. The file says so.');
    const { doc, file } = await press(page);
    expect(tables(doc)).toHaveLength(0);
    expect(texts(doc)).toContain('No entries');
    expect(texts(doc)).not.toContain('All months in this file');
    expect(file.suggestedFilename()).toBe('book-entries-work-only-2026-10-10-1400.pdf');
  });

  // system_3 #11650: pdfmake (1.87 MB) loads when the Book tab opens, not
  // with the app's first page, which every visitor shares; and not on the
  // press, so the press still sends nothing (the test above).
  test('the PDF library loads when the Book tab opens, not before', async ({ page }) => {
    const lib: string[] = [];
    page.on('request', (r) => { if (/pdfmake|vfs_fonts/.test(r.url())) lib.push(new URL(r.url()).pathname); });
    await page.clock.setFixedTime(DAY);
    await mock(page, fakeBook());
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member/personal/invoicing');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(lib, 'nothing of pdfmake on Transactions').toEqual([]);
    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    await expect(button(page)).toBeEnabled();
    await expect.poll(() => lib.length, { message: 'pdfmake is fetched with the Book tab' }).toBeGreaterThan(0);
    const { file } = await press(page);
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test('a PDF library that fails to load: the press says the PDF could not be made', async ({ page }) => {
    await page.route(/pdfmake|vfs_fonts/, (route) => route.abort());
    await openAt(page, fakeBook());
    await button(page).click();
    await expect(page.locator('[data-test="book-pdf-error"]')).toHaveText('The PDF could not be made. Try again.');
    await expect(button(page)).toBeEnabled();
  });

  test('a PDF that cannot be made says so under the button, in view', async ({ page }) => {
    await openAt(page, fakeBook());
    // The browser refuses to hand the finished file over.
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('refused');
      };
    });
    await button(page).click();
    const error = page.locator('[data-test="book-pdf-error"]');
    await expect(error).toHaveText('The PDF could not be made. Try again.');
    await expect(error).toBeInViewport();
    await expect(button(page)).toBeEnabled();
  });

  test('with the Invoice column the file carries it between Category and In, by #11509\'s cell rules', () => {
    const fmt = { day: (d: string) => d.slice(0, 10), money: (c: number) => `€${(c / 100).toFixed(2)}`, signedMoney: (c: number) => `${c < 0 ? '-' : ''}€${(Math.abs(c) / 100).toFixed(2)}` };
    const row = (over: Json) => ({ type: 'in', paid_on: '2026-07-14', who: 'Galerie Nord', what: '', categoryLabel: 'Paid work', amount_cents: 100, ...over });
    const month = { key: '2026-07', label: 'July 2026', inCents: 300, outCents: 0, resultCents: 300, rows: [row({ issuedInvoice: { number: '2026-003' } }), row({ issuedInvoice: { number: '—' } }), row({ issuedInvoice: { number: '' } })] };
    const doc = bookPdfDoc({ months: [month], selectionName: 'Work only', scope: 'paid in July 2026', madeOn: '2026-10-10', countingSentence: 'Counting.', withInvoice: true, fmt }) as Json;
    const table = tables(doc)[0].table;
    expect(cells(table.body[1])).toEqual(['Date paid', 'Who and what for', 'Category', 'Invoice', 'In', 'Out']);
    expect(table.body.slice(2).map((r: Json[]) => r[3].text)).toEqual(['2026-003', '—', '']);
    expect(table.body[0][0].colSpan).toBe(6);
  });

  test('at 360px both buttons are full width under the select, and nothing scrolls sideways', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-safari', 'a phone width');
    await page.setViewportSize({ width: 360, height: 780 });
    await openAt(page, fakeBook());
    const group = (await page.locator('[data-test="book-export"] .export').boundingBox())!;
    const csv = (await page.locator('[data-test="book-report-csv"]').boundingBox())!;
    const pdf = (await button(page).boundingBox())!;
    expect(Math.abs(pdf.width - group.width), `PDF button ${pdf.width}px of ${group.width}px`).toBeLessThanOrEqual(1);
    expect(pdf.y, 'the PDF button is under the CSV button and its caption').toBeGreaterThan(csv.y + csv.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// system_3 #11509 (operator c70806 on #10985: "Number should be the invoice id
// on the book page"; design ack on #11509, §3.143 Decision 7 as amended). The
// Book had no such column. A counted payment now names its issued invoice: in
// an Invoice column wherever the Book shows its table, and as a line on the
// phone card. "Who and what for" is the table's identity column. The value is
// the `invoice` field the payments list already carries, so nothing new is
// fetched.
test.describe('#11509 the Book names a payment\'s issued invoice', () => {
  const LONG = 'ABCDEFGHIJKLMNOPQRST-001'; // a 20-character prefix with no hyphen
  const fakeWithInvoices = (over: Json[] = []) =>
    newFake({
      payments: [
        incomeRow({ id: 11, note: 'On an issued invoice', paid_on: '2026-07-16T00:00:00Z', on_invoice: true, invoice: { id: 5, status: 'issued', invoice_number: '2026-014' } }),
        incomeRow({ id: 12, note: 'Issued with no number', paid_on: '2026-07-15T12:00:00Z', on_invoice: true, invoice: { id: 7, status: 'issued', invoice_number: '' } }),
        incomeRow({ id: 13, note: 'On a draft', paid_on: '2026-07-15T00:00:00Z', on_invoice: true, invoice: { id: 6, status: 'draft', invoice_number: '' } }),
        incomeRow({ id: 14, note: 'No invoice yet', paid_on: '2026-07-14T00:00:00Z' }),
        incomeRow({ id: 15, note: 'An earlier month', paid_on: '2026-06-10T00:00:00Z', on_invoice: true, invoice: { id: 8, status: 'issued', invoice_number: '2026-009' } }),
        ...over,
      ],
      expenses: [expenseRow(101)],
    });
  const rowWith = (page: Page, text: string) => page.locator('[data-test="book-row"]:visible', { hasText: text });
  const invoiceOf = (page: Page, text: string) => rowWith(page, text).locator('[data-test="book-row-invoice"]');
  const headers = async (page: Page) => (await page.locator('[data-test="book-month"]').first().locator('thead th').allTextContents()).map((t) => t.trim());
  const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const widthOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().width);

  test('the five cases: a number, a dash, and nothing for a draft, no invoice and an expense', async ({ page }) => {
    await open(page, fakeWithInvoices());
    const narrow = await narrowOf(page);
    // The table names the number alone under its header; a card has no
    // header, so it writes the line Transactions writes.
    await expect(invoiceOf(page, 'On an issued invoice')).toHaveText(narrow ? 'Invoice 2026-014' : '2026-014');
    await expect(invoiceOf(page, 'Issued with no number')).toHaveText(narrow ? 'Invoice' : '—');
    for (const text of ['On a draft', 'No invoice yet', 'Guitar strings']) {
      await expect(rowWith(page, text)).toHaveCount(1);
      await expect(invoiceOf(page, text)).toHaveCount(0);
    }
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('the Book PDF carries the number in its Invoice column, by the same rules', async ({ page }) => {
    await open(page, fakeWithInvoices());
    await page.evaluate(() => {
      document.addEventListener('book-pdf', (e) => { (window as any).__bookPdf = JSON.stringify((e as CustomEvent).detail); }, { once: true });
    });
    const done = page.waitForEvent('download');
    await page.locator('[data-test="book-pdf"]').click();
    await done;
    const doc = JSON.parse(await page.evaluate(() => (window as any).__bookPdf)).doc as Json;
    const july = (doc.content as Json[]).filter((n) => n.table).find((n) => n.table.body[0][0].columns[0].text === 'July 2026')!;
    const head = july.table.body[1].map((c: Json) => c.text);
    const at = head.indexOf('Invoice');
    expect(head.slice(at - 1, at + 2), head.join(' | ')).toEqual(['Category', 'Invoice', 'In']);
    const byRow = Object.fromEntries(july.table.body.slice(2).map((r: Json[]) => [r[1].text, r[at].text]));
    expect(byRow).toEqual({
      'Guitar strings': '',
      'Galerie Nord · On an issued invoice': '2026-014',
      'Galerie Nord · Issued with no number': '—',
      'Galerie Nord · On a draft': '',
      'Galerie Nord · No invoice yet': '',
    });
  });

  test('a phone card carries the line at 390 and at 360, with no sideways scroll', async ({ page }) => {
    await open(page, fakeWithInvoices());
    test.skip(!(await narrowOf(page)), 'the card is the phone layout');
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 800 });
      const line = invoiceOf(page, 'On an issued invoice');
      await expect(line).toHaveText('Invoice 2026-014');
      // A line of its own, after the category line.
      const category = rowWith(page, 'On an issued invoice').getByText('Paid work', { exact: true });
      const c = (await category.boundingBox())!;
      const l = (await line.boundingBox())!;
      expect(l.y, `the line is under the category at ${width}`).toBeGreaterThanOrEqual(c.y + c.height - 1);
      expect(await noSidewaysScroll(page), `no sideways scroll at ${width}`).toBe(true);
    }
  });

  for (const width of [1440, 1280]) {
    test(`at ${width}px the Invoice column shows, between Category and In, and "Who and what for" keeps 24ch`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', 'a desktop width');
      await page.setViewportSize({ width, height: 900 });
      await open(page, fakeWithInvoices());
      const head = await headers(page);
      const at = head.indexOf('Invoice');
      expect(at, `headers: ${head.join(' | ')}`).toBeGreaterThan(-1);
      expect(head[at - 1]).toBe('Category');
      expect(head[at + 1]).toBe('In');

      const number = invoiceOf(page, 'On an issued invoice');
      await expect(number).toHaveText('2026-014');
      expect(await number.evaluate((el) => el.getClientRects().length), '"2026-014" is on one line').toBe(1);
      // A draft, no invoice and an expense leave the cell itself empty. An
      // absent number element is not enough: the table prints the row's own
      // value wherever a cell's slot renders nothing.
      for (const text of ['On a draft', 'No invoice yet', 'Guitar strings']) {
        expect((await rowWith(page, text).locator('td').nth(at).textContent())!.trim(), `the Invoice cell of "${text}"`).toBe('');
      }
      expect((await rowWith(page, 'Issued with no number').locator('td').nth(at).textContent())!.trim()).toBe('—');

      // The same width in every month's table.
      const months = page.locator('[data-test="book-month"]');
      await expect(months).toHaveCount(2);
      const widths: number[] = [];
      for (let i = 0; i < 2; i += 1) {
        widths.push(await months.nth(i).locator('thead th', { hasText: 'Invoice' }).evaluate((el) => el.getBoundingClientRect().width));
      }
      expect(Math.abs(widths[0] - widths[1]), `Invoice column widths ${widths.join(' and ')}`).toBeLessThanOrEqual(0.5);

      const who = await page.locator('[data-test="book-month"]').first().locator('thead th', { hasText: 'Who and what for' }).evaluate((el) => el.getBoundingClientRect().width);
      console.log(`#11509 at ${width}px: table ${(await widthOf(page, '[data-test="book-month"] table')).toFixed(0)}px, Invoice column ${widths[0].toFixed(1)}px, "Who and what for" ${who.toFixed(1)}px`);
      // 24ch in the cell's own font: the identity column's floor (§3.119).
      const ch24 = await rowWith(page, 'On an issued invoice').locator('[data-test="book-row-description"]').evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        probe.textContent = '0'.repeat(24);
        el.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      });
      console.log(`#11509 at ${width}px: 24ch is ${ch24.toFixed(1)}px`);
      expect(who, `"Who and what for" is ${who.toFixed(1)}px; 24ch is ${ch24.toFixed(1)}px`).toBeGreaterThanOrEqual(ch24);
      expect(await noSidewaysScroll(page)).toBe(true);
    });
  }

  test('a number with a 20-character prefix wraps inside its cell and is whole', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'a desktop width');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, fakeWithInvoices([
      incomeRow({ id: 16, note: 'A long number', paid_on: '2026-07-17T00:00:00Z', on_invoice: true, invoice: { id: 9, status: 'issued', invoice_number: LONG } }),
    ]));
    const number = invoiceOf(page, 'A long number');
    await expect(number).toHaveText(LONG);
    const cell = number.locator('xpath=ancestor::td[1]');
    const fit = await cell.evaluate((td) => ({ scroll: td.scrollWidth, client: td.clientWidth, overflow: getComputedStyle(td).overflow, textOverflow: getComputedStyle(td).textOverflow }));
    expect(fit.scroll, 'the number does not spill out of its cell').toBeLessThanOrEqual(fit.client);
    expect(await number.evaluate((el) => el.getClientRects().length), 'it wraps').toBeGreaterThan(1);
    expect(fit.textOverflow).not.toBe('ellipsis');
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});

// system_3 #11748 (§3.132 Decision 6; design ack on #11627 and #11747): in the
// design system's card, Transactions' checkbox leads the first line, before
// "Who and what for", as the tab's own phone card puts it. A row on an issued
// invoice keeps its invisible gutter, so every name starts on one edge.
test.describe('#11748 Transactions\' checkbox leads the design system\'s card', () => {
  test.skip(({ isMobile }) => isMobile, 'viewport widths over 640px; a phone has the tab\'s own cards');

  const fake = () =>
    newFake({
      payments: [
        incomeRow({ id: 11, transaction_id: 'M-11', note: 'On an issued invoice', paid_on: '2026-07-16T00:00:00Z', on_invoice: true, on_issued_invoice: true, invoice: { id: 5, status: 'issued', invoice_number: '2026-014' } }),
        incomeRow({ id: 12, transaction_id: 'M-12', note: 'Tattoo (small) and a follow-up', paid_on: '2026-07-15T00:00:00Z' }),
        incomeRow({ id: 13, transaction_id: 'M-13', note: 'Bought in the shop', category: 'uncategorised', paid_on: '2026-07-14T00:00:00Z' }),
      ],
      expenses: [expenseRow(101)],
    });
  const cards = (page: Page) => page.locator('[data-test="payments-panel"] tr.data-table__row');
  const rect = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right }; });

  for (const [width, label] of [[700, 'sidebar hidden'], [768, 'sidebar open'], [1024, 'sidebar open']] as const) {
    test(`at ${width} (${label}) each card's checkbox comes first, on the name's line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTransactions(page, fake());
      await expect(page.locator('[data-test="payments-panel"] table.data-table--cards-select')).toHaveCount(1);
      const n = await cards(page).count();
      expect(n).toBe(4);
      const lefts: number[] = [];
      for (let i = 0; i < n; i++) {
        const card = cards(page).nth(i);
        const select = card.locator('td.data-table__card-cell--select');
        const who = card.locator('td.data-table__card-cell--identity');
        const amount = card.locator('td.data-table__card-cell--figure');
        const [s, w, a] = [await rect(select), await rect(who), await rect(amount)];
        expect(s.right, `card ${i + 1}: the checkbox is left of the name`).toBeLessThanOrEqual(w.x + 0.5);
        expect(Math.abs(s.y - w.y), `card ${i + 1}: on the name's line`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.y - w.y), `card ${i + 1}: Amount stays top-right`).toBeLessThanOrEqual(1);
        lefts.push(Math.round(w.x));
      }
      // The row on the issued invoice has no checkbox, only its gutter, and
      // its name starts on the same edge as the others.
      const issued = page.locator('[data-test="payment-row"][data-txn="M-11"]');
      await expect(issued.locator('[data-test="payment-select"]')).toHaveCount(0);
      await expect(issued.locator('[data-test="payment-select-gutter"]')).toHaveCount(1);
      expect(new Set(lefts).size, `name left edges: ${lefts.join(', ')}`).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('at 1024 a tick selects the row: Select all turns mixed and the toolbar counts it', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openTransactions(page, fake());
    const row = page.locator('[data-test="payment-row"][data-txn="M-12"]');
    await row.locator('[data-test="payment-select"]').click();
    await expect(row.getByRole('checkbox')).toBeChecked();
    await expect(page.locator('[data-test="select-all-shown"] input[type="checkbox"]')).toHaveJSProperty('indeterminate', true);
    await expect(page.locator('[data-test="bulk-category"]')).toContainText('Set category of 1 selected');
    // The tick opened nothing.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('at 1280 the table is unchanged: the checkbox is its first column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactions(page, fake());
    await expect(page.locator('[data-test="payments-panel"] table.data-table--cards')).toHaveCount(0);
    const first = page.locator('[data-test="payment-row"][data-txn="M-12"] td').first();
    await expect(first.locator('[data-test="payment-select"]')).toBeVisible();
  });
});

// system_3 #12258 (ruling items 1 and 2; design ack c76261): the Book counts
// euros. A row in another currency is listed at its own amount with "Not
// counted: not in euros", and left out of every total: the month, the period
// line, the chart and the PDF. The counting line, and the PDF after its
// counting sentence and under its all-months total, say how many.
test.describe('#12258 the Book counts euros', () => {
  const DAY = new Date('2026-09-15T12:00:00Z');
  const dollarBook = () =>
    newFake({
      payments: [
        incomeRow(), // 2026-07-14, €350.00
        incomeRow({ id: 30, source: 'paypal', entry: 'import', transaction_id: 'PP-INVENTED-1', currency: 'USD', gross_cents: 10000, sender_name: 'Example Collector', note: 'Print sale', paid_on: '2026-07-16T00:00:00Z' }),
      ],
      expenses: [
        expenseRow(101), // 2026-07-20, €45.99
        expenseRow(102, { source: 'paypal', entry: 'import', transaction_id: 'PP-INVENTED-2', currency: 'USD', amount_cents: 2500, note: 'Font licence', paid_on: '2026-08-03T00:00:00Z' }),
      ],
    });
  const bookRow = (page: Page, key: string) => page.locator(`[data-test="book-row"][data-row-key="${key}"]`);
  const monthHead = (page: Page, key: string) => page.locator(`[data-test="book-month"][data-group="${key}"] [data-test="month-head"]`);
  const SENTENCE = '2 entries in other currencies (USD) are not counted.';

  test('a dollar row is listed at its own amount, says it is not counted, and no total adds it', async ({ page }) => {
    await page.clock.setFixedTime(DAY);
    await open(page, dollarBook());

    await expect(page.locator('[data-test="book-not-counted"]')).toHaveText(SENTENCE);
    // July: the euro rows alone.
    await expect(monthHead(page, '2026-07')).toContainText('In €350.00');
    await expect(monthHead(page, '2026-07')).toContainText('Out €45.99');
    await expect(monthHead(page, '2026-07')).toContainText('Result €304.01');
    await expect(bookRow(page, 'p30')).toContainText('US$100.00');
    await expect(bookRow(page, 'p30').locator('[data-test="book-row-not-counted"]')).toHaveText('Not counted: not in euros');
    await expect(bookRow(page, 'p10').locator('[data-test="book-row-not-counted"]')).toHaveCount(0);
    await expect(bookRow(page, 'e101').locator('[data-test="book-row-not-counted"]')).toHaveCount(0);

    // August, the newest month with entries and so the one open, holds the
    // dollar expense alone: listed, and every total is zero.
    await expect(page.locator('[data-test="book-month"][data-group="2026-08"]')).toHaveAttribute('open', '');
    await expect(bookRow(page, 'e102')).toContainText('-US$25.00');
    await expect(bookRow(page, 'e102').locator('[data-test="book-row-not-counted"]')).toHaveText('Not counted: not in euros');
    await expect(monthHead(page, '2026-08')).toContainText('In €0.00');
    await expect(monthHead(page, '2026-08')).toContainText('Out €0.00');

    await expect(page.locator('[data-test="book-period-quarter"]')).toHaveText(/This quarter, Q3 2026\s*In €350\.00\s*Out €45\.99\s*Result €304\.01/);
    await expect(page.locator('[data-test="book-period-year"]')).toHaveText(/Year to date, 2026\s*In €350\.00\s*Out €45\.99\s*Result €304\.01/);

    // The chart draws euros only, and says nothing of its own.
    const chart = page.locator('[data-test="book-chart"]');
    await expect(chart).toHaveAttribute('data-income', '350,0,0');
    await expect(chart).toHaveAttribute('data-expenses', '45.99,0,0');

    // The receipt dialog names the expense in its own currency.
    await bookRow(page, 'e102').locator('[data-test="book-expense-receipt"]').click();
    await expect(page.getByRole('dialog')).toContainText('US$25.00');
  });

  test('one entry reads in the singular', async ({ page }) => {
    await page.clock.setFixedTime(DAY);
    const fake = dollarBook();
    fake.expenses = fake.expenses.filter((e) => e.id !== 102);
    await open(page, fake);
    await expect(page.locator('[data-test="book-not-counted"]')).toHaveText('1 entry in another currency (USD) is not counted.');
  });

  test('a book in euros only has no clause and no row line', async ({ page }) => {
    await page.clock.setFixedTime(DAY);
    await open(page, newFake({ payments: [incomeRow()], expenses: [expenseRow(101)] }));
    await expect(page.locator('[data-test="book-counting-line"]')).toBeVisible();
    await expect(page.locator('[data-test="book-not-counted"]')).toHaveCount(0);
    await expect(page.locator('[data-test="book-row-not-counted"]')).toHaveCount(0);
  });

  async function press(page: Page) {
    await page.evaluate(() => {
      document.addEventListener('book-pdf', (e) => { (window as any).__bookPdf = JSON.stringify((e as CustomEvent).detail); }, { once: true });
    });
    const done = page.waitForEvent('download');
    await page.locator('[data-test="book-pdf"]').click();
    await done;
    return JSON.parse(await page.evaluate(() => (window as any).__bookPdf)).doc as Json;
  }

  test('the PDF lists the dollar rows at their own amounts, totals euros as the screen does, and says so twice', async ({ page }) => {
    await page.clock.setFixedTime(DAY);
    await open(page, dollarBook());
    const doc = await press(page);
    const counting = (await page.locator('[data-test="book-counting-line"]').textContent())!.trim();
    expect(doc.content[1].text).toBe(`${counting} ${SENTENCE}`);

    const tables = (doc.content as Json[]).filter((n) => n.table);
    const headTotals = (label: string) => tables.find((t) => t.table.body[0][0].columns[0].text === label)!.table.body[0][0].columns[1].text;
    expect(headTotals('July 2026')).toBe('In €350.00    Out -€45.99    Result €304.01');
    expect(headTotals('August 2026')).toBe('In €0.00    Out €0.00    Result €0.00');
    const all = JSON.stringify(doc.content);
    expect(all).toContain('US$100.00');
    expect(all).toContain('-US$25.00');
    expect(all.match(/Not counted: not in euros/g)).toHaveLength(2);

    // The all-months total, then the sentence again under it.
    const last = (doc.content as Json[]).at(-1)!;
    expect(last.stack[1].columns[1].text).toBe('In €350.00    Out -€45.99    Result €304.01');
    expect(last.stack[2].text).toBe(SENTENCE);
  });

  test('a one-month PDF counts what that month leaves out', async ({ page }) => {
    await page.clock.setFixedTime(DAY);
    await open(page, dollarBook());
    await page.getByRole('combobox', { name: 'Paid in' }).click();
    await page.getByRole('option', { name: 'July 2026', exact: true }).click();
    const doc = await press(page);
    expect(doc.content[1].text).toMatch(/ 1 entry in another currency \(USD\) is not counted\.$/);
    expect(JSON.stringify(doc.content)).not.toContain('All months in this file');
  });
});
