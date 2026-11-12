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
  expenses: Json[];
  categories: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
}

const newFake = (): Fake => ({
  expenses: [],
  categories: CATEGORIES.map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })),
  requests: [],
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
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
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
