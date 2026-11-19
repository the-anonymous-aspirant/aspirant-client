import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #10550, design §3.142 Decisions 5-6): imported
 *  payers join the client book only when ze ticks them, in one dialog
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

// system_3 #11507 (epic #11497 item 5; Design ack c71154, amending §3.142
// Decisions 4 and 5): the way in is easier to see, a payer that is not a
// client says so, a middle name no longer hides a match, and Clients points
// at what in the book deserves a second look. Nothing is merged, renamed or
// deleted by any of it.
test.describe('#11507 payers and clients worth a second look', () => {
  const card = payer({ key: 'name:musterplatz.io 7c4e1a9b', payer: 'Musterplatz.io 7c4e1a9b', tidied_name: 'Musterplatz.io 7c4e1a9b', payment_ids: [51], payment_count: 1, totals: [{ currency: 'EUR', cents: 1800 }], first_paid_on: '2026-10-09', last_paid_on: '2026-10-09' });
  const middleName = payer({ key: 'name:renee fittizio', payer: 'Renée Fittizio', tidied_name: 'Renée Fittizio', payment_ids: [61], payment_count: 1, totals: [{ currency: 'EUR', cents: 9000 }], first_paid_on: '2026-10-11', last_paid_on: '2026-10-11' });
  const writes = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET');

  test('after an import, "Add payers…" is a bordered button on its own line under the sentence, with no count', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await importN26(page);
    const clause = page.locator('[data-test="payers-clause"]');
    const button = page.locator('[data-test="payers-open"]');
    await expect(clause).toHaveText('3 payers are not in your client book.');
    await expect(button).toHaveText('Add payers…');
    await expect(button).toHaveClass(/btn--secondary/);
    const c = (await clause.boundingBox())!;
    const b = (await button.boundingBox())!;
    expect(b.y, 'the button is under the sentence, not in it').toBeGreaterThanOrEqual(c.y + c.height);
    await button.click();
    await expect(page.locator('[data-test="payers-dialog"]')).toBeVisible();
  });

  test('a payer that looks like a card payment says so; a person and a company do not; every row starts unticked', async ({ page }) => {
    const fake = newFake({ payers: [card, payer(), payer({ key: 'email:galerie@example.org', payer: 'Galerie Nord', tidied_name: 'Galerie Nord', payment_ids: [41], payment_count: 1 })] });
    await open(page, fake);
    await openFromImport(page);
    await expect(rows(page)).toHaveCount(3);
    const flag = (i: number) => rows(page).nth(i).locator('[data-test="payers-row-not-client"]');
    await expect(flag(0)).toHaveText('Looks like a card payment or an online service, not a client.');
    await expect(flag(1)).toHaveCount(0);
    await expect(flag(2)).toHaveCount(0);
    // The hint decides nothing: the flagged row keeps its place and its box.
    for (let i = 0; i < 3; i += 1) await expect(check(page, i)).not.toBeChecked();
    await expect(rows(page).nth(0)).toContainText('Musterplatz.io 7c4e1a9b');
  });

  test('a middle name no longer hides a match: the dialog asks Use or Add', async ({ page }) => {
    const fake = newFake({ clients: [{ id: 1, name: 'Renee Carla Fittizio', paypal_email: '' }], payers: [middleName] });
    await open(page, fake);
    await openFromImport(page);
    await check(page, 0).check();
    await expect(page.locator('[data-test="payers-row-book-use-1"]')).toBeVisible();
    await expect(page.locator('[data-test="payers-row-book-add-new"]')).toBeVisible();
    // Nothing is saved while that choice stands open.
    await expect(save(page)).toBeDisabled();
    await page.locator('[data-test="payers-row-book-use-1"]').click();
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(page.locator('[data-test="payers-dialog"]')).toHaveCount(0);
    expect(JSON.parse(addRequests(fake)[0].body)).toEqual({ payers: [{ payment_ids: [61], client_id: 1 }] });
  });

  const book = [
    { id: 1, name: 'Renée Fittizio', paypal_email: '' },
    { id: 2, name: 'Galerie Nord', paypal_email: '' },
    { id: 3, name: 'Renee Carla Fittizio', paypal_email: '' },
    { id: 4, name: 'Musterplatz.io 7c4e1a9b', paypal_email: '' },
  ];
  async function openClients(page: Page, fake: Fake) {
    await open(page, fake);
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(page.locator('[data-test="clients-panel"]')).toBeVisible();
  }
  const review = (page: Page) => page.locator('[data-test="clients-review"]');
  const sentences = (page: Page) => page.locator('[data-test="clients-review-sentence"]');
  const clientRows = (page: Page) => page.locator('[data-test="client-row"]');

  test('Clients names the look-alike pair and the card payment, "Show them" lists only those, and nothing is sent', async ({ page }) => {
    const fake = newFake({ clients: book, payers: [] });
    await openClients(page, fake);
    await expect(sentences(page)).toHaveText([
      '2 clients look like the same person: Renée Fittizio and Renee Carla Fittizio.',
      '1 client looks like a card payment or an online service: Musterplatz.io 7c4e1a9b.',
    ]);
    // Two sentences, with a space between them and before the action.
    await expect(review(page)).toContainText('Renee Carla Fittizio. 1 client looks like');
    await expect(review(page)).toContainText('7c4e1a9b. Show them');
    // There on load, so not announced as news.
    await expect(review(page)).not.toHaveAttribute('role', 'status');
    await expect(clientRows(page)).toHaveCount(4);
    // A flag and its clear button stay inside the client's own name cell (or
    // card): the button's label is longer than the column is wide.
    for (const id of [1, 3, 4]) {
      const flag = page.locator(`[data-test="client-row"][data-client-id="${id}"]`).locator('[data-test="client-not-same"], [data-test="client-real"]').first();
      const container = (await flag.locator('xpath=ancestor::*[self::td or self::li][1]').boundingBox())!;
      const b = (await flag.boundingBox())!;
      expect(b.x + b.width, `client ${id}: the clear button ends inside its cell`).toBeLessThanOrEqual(container.x + container.width + 1);
      expect(b.x, `client ${id}: and starts inside it`).toBeGreaterThanOrEqual(container.x - 1);
    }

    // One label for both kinds of flag, on one line, and a name that says
    // which flag it hides (§3.160; system_3 #11570). A pair's names come in
    // the review line's order, so both of its rows carry the same name.
    const pairClear = page.getByRole('button', { name: 'Hide this flag on this device: Renée Fittizio and Renee Carla Fittizio' });
    const cardClear = page.getByRole('button', { name: 'Hide this flag on this device: Musterplatz.io 7c4e1a9b' });
    await expect(pairClear, 'both rows of the pair carry the one name').toHaveCount(2);
    await expect(cardClear).toHaveCount(1);
    for (const clear of [pairClear.first(), pairClear.last(), cardClear]) {
      await expect(clear).toHaveText('Hide on this device');
      const lines = await clear.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      });
      expect(lines, 'the label is on one line').toBe(1);
    }

    await page.locator('[data-test="clients-review-show"]').click();
    await expect(clientRows(page)).toHaveCount(3);
    await expect(page.locator('[data-test="client-row"][data-client-id="2"]')).toHaveCount(0);
    await expect(page.locator('[data-test="client-row"][data-client-id="1"] [data-test="client-look-alike"]')).toContainText('Looks like Renee Carla Fittizio');
    await expect(page.locator('[data-test="client-row"][data-client-id="3"] [data-test="client-look-alike"]')).toContainText('Looks like Renée Fittizio');
    await expect(page.locator('[data-test="client-row"][data-client-id="4"] [data-test="client-card-like"]')).toContainText('Looks like a card payment or an online service');
    await expect(page.locator('[data-test="clients-review-show"]')).toHaveText('Show all clients');
    await page.locator('[data-test="clients-review-show"]').click();
    await expect(clientRows(page)).toHaveCount(4);
    expect(writes(fake), 'looking writes nothing').toEqual([]);
  });

  test('a wrong guess is cleared on this device: it stays cleared after a reload, and no client is touched', async ({ page }) => {
    const fake = newFake({ clients: book, payers: [] });
    await openClients(page, fake);
    await page.locator('[data-test="client-row"][data-client-id="1"] [data-test="client-not-same"]').click();
    await expect(sentences(page)).toHaveText(['1 client looks like a card payment or an online service: Musterplatz.io 7c4e1a9b.']);
    await expect(page.locator('[data-test="client-look-alike"]')).toHaveCount(0);

    await page.reload();
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: 'Clients' }).click();
    await expect(sentences(page)).toHaveText(['1 client looks like a card payment or an online service: Musterplatz.io 7c4e1a9b.']);

    await page.locator('[data-test="client-row"][data-client-id="4"] [data-test="client-real"]').click();
    await expect(review(page)).toHaveCount(0);
    await expect(clientRows(page)).toHaveCount(4);
    expect(writes(fake), 'clearing a guess writes nothing to the server').toEqual([]);
    expect(fake.clients.map((c) => c.name)).toEqual(book.map((c) => c.name));
  });

  test('several pairs are counted, and a book with nothing to review shows no line', async ({ page }) => {
    const fake = newFake({ payers: [], clients: [
      { id: 1, name: 'Renée Fittizio', paypal_email: '' }, { id: 2, name: 'Renee Carla Fittizio', paypal_email: '' },
      { id: 3, name: 'Mara Esempio', paypal_email: '' }, { id: 4, name: 'Esempio Mara', paypal_email: '' },
    ] });
    await openClients(page, fake);
    await expect(sentences(page)).toHaveText(['2 pairs of clients look like the same person.']);
  });

  test('a book of different people and plain company names shows no review line', async ({ page }) => {
    const fake = newFake({ payers: [], clients: [
      { id: 1, name: 'Mara Esempio', paypal_email: '' }, { id: 2, name: 'Galerie Nord', paypal_email: '' }, { id: 3, name: 'Studio Erfunden GmbH', paypal_email: '' },
    ] });
    await openClients(page, fake);
    await expect(clientRows(page)).toHaveCount(3);
    await expect(review(page)).toHaveCount(0);
  });
});

// system_3 #11671 (A4 of #11632; §3.166, cited as #11629): the payers review
// asks before an exit throws away a tick or a name; a refetch that lands while
// it is open keeps what was ticked and typed.
test.describe('#11671 the payers review asks before an exit throws away a tick or a name', () => {
  const ask = (page: Page) => page.locator('[data-test="unsent-ask"]');
  const dialog = (page: Page) => page.locator('[data-test="payers-dialog"]');

  test('untouched closes at once; a tick asks on Cancel and Esc; Discard closes with nothing added', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openFromImport(page);
    await page.locator('[data-test="payers-cancel"]').click();
    await expect(dialog(page)).toHaveCount(0);

    await page.locator('[data-test="payers-open"]').click();
    await expect(dialog(page)).toBeVisible();
    await check(page, 0).check();
    await page.locator('[data-test="payers-cancel"]').click();
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(check(page, 0)).toBeChecked();
    await check(page, 0).focus();
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(addRequests(fake)).toEqual([]);
  });

  test('a refetch that lands while it is open keeps a ticked row and its name', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    // Saving a client starts the page's refetch; its client list is held
    // until the payers review is open and filled in, then lands.
    await page.route(/\/api\/invoicing\/clients\/\d+$/, (route) =>
      route.request().method() === 'PUT' ? json(route, 200, { client: fake.clients[0] }) : route.fallback());
    let releaseClients: (() => void) | null = null;
    let holdClients = false;
    await page.route(/\/api\/invoicing\/clients$/, async (route) => {
      if (route.request().method() !== 'GET' || !holdClients) return route.fallback();
      holdClients = false;
      await new Promise<void>((r) => (releaseClients = r));
      return json(route, 200, { clients: [...fake.clients, { id: 9, name: 'Atelier Süd', paypal_email: '' }] });
    });
    await page.getByRole('tab', { name: 'Clients', exact: true }).click();
    const edit = page.locator('[data-test="client-edit-1"]:visible');
    if (await edit.count()) await edit.click();
    else await page.locator('[data-test="client-row"]').first().click();
    holdClients = true;
    await page.locator('[data-test="client-save"]').click();
    await expect.poll(() => releaseClients !== null).toBe(true);
    await expect(page.getByRole('dialog', { name: /client/i })).toHaveCount(0);

    await page.locator('[data-test="clients-add-from-payments"]').click();
    await expect(dialog(page)).toBeVisible();
    await check(page, 0).check();
    const name = rows(page).nth(0).getByRole('combobox').first();
    await name.fill('Luca B.');
    const before = fake.requests.filter((r) => r.path === '/invoicing/payers/candidates').length;
    releaseClients!();
    await expect.poll(() => fake.requests.filter((r) => r.path === '/invoicing/payers/candidates').length).toBeGreaterThan(before);
    await page.waitForTimeout(300);
    await expect(check(page, 0)).toBeChecked();
    await expect(name).toHaveValue('Luca B.');
    await page.locator('[data-test="payers-cancel"]').click();
    await expect(ask(page)).toBeVisible();
  });
});
