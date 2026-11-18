import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, one door per row (system_3 #11501; design_conventions §3.159
 *  Decision 3; #11497 item 7, operator c70806 on #10985: "the edit button …
 *  all the way to the right, across the page"). On desktop every list's last
 *  column holds the row's door, a bordered `sm` button: "Edit" on
 *  Transactions, the Book and Clients, "Open" on Invoices. An expense's
 *  "Receipt" sits left of it on both tabs that show the expense. On a phone a
 *  tap on the card opens it on all four tabs. Every call is answered by an
 *  in-memory fake; a catch-all /api/ → 404 is registered first, so nothing
 *  reaches a server. Invented records only. */

type Json = Record<string, any>;

interface Fake {
  requests: Array<{ method: string; path: string }>;
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const PAYMENTS = [
  // A long payer address and a note, so the "who" cell is at its fullest.
  {
    id: 1, kind: 'incoming', entry: 'import', source: 'paypal', transaction_id: 'PP-P1', paid_on: '2026-10-14T00:00:00Z',
    created_at: '2026-10-15T09:00:00Z', currency: 'EUR', gross_cents: 120000, sender_name: 'Galerie Nord Esempio',
    sender_email: 'buchhaltung.galerie-nord@example.test', note: 'Mural, October, second instalment', category: 'paid_work',
    client_id: 1, on_invoice: false, on_issued_invoice: false, invoice: null,
  },
  {
    id: 2, kind: 'incoming', entry: 'manual', source: 'manual', method: 'bank_transfer', reference: 'RE-17',
    transaction_id: 'M-p2', paid_on: '2026-10-03T00:00:00Z', created_at: '2026-10-04T09:00:00Z', currency: 'EUR',
    gross_cents: 45000, sender_name: 'Mara Esempio', sender_email: '', note: 'Portrait', category: 'paid_work', client_id: 1,
    on_invoice: true, on_issued_invoice: false, invoice: { id: 12, status: 'draft', invoice_number: null },
  },
];

const EXPENSES = [
  {
    id: 101, source: 'n26', entry: 'import', transaction_id: 'N26-E1', paid_on: '2026-10-20T00:00:00Z',
    created_at: '2026-10-21T09:00:00Z', currency: 'EUR', amount_cents: 123499, reference: 'Colorificio Esempio',
    note: 'Pagamento con carta', category: 'materials and supplies', client_id: null,
  },
];

const INVOICES = [
  {
    id: 7, status: 'issued', client_id: 1, client_name: 'Galerie Nord Esempio', invoice_number: '2026-014', number: 14,
    issue_date: '2026-10-21T00:00:00Z', service_date_from: '2026-10-14T00:00:00Z', service_date_to: '2026-10-14T00:00:00Z',
    vat_rate_bp: 0, total_cents: 120000, currency: 'EUR',
  },
  {
    id: 12, status: 'draft', client_id: 1, client_name: 'Galerie Nord Esempio', invoice_number: null, number: null,
    issue_date: null, service_date_from: '2026-10-03T00:00:00Z', service_date_to: '2026-10-03T00:00:00Z', vat_rate_bp: 0,
    total_cents: 45000, currency: 'EUR',
  },
];

const client = (over: Json) => ({
  address: '', email: '', paypal_email: '', notes: '', phone: '', instagram_url: '', telegram_url: '',
  created_at: '2026-07-01T08:00:00Z', updated_at: '2026-07-01T08:00:00Z', ...over,
});

const CLIENTS = [
  client({
    id: 1, name: 'Galerie Nord Esempio', address: 'Nordweg 2\n13353 Berlin', email: 'info@galerie.example.test',
    paypal_email: 'pay@galerie.example.test', phone: '+49 30 1234567', instagram_url: 'https://www.instagram.com/galerie.nord/',
    notes: 'Pays within a week.',
  }),
  // A look-alike pair, so the card carries a review flag with its own button.
  client({ id: 2, name: 'Renée Fittizio' }),
  client({ id: 3, name: 'Renee Carla Fittizio' }),
];

async function mock(page: Page): Promise<Fake> {
  const fake: Fake = { requests: [] };
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', phone: '', instagram_url: '', telegram_url: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: CLIENTS });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: PAYMENTS });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: EXPENSES });
    if (path === '/invoicing/expense-categories') return json(route, 200, { categories: ['materials and supplies', 'travel', 'other'].map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })) });
    if (path === '/invoicing/book/selection') return json(route, 200, { selection: { preset: 'everything', changed: false, income: ['paid_work', 'gift', 'loan', 'refund', 'other', 'uncategorised'], expense_all: true, expense: [] }, presets: [{ id: 'everything', name: 'Everything', builtin: true, income: ['paid_work', 'gift', 'loan', 'refund', 'other', 'uncategorised'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: INVOICES });
    const inv = path.match(/^\/invoicing\/invoices\/(\d+)$/);
    if (inv && method === 'GET') {
      const invoice = INVOICES.find((i) => i.id === Number(inv[1]))!;
      return json(route, 200, { invoice, client_name: invoice.client_name, line_items: [{ id: 1, position: 1, description: 'Mural', quantity_milli: 1000, unit_price_cents: invoice.total_cents, line_total_cents: invoice.total_cents }], payments: [], warnings: [] });
    }
    // No receipt is attached: the dialog opens on its empty state.
    if (/^\/invoicing\/expenses\/\d+\/receipt$/.test(path)) return json(route, 404, { error: { code: 'not_found', message: 'No receipt is attached' } });
    if (/^\/invoicing\/clients\/\d+\/stats$/.test(path)) return json(route, 200, { stats: { invoice_count: 0, payment_count: 0, totals: [] } });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  return fake;
}

async function open(page: Page, tab?: 'Invoices' | 'Book' | 'Clients'): Promise<Fake> {
  const fake = await mock(page);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
  if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
  return fake;
}

/** The door is the last thing in the row's last cell, and its right edge is
 *  the cell's content edge: inside the row, within the cell's padding. */
async function expectDoorFlushRight(row: Locator, door: Locator, what: string): Promise<void> {
  await expect(door, `${what}: the door`).toBeVisible();
  await expect(door, `${what}: bordered`).toHaveClass(/btn--secondary/);
  const inLastCell = await door.evaluate((el) => {
    const cell = el.closest('td');
    return !!cell && cell === cell.parentElement!.lastElementChild;
  });
  expect(inLastCell, `${what}: in the row's last column`).toBe(true);
  const r = (await row.boundingBox())!;
  const d = (await door.boundingBox())!;
  const gap = r.x + r.width - (d.x + d.width);
  expect(gap, `${what}: flush right, ${gap.toFixed(1)}px from the row's edge`).toBeGreaterThanOrEqual(0);
  expect(gap, `${what}: flush right, ${gap.toFixed(1)}px from the row's edge`).toBeLessThanOrEqual(16);
}

const dialog = (page: Page) => page.getByRole('dialog');

test.describe('#11501 desktop: the row\'s door is in the last column, flush right', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop tables; a phone card opens on a tap');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Transactions: Edit on a payment; Receipt then Edit on an expense', async ({ page }) => {
    await open(page);
    const payment = page.locator('[data-test="payment-row"][data-txn="PP-P1"]');
    await expectDoorFlushRight(payment, payment.locator('[data-test="payment-edit"]'), 'payment row');
    await expect(payment.locator('[data-test="expense-receipt"]')).toHaveCount(0);

    const expense = page.locator('[data-test="expense-row"][data-txn="N26-E1"]');
    const edit = expense.locator('[data-test="expense-edit"]');
    const receipt = expense.locator('[data-test="expense-receipt"]');
    await expectDoorFlushRight(expense, edit, 'expense row');
    await expect(receipt).toHaveClass(/btn--secondary/);
    const [e, r] = [(await edit.boundingBox())!, (await receipt.boundingBox())!];
    expect(Math.abs(e.y - r.y), 'Receipt and Edit share a line').toBeLessThanOrEqual(1);
    expect(r.x + r.width, 'Receipt is left of Edit').toBeLessThanOrEqual(e.x);
    // The door is no longer under the row's text.
    await expect(page.locator('td:has([data-test="row-who"]) button')).toHaveCount(0);

    await edit.click();
    await expect(dialog(page)).toContainText('Edit expense');
  });

  test('Transactions: an expense\'s Receipt opens the receipt dialog for that expense', async ({ page }) => {
    const fake = await open(page);
    await page.locator('[data-test="expense-row"][data-txn="N26-E1"] [data-test="expense-receipt"]').click();
    await expect(dialog(page)).toContainText('2026-10-20 · €1,234.99 · Colorificio Esempio');
    expect(fake.requests.filter((r) => r.path === '/invoicing/expenses/101/receipt').length).toBeGreaterThan(0);
  });

  test('Book: Receipt and Edit leave the Out and description cells for the last column', async ({ page }) => {
    await open(page, 'Book');
    const income = page.locator('[data-test="book-row"][data-type="in"]').first();
    await expectDoorFlushRight(income, income.locator('[data-test="book-row-edit"]'), 'Book income row');
    await expect(income.locator('[data-test="book-expense-receipt"]')).toHaveCount(0);

    const out = page.locator('[data-test="book-row"][data-type="out"]').first();
    const edit = out.locator('[data-test="book-row-edit"]');
    const receipt = out.locator('[data-test="book-expense-receipt"]');
    await expectDoorFlushRight(out, edit, 'Book expense row');
    await expect(receipt).toHaveClass(/btn--secondary/);
    const [e, r] = [(await edit.boundingBox())!, (await receipt.boundingBox())!];
    expect(Math.abs(e.y - r.y), 'Receipt and Edit share a line').toBeLessThanOrEqual(1);
    expect(r.x + r.width, 'Receipt is left of Edit').toBeLessThanOrEqual(e.x);
    // The description and Out cells hold no button any more.
    await expect(page.locator('td:has([data-test="book-row-description"]) button')).toHaveCount(0);
    await expect(page.locator('td:has(.out-amount) button')).toHaveCount(0);

    await edit.click();
    await expect(dialog(page)).toContainText('Edit expense');
  });

  test('Clients: the last column\'s Edit is bordered', async ({ page }) => {
    await open(page, 'Clients');
    const row = page.locator('[data-test="client-row"][data-client-id="1"]');
    await expectDoorFlushRight(row, row.locator('[data-test="client-edit-1"]'), 'client row');
    await row.locator('[data-test="client-edit-1"]').click();
    await expect(dialog(page)).toContainText('Edit client');
  });

  test('Invoices: Open opens the invoice once, and the row still opens it', async ({ page }) => {
    const fake = await open(page, 'Invoices');
    const detail = () => fake.requests.filter((r) => r.method === 'GET' && r.path === '/invoicing/invoices/7').length;
    const row = page.locator('[data-test="invoice-row"][data-invoice-id="7"]');
    const door = row.locator('[data-test="invoice-open"]');
    await expectDoorFlushRight(row, door, 'invoice row');
    await expect(door).toHaveText('Open');

    await door.click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="issued"]')).toBeVisible();
    // One open, not the button's and then the row's.
    expect(detail(), 'the invoice is read once').toBe(1);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);

    // The whole row is still a door.
    await row.locator('.invoice-identity').click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="issued"]')).toBeVisible();
    expect(detail()).toBe(2);
  });

  test('at 1280 with the sidebar open every tab\'s table stays in its column and no cell is cut', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    for (const tab of ['Transactions', 'Invoices', 'Book', 'Clients'] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('table').first(), tab).toBeVisible();
      const report = await page.evaluate(() => {
        const main = document.querySelector('.page')!.getBoundingClientRect();
        const cut: string[] = [];
        let tables = 0;
        for (const table of Array.from(document.querySelectorAll('table'))) {
          const t = table.getBoundingClientRect();
          if (!t.width) continue;
          tables += 1;
          if (t.right > main.right + 0.5) cut.push(`table ends at ${Math.round(t.right)}, the page at ${Math.round(main.right)}`);
          for (const cell of Array.from(table.querySelectorAll('td, th'))) {
            const c = cell.getBoundingClientRect();
            // A button does not wrap, so in a column too narrow for it, it
            // either sticks out of its cell or cuts its own label.
            for (const el of Array.from(cell.querySelectorAll('button'))) {
              const b = el.getBoundingClientRect();
              if (!b.width) continue;
              const name = (el.textContent || '').trim();
              if (b.left < c.left - 0.5 || b.right > c.right + 0.5) cut.push(`"${name}" leaves its cell by ${Math.round(Math.max(c.left - b.left, b.right - c.right))}px`);
              if (el.scrollWidth > el.clientWidth + 1) cut.push(`"${name}" is cut: ${el.scrollWidth}px of label in ${el.clientWidth}px`);
            }
          }
        }
        return { tables, cut, sideways: document.documentElement.scrollWidth - window.innerWidth };
      });
      expect(report.tables, `${tab}: a table is shown`).toBeGreaterThan(0);
      expect(report.cut, `${tab} at 1280`).toEqual([]);
      expect(report.sideways, `${tab}: no sideways scroll`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('#11501 phone: a tap on the card opens it', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Clients: a tap on the card opens Edit client, and the card has no Edit button', async ({ page }) => {
    await open(page, 'Clients');
    const card = page.locator('[data-test="client-row"][data-client-id="1"]');
    await expect(card).toBeVisible();
    await expect(page.locator('[data-test^="client-edit-"]')).toHaveCount(0);
    await card.locator('strong').click();
    await expect(dialog(page)).toContainText('Edit client');
    await expect(dialog(page).getByLabel('Name')).toHaveValue('Galerie Nord Esempio');
  });

  test('Clients: a tap on the phone or Instagram link, or on a review flag\'s button, does not open the card', async ({ page }) => {
    await open(page, 'Clients');
    const card = page.locator('[data-test="client-row"][data-client-id="1"]');
    // A link keeps its own job. The navigation itself is stopped here, so the
    // page stays where the next assertion can read it.
    await page.evaluate(() => {
      document.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) e.preventDefault(); });
    });
    await card.locator('[data-test="client-phone"]').click();
    await expect(dialog(page)).toHaveCount(0);
    await card.locator('[data-test="client-instagram"]').click();
    await expect(dialog(page)).toHaveCount(0);

    const flagged = page.locator('[data-test="client-row"][data-client-id="2"]');
    await flagged.locator('[data-test="client-not-same"]').click();
    await expect(flagged.locator('[data-test="client-look-alike"]')).toHaveCount(0);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('Transactions: an expense card has Receipt, which opens the receipt and not the card', async ({ page }) => {
    await open(page);
    const card = page.locator('[data-test="expense-row"][data-txn="N26-E1"]');
    const receipt = card.locator('[data-test="expense-receipt"]');
    await expect(receipt).toHaveText('Receipt');
    await expect(card.locator('[data-test="expense-edit"]')).toHaveCount(0);
    await receipt.click();
    await expect(dialog(page)).toContainText('2026-10-20 · €1,234.99 · Colorificio Esempio');
    await expect(dialog(page)).not.toContainText('Edit expense');
    // A payment card has none.
    await expect(page.locator('[data-test="payment-row"] [data-test="expense-receipt"]')).toHaveCount(0);
  });

  test('Transactions and the Book: a tap on the card still opens it', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="expense-row"][data-txn="N26-E1"] [data-test="row-who"]').click();
    await expect(dialog(page)).toContainText('Edit expense');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    await page.locator('[data-test="book-row"][data-type="out"] [data-test="book-row-description"]').first().click();
    await expect(dialog(page)).toContainText('Edit expense');
  });
});

// system_3 #11022 (UX walk AM5; design ack c72063): on a phone every card
// says at rest that it opens, with the tab's own door word in muted ink at
// the end of a line the card already has. It is part of the card's one tap.
test.describe('#11022 phone: every card says at rest that it opens', () => {
  const sameLine = async (a: Locator, b: Locator) => {
    const [ra, rb] = [(await a.boundingBox())!, (await b.boundingBox())!];
    // One line: the two boxes overlap vertically by most of the shorter one.
    const overlap = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y);
    return overlap >= 0.6 * Math.min(ra.height, rb.height);
  };
  const doorOf = (card: Locator) => card.locator('[data-test="card-door"]');

  for (const width of [390, 360]) {
    test(`at ${width}px every card on each tab carries its word, on its own line, never the amount's`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      const tx = page.locator('[data-test="payment-row"], [data-test="expense-row"]');
      expect(await tx.count()).toBeGreaterThan(1);
      for (const card of await tx.all()) {
        await expect(doorOf(card)).toHaveText('Edit');
        await expect(doorOf(card)).toHaveAttribute('aria-hidden', 'true');
        expect(await sameLine(doorOf(card), card.locator('[data-test="row-date-line"]')), 'Transactions: the date line').toBe(true);
        expect(await sameLine(doorOf(card), card.locator('[data-test="row-amount"]')), 'Transactions: not the amount line').toBe(false);
      }

      await page.getByRole('tab', { name: 'Book', exact: true }).click();
      const book = page.locator('[data-test="book-row"]:visible');
      expect(await book.count()).toBeGreaterThan(0);
      for (const card of await book.all()) {
        await expect(doorOf(card)).toHaveText('Edit');
        expect(await sameLine(doorOf(card), card.locator('.amount')), 'Book: not the amount line').toBe(false);
        expect(await sameLine(doorOf(card), card.locator('[data-test="book-row-description"]')), 'Book: not the description').toBe(false);
      }

      await page.getByRole('tab', { name: 'Clients', exact: true }).click();
      const clients = page.locator('[data-test="client-row"]');
      expect(await clients.count()).toBeGreaterThan(0);
      for (const card of await clients.all()) {
        await expect(doorOf(card)).toHaveText('Edit');
        expect(await sameLine(doorOf(card), card.locator('strong').first()), 'Clients: the name line').toBe(true);
      }

      await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
      const invoices = page.locator('[data-test="invoice-row"]');
      expect(await invoices.count()).toBeGreaterThan(0);
      for (const card of await invoices.all()) {
        await expect(doorOf(card)).toHaveText('Open');
        expect(await sameLine(doorOf(card), card.locator('.invoice-identity')), 'Invoices: the top line').toBe(true);
        expect(await sameLine(doorOf(card), card.locator('.amount')), 'Invoices: not the amount line').toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('a tap on the word opens what the card opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await doorOf(page.locator('[data-test="expense-row"][data-txn="N26-E1"]')).click();
    await expect(dialog(page)).toContainText('Edit expense');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    await doorOf(page.locator('[data-test="book-row"][data-type="out"]').first()).click();
    await expect(dialog(page)).toContainText('Edit expense');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Clients', exact: true }).click();
    await doorOf(page.locator('[data-test="client-row"][data-client-id="1"]')).click();
    await expect(dialog(page)).toContainText('Edit client');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
    await doorOf(page.locator('[data-test="invoice-row"]').first()).click();
    await expect(page.locator('[data-test="invoice-editor"]')).toBeVisible();
  });

  test('above 640px no word is added', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await expect(page.locator('[data-test="card-door"]')).toHaveCount(0);
    for (const tab of ['Book', 'Clients', 'Invoices'] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('[data-test="card-door"]')).toHaveCount(0);
    }
  });
});
