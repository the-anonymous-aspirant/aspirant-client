import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * A Transactions row's invoice opens from the row (system_3 #11568, #11497
 * item 17; operator c71346 on #10985; design ack c71992 on #11568). "Draft"
 * or "Invoice 2026-014" is a link-variant button that opens the invoice view
 * the Invoices tab opens; the tab stays Transactions; closing returns focus to
 * the link, or to the row's Edit when the link is gone. Every call is answered
 * by an in-memory fake.
 */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  invoices: Json[];
  links: Record<number, number[]>;
  requests: Array<{ method: string; path: string }>;
  generateDelayMs?: number;
}

const pay = (over: Json): Json => ({
  kind: 'incoming', currency: 'EUR', sender_email: '', category: 'paid_work', client_id: 1, entry: 'import', created_at: '2026-07-01T00:00:00Z', ...over,
});

function newFake(): Fake {
  return {
    payments: [
      pay({ id: 10, transaction_id: 'TX-DRAFT', paid_on: '2026-07-20T00:00:00Z', gross_cents: 12000, sender_name: 'Galerie Nord', note: 'Portrait' }),
      pay({ id: 11, transaction_id: 'TX-ISSUED', paid_on: '2026-07-14T00:00:00Z', gross_cents: 35000, sender_name: 'Galerie Nord', note: 'Wandbild Juli' }),
      pay({ id: 12, transaction_id: 'M-hand-p', entry: 'manual', paid_on: '2026-07-10T00:00:00Z', gross_cents: 5000, sender_name: 'Mara Esempio', note: 'Sketch' }),
      pay({ id: 13, transaction_id: 'TX-OPEN', paid_on: '2026-07-08T00:00:00Z', gross_cents: 9000, sender_name: 'Galerie Nord', note: 'Poster' }),
    ],
    invoices: [
      { id: 7, status: 'draft', client_id: 1, invoice_number: null, issue_date: null, service_date_from: '2026-07-20T00:00:00Z', service_date_to: '2026-07-20T00:00:00Z', vat_rate_bp: 1900, currency: 'EUR', total_cents: 12000 },
      { id: 8, status: 'issued', client_id: 1, invoice_number: '2026-014', number: 14, issue_date: '2026-07-15T00:00:00Z', service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-14T00:00:00Z', vat_rate_bp: 1900, currency: 'EUR', total_cents: 35000 },
      { id: 9, status: 'draft', client_id: 1, invoice_number: null, issue_date: null, service_date_from: '2026-07-10T00:00:00Z', service_date_to: '2026-07-10T00:00:00Z', vat_rate_bp: 1900, currency: 'EUR', total_cents: 5000 },
    ],
    links: { 7: [10], 8: [11], 9: [12] },
    requests: [],
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// A payment names its live invoice, as aspirant-server's list does.
function withInvoice(fake: Fake, p: Json): Json {
  const inv = fake.invoices.find((i) => (fake.links[i.id] || []).includes(p.id) && i.status !== 'cancelled');
  return { ...p, on_invoice: !!inv, on_issued_invoice: inv?.status === 'issued', invoice: inv ? { id: inv.id, status: inv.status, invoice_number: inv.invoice_number } : undefined };
}

function detail(fake: Fake, inv: Json): Json {
  const payments = fake.payments.filter((p) => (fake.links[inv.id] || []).includes(p.id));
  return {
    invoice: inv,
    line_items: payments.map((p, i) => ({ id: i + 1, position: i + 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents })),
    payments,
    warnings: [],
  };
}

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: fake.payments.map((p) => withInvoice(fake, p)) });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: fake.invoices.map((i) => ({ ...i, client_name: 'Galerie Nord' })) });
    if (path === '/invoicing/invoices/generate' && method === 'POST') {
      if (fake.generateDelayMs) await new Promise((r) => setTimeout(r, fake.generateDelayMs));
      return json(route, 200, { invoices: [], skipped: [] });
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)$/);
    if (m) {
      const inv = fake.invoices.find((i) => i.id === Number(m[1]))!;
      if (method === 'GET') return json(route, 200, detail(fake, inv));
      if (method === 'DELETE') {
        fake.invoices = fake.invoices.filter((i) => i.id !== inv.id);
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
  // July holds every row; open its group if it is folded.
  const july = page.locator('details:has-text("July 2026")').first();
  if (await july.count()) await july.evaluate((d) => ((d as HTMLDetailsElement).open = true));
}

const ROWS = '[data-test="payment-row"]:visible';
const row = (page: Page, txn: string) => page.locator(ROWS).and(page.locator(`[data-txn="${txn}"]`));
const link = (page: Page, txn: string) => row(page, txn).locator('[data-test="row-invoice"]');
const editor = (page: Page) => page.locator('[data-test="invoice-editor"]');
const transactionsTab = (page: Page) => page.getByRole('tab', { name: 'Transactions', exact: true });

for (const [label, size] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]] as const) {
  test.describe(`#11568 at ${label}: a row's invoice opens from the row`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
    });

    test('a draft opens editable, named for its row; the tab stays Transactions; closing returns focus to the link', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await expect(link(page, 'TX-DRAFT')).toHaveText('Draft');
      await expect(link(page, 'TX-DRAFT')).toHaveAccessibleName('Open draft for TX-DRAFT');
      const box = (await link(page, 'TX-DRAFT').boundingBox())!;
      expect(box.height, 'the link button is at least 24px tall').toBeGreaterThanOrEqual(24);
      await link(page, 'TX-DRAFT').click();
      await expect(editor(page)).toHaveAttribute('data-status', 'draft');
      // The invoice view, not the payment's own Edit dialog.
      await expect(page.getByRole('dialog', { name: /Edit payment/ })).toHaveCount(0);
      await expect(transactionsTab(page)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Escape');
      await expect(editor(page)).toHaveCount(0);
      await expect(transactionsTab(page)).toHaveAttribute('aria-selected', 'true');
      await expect(link(page, 'TX-DRAFT')).toBeFocused();
    });

    test('an issued invoice opens read-only with its PDF to download', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await expect(link(page, 'TX-ISSUED')).toHaveText('Invoice 2026-014');
      await expect(link(page, 'TX-ISSUED')).toHaveAccessibleName('Open invoice 2026-014');
      await link(page, 'TX-ISSUED').click();
      await expect(editor(page)).toHaveAttribute('data-status', 'issued');
      await expect(page.locator('[data-test="invoice-pdf"]')).toBeVisible();
      await expect(page.locator('[data-test="invoice-pdf"]')).toHaveAttribute('href', /invoices\/8/);
    });

    test('a hand-entered row is named by its date and who · what', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await expect(link(page, 'M-hand-p')).toHaveAccessibleName(/^Open draft for .*2026.* · Mara Esempio · Sketch$/);
    });

    test('a deleted draft: focus goes to the row\'s Edit, and the row offers Generate invoice', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await link(page, 'TX-DRAFT').click();
      await expect(editor(page)).toHaveAttribute('data-status', 'draft');
      await page.locator('[data-test="draft-delete"]').click();
      await expect(editor(page)).toHaveCount(0);
      await expect(link(page, 'TX-DRAFT')).toHaveCount(0);
      await expect(row(page, 'TX-DRAFT').locator('[data-test="row-generate"]')).toBeVisible();
      await expect(row(page, 'TX-DRAFT').locator('[data-test="payment-edit"]:visible, [data-test="row-invoice"]')).toHaveCount(label === '1440' ? 1 : 0);
      if (label === '1440') await expect(row(page, 'TX-DRAFT').locator('[data-test="payment-edit"]')).toBeFocused();
    });

    test('while invoices are generated, the links are disabled', async ({ page }) => {
      const fake = newFake();
      fake.generateDelayMs = 2500;
      await open(page, fake);
      await row(page, 'TX-OPEN').locator('[data-test="row-generate"]').click();
      await expect(link(page, 'TX-DRAFT')).toBeDisabled();
      await expect(link(page, 'TX-ISSUED')).toBeDisabled();
      await expect(link(page, 'TX-DRAFT')).toBeEnabled({ timeout: 10000 });
    });
  });
}

test.describe('#11568 at 390: the card keeps its own tap', () => {
  test('a tap on the link opens the invoice and not the card; a tap beside it opens nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fake = newFake();
    await open(page, fake);
    const line = row(page, 'TX-ISSUED').locator('[data-test="row-invoice-line"]');
    const lineBox = (await line.boundingBox())!;
    const linkBox = (await link(page, 'TX-ISSUED').boundingBox())!;
    // Beside the word, on the same line.
    await page.mouse.click(Math.min(lineBox.x + lineBox.width - 4, linkBox.x + linkBox.width + 40), linkBox.y + linkBox.height / 2);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // A tap elsewhere on the card still opens the payment.
    await row(page, 'TX-ISSUED').locator('[data-test="row-amount"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(editor(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await link(page, 'TX-ISSUED').click();
    await expect(editor(page)).toHaveAttribute('data-status', 'issued');
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});
