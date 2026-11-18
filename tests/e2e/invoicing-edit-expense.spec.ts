import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

/** Edit an expense in its hand-entry dialog, and name who was paid (system_3
 *  #10695, design §3.143 Decisions 3 and 5): "Paid to (optional)" on create
 *  and edit, sent as `payee`; a hand-entered expense changes in full; an
 *  imported one keeps what the bank recorded and changes only its category
 *  and what it was for; History lists the row's events newest first; Remove
 *  arms first. Invented records only; every call is answered by an
 *  in-memory fake, behind a catch-all 404. */

type Json = Record<string, any>;

interface Fake {
  expenses: Json[];
  events: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
  // system_3 #11567: the category list the server gives, its status, a
  // refused save, and whether the Book's selection is served.
  categories?: Json[];
  categoriesStatus?: number;
  patchRefusal?: string;
  book?: boolean;
}

const exp = (over: Json): Json => ({
  currency: 'EUR', payee: '', reference: '', note: '', removed_at: null, created_at: '2026-10-01T09:00:00Z', ...over,
});

const newFake = (): Fake => ({
  expenses: [
    exp({ id: 21, transaction_id: 'M-hand-e', source: 'manual', entry: 'manual', paid_on: '2026-10-20T00:00:00Z', payee: 'Copyshop Esempio', reference: 'R-7', note: 'Prints', category: 'other', amount_cents: 1250 }),
    exp({ id: 22, transaction_id: 'N26-imp-e', source: 'n26', entry: 'import', paid_on: '2026-10-18T00:00:00Z', reference: 'Bahn Beispiel', note: '', category: 'travel', amount_cents: 4200 }),
  ],
  events: [
    { id: 31, created_at: '2026-11-10T10:00:00Z', action: 'create_manual', entity_type: 'expense', entity_id: 21, details: '{}' },
    { id: 32, created_at: '2026-11-12T09:30:00Z', action: 'edit', entity_type: 'expense', entity_id: 21, details: '{"before":{"payee":""},"after":{"payee":"Copyshop Esempio"}}' },
    // Zir own category names read as given, never through the income labels
    // where `other` is "Other" (system_3 #10744).
    { id: 34, created_at: '2026-11-12T10:00:00Z', action: 'edit', entity_type: 'expense', entity_id: 21, details: '{"before":{"category":"travel"},"after":{"category":"other"}}' },
    // Another row's event never shows here.
    { id: 33, created_at: '2026-11-12T11:00:00Z', action: 'edit', entity_type: 'payment', entity_id: 21, details: '{"before":{"note":""},"after":{"note":"x"}}' },
  ],
  requests: [],
});

const CATEGORIES = ['materials and supplies', 'other', 'travel'].map((name, i) => ({ id: i + 1, name }));

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses.filter((e) => !e.removed_at) });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expense-categories' && method === 'GET') {
      if (fake.categoriesStatus && fake.categoriesStatus !== 200) return json(route, fake.categoriesStatus, { error: { code: 'server_error', message: 'could not list' } });
      return json(route, 200, { categories: fake.categories || CATEGORIES });
    }
    if (fake.book && path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'everything', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'everything', name: 'Everything', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/audit-events') {
      const id = Number(url.searchParams.get('entity_id'));
      const events = fake.events.filter((e) => e.entity_type === url.searchParams.get('entity_type') && e.entity_id === id);
      return json(route, 200, { events: [...events].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) });
    }
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const e = exp({ id: 23, transaction_id: 'M-new-e', source: 'manual', entry: 'manual', ...body, paid_on: `${body.paid_on}T00:00:00Z` });
      fake.expenses.push(e);
      return json(route, 201, { expense: e });
    }
    let m = path.match(/^\/invoicing\/expenses\/(\d+)$/);
    if (m && method === 'PATCH') {
      if (fake.patchRefusal) return json(route, 400, { error: { code: 'bad_request', message: fake.patchRefusal } });
      const e = fake.expenses.find((x) => x.id === Number(m![1]))!;
      Object.assign(e, JSON.parse(req.postData() || '{}'));
      return json(route, 200, { expense: e });
    }
    m = path.match(/^\/invoicing\/expenses\/(\d+)\/remove$/);
    if (m && method === 'POST') {
      fake.expenses.find((x) => x.id === Number(m![1]))!.removed_at = '2026-11-13T12:00:00Z';
      return json(route, 200, { removed: 1 });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="expense-row"]').first()).toBeVisible();
}

const narrowOf = (page: Page) => page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
const row = (page: Page, txn: string) => page.locator(`[data-test="expense-row"][data-txn="${txn}"]`);

// Desktop opens through the row's Edit; a phone through the card's body.
async function openEdit(page: Page, txn: string) {
  if (await narrowOf(page)) await row(page, txn).locator('[data-test="row-who"]').click();
  else await row(page, txn).locator('[data-test="expense-edit"]').click();
  const dialog = page.getByRole('dialog', { name: 'Edit expense' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const writes = (fake: Fake, method: string) =>
  fake.requests.filter((r) => r.method === method && r.path.startsWith('/invoicing/expenses')).map((r) => ({ path: r.path, body: r.body ? JSON.parse(r.body) : null }));

async function pickCategory(page: Page, dialog: ReturnType<Page['getByRole']>, name: string) {
  await dialog.locator('[data-test="expense-category"]').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test.describe('#10695 Edit an expense, and name who was paid', () => {
  test('"Paid to" is offered on create, after the date and amount, and Save sends it as payee', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="expense-new"]').click();
    const dialog = page.getByRole('dialog', { name: 'Enter expense by hand' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-test="edit-history"], [data-test="edit-remove"]')).toHaveCount(0);
    // Date and Amount, then Paid to, then Category (design call 1).
    const order = await dialog.locator('[data-test="expense-amount"], [data-test="expense-payee"], [data-test="expense-category"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-test')),
    );
    expect(order).toEqual(['expense-amount', 'expense-payee', 'expense-category']);
    await dialog.locator('[data-test="expense-date"]').fill('2026-11-02');
    await dialog.locator('[data-test="expense-amount"]').fill('19,99');
    await dialog.locator('[data-test="expense-payee"]').fill('  Farben Erfunden ');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'POST')).toEqual([
      { path: '/invoicing/expenses/manual', body: { paid_on: '2026-11-02', amount_cents: 1999, category: 'other', payee: 'Farben Erfunden', reference: '', note: '' } },
    ]);
    // The row's who reads the payee (§3.143 Decision 3).
    await expect(row(page, 'M-new-e').locator('[data-test="row-who"]')).toHaveText('Farben Erfunden');
  });

  test('a hand-entered expense changes in full, and Save sends only what changed', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand-e');
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(dialog.locator('[data-test="edit-facts"], [data-test="edit-imported-lead"]')).toHaveCount(0);
    await expect(dialog.locator('[data-test="expense-date"]')).toHaveValue('2026-10-20');
    // As the payment dialog does: decimalFromMinor drops trailing zeros.
    await expect(dialog.locator('[data-test="expense-amount"]')).toHaveValue('12,5');
    await expect(dialog.locator('[data-test="expense-payee"]')).toHaveValue('Copyshop Esempio');
    await expect(dialog.locator('[data-test="expense-reference"]')).toHaveValue('R-7');
    await dialog.locator('[data-test="expense-payee"]').fill('Copyshop Nord');
    await dialog.locator('[data-test="expense-amount"]').fill('13');
    await pickCategory(page, dialog, 'materials and supplies');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'PATCH')).toEqual([
      { path: '/invoicing/expenses/21', body: { category: 'materials and supplies', amount_cents: 1300, payee: 'Copyshop Nord' } },
    ]);
    await expect(row(page, 'M-hand-e').locator('[data-test="row-who"]')).toHaveText('Copyshop Nord');
  });

  test('clearing "Paid to" sends an empty payee; an unchanged Save sends nothing', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    let dialog = await openEdit(page, 'M-hand-e');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'PATCH')).toEqual([]);
    dialog = await openEdit(page, 'M-hand-e');
    await dialog.locator('[data-test="expense-payee"]').fill('');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'PATCH')).toEqual([{ path: '/invoicing/expenses/21', body: { payee: '' } }]);
  });

  test("an imported expense shows the bank's facts as text; only category and what it was for change", async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp-e');
    await expect(dialog.locator('[data-test="edit-imported-lead"]')).toHaveText(
      "These details came from N26 and can't be changed. If they were read wrong, remove this expense and enter it by hand.",
    );
    const facts = dialog.locator('[data-test="edit-facts"]');
    // The reference is the bank's payee, named once, with no Reference line
    // (design_agent c66842, call 2).
    await expect(facts.locator('dt')).toHaveText(['Date paid', 'Amount', 'Paid to (from the bank)', 'Source']);
    await expect(facts.locator('dt', { hasText: 'Reference' })).toHaveCount(0);
    await expect(facts.locator('dd')).toHaveText([/18 Oct 2026|2026-10-18/, '€42.00', 'Bahn Beispiel', 'N26']);
    await expect(
      dialog.locator('[data-test="expense-date"], [data-test="expense-amount"], [data-test="expense-payee"], [data-test="expense-reference"]'),
    ).toHaveCount(0);
    await pickCategory(page, dialog, 'other');
    await dialog.locator('[data-test="expense-note"]').fill('Train to a client');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'PATCH')).toEqual([{ path: '/invoicing/expenses/22', body: { category: 'other', note: 'Train to a client' } }]);
  });

  test("History lists the expense's own events, newest first", async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand-e');
    const history = dialog.locator('[data-test="edit-history"]');
    await expect(history).not.toHaveAttribute('open', '');
    await history.locator('summary').click();
    await expect(history.locator('[data-test="edit-history-line"]')).toHaveText([
      '12 Nov 2026 · Category: travel → other',
      '12 Nov 2026 · Paid to: — → Copyshop Esempio',
      '10 Nov 2026 · Entered by hand',
    ]);
    const asked = fake.requests.filter((r) => r.path === '/invoicing/audit-events');
    expect(asked.length).toBeGreaterThan(0);
  });

  test('Remove arms first, then removes the expense and its row leaves the list', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp-e');
    const remove = dialog.locator('[data-test="edit-remove"]');
    await expect(remove).toHaveText('Remove');
    await remove.click();
    await expect(remove).toHaveText('Remove this expense');
    expect(writes(fake, 'POST')).toEqual([]);
    await remove.click();
    await expect(dialog).toBeHidden();
    expect(writes(fake, 'POST')).toEqual([{ path: '/invoicing/expenses/22/remove', body: null }]);
    await expect(row(page, 'N26-imp-e')).toHaveCount(0);
    await expect(row(page, 'M-hand-e')).toHaveCount(1);
  });

  test('on a phone a card body tap opens the expense; its checkbox keeps its own job', async ({ page }) => {
    test.skip(!(await (async () => (page.viewportSize()?.width ?? 1280) < 640)()), 'phone layout only');
    const fake = newFake();
    await open(page, fake);
    const card = row(page, 'M-hand-e');
    await card.locator('[data-test="payment-select"]').getByRole('checkbox').check();
    await expect(page.getByRole('dialog', { name: 'Edit expense' })).toHaveCount(0);
    const dialog = await openEdit(page, 'M-hand-e');
    await expect(dialog.locator('[data-test="expense-payee"]')).toHaveValue('Copyshop Esempio');
  });

  test('on desktop each expense row offers Edit', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 640, 'desktop table only');
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="expense-row"] [data-test="expense-edit"]')).toHaveCount(2);
  });
});

// system_3 #11567 (#11497 item 16; operator c71346 on #10985; design ack on
// #11567): on a wide screen an expense's category is a select in its row,
// like a payment's. Its options are the Edit expense dialog's, in the server's
// order, loaded the first time any expense's select opens.
test.describe('#11567 an expense row\'s category is a select on its row', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop table; a phone card reads the category as text');
  // AspSelect puts the data-test on its combobox itself.
  const select = (page: Page, txn: string) => row(page, txn).locator('[data-test="table-expense-category"]');
  const optionTexts = async (page: Page) => (await page.getByRole('option').allInnerTexts()).map((t) => t.trim());
  const categoryReads = (fake: Fake) => fake.requests.filter((r) => r.method === 'GET' && r.path === '/invoicing/expense-categories').length;

  test('each expense row shows its category; the list loads on the first open, in the dialog\'s order', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(select(page, 'M-hand-e')).toContainText('other');
    await expect(select(page, 'N26-imp-e')).toContainText('travel');
    expect(categoryReads(fake), 'opening Transactions asks for no categories').toBe(0);
    await select(page, 'M-hand-e').click();
    await expect(page.locator('.select__search-input:visible')).toHaveCount(1);
    expect(await optionTexts(page)).toEqual(['materials and supplies', 'other', 'travel']);
    expect(categoryReads(fake)).toBe(1);
    await page.keyboard.press('Escape');
    await select(page, 'N26-imp-e').click();
    expect(categoryReads(fake), 'loaded once').toBe(1);
  });

  test('a change saves at once, and the Book follows without a reload', async ({ page }) => {
    const fake = newFake();
    fake.book = true;
    fake.categories = [...CATEGORIES, { id: 9, name: 'Private' }];
    await open(page, fake);
    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    const october = page.locator('[data-test="book-month"][data-group="2026-10"] .month__totals');
    await expect(october).toContainText('Out €54.50');
    await page.getByRole('tab', { name: 'Transactions', exact: true }).click();
    await select(page, 'M-hand-e').click();
    await page.getByRole('option', { name: 'Private', exact: true }).click();
    await expect.poll(() => writes(fake, 'PATCH')).toEqual([{ path: '/invoicing/expenses/21', body: { category: 'Private' } }]);
    await expect(select(page, 'M-hand-e')).toContainText('Private');
    // Private is never counted, so October's Out drops by that €12.50.
    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    await expect(october).toContainText('Out €42.00');
  });

  test('a category not in the list is shown, and listed at the end', async ({ page }) => {
    const fake = newFake();
    fake.expenses[0].category = 'old studio rent';
    await open(page, fake);
    await expect(select(page, 'M-hand-e')).toContainText('old studio rent');
    await select(page, 'M-hand-e').click();
    expect(await optionTexts(page)).toEqual(['materials and supplies', 'other', 'travel', 'old studio rent']);
  });

  test('a list that cannot be loaded leaves the row\'s value and says so; the next open tries again', async ({ page }) => {
    const fake = newFake();
    fake.categoriesStatus = 500;
    await open(page, fake);
    await select(page, 'M-hand-e').click();
    await expect(page.locator('[data-test="payment-error"]')).toHaveText('Your categories could not be loaded. Try again by opening the list.');
    expect(await optionTexts(page)).toEqual(['other']);
    await page.keyboard.press('Escape');
    await expect(select(page, 'M-hand-e')).toContainText('other');
    fake.categoriesStatus = 200;
    await select(page, 'M-hand-e').click();
    await expect.poll(() => optionTexts(page)).toEqual(['materials and supplies', 'other', 'travel']);
  });

  test('a refused save says why, and the select returns to what is stored', async ({ page }) => {
    const fake = newFake();
    fake.patchRefusal = 'that category is not one of yours';
    await open(page, fake);
    await select(page, 'M-hand-e').click();
    await page.getByRole('option', { name: 'travel', exact: true }).click();
    await expect(page.locator('[data-test="payment-error"]')).toHaveText('that category is not one of yours');
    await expect(select(page, 'M-hand-e')).toContainText('other');
  });

  test('a hand-entered row is named by its date and who and what; an imported one by its id', async ({ page }) => {
    await open(page, newFake());
    await expect(page.getByRole('combobox', { name: 'Category for 2026-10-20 · Copyshop Esempio · Prints', exact: true })).toHaveCount(1);
    await expect(page.getByRole('combobox', { name: 'Category for N26-imp-e', exact: true })).toHaveCount(1);
  });

  test('Set category with expenses ticked lists the same categories in the same order', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await select(page, 'M-hand-e').click();
    const rowList = await optionTexts(page);
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Select M-hand-e' }).check();
    await page.getByRole('checkbox', { name: 'Select N26-imp-e' }).check();
    await page.locator('[data-test="bulk-category"]').click();
    expect(await optionTexts(page)).toEqual(rowList);
  });
});

test('#11567 on a phone an expense card still reads its category as text', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone card');
  await open(page, newFake());
  await expect(row(page, 'M-hand-e').locator('[data-test="table-expense-category"]')).toHaveCount(0);
  await expect(row(page, 'M-hand-e').locator('[data-test="row-category"]')).toHaveText('other');
});

