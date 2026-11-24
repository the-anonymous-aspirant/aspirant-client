import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

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
  // #12267: when the Storno happened, and how the PDF route answers.
  cancelledAt?: string;
  pdf?: { status: number; body?: Json };
  clients?: Json[];
  kleinunternehmer?: boolean;
  currency?: string;
  steuernummer?: string;
}

function newFake(): Fake {
  return {
    payments: [
      { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'paid_work', client_id: 1 },
      { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 12000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Portrait', category: 'paid_work', client_id: 1 },
      { id: 12, kind: 'incoming', transaction_id: 'TX3', paid_on: '2026-07-21T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null },
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
      return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: fake.steuernummer ?? '12/345/67890', email: '', is_kleinunternehmer: fake.kleinunternehmer !== false, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    }
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients || [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: fake.payments });
    // #8376 (D2): the invoice detail loads its audit history.
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/invoices' && method === 'GET') {
      return json(route, 200, { invoices: fake.invoices.map((i) => ({ ...i, client_name: i.client_id === 1 ? 'Galerie Nord' : '' })) });
    }
    if (path === '/invoicing/invoices' && method === 'POST') {
      const ids: number[] = JSON.parse(body).payment_ids;
      const id = 100 + fake.invoices.length;
      const ps = fake.payments.filter((p) => ids.includes(p.id));
      const total = ps.reduce((s, p) => s + p.gross_cents, 0);
      const inv = { id, status: 'draft', client_id: 1, service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-20T00:00:00Z', vat_rate_bp: 1900, currency: fake.currency || 'EUR', invoice_number: null, issue_date: null, total_cents: total };
      fake.invoices.push(inv);
      fake.links[id] = ids;
      fake.items[id] = ps.map((p, i) => ({ id: i + 1, position: i + 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents }));
      return json(route, 201, detail(fake, inv));
    }
    // One ticked row on a phone (system_3 #11371): the bar's Generate
    // invoice offers the same draft through the one-at-a-time review.
    if (path === '/invoicing/invoices/generate' && method === 'POST') {
      const ids: number[] = JSON.parse(body).payment_ids;
      const out = ids.map((pid) => {
        const p = fake.payments.find((pp) => pp.id === pid)!;
        const id = 100 + fake.invoices.length;
        const inv = { id, status: 'draft', client_id: p.client_id, service_date_from: p.paid_on, service_date_to: p.paid_on, vat_rate_bp: 1900, currency: fake.currency || 'EUR', invoice_number: null, issue_date: null, total_cents: p.gross_cents };
        fake.invoices.push(inv);
        fake.links[id] = [pid];
        fake.items[id] = [{ id: 1, position: 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents }];
        return detail(fake, inv);
      });
      return json(route, out.length ? 201 : 200, { invoices: out, skipped: [] });
    }
    if (/^\/invoicing\/invoices\/\d+\/pdf$/.test(path) && method === 'GET') {
      const inv = fake.invoices.find((i) => path === `/invoicing/invoices/${i.id}/pdf`)!;
      if (fake.pdf && fake.pdf.status !== 200) return json(route, fake.pdf.status, fake.pdf.body || {});
      const name = inv.status === 'cancelled' ? `Rechnung-${inv.invoice_number}-storniert.pdf` : `Rechnung-${inv.invoice_number}.pdf`;
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="${name}"` },
        body: '%PDF-1.4\n%%EOF\n',
      });
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
        Object.assign(inv, { status: 'cancelled', cancel_reason: JSON.parse(body).reason, cancelled_at: fake.cancelledAt || '2026-10-22T09:00:00Z' });
        return json(route, 200, detail(fake, inv));
      }
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mockAll(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
}

async function createFromTwo(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Select TX1' }).check();
  await page.getByRole('checkbox', { name: 'Select TX2' }).check();
  await page.locator('[data-test="create-invoice"]').click();
  await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
}

// Below 640px one ticked row has no Create invoice (system_3 #11371): the
// bar offers Generate invoice alone, which opens the same draft through the
// one-at-a-time review instead of the plain POST /invoicing/invoices path.
async function createFromOne(page: Page, isMobile: boolean, txn: string): Promise<void> {
  await page.getByRole('checkbox', { name: `Select ${txn}` }).check();
  await page.locator(isMobile ? '[data-test="generate-selected"]' : '[data-test="create-invoice"]').click();
  await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
}

test.describe('#8367 Invoices app — draft, issue, Storno', () => {
  // #9873: every row has a checkbox (it also feeds Set category); a
  // selection holding a gift cannot create an invoice, and the caption says
  // why (design_agent c60951 rule 6).
  test('selecting paid-work payments creates a prefilled draft; a selected gift blocks it with a caption', async ({ page, isMobile }) => {
    const fake = newFake();
    await open(page, fake);

    // Below 640px nothing of the bar is on the page while nothing is ticked,
    // and one ticked row never offers Create invoice at all (system_3
    // #11371); above it the button is always there, just disabled.
    if (isMobile) await expect(page.locator('[data-test="create-invoice"]')).toHaveCount(0);
    else await expect(page.locator('[data-test="create-invoice"]')).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Select TX3' }).check();
    if (isMobile) await expect(page.locator('[data-test="create-invoice"]')).toHaveCount(0);
    else await expect(page.locator('[data-test="create-invoice"]')).toBeDisabled();
    await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveText('1 of the 1 selected is not Paid work. Untick it to create or generate invoices.');
    await page.getByRole('checkbox', { name: 'Select TX3' }).uncheck();
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

  // #9934-B1 (operator c61373): Save draft closes the modal.
  test('saving a draft closes the editor modal', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);

    await page.locator('[data-test="draft-save"]').click();
    await expect.poll(() => fake.requests.filter((r) => r.method === 'PUT').length).toBe(1);
    await expect(page.locator('[data-test="invoice-editor"]')).toBeHidden();
  });

  test('issuing asks first, sends no date or number, then shows the server-assigned ones', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);

    // A client with an address gets no §33 note (#9835).
    await expect(page.locator('[data-test="draft-no-address"]')).toHaveCount(0);
    await page.locator('[data-test="draft-issue"]').click();
    await expect(page.locator('[data-test="issue-confirm"]')).toContainText('Issuing gives it number 2026-001 and today');
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

  // system_3 #12274: the refusal is worded by the app from its code and
  // figures; the server's sentence is never shown as written.
  test('a refused issue says why in the app\'s words and stays a draft', async ({ page }) => {
    const fake = newFake();
    fake.issueFailure = { status: 422, body: { error: { code: 'line_items_incomplete', message: 'line item 1 needs a description, a quantity above zero and a price above zero', details: { position: 1 } } } };
    await open(page, fake);
    await createFromTwo(page);

    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-error"]')).toHaveText('Line 1 needs a description, a quantity above zero and a price above zero.');
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
  });

  // #9835 (§33 UStDV): a client without an address can be invoiced up to
  // 250 € gross. The draft says so; above that, the server refuses and the
  // editor shows its reason, which names the total and the threshold.
  test('a client without an address: the draft says up to 250 €, and the refusal above it is shown', async ({ page }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    fake.issueFailure = {
      status: 422,
      body: {
        error: {
          code: 'client_address_required',
          message: "the client has no postal address, and this invoice totals 470,00 € gross: above 250,00 € an invoice must name the recipient's full address (§14 Abs. 4 UStG, §34a UStDV). Add the client's postal address to issue it",
          details: { total_cents: 47000, limit_cents: 25000, currency: 'EUR' },
        },
      },
    };
    await open(page, fake);
    await createFromTwo(page);

    // #9949: over the limit, the note is a warning naming the total and the client.
    const note = page.locator('[data-test="draft-no-address"]');
    await expect(note).toHaveAttribute('data-level', 'caution');
    await expect(note).toContainText('Address needed to issue');
    await expect(page.locator('[data-test="draft-no-address-text"]')).toHaveText(
      "This invoice totals €470.00 gross. Above €250.00 it must name Galerie Nord's postal address. Save the draft, then add it under Clients.",
    );
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-error"]')).toHaveText(
      "This invoice totals €470.00. Above €250.00 an invoice needs the client's postal address. Add it under Clients.",
    );
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
  });

  // system_3 #11554 (#11497 item 14; operator c71213 on #10985; design ack
  // on #11554): the draft shows, before Accept, the address the invoice will
  // print. It is the client's record as the PDF's recipient block prints it
  // under the name. The client's email is saved with the invoice and not
  // printed, so it is not shown.
  test.describe('#11554 the draft shows the address the invoice will print', () => {
    const block = (page: Page) => page.locator('[data-test="draft-client-address"]');
    const lines = (page: Page) => page.locator('[data-test="draft-client-address-line"]');
    const clientSelect = (page: Page) => page.locator('[data-test="invoice-editor"]').getByRole('combobox', { name: 'Client' });
    const withClients = (clients: Json[]) => {
      const fake = newFake();
      fake.clients = clients;
      return fake;
    };
    const nord = { id: 1, name: 'Galerie Nord', address: '  Nordweg 2  \n\n13353 Berlin\n', email: 'buero@galerie.test', paypal_email: '' };

    test('a client with an address: its lines under the Client select, trimmed, empty lines dropped, and no email', async ({ page }) => {
      const fake = withClients([nord]);
      await open(page, fake);
      await createFromTwo(page);
      await expect(block(page)).toBeVisible();
      await expect(block(page).locator('span').first()).toHaveText('Address on the invoice');
      // The PDF's recipient block under the name: the same lines, in order.
      await expect(lines(page)).toHaveText(['Nordweg 2', '13353 Berlin']);
      await expect(block(page).locator('span').last()).toHaveText('To change it, edit the client under Clients.');
      await expect(block(page)).not.toContainText('buero@galerie.test');
      await expect(block(page).locator('a, button, input')).toHaveCount(0);
      // An address is there, so the lines about a missing one are not.
      await expect(page.locator('[data-test="draft-no-address"]')).toHaveCount(0);
    });

    test('a client with an email and no address: no block, and the existing line', async ({ page }) => {
      const fake = withClients([{ id: 1, name: 'Galerie Nord', address: '  \n ', email: 'buero@galerie.test', paypal_email: '' }]);
      await open(page, fake);
      await createFromTwo(page);
      await expect(block(page)).toHaveCount(0);
      await expect(page.locator('[data-test="draft-no-address"]')).toBeVisible();
      await expect(page.locator('[data-test="invoice-editor"]')).not.toContainText('buero@galerie.test');
    });

    test('switching the client changes the block at once, with no request', async ({ page }) => {
      const fake = withClients([nord, { id: 2, name: 'Atelier Süd', address: 'Südring 9\n04107 Leipzig', email: '', paypal_email: '' }, { id: 3, name: 'Ohne Adresse', address: '', email: '', paypal_email: '' }]);
      await open(page, fake);
      await createFromTwo(page);
      await expect(lines(page)).toHaveText(['Nordweg 2', '13353 Berlin']);
      const before = fake.requests.length;
      await clientSelect(page).click();
      await page.getByRole('option', { name: 'Atelier Süd', exact: true }).click();
      await expect(lines(page)).toHaveText(['Südring 9', '04107 Leipzig']);
      await clientSelect(page).click();
      await page.getByRole('option', { name: 'Ohne Adresse', exact: true }).click();
      await expect(block(page)).toHaveCount(0);
      expect(fake.requests.length, 'the client list is already in the editor').toBe(before);
    });

    test('after the address is changed under Clients, the reopened draft shows the new one', async ({ page }) => {
      const fake = withClients([nord]);
      await open(page, fake);
      await createFromTwo(page);
      await expect(lines(page)).toHaveText(['Nordweg 2', '13353 Berlin']);
      await page.locator('[data-test="draft-save"]').click();
      await expect(page.locator('[data-test="invoice-editor"]')).toBeHidden();
      // The record changes (as an edit under Clients does), and the page is
      // read again.
      fake.clients = [{ ...nord, address: 'Neue Straße 5\n10115 Berlin' }];
      await page.reload();
      await dismissMobileSidebarIfPresent(page);
      await page.getByRole('tab', { name: 'Invoices' }).click();
      await page.locator('[data-test="invoice-row"]').first().click();
      await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
      await expect(lines(page)).toHaveText(['Neue Straße 5', '10115 Berlin']);
    });

    test('at 1440×900 the block is under the select, no wider, and the fields keep one top edge with and without it', async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', 'a desktop width');
      await page.setViewportSize({ width: 1440, height: 900 });
      const tops = async () => {
        const client = (await clientSelect(page).boundingBox())!;
        const from = (await page.locator('[data-test="draft-from"]').boundingBox())!;
        const to = (await page.locator('[data-test="draft-to"]').boundingBox())!;
        return { client, from, to };
      };
      const fake = withClients([nord, { id: 3, name: 'Ohne Adresse', address: '', email: '', paypal_email: '' }]);
      await open(page, fake);
      await createFromTwo(page);
      const withBlock = await tops();
      const b = (await block(page).boundingBox())!;
      expect(Math.abs(b.x - withBlock.client.x), 'left-aligned with the select').toBeLessThanOrEqual(1);
      expect(b.x + b.width, 'no wider than the select').toBeLessThanOrEqual(withBlock.client.x + withBlock.client.width + 1);
      expect(b.y, 'under the select').toBeGreaterThanOrEqual(withBlock.client.y + withBlock.client.height);
      // The inputs' lower edges line up, with the block there.
      const bottom = (r: { y: number; height: number }) => Math.round(r.y + r.height);
      expect([bottom(withBlock.from), bottom(withBlock.to)]).toEqual([bottom(withBlock.client), bottom(withBlock.client)]);
      await clientSelect(page).click();
      await page.getByRole('option', { name: 'Ohne Adresse', exact: true }).click();
      await expect(block(page)).toHaveCount(0);
      const without = await tops();
      // One top edge for the select and the two dates, with the block and
      // without it. (The dialog is centred, so the row's own position on the
      // screen follows the dialog's height; the fields' edges relative to
      // each other are what the block must not disturb.)
      const oneTop = (t: typeof withBlock) => new Set([t.client.y, t.from.y, t.to.y].map(Math.round)).size;
      expect(oneTop(withBlock), 'with the block').toBe(1);
      expect(oneTop(without), 'without the block').toBe(1);
      expect([without.client.height, without.from.height].map(Math.round)).toEqual([withBlock.client.height, withBlock.from.height].map(Math.round));
    });

    test('at 360px a long address line wraps and nothing scrolls sideways', async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile-safari', 'a phone width');
      await page.setViewportSize({ width: 360, height: 780 });
      const long = 'Hinterhaus, dritter Stock links, Eingang über den Hof der Kulturbrauerei-Nebengebäude';
      const fake = withClients([{ ...nord, address: `${long}\n10435 Berlin` }]);
      await open(page, fake);
      await createFromOne(page, true, 'TX1');
      await expect(lines(page)).toHaveText([long, '10435 Berlin']);
      const first = lines(page).first();
      const rects = await first.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      });
      expect(rects, 'the long line wraps').toBeGreaterThan(1);
      const b = (await block(page).boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(360);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });

  test('a client without an address: a small invoice issues', async ({ page, isMobile }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await createFromOne(page, isMobile, 'TX2');

    const note = page.locator('[data-test="draft-no-address"]');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    await expect(note).toContainText('Needed over €250.00 gross. Add it under Clients.');
    // draft-issue is a normal-draft action; one row's draft on a phone opens
    // in the review instead (system_3 #11371), so leave it for later first
    // and reopen it from the Invoices tab to reach the same controls.
    if (isMobile) {
      await page.locator('[data-test="review-later"]').click();
      await page.getByRole('tab', { name: 'Invoices' }).click();
      await page.locator('[data-test="invoice-row"][data-status="draft"]').click();
    }
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="issued"]')).toBeVisible();
  });

  // #9949 (operator c61373): the note follows the draft's own gross as ze
  // edits, before any save, computed the way the server computes it at issue.
  test('a client without an address: the note turns into a warning as the draft crosses 250 €', async ({ page, isMobile }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await createFromOne(page, isMobile, 'TX2');
    const note = page.locator('[data-test="draft-no-address"]');
    const price = page.getByLabel('Unit price, line 1');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    const sent = fake.requests.length;
    await price.fill('250');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    await price.fill('250.01');
    await expect(note).toHaveAttribute('data-level', 'caution');
    await expect(page.locator('[data-test="draft-no-address-text"]')).toContainText('totals €250.01 gross');
    // An extra line that is not a number yet does not hide the warning.
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(note).toHaveAttribute('data-level', 'caution');
    await price.fill('100');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    expect(fake.requests.slice(sent).filter((r) => r.method !== 'GET'), 'nothing is saved while ze types').toEqual([]);
  });

  // system_3 #12261: with VAT charged a draft is priced from what was
  // received, so the typed price already holds its VAT.
  test('with VAT charged, the typed price is the gross the warning counts', async ({ page, isMobile }) => {
    const fake = newFake();
    fake.kleinunternehmer = false;
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await createFromOne(page, isMobile, 'TX2');
    const note = page.locator('[data-test="draft-no-address"]');
    const price = page.getByLabel('Unit price, line 1');
    await price.fill('250');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    await price.fill('250.01');
    await expect(note).toHaveAttribute('data-level', 'caution');
    await expect(page.locator('[data-test="draft-no-address-text"]')).toContainText('totals €250.01 gross');
  });

  test('an invoice in another currency needs the address at any total', async ({ page, isMobile }) => {
    const fake = newFake();
    fake.currency = 'USD';
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await createFromOne(page, isMobile, 'TX2');
    await expect(page.locator('[data-test="draft-no-address"]')).toHaveAttribute('data-level', 'caution');
    await expect(page.locator('[data-test="draft-no-address-text"]')).toHaveText(
      "An invoice in USD must name Galerie Nord's postal address. Save the draft, then add it under Clients.",
    );
  });

  // design_agent c61924: what stops Issue reads in one grammar, each badge
  // naming what is missing.
  test('both guards at once read as two caution lines in one grammar', async ({ page }) => {
    const fake = newFake();
    fake.steuernummer = '';
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await createFromTwo(page);
    const blocked = page.locator('.issue-blocked');
    await expect(blocked).toHaveCount(2);
    await expect(blocked.nth(0)).toContainText('Tax number needed to issue');
    await expect(blocked.nth(1)).toContainText('Address needed to issue');
    await expect(page.locator('.issue-blocked .badge--status-caution')).toHaveCount(2);
  });

  test('a client with an address gets no note at any total', async ({ page, isMobile }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromOne(page, isMobile, 'TX2');
    await page.getByLabel('Unit price, line 1').fill('9000');
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
    await expect(page.locator('[data-test="draft-no-address"]')).toHaveCount(0);
  });

  test('Storno needs a reason, then marks the invoice cancelled', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');

    await page.locator('[data-test="invoice-cancel"]').click();
    // The reason box sits below the PDF preview, Payments covered and
    // History; the click scrolls it into view and focuses it so it does not
    // read as having done nothing (operator ask, #9926-A5).
    const reasonInput = page.getByLabel('Reason for the cancellation (Storno)');
    await expect(page.locator('[data-test="cancel-step"]')).toBeInViewport();
    await expect(reasonInput).toBeFocused();
    await page.locator('[data-test="invoice-cancel-confirm"]').click();
    // At the reason box, which has focus again (system_3 #12298).
    const reasonField = page.locator('[data-test="cancel-step"] .field');
    await expect(reasonField).toContainText('Give a reason for the cancellation.');
    await expect(reasonInput).toBeFocused();
    await expect(page.locator('[data-test="invoice-error"]')).toHaveCount(0);
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

    // The tab opens on the month whose paid work is still to invoice
    // (system_3 #11505), so the empty list is that month's; under All months
    // it is the book's, as before.
    await page.getByRole('tab', { name: 'Invoices' }).click();
    await expect(page.locator('[data-test="invoices-month-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Work done in' }).click();
    await page.getByRole('option', { name: 'All months', exact: true }).click();
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

  // @security N7 (c51503 on #8372): an unknown currency code from an uploaded
  // file must not break the payments table.
  test('a payment with a non-ISO currency still renders', async ({ page }) => {
    const fake = newFake();
    fake.payments[2].currency = 'X1';
    await open(page, fake);
    await expect(page.locator('[data-test="payment-row"]')).toHaveCount(3);
    await expect(page.locator('[data-test="payment-row"][data-txn="TX3"]')).toContainText('50.00 X1');
  });
});

// system_3 #10032 (operator c61358; wording per design_agent c62042): a "?"
// beside each field label says what the field means. On a phone a tap opens
// it without focusing the field (DS AspLabelHint, #10033); a second tap
// closes it. No hint repeats its field's own visible hint line.
// A cancelled invoice never leaves the app looking valid (system_3 #12267):
// its download is a copy marked "STORNIERT am …", the button says so, and
// when the server cannot make the copy the dialog says that instead of a new
// tab showing an error. The Storno's day is the Berlin day.
test.describe('#12267 a cancelled invoice downloads marked', () => {
  async function issueAndCancel(page: Page): Promise<void> {
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');
    await expect(page.locator('[data-test="invoice-pdf"]')).toHaveText('Download PDF');
    await page.locator('[data-test="invoice-cancel"]').click();
    await page.getByLabel('Reason for the cancellation (Storno)').fill('Falsche Adresse');
    await page.locator('[data-test="invoice-cancel-confirm"]').click();
    await expect(page.locator('[data-test="invoice-status"]')).toHaveText('Cancelled');
  }

  test('the button names the mark, the file is the marked copy, and the day is Berlin\'s', async ({ page }) => {
    const fake = newFake();
    // 23:30 UTC on 21 October is 01:30 on 22 October in Berlin.
    fake.cancelledAt = '2026-10-21T23:30:00Z';
    await open(page, fake);
    await issueAndCancel(page);

    await expect(page.locator('[data-test="invoice-cancelled"]')).toHaveText('Cancelled on 2026-10-22: Falsche Adresse');
    const link = page.locator('[data-test="invoice-pdf"]');
    await expect(link).toHaveText('Download PDF (marked cancelled)');
    const file = page.waitForEvent('download');
    await link.click();
    expect((await file).suggestedFilename()).toBe('Rechnung-2026-001-storniert.pdf');
    await expect(page.locator('[data-test="invoice-pdf-error"]')).toHaveCount(0);
    expect(page.context().pages()).toHaveLength(1);
  });

  test('when the marked copy cannot be made, the dialog says so and nothing downloads', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await issueAndCancel(page);
    fake.pdf = { status: 500, body: { error: { code: 'cancelled_mark_failed', message: 'The marked copy could not be made.' } } };

    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.locator('[data-test="invoice-pdf"]').click();
    const error = page.locator('[data-test="invoice-pdf-error"]');
    await expect(error).toHaveText('The marked copy could not be made.');
    await expect(error).toHaveAttribute('role', 'alert');
    expect(downloaded).toBe(false);
    expect(page.context().pages()).toHaveLength(1);
  });
});

test.describe('#10032 the invoicing fields explain themselves', () => {
  // `marks` is how many "?" the scope shows: on a phone every line item is
  // captioned, so a line's labels (and hints) repeat per line.
  const tapEach = async (page: Page, scope: Locator, expected: Record<string, string>, marks = Object.keys(expected).length) => {
    await expect(scope.locator('[data-asp-label-hint]')).toHaveCount(marks);
    for (const [label, text] of Object.entries(expected)) {
      const mark = scope.getByRole('button', { name: `More about ${label}`, exact: true }).first();
      await mark.scrollIntoViewIfNeeded();
      const b = (await mark.boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await expect(page.getByRole('tooltip')).toHaveText(text);
      const focused = await page.evaluate(() => !!document.activeElement && document.activeElement.hasAttribute('data-asp-label-hint'));
      expect(focused, `${label}: the tap focuses the mark, not the field`).toBe(true);
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
  };

  test('the draft editor: Client, both service dates, Description and Unit price; Quantity has none', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    const editor = page.locator('[data-test="invoice-editor"]');
    await tapEach(page, editor, {
      Client: 'Who the invoice is for. Their name and address are printed on it.',
      'Service date (from)': 'The day the work was done, or the first day if it ran over several days.',
      'Service until (optional)': 'The last day, if the work ran over several days.',
      Description: 'What the work was. This is the line on the invoice.',
      'Unit price (€)': 'The price for one, before tax.',
    }, 7); // Client, two dates, and Description + Unit price on each of the two lines
    await expect(editor.getByRole('button', { name: 'More about Quantity', exact: true })).toHaveCount(0);
    // A tap on a date's own label still focuses the date.
    await editor.getByText('Service date (from)', { exact: true }).click();
    await expect(page.locator('[data-test="draft-from"]')).toBeFocused();
  });

  // system_3 #12261 (design_agent c76335, c76345): with VAT charged a draft
  // is priced from what was received, so the price and the rate read as tax
  // inside; the caption stays one line at a phone's width and a desktop's.
  for (const width of [390, 1440]) {
    test(`with VAT charged, Unit price says incl. VAT and both texts say tax inside, at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const fake = newFake();
      fake.kleinunternehmer = false;
      await open(page, fake);
      await createFromTwo(page);
      const editor = page.locator('[data-test="invoice-editor"]');
      await tapEach(page, editor, {
        'VAT rate (%)': 'The tax inside the price. Usually 19.',
        'Unit price (€, incl. VAT)': 'The price for one, tax included.',
      }, width < 640 ? 8 : 6); // Client, two dates, VAT rate, and Description + Unit price (on a phone, on each line)
      await expect(editor.getByText('Unit price (€)', { exact: true })).toHaveCount(0);
      await editor.locator('[data-test="draft-lines"]').screenshot({ path: test.info().outputPath(`lines-${width}.png`) });
      const caption = (await editor.getByText('Unit price (€, incl. VAT)', { exact: true }).first().boundingBox())!;
      // One line on a desktop; on a phone at most two, broken before the bracket.
      expect(caption.height, 'the caption\'s lines').toBeLessThan(width < 640 ? 48 : 24);
      // The inputs of a line still start level.
      const qty = (await page.getByLabel('Quantity, line 1').boundingBox())!;
      const price = (await page.getByLabel('Unit price, line 1').boundingBox())!;
      expect(Math.abs(qty.y - price.y), 'Quantity and Unit price start level').toBeLessThanOrEqual(1);
    });
  }

  // §3.142 Decision 2 (design_agent c65348 on #10539): "Paid by" replaces
  // Client and "Payer (optional)", and carries no "?" hint of its own —
  // Decision 3's own line under the field says what Save will do with it.
  test('Enter payment by hand: Reference and What it was for; Amount, Method and Paid by have none', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const fake = newFake();
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    const form = page.locator('[data-test="manual-form"]');
    await tapEach(page, form, {
      'Reference (optional)': 'A number from the bank or the payer, if there is one.',
      'What it was for (optional)': 'Becomes the invoice line if you invoice this payment.',
    });
    for (const label of ['Amount (€)', 'Method', 'Paid by']) await expect(form.getByRole('button', { name: `More about ${label}`, exact: true })).toHaveCount(0);
  });

  test('the issued view: Issue date and Service', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const fake = newFake();
    await open(page, fake);
    await createFromTwo(page);
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    const editor = page.locator('[data-test="invoice-editor"][data-status="issued"]');
    await expect(editor).toBeVisible();
    await tapEach(page, editor, {
      'Issue date': 'The day you issue the invoice. It is set when you press Issue.',
      Service: 'The day the work was done, or the first day if it ran over several days.',
    });
  });

  test('the issuer profile: Steuernummer, prefix and next number, none repeating its own hint line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const fake = newFake();
    await open(page, fake);
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const form = page.locator('[data-test="profile-form"]');
    await tapEach(page, form, {
      'Steuernummer (Tax number)': 'Your tax number from the Finanzamt. Printed on every invoice.',
      'Invoice number prefix': 'The start of every invoice number.',
      'Next invoice number': 'The number your next invoice gets.',
    });
    // Each hint against its field's visible hint line: never equal, never contained.
    for (const [label, tip] of [
      ['Steuernummer (Tax number)', 'Your tax number from the Finanzamt. Printed on every invoice.'],
      ['Invoice number prefix', 'The start of every invoice number.'],
      ['Next invoice number', 'The number your next invoice gets.'],
    ]) {
      const line = (await form.locator('.field').filter({ has: page.getByRole('button', { name: `More about ${label}`, exact: true }) }).locator('.field__message--hint').innerText()).trim();
      expect(line.includes(tip) || tip.includes(line), `${label}: hint "${tip}" vs line "${line}"`).toBe(false);
    }
  });
});

// system_3 #11508 (epic #11497 item 9; Design ack c71195): above the phone
// layout an invoice line reads across. The row used to align to its bottom
// edge, so the "Save as a suggestion on this device" link under Description
// lifted that input a line above Quantity and Unit price.
test.describe('#11508 an invoice line\'s inputs sit on one line', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone keeps its stacked block per line (§3.114)');

  type Box = { x: number; y: number; width: number; height: number };
  // One line's geometry: its three inputs, the caption rows, the total and
  // Remove. Tops are measured from the line's own top edge: the dialog is
  // centred in the screen, so its height changing moves everything in it.
  const lineBoxes = (page: Page, n: number) => page.locator('[data-test="draft-line"]').nth(n).evaluate((line) => {
    const top = line.getBoundingClientRect().y;
    const box = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y - top, width: r.width, height: r.height }; };
    return {
      inputs: [...line.querySelectorAll('input')].map(box),
      captions: [...line.querySelectorAll('.field__label-row')].map(box),
      total: box(line.querySelector('.line__total')!),
      remove: box(line.querySelector('.line__remove')!),
    };
  });
  const middle = (b: Box) => b.y + b.height / 2;

  // 641 is the narrowest desktop layout, where the dialog and not the
  // viewport sets the columns and field text is 16px (§3.135).
  for (const width of [641, 1280, 1440]) {
    test(`at ${width} the three inputs are level, with the link under Description shown or not`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, newFake());
      await createFromTwo(page);
      const link = page.locator('[data-test="draft-line"]').first().locator('.line-desc__action');
      await expect(link, 'the fixture\'s description offers the link').toBeVisible();

      const withLink = await lineBoxes(page, 0);
      const [desc, qty, price] = withLink.inputs;
      expect(Math.abs(desc.y - qty.y), 'Description and Quantity start level').toBeLessThanOrEqual(1);
      expect(Math.abs(desc.y - price.y), 'Description and Unit price start level').toBeLessThanOrEqual(1);
      // Every caption is one line high, "Unit price (€)" with its hint included.
      expect(withLink.captions).toHaveLength(3);
      for (const c of withLink.captions) expect(c.height, 'a caption of one line').toBeLessThan(24);
      expect(desc.width, 'Description stays the widest input').toBeGreaterThan(Math.max(qty.width, price.width));
      // The total and Remove centre on the inputs' height.
      expect(Math.abs(middle(withLink.total) - middle(desc)), 'the total is on the inputs\' line').toBeLessThanOrEqual(1);
      expect(Math.abs(middle(withLink.remove) - middle(desc)), 'Remove is on the inputs\' line').toBeLessThanOrEqual(1);

      // Without the link nothing but its own cell changes.
      await page.getByRole('combobox', { name: 'Description, line 1' }).fill('');
      // Leave the field, so its list of suggestions closes.
      await page.getByRole('combobox', { name: 'Description, line 1' }).blur();
      await expect(link).toHaveCount(0);
      const without = await lineBoxes(page, 0);
      without.inputs.forEach((b, i) => expect(Math.abs(b.y - withLink.inputs[i].y), `input ${i + 1} does not move`).toBeLessThanOrEqual(1));
      expect(Math.abs(without.total.y - withLink.total.y), 'the total does not move').toBeLessThanOrEqual(1);
      expect(Math.abs(without.remove.y - withLink.remove.y), 'Remove does not move').toBeLessThanOrEqual(1);

      // A line after the first has no captions and aligns the same way.
      await page.locator('[data-test="draft-add-line"]').click();
      const last = (await page.locator('[data-test="draft-line"]').count()) - 1;
      const next = await lineBoxes(page, last);
      expect(next.captions).toHaveLength(0);
      expect(Math.abs(next.inputs[0].y - next.inputs[1].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(next.inputs[0].y - next.inputs[2].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(middle(next.total) - middle(next.inputs[0]))).toBeLessThanOrEqual(1);
      expect(Math.abs(middle(next.remove) - middle(next.inputs[0]))).toBeLessThanOrEqual(1);
      // The columns line up down the lines.
      expect(Math.abs(next.inputs[1].x - withLink.inputs[1].x), 'Quantity in one column').toBeLessThanOrEqual(1);
      expect(Math.abs(next.inputs[2].x - withLink.inputs[2].x), 'Unit price in one column').toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
