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
  reportStatus?: number;
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
    // What the Book counts (system_3 #10635): the starting selection, Work only.
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

  test('adding a category inline makes it usable on the same expense', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
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

    await showBook(page);
    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
  });

  test('a duplicate category name is refused', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-add-category-link"]').click();
    await page.locator('[data-test="expense-new-category-name"]').fill('Travel');
    await page.locator('[data-test="expense-add-category-save"]').click();
    await expect(page.locator('[data-test="expense-category-error"]')).toContainText('already exists');
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
    await expect(page.locator('[data-test="book-error"]')).toContainText('could not build the report');
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
