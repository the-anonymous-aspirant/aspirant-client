import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #12259, design_agent c76311): a PayPal file's
 *  reversal or refund of a payment already in the book is named under the
 *  import summary, with the day the money went back, what the Book does with
 *  the payment now, its issued invoice, and the payment's door. It advises
 *  nothing. The import answer's `undone` list comes from an in-memory fake of
 *  aspirant-server's /invoicing/payments/import; a catch-all /api/ → 404 is
 *  registered FIRST. Every name, id and amount is invented. */

type Json = Record<string, any>;

const payment = (id: number, over: Json = {}): Json => ({
  id, kind: 'incoming', entry: 'imported', source: 'paypal', transaction_id: `PPUNDO0000${id}`, method: 'paypal',
  reference: '', paid_on: '2026-10-03T00:00:00Z', currency: 'EUR', gross_cents: 12000, sender_name: 'Mara Esempio',
  sender_email: '', note: '', category: 'paid_work', client_id: null, on_invoice: false, on_issued_invoice: false,
  invoice: null, ...over,
});

// 1: Paid work, counted. 2: Paid work on an issued invoice. 3: Uncategorised,
// which the "Work only" selection does not count.
const PAYMENTS = [
  payment(1),
  payment(2, { paid_on: '2026-09-14T00:00:00Z', gross_cents: 35000, sender_name: 'Galerie Nord', on_invoice: true, on_issued_invoice: true, invoice: { id: 7, status: 'issued', invoice_number: '2026-012' } }),
  payment(3, { paid_on: '2026-10-20T00:00:00Z', gross_cents: 8000, sender_name: 'Luca Beispiel', category: 'uncategorised' }),
];

const undoneOf = (p: Json, over: Json = {}): Json => ({
  kind: 'reversal', transaction_id: `PPREV0000${p.id}`, paid_on: '2026-11-12', amount_cents: p.gross_cents, full: true,
  payment: { id: p.id, transaction_id: p.transaction_id, paid_on: p.paid_on.slice(0, 10), sender_name: p.sender_name, gross_cents: p.gross_cents, currency: p.currency },
  ...over,
});

const WORK_ONLY = { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] };

interface Fake {
  undone?: Json[];
  candidates: Json[];
  payments?: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 13 } });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments || PAYMENTS });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, WORK_ONLY);
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: [{ name: 'other' }] });
    if (path === '/invoicing/payments/import' && method === 'POST') {
      const n = (fake.undone || []).length + fake.candidates.length;
      const body: Json = {
        summary: { rows_read: n, imported: 0, duplicates: 0, skipped: n, skipped_reasons: { reversal: n }, format: 'csv' },
        expense_candidates: fake.candidates,
      };
      if (fake.undone) body.undone = fake.undone;
      return json(route, 200, body);
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

async function importFile(page: Page): Promise<void> {
  await page.locator('[data-test="payments-file"]').setInputFiles([{ name: 'paypal.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n') }]);
  await expect(page.locator('[data-test="import-summary"]')).toBeVisible();
}

const lead = (page: Page) => page.locator('[data-test="paypal-undone-lead"]');
const texts = (page: Page) => page.locator('[data-test="paypal-undone-text"]');

test.describe('#12259 a later reversal or refund names the payment it takes back', () => {
  test('the four line forms, with the day the money went back and what the Book does now', async ({ page }) => {
    const fake: Fake = {
      undone: [
        undoneOf(PAYMENTS[0], { kind: 'refund' }),
        undoneOf(PAYMENTS[0], { transaction_id: 'PPREV00011' }),
        undoneOf(PAYMENTS[2], { kind: 'refund', transaction_id: 'PPREF00003', amount_cents: 3000, full: false, paid_on: '2026-10-25' }),
        undoneOf(PAYMENTS[2], { transaction_id: 'PPREV00013', amount_cents: 2000, full: false, paid_on: '2026-10-28' }),
      ],
      candidates: [],
      requests: [],
    };
    await open(page, fake);
    await importFile(page);
    // Counted by payment: four lines, two payments.
    await expect(lead(page)).toHaveText('2 payments you already imported were refunded or reversed:');
    await expect(texts(page)).toHaveText([
      '€120.00 from Mara Esempio, 2026-10-03, was refunded in full on 2026-11-12. The Book still counts it in full.',
      '€120.00 from Mara Esempio, 2026-10-03, was reversed in full on 2026-11-12. The Book still counts it in full.',
      '€30.00 of €80.00 from Luca Beispiel, 2026-10-20, was refunded on 2026-10-25. It is not in the Book.',
      '€20.00 of €80.00 from Luca Beispiel, 2026-10-20, was reversed on 2026-10-28. It is not in the Book.',
    ]);
    // It advises nothing.
    for (const t of await texts(page).allTextContents()) expect(t).not.toMatch(/\b(remove|cancel|add)\b/i);
  });

  test('one payment reads in the singular, and its door opens the payment', async ({ page }) => {
    const fake: Fake = { undone: [undoneOf(PAYMENTS[0])], candidates: [], requests: [] };
    await open(page, fake);
    await importFile(page);
    await expect(lead(page)).toHaveText('1 payment you already imported was refunded or reversed:');
    const door = page.getByRole('button', { name: 'Open the payment of €120.00 from Mara Esempio on 2026-10-03' });
    await expect(door).toHaveText('Open');
    await door.click();
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
    await expect(page.locator('[data-test="edit-issued-line"]')).toHaveCount(0);
    // The import only reports: nothing but the import was posted.
    expect(fake.requests.filter((r) => r.method !== 'GET').map((r) => r.path)).toEqual(['/invoicing/payments/import']);
  });

  test('an issued invoice adds its sentence and its door opens the read-only payment; no invoice adds none', async ({ page }) => {
    const fake: Fake = {
      undone: [undoneOf(PAYMENTS[1], { kind: 'refund', invoice: { id: 7, invoice_number: '2026-012' } }), undoneOf(PAYMENTS[0])],
      candidates: [],
      requests: [],
    };
    await open(page, fake);
    await importFile(page);
    await expect(texts(page)).toHaveText([
      '€350.00 from Galerie Nord, 2026-09-14, was refunded in full on 2026-11-12. The Book still counts it in full. It is on invoice 2026-012.',
      '€120.00 from Mara Esempio, 2026-10-03, was reversed in full on 2026-11-12. The Book still counts it in full.',
    ]);
    await page.locator('[data-test="paypal-undone-line"][data-payment="2"] [data-test="paypal-undone-open"]').click();
    await expect(page.locator('[data-test="edit-issued-line"]')).toBeVisible();
  });

  test('a candidate carrying refund_of is not offered in "Add PayPal expenses"', async ({ page }) => {
    const refund = {
      transaction_id: 'PPREF00002', paid_on: '2026-10-05', currency: 'EUR', amount_cents: 3000, payee_name: 'Mara Esempio', note: '',
      already_imported: false, refund_of: 1, undo_kind: 'refund',
    };
    const purchase = { transaction_id: 'PPOUT00001', paid_on: '2026-10-06', currency: 'EUR', amount_cents: 1599, payee_name: 'Papeterie Rossi', note: 'Paper', already_imported: false };
    const fake: Fake = { undone: [undoneOf(PAYMENTS[0], { kind: 'refund', transaction_id: 'PPREF00002', amount_cents: 3000, full: false, paid_on: '2026-10-05' })], candidates: [refund, purchase], requests: [] };
    await open(page, fake);
    await importFile(page);
    const review = page.locator('[data-test="paypal-expenses-review"]');
    await expect(review).toBeVisible();
    await expect(review.locator('[data-test="expense-row"]')).toHaveCount(1);
    await expect(review.locator('[data-test="expense-row"]')).toHaveAttribute('data-txn', 'PPOUT00001');
    await page.locator('[data-test="paypal-expenses-cancel"]').click();

    // With only the refund among the candidates, the offer does not open.
    fake.candidates = [refund];
    await importFile(page);
    await expect.poll(() => fake.requests.filter((r) => r.path === '/invoicing/payments/import').length).toBe(2);
    await expect(texts(page)).toHaveCount(1);
    await expect(review).toHaveCount(0);
  });

  test('an answer without undone, as from a server before it, shows no lines', async ({ page }) => {
    const fake: Fake = { candidates: [], requests: [] };
    await open(page, fake);
    await importFile(page);
    await expect(page.locator('[data-test="paypal-undone"]')).toHaveCount(0);
  });

  test('the payer name renders as text, never as markup', async ({ page }) => {
    const p = payment(1, { sender_name: '<b data-test="injected">Mara</b>' });
    const fake: Fake = { undone: [undoneOf(p)], candidates: [], requests: [], payments: [p] };
    await open(page, fake);
    await importFile(page);
    await expect(texts(page).first()).toContainText('from <b data-test="injected">Mara</b>, 2026-10-03,');
    await expect(page.locator('[data-test="injected"]')).toHaveCount(0);
  });

  test('at 360 the longest line wraps with no sideways scroll, its door on screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const fake: Fake = { undone: [undoneOf(PAYMENTS[1], { kind: 'refund', invoice: { id: 7, invoice_number: '2026-012' } })], candidates: [], requests: [] };
    await open(page, fake);
    await importFile(page);
    await expect(texts(page)).toHaveText(/It is on invoice 2026-012\.$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = (await page.locator('[data-test="paypal-undone-open"]').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    const text = (await texts(page).boundingBox())!;
    expect(text.x + text.width).toBeLessThanOrEqual(360);
  });
});
