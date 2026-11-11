import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
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

test.describe('#8367 Invoices app — draft, issue, Storno', () => {
  // #9873: every row has a checkbox (it also feeds Set category); a
  // selection holding a gift cannot create an invoice, and the caption says
  // why (design_agent c60951 rule 6).
  test('selecting paid-work payments creates a prefilled draft; a selected gift blocks it with a caption', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);

    await expect(page.locator('[data-test="create-invoice"]')).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Select TX3' }).check();
    await expect(page.locator('[data-test="create-invoice"]')).toBeDisabled();
    await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveText('1 of the 1 selected is not Paid work. Only Paid work can be invoiced.');
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

  // #9835 (§33 UStDV): a client without an address can be invoiced up to
  // 250 € gross. The draft says so; above that, the server refuses and the
  // editor shows its reason, which names the total and the threshold.
  test('a client without an address: the draft says up to 250 €, and the refusal above it is shown', async ({ page }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    fake.issueFailure = {
      status: 422,
      body: { error: { code: 'client_incomplete', message: "the client has no postal address, and this invoice totals 470,00 € gross: above 250,00 € an invoice must name the recipient's full address (§14 Abs. 4 UStG, §34a UStDV). Add the client's postal address to issue it" } },
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
    await expect(page.locator('[data-test="invoice-error"]')).toContainText('470,00 € gross: above 250,00 €');
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
  });

  test('a client without an address: a small invoice issues', async ({ page }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await page.getByRole('checkbox', { name: 'Select TX2' }).check();
    await page.locator('[data-test="create-invoice"]').click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();

    const note = page.locator('[data-test="draft-no-address"]');
    await expect(note).toHaveAttribute('data-level', 'neutral');
    await expect(note).toContainText('Needed over €250.00 gross. Add it under Clients.');
    await page.locator('[data-test="draft-issue"]').click();
    await page.locator('[data-test="issue-confirm-button"]').click();
    await expect(page.locator('[data-test="invoice-editor"][data-status="issued"]')).toBeVisible();
  });

  // #9949 (operator c61373): the note follows the draft's own gross as she
  // edits, before any save, computed the way the server computes it at issue.
  test('a client without an address: the note turns into a warning as the draft crosses 250 €', async ({ page }) => {
    const fake = newFake();
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await page.getByRole('checkbox', { name: 'Select TX2' }).check();
    await page.locator('[data-test="create-invoice"]').click();
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
    expect(fake.requests.slice(sent).filter((r) => r.method !== 'GET'), 'nothing is saved while she types').toEqual([]);
  });

  test('with VAT charged, the warning counts the gross, not the net', async ({ page }) => {
    const fake = newFake();
    fake.kleinunternehmer = false;
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await page.getByRole('checkbox', { name: 'Select TX2' }).check();
    await page.locator('[data-test="create-invoice"]').click();
    const note = page.locator('[data-test="draft-no-address"]');
    const price = page.getByLabel('Unit price, line 1');
    await price.fill('210');
    await expect(note).toHaveAttribute('data-level', 'neutral'); // 210 + 19% = 249.90
    await price.fill('211');
    await expect(note).toHaveAttribute('data-level', 'caution'); // 211 + 19% = 251.09
    await expect(page.locator('[data-test="draft-no-address-text"]')).toContainText('totals €251.09 gross');
  });

  test('an invoice in another currency needs the address at any total', async ({ page }) => {
    const fake = newFake();
    fake.currency = 'USD';
    fake.clients = [{ id: 1, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await page.getByRole('checkbox', { name: 'Select TX2' }).check();
    await page.locator('[data-test="create-invoice"]').click();
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

  test('a client with an address gets no note at any total', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.getByRole('checkbox', { name: 'Select TX2' }).check();
    await page.locator('[data-test="create-invoice"]').click();
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

  // §3.142 Decision 2 (design_agent c65348 on #10539): "Paid by" replaces
  // Client and "Payer (optional)", and carries no "?" hint of its own —
  // Decision 3's own line under the field says what Save will do with it.
  test('Enter payment by hand: Reference and What it was for; Amount, Method and Paid by have none', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const fake = newFake();
    await open(page, fake);
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
