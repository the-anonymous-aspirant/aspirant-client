import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** system_3 #11669 (A2 of #11632; §3.166, cited as #11629): A1's guard on the
 *  client editor, the issuer profile and Book's Save as preset; and Back for
 *  the receipt dialog and the export check, which hold no input and close at
 *  once on every exit. Every call is answered by an in-memory fake; a
 *  catch-all /api/ → 404 is registered first. */

type Json = Record<string, any>;
interface Fake {
  requests: Array<{ method: string; path: string }>;
  // A write held open until released, so a test can act while it runs.
  hold?: boolean;
  release?: () => void;
}
const newFake = (): Fake => ({ requests: [] });

const CLIENT = { id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '', phone: '', instagram_url: '', telegram_url: '', notes: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const PAYMENTS = [
  { id: 1, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: 'M-1', method: 'bank_transfer', reference: '', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild Juli', category: 'paid_work', client_id: 1, on_invoice: false },
  { id: 2, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: 'M-2', method: 'bank_transfer', reference: '', paid_on: '2026-07-15T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt Ada', sender_email: '', note: 'Birthday', category: 'gift', client_id: null, on_invoice: false },
];
const EXPENSES = [
  { id: 101, source: 'manual', transaction_id: 'M-e101', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', amount_cents: 4599, note: 'Guitar strings', category: 'materials and supplies', client_id: null, entry: 'manual', reference: '', payee: 'Musikladen', removed_at: null, created_at: '2026-07-20T00:00:00Z', has_receipt: true },
];

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path });
    const held = async () => {
      if (!fake.hold) return;
      await new Promise<void>((r) => (fake.release = r));
    };
    if (path === '/invoicing/profile' && method === 'GET') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 4 } });
    if (path === '/invoicing/profile' && method === 'PUT') {
      await held();
      return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 4 } });
    }
    if (path === '/invoicing/profile/logo') return json(route, 404, { error: { code: 'not_found', message: 'no logo' } });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [CLIENT] });
    if (path.startsWith('/invoicing/clients') && method !== 'GET') {
      await held();
      return json(route, 200, { client: CLIENT });
    }
    if (path === '/invoicing/payments') return json(route, 200, { payments: PAYMENTS });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: EXPENSES });
    if (path === '/invoicing/expense-categories') return json(route, 200, { categories: [] });
    // One issued invoice, so the Invoices tab's export is enabled.
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [{ id: 3, status: 'issued', invoice_number: '2026-003', number: 3, client_id: 1, client_name: 'Galerie Nord', issue_date: '2026-07-21T00:00:00Z', service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-14T00:00:00Z', currency: 'EUR', total_cents: 35000, vat_rate_bp: 0 }] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/validation') return json(route, 200, { ok: false, violations: [{ code: 'pdf_missing', message: 'Invoice 2026-003 has no PDF.' }], warnings: [] });
    if (path === '/invoicing/expenses/101/receipt') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/book/selection' && method === 'PUT') {
      const b = JSON.parse(req.postData() || '{}');
      return json(route, 200, { selection: { preset: b.preset || 'custom', changed: !b.preset, income: b.income, expense_all: b.expense_all, expense: b.expense }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    }
    if (path === '/invoicing/book/presets' && method === 'POST') {
      await held();
      return json(route, 201, { preset: { id: 'p-1', name: JSON.parse(req.postData() || '{}').name, builtin: false } });
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
}

const ask = (page: Page) => page.locator('[data-test="unsent-ask"]');
const writes = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET');

test.describe('#11669 the client editor asks before an exit throws away an edit', () => {
  const editor = (page: Page) => page.getByRole('dialog', { name: /client/i });
  const openEdit = async (page: Page) => {
    await page.getByRole('tab', { name: 'Clients', exact: true }).click();
    const edit = page.locator('[data-test="client-edit-1"]:visible');
    if (await edit.count()) await edit.click();
    else await page.locator('[data-test="client-row"]').first().click();
    await expect(editor(page)).toBeVisible();
  };

  test('untouched: Cancel and Esc close at once', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openEdit(page);
    await editor(page).locator('[data-test="client-cancel"]').click();
    await expect(editor(page)).toHaveCount(0);
    await openEdit(page);
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    expect(writes(fake)).toEqual([]);
  });

  test('an edit asks on Cancel, Esc and Back; Keep editing keeps it; a field put back closes at once; Discard closes', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openEdit(page);
    const notes = editor(page).locator('[data-test="client-notes-input"] textarea, textarea[data-test="client-notes-input"]').first();
    await notes.fill('Pays late');
    await editor(page).locator('[data-test="client-cancel"]').click();
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(notes).toHaveValue('Pays late');
    await notes.focus();
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await page.goBack();
    await expect(ask(page)).toBeVisible();
    await expect(page).toHaveURL(/\/member\/personal\/invoicing/);
    await page.locator('[data-test="unsent-keep"]').click();
    // Typed and put back (trimmed) is equal to the row again.
    await notes.fill('  ');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await openEdit(page);
    await notes.fill('Pays late');
    await page.keyboard.press('Escape');
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(editor(page)).toHaveCount(0);
    expect(writes(fake)).toEqual([]);
  });

  test('a new client with a typed name asks; while Save runs no exit closes or asks', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.getByRole('tab', { name: 'Clients', exact: true }).click();
    await page.getByRole('button', { name: /^Add client/ }).first().click();
    await expect(editor(page)).toBeVisible();
    await editor(page).getByLabel('Name').fill('Atelier Süd');
    fake.hold = true;
    await editor(page).locator('[data-test="client-save"]').click();
    await expect.poll(() => writes(fake).length).toBe(1);
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeVisible();
    await expect(ask(page)).toHaveCount(0);
    fake.release!();
    await expect(editor(page)).toHaveCount(0);
  });
});

test.describe('#11669 the issuer profile asks, its staged logo included', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Issuer profile' });
  const openProfile = async (page: Page) => {
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await expect(dialog(page)).toBeVisible();
  };

  test('untouched closes at once; a typed field asks; Discard closes without a write', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openProfile(page);
    await dialog(page).locator('[data-test="profile-cancel"]').click();
    await expect(dialog(page)).toHaveCount(0);
    await openProfile(page);
    await dialog(page).getByLabel('Email').fill('atelier@example.test');
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(writes(fake)).toEqual([]);
  });

  test('a picked logo alone is unsent: Cancel asks', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openProfile(page);
    await dialog(page).locator('[data-test="profile-logo-input"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await expect(dialog(page).locator('[data-test="profile-logo-preview"]')).toBeVisible();
    await dialog(page).locator('[data-test="profile-cancel"]').click();
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(dialog(page).locator('[data-test="profile-logo-preview"]')).toBeVisible();
    expect(writes(fake)).toEqual([]);
  });
});

test.describe('#11669 Save as preset asks when a name is typed', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Save as preset' });
  const openPreset = async (page: Page) => {
    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    const change = page.locator('[data-test="book-change"]');
    if (!(await change.evaluate((d) => (d as HTMLDetailsElement).open))) await change.locator('summary').click();
    if (await change.locator('[data-test="book-save-preset"]').isDisabled()) {
      await change.locator('[data-test="book-tick-in-gift"]').click();
    }
    await change.locator('[data-test="book-save-preset"]').click();
    await expect(dialog(page)).toBeVisible();
  };

  test('empty closes at once; a typed name asks on Cancel and Esc; Discard closes; while Save runs no exit closes', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openPreset(page);
    await dialog(page).locator('[data-test="book-preset-cancel"]').click();
    await expect(dialog(page)).toHaveCount(0);
    await openPreset(page);
    const name = dialog(page).locator('[data-test="book-preset-name"]');
    await name.fill('Jobcenter');
    await dialog(page).locator('[data-test="book-preset-cancel"]').click();
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(name).toHaveValue('Jobcenter');
    await name.focus();
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(writes(fake).filter((w) => w.path === '/invoicing/book/presets')).toEqual([]);

    await openPreset(page);
    await dialog(page).locator('[data-test="book-preset-name"]').fill('Jobcenter');
    fake.hold = true;
    await dialog(page).locator('[data-test="book-preset-confirm"]').click();
    await expect.poll(() => writes(fake).filter((w) => w.path === '/invoicing/book/presets').length).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeVisible();
    await expect(ask(page)).toHaveCount(0);
    fake.release!();
    await expect(dialog(page)).toHaveCount(0);
  });
});

test.describe('#11669 the receipt and the export check close on Back', () => {
  test('a receipt opened from the Book closes on Back, and the page stays', async ({ page }) => {
    await open(page, newFake());
    await page.getByRole('tab', { name: 'Book', exact: true }).click();
    const month = page.locator('[data-test="book-month"][data-group="2026-07"]');
    if (await month.count()) await month.evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await page.locator('[data-test="book-expense-receipt"]:visible').first().click();
    const dialog = page.getByRole('dialog', { name: 'Receipt' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/member\/personal\/invoicing/);
  });

  test('the export check closes on Back, and the page stays', async ({ page }) => {
    await open(page, newFake());
    await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
    await page.locator('[data-test="export-zip"]').click();
    const dialog = page.getByRole('dialog', { name: 'Check before export' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/member\/personal\/invoicing/);
  });
});
