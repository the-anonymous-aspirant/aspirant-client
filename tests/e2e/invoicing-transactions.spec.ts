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
  // A table whose bulk remove the server refuses, with the error it sends.
  refuseRemove?: Record<string, Json>;
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
    // The lists leave removed rows out, as the server does (#10555-A2).
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments.filter((p) => !p.removed_at) });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses.filter((e) => !e.removed_at) });
    // What the Book counts (system_3 #10635): the starting selection, Work only.
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    // Bulk remove, all or nothing per table (aspirant-server invoicing_remove.go).
    const remove = path.match(/^\/invoicing\/(payments|expenses)\/remove$/);
    if (remove && method === 'POST') {
      const table = remove[1];
      const refusal = fake.refuseRemove && fake.refuseRemove[table];
      if (refusal) return json(route, 409, { error: refusal });
      const { ids } = JSON.parse(req.postData() || '{}');
      for (const r of table === 'payments' ? fake.payments : fake.expenses) if (ids.includes(r.id)) r.removed_at = '2026-11-12T22:00:00Z';
      return json(route, 200, { action: 'remove', ids });
    }
    const patch = path.match(/^\/invoicing\/(payments|expenses)\/(\d+)$/);
    if (patch && method === 'PATCH') {
      const list = patch[1] === 'payments' ? fake.payments : fake.expenses;
      const record = list.find((r) => r.id === Number(patch[2]));
      if (!record) return json(route, 404, { error: { code: 'not_found', message: 'not found' } });
      Object.assign(record, JSON.parse(req.postData() || '{}'));
      return json(route, 200, patch[1] === 'payments' ? { payment: record } : { expense: record });
    }
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
      // Measure only once layout has settled (system_3 #10670). WebKit can
      // report a button still laid out for the previous container-query
      // state on the first frame after a large jump, e.g. 641 -> 360, which
      // read as a 74px-narrow stacked button. Each read waits two frames
      // inside the same evaluate (one round-trip per width keeps the sweep
      // inside its timeout on mobile-safari), and a read that breaks a rule
      // is taken once more before it is asserted.
      const measure = () => page.evaluate(async (ids) => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
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
      const valid = (r: Awaited<ReturnType<typeof measure>>) => {
        const sh = r.perRow.join('+');
        if (!['4', '2+2', '1+1+1+1'].includes(sh) || !r.oneLine || r.overflow.some((o) => o > 0)) return false;
        if (sh === '2+2' && (Math.abs(r.widths[0] - r.widths[1]) > 1 || r.lefts[0] !== r.lefts[2] || r.lefts[1] !== r.lefts[3])) return false;
        if (sh === '1+1+1+1' && r.widths.some((bw) => Math.abs(bw - r.rowWidth) > 1)) return false;
        return true;
      };
      let m = await measure();
      if (!valid(m)) m = await measure();
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

async function pickCategory(page: Page, name: string, group?: string): Promise<void> {
  await page.locator('[data-test="category-filter"]').click();
  const scope = group ? page.getByRole('group', { name: group, exact: true }) : page;
  await scope.getByRole('option', { name, exact: true }).click();
}

// Under All the open filter is "All categories" on its own, then a group per
// direction: [plain options, [group label, its options]...].
async function categoryGroups(page: Page): Promise<{ plain: string[]; groups: [string, string[]][] }> {
  await page.locator('[data-test="category-filter"]').click();
  const listbox = page.getByRole('listbox');
  const plain = await listbox.evaluate((lb) =>
    [...lb.querySelectorAll('[role="option"]')]
      .filter((o) => !o.closest('[role="group"]'))
      .map((o) => (o.textContent || '').trim()),
  );
  const groups: [string, string[]][] = [];
  for (const g of await listbox.getByRole('group').all()) {
    const name = await g.evaluate((el) => {
      const id = el.getAttribute('aria-labelledby');
      return ((id && document.getElementById(id)?.textContent) || '').trim();
    });
    groups.push([name, (await g.getByRole('option').allTextContents()).map((l) => l.trim())]);
  }
  await page.keyboard.press('Escape');
  return { plain, groups };
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
    const sources = await page.locator(ROWS).locator('[data-test="row-source"]').allTextContents();
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

    // Both directions (design_agent c66290, c66693 on system_3 #10702): "All
    // categories" on its own, then two groups, In and Out, income first. The
    // group names the direction, so no label carries an "In · " or "Out · "
    // prefix, and no group repeats a label, though "Other" is a category on
    // both sides.
    const both = await categoryGroups(page);
    expect(both.plain, '"All categories" sits in no group').toEqual(['All categories']);
    expect(both.groups).toEqual([
      ['In', ['Uncategorised', 'Paid work', 'Gift', 'Loan', 'Refund', 'Other']],
      ['Out', ['materials and supplies', 'other', 'travel']],
    ]);
    const labels = both.groups.flatMap(([, options]) => options);
    expect(labels.filter((l) => /^(In|Out) · /.test(l)), 'no prefixed labels').toEqual([]);
    for (const [name, options] of both.groups) {
      expect(new Set(options).size, `no duplicate labels in ${name}`).toBe(options.length);
    }
    await pickCategory(page, 'other', 'Out');
    await expect.poll(() => txns(page)).toEqual(['N26-E3']);
    expect(await page.locator(ROWS).evaluateAll((els) => els.map((el) => el.getAttribute('data-direction'))), 'Out\'s other is expenses only').toEqual(['out']);
    await expect(page.locator('[data-test="category-filter"]')).toContainText('Out · other');
    await pickCategory(page, 'Other', 'In');
    await expect.poll(() => txns(page)).toEqual(['PP-P4']);
    await pickCategory(page, 'All categories');
    await expect.poll(() => txns(page), 'All categories brings back every row').toEqual(NEWEST_FIRST);
    await expect(page.locator('[data-test="category-filter"]')).toHaveText(/^\s*All categories/);

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

    // All keeps a category it offers; the trigger names its group.
    await direction.getByRole('radio', { name: 'All' }).click();
    await expect.poll(() => txns(page)).toEqual(['M-p3']);
    await expect(page.locator('[data-test="category-filter"]')).toContainText('In · Gift');
    await pickCategory(page, 'All categories');
    await expect.poll(() => txns(page)).toEqual(NEWEST_FIRST);
  });

  // §3.149 Decision 2 (design_agent c67094 on system_3 #10750): the filter is
  // searchable while it lists her own expense categories, and plain under In,
  // where it holds only the six fixed income labels.
  test('the category filter is searchable unless the direction is In', async ({ page }) => {
    await open(page, mixedFake());
    const direction = page.locator('[data-test="direction-filter"]');
    const filter = page.locator('[data-test="category-filter"]');
    await filter.click();
    await expect(page.locator('.select__search-input:visible')).toHaveCount(1);
    await page.locator('.select__search-input:visible').fill('trav');
    await expect(page.getByRole('option')).toHaveText(['travel']);
    await page.keyboard.press('Escape');
    await direction.getByRole('radio', { name: 'In' }).click();
    await filter.click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await expect(page.locator('.select__search-input:visible')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('an expense has a checkbox; Select all counts every row but the issued invoice\'s payment', async ({ page }) => {
    await open(page, mixedFake());
    await expect(row(page, 'N26-E1').locator('[data-test="payment-select"]')).toHaveCount(1);
    await expect(row(page, 'N26-E1').locator('[data-test="payment-select-gutter"]')).toHaveCount(0);
    // Six rows: N26-P1 is on an issued invoice.
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 640) await expect(page.locator('[data-test="select-all-shown"]')).toContainText('Select all 6 shown');
    await page.locator('[data-test="select-all-shown"]').getByRole('checkbox').check();
    await expect(page.locator('[data-test="bulk-category"]')).toContainText('Set category of 6 selected');
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
      const check = await box('[data-test="payment-select"]');
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

/** #10631 (§3.143 Decision 4): one selection feeds every action, each
 *  enabled by its own condition. Set category acts on one direction at a
 *  time; "Remove (N)" arms to "Remove N rows" before it acts; a row on an
 *  issued invoice cannot be selected. The selection is keyed by row
 *  (`p<id>` / `e<id>`), because payment and expense ids share one number
 *  space (security c66333 on system_3 #10630, carried in c66336). */

const bulkCategory = (page: Page) => page.locator('[data-test="bulk-category"]');
const bulkRemove = (page: Page) => page.locator('[data-test="bulk-remove"]');
const select = (page: Page, txn: string) => row(page, txn).locator('[data-test="payment-select"]').getByRole('checkbox');
const sent = (fake: Fake, method: string, pattern: RegExp) => fake.requests.filter((r) => r.method === method && pattern.test(r.path));

async function bulkOptions(page: Page): Promise<string[]> {
  await bulkCategory(page).click();
  const labels = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  return labels.map((l) => l.trim());
}

test.describe('#10631 Transactions: selection actions for both directions', () => {
  test('a selection of money in and money out cannot set a category, and says why', async ({ page }) => {
    const fake = mixedFake();
    await open(page, fake);
    await select(page, 'M-e2').check();
    await select(page, 'PP-P4').check();

    await expect(bulkCategory(page)).toBeDisabled();
    const hint = page.locator('[data-test="set-category-hint"]');
    await expect(hint).toHaveText('Choose only money in or only money out to set a category');
    await expect(bulkCategory(page)).toHaveAttribute('aria-describedby', 'set-category-hint');
    // Remove still acts on both; Create invoice stays the one primary.
    await expect(bulkRemove(page)).toBeEnabled();
    await expect(bulkRemove(page)).toHaveText('Remove (2)');

    // Money in alone: income categories, written to the payment.
    await select(page, 'M-e2').uncheck();
    await expect(hint).toHaveCount(0);
    await expect(bulkCategory(page)).toBeEnabled();
    expect(await bulkOptions(page)).toEqual(['Uncategorised', 'Paid work', 'Gift', 'Loan', 'Refund', 'Other']);

    // Money out alone: her expense categories, written to the expense.
    await select(page, 'PP-P4').uncheck();
    await select(page, 'M-e2').check();
    await expect(bulkCategory(page)).toBeEnabled();
    await expect.poll(() => bulkOptions(page)).toEqual(['materials and supplies', 'other', 'travel']);
    await bulkCategory(page).click();
    await page.getByRole('option', { name: 'other', exact: true }).click();
    await expect.poll(() => sent(fake, 'PATCH', /^\/invoicing\/(payments|expenses)\//).length).toBe(1);
    const [write] = sent(fake, 'PATCH', /^\/invoicing\/(payments|expenses)\//);
    expect(write.path).toBe('/invoicing/expenses/102');
    expect(JSON.parse(write.body)).toEqual({ category: 'other' });
    await expect(select(page, 'M-e2')).not.toBeChecked();
  });

  test('Remove (N) arms to "Remove N rows", then removes both directions in one go', async ({ page }) => {
    const fake = mixedFake();
    await open(page, fake);
    await expect(bulkRemove(page)).toHaveText('Remove');
    await expect(bulkRemove(page)).toBeDisabled();

    // PP-P2 is on a draft: the armed button says it comes off.
    await select(page, 'PP-P2').check();
    await select(page, 'M-e2').check();
    await expect(bulkRemove(page)).toHaveText('Remove (2)');
    await bulkRemove(page).click();
    await expect(bulkRemove(page)).toHaveText('Remove 2 rows');
    await expect(page.locator('[data-test="bulk-remove-consequence"]')).toHaveText('1 of them is also taken off its draft invoice.');
    expect(sent(fake, 'POST', /\/remove$/)).toHaveLength(0);

    // A change to the selection disarms it: the count it names is the count it removes.
    await select(page, 'M-p3').check();
    await expect(bulkRemove(page)).toHaveText('Remove (3)');
    await select(page, 'M-p3').uncheck();
    await bulkRemove(page).click();
    await expect(bulkRemove(page)).toHaveText('Remove 2 rows');
    await bulkRemove(page).click();

    await expect.poll(() => sent(fake, 'POST', /\/remove$/).length).toBe(2);
    const [payments, expenses] = sent(fake, 'POST', /\/remove$/);
    expect(payments.path).toBe('/invoicing/payments/remove');
    expect(JSON.parse(payments.body)).toEqual({ ids: [2] });
    expect(expenses.path).toBe('/invoicing/expenses/remove');
    expect(JSON.parse(expenses.body)).toEqual({ ids: [102] });
    await expect.poll(() => txns(page)).toEqual(['N26-E1', 'N26-P1', 'M-p3', 'PP-P4', 'N26-E3']);
    await expect(bulkRemove(page)).toHaveText('Remove');
    await expect(page.locator('[data-test="bulk-error"]')).toHaveCount(0);
  });

  test('a row on an issued invoice cannot be selected, so Select all and Remove leave it', async ({ page }) => {
    const fake = mixedFake();
    await open(page, fake);
    await expect(row(page, 'N26-P1').locator('[data-test="payment-select"]')).toHaveCount(0);
    await expect(row(page, 'N26-P1').locator('[data-test="payment-select-gutter"]')).toHaveCount(1);

    await page.locator('[data-test="select-all-shown"]').getByRole('checkbox').check();
    await expect(bulkRemove(page)).toHaveText('Remove (6)');
    await bulkRemove(page).click();
    await expect(bulkRemove(page)).toHaveText('Remove 6 rows');
    await bulkRemove(page).click();

    await expect.poll(() => sent(fake, 'POST', /\/remove$/).length).toBe(2);
    const [payments, expenses] = sent(fake, 'POST', /\/remove$/);
    expect(JSON.parse(payments.body)).toEqual({ ids: [2, 3, 4] });
    expect(JSON.parse(expenses.body)).toEqual({ ids: [101, 102, 103] });
    await expect.poll(() => txns(page)).toEqual(['N26-P1']);
  });

  test('a refused remove removes nothing and says why', async ({ page }) => {
    const fake = mixedFake();
    fake.refuseRemove = {
      payments: { code: 'payment_on_invoice', message: 'payment PP-P2 is on issued invoice 2026-015; cancel that invoice first' },
    };
    await open(page, fake);
    await select(page, 'PP-P2').check();
    await select(page, 'N26-E1').check();
    await bulkRemove(page).click();
    await bulkRemove(page).click();

    await expect(page.locator('[data-test="bulk-error"]')).toHaveText(
      'Nothing was removed: payment PP-P2 is on issued invoice 2026-015; cancel that invoice first',
    );
    // The expenses were never sent: nothing half-removed.
    expect(sent(fake, 'POST', /\/expenses\/remove$/)).toHaveLength(0);
    await expect.poll(() => txns(page)).toEqual(NEWEST_FIRST);
    await expect(select(page, 'PP-P2')).toBeChecked();
    await expect(select(page, 'N26-E1')).toBeChecked();
    await expect(bulkRemove(page)).toHaveText('Remove (2)');
  });

  test('a payment and an expense that share an id never select or write each other', async ({ page }) => {
    const fake = newFake({
      payments: [
        pay({
          id: 5, transaction_id: 'PP-P5', source: 'paypal', entry: 'import', paid_on: '2026-10-02T00:00:00Z',
          created_at: '2026-10-02T09:00:00Z', sender_name: 'Mara Esempio', note: 'Portrait', category: 'uncategorised', gross_cents: 30000,
        }),
      ],
      expenses: [
        spend({
          id: 5, transaction_id: 'N26-E5', source: 'n26', entry: 'import', paid_on: '2026-10-01T00:00:00Z',
          created_at: '2026-10-01T09:00:00Z', reference: 'Colorificio Esempio', note: 'Brushes', category: 'travel', amount_cents: 2500,
        }),
      ],
    });
    await open(page, fake);

    await select(page, 'N26-E5').check();
    await expect(select(page, 'PP-P5')).not.toBeChecked();
    await expect(bulkCategory(page)).toContainText('Set category of 1 selected');
    await expect(page.locator('[data-test="set-category-hint"]')).toHaveCount(0);
    await bulkCategory(page).click();
    await page.getByRole('option', { name: 'materials and supplies', exact: true }).click();
    await expect.poll(() => sent(fake, 'PATCH', /^\/invoicing\//).length).toBe(1);
    expect(sent(fake, 'PATCH', /^\/invoicing\//)[0].path).toBe('/invoicing/expenses/5');
    expect(fake.payments[0].category).toBe('uncategorised');

    await select(page, 'N26-E5').check();
    await expect(select(page, 'PP-P5')).not.toBeChecked();
    await bulkRemove(page).click();
    await bulkRemove(page).click();
    await expect.poll(() => sent(fake, 'POST', /\/remove$/).length).toBe(1);
    const [removal] = sent(fake, 'POST', /\/remove$/);
    expect(removal.path).toBe('/invoicing/expenses/remove');
    expect(JSON.parse(removal.body)).toEqual({ ids: [5] });
    await expect.poll(() => txns(page)).toEqual(['PP-P5']);
    expect(fake.payments[0].removed_at).toBeNull();
  });
});
