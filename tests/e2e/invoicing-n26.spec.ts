import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** N26 PDF import in the Invoices app (system_3 #9760-B1), over aspirant-server's
 *  /api/invoicing/payments/import-n26/{parse,confirm} (#9812). Parse stores
 *  nothing and returns candidate rows per file; the owner confirms or skips each
 *  row; confirm stores the kept rows. Every call is answered by an in-memory
 *  fake, with a catch-all /api/ → 404 registered FIRST (see invoicing.spec.ts).
 *
 *  The uploaded files are look-alike stand-ins: the client never reads PDF
 *  bytes (the fake answers the parse), and every name, amount and reference
 *  below is invented. */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  // Parse result per uploaded filename; an unknown name reads as not N26.
  parsed: Record<string, Json>;
  confirmFailure?: { status: number; body: Json };
  // When set, the parse answers only after this settles (an import in flight).
  holdParse?: Promise<void>;
  requests: Array<{ method: string; path: string; body: string; contentType: string }>;
}

const confirmation = (over: Json = {}): Json => ({
  document_kind: 'n26_transfer_confirmation',
  transaction_id: 'a1b2c3d4-0e15-4a6f-9bd0-000000000001',
  paid_on: '2026-07-14',
  currency: 'EUR',
  gross_cents: 25000,
  fee_cents: 0,
  net_cents: 25000,
  sender_name: 'Mara Esempio',
  note: 'Wandbild Juli',
  already_imported: false,
  ...over,
});

const statementRow = (n: number, over: Json = {}): Json => ({
  document_kind: 'n26_account_statement',
  transaction_id: `stmt-00000000000000000000000${n}`,
  paid_on: `2026-08-0${n}`,
  currency: 'EUR',
  gross_cents: 10000 * n,
  fee_cents: 0,
  net_cents: 10000 * n,
  sender_name: n === 1 ? 'Luca Beispiel' : 'Ada Muster',
  note: `Auftrag ${n}`,
  already_imported: false,
  ...over,
});

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    payments: [
      { id: 10, kind: 'incoming', source: 'paypal', transaction_id: 'TX1', paid_on: '2026-07-01T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: '', category: 'uncategorised', client_id: null },
    ],
    parsed: {
      'conferma.pdf': { filename: 'conferma.pdf', document_kind: 'n26_transfer_confirmation', candidates: [confirmation()] },
      'statement.pdf': { filename: 'statement.pdf', document_kind: 'n26_account_statement', candidates: [statementRow(1), statementRow(2)] },
    },
    requests: [],
    ...over,
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockInvoicing(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() || '';
    fake.requests.push({ method, path, body, contentType: req.headers()['content-type'] || '' });

    if (path === '/invoicing/profile' && method === 'GET') {
      return json(route, 200, {
        profile: { full_name: 'Flower Example', address: 'Beispielstraße 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 },
        saved: true,
      });
    }
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/payments/import-n26/parse' && method === 'POST') {
      if (fake.holdParse) await fake.holdParse;
      const names = [...body.matchAll(/name="files"; filename="([^"]+)"/g)].map((m) => m[1]);
      const files = names.map((name) =>
        fake.parsed[name] || { filename: name, error: { code: 'not_n26_document', message: 'not an N26 transfer confirmation or account statement' } });
      return json(route, 200, { files });
    }
    if (path === '/invoicing/payments/import-n26/confirm' && method === 'POST') {
      if (fake.confirmFailure) return json(route, fake.confirmFailure.status, fake.confirmFailure.body);
      const rows: Json[] = JSON.parse(body).rows;
      let confirmed = 0;
      let duplicates = 0;
      for (const row of rows) {
        if (fake.payments.some((p) => p.source === 'n26' && p.transaction_id === row.transaction_id)) {
          duplicates++;
          continue;
        }
        fake.payments.push({
          id: 100 + fake.payments.length, kind: 'incoming', source: 'n26', entry: 'import',
          transaction_id: row.transaction_id, paid_on: `${row.paid_on}T00:00:00Z`, currency: 'EUR',
          gross_cents: row.gross_cents, sender_name: row.sender_name, sender_email: '', note: row.note,
          category: 'uncategorised', client_id: null,
        });
        confirmed++;
      }
      return json(route, 200, { summary: { confirmed, duplicates } });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

// A look-alike stand-in: a PDF header and invented text, nothing from a real file.
const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(`%PDF-1.4\n% look-alike N26 document for tests: ${name}\n%%EOF\n`),
});

async function open(page: Page, fake: Fake): Promise<void> {
  await mockInvoicing(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
}

async function upload(page: Page, names: string[]): Promise<void> {
  await expect(page.locator('[data-test="n26-import"]')).toBeVisible();
  await page.locator('[data-test="n26-file-input"]').setInputFiles(names.map(pdf));
  await expect(page.locator('[data-test="n26-review"]')).toBeVisible();
}

const confirmRequests = (fake: Fake) =>
  fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payments/import-n26/confirm');

const noSideScroll = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth &&
    [...document.querySelectorAll('[role="dialog"] *')]
      .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
      .every((el) => el.scrollWidth <= el.clientWidth + 1));

const summary = (page: Page) => page.locator('[data-test="n26-summary"]');

// read = imported + already imported + skipped + left out, on every path (design_agent c61091).
async function expectSummaryAddsUp(page: Page): Promise<void> {
  const text = (await summary(page).innerText()).replace(/\s+/g, ' ');
  const m = text.match(/read (\d+) rows? .*?: (\d+) imported, (\d+) already imported, (\d+) skipped(?:, (\d+) transfers? from PayPal left out)?/);
  expect(m, text).not.toBeNull();
  const [read, imported, already, skipped, leftOut] = m!.slice(1).map((v) => Number(v || 0));
  expect(read, text).toBe(imported + already + skipped + leftOut);
}
const checkbox = (page: Page, i: number) => page.locator('[data-test="n26-row"]').nth(i).locator('input[type="checkbox"]');

test.describe('#9760-B1 Invoices app — N26 PDF import, confirm each row', () => {
  test('two files: every row is listed, confirmed rows land uncategorised in the payments table', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="n26-import"]')).toHaveClass(/btn--secondary/);

    await upload(page, ['conferma.pdf', 'statement.pdf']);
    const parse = fake.requests.find((r) => r.path === '/invoicing/payments/import-n26/parse')!;
    expect(parse.contentType).toContain('multipart/form-data');
    expect([...parse.body.matchAll(/name="files"; filename="([^"]+)"/g)].map((m) => m[1])).toEqual(['conferma.pdf', 'statement.pdf']);

    // The kind is a fact about the file: once, on its group heading (c60358 item 3).
    const headings = page.locator('[data-test="n26-file-heading"]');
    await expect(headings.nth(0)).toHaveText('conferma.pdf · Transfer confirmation');
    await expect(headings.nth(1)).toHaveText('statement.pdf · Account statement');

    const rows = page.locator('[data-test="n26-row"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).not.toContainText('Transfer confirmation');
    await expect(rows.nth(0)).toContainText('Mara Esempio');
    await expect(rows.nth(0)).toContainText('€250.00');
    await expect(rows.nth(0).locator('[data-test="n26-row-meta"]')).toHaveText('2026-07-14 · Wandbild Juli');
    for (let i = 0; i < 3; i++) await expect(checkbox(page, i)).toBeChecked();
    expect(await noSideScroll(page)).toBe(true);

    await expect(page.locator('[data-test="n26-confirm"]')).toHaveText('Import 3 payments');
    await page.locator('[data-test="n26-confirm"]').click();
    await expect(page.locator('[data-test="n26-review"]')).toBeHidden();

    const posted = JSON.parse(confirmRequests(fake)[0].body).rows;
    expect(posted.map((r: Json) => r.transaction_id)).toEqual([
      'a1b2c3d4-0e15-4a6f-9bd0-000000000001',
      statementRow(1).transaction_id,
      statementRow(2).transaction_id,
    ]);
    expect(posted[0]).toMatchObject({ document_kind: 'n26_transfer_confirmation', paid_on: '2026-07-14', gross_cents: 25000, currency: 'EUR' });

    // The line names its source (c60358 item 1).
    await expect(summary(page)).toHaveText('N26 PDFs: read 3 rows from 2 files: 3 imported, 0 already imported, 0 skipped.');
    for (const txn of ['a1b2c3d4-0e15-4a6f-9bd0-000000000001', statementRow(1).transaction_id, statementRow(2).transaction_id]) {
      const row = page.locator(`[data-test="payment-row"][data-txn="${txn}"]`);
      await expect(row).toBeVisible();
      await expect(row.locator('[data-test="payment-category"]')).toContainText('Uncategorised');
    }
  });

  test('an unticked row is not posted and is counted as skipped; zero ticked disables Import and says why', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await upload(page, ['statement.pdf']);

    const confirm = page.locator('[data-test="n26-confirm"]');
    await checkbox(page, 0).uncheck();
    await checkbox(page, 1).uncheck();
    await expect(confirm).toHaveText('Import 0 payments');
    await expect(confirm).toBeDisabled();
    await expect(page.locator('[data-test="n26-tick-hint"]')).toHaveText('Tick at least one row to import.');

    await checkbox(page, 0).check();
    await expect(page.locator('[data-test="n26-tick-hint"]')).toHaveCount(0);
    await expect(confirm).toHaveText('Import 1 payment');
    await confirm.click();

    const posted = JSON.parse(confirmRequests(fake)[0].body).rows;
    expect(posted.map((r: Json) => r.transaction_id)).toEqual([statementRow(1).transaction_id]);
    await expect(summary(page)).toHaveText('N26 PDFs: read 2 rows from 1 file: 1 imported, 0 already imported, 1 skipped.');
    await expect(page.locator(`[data-test="payment-row"][data-txn="${statementRow(2).transaction_id}"]`)).toHaveCount(0);
  });

  test('a row already imported has no checkbox; a same-date-and-amount row starts unticked and names the payment it matches', async ({ page }) => {
    const fake = newFake();
    fake.parsed['statement.pdf'].candidates = [
      statementRow(1, { already_imported: true }),
      statementRow(2, { possible_duplicate_of: 10 }),
      statementRow(3, { possible_duplicate_of: 999 }),
      statementRow(4),
    ];
    await open(page, fake);
    await upload(page, ['statement.pdf']);

    const rows = page.locator('[data-test="n26-row"]');
    await expect(rows.nth(0).locator('[data-test="n26-row-imported"]')).toHaveText('Already imported');
    // Absent, not disabled (§3.22, design_agent c60363); its text still lines up.
    await expect(checkbox(page, 0)).toHaveCount(0);
    const payerLeft = (i: number) =>
      rows.nth(i).locator('.n26-row__payer').evaluate((el) => Math.round(el.getBoundingClientRect().left));
    expect(await payerLeft(0)).toBe(await payerLeft(1));
    // Named when the matched payment is loaded; generic when it is not.
    await expect(rows.nth(1).locator('[data-test="n26-row-duplicate"]')).toHaveText(
      "Same date and amount as Galerie Nord's payment on 2026-07-01. Tick it only if it is a different payment.",
    );
    await expect(rows.nth(2).locator('[data-test="n26-row-duplicate"]')).toHaveText(
      'Same date and amount as a payment already here. Tick it only if it is a different payment.',
    );
    await expect(checkbox(page, 1)).not.toBeChecked();
    await expect(checkbox(page, 2)).not.toBeChecked();
    await expect(checkbox(page, 3)).toBeChecked();

    await page.locator('[data-test="n26-confirm"]').click();
    const posted = JSON.parse(confirmRequests(fake)[0].body).rows;
    expect(posted.map((r: Json) => r.transaction_id)).toEqual([statementRow(4).transaction_id]);
    await expect(summary(page)).toHaveText('N26 PDFs: read 4 rows from 1 file: 1 imported, 1 already imported, 2 skipped.');
  });

  test('a file the server cannot read shows its error, and stays named in the summary after the dialog closes', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await upload(page, ['conferma.pdf', 'holiday-photo.pdf']);

    await expect(page.locator('[data-test="n26-file"]').nth(1).locator('[data-test="n26-file-error"]')).toHaveText(
      'This file could not be read: not an N26 document.',
    );
    await page.locator('[data-test="n26-confirm"]').click();
    await expect(summary(page)).toHaveText(
      'N26 PDFs: read 1 row from 2 files: 1 imported, 0 already imported, 0 skipped. 1 file could not be read: holiday-photo.pdf (not an N26 document).',
    );
  });

  test('when no file yields a payment the footer has only Close and says why; the failure stays in the summary', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await upload(page, ['holiday-photo.pdf']);

    await expect(page.locator('[data-test="n26-confirm"]')).toHaveCount(0);
    await expect(page.locator('[data-test="n26-nothing"]')).toHaveText('Nothing to import: no payment could be read from these files.');
    await page.locator('[data-test="n26-close"]').click();
    await expect(page.locator('[data-test="n26-review"]')).toBeHidden();
    expect(confirmRequests(fake)).toHaveLength(0);
    await expect(summary(page)).toHaveText(
      'N26 PDFs: read 0 rows from 1 file: 0 imported, 0 already imported, 0 skipped. 1 file could not be read: holiday-photo.pdf (not an N26 document).',
    );
  });

  test('when every row is already imported the footer has only Close and says so', async ({ page }) => {
    const fake = newFake();
    fake.parsed['conferma.pdf'].candidates = [confirmation({ already_imported: true })];
    await open(page, fake);
    await upload(page, ['conferma.pdf']);

    await expect(page.locator('[data-test="n26-confirm"]')).toHaveCount(0);
    await expect(page.locator('[data-test="n26-nothing"]')).toHaveText('Nothing new to import: every row is already imported.');
    await page.locator('[data-test="n26-close"]').click();
    await expect(summary(page)).toHaveText('N26 PDFs: read 1 row from 1 file: 0 imported, 1 already imported, 0 skipped.');
  });

  // #9881: a credit whose payer is PayPal is her own transfer, already counted
  // in the PayPal import; the server leaves it out and counts it per file.
  test('a file whose only row was a transfer from PayPal says so, and the footer and summary name it', async ({ page }) => {
    const fake = newFake();
    fake.parsed['paypal.pdf'] = { filename: 'paypal.pdf', document_kind: 'n26_transfer_confirmation', skipped: { paypal_transfer: 1 } };
    await open(page, fake);
    await upload(page, ['paypal.pdf']);

    const file = page.locator('[data-test="n26-file"]').nth(0);
    await expect(file.locator('[data-test="n26-file-paypal"]')).toHaveText(
      '1 transfer from PayPal left out: its payments come in through your PayPal import.',
    );
    await expect(file.locator('[data-test="n26-file-empty"]')).toHaveCount(0);
    await expect(page.locator('[data-test="n26-row"]')).toHaveCount(0);
    await expect(page.locator('[data-test="n26-confirm"]')).toHaveCount(0);
    await expect(page.locator('[data-test="n26-nothing"]')).toHaveText('Nothing to import: every payment read is a transfer from PayPal.');
    await page.locator('[data-test="n26-close"]').click();
    expect(confirmRequests(fake)).toHaveLength(0);
    await expect(summary(page)).toHaveText(
      'N26 PDFs: read 1 row from 1 file: 0 imported, 0 already imported, 0 skipped, 1 transfer from PayPal left out (its payments come in through PayPal).',
    );
    await expectSummaryAddsUp(page);
  });

  test('a statement with transfers from PayPal lists its other rows and names how many it left out', async ({ page }) => {
    const fake = newFake();
    fake.parsed['statement.pdf'].skipped = { paypal_transfer: 2 };
    await open(page, fake);
    await upload(page, ['conferma.pdf', 'statement.pdf']);

    const files = page.locator('[data-test="n26-file"]');
    await expect(files.nth(0).locator('[data-test="n26-file-paypal"]')).toHaveCount(0);
    await expect(files.nth(1).locator('[data-test="n26-file-paypal"]')).toHaveText(
      '2 transfers from PayPal left out: their payments come in through your PayPal import.',
    );
    await expect(files.nth(1).locator('[data-test="n26-row"]')).toHaveCount(2);
    expect(await noSideScroll(page)).toBe(true);

    await page.locator('[data-test="n26-confirm"]').click();
    await expect(page.locator('[data-test="n26-review"]')).toBeHidden();
    expect(JSON.parse(confirmRequests(fake)[0].body).rows).toHaveLength(3);
    await expect(summary(page)).toHaveText(
      'N26 PDFs: read 5 rows from 2 files: 3 imported, 0 already imported, 0 skipped, 2 transfers from PayPal left out (their payments come in through PayPal).',
    );
    await expectSummaryAddsUp(page);
  });

  // Dismissing without importing (close(false)) still adds up (c61091 item 3).
  test('cancelling a review with transfers from PayPal counts them as left out, apart from the skipped rows', async ({ page }) => {
    const fake = newFake();
    fake.parsed['statement.pdf'].skipped = { paypal_transfer: 2 };
    fake.parsed['conferma.pdf'].candidates = [confirmation({ already_imported: true })];
    await open(page, fake);
    await upload(page, ['conferma.pdf', 'statement.pdf']);
    await page.locator('[data-test="n26-cancel"]').click();
    await expect(page.locator('[data-test="n26-review"]')).toBeHidden();
    expect(confirmRequests(fake)).toHaveLength(0);
    await expect(summary(page)).toHaveText(
      'N26 PDFs: read 5 rows from 2 files: 0 imported, 1 already imported, 2 skipped, 2 transfers from PayPal left out (their payments come in through PayPal).',
    );
    await expectSummaryAddsUp(page);
  });

  test('Cancel imports nothing and reports every row as skipped', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await upload(page, ['statement.pdf']);
    await page.locator('[data-test="n26-cancel"]').click();
    await expect(page.locator('[data-test="n26-review"]')).toBeHidden();
    expect(confirmRequests(fake)).toHaveLength(0);
    await expect(summary(page)).toHaveText('N26 PDFs: read 2 rows from 1 file: 0 imported, 0 already imported, 2 skipped.');
  });

  test('a server refusal on confirm stays in the dialog and stores nothing', async ({ page }) => {
    const fake = newFake({ confirmFailure: { status: 400, body: { error: { code: 'invalid_row', message: 'row 0: paid_on is in the future' } } } });
    await open(page, fake);
    await upload(page, ['conferma.pdf']);

    await page.locator('[data-test="n26-confirm"]').click();
    await expect(page.locator('[data-test="n26-error"]')).toHaveText('row 0: paid_on is in the future');
    await expect(page.locator('[data-test="n26-review"]')).toBeVisible();
    await expect(summary(page)).toHaveCount(0);
    await expect(page.locator('[data-test="payment-row"][data-txn="a1b2c3d4-0e15-4a6f-9bd0-000000000001"]')).toHaveCount(0);
  });

  test('more than ten PDFs at once are refused before any upload, never truncated', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="n26-file-input"]').setInputFiles(Array.from({ length: 11 }, (_, i) => pdf(`f${i}.pdf`)));
    await expect(page.locator('[data-test="import-error"]')).toHaveText('N26 PDFs: choose at most 10 PDFs at a time.');
    expect(fake.requests.filter((r) => r.path.includes('import-n26'))).toHaveLength(0);
  });

  test('while the N26 upload is being read, the PayPal import is disabled', async ({ page }) => {
    let release!: () => void;
    const fake = newFake({ holdParse: new Promise<void>((resolve) => { release = resolve; }) });
    await open(page, fake);
    await page.locator('[data-test="n26-file-input"]').setInputFiles([pdf('conferma.pdf')]);
    await expect(page.locator('[data-test="payments-import"]')).toBeDisabled();
    release();
    await expect(page.locator('[data-test="n26-review"]')).toBeVisible();
    await expect(page.locator('[data-test="payments-import"]')).toBeEnabled();
  });

  test('payer-written text in a parsed row renders as text, never as markup', async ({ page }) => {
    const fake = newFake();
    fake.parsed['conferma.pdf'].candidates = [confirmation({ sender_name: '<b>bold?</b>', note: '<img src=x onerror="window.__xss=1">' })];
    await open(page, fake);
    await upload(page, ['conferma.pdf']);

    const row = page.locator('[data-test="n26-row"]').first();
    await expect(row).toContainText('<b>bold?</b>');
    await expect(row).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(row.locator('b, img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});

// design_agent c60358: the three ways in sit right-aligned on ONE row at 641
// and 768px with the sidebar in its default state, each label whole
// (§3.115: scrollWidth − clientWidth ≤ 0). A 2+1 split goes back to design.
test.describe('#9760-B1 the head row holds three ways in', () => {
  for (const width of [641, 768]) {
    test(`at ${width}px all three ways in share one row, no label clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, newFake());
      const ids = ['manual-new', 'payments-import', 'n26-import'];
      const m = await page.evaluate((ids) => {
        const els = ids.map((id) => document.querySelector(`[data-test="${id}"]`) as HTMLElement);
        return {
          tops: els.map((el) => Math.round(el.getBoundingClientRect().top)),
          overflow: els.map((el) => el.scrollWidth - el.clientWidth),
          widths: els.map((el) => Math.round(el.getBoundingClientRect().width)),
          row: Math.round(document.querySelector('.ways-in')!.getBoundingClientRect().width),
        };
      }, ids);
      console.log(`ways-in @${width}: ${JSON.stringify(m)}`);
      expect(new Set(m.tops).size, `one row: tops ${m.tops}`).toBe(1);
      for (const o of m.overflow) expect(o).toBeLessThanOrEqual(0);
    });
  }
});
