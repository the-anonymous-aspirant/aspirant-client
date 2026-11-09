import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSessionAs,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/** Invoices app for its owner vinoly (system_3 #8367-B3, #8633): issuer profile, clients,
 *  PayPal import and categorisation, over aspirant-server's /api/invoicing/*
 *  (#8369, #8370). Every call is answered by an in-memory fake, and a
 *  catch-all /api/ → 404 is registered FIRST: `vite preview` proxies any
 *  unstubbed /api call to the live server, whose 401 would make the global
 *  interceptor sign the session out. */

type Json = Record<string, any>;

interface Fake {
  profile: Json;
  saved: boolean;
  clients: Json[];
  payments: Json[];
  requests: Array<{ method: string; path: string; body: string; contentType: string }>;
  importResponses: Array<{ status: number; body: Json }>;
  patchFailure?: { status: number; body: Json };
  /** #9873: a refusal for one payment id only, as a bulk action meets it. */
  patchFailures?: Record<number, { status: number; body: Json }>;
  forbidden?: boolean;
  /** #10438: the expense book behind /invoicing/expenses/import-paypal/confirm. */
  expenses?: Json[];
  expenseConfirmFailure?: { status: number; body: Json };
}

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    profile: {
      full_name: 'Flower Example',
      address: 'Beispielstraße 1\n10117 Berlin',
      steuernummer: '12/345/67890',
      email: 'flower@example.test',
      is_kleinunternehmer: true,
      invoice_number_prefix: '2026',
      next_invoice_number: 1,
    },
    saved: true,
    clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin', email: '', paypal_email: 'pay@galerie.test' }],
    payments: [
      { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'uncategorised', client_id: 1 },
      { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null },
      { id: 12, kind: 'withdrawal', transaction_id: 'W1', paid_on: '2026-08-01T00:00:00Z', currency: 'EUR', gross_cents: 150000, sender_name: '', sender_email: '', note: '', category: 'uncategorised', client_id: null },
    ],
    requests: [],
    importResponses: [],
    ...over,
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockInvoicing(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '', contentType: req.headers()['content-type'] || '' });
    if (fake.forbidden) return json(route, 403, { error: { code: 'forbidden', message: 'Insufficient permissions' } });

    if (path === '/invoicing/profile' && method === 'GET') return json(route, 200, { profile: fake.profile, saved: fake.saved });
    if (path === '/invoicing/profile' && method === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      if (body.invoice_number_prefix === 'bad/prefix') {
        return json(route, 400, { error: { code: 'bad_request', message: 'invoice_number_prefix must be 1-20 letters, digits or hyphens' } });
      }
      fake.profile = body;
      fake.saved = true;
      return json(route, 200, { profile: body, saved: true });
    }
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/clients' && method === 'POST') {
      const client = { id: fake.clients.length + 100, ...JSON.parse(req.postData() || '{}') };
      fake.clients.push(client);
      return json(route, 201, { client });
    }
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    // #8375 (D1) loads the invoice list with the page; this spec has none.
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expense-categories' && method === 'GET') {
      const names = ['materials and supplies', 'travel', 'other'];
      return json(route, 200, { categories: names.map((name, i) => ({ id: i + 1, name, counts_as: name })) });
    }
    if (path === '/invoicing/expenses/import-paypal/confirm' && method === 'POST') {
      if (fake.expenseConfirmFailure) return json(route, fake.expenseConfirmFailure.status, fake.expenseConfirmFailure.body);
      fake.expenses = fake.expenses || [];
      const rows: Json[] = JSON.parse(req.postData() || '{}').rows;
      fake.expenses.push(...rows);
      return json(route, 200, { summary: { confirmed: rows.length, duplicates: 0 } });
    }
    if (path === '/invoicing/payments/import' && method === 'POST') {
      const next = fake.importResponses.shift() || { status: 200, body: { summary: { rows_read: 0, imported: 0, duplicates: 0, skipped: 0, skipped_reasons: {}, withdrawals: 0 } } };
      return json(route, next.status, next.body);
    }
    const patchMatch = path.match(/^\/invoicing\/payments\/(\d+)$/);
    if (patchMatch && method === 'PATCH') {
      if (fake.patchFailure) return json(route, fake.patchFailure.status, fake.patchFailure.body);
      const oneFailure = fake.patchFailures && fake.patchFailures[Number(patchMatch[1])];
      if (oneFailure) return json(route, oneFailure.status, oneFailure.body);
      const p = fake.payments.find((x) => x.id === Number(patchMatch[1]));
      Object.assign(p!, JSON.parse(req.postData() || '{}'));
      return json(route, 200, { payment: p });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function openInvoicing(page: Page): Promise<void> {
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
}

const csvFile = { name: 'activity.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Name\n') };

test.describe('#8367 Invoices app — profile, clients, import, categorisation', () => {
  test('the Invoices card is listed for vinoly and opens the app', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member');
    await dismissMobileSidebarIfPresent(page);
    const card = page.locator('[data-test="member-personal-section"] .application-card', { hasText: 'Invoices' });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/member\/personal\/invoicing$/);
  });

  test('the issuer profile heads the page; an empty Steuernummer is flagged', async ({ page }) => {
    const fake = newFake();
    fake.profile.steuernummer = '';
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(page.locator('[data-test="profile-name"]')).toHaveText('Flower Example');
    await expect(page.locator('[data-test="profile-next-number"]')).toHaveText('2026-001');
    await expect(page.locator('[data-test="steuernummer-missing"]')).toContainText('Missing: needed to issue');
  });

  // #8401: a global `.card` rule in style.css matched AspCard's root and
  // added 32px on top of the padding prop. padding="md" must inset the body
  // by the 2px border plus 16px, at this project's width, in both themes.
  test('the profile card insets its body by the padding prop alone', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.emulateMedia({ colorScheme: theme });
      await openInvoicing(page);
      const m = await page.locator('[data-test="profile-card"]').evaluate((card) => {
        const body = card.querySelector('.card__body') as HTMLElement;
        const inset = body.getBoundingClientRect().left + parseFloat(getComputedStyle(body).paddingLeft) - card.getBoundingClientRect().left;
        return { inset, rootPadding: getComputedStyle(card).paddingLeft };
      });
      expect(m, theme).toEqual({ inset: 18, rootPadding: '0px' });
    }
  });

  test('editing the profile PUTs it; a server refusal stays in the dialog', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await page.locator('[data-test="profile-edit"]').click();
    const form = page.locator('[data-test="profile-form"]');
    await form.getByLabel(/^Invoice number prefix/).fill('bad/prefix');
    await page.locator('[data-test="profile-save"]').click();
    await expect(page.locator('[data-test="profile-error"]')).toContainText('1-20 letters');
    await expect(form).toBeVisible();

    await form.getByLabel(/^Invoice number prefix/).fill('2026');
    await form.getByLabel(/^Steuernummer \(Tax number\)/).fill('98/765/43210');
    await page.locator('[data-test="profile-save"]').click();
    await expect(form).toBeHidden();
    await expect(page.locator('[data-test="profile-steuernummer"]')).toHaveText('98/765/43210');
    const put = fake.requests.filter((r) => r.method === 'PUT' && r.path === '/invoicing/profile').pop()!;
    expect(JSON.parse(put.body)).toMatchObject({ steuernummer: '98/765/43210', invoice_number_prefix: '2026', next_invoice_number: 1, is_kleinunternehmer: true });
  });

  test('adding a client POSTs it; the name is required, the address is not', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);
    await page.getByRole('tab', { name: 'Clients' }).click();

    await page.locator('[data-test="client-add"]').click();
    const form = page.locator('[data-test="client-form"]');
    // #9835: the address is optional up to 250 € gross, and the form says so.
    await expect(form).toContainText('Needed for invoices over 250 € gross.');
    await page.locator('[data-test="client-save"]').click();
    await expect(page.locator('[data-test="client-error"]')).toContainText('A client needs a name.');
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/invoicing/clients')).toBe(false);

    await form.getByLabel('Name').fill('Anna Example');
    await page.locator('[data-test="client-save"]').click();
    await expect(form).toBeHidden();
    const row = page.locator('[data-test="client-row"]', { hasText: 'Anna Example' });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-test="client-no-address"]')).toHaveText('No postal address');
    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/invoicing/clients')!;
    expect(JSON.parse(post.body)).toMatchObject({ name: 'Anna Example', address: '' });

    await page.locator('[data-test="client-add"]').click();
    await form.getByLabel('Name').fill('Bert Example');
    await form.getByLabel('Postal address').fill('Weg 1\n10115 Berlin');
    await page.locator('[data-test="client-save"]').click();
    await expect(form).toBeHidden();
    const post2 = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/clients').pop()!;
    expect(JSON.parse(post2.body)).toMatchObject({ name: 'Bert Example', address: 'Weg 1\n10115 Berlin' });
  });

  test('importing a CSV uploads it as multipart "file" and shows the summary', async ({ page }) => {
    const fake = newFake({
      importResponses: [{ status: 200, body: { summary: { rows_read: 9, imported: 3, duplicates: 0, skipped: 6, withdrawals: 1, skipped_reasons: { fee: 1, currency_conversion: 2, bank_topup: 1, not_completed: 1, outgoing: 1 } } } }],
    });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await page.locator('[data-test="payments-file"]').setInputFiles(csvFile);
    const summary = page.locator('[data-test="import-summary"]');
    // One import-state region serves both imports, so the line names its source (design_agent c60358).
    await expect(summary).toContainText('PayPal CSV: read 9 rows');
    await expect(summary).toContainText('3 imported');
    // The whole line, punctuation included (system_3 #10040).
    await expect(summary.locator('.summary__line')).toHaveText('PayPal CSV: read 9 rows: 3 imported (including 1 bank withdrawals), 0 already imported, 6 skipped.');
    await expect(summary).toContainText('2 × currency conversion');
    const upload = fake.requests.find((r) => r.path === '/invoicing/payments/import')!;
    expect(upload.contentType).toContain('multipart/form-data');
    expect(upload.body).toContain('name="file"; filename="activity.csv"');
    expect(upload.body).not.toContain('name="date_order"');
  });

  test('an ambiguous-date file asks which order, then re-uploads with date_order', async ({ page }) => {
    const fake = newFake({
      importResponses: [
        { status: 400, body: { error: { code: 'date_order_ambiguous', message: 'every date reads both ways' } } },
        { status: 200, body: { summary: { rows_read: 1, imported: 1, duplicates: 0, skipped: 0, withdrawals: 0, skipped_reasons: {} } } },
      ],
    });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await page.locator('[data-test="payments-file"]').setInputFiles(csvFile);
    await expect(page.locator('[data-test="date-order"]')).toBeVisible();
    await expect(page.locator('[data-test="import-summary"]')).toHaveCount(0);
    await page.locator('[data-test="date-order-dmy"]').click();
    await expect(page.locator('[data-test="import-summary"]')).toContainText('1 imported');
    // With no withdrawals the comma follows "imported" directly (#10040: it
    // read "1 imported , 0 already imported").
    await expect(page.locator('[data-test="import-summary"] .summary__line')).toHaveText(/ 1 imported, \d+ already imported, \d+ skipped\.\s*$/);
    await expect(page.locator('[data-test="date-order"]')).toHaveCount(0);
    const uploads = fake.requests.filter((r) => r.path === '/invoicing/payments/import');
    expect(uploads).toHaveLength(2);
    expect(uploads[1].body).toMatch(/name="date_order"\r\n\r\ndmy/);
  });

  test('choosing a category PATCHes it; a server refusal is shown', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const category = page.getByRole('combobox', { name: 'Category for TX1' });
    await category.click();
    await page.getByRole('option', { name: 'Paid work' }).click();
    await expect(category).toContainText('Paid work');
    const patch = fake.requests.find((r) => r.method === 'PATCH' && r.path === '/invoicing/payments/10')!;
    expect(JSON.parse(patch.body)).toEqual({ category: 'paid_work' });

    fake.patchFailure = { status: 409, body: { error: { code: 'payment_on_issued_invoice', message: 'payment is on issued invoice 3; cancel that invoice before changing its category' } } };
    await category.click();
    await page.getByRole('option', { name: 'Gift' }).click();
    await expect(page.locator('[data-test="payment-error"]')).toContainText('cancel that invoice');
    await expect(category).toContainText('Paid work');
  });

  // #9940-A1 (operator c61402): a PayPal-into-N26 transfer can never be paid
  // work (the PayPal payments it sums are), so Paid work is disabled and the
  // row says why, instead of a round trip through a failed PATCH.
  test('a PayPal-into-N26 transfer has Paid work disabled, with a reason', async ({ page }) => {
    const fake = newFake({
      payments: [
        { id: 13, kind: 'incoming', source: 'n26', transaction_id: 'TX3', paid_on: '2026-07-23T00:00:00Z', currency: 'EUR', gross_cents: 40000, sender_name: 'PAYPAL / INSTANT TRANSFER', sender_email: '', note: '', category: 'uncategorised', client_id: null },
      ],
    });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(page.locator('[data-test="payment-no-paid-work-reason"]')).toHaveText('Not paid work -- the PayPal payments it sums are, in the PayPal import');
    const category = page.getByRole('combobox', { name: 'Category for TX3' });
    await category.click();
    await expect(page.getByRole('option', { name: 'Paid work' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('option', { name: 'Gift' }).click();
    await expect(category).toContainText('Gift');
    expect(JSON.parse(fake.requests.find((r) => r.method === 'PATCH')!.body)).toEqual({ category: 'gift' });
  });

  // #8402: an AspSelect in the payments table opened into AspDataTable's
  // scroll box, so with the row near the window bottom the panel flipped up
  // and "Paid work" sat behind the table's edge, unreachable by mouse. The
  // hit test is what a pointer would get.
  test('near the window bottom the category options are on top and clickable', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const category = page.getByRole('combobox', { name: 'Category for TX1' });
    await category.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - 60)));
    await category.click();
    const option = page.getByRole('option', { name: 'Paid work' });
    const onTop = await option.evaluate((o) => {
      const r = o.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === o || o.contains(top);
    });
    expect(onTop, '"Paid work" is the element under the pointer').toBe(true);
    await option.click();
    await expect(category).toContainText('Paid work');
  });

  test('withdrawals are not listed as payments to categorise', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(page.locator('[data-test="payment-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="payment-row"][data-txn="W1"]')).toHaveCount(0);
  });

  test('empty states: no payments, no clients', async ({ page }) => {
    const fake = newFake({ payments: [], clients: [] });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(page.locator('[data-test="payments-empty"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.locator('[data-test="clients-empty"]')).toBeVisible();
  });

  test('payer-written text renders as text, never as markup', async ({ page }) => {
    const fake = newFake();
    fake.payments[0].note = '<img src=x onerror="window.__xss=1">';
    fake.payments[0].sender_name = '<b>bold?</b>';
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const row = page.locator('[data-test="payment-row"][data-txn="TX1"]');
    await expect(row).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(row).toContainText('<b>bold?</b>');
    await expect(row.locator('img')).toHaveCount(0);
    await expect(row.locator('b')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test('a non-owner reaching the URL gets a no-access state, not a broken page', async ({ page }) => {
    const fake = newFake({ forbidden: true });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'robert');
    await openInvoicing(page);
    await expect(page.locator('[data-test="invoicing-forbidden"]')).toContainText('belongs to another account');
  });

  test('an Admin sees the app too', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedAdminSession(page);
    await openInvoicing(page);
    await expect(page.locator('[data-test="profile-name"]')).toHaveText('Flower Example');
  });
});

/** #9873 (from #9862): PayPal Excel import, and one selection with two
 *  actions on it, Set category for any rows and Create invoice for Paid work
 *  only (design_agent c60951 on system_3 #9873). */
const xlsxFile = {
  name: 'activity.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from('PK\x03\x04'),
};

function threeIncoming(): Fake {
  const fake = newFake();
  fake.payments.splice(2, 0, { id: 13, kind: 'incoming', transaction_id: 'TX3', paid_on: '2026-07-22T00:00:00Z', currency: 'EUR', gross_cents: 9000, sender_name: 'Noa', sender_email: 'noa@example.test', note: 'tattoo', category: 'uncategorised', client_id: null });
  return fake;
}

const selectAll = (page: Page) => page.getByRole('checkbox', { name: /^Select all (shown payments|\d+ shown)$/ });
const bulk = (page: Page) => page.locator('[data-test="bulk-category"]');

async function setBulkCategory(page: Page, label: string): Promise<void> {
  await bulk(page).click();
  await page.getByRole('option', { name: label }).click();
}

test.describe('#9873 Payments: PayPal Excel, set the category of several at once', () => {
  test('an Excel file is offered, uploaded, and named on every PayPal line', async ({ page }) => {
    const fake = newFake({
      importResponses: [
        { status: 200, body: { summary: { rows_read: 9, imported: 3, duplicates: 0, skipped: 6, withdrawals: 1, refunds: 1, format: 'xlsx', skipped_reasons: { reversal: 1, reversed: 1, fee: 4 } } } },
        { status: 400, body: { error: { code: 'invalid_xlsx', message: 'not an Excel workbook (.xlsx)' } } },
      ],
    });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const input = page.locator('[data-test="payments-file"]');
    await expect(input).toHaveAttribute('accept', /\.xlsx/);
    await expect(input).toHaveAttribute('aria-label', 'PayPal activity CSV or Excel file');
    await expect(page.locator('[data-test="payments-import"]')).toHaveText('Import PayPal file');
    await input.setInputFiles(xlsxFile);
    const summary = page.locator('[data-test="import-summary"]');
    await expect(summary).toContainText('PayPal Excel file: read 9 rows');
    await expect(summary).toContainText('1 set to Refund');
    await expect(summary).toContainText('1 × reversal (a bounce or cancellation)');
    await expect(summary).toContainText('1 × row a reversal cancelled');
    const upload = fake.requests.find((r) => r.path === '/invoicing/payments/import')!;
    expect(upload.body).toContain('filename="activity.xlsx"');

    await input.setInputFiles(xlsxFile);
    await expect(page.locator('[data-test="import-error"]')).toHaveText('PayPal Excel file: not an Excel workbook (.xlsx)');
  });

  // design_agent c60973: the button says "file", and she holds PayPal's PDF
  // statement, so a file that is not a CSV or an .xlsx is refused before
  // anything is sent, saying what to bring.
  test('a PDF statement is refused before upload and the line says what to bring', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await page.locator('[data-test="payments-file"]').setInputFiles({ name: 'Paypal jul-sep.PDF', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.6') });
    await expect(page.locator('[data-test="import-error"]')).toHaveText(
      "PayPal file: choose the CSV or Excel export from PayPal's activity download. A PDF statement cannot be read.",
    );
    expect(fake.requests.filter((r) => r.path === '/invoicing/payments/import')).toHaveLength(0);
    await expect(page.locator('[data-test="import-summary"]')).toHaveCount(0);
  });

  test('Set category writes every selected row, names the count, and clears the selection', async ({ page }) => {
    const fake = threeIncoming();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(bulk(page)).toContainText('Set category of selected payments');
    await expect(bulk(page)).toBeDisabled();
    for (const txn of ['TX1', 'TX2', 'TX3']) await page.getByRole('checkbox', { name: `Select ${txn}` }).check();
    await expect(bulk(page)).toContainText('Set category of 3 selected');
    await setBulkCategory(page, 'Other');

    // The writes go one after another; wait for the third before reading them.
    await expect.poll(() => fake.requests.filter((r) => r.method === 'PATCH').length).toBe(3);
    const patches = fake.requests.filter((r) => r.method === 'PATCH');
    expect(patches.map((r) => r.path)).toEqual(['/invoicing/payments/10', '/invoicing/payments/11', '/invoicing/payments/13']);
    for (const r of patches) expect(JSON.parse(r.body)).toEqual({ category: 'other' });
    for (const txn of ['TX1', 'TX2', 'TX3']) {
      await expect(page.getByRole('combobox', { name: `Category for ${txn}` })).toContainText('Other');
      await expect(page.getByRole('checkbox', { name: `Select ${txn}` })).not.toBeChecked();
    }
    await expect(bulk(page)).toContainText('Set category of selected payments');
    await expect(page.locator('[data-test="bulk-error"]')).toHaveCount(0);
  });

  test('a refused row stays selected and is named; the others change', async ({ page }) => {
    const fake = threeIncoming();
    fake.patchFailures = { 11: { status: 409, body: { error: { code: 'payment_on_issued_invoice', message: 'payment is on issued invoice 3; cancel that invoice before changing its category' } } } };
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    for (const txn of ['TX1', 'TX2', 'TX3']) await page.getByRole('checkbox', { name: `Select ${txn}` }).check();
    await setBulkCategory(page, 'Other');

    const alert = page.locator('[data-test="bulk-error"]');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toHaveText('1 of 3 kept its category: 2026-07-20 €50.00 (on an issued invoice; cancel it first).');
    await expect(page.getByRole('checkbox', { name: 'Select TX2' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select TX1' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select TX3' })).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Category for TX1' })).toContainText('Other');
    await expect(page.getByRole('combobox', { name: 'Category for TX2' })).toContainText('Gift');
    await expect(bulk(page)).toContainText('Set category of 1 selected');
  });

  test('Create invoice says why it cannot act, and acts once every selected row is Paid work', async ({ page }) => {
    const fake = threeIncoming();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const create = page.locator('[data-test="create-invoice"]');
    const caption = page.locator('[data-test="create-invoice-hint"]');
    await expect(caption).toHaveText('Select payments to set their category, or Paid work payments to create an invoice.');
    await page.getByRole('checkbox', { name: 'Select TX1' }).check();
    await page.getByRole('checkbox', { name: 'Select TX3' }).check();
    await expect(create).toBeDisabled();
    await expect(caption).toHaveText('2 of the 2 selected are not Paid work. Only Paid work can be invoiced.');
    await setBulkCategory(page, 'Paid work');
    // The rows that changed leave the selection; select them again.
    await page.getByRole('checkbox', { name: 'Select TX1' }).check();
    await page.getByRole('checkbox', { name: 'Select TX3' }).check();
    await expect(create).toBeEnabled();
    await expect(create).toHaveText('Create invoice from 2 payments');
    await expect(caption).toHaveCount(0);
  });

  test('select all acts on the shown rows; a filter change unselects rows it hides', async ({ page }) => {
    const fake = threeIncoming();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    const all = selectAll(page);
    await expect(all).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Select TX1' }).check();
    expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate), 'some selected: indeterminate').toBe(true);
    await all.check();
    expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(false);
    await expect(bulk(page)).toContainText('Set category of 3 selected');

    // Filter to Uncategorised: the gift (TX2) leaves the view and the selection.
    await page.locator('[data-test="category-filter"]').click();
    await page.getByRole('option', { name: 'Uncategorised' }).click();
    await expect(page.locator('[data-test="payment-row"]')).toHaveCount(2);
    await expect(bulk(page)).toContainText('Set category of 2 selected');
    await expect(all).toBeChecked();
    await all.uncheck();
    await expect(bulk(page)).toContainText('Set category of selected payments');
  });

  test('on a phone the stacked toolbar buttons wrap instead of overflowing', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 640, 'phone layout only');
    const fake = threeIncoming();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await page.getByRole('checkbox', { name: 'Select TX1' }).check();
    const overflow = await page.locator('.payments-panel .ways-in button, .payments-panel .toolbar button').evaluateAll((els) =>
      els.map((el) => ({ text: (el.textContent || '').trim(), over: el.scrollWidth - el.clientWidth })));
    expect(overflow.length).toBeGreaterThan(3);
    for (const b of overflow) expect(b.over, `"${b.text}" overflows by ${b.over}px`).toBeLessThanOrEqual(0);
  });
});


// --- #10438: a PayPal file's outgoing payments, reviewed as work expenses ---

const paypalOutgoing = (n: number, over: Json = {}): Json => ({
  transaction_id: `8HH8888${n}HH8888888`,
  paid_on: `2026-07-2${n}`,
  currency: n === 2 ? 'USD' : 'EUR',
  amount_cents: 2500 * n,
  payee_name: n === 1 ? 'Some Shop' : 'Print Shop',
  note: n === 1 ? 'Leinwand' : '',
  already_imported: false,
  ...over,
});

const importWithOutgoing = (outgoing: Json[]): Fake =>
  newFake({
    importResponses: [{
      status: 200,
      body: {
        summary: { rows_read: 4, imported: 2, duplicates: 0, skipped: 2, withdrawals: 0, skipped_reasons: { outgoing: 2 } },
        expense_candidates: outgoing,
      },
    }],
  });

const paypalCsv = { name: 'activity.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Name,Type\n') };
const ppxReview = (page: Page) => page.locator('[data-test="paypal-expenses-review"]');
const ppxRows = (page: Page) => ppxReview(page).locator('[data-test="expense-row"]');
const ppxConfirms = (fake: Fake) =>
  fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/expenses/import-paypal/confirm');

async function importPayPal(page: Page, fake: Fake): Promise<void> {
  await mockInvoicing(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await openInvoicing(page);
  await page.locator('[data-test="payments-file"]').setInputFiles(paypalCsv);
  await expect(page.locator('[data-test="import-summary"]')).toBeVisible();
}

test.describe('#10438 PayPal import — outgoing payments reviewed as work expenses', () => {
  test('after the import, the outgoing payments are offered unticked; ticked ones are added with their category', async ({ page }) => {
    const fake = importWithOutgoing([paypalOutgoing(1), paypalOutgoing(2)]);
    await importPayPal(page, fake);

    await expect(ppxReview(page)).toBeVisible();
    await expect(ppxRows(page)).toHaveCount(2);
    await expect(ppxRows(page).nth(0)).toContainText('Some Shop');
    await expect(ppxRows(page).nth(0)).toContainText('€25.00');
    // A foreign-currency purchase keeps its currency.
    await expect(ppxRows(page).nth(1)).toContainText('$50.00');
    for (let i = 0; i < 2; i++) await expect(ppxRows(page).nth(i).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(page.locator('[data-test="paypal-expenses-confirm"]')).toBeDisabled();
    await expect(page.locator('[data-test="paypal-expenses-tick-hint"]')).toBeVisible();

    await ppxRows(page).nth(0).locator('input[type="checkbox"]').check();
    await ppxRows(page).nth(0).locator('[data-test="expense-row-category"]').click();
    await page.getByRole('option', { name: 'materials and supplies' }).click();
    await expect(page.locator('[data-test="paypal-expenses-confirm"]')).toHaveText('Add 1 expense');
    await page.locator('[data-test="paypal-expenses-confirm"]').click();
    await expect(ppxReview(page)).toBeHidden();

    expect(JSON.parse(ppxConfirms(fake)[0].body).rows).toEqual([{
      transaction_id: '8HH88881HH8888888', paid_on: '2026-07-21', currency: 'EUR', amount_cents: 2500,
      payee_name: 'Some Shop', note: 'Leinwand', category: 'materials and supplies',
    }]);
    // The payment line is unchanged; the expenses get their own sentence.
    const summary = page.locator('[data-test="import-summary"]');
    await expect(summary).toContainText('PayPal CSV: read 4 rows: 2 imported, 0 already imported, 2 skipped.');
    await expect(page.locator('[data-test="paypal-summary-expenses"]')).toHaveText('1 expense added to your book.');
  });

  test('"Not now" adds nothing and the payments stay imported', async ({ page }) => {
    const fake = importWithOutgoing([paypalOutgoing(1)]);
    await importPayPal(page, fake);
    await expect(ppxReview(page)).toBeVisible();
    await page.locator('[data-test="paypal-expenses-cancel"]').click();
    await expect(ppxReview(page)).toBeHidden();
    expect(ppxConfirms(fake)).toHaveLength(0);
    await expect(page.locator('[data-test="import-summary"]')).toContainText('2 imported');
    await expect(page.locator('[data-test="paypal-summary-expenses"]')).toHaveCount(0);
  });

  // Design ack c64136, condition 1: nothing on the page reopens a dismissed
  // review, so the lead names the way back, and the way back must work.
  test('after "Not now", importing the same file again offers the same rows, its payments already imported', async ({ page }) => {
    const outgoing = [paypalOutgoing(1), paypalOutgoing(2)];
    const fake = importWithOutgoing(outgoing);
    // The server recomputes the candidates on every import and flags only the
    // stored ones; the dismissed rows were never stored.
    fake.importResponses.push({
      status: 200,
      body: {
        summary: { rows_read: 4, imported: 0, duplicates: 2, skipped: 2, withdrawals: 0, skipped_reasons: { outgoing: 2 } },
        expense_candidates: outgoing,
      },
    });
    await importPayPal(page, fake);
    await expect(ppxReview(page)).toContainText('To add them later, import this file again.');
    await page.locator('[data-test="paypal-expenses-cancel"]').click();
    await expect(ppxReview(page)).toBeHidden();

    await page.locator('[data-test="payments-file"]').setInputFiles(paypalCsv);
    await expect(ppxReview(page)).toBeVisible();
    await expect(ppxRows(page)).toHaveCount(2);
    await expect(ppxRows(page).nth(0)).toContainText('Some Shop');
    await expect(ppxRows(page).nth(1)).toContainText('Print Shop');
    for (let i = 0; i < 2; i++) await expect(ppxRows(page).nth(i).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(page.locator('[data-test="import-summary"]')).toContainText('PayPal CSV: read 4 rows: 0 imported, 2 already imported, 2 skipped.');
    expect(ppxConfirms(fake)).toHaveLength(0);
  });

  test('a file whose outgoing payments are all in the book already, or that has none, opens no review', async ({ page }) => {
    const fake = importWithOutgoing([paypalOutgoing(1, { already_imported: true })]);
    await importPayPal(page, fake);
    await expect(page.locator('[data-test="import-summary"]')).toContainText('2 imported');
    await expect(ppxReview(page)).toHaveCount(0);
    expect(fake.requests.some((r) => r.path === '/invoicing/expense-categories')).toBe(false);
  });

  test('a refused confirm is shown in the dialog, which stays open', async ({ page }) => {
    const fake = importWithOutgoing([paypalOutgoing(1)]);
    fake.expenseConfirmFailure = { status: 400, body: { error: { code: 'invalid_row', message: 'row 0: category is not one of your expense categories' } } };
    await importPayPal(page, fake);
    await ppxRows(page).nth(0).locator('input[type="checkbox"]').check();
    await page.locator('[data-test="paypal-expenses-confirm"]').click();
    await expect(page.locator('[data-test="paypal-expenses-error"]')).toHaveText('row 0: category is not one of your expense categories');
    await expect(ppxReview(page)).toBeVisible();
  });
});
