import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { groupByMonth, landedRows, monthSpanLabel, openGroupKeys } from '../../src/components/invoicing/listGroups.js';
import { openWaysIn } from './helpers/waysIn';

/** Transactions and the Book fold by the month the money moved, newest first
 *  (design_conventions §3.145, system_3 #10555-E1 / #10636). The module half
 *  runs with no page. The page half uses an in-memory fake; a catch-all
 *  /api/ → 404 is registered first. */

type Json = Record<string, any>;

test.describe('#10636 listGroups: months and the open-state rule', () => {
  const rows = [
    { k: 'a', d: '2026-11-20T00:00:00Z' },
    { k: 'b', d: '2026-11-02T00:00:00Z' },
    { k: 'c', d: '2026-09-30T00:00:00Z' },
    { k: 'd', d: '2026-10-01T00:00:00Z' },
  ];
  const groups = groupByMonth(rows, (r: Json) => r.d);
  const newest = (g: Json) => g.key === groups[0].key;
  const open = (opts: Json) => [...openGroupKeys(groups, { defaultOpen: newest, ...opts })];

  test('months run newest first and rows keep the order they came in', () => {
    expect(groups.map((g: Json) => [g.key, g.label, g.rows.map((r: Json) => r.k).join('')])).toEqual([
      ['2026-11', 'November 2026', 'ab'],
      ['2026-10', 'October 2026', 'd'],
      ['2026-09', 'September 2026', 'c'],
    ]);
  });

  test('the default opens the newest month, a lone group is open, and a choice is kept', () => {
    expect(open({})).toEqual(['2026-11']);
    expect([...openGroupKeys([groups[2]], { defaultOpen: () => false })]).toEqual(['2026-09']);
    expect(open({ chosen: { '2026-11': false, '2026-09': true } })).toEqual(['2026-09']);
  });

  test('a filter opens every group, minus the ones closed while it was on; the earlier choice comes back when it clears', () => {
    const chosen = { '2026-09': true };
    expect(open({ filtered: true, chosen })).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(open({ filtered: true, chosen, chosenWhileFiltered: { '2026-10': false } })).toEqual(['2026-11', '2026-09']);
    // The filter cleared: the caller drops chosenWhileFiltered, `chosen` stands.
    expect(open({ chosen })).toEqual(['2026-11', '2026-09']);
  });

  test('landedRows names new rows and rows whose month changed, in list order; the span reads as months', () => {
    const before = new Map(rows.map((r) => [r.k, r.d.slice(0, 7)]));
    const after = groupByMonth(
      [{ k: 'a', d: '2026-11-20' }, { k: 'd', d: '2026-10-01' }, { k: 'c', d: '2026-09-30' }, { k: 'b', d: '2026-09-02' }, { k: 'e', d: '2026-08-01' }],
      (r: Json) => r.d,
    );
    expect(landedRows(before, after, (r: Json) => r.k)).toEqual([
      { key: 'b', group: '2026-09' },
      { key: 'e', group: '2026-08' },
    ]);
    expect(monthSpanLabel(['2026-11'])).toBe('November 2026');
    expect(monthSpanLabel(['2026-11', '2026-09', '2026-09'])).toBe('September–November 2026');
    expect(monthSpanLabel(['2026-11', '2027-01'])).toBe('November 2026–January 2027');
    expect(monthSpanLabel([])).toBe('');
  });
});

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const pay = (id: number, day: string, cents: number, over: Json = {}): Json => ({
  id, kind: 'incoming', currency: 'EUR', fee_cents: 0, net_cents: 0, sender_email: '', reference: '', method: 'cash',
  client_id: null, on_invoice: false, on_issued_invoice: false, invoice: null, removed_at: null,
  transaction_id: `M-p${id}`, source: 'manual', entry: 'manual', paid_on: `${day}T00:00:00Z`, created_at: `${day}T10:00:00Z`,
  sender_name: `Payer ${id}`, note: `Job ${id}`, category: 'paid_work', gross_cents: cents, ...over,
});
const spend = (id: number, day: string, cents: number, over: Json = {}): Json => ({
  id, currency: 'EUR', client_id: null, reference: '', removed_at: null, transaction_id: `M-e${id}`, source: 'manual', entry: 'manual',
  paid_on: `${day}T00:00:00Z`, created_at: `${day}T11:00:00Z`, payee: `Shop ${id}`, note: `Paint ${id}`, category: 'materials and supplies',
  amount_cents: cents, ...over,
});

interface Fake {
  payments: Json[];
  expenses: Json[];
  clients?: Json[];
  invoices?: Json[];
}

// Three months: November (2 in, 1 out), October (1 in, 1 out), September (1 in).
const newFake = (): Fake => ({
  payments: [
    pay(1, '2026-09-12', 30000),
    pay(2, '2026-10-03', 45000),
    pay(3, '2026-11-04', 20000),
    pay(4, '2026-11-18', 96000),
  ],
  expenses: [spend(1, '2026-10-21', 4599), spend(2, '2026-11-09', 1250)],
});

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients ?? [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: fake.invoices ?? [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/book/selection' && method === 'GET') {
      return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', built_in: true }] });
    }
    if (path === '/invoicing/expense-categories' && method === 'GET') {
      return json(route, 200, { categories: [{ id: 1, name: 'materials and supplies', counts_as: 'materials and supplies', created_at: '2026-01-01T00:00:00Z' }] });
    }
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const expense = spend(100 + fake.expenses.length, body.paid_on, body.amount_cents, { ...body, paid_on: `${body.paid_on}T00:00:00Z`, created_at: '2026-11-20T12:00:00Z' });
      fake.expenses.push(expense);
      return json(route, 201, { expense });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

const ledgerGroups = (page: Page) => page.locator('[data-test="ledger-group"]');
const ledgerGroup = (page: Page, key: string) => page.locator(`[data-test="ledger-group"][data-group="${key}"]`);
const ledgerSummary = (page: Page, key: string) => ledgerGroup(page, key).locator('[data-test="ledger-group-summary"]');
const bookMonths = (page: Page) => page.locator('[data-test="book-month"]');
const bookMonth = (page: Page, key: string) => page.locator(`[data-test="book-month"][data-group="${key}"]`);
const states = (loc: ReturnType<typeof ledgerGroups>) =>
  loc.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-group')}:${(e as HTMLDetailsElement).open ? 'open' : 'folded'}`));
const ledgerRows = (page: Page) => page.locator('[data-test="payment-row"]:visible, [data-test="expense-row"]:visible');
const row = (page: Page, txn: string) => page.locator(`[data-txn="${txn}"]`);
const tick = (page: Page, txn: string) => row(page, txn).locator('[data-test="payment-select"]').getByRole('checkbox');
const selectAll = (page: Page) => page.locator('[data-test="select-all-shown"]');

test.describe('#10636 Transactions folds by month', () => {
  test('the newest month starts open, older months are folded, each with its count; rows run newest day first', async ({ page }) => {
    await open(page, newFake());
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:open', '2026-10:folded', '2026-09:folded']);
    await expect(ledgerSummary(page, '2026-11')).toHaveText('November 2026 · 3 transactions');
    await expect(ledgerSummary(page, '2026-10')).toHaveText('October 2026 · 2 transactions');
    await expect(ledgerSummary(page, '2026-09')).toHaveText('September 2026 · 1 transaction');
    await expect(ledgerRows(page)).toHaveCount(3);
    const txns = await ledgerRows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-txn')));
    expect(txns).toEqual(['M-p4', 'M-e2', 'M-p3']);
  });

  test('a filter opens every month it leaves, and clearing it brings back the folds from before', async ({ page }) => {
    await open(page, newFake());
    // Zir own choice first: October opened, November folded.
    await ledgerSummary(page, '2026-10').click();
    await ledgerSummary(page, '2026-11').click();
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:folded', '2026-10:open', '2026-09:folded']);

    const direction = page.locator('[data-test="direction-filter"]');
    await direction.getByRole('radio', { name: 'Out' }).click();
    await expect(ledgerGroups(page)).toHaveCount(2);
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:open', '2026-10:open']);
    await expect(ledgerSummary(page, '2026-11')).toHaveText('November 2026 · 1 transaction');
    await expect(ledgerRows(page)).toHaveCount(2);

    await direction.getByRole('radio', { name: 'All' }).click();
    await expect(ledgerGroups(page)).toHaveCount(3);
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:folded', '2026-10:open', '2026-09:folded']);
  });

  test('"Select all" counts only open months, and folding a month drops its ticks', async ({ page }) => {
    await open(page, newFake());
    await expect(selectAll(page)).toContainText('Select all 3 shown');
    await ledgerSummary(page, '2026-10').click();
    await expect(selectAll(page)).toContainText('Select all 5 shown');

    await tick(page, 'M-p2').check();
    await tick(page, 'M-p4').check();
    await ledgerSummary(page, '2026-10').click();
    await expect(ledgerGroup(page, '2026-10')).not.toHaveAttribute('open', '');
    await expect(selectAll(page)).toContainText('Select all 3 shown');
    // Reopening October does not bring its tick back; November's stays.
    await ledgerSummary(page, '2026-10').click();
    await expect(tick(page, 'M-p2')).not.toBeChecked();
    await expect(tick(page, 'M-p4')).toBeChecked();
  });

  test('an expense saved into an older month opens that month with the row in view; a month ze folded stays folded', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await ledgerSummary(page, '2026-11').click();
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:folded', '2026-10:folded', '2026-09:folded']);

    await openWaysIn(page);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-date"]').fill('2026-09-20');
    await page.locator('[data-test="expense-amount"]').fill('12,00');
    await page.getByRole('dialog', { name: 'Enter expense by hand' }).getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'materials and supplies' }).click();
    await page.locator('[data-test="expense-note"]').fill('Brushes');
    await page.locator('[data-test="expense-save"]').click();
    await expect(page.getByRole('dialog', { name: 'Enter expense by hand' })).toBeHidden();

    await expect(ledgerSummary(page, '2026-09')).toHaveText('September 2026 · 2 transactions');
    expect(await states(ledgerGroups(page))).toEqual(['2026-11:folded', '2026-10:folded', '2026-09:open']);
    await expect(ledgerGroup(page, '2026-09').locator('[data-test="expense-row"]', { hasText: 'Brushes' })).toBeInViewport();
  });

  test('a list with one month shows it open', async ({ page }) => {
    const fake = newFake();
    fake.payments = [pay(1, '2026-09-12', 30000)];
    fake.expenses = [];
    await open(page, fake);
    expect(await states(ledgerGroups(page))).toEqual(['2026-09:open']);
  });

  test('on desktop the columns line up from one month to the next', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'tables are the desktop layout; a phone shows cards');
    await open(page, newFake());
    await ledgerSummary(page, '2026-10').click();
    const edges = (key: string) =>
      ledgerGroup(page, key).locator('thead th').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
    const november = await edges('2026-11');
    // The row's door is the last column (§3.159 Decision 3, system_3 #11501).
    expect(november).toHaveLength(7);
    expect(new Set(november).size).toBe(7);
    expect(await edges('2026-10')).toEqual(november);
  });
});

test.describe('#10636 the Book folds by month', () => {
  async function openBook(page: Page, fake: Fake): Promise<void> {
    await open(page, fake);
    await page.getByRole('tab', { name: 'Book' }).click();
    await expect(bookMonths(page).first()).toBeVisible();
  }

  test('months run newest first, the newest open; a folded month still shows its In, Out and Result', async ({ page }) => {
    await openBook(page, newFake());
    expect(await states(bookMonths(page))).toEqual(['2026-11:open', '2026-10:folded', '2026-09:folded']);
    const october = bookMonth(page, '2026-10').locator('[data-test="month-head"]');
    await expect(october).toBeVisible();
    await expect(october).toContainText('October 2026');
    await expect(october).toContainText('In €450.00');
    await expect(october).toContainText('Out €45.99');
    await expect(october).toContainText('Result €404.01');
    await expect(bookMonth(page, '2026-10').locator('[data-test="book-row"]:visible')).toHaveCount(0);
    // Newest day first within the open month.
    const days = await bookMonth(page, '2026-11').locator('[data-test="book-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-key')));
    expect(days).toEqual(['p4', 'e2', 'p3']);
  });

  test('a month ze opens shows its rows, and the month line is the control', async ({ page }) => {
    await openBook(page, newFake());
    await bookMonth(page, '2026-09').locator('[data-test="month-head"]').click();
    expect(await states(bookMonths(page))).toEqual(['2026-11:open', '2026-10:folded', '2026-09:open']);
    await expect(bookMonth(page, '2026-09').locator('[data-test="book-row"]:visible')).toHaveCount(1);
  });

  test('a Book with one month shows it open', async ({ page }) => {
    const fake = newFake();
    fake.payments = [pay(1, '2026-09-12', 30000)];
    fake.expenses = [];
    await openBook(page, fake);
    expect(await states(bookMonths(page))).toEqual(['2026-09:open']);
  });

  test('on desktop the columns line up from one month to the next', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'tables are the desktop layout; a phone shows cards');
    await openBook(page, newFake());
    await bookMonth(page, '2026-10').locator('[data-test="month-head"]').click();
    const edges = (key: string) =>
      bookMonth(page, key).locator('thead th').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10));
    const november = await edges('2026-11');
    // The row's door is the last column (§3.159 Decision 3, system_3 #11501),
    // and Invoice sits between Category and In (system_3 #11509).
    expect(november).toHaveLength(7);
    expect(new Set(november).size).toBe(7);
    expect(await edges('2026-10')).toEqual(november);
  });
});

// system_3 #12277: a group's table caption repeated the fold head right above
// it. Ruling 1: kept for a screen reader, not drawn, on all four tabs.
// Ruling 2: a Transactions head names its noun. Ruling 3: the Book's month
// head takes the size and weight of the other three, with no line under it,
// and stays an h3. The tables are the desktop layout; a phone draws cards.
test.describe('#12277 a group says once which group it is', () => {
  test.skip(({ isMobile }) => isMobile, 'the tables are the desktop layout');

  const client = (id: number, name: string): Json => ({ id, name, address: 'Weg 1', email: '', paypal_email: '', notes: '' });
  const NAMES = ['Anna Muster', 'Bea Probe', 'Carl Beispiel', 'Dora Test', 'Emil Platzhalter', 'Frida Exempel', 'Gerd Testsson', 'Hanna Muster', 'Ida Probe', 'Jan Beispiel', 'Kai Test'];
  const invoice = (id: number, status: string, number: string | null, issued: string | null): Json => ({
    id, status, client_id: 1, client_name: 'Galerie Nord', invoice_number: number,
    issue_date: issued ? `${issued}T00:00:00Z` : null,
    // Work done in November: the tab opens on that month's work.
    service_date_from: '2026-11-01T00:00:00Z', service_date_to: '2026-11-01T00:00:00Z',
    vat_rate_bp: 1900, total_cents: 1000 * id, currency: 'EUR',
  });
  const fullFake = (clients = 11): Fake => ({
    ...newFake(),
    clients: NAMES.slice(0, clients).map((n, i) => client(i + 1, n)),
    invoices: [invoice(1, 'draft', null, null), invoice(2, 'issued', '2026-001', '2026-11-03'), invoice(3, 'issued', '2026-002', '2026-11-10')],
  });

  // The caption is the table's name to a screen reader, and has no box: it
  // is clipped to a point and the column heads start at the table's top edge.
  async function captionIsNotDrawn(group: ReturnType<Page['locator']>, name: string): Promise<void> {
    const table = group.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table).toHaveAccessibleName(name);
    const box = await table.evaluate((t) => {
      const c = (t as HTMLTableElement).caption!.getBoundingClientRect();
      const head = t.querySelector('thead')!.getBoundingClientRect();
      return { w: c.width, h: c.height, gap: head.top - t.getBoundingClientRect().top };
    });
    expect(box.w, 'caption width').toBeLessThanOrEqual(1);
    expect(box.h, 'caption height').toBeLessThanOrEqual(1);
    expect(Math.abs(box.gap), 'column heads at the table top').toBeLessThan(1);
  }

  async function openFold(group: ReturnType<Page['locator']>, summary: string): Promise<void> {
    if (!(await group.evaluate((d) => (d as HTMLDetailsElement).open))) await group.locator(summary).click();
  }

  test('Transactions: the head counts transactions, and the caption is not drawn', async ({ page }) => {
    await open(page, fullFake());
    await expect(ledgerSummary(page, '2026-11')).toHaveText('November 2026 · 3 transactions');
    await expect(ledgerSummary(page, '2026-09')).toHaveText('September 2026 · 1 transaction');
    await captionIsNotDrawn(ledgerGroup(page, '2026-11'), 'Money in and out: November 2026');
  });

  test('Invoices: a month and Drafts keep their heads, and neither caption is drawn', async ({ page }) => {
    await open(page, fullFake());
    await page.getByRole('tab', { name: 'Invoices' }).click();
    const month = page.locator('[data-test="invoice-group"][data-group="2026-11"]');
    await expect(month.locator('[data-test="invoice-group-summary"]')).toHaveText('November 2026 · 2 invoices');
    await openFold(month, '[data-test="invoice-group-summary"]');
    await captionIsNotDrawn(month, 'Invoices: November 2026');
    const drafts = page.locator('[data-test="invoice-group"][data-group="drafts"]');
    await expect(drafts.locator('[data-test="invoice-group-summary"]')).toHaveText('Drafts · 1');
    await openFold(drafts, '[data-test="invoice-group-summary"]');
    await captionIsNotDrawn(drafts, 'Invoices: Drafts');
  });

  test('Clients: a letter\'s head counts its clients, and its caption is not drawn', async ({ page }) => {
    await open(page, fullFake(11));
    await page.getByRole('tab', { name: 'Clients' }).click();
    const letter = page.locator('[data-test="client-group"][data-letter="A"]');
    await expect(letter.locator('[data-test="client-group-summary"]')).toHaveText('A · 1 client');
    await openFold(letter, '[data-test="client-group-summary"]');
    await captionIsNotDrawn(letter, 'Clients: A');
  });

  test('Clients: a book of 10 or fewer does not fold, and its "Clients" caption is not drawn', async ({ page }) => {
    await open(page, fullFake(3));
    await page.getByRole('tab', { name: 'Clients' }).click();
    await captionIsNotDrawn(page.locator('[data-test="client-list"]'), 'Clients');
  });

  test('Book: the month head is an h3 at the other heads\' size and weight, with no line under it; the caption is not drawn', async ({ page }) => {
    await open(page, fullFake());
    const ref = await ledgerSummary(page, '2026-11').evaluate((e) => {
      const cs = getComputedStyle(e);
      return { size: cs.fontSize, weight: cs.fontWeight };
    });
    await page.getByRole('tab', { name: 'Book' }).click();
    const november = bookMonth(page, '2026-11');
    await expect(november.getByRole('heading', { level: 3, name: 'November 2026' })).toBeVisible();
    const head = await november.locator('[data-test="month-head"]').evaluate((e) => {
      const label = getComputedStyle(e.querySelector('h3')!);
      return { size: label.fontSize, weight: label.fontWeight, rule: getComputedStyle(e).borderBottomWidth };
    });
    expect(head).toEqual({ size: ref.size, weight: ref.weight, rule: '0px' });
    await captionIsNotDrawn(november, 'Book entries for November 2026');
  });
});
