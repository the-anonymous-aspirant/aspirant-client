import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, Transactions (system_3 #10627, design §3.143 Decisions 1
 *  and 2): four tabs, each with one job; Transactions takes Payments' place
 *  and its component; the page lead names both directions; and the head row
 *  holds the four ways in, in order, "Enter expense by hand" moved here from
 *  the Book. Every call is answered by an in-memory fake; a catch-all
 *  /api/ → 404 is registered FIRST so nothing reaches the live server. */

type Json = Record<string, any>;

const CATEGORIES = ['materials and supplies', 'travel', 'other'];

interface Fake {
  payments: Json[];
  expenses: Json[];
  categories: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
}

const newFake = (over: Partial<Fake> = {}): Fake => ({
  payments: [],
  expenses: [],
  categories: CATEGORIES.map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })),
  requests: [],
  ...over,
});

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
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: fake.categories });
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const expense = {
        id: 100 + fake.expenses.length, source: 'manual', entry: 'manual', transaction_id: `M-e${fake.expenses.length}`,
        currency: 'EUR', client_id: null, ...body, paid_on: `${body.paid_on}T00:00:00Z`,
      };
      fake.expenses.push(expense);
      return json(route, 201, { expense });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

const WAYS_IN = [
  ['manual-new', 'Enter payment by hand'],
  ['expense-new', 'Enter expense by hand'],
  ['payments-import', 'Import PayPal file'],
  ['n26-import', 'Import N26 files'],
] as const;

test.describe('#10627 Invoices app: Transactions, its lead and four ways in', () => {
  test('the tabs are Transactions, Invoices, Book, Clients, and Transactions opens first', async ({ page }) => {
    await open(page, newFake());
    await expect(page.getByRole('tab')).toHaveText(['Transactions', 'Invoices', 'Book', 'Clients']);
    await expect(page.getByRole('tab', { name: 'Transactions' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Transactions', level: 2 })).toBeAttached();
  });

  test('the page lead names money in and out, every source, and the invoices', async ({ page }) => {
    await open(page, newFake());
    await expect(page.locator('.page-subtitle')).toHaveText(
      'Record money in and out from PayPal, N26 or by hand, mark what was for your work, and issue invoices for it.',
    );
  });

  test('the head row holds the four ways in, in order, all secondary', async ({ page }) => {
    await open(page, newFake());
    const buttons = page.locator('.ways-in button');
    await expect(buttons).toHaveText(WAYS_IN.map(([, label]) => label));
    const ids = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('data-test')));
    expect(ids).toEqual(WAYS_IN.map(([id]) => id));
    for (const [id] of WAYS_IN) await expect(page.locator(`[data-test="${id}"]`)).toHaveClass(/btn--secondary/);
    // Reading order matches DOM order: left to right on one row, top to
    // bottom when stacked.
    const boxes = await Promise.all(WAYS_IN.map(([id]) => page.locator(`[data-test="${id}"]`).boundingBox()));
    for (let i = 1; i < boxes.length; i++) {
      const [a, b] = [boxes[i - 1]!, boxes[i]!];
      const sameRow = Math.round(a.y) === Math.round(b.y);
      if (sameRow) expect(a.x, `${WAYS_IN[i - 1][1]} left of ${WAYS_IN[i][1]}`).toBeLessThan(b.x);
      else expect(a.y, `${WAYS_IN[i - 1][1]} above ${WAYS_IN[i][1]}`).toBeLessThan(b.y);
    }
  });

  test('each way in opens its dialog', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);

    await page.locator('[data-test="manual-new"]').click();
    const payment = page.getByRole('dialog', { name: 'Enter payment by hand' });
    await expect(payment).toBeVisible();
    await payment.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(payment).toBeHidden();

    // Categories load when the expense dialog opens, not with the panel.
    expect(fake.requests.some((r) => r.path === '/invoicing/expense-categories')).toBe(false);
    await page.locator('[data-test="expense-new"]').click();
    const expense = page.getByRole('dialog', { name: 'Enter expense by hand' });
    await expect(expense).toBeVisible();
    await expense.getByRole('combobox', { name: 'Category' }).click();
    await expect(page.getByRole('option')).toHaveText(CATEGORIES);
    await page.getByRole('option', { name: 'travel' }).click();
    await expense.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(expense).toBeHidden();

    // The imports open the system file dialog, on their own inputs: PayPal
    // takes one CSV or Excel file, N26 several CSVs or PDFs.
    const [paypal] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test="payments-import"]').click()]);
    expect(await paypal.element().getAttribute('data-test')).toBe('payments-file');
    expect(paypal.isMultiple()).toBe(false);
    const [n26] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-test="n26-import"]').click()]);
    expect(await n26.element().getAttribute('data-test')).toBe('n26-file-input');
    expect(n26.isMultiple()).toBe(true);
  });

  test('an expense entered on Transactions is confirmed there and lands in the Book', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="expense-new"]').click();
    await page.locator('[data-test="expense-date"]').fill('2026-07-20');
    await page.locator('[data-test="expense-amount"]').fill('45,99');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'materials and supplies' }).click();
    await page.locator('[data-test="expense-note"]').fill('Guitar strings');
    await page.locator('[data-test="expense-save"]').click();

    await expect(page.getByRole('dialog', { name: 'Enter expense by hand' })).toBeHidden();
    await expect(page.locator('[data-test="manual-summary-expense"]')).toHaveText('By hand: 1 expense added to your book.');
    await page.getByRole('tab', { name: 'Book' }).click();
    await expect(page.locator('[data-test="book-row"]')).toContainText('Guitar strings');
  });

  test('the Book no longer offers "Enter expense by hand"', async ({ page }) => {
    await open(page, newFake());
    await page.getByRole('tab', { name: 'Book' }).click();
    await expect(page.locator('[data-test="book-panel"]')).toBeVisible();
    await expect(page.locator('[data-test="book-panel"] [data-test="expense-new"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enter expense by hand' })).toHaveCount(0);
  });

  // design_agent c66159 (refining c61923 for four, §3.135 Decisions 1-2):
  // the ways in are one row of four, a 2×2 of equal columns (by hand, then
  // from a file), or four stacked full width; never 3+1 or 2+1+1. Keyed on
  // the row's width, so it is swept. Resizing leaves the sidebar in whatever
  // state the last width put it, so 641 and 768 in their default sidebar
  // state are pinned to the 2×2 on a fresh load in invoicing-n26.spec.ts.
  test('the head row is one row, a 2×2 or four stacked, never a partial row', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1100, height: 900 });
    await open(page, newFake());
    const sweep = [641];
    for (let w = 360; w <= 1100; w += 4) sweep.push(w);
    const seen = new Set<string>();
    for (const w of sweep) {
      await page.setViewportSize({ width: w, height: 900 });
      const m = await page.evaluate((ids) => {
        const row = document.querySelector('.ways-in') as HTMLElement;
        const bs = ids.map((id) => document.querySelector(`[data-test="${id}"]`) as HTMLElement);
        const rects = bs.map((b) => b.getBoundingClientRect());
        const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
        const lineHeight = (b: HTMLElement) => parseFloat(getComputedStyle(b).lineHeight) || 0;
        return {
          perRow: tops.map((t) => rects.filter((r) => Math.round(r.top) === t).length),
          rowWidth: Math.round(row.getBoundingClientRect().width),
          widths: rects.map((r) => Math.round(r.width)),
          lefts: rects.map((r) => Math.round(r.left)),
          overflow: bs.map((b) => b.scrollWidth - b.clientWidth),
          rowGap: getComputedStyle(row).rowGap,
          columnGap: getComputedStyle(row).columnGap,
          oneLine: bs.every((b) => { const span = b.querySelector('span') || b; return span.getBoundingClientRect().height < 2 * lineHeight(b); }),
        };
      }, WAYS_IN.map(([id]) => id));
      const shape = m.perRow.join('+');
      seen.add(shape);
      if (w === 641 || w === 768) console.log(`ways-in @${w}: ${JSON.stringify(m)}`);
      expect(['4', '2+2', '1+1+1+1'], `layout at ${w}px`).toContain(shape);
      expect(m.oneLine, `a label wraps at ${w}px`).toBe(true);
      for (const o of m.overflow) expect(o, `a label is clipped at ${w}px`).toBeLessThanOrEqual(0);
      if (shape === '2+2') {
        expect(Math.abs(m.widths[0] - m.widths[1]), `equal columns at ${w}px`).toBeLessThanOrEqual(1);
        expect(m.lefts[0], `columns align at ${w}px`).toBe(m.lefts[2]);
        expect(m.lefts[1], `columns align at ${w}px`).toBe(m.lefts[3]);
      }
      // c66182: the stack takes an 8px gap; one row and the 2×2 keep 12px.
      if (shape === '1+1+1+1') expect(m.rowGap, `stacked gap at ${w}px`).toBe('8px');
      else expect([m.rowGap, m.columnGap], `gap at ${w}px`).toEqual(['12px', '12px']);
      if (shape === '1+1+1+1') for (const bw of m.widths) expect(Math.abs(bw - m.rowWidth), `stacked full width at ${w}px`).toBeLessThanOrEqual(1);
    }
    // The sweep reached all three states, so none of the asserts above is vacuous.
    expect([...seen].sort()).toEqual(['1+1+1+1', '2+2', '4']);
  });
});

/** #10630 (design §3.143 Decision 3): one list of money in and out, newest
 *  first, in one row format, with the source on the date line, a §3.114
 *  phone card, and a direction filter whose category options follow it.
 *  Invented records only. */

const pay = (over: Json): Json => ({
  kind: 'incoming', currency: 'EUR', fee_cents: 0, net_cents: 0, sender_email: '', reference: '', method: '',
  client_id: null, on_invoice: false, on_issued_invoice: false, invoice: null, removed_at: null, ...over,
});

const spend = (over: Json): Json => ({ currency: 'EUR', client_id: null, reference: '', payee: '', removed_at: null, ...over });

const mixedFake = () =>
  newFake({
    payments: [
      // Out of order on purpose: the list sorts, not the server.
      pay({
        id: 3, transaction_id: 'M-p3', source: 'manual', entry: 'manual', method: 'cash', paid_on: '2026-09-20T00:00:00Z',
        created_at: '2026-09-20T10:00:00Z', sender_name: 'Oma Esempio', note: 'Birthday', category: 'gift', gross_cents: 5000,
        // Only a cancelled invoice lists it: the server names none.
        on_invoice: true,
      }),
      pay({
        id: 1, transaction_id: 'N26-P1', source: 'n26', entry: 'import', paid_on: '2026-10-14T00:00:00Z',
        created_at: '2026-10-15T09:00:00Z', sender_name: 'Galerie Nord', note: 'Mural, October', category: 'paid_work', client_id: 1,
        gross_cents: 120000, on_invoice: true, on_issued_invoice: true, invoice: { id: 7, status: 'issued', invoice_number: '2026-014' },
      }),
      pay({
        id: 2, transaction_id: 'PP-P2', source: 'paypal', entry: 'import', paid_on: '2026-10-03T00:00:00Z',
        created_at: '2026-10-04T09:00:00Z', sender_name: 'Mara Esempio', sender_email: 'mara@example.test', note: 'Portrait',
        category: 'paid_work', client_id: 1, gross_cents: 45000, on_invoice: true, invoice: { id: 12, status: 'draft', invoice_number: null },
      }),
      // "Other" is an income category and an expense category: the filter
      // must keep them apart (design_agent c66290).
      pay({
        id: 4, transaction_id: 'PP-P4', source: 'paypal', entry: 'import', paid_on: '2026-08-10T00:00:00Z',
        created_at: '2026-08-11T09:00:00Z', sender_name: 'Kiosk Esempio', note: 'Refund of a deposit', category: 'other', gross_cents: 2000,
      }),
    ],
    expenses: [
      spend({
        id: 102, transaction_id: 'M-e2', source: 'manual', entry: 'manual', paid_on: '2026-09-28T00:00:00Z',
        created_at: '2026-09-28T18:00:00Z', payee: 'Deutsche Bahn', note: 'Train to Leipzig', category: 'travel', amount_cents: 8900,
      }),
      // Same day as N26-P1, entered later, so it comes first.
      spend({
        id: 101, transaction_id: 'N26-E1', source: 'n26', entry: 'import', paid_on: '2026-10-14T00:00:00Z',
        created_at: '2026-10-16T08:00:00Z', reference: 'Colorificio Esempio', note: 'Pagamento con carta',
        category: 'materials and supplies', amount_cents: 3499,
      }),
      spend({
        id: 103, transaction_id: 'N26-E3', source: 'n26', entry: 'import', paid_on: '2026-08-05T00:00:00Z',
        created_at: '2026-08-06T08:00:00Z', reference: 'Copyshop Esempio', note: 'Prints', category: 'other', amount_cents: 1250,
      }),
    ],
  });

const ROWS = '[data-test="payment-row"], [data-test="expense-row"]';
const NEWEST_FIRST = ['N26-E1', 'N26-P1', 'PP-P2', 'M-e2', 'M-p3', 'PP-P4', 'N26-E3'];

const txns = (page: Page) => page.locator(ROWS).evaluateAll((els) => els.map((el) => el.getAttribute('data-txn')));
const row = (page: Page, txn: string) => page.locator(`${ROWS}`).and(page.locator(`[data-txn="${txn}"]`));

async function categoryOptions(page: Page): Promise<string[]> {
  await page.locator('[data-test="category-filter"]').click();
  const labels = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  return labels.map((l) => l.trim());
}

async function pickCategory(page: Page, name: string): Promise<void> {
  await page.locator('[data-test="category-filter"]').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test.describe('#10630 Transactions: one list of money in and out', () => {
  test('both directions in one list, newest first, the same day ordered by entry', async ({ page }) => {
    await open(page, mixedFake());
    await expect.poll(() => txns(page)).toEqual(NEWEST_FIRST);
    const directions = await page.locator(ROWS).evaluateAll((els) => els.map((el) => el.getAttribute('data-direction')));
    expect(directions).toEqual(['out', 'in', 'in', 'out', 'in', 'in', 'out']);
  });

  test('each row reads who, what it was for, category, client and invoice, and the signed amount', async ({ page }) => {
    await open(page, mixedFake());
    const expect1 = async (txn: string, who: string, what: string | null, amount: string) => {
      const r = row(page, txn);
      await expect(r.locator('[data-test="row-who"]')).toHaveText(who);
      if (what === null) await expect(r.locator('[data-test="row-what"]')).toHaveCount(0);
      else await expect(r.locator('[data-test="row-what"]')).toHaveText(what);
      await expect(r.locator('[data-test="row-amount"]')).toHaveText(amount);
    };
    await expect1('N26-P1', 'Galerie Nord', 'Mural, October', '€1,200.00');
    await expect1('PP-P2', 'Mara Esempio', 'Portrait', '€450.00');
    await expect1('M-p3', 'Oma Esempio', 'Birthday', '€50.00');
    // §3.140 Decision 3: an import's payee is its reference; a hand entry's
    // is "Paid to" (the payee field), never its free-text reference.
    await expect1('N26-E1', 'Colorificio Esempio', 'Pagamento con carta', '-€34.99');
    await expect1('M-e2', 'Deutsche Bahn', 'Train to Leipzig', '-€89.00');

    // Money in names its invoice: issued by number, a draft as Draft, and
    // nothing when only a cancelled invoice lists it.
    await expect(row(page, 'N26-P1').locator('[data-test="row-invoice"]')).toHaveText('Invoice 2026-014');
    await expect(row(page, 'PP-P2').locator('[data-test="row-invoice"]')).toHaveText('Draft');
    await expect(row(page, 'M-p3').locator('[data-test="row-invoice"]')).toHaveCount(0);
    await expect(row(page, 'N26-P1').locator('[data-test="payment-client"]')).toContainText('Galerie Nord');
    await expect(row(page, 'N26-P1').locator('[data-test="payment-category"]')).toContainText('Paid work');
    // Money out has its category, and no client or invoice.
    await expect(row(page, 'N26-E1').locator('[data-test="row-category"]')).toHaveText('materials and supplies');
    await expect(row(page, 'N26-E1').locator('[data-test="payment-client"], [data-test="row-invoice"]')).toHaveCount(0);

    // §3.140 Decision 2: in in body ink, out in the error text red.
    const ink = (sel: string, token: string) =>
      page.locator(sel).first().evaluate((el, t) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${t})`;
        el.parentElement!.appendChild(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return { got: getComputedStyle(el).color, want };
      }, token);
    const inInk = await ink('[data-txn="N26-P1"] [data-test="row-amount"]', '--text-body');
    expect(inInk.got).toBe(inInk.want);
    const outInk = await ink('[data-txn="N26-E1"] [data-test="row-amount"]', '--feedback-error-text');
    expect(outInk.got).toBe(outInk.want);
    expect(outInk.got).not.toBe(inInk.got);
  });

  test('the source sits on the muted date line', async ({ page }) => {
    await open(page, mixedFake());
    const sources = await page.locator(`${ROWS} [data-test="row-source"]`).allTextContents();
    expect(sources.map((s) => s.trim())).toEqual(['N26', 'N26', 'PayPal', 'By hand', 'By hand', 'PayPal', 'N26']);
    const muted = await page.locator('[data-txn="N26-E1"] [data-test="row-source"]').evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--text-muted)';
      document.body.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return getComputedStyle(el).color === want;
    });
    expect(muted, 'the source is in muted ink').toBe(true);
  });

  test('the filter is All · In · Out, and the category options follow the direction', async ({ page }) => {
    await open(page, mixedFake());
    const direction = page.locator('[data-test="direction-filter"]');
    await expect(direction.getByRole('radio')).toHaveText(['All', 'In', 'Out']);
    await expect(direction.getByRole('radio', { name: 'All' })).toBeChecked();

    // Both directions (design_agent c66290): each option names its
    // direction in the filter's own words, income first, and no two labels
    // are the same, though "Other" is a category on both sides.
    const both = await categoryOptions(page);
    expect(both).toEqual([
      'All categories', 'In · Uncategorised', 'In · Paid work', 'In · Gift', 'In · Loan', 'In · Refund', 'In · Other',
      'Out · materials and supplies', 'Out · other', 'Out · travel',
    ]);
    expect(new Set(both).size, 'no duplicate labels under All').toBe(both.length);
    await pickCategory(page, 'Out · other');
    await expect.poll(() => txns(page)).toEqual(['N26-E3']);
    await pickCategory(page, 'In · Other');
    await expect.poll(() => txns(page)).toEqual(['PP-P4']);
    await pickCategory(page, 'All categories');

    // Under In or Out the labels are bare: the direction is already chosen.
    await direction.getByRole('radio', { name: 'Out' }).click();
    await expect.poll(() => txns(page)).toEqual(['N26-E1', 'M-e2', 'N26-E3']);
    expect(await categoryOptions(page)).toEqual(['All categories', 'materials and supplies', 'other', 'travel']);
    await pickCategory(page, 'travel');
    await expect.poll(() => txns(page)).toEqual(['M-e2']);

    // In does not offer travel, so the category falls back to all.
    await direction.getByRole('radio', { name: 'In' }).click();
    await expect.poll(() => txns(page)).toEqual(['N26-P1', 'PP-P2', 'M-p3', 'PP-P4']);
    await expect(page.locator('[data-test="category-filter"]')).toContainText('All categories');
    expect(await categoryOptions(page)).toEqual(['All categories', 'Uncategorised', 'Paid work', 'Gift', 'Loan', 'Refund', 'Other']);
    await pickCategory(page, 'Gift');
    await expect.poll(() => txns(page)).toEqual(['M-p3']);

    // All keeps a category it offers, now named with its direction.
    await direction.getByRole('radio', { name: 'All' }).click();
    await expect.poll(() => txns(page)).toEqual(['M-p3']);
    await expect(page.locator('[data-test="category-filter"]')).toContainText('In · Gift');
    await pickCategory(page, 'All categories');
    await expect.poll(() => txns(page)).toEqual(NEWEST_FIRST);
  });

  test('an expense has no checkbox yet; Select all counts the payments it can act on', async ({ page }) => {
    await open(page, mixedFake());
    await expect(row(page, 'N26-E1').locator('[data-test="payment-select"]')).toHaveCount(0);
    await expect(row(page, 'N26-E1').locator('[data-test="payment-select-gutter"]')).toHaveCount(1);
    // PP-P2, M-p3 and PP-P4: N26-P1 is on an issued invoice.
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 640) await expect(page.locator('[data-test="select-all-shown"]')).toContainText('Select all 3 shown');
    await page.locator('[data-test="select-all-shown"]').getByRole('checkbox').check();
    await expect(page.locator('[data-test="bulk-category"]')).toContainText('Set category of 3 selected');
  });

  // §3.114 card, in §3.143 Decision 3's order: the checkbox first, who
  // top-left, the amount top-right, then the date and source muted, then
  // what it was for, then the controls.
  test('on a phone each row is a card: checkbox, who and amount, date and source, what, controls', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 640, 'phone layout only');
    await open(page, mixedFake());
    await expect(page.locator('.payment-card')).toHaveCount(7);
    for (const txn of ['PP-P2', 'N26-E1']) {
      const card = page.locator(`.payment-card[data-txn="${txn}"]`);
      const box = async (sel: string) => (await card.locator(sel).first().boundingBox())!;
      const cardBox = (await card.boundingBox())!;
      const check = await box(txn === 'PP-P2' ? '[data-test="payment-select"]' : '[data-test="payment-select-gutter"]');
      const who = await box('[data-test="row-who"]');
      const amount = await box('[data-test="row-amount"]');
      const dateLine = await box('[data-test="row-date-line"]');
      const what = await box('[data-test="row-what"]');
      const control = await box(txn === 'PP-P2' ? '[data-test="payment-category"]' : '[data-test="row-category"]');
      expect(check.x, `${txn}: checkbox first`).toBeLessThan(who.x);
      expect(Math.abs(check.y + check.height / 2 - (who.y + who.height / 2)), `${txn}: checkbox beside who`).toBeLessThan(8);
      expect(amount.x + amount.width, `${txn}: amount at the right edge`).toBeGreaterThan(cardBox.x + cardBox.width - 40);
      expect(Math.abs(amount.y + amount.height / 2 - (who.y + who.height / 2)), `${txn}: amount on who's line`).toBeLessThan(8);
      expect(dateLine.y, `${txn}: date line under who`).toBeGreaterThanOrEqual(who.y + who.height - 1);
      expect(what.y, `${txn}: what under the date line`).toBeGreaterThanOrEqual(dateLine.y + dateLine.height - 1);
      expect(control.y, `${txn}: controls under what`).toBeGreaterThanOrEqual(what.y + what.height - 1);
    }
    await expect(page.locator('.payment-card[data-txn="N26-E1"] [data-test="row-date-line"]')).toHaveText('2026-10-14 · N26');
    await expect(page.locator('.payment-card[data-txn="M-e2"] [data-test="row-date-line"]')).toHaveText('2026-09-28 · By hand');
    // No sideways scroll at 390.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
