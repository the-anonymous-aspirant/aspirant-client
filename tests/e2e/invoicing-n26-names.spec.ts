import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app: no view names a row by an id the server made up (system_3
 *  #12257). N26 statements and CSV exports carry no transaction id, so the
 *  import derives one ("csv-…", "stmt-…") to recognise a re-upload. The
 *  server serves `shown_reference`: the provider's id, or empty for such a
 *  row. An empty one names the row by its date and "who · what", as a
 *  hand-entered row always is (#11567). An N26 transfer confirmation's
 *  operation id and a PayPal id are the provider's own and still name their
 *  rows. Invented names and ids only.
 */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const DERIVED = /(csv|stmt)-[0-9a-f]{8,}/;
const CONFIRMATION = 'a1b2c3d4-0000-4000-8000-000000000001';

const payment = (over: Json) => ({
  kind: 'incoming', entry: 'import', currency: 'EUR', sender_email: '', category: 'paid_work', client_id: 1,
  on_invoice: false, on_issued_invoice: false, invoice: null, removed_at: null, created_at: '2026-10-20T09:00:00Z', ...over,
});

const N26_CSV = payment({
  id: 1, source: 'n26', transaction_id: 'csv-f00dfeedcafe0123456789ab', shown_reference: '', paid_on: '2026-10-01T00:00:00Z',
  gross_cents: 15000, sender_name: 'Galerie Nord Esempio', note: 'Mural',
  on_invoice: true, invoice: { id: 12, status: 'draft', invoice_number: null },
});
const N26_CONFIRMED = payment({
  id: 2, source: 'n26', transaction_id: CONFIRMATION, shown_reference: CONFIRMATION, paid_on: '2026-10-02T00:00:00Z',
  gross_cents: 8000, sender_name: 'Atelier Fittizio', note: 'Sketches',
});
const PAYPAL = payment({
  id: 3, source: 'paypal', transaction_id: 'PP-P1', shown_reference: 'PP-P1', paid_on: '2026-10-04T00:00:00Z',
  gross_cents: 12000, sender_name: 'Renée Fittizio', note: 'Portrait',
});
const BY_HAND = payment({
  id: 4, entry: 'manual', source: 'manual', method: 'bank_transfer', reference: 'RE-17', transaction_id: 'M-0011223344556677',
  shown_reference: 'RE-17', paid_on: '2026-10-05T00:00:00Z', gross_cents: 4500, sender_name: 'Mara Esempio', note: 'Poster',
});
const N26_REMOVED = payment({
  id: 5, source: 'n26', transaction_id: 'stmt-0123456789abcdef01234567', shown_reference: '', paid_on: '2026-10-06T00:00:00Z',
  gross_cents: 3000, sender_name: 'Laden Esempio', note: 'Refund', category: 'refund', removed_at: '2026-10-21T09:00:00Z',
});
const PAYMENTS = [N26_CSV, N26_CONFIRMED, PAYPAL, BY_HAND, N26_REMOVED];

const EXPENSES = [
  {
    id: 101, source: 'n26', entry: 'import', transaction_id: 'csv-abcdef0123456789abcdef01', shown_reference: '',
    paid_on: '2026-10-03T00:00:00Z', created_at: '2026-10-20T09:00:00Z', currency: 'EUR', amount_cents: 2399,
    reference: 'Colorificio Esempio', note: 'Paint', category: 'materials and supplies', client_id: null, removed_at: null,
  },
];

const DRAFT = {
  id: 12, status: 'draft', client_id: 1, client_name: 'Galerie Nord Esempio', invoice_number: null, number: null,
  issue_date: null, service_date_from: '2026-10-01T00:00:00Z', service_date_to: '2026-10-01T00:00:00Z', vat_rate_bp: 0,
  total_cents: 15000, currency: 'EUR',
};

async function open(page: Page, tab?: 'Book'): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    const removed = url.searchParams.get('removed') === 'true';
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', phone: '', instagram_url: '', telegram_url: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord Esempio', address: 'Nordweg 2' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: PAYMENTS.filter((p) => !!p.removed_at === removed) });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: EXPENSES.filter((e) => !!e.removed_at === removed) });
    if (path === '/invoicing/expense-categories') return json(route, 200, { categories: ['materials and supplies', 'other'].map((name, i) => ({ id: i + 1, name, counts_as: name, created_at: '2026-01-01T00:00:00Z' })) });
    if (path === '/invoicing/book/selection') return json(route, 200, { selection: { preset: 'everything', changed: false, income: ['paid_work', 'gift', 'loan', 'refund', 'other', 'uncategorised'], expense_all: true, expense: [] }, presets: [{ id: 'everything', name: 'Everything', builtin: true, income: ['paid_work', 'gift', 'loan', 'refund', 'other', 'uncategorised'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [DRAFT] });
    if (path === '/invoicing/invoices/12' && method === 'GET') {
      return json(route, 200, {
        invoice: DRAFT, client_name: DRAFT.client_name, warnings: [], payments: [N26_CSV, N26_CONFIRMED],
        line_items: [{ id: 1, position: 1, description: 'Mural', quantity_milli: 1000, unit_price_cents: 15000, line_total_cents: 15000 }],
      });
    }
    if (/^\/invoicing\/clients\/\d+\/stats$/.test(path)) return json(route, 200, { stats: { invoice_count: 0, payment_count: 0, totals: [] } });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
  if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
  // Open every month group, so every row is rendered.
  await page.locator('details').evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

/** Everything a person can read or hear on the page: its text, and every
 *  accessible name given by aria-label or title. */
const readable = (page: Page) => page.evaluate(() => [
  document.body.innerText,
  ...Array.from(document.querySelectorAll('[aria-label],[title]')).map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`),
].join('\n'));

async function expectNoDerivedID(page: Page, where: string): Promise<void> {
  const text = await readable(page);
  // Positive control: the page has rendered the rows it is checked over.
  expect(text, `${where}: the page shows its rows`).toMatch(/Galerie Nord Esempio|Laden Esempio/);
  expect(text.match(DERIVED), `${where}: a derived id is shown or announced`).toBeNull();
  expect(text, `${where}: a hand entry's id is shown or announced`).not.toContain('M-0011223344556677');
}

const checkbox = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true }).filter({ visible: true });

for (const [label, size] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]] as const) {
  test.describe(`#12257 at ${label}: rows are named by what the provider issued, never by a derived id`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
    });

    test('Transactions names an N26 row by its date and payer; provider ids and hand entries as before', async ({ page }) => {
      await open(page);
      await expect(checkbox(page, 'Select 2026-10-01 · Galerie Nord Esempio · Mural')).toHaveCount(1);
      await expect(checkbox(page, `Select ${CONFIRMATION}`)).toHaveCount(1);
      await expect(checkbox(page, 'Select PP-P1')).toHaveCount(1);
      // A hand entry is named by its date and "who · what", not by its own
      // reference nor its server-made id (#11567); this was "Select M-…".
      await expect(checkbox(page, 'Select 2026-10-05 · Mara Esempio · Poster')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Open draft for 2026-10-01 · Galerie Nord Esempio · Mural' }).filter({ visible: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: `Generate invoice for ${CONFIRMATION}` }).filter({ visible: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Generate invoice for 2026-10-05 · Mara Esempio · Poster' }).filter({ visible: true })).toHaveCount(1);
      await expectNoDerivedID(page, 'Transactions');
    });

    test('the removed view names an N26 row by its date and payer', async ({ page }) => {
      await open(page);
      await page.locator('[data-test="removed-show"]').click();
      const view = page.locator('[data-test="removed-view"]');
      await expect(view.getByRole('checkbox', { name: 'Select 2026-10-06 · Laden Esempio · Refund', exact: true })).toHaveCount(1);
      await expectNoDerivedID(page, 'the removed view');
    });

    test('the Book names an N26 row by its date and payer or payee', async ({ page }) => {
      await open(page, 'Book');
      await expect(page.locator('[data-test="book-panel"], [data-test="book"]').first()).toBeVisible();
      if (size.width < 640) {
        await expect(page.getByRole('button', { name: 'Edit payment for 2026-10-01 · Galerie Nord Esempio · Mural', exact: true })).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Edit expense for 2026-10-03 · Colorificio Esempio · Paint', exact: true })).toHaveCount(1);
        await expect(page.getByRole('button', { name: `Edit payment for ${CONFIRMATION}`, exact: true })).toHaveCount(1);
      }
      await expectNoDerivedID(page, 'the Book');
    });

    test('the draft names its N26 payment by date, payer and amount, and a confirmation by its id too', async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: 'Open draft for 2026-10-01 · Galerie Nord Esempio · Mural' }).filter({ visible: true }).click();
      const editor = page.locator('[data-test="invoice-editor"]');
      await expect(editor).toHaveAttribute('data-status', 'draft');
      // In #12274's form: amount, payer, the shown reference when there is
      // one, and the day. The derived csv-… id is never shown.
      const covers = editor.locator('.covers__item');
      await expect(covers).toHaveText(['€150.00 from Galerie Nord Esempio, 2026-10-01', `€80.00 from Atelier Fittizio (N26 ${CONFIRMATION}), 2026-10-02`]);
      await expectNoDerivedID(page, 'the draft dialog');
    });
  });
}
