import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, phone cards open by keyboard and screen reader (system_3
 *  #11661; design ruling c72063 on #11022; design ack on #11661). Below 640px
 *  each card's text is one button, named for what it opens: "Edit payment
 *  for <row>", "Edit expense for <row>", "Edit client <name>". The card's
 *  other controls (the checkbox, the invoice link, "Generate invoice",
 *  "Receipt", a review flag's button, the contact links) sit outside it, in
 *  reading order, and keep their own jobs. On Clients the button is the name
 *  line, so the review flags stay directly under the name (§3.160). The
 *  fixture is the one invoicing-row-door.spec.ts uses: invented names only.
 */

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

const active = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return el ? (el.getAttribute('data-test') || el.closest('[data-test]')?.getAttribute('data-test') || el.tagName) : null;
});

test.describe('#11661 phone: each card opens by keyboard and is announced as a button', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('Transactions: each card body is a button named for what it opens', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Edit payment for PP-P1', exact: true })).toBeVisible();
    // A hand-entered row is named by its date and who · what (#11567).
    await expect(page.getByRole('button', { name: 'Edit payment for 2026-10-03 · Mara Esempio · Portrait', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit expense for N26-E1', exact: true })).toBeVisible();
    // The body holds the card's text, and nothing else that acts.
    const body = page.locator('[data-test="payment-row"][data-txn="PP-P1"] [data-test="card-body"]');
    await expect(body.locator('[data-test="row-who"]')).toHaveText('Galerie Nord Esempio');
    await expect(body.locator('[data-test="row-amount"]')).toBeVisible();
    await expect(body.locator('button, a, input, [role="checkbox"]')).toHaveCount(0);
  });

  test('Transactions: Tab goes checkbox, body, Generate invoice; Enter and Space open the dialog', async ({ page }) => {
    await open(page);
    const card = page.locator('[data-test="payment-row"][data-txn="PP-P1"]');
    await card.locator('[data-test="payment-select"] input').focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('card-body');
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('row-generate');
    await page.keyboard.press('Shift+Tab');
    expect(await active(page)).toBe('card-body');

    await page.keyboard.press('Enter');
    await expect(dialog(page)).toContainText('Edit payment');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);

    const expense = page.locator('[data-test="expense-row"][data-txn="N26-E1"] [data-test="card-body"]');
    await expense.focus();
    await page.keyboard.press(' ');
    await expect(dialog(page)).toContainText('Edit expense');
  });

  test('Transactions: the body is the only card stop between its controls; the invoice link and Receipt follow it', async ({ page }) => {
    await open(page);
    const manual = page.locator('[data-test="payment-row"][data-txn="M-p2"]');
    await manual.locator('[data-test="card-body"]').focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('row-invoice');

    const expense = page.locator('[data-test="expense-row"][data-txn="N26-E1"]');
    await expense.locator('[data-test="card-body"]').focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('expense-receipt');
  });

  test('Transactions: Generate invoice, Receipt and the invoice link keep their jobs and open no card', async ({ page }) => {
    const fake = await open(page);
    await page.locator('[data-test="payment-row"][data-txn="PP-P1"] [data-test="row-generate"]').click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Edit payment' })).toHaveCount(0);

    await open(page);
    await page.locator('[data-test="expense-row"][data-txn="N26-E1"] [data-test="expense-receipt"]').click();
    await expect(dialog(page)).toContainText('2026-10-20 · €1,234.99 · Colorificio Esempio');
    await expect(dialog(page)).not.toContainText('Edit expense');
    await page.keyboard.press('Escape');

    const fake2 = await open(page);
    await page.locator('[data-test="payment-row"][data-txn="M-p2"] [data-test="row-invoice"]').click();
    await expect.poll(() => fake2.requests.some((r) => r.method === 'GET' && r.path === '/invoicing/invoices/12')).toBe(true);
    await expect(page.getByRole('dialog').filter({ hasText: 'Edit payment' })).toHaveCount(0);
    expect(fake.requests.length).toBeGreaterThan(0);
  });

  test('Transactions: the checkbox stays in its corner, beside the name, and a tick opens no card', async ({ page }) => {
    await open(page);
    const card = page.locator('[data-test="payment-row"][data-txn="PP-P1"]');
    const box = (await card.locator('[data-test="payment-select"]').boundingBox())!;
    const who = (await card.locator('[data-test="row-who"]').boundingBox())!;
    const c = (await card.boundingBox())!;
    expect(box.x + box.width, 'left of the name').toBeLessThanOrEqual(who.x);
    expect(Math.abs((box.y + box.height / 2) - (who.y + who.height / 2)), 'on the name line').toBeLessThanOrEqual(2);
    expect(box.x - c.x, 'in the card padding').toBeLessThanOrEqual(20);
    await card.locator('[data-test="payment-select"]').click();
    await expect(card.locator('[data-test="payment-select"] input')).toBeChecked();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('Transactions: a tap on the card body opens it once; the second card still ends above 844', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="payment-row"][data-txn="PP-P1"] [data-test="row-date-line"]').click();
    await expect(dialog(page)).toHaveCount(1);
    await expect(dialog(page)).toContainText('Edit payment');
    await page.keyboard.press('Escape');
    const second = (await page.locator('[data-test="payment-row"], [data-test="expense-row"]').nth(1).boundingBox())!;
    expect(second.y + second.height).toBeLessThanOrEqual(844);
  });

  test('The Book: the body is a button named for its row; Tab reaches Receipt after it; Enter opens', async ({ page }) => {
    await open(page, 'Book');
    const out = page.locator('[data-test="book-row"][data-type="out"]').first();
    const body = out.locator('[data-test="card-body"]');
    await expect(body).toHaveAccessibleName('Edit expense for N26-E1');
    await expect(page.getByRole('button', { name: 'Edit payment for PP-P1', exact: true })).toBeVisible();
    await expect(body.locator('[data-test="book-row-description"]')).toBeVisible();
    await body.focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('book-expense-receipt');
    await body.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toContainText('Edit expense');
  });

  test('Clients: the name line is the button; Tab goes name, the flag\'s button, then the contact links', async ({ page }) => {
    await open(page, 'Clients');
    const flagged = page.locator('[data-test="client-row"][data-client-id="2"]');
    const body = flagged.locator('[data-test="card-body"]');
    await expect(body).toHaveAccessibleName('Edit client Renée Fittizio');
    // The flag is still directly under the name (§3.160).
    const nameBox = (await body.boundingBox())!;
    const flagBox = (await flagged.locator('[data-test="client-look-alike"]').first().boundingBox())!;
    expect(flagBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    expect(flagBox.y - (nameBox.y + nameBox.height)).toBeLessThanOrEqual(12);
    await body.focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('client-not-same');

    const full = page.locator('[data-test="client-row"][data-client-id="1"]');
    await full.locator('[data-test="card-body"]').focus();
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('client-phone');
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('client-instagram');

    await full.locator('[data-test="card-body"]').focus();
    await page.keyboard.press('Space');
    await expect(dialog(page)).toContainText('Edit client');
    await expect(dialog(page).getByRole('textbox').first()).toHaveValue('Galerie Nord Esempio');
  });

  test('Clients: a tap on the address still opens Edit client', async ({ page }) => {
    await open(page, 'Clients');
    await page.locator('[data-test="client-row"][data-client-id="1"] .multiline').click();
    await expect(dialog(page)).toHaveCount(1);
  });

  test('the focus ring is on the card\'s box, and the body has no box of its own', async ({ page }) => {
    await open(page);
    const card = page.locator('[data-test="payment-row"][data-txn="PP-P1"]');
    await card.locator('[data-test="payment-select"] input').focus();
    await page.keyboard.press('Tab');
    const read = await card.evaluate((li) => {
      const b = li.querySelector('[data-test="card-body"]') as HTMLElement;
      const bs = getComputedStyle(b);
      return { ring: getComputedStyle(li).boxShadow, outline: bs.outlineStyle, pad: bs.padding, border: bs.borderTopWidth, bg: bs.backgroundColor };
    });
    expect(read.ring).not.toBe('none');
    expect(read.outline).toBe('none');
    expect(read.pad).toBe('0px');
    expect(read.border).toBe('0px');
    expect(read.bg).toBe('rgba(0, 0, 0, 0)');
  });
});
