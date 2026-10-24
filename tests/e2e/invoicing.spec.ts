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
  forbidden?: boolean;
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
      { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'uncategorised', client_id: 1, bank_deposit_id: null },
      { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null, bank_deposit_id: null },
      { id: 12, kind: 'withdrawal', transaction_id: 'W1', paid_on: '2026-08-01T00:00:00Z', currency: 'EUR', gross_cents: 150000, sender_name: '', sender_email: '', note: '', category: 'uncategorised', client_id: null, bank_deposit_id: null },
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
    if (path === '/invoicing/payments/import' && method === 'POST') {
      const next = fake.importResponses.shift() || { status: 200, body: { summary: { rows_read: 0, imported: 0, duplicates: 0, skipped: 0, skipped_reasons: {}, withdrawals: 0 } } };
      return json(route, next.status, next.body);
    }
    const patchMatch = path.match(/^\/invoicing\/payments\/(\d+)$/);
    if (patchMatch && method === 'PATCH') {
      if (fake.patchFailure) return json(route, fake.patchFailure.status, fake.patchFailure.body);
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
    await expect(page.locator('[data-test="steuernummer-missing"]')).toContainText('issuing blocked');
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
    await form.getByLabel('Invoice number prefix').fill('bad/prefix');
    await page.locator('[data-test="profile-save"]').click();
    await expect(page.locator('[data-test="profile-error"]')).toContainText('1-20 letters');
    await expect(form).toBeVisible();

    await form.getByLabel('Invoice number prefix').fill('2026');
    await form.getByLabel('Steuernummer').fill('98/765/43210');
    await page.locator('[data-test="profile-save"]').click();
    await expect(form).toBeHidden();
    await expect(page.locator('[data-test="profile-steuernummer"]')).toHaveText('98/765/43210');
    const put = fake.requests.filter((r) => r.method === 'PUT' && r.path === '/invoicing/profile').pop()!;
    expect(JSON.parse(put.body)).toMatchObject({ steuernummer: '98/765/43210', invoice_number_prefix: '2026', next_invoice_number: 1, is_kleinunternehmer: true });
  });

  test('adding a client POSTs it; name and address are required first', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);
    await page.getByRole('tab', { name: 'Clients' }).click();

    await page.locator('[data-test="client-add"]').click();
    const form = page.locator('[data-test="client-form"]');
    await form.getByLabel('Name').fill('Anna Example');
    await page.locator('[data-test="client-save"]').click();
    await expect(page.locator('[data-test="client-error"]')).toContainText('name and a postal address');
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/invoicing/clients')).toBe(false);

    await form.getByLabel('Postal address').fill('Weg 1\n10115 Berlin');
    await page.locator('[data-test="client-save"]').click();
    await expect(form).toBeHidden();
    await expect(page.locator('[data-test="client-row"]', { hasText: 'Anna Example' })).toBeVisible();
    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/invoicing/clients')!;
    expect(JSON.parse(post.body)).toMatchObject({ name: 'Anna Example', address: 'Weg 1\n10115 Berlin' });
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
    await expect(summary).toContainText('Read 9 rows');
    await expect(summary).toContainText('3 imported');
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

  test('withdrawals are listed as bank deposits, not as payments to categorise', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openInvoicing(page);

    await expect(page.locator('[data-test="payment-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="payment-row"][data-txn="W1"]')).toHaveCount(0);
    await expect(page.locator('[data-test="deposits"]')).toContainText('W1');
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
