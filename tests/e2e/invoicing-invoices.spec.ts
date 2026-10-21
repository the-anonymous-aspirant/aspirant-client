import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, D1 (system_3 #8367-D1): create a draft from paid-work
 *  payments, edit it, issue it, cancel it (Storno). The fake below keeps a
 *  small invoice state machine so the page sees the server's answers; the
 *  catch-all /api/ → 404 is registered first (vite preview would otherwise
 *  proxy an unstubbed call to the live server). */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  invoices: Json[];
  items: Record<number, Json[]>;
  links: Record<number, number[]>;
  requests: Array<{ method: string; path: string; body: string }>;
  issueFailure?: { status: number; body: Json };
}

function newFake(): Fake {
  return {
    payments: [
      { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'paid_work', client_id: 1, bank_deposit_id: null },
      { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 12000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Portrait', category: 'paid_work', client_id: 1, bank_deposit_id: null },
      { id: 12, kind: 'incoming', transaction_id: 'TX3', paid_on: '2026-07-21T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null, bank_deposit_id: null },
    ],
    invoices: [],
    items: {},
    links: {},
    requests: [],
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function detail(fake: Fake, inv: Json): Json {
  const payments = fake.payments.filter((p) => (fake.links[inv.id] || []).includes(p.id));
  return { invoice: inv, line_items: fake.items[inv.id] || [], payments, warnings: [] };
}

async function mockAll(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() || '';
    fake.requests.push({ method, path, body });

    if (path === '/invoicing/profile') {
      return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    }
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/invoices' && method === 'GET') {
      return json(route, 200, { invoices: fake.invoices.map((i) => ({ ...i, client_name: i.client_id === 1 ? 'Galerie Nord' : '' })) });
    }
    if (path === '/invoicing/invoices' && method === 'POST') {
      const ids: number[] = JSON.parse(body).payment_ids;
      const id = 100 + fake.invoices.length;
      const ps = fake.payments.filter((p) => ids.includes(p.id));
      const total = ps.reduce((s, p) => s + p.gross_cents, 0);
      const inv = { id, status: 'draft', client_id: 1, service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-20T00:00:00Z', vat_rate_bp: 1900, currency: 'EUR', invoice_number: null, issue_date: null, total_cents: total };
      fake.invoices.push(inv);
      fake.links[id] = ids;
      fake.items[id] = ps.map((p, i) => ({ id: i + 1, position: i + 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents }));
      return json(route, 201, detail(fake, inv));
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)(\/issue|\/cancel)?$/);
    if (m) {
      const inv = fake.invoices.find((i) => i.id === Number(m[1]))!;
      if (!m[2] && method === 'GET') return json(route, 200, detail(fake, inv));
      if (!m[2] && method === 'PUT') {
        const patch = JSON.parse(body);
        if (patch.line_items) {
          fake.items[inv.id] = patch.line_items.map((li: Json, i: number) => ({ id: i + 1, position: i + 1, ...li, line_total_cents: Math.round((li.quantity_milli * li.unit_price_cents) / 1000) }));
          inv.total_cents = fake.items[inv.id].reduce((s, it) => s + it.line_total_cents, 0);
        }
        return json(route, 200, detail(fake, inv));
      }
      if (!m[2] && method === 'DELETE') {
        fake.invoices = fake.invoices.filter((i) => i.id !== inv.id);
        return route.fulfill({ status: 204, body: '' });
      }
      if (m[2] === '/issue') {
        if (fake.issueFailure) return json(route, fake.issueFailure.status, fake.issueFailure.body);
        Object.assign(inv, { status: 'issued', invoice_number: '2026-001', number: 1, issue_date: '2026-10-21T00:00:00Z' });
        return json(route, 200, detail(fake, inv));
      }
      if (m[2] === '/cancel') {
        Object.assign(inv, { status: 'cancelled', cancel_reason: JSON.parse(body).reason, cancelled_at: '2026-10-22T09:00:00Z' });
        return json(route, 200, detail(fake, inv));
      }
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mockAll(page, fake);
  await seedTrustedSessionAs(page, 'flowah');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
}

async function createFromTwo(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Select TX1 for an invoice' }).check();
  await page.getByRole('checkbox', { name: 'Select TX2 for an invoice' }).check();
  await page.locator('[data-test="create-invoice"]').click();
  await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
}

test.describe('#8367 Invoices app — draft, issue, Storno', () => {
  test('selecting paid-work payments creates a prefilled draft; a gift offers no checkbox', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);

    await expect(page.getByRole('checkbox', { name: 'Select TX3 for an invoice' })).toHaveCount(0);
    await expect(page.locator('[data-test="create-invoice"]')).toBeDisabled();
    await createFromTwo(page);

    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/invoicing/invoices')!;
    expect(JSON.parse(post.body)).toEqual({ payment_ids: [10, 11] });
    await expect(page.locator('[data-test="draft-line"]')).toHaveCount(2);
    await expect(page.getByLabel('Description, line 1')).toHaveValue('Wandbild Juli');
  });

  test('editing a line sends exact integer quantities and cents', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);

    await page.getByLabel('Description, line 1').fill('Portrait, Öl auf Leinwand');
    await page.getByLabel('Quantity, line 1').fill('2,5');
    await page.getByLabel('Unit price, line 1').fill('19.99');
    await page.locator('[data-test="draft-save"]').click();
    await expect.poll(() => fake.requests.filter((r) => r.method === 'PUT').length).toBe(1);

    const put = JSON.parse(fake.requests.find((r) => r.method === 'PUT')!.body);
    expect(put.line_items[0]).toEqual({ description: 'Portrait, Öl auf Leinwand', quantity_milli: 2500, unit_price_cents: 1999 });
    for (const key of ['issue_date', 'invoice_number', 'number', 'status']) expect(put).not.toHaveProperty(key);
  });

  test('issuing asks first, sends no date or number, then shows the server-assigned ones', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);

    await page.locator('[data-test="draft-issue"]').click();
    await expect(page.locator('[data-test="issue-confirm"]')).toContainText('next number (2026-001)');
    expect(fake.requests.some((r) => r.path.endsWith('/issue'))).toBe(false);
    await page.locator('[data-test="issue-confirm-button"]').click();

    const editor = page.locator('[data-test="invoice-editor"][data-status="issued"]');
    await expect(editor).toBeVisible();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');
    await expect(page.locator('[data-test="invoice-issue-date"]')).toHaveText('2026-10-21');
    const issue = fake.requests.find((r) => r.path.endsWith('/issue'))!;
    expect(issue.body).toBe('');
    // Read-only: no inputs, and the PDF is a link to the stored document.
    await expect(editor.locator('input')).toHaveCount(0);
    await expect(page.locator('[data-test="invoice-pdf"]')).toHaveAttribute('href', '/api/invoicing/invoices/100/pdf');
  });

  test('a refused issue shows the server reason and stays a draft', async ({ page }) => {
    const fake = newFake();
    fake.issueFailure = { status: 422, body: { error: { code: 'line_items_incomplete', message: 'line item 1 needs a description, a quantity above zero and a price above zero' } } };
    await open(page, fake);
    await createFromTwo(page);

    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-error"]')).toContainText('needs a description');
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
  });

  test('Storno needs a reason, then marks the invoice cancelled', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');

    await page.locator('[data-test="invoice-cancel"]').click();
    await page.locator('[data-test="invoice-cancel-confirm"]').click();
    await expect(page.locator('[data-test="invoice-error"]')).toContainText('Give a reason');
    expect(fake.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false);

    await page.getByLabel('Reason for the cancellation (Storno)').fill('Falsche Adresse');
    await page.locator('[data-test="invoice-cancel-confirm"]').click();
    await expect(page.locator('[data-test="invoice-status"]')).toHaveText('Cancelled');
    await expect(page.locator('[data-test="invoice-cancelled"]')).toContainText('Falsche Adresse');
    expect(JSON.parse(fake.requests.find((r) => r.path.endsWith('/cancel'))!.body)).toEqual({ reason: 'Falsche Adresse' });
  });

  test('deleting a draft removes it from the Invoices tab', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-delete"]').click();
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);
    expect(fake.requests.some((r) => r.method === 'DELETE' && r.path === '/invoicing/invoices/100')).toBe(true);

    await page.getByRole('tab', { name: 'Invoices' }).click();
    await expect(page.locator('[data-test="invoices-empty"]')).toBeVisible();
  });

  test('the Invoices tab lists invoices and reopens one', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Invoices' }).click();
    const row = page.locator('[data-test="invoice-row"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('2026-001');
    await expect(row).toContainText('Issued');
    await expect(row).toContainText('Galerie Nord');
    await row.click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');
  });

  test('a line description is rendered as text, never as markup', async ({ page }) => {
    const fake = newFake();
    fake.payments[0].note = '<img src=x onerror="window.__xss=1">';
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();

    const item = page.locator('[data-test="issued-item"]').first();
    await expect(item).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(item.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});
