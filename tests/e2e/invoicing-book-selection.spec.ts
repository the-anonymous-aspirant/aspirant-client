import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** What the Book counts (design §3.143 Decisions 7 and 8, system_3
 *  #10555-D1 / #10635): the Book counts the categories in her selection,
 *  says so in one line, and lets her change it and save it as a preset.
 *  Transactions flags the rows it leaves out. The fake keeps the selection
 *  and presets in memory and applies the server's rules
 *  (aspirant-server `invoicing_book_selection.go`): Private never counts,
 *  `expense_all` only on Work only unchanged, and a deleted preset leaves
 *  the selection with no preset. A catch-all /api/ → 404 is registered
 *  first, so nothing reaches a live server. */

type Json = Record<string, any>;

const EXPENSE_CATEGORIES = [
  'materials and supplies', 'studio rent and energy', 'insurance and fees', 'advertising',
  'travel', 'office and postage', 'phone and internet', 'advice', 'training', 'other', 'Private',
];
const COUNTABLE = EXPENSE_CATEGORIES.filter((c) => c !== 'Private');

interface Counting { income: string[]; expense_all: boolean; expense: string[] }
interface Preset extends Counting { id: string; name: string; builtin: boolean }

interface Fake {
  payments: Json[];
  expenses: Json[];
  selection: Counting & { preset: string };
  presets: Preset[];
  nextPresetId: number;
  requests: Array<{ method: string; path: string; body: string }>;
}

const WORK_ONLY: Preset = { id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] };

const payment = (id: number, over: Json = {}) => ({
  id, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: `M-${id}`,
  method: 'bank_transfer', reference: '', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR',
  gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild Juli',
  category: 'paid_work', client_id: 1, on_invoice: false, ...over,
});

const expense = (id: number, over: Json = {}) => ({
  id, source: 'manual', transaction_id: `M-e${id}`, paid_on: '2026-07-20T00:00:00Z',
  currency: 'EUR', amount_cents: 4599, note: 'Guitar strings', category: 'materials and supplies',
  client_id: null, entry: 'manual', reference: '', ...over,
});

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    payments: [],
    expenses: [],
    selection: { preset: 'work_only', income: ['paid_work'], expense_all: true, expense: [] },
    presets: [],
    nextPresetId: 7,
    requests: [],
    ...over,
  };
}

const sorted = (xs: string[]) => [...xs].sort();
const same = (a: Counting, b: Counting) =>
  a.expense_all === b.expense_all &&
  JSON.stringify(sorted(a.income)) === JSON.stringify(sorted(b.income)) &&
  JSON.stringify(a.expense_all ? [] : sorted(a.expense)) === JSON.stringify(b.expense_all ? [] : sorted(b.expense));

function view(fake: Fake): Json {
  const presets = [WORK_ONLY, ...fake.presets];
  const p = presets.find((x) => x.id === fake.selection.preset);
  return { selection: { ...fake.selection, changed: p ? !same(p, fake.selection) : false }, presets };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The server's refusals, in its order (checkBookCounting, workOnlyRule).
function refuse(c: Counting, preset: boolean): string {
  if (c.expense.some((e) => e.toLowerCase() === 'private')) return 'Private expenses never count';
  if (c.expense_all && (preset || !same(c, WORK_ONLY))) return 'only Work only counts every expense category; list the categories that count';
  if (c.expense_all && c.expense.length) return 'expense must be empty when expense_all is true';
  return '';
}

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() || '';
    fake.requests.push({ method, path, body });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/payments/removed' || path === '/invoicing/expenses/removed') return json(route, 200, { payments: [], expenses: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/payer-candidates') return json(route, 200, { candidates: [] });
    if (path === '/invoicing/expense-categories' && method === 'GET') {
      return json(route, 200, { categories: EXPENSE_CATEGORIES.map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })) });
    }
    const edit = path.match(/^\/invoicing\/(payments|expenses)\/(\d+)$/);
    if (edit && method === 'PATCH') {
      const list = edit[1] as 'payments' | 'expenses';
      const row = fake[list].find((x) => x.id === Number(edit[2]));
      if (!row) return json(route, 404, { error: { code: 'not_found', message: 'no such row' } });
      Object.assign(row, JSON.parse(body || '{}'));
      return json(route, 200, { [list === 'payments' ? 'payment' : 'expense']: row });
    }
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, view(fake));
    if (path === '/invoicing/book/selection' && method === 'PUT') {
      const b = JSON.parse(body);
      const why = refuse(b, false);
      if (why) return json(route, 400, { error: { code: 'invalid_field', message: why } });
      fake.selection = { preset: b.preset || '', income: b.income, expense_all: b.expense_all, expense: b.expense };
      return json(route, 200, view(fake));
    }
    if (path === '/invoicing/book/presets' && method === 'POST') {
      const b = JSON.parse(body);
      const why = refuse(b, true);
      if (why) return json(route, 400, { error: { code: 'invalid_field', message: why } });
      const name = String(b.name).trim();
      if ([WORK_ONLY, ...fake.presets].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return json(route, 409, { error: { code: 'duplicate_preset', message: `a preset named "${name}" already exists` } });
      }
      const preset: Preset = { id: String(fake.nextPresetId), name, builtin: false, income: b.income, expense_all: false, expense: b.expense };
      fake.nextPresetId += 1;
      fake.presets.push(preset);
      return json(route, 201, { ...view(fake), preset });
    }
    const one = path.match(/^\/invoicing\/book\/presets\/([^/]+)$/);
    if (one && one[1] === 'work_only') return json(route, 409, { error: { code: 'builtin_preset', message: 'Work only is built in and cannot be changed or deleted' } });
    if (one && method === 'PUT') {
      const b = JSON.parse(body);
      const why = refuse(b, true);
      if (why) return json(route, 400, { error: { code: 'invalid_field', message: why } });
      const preset = fake.presets.find((p) => p.id === one[1])!;
      Object.assign(preset, { income: b.income, expense_all: false, expense: b.expense });
      return json(route, 200, { ...view(fake), preset });
    }
    if (one && method === 'DELETE') {
      fake.presets = fake.presets.filter((p) => p.id !== one[1]);
      if (fake.selection.preset === one[1]) fake.selection.preset = '';
      return json(route, 200, { ...view(fake), deleted: one[1] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function load(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
}

async function showBook(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Book' }).click();
  await expect(page.locator('[data-test="book-panel"]')).toBeVisible();
}

async function showTransactions(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Transactions' }).click();
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

// Opens "Change what counts" and waits for her expense categories, which
// the ticks wait for.
async function openChange(page: Page): Promise<Locator> {
  const change = page.locator('[data-test="book-change"]');
  await change.locator('summary').click();
  await expect(change.locator('[data-test="book-tick-in-gift"] input')).toBeEnabled();
  return change;
}

const bookRows = (page: Page) => page.locator('[data-test="book-row"]:visible');
const countingLine = (page: Page) => page.locator('[data-test="book-counting-line"]');
const txRow = (page: Page, txn: string) => page.locator(`[data-txn="${txn}"]:visible`);
const lastPut = (fake: Fake) => {
  const put = [...fake.requests].reverse().find((r) => r.method === 'PUT' && r.path === '/invoicing/book/selection');
  return put ? JSON.parse(put.body) : null;
};

test.describe('#10635 the Book counts what she chose', () => {
  test('under Work only, Gift and Private are left out of the Book and flagged on Transactions', async ({ page }) => {
    const fake = newFake({
      payments: [payment(1), payment(2, { category: 'gift', note: 'Birthday', sender_name: 'Aunt Ada', gross_cents: 5000 })],
      expenses: [expense(101), expense(102, { category: 'Private', note: 'Groceries', amount_cents: 2000 })],
    });
    await load(page, fake);

    await expect(txRow(page, 'M-2').locator('[data-test="row-not-in-book"]')).toHaveText('Not in the Book');
    await expect(txRow(page, 'M-e102').locator('[data-test="row-not-in-book"]')).toHaveText('Not in the Book');
    await expect(txRow(page, 'M-1').locator('[data-test="row-not-in-book"]')).toHaveCount(0);
    await expect(txRow(page, 'M-e101').locator('[data-test="row-not-in-book"]')).toHaveCount(0);

    await showBook(page);
    await expect(countingLine(page)).toHaveText('Counting with Work only: payments marked Paid work, and every expense except Private.');
    await expect(page.locator('[data-test="book-report-caption"]')).toHaveText('Uses Work only');
    await expect(bookRows(page)).toHaveCount(2);
    await expect(page.locator('[data-test="book-panel"]')).not.toContainText('Birthday');
    await expect(page.locator('[data-test="book-panel"]')).not.toContainText('Groceries');
    await expect(page.locator('[data-test="month-head"]')).toContainText('In €350.00');
    await expect(page.locator('[data-test="month-head"]')).toContainText('Out €45.99');
  });

  test('Uncategorised payments are named, and "Review them" opens Transactions on In and Uncategorised', async ({ page }) => {
    const fake = newFake({
      payments: [payment(1), payment(3, { category: 'uncategorised', note: 'Unknown transfer', sender_name: 'Max Muster', gross_cents: 1200 })],
      expenses: [expense(101)],
    });
    await load(page, fake);
    await showBook(page);

    await expect(page.locator('[data-test="book-uncategorised"]')).toHaveText('1 payment is still Uncategorised and not counted.');
    await page.locator('[data-test="book-review-uncategorised"]').click();

    await expect(page.getByRole('tab', { name: 'Transactions' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-test="category-filter"]')).toContainText('Uncategorised');
    await expect(txRow(page, 'M-3')).toBeVisible();
    await expect(txRow(page, 'M-1')).toHaveCount(0);
    await expect(txRow(page, 'M-e101')).toHaveCount(0);
  });

  test('ticking Gift counts it at once, reads "(changed)", and sends the expense categories as a list', async ({ page }) => {
    const fake = newFake({
      payments: [payment(1), payment(2, { category: 'gift', note: 'Birthday', sender_name: 'Aunt Ada', gross_cents: 5000 })],
      expenses: [expense(101)],
    });
    await load(page, fake);
    await showBook(page);
    await expect(bookRows(page)).toHaveCount(2);

    const change = await openChange(page);
    await expect(change.locator('[data-test="book-tick-in-paid_work"] input')).toBeChecked();
    await expect(change.locator('[data-test="book-tick-in-gift"] input')).not.toBeChecked();
    await change.locator('[data-test="book-tick-in-gift"]').click();

    await expect(bookRows(page)).toHaveCount(3);
    await expect(page.locator('[data-test="book-panel"]')).toContainText('Birthday');
    await expect(page.locator('[data-test="month-head"]')).toContainText('In €400.00');
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Work only (changed)');
    await expect(countingLine(page)).toHaveText(/^Counting with Work only \(changed\): payments marked Paid work or Gift, and expenses marked /);
    expect(lastPut(fake)).toEqual({ preset: 'work_only', income: ['paid_work', 'gift'], expense_all: false, expense: COUNTABLE });

    // Transactions reads the same selection: the Gift row is counted now.
    await showTransactions(page);
    await expect(txRow(page, 'M-2')).toBeVisible();
    await expect(txRow(page, 'M-2').locator('[data-test="row-not-in-book"]')).toHaveCount(0);
  });

  test('saving "Jobcenter" makes it the selection, and a reload keeps it', async ({ page }) => {
    const fake = newFake({
      payments: [payment(1), payment(2, { category: 'gift', note: 'Birthday', sender_name: 'Aunt Ada', gross_cents: 5000 })],
      expenses: [expense(101)],
    });
    await load(page, fake);
    await showBook(page);
    const change = await openChange(page);
    await change.locator('[data-test="book-tick-in-gift"]').click();
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Work only (changed)');

    await change.locator('[data-test="book-save-preset"]').click();
    const dialog = page.getByRole('dialog', { name: 'Save as preset' });
    await dialog.locator('[data-test="book-preset-name"]').fill('Jobcenter');
    await dialog.locator('[data-test="book-preset-confirm"]').click();
    await expect(dialog).toBeHidden();

    const create = fake.requests.find((r) => r.method === 'POST' && r.path === '/invoicing/book/presets');
    expect(JSON.parse(create!.body)).toEqual({ name: 'Jobcenter', income: ['paid_work', 'gift'], expense_all: false, expense: COUNTABLE });
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Jobcenter');
    await expect(page.locator('[data-test="book-report-caption"]')).toHaveText('Uses Jobcenter');

    await page.reload();
    await dismissMobileSidebarIfPresent(page);
    await showBook(page);
    await expect(countingLine(page)).toHaveText(/^Counting with Jobcenter: payments marked Paid work or Gift, and expenses marked /);
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Jobcenter');
    await expect(bookRows(page)).toHaveCount(3);
    await expect(page.locator('[data-test="month-head"]')).toContainText('In €400.00');
  });

  test('Work only cannot be updated or deleted, and Private is never offered', async ({ page }) => {
    const fake = newFake({ payments: [payment(1)], expenses: [expense(101)] });
    await load(page, fake);
    await showBook(page);
    const change = await openChange(page);

    await expect(change.locator('[data-test="book-update-preset"]')).toHaveCount(0);
    await expect(change.locator('[data-test="book-delete-preset"]')).toHaveCount(0);
    const ticksOut = change.locator('[data-test="book-tick-out"]');
    await expect(ticksOut).toHaveCount(COUNTABLE.length);
    await expect(change.locator('[data-test="book-tick-out"][data-category="Private"]')).toHaveCount(0);
    await expect(change.locator('[data-test="book-ticks-out"]')).toContainText('Private expenses never count.');
  });

  test('her own preset updates once changed, and its delete arms first', async ({ page }) => {
    const jobcenter: Preset = { id: '7', name: 'Jobcenter', builtin: false, income: ['paid_work', 'gift'], expense_all: false, expense: COUNTABLE };
    const fake = newFake({
      payments: [payment(1)],
      expenses: [expense(101)],
      presets: [jobcenter],
      selection: { preset: '7', income: ['paid_work', 'gift'], expense_all: false, expense: COUNTABLE },
      nextPresetId: 8,
    });
    await load(page, fake);
    await showBook(page);
    const change = await openChange(page);

    const update = change.locator('[data-test="book-update-preset"]');
    await expect(update).toHaveText('Update “Jobcenter”');
    await expect(update).toBeDisabled();
    await change.locator('[data-test="book-tick-in-loan"]').click();
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Jobcenter (changed)');
    await expect(update).toBeEnabled();
    await update.click();
    await expect(page.locator('[data-test="book-preset"]')).not.toContainText('(changed)');
    expect(fake.presets[0].income).toEqual(['paid_work', 'gift', 'loan']);

    const del = change.locator('[data-test="book-delete-preset"]');
    await del.click();
    await expect(del).toHaveText('Delete “Jobcenter”');
    expect(fake.requests.some((r) => r.method === 'DELETE')).toBe(false);
    await del.click();
    await expect(page.locator('[data-test="book-preset"]')).toContainText('Custom');
    expect(fake.presets).toHaveLength(0);
  });

  test('a row leaves the Book when its edit dialog moves it to an uncounted category', async ({ page }) => {
    const fake = newFake({ payments: [payment(1)], expenses: [] });
    await load(page, fake);
    await showBook(page);
    await expect(bookRows(page)).toHaveCount(1);

    const row = bookRows(page).first();
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (narrow) await row.locator('[data-test="book-row-description"]').click();
    else await row.locator('[data-test="book-row-edit"]').click();
    const dialog = page.getByRole('dialog', { name: 'Edit payment' });
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-test="edit-category"]').click();
    await page.getByRole('option', { name: 'Gift', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(bookRows(page)).toHaveCount(0);
    await expect(page.locator('[data-test="book-empty"]')).toBeVisible();
  });

  test('with nothing counted, the empty state says what would appear', async ({ page }) => {
    const fake = newFake({ payments: [payment(2, { category: 'gift' })] });
    await load(page, fake);
    await showBook(page);
    const empty = page.locator('[data-test="book-empty"]');
    await expect(empty).toContainText('Nothing counted yet');
    await expect(empty).toContainText('Payments and expenses in the categories you count appear here, by month.');
    // The counting line still says what counts, so she can change it.
    await expect(countingLine(page)).toBeVisible();
  });
});

// design_agent c67318 on #10635 (§3.17, §3.41): every fold's summary leads
// with one muted caret that turns down when open, and the native marker is
// hidden. Read from the computed style, so a lost class or a second marker
// fails here, not only in a screenshot.
async function foldMarker(summary: Locator) {
  return summary.evaluate((el) => {
    const before = getComputedStyle(el, '::before');
    return {
      content: before.content,
      transform: before.transform,
      listStyle: getComputedStyle(el).listStyleType,
      minHeight: el.getBoundingClientRect().height,
    };
  });
}

async function expectFoldMarker(summary: Locator, details: Locator) {
  const closed = await foldMarker(summary);
  expect(closed.content).toBe('"▸"');
  expect(closed.listStyle).toBe('none');
  expect(closed.transform).toBe('none');
  expect(closed.minHeight).toBeGreaterThanOrEqual(44);
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  // Rotated 90°: matrix(0, 1, -1, 0, 0, 0), allowing for float noise.
  await expect.poll(async () => {
    const t = (await foldMarker(summary)).transform;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return t;
    const [a, b] = m[1].split(',').map(Number);
    return Math.abs(a) < 1e-6 && Math.abs(b - 1) < 1e-6 ? 'down' : t;
  }).toBe('down');
}

test.describe('#10635 every fold shows its marker (design_agent c67318)', () => {
  test('"Change what counts" leads with one caret that turns down when open', async ({ page }) => {
    const fake = newFake({ payments: [payment(1)] });
    await load(page, fake);
    await showBook(page);
    await expectFoldMarker(page.locator('[data-test="book-change-summary"]'), page.locator('[data-test="book-change"]'));
  });

  test("an edit dialog's History fold shows the same caret", async ({ page }) => {
    const fake = newFake({ payments: [payment(1)] });
    await load(page, fake);
    await showBook(page);
    const row = bookRows(page).first();
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (narrow) await row.locator('[data-test="book-row-description"]').click();
    else await row.locator('[data-test="book-row-edit"]').click();
    const dialog = page.getByRole('dialog', { name: 'Edit payment' });
    await expect(dialog).toBeVisible();
    await expectFoldMarker(dialog.locator('[data-test="edit-history-summary"]'), dialog.locator('[data-test="edit-history"]'));
  });
});
