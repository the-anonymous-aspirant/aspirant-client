import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #10550, design §3.142 Decisions 5-6): imported
 *  payers join the client book only when she ticks them, in one dialog
 *  reached from the import summary and from the Clients tab. Every call is
 *  answered by an in-memory fake of aspirant-server's
 *  /invoicing/payers/{candidates} and /invoicing/payers (#10548); a catch-all
 *  /api/ → 404 is registered FIRST. Every name, email and amount is invented. */

type Json = Record<string, any>;

interface Fake {
  clients: Json[];
  payers: Json[];
  leftOut: Json;
  addFailure?: { status: number; body: Json };
  candidatesFailure?: boolean;
  requests: Array<{ method: string; path: string; body: string }>;
}

const payer = (over: Json = {}): Json => ({
  key: 'name:luca beispiel', payer: 'LUCA BEISPIEL', tidied_name: 'Luca Beispiel',
  payment_ids: [21, 22, 23], payment_count: 3, totals: [{ currency: 'EUR', cents: 105000 }],
  first_paid_on: '2026-08-12', last_paid_on: '2026-10-03', ...over,
});

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    clients: [{ id: 1, name: 'Mara Esempio', paypal_email: '' }],
    payers: [
      payer(),
      payer({ key: 'name:mara e', payer: 'Mara E.', tidied_name: 'Mara E.', payment_ids: [31], payment_count: 1, totals: [{ currency: 'EUR', cents: 12000 }], first_paid_on: '2026-09-01', last_paid_on: '2026-09-01' }),
      payer({ key: 'email:galerie@example.org', payer: 'Galerie Nord', tidied_name: 'Galerie Nord', paypal_email: 'galerie@example.org', payment_ids: [41], payment_count: 1, totals: [{ currency: 'EUR', cents: 35000 }], first_paid_on: '2026-07-14', last_paid_on: '2026-07-14' }),
    ],
    leftOut: { paypal_to_n26: 2, other_category: 4, no_name: 0 },
    requests: [],
    ...over,
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() || '';
    fake.requests.push({ method, path, body });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/payers/candidates' && method === 'GET') {
      if (fake.candidatesFailure) return json(route, 500, { error: { code: 'internal_error', message: 'Error listing payers' } });
      return json(route, 200, { payers: fake.payers, left_out: fake.leftOut });
    }
    if (path === '/invoicing/payers' && method === 'POST') {
      if (fake.addFailure) return json(route, fake.addFailure.status, fake.addFailure.body);
      const rows: Json[] = JSON.parse(body).payers;
      let added = 0;
      for (const r of rows) {
        if (r.new_client_name) fake.clients.push({ id: 100 + fake.clients.length, name: r.new_client_name, paypal_email: '' });
        if (r.new_client_name) added++;
      }
      const linked = rows.reduce((n, r) => n + r.payment_ids.length, 0);
      const ids = new Set(rows.flatMap((r) => r.payment_ids));
      fake.payers = fake.payers.filter((p) => !p.payment_ids.some((id: number) => ids.has(id)));
      return json(route, 200, { clients_added: added, payments_linked: linked, clients: [] });
    }
    if (path === '/invoicing/payments/import-n26/parse' && method === 'POST') {
      return json(route, 200, { files: [{ filename: 'conferma.pdf', document_kind: 'n26_transfer_confirmation', candidates: [{ document_kind: 'n26_transfer_confirmation', transaction_id: 't-1', paid_on: '2026-10-03', currency: 'EUR', gross_cents: 12000, fee_cents: 0, net_cents: 12000, sender_name: 'Mara E.', note: '', already_imported: false }] }] });
    }
    if (path === '/invoicing/payments/import-n26/confirm' && method === 'POST') return json(route, 200, { summary: { confirmed: 1, duplicates: 0 } });
    if (path === '/invoicing/payments/import' && method === 'POST') {
      return json(route, 200, { summary: { rows_read: 3, imported: 3, duplicates: 0, skipped: 0, skipped_reasons: {}, format: 'csv' }, expense_candidates: [] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

async function importN26(page: Page): Promise<void> {
  await page.locator('[data-test="n26-file-input"]').setInputFiles([{ name: 'conferma.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }]);
  await page.locator('[data-test="n26-confirm"]').click();
  await expect(page.locator('[data-test="n26-summary"]')).toBeVisible();
}

async function openFromImport(page: Page): Promise<void> {
  await importN26(page);
  await page.locator('[data-test="payers-open"]').click();
  await expect(page.locator('[data-test="payers-dialog"]')).toBeVisible();
}

const rows = (page: Page) => page.locator('[data-test="payers-row"]');
const check = (page: Page, i: number) => rows(page).nth(i).locator('input[type="checkbox"]');
const save = (page: Page) => page.locator('[data-test="payers-save"]');
const hint = (page: Page) => page.locator('[data-test="payers-save-hint"]');
const addRequests = (fake: Fake) => fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payers');

test.describe('#10550 Add payers to your client book', () => {
  test('after an N26 import the summary names the payers not in the book and opens the dialog', async ({ page }) => {
    await open(page, newFake());
    await importN26(page);
    await expect(page.locator('[data-test="payers-clause"]')).toHaveText('3 payers are not in your client book.');
    await expect(page.locator('[data-test="payers-open"]')).toHaveText('Add payers…');
    await page.locator('[data-test="payers-open"]').click();

    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(0)).toContainText('LUCA BEISPIEL');
    await expect(rows(page).nth(0).locator('[data-test="payers-row-total"]')).toHaveText('3 payments · €1,050.00');
    await expect(rows(page).nth(0).locator('[data-test="payers-row-dates"]')).toHaveText('2026-08-12 – 2026-10-03');
    await expect(rows(page).nth(1).locator('[data-test="payers-row-dates"]')).toHaveText('2026-09-01');
    for (let i = 0; i < 3; i++) await expect(check(page, i)).not.toBeChecked();
    await expect(page.locator('[data-test="payers-not-listed"]')).toHaveText(
      'Not listed: 2 transfers from PayPal to N26, 4 payments marked Gift, Loan, Refund or Other.');
  });

  test('a PayPal import offers the dialog too; with no candidates there is no clause and no button', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="payments-file"]').setInputFiles([{ name: 'paypal.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n') }]);
    await expect(page.locator('[data-test="import-summary"] [data-test="payers-clause"]')).toHaveText('3 payers are not in your client book.');

    fake.payers = [];
    await page.locator('[data-test="payments-file"]').setInputFiles([{ name: 'paypal.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n') }]);
    await expect(page.locator('[data-test="import-summary"]')).toBeVisible();
    await expect(page.locator('[data-test="payers-clause"]')).toHaveCount(0);
    await expect(page.locator('[data-test="payers-open"]')).toHaveCount(0);
  });

  test('a failed candidates read hides the offer and leaves the summary as it was', async ({ page }) => {
    await open(page, newFake({ candidatesFailure: true }));
    await importN26(page);
    await expect(page.locator('[data-test="n26-summary"]')).toContainText('N26: read 1 row from 1 file');
    await expect(page.locator('[data-test="payers-open"]')).toHaveCount(0);
  });

  test('a ticked row shows the tidied name and what saving does with it, by Decision 3 state', async ({ page }) => {
    await open(page, newFake());
    await openFromImport(page);
    await expect(save(page)).toBeDisabled();
    await expect(hint(page)).toHaveText('Tick at least one payer');

    // New: tidied from all capitals (Decision 6).
    await check(page, 0).check();
    const name0 = rows(page).nth(0).locator('[data-test="payers-row-name"]');
    await expect(name0).toHaveValue('Luca Beispiel');
    await expect(rows(page).nth(0).locator('[data-test="payers-row-book-line"]')).toHaveText('Not in your client book yet: it will be added.');
    await expect(save(page)).toHaveText('Add to client book (1)');
    await expect(save(page)).toBeEnabled();

    // Close: "Mara E." against "Mara Esempio" asks, nothing preselected.
    await check(page, 1).check();
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-line"]')).toHaveText('Close to a client in your book:');
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-use-1"]')).toHaveText('Use Mara Esempio');
    await expect(save(page)).toBeDisabled();
    await expect(hint(page)).toHaveText('Choose Use or Add for Mara E.');

    // Picking Use resolves the row to "the same".
    await rows(page).nth(1).locator('[data-test="payers-row-book-use-1"]').click();
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-line"]')).toHaveText('In your client book.');
    await expect(hint(page)).toHaveCount(0);

    // Editing the name re-runs the match: "Esempio Mara" is close again.
    await rows(page).nth(1).locator('[data-test="payers-row-name"]').fill('Esempio Mara');
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-line"]')).toHaveText('Close to a client in your book:');
    await rows(page).nth(1).locator('[data-test="payers-row-book-add-new"]').click();
    await expect(hint(page)).toHaveCount(0);
  });

  test('saving posts each ticked row once, closes, and the region names what was added', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openFromImport(page);
    await check(page, 0).check();
    await check(page, 1).check();
    await rows(page).nth(1).locator('[data-test="payers-row-book-use-1"]').click();
    await expect(save(page)).toHaveText('Add to client book (2)');
    await save(page).click();
    await expect(page.locator('[data-test="payers-dialog"]')).toBeHidden();

    expect(JSON.parse(addRequests(fake)[0].body).payers).toEqual([
      { payment_ids: [21, 22, 23], new_client_name: 'Luca Beispiel' },
      { payment_ids: [31], client_id: 1 },
    ]);
    await expect(page.locator('[data-test="payers-summary"]')).toHaveText('Client book: added 1 client, linked 4 payments.');
    await expect(page.locator('[data-test="n26-summary"]')).toHaveCount(0);
  });

  test('a refused save keeps every tick and name and says nothing was saved', async ({ page }) => {
    const fake = newFake({ addFailure: { status: 409, body: { error: { code: 'payer_stale', message: 'a payment changed since the list was read; reopen it' } } } });
    await open(page, fake);
    await openFromImport(page);
    await check(page, 0).check();
    await rows(page).nth(0).locator('[data-test="payers-row-name"]').fill('Luca B.');
    await save(page).click();

    await expect(page.locator('[data-test="payers-error"]')).toHaveText('Nothing was saved: a payment changed since the list was read; reopen it');
    await expect(page.locator('[data-test="payers-dialog"]')).toBeVisible();
    await expect(check(page, 0)).toBeChecked();
    await expect(rows(page).nth(0).locator('[data-test="payers-row-name"]')).toHaveValue('Luca B.');
  });

  test('a PayPal row matched to a client with no PayPal email says the email will be saved', async ({ page }) => {
    const fake = newFake();
    fake.clients.push({ id: 2, name: 'Galerie Nord', paypal_email: '' });
    fake.payers[2].same_client = { id: 2, name: 'Galerie Nord', paypal_email: '' };
    await open(page, fake);
    await openFromImport(page);
    await check(page, 2).check();
    await expect(rows(page).nth(2).locator('[data-test="payers-row-book-line"]')).toHaveText('In your client book.');
    await expect(rows(page).nth(2).locator('[data-test="payers-row-paypal"]')).toHaveText('Their PayPal email will be saved on Galerie Nord.');
  });

  test('the Clients tab offers Add from payments only while candidates exist', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.getByRole('tab', { name: 'Clients' }).click();
    const button = page.locator('[data-test="clients-add-from-payments"]');
    await expect(button).toHaveText('Add from payments');
    await expect(button).toHaveClass(/btn--secondary/);
    await expect(page.locator('[data-test="client-add"]')).toHaveClass(/btn--primary/);
    await button.click();
    await expect(rows(page)).toHaveCount(3);
    for (let i = 0; i < 3; i++) await check(page, i).check();
    await rows(page).nth(1).locator('[data-test="payers-row-book-use-1"]').click();
    await save(page).click();
    await expect(page.locator('[data-test="payers-dialog"]')).toBeHidden();
    // One confirmation on either surface (design_agent c65575 point 5).
    const status = page.locator('[data-test="clients-payers-summary"]');
    await expect(status).toHaveText('Client book: added 2 clients, linked 5 payments.');
    await expect(status).toHaveAttribute('role', 'status');
    // Every candidate is now linked: the button goes away.
    await expect(button).toHaveCount(0);
    // The line clears on the tab's next action.
    await page.locator('[data-test="client-add"]').click();
    await expect(status).toHaveCount(0);
  });

  test('payer names render as text, never as markup', async ({ page }) => {
    const fake = newFake();
    fake.payers[0].payer = '<img src=x onerror="window.__xss=1">';
    await open(page, fake);
    await openFromImport(page);
    await expect(rows(page).nth(0)).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(rows(page).nth(0).locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test('at 390 the dialog has no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, newFake());
    await openFromImport(page);
    await check(page, 1).check();
    const fits = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth &&
      [...document.querySelectorAll('[role="dialog"] *')]
        .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
        .every((el) => el.scrollWidth <= el.clientWidth + 1));
    expect(fits).toBe(true);
  });
});
