import { test, expect, type Page, type Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

/** One receipt per work expense (system_3 #10602/#10603), attached from the
 *  Book's expense row. The server endpoints are covered by aspirant-server's
 *  own Go tests; this spec covers the client dialog's state machine (none /
 *  set / loading / error) and scoping against an in-memory fake of
 *  /api/invoicing/*. A catch-all /api/ → 404 is registered first so nothing
 *  reaches a live server. */

type Json = Record<string, any>;

interface ReceiptFake {
  content: Buffer;
  contentType: string;
}

interface Fake {
  expenses: Json[];
  receipts: Map<number, ReceiptFake>;
  // The mock does not parse multipart bodies -- it pops the next entry here
  // on every PUT, so a test controls exactly what the "uploaded" receipt
  // becomes without needing a faithful multipart parser (the actual bytes
  // round-trip through aspirant-server's own Go tests, not this spec).
  nextUploads: ReceiptFake[];
  refuseNextUpload?: Json;
  // system_3 #11510: refuse the next hand entry, or hold it until released.
  refuseNextCreate?: Json;
  holdCreate?: Promise<void>;
  requests: Array<{ method: string; path: string }>;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// A real PNG (correct CRCs and zlib stream) of w×h opaque black pixels --
// decodable, so the preview <img>'s naturalWidth distinguishes two receipts.
function blackPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const expenseRow = (id: number, over: Json = {}) => ({
  id, source: 'manual', transaction_id: `M-e${id}`, paid_on: '2026-07-20T00:00:00Z',
  currency: 'EUR', amount_cents: 4599, note: 'Guitar strings', category: 'materials and supplies',
  client_id: null, entry: 'manual', reference: '', ...over,
});

const newFake = (over: Partial<Fake> = {}): Fake => ({
  expenses: [expenseRow(101)],
  receipts: new Map(),
  nextUploads: [],
  requests: [],
  ...over,
});

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const extFor = (contentType: string) => (contentType === 'application/pdf' ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg');

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path });

    if (path === '/invoicing/profile') {
      return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    }
    if (path === '/invoicing/clients') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    // What the Book counts (system_3 #10635): the starting selection, Work only.
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: [] });
    // A hand entry (system_3 #11510): the new expense comes back with its id,
    // which the receipt's upload then needs.
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      if (fake.refuseNextCreate) {
        const err = fake.refuseNextCreate;
        fake.refuseNextCreate = undefined;
        return json(route, 400, { error: err });
      }
      if (fake.holdCreate) await fake.holdCreate;
      const body = JSON.parse(req.postData() || '{}');
      const expense = { id: 500 + fake.expenses.length, source: 'manual', entry: 'manual', transaction_id: 'M-new', currency: 'EUR', client_id: null, reference: '', ...body, paid_on: `${body.paid_on}T00:00:00Z` };
      fake.expenses.push(expense);
      return json(route, 201, { expense });
    }

    const receiptMatch = path.match(/^\/invoicing\/expenses\/(\d+)\/receipt$/);
    if (receiptMatch) {
      const id = Number(receiptMatch[1]);
      if (method === 'GET') {
        const r = fake.receipts.get(id);
        if (!r) return json(route, 404, { error: { code: 'not_found', message: 'No receipt is attached' } });
        return route.fulfill({
          status: 200,
          contentType: r.contentType,
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Content-SHA256': 'deadbeef',
            'Content-Disposition': `attachment; filename="receipt-${id}.${extFor(r.contentType)}"`,
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          },
          body: r.content,
        });
      }
      if (method === 'PUT') {
        if (fake.refuseNextUpload) {
          const err = fake.refuseNextUpload;
          fake.refuseNextUpload = undefined;
          return json(route, 400, { error: err });
        }
        const next = fake.nextUploads.shift();
        const uploaded = next || { content: blackPng(10, 10), contentType: 'image/png' };
        fake.receipts.set(id, uploaded);
        return json(route, 200, { receipt: { content_type: uploaded.contentType, filename: 'receipt', sha256: 'deadbeef', size_bytes: uploaded.content.length }, saved: true });
      }
      if (method === 'DELETE') {
        if (!fake.receipts.has(id)) return json(route, 404, { error: { code: 'not_found', message: 'No receipt is attached' } });
        fake.receipts.delete(id);
        return json(route, 200, { deleted: true });
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
  await page.getByRole('tab', { name: 'Book' }).click();
  await expect(page.locator('[data-test="book-panel"]')).toBeVisible();
}

const openReceiptFor = async (page: Page, row = 0) => {
  await page.locator('[data-test="book-row"]').nth(row).locator('[data-test="book-expense-receipt"]').click();
  await expect(page.locator('[data-test="receipt-dialog"]')).toBeVisible();
};

// The preview is decoded, not just present (same discipline as the logo spec):
// an <img> with a blob URL that failed to load would still be "visible".
async function expectImagePreview(page: Page, naturalWidth: number): Promise<void> {
  const img = page.locator('[data-test="receipt-preview-image"]');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(naturalWidth);
};

test.describe('#10603 Invoices: a receipt on a work expense', () => {
  test('with no receipt the dialog offers to attach one, fetching nothing before opening', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    expect(fake.requests.some((r) => r.path.endsWith('/receipt'))).toBe(false);

    await openReceiptFor(page);
    await expect(page.locator('[data-test="receipt-none"]')).toHaveText('No receipt attached.');
    await expect(page.locator('[data-test="receipt-attach"]')).toHaveText('Attach receipt');
    await expect(page.locator('[data-test="receipt-download"]')).toHaveCount(0);
    await expect(page.locator('[data-test="receipt-remove"]')).toHaveCount(0);
  });

  test('attaching a receipt previews it at once, sent immediately (not staged)', async ({ page }) => {
    const img = blackPng(400, 200);
    const fake = newFake({ nextUploads: [{ content: img, contentType: 'image/png' }] });
    await open(page, fake);
    await openReceiptFor(page);

    await page.locator('[data-test="receipt-file-input"]').setInputFiles({ name: 'kvitto.png', mimeType: 'image/png', buffer: img });
    await expectImagePreview(page, 400);
    await expect(page.locator('[data-test="receipt-attach"]')).toHaveText('Replace receipt');
    await expect(page.locator('[data-test="receipt-remove"]')).toBeVisible();
    expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);

    // Reopened, the dialog re-fetches and shows what the server now holds.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('[data-test="receipt-dialog"]')).toBeHidden();
    await openReceiptFor(page);
    await expectImagePreview(page, 400);
  });

  test('a set receipt is previewed on open, and Download fetches it with the server-built filename', async ({ page }) => {
    const img = blackPng(60, 30);
    const fake = newFake({ receipts: new Map([[101, { content: img, contentType: 'image/png' }]]) });
    await open(page, fake);
    await openReceiptFor(page);
    await expectImagePreview(page, 60);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-test="receipt-download"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('receipt-101.png');
  });

  test('a PDF receipt previews in an iframe pointed at a blob: URL, never the API URL', async ({ page }) => {
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const fake = newFake({ receipts: new Map([[101, { content: pdf, contentType: 'application/pdf' }]]) });
    await open(page, fake);
    await openReceiptFor(page);
    const frame = page.locator('[data-test="receipt-preview-pdf"]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('[data-test="receipt-preview-image"]')).toHaveCount(0);
  });

  // Security review c65957 on #10623: a blob: document runs in the app's own
  // origin and the server's sandbox CSP does not carry over to it, so a 200
  // of any type other than PDF/PNG/JPEG (a proxy page, an SPA fallback) must
  // never become an iframe or image. Download stays offered.
  test('a receipt answered with any other type is not previewed: Download only', async ({ page }) => {
    const html = Buffer.from('<!doctype html><script>window.__pwned = 1</script><p>not a receipt</p>');
    const fake = newFake({ receipts: new Map([[101, { content: html, contentType: 'text/html; charset=utf-8' }]]) });
    await open(page, fake);
    await openReceiptFor(page);
    await expect(page.locator('[data-test="receipt-preview-unavailable"]')).toHaveText('Preview not available. Use Download to open it.');
    await expect(page.locator('[data-test="receipt-preview-pdf"]')).toHaveCount(0);
    await expect(page.locator('[data-test="receipt-preview-image"]')).toHaveCount(0);
    await expect(page.locator('[data-test="receipt-download"]')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('Replace swaps the preview and Remove clears it (two-step confirm)', async ({ page }) => {
    const original = blackPng(60, 30);
    const replacement = blackPng(500, 10);
    const fake = newFake({
      receipts: new Map([[101, { content: original, contentType: 'image/png' }]]),
      nextUploads: [{ content: replacement, contentType: 'image/png' }],
    });
    await open(page, fake);
    await openReceiptFor(page);
    await expectImagePreview(page, 60);

    await page.locator('[data-test="receipt-file-input"]').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: replacement });
    await expectImagePreview(page, 500);

    const removeBtn = page.locator('[data-test="receipt-remove"]');
    await expect(removeBtn).toHaveText('Remove');
    await removeBtn.click();
    await expect(removeBtn).toHaveText('Remove this receipt');
    await expect(page.locator('[data-test="receipt-preview-image"]')).toBeVisible(); // not yet removed
    await removeBtn.click();
    await expect(page.locator('[data-test="receipt-none"]')).toHaveText('No receipt attached.');
    expect(fake.receipts.has(101)).toBe(false);
  });

  test('a refused upload (oversize or unsupported type) shows the server message and keeps the dialog as it was', async ({ page }) => {
    const fake = newFake({ refuseNextUpload: { code: 'bad_request', message: 'the receipt is larger than 5 MB' } });
    await open(page, fake);
    await openReceiptFor(page);
    await page.locator('[data-test="receipt-file-input"]').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    await expect(page.locator('[data-test="receipt-error"]')).toHaveText('the receipt is larger than 5 MB');
    await expect(page.locator('[data-test="receipt-none"]')).toBeVisible();
  });

  test('two expenses are scoped independently: attaching to one never shows on the other', async ({ page }) => {
    const img = blackPng(60, 30);
    const fake = newFake({
      expenses: [expenseRow(101), expenseRow(102, { id: 102, note: 'Strings, round two' })],
      nextUploads: [{ content: img, contentType: 'image/png' }],
    });
    await open(page, fake);
    await expect(page.locator('[data-test="book-row"]')).toHaveCount(2);

    // Both are paid on one day, so the row entered last (102) is first
    // (§3.145 Decision 1): expense 101 is row 1.
    await openReceiptFor(page, 1);
    await page.locator('[data-test="receipt-file-input"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: img });
    await expectImagePreview(page, 60);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await openReceiptFor(page, 0);
    await expect(page.locator('[data-test="receipt-none"]')).toHaveText('No receipt attached.');
    expect(fake.receipts.has(101)).toBe(true);
    expect(fake.receipts.has(102)).toBe(false);
  });
});

// system_3 #11510 (operator c70883 on #10985; design ack on #11510): the
// receipt can be picked while the expense is entered by hand, not only from
// its row after saving. An upload needs the expense's id, so the file waits in
// the browser and goes up straight after Save has created the expense. The
// dialog then closes whatever the upload did, and the tab's summary line says
// what became of the receipt.
test.describe('#11510 a receipt while entering an expense by hand', () => {
  const png = blackPng(10, 10);
  const PNG = { name: 'kassenbon.png', mimeType: 'image/png', buffer: png };
  const PDF = { name: 'rechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fake\n') };
  const withPngHead = (size: number) => { const b = Buffer.alloc(size); png.copy(b, 0, 0, 8); return b; };
  const receiptCalls = (fake: Fake) => fake.requests.filter((r) => r.path.endsWith('/receipt'));
  const creates = (fake: Fake) => fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/expenses/manual');
  const input = (page: Page) => page.locator('[data-test="expense-receipt-input"]');
  const picked = (page: Page) => page.locator('[data-test="expense-receipt-file"]');
  const refusal = (page: Page) => page.locator('[data-test="expense-receipt-error"]');
  const summary = (page: Page) => page.locator('[data-test="manual-summary-expense"]');

  async function openEntry(page: Page, fake: Fake) {
    await open(page, fake);
    await page.getByRole('tab', { name: 'Transactions' }).click();
    await openWaysIn(page);
    await page.locator('[data-test="expense-new"]').click();
    const dialog = page.getByRole('dialog', { name: 'Enter expense by hand' });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  async function fillRequired(page: Page) {
    await page.locator('[data-test="expense-date"]').fill('2026-07-21');
    await page.locator('[data-test="expense-amount"]').fill('12,50');
  }

  test('the control is there when the form opens: its label, the button and the Receipt dialog\'s hint', async ({ page }) => {
    const fake = newFake();
    const dialog = await openEntry(page, fake);
    await expect(dialog.getByText('Receipt (optional)', { exact: true })).toBeVisible();
    await expect(page.locator('[data-test="expense-receipt-attach"]')).toHaveText('Attach receipt');
    await expect(page.locator('[data-test="expense-receipt-hint"]')).toHaveText('PDF, PNG or JPEG, up to 5 MB.');
    await expect(input(page)).toHaveAttribute('accept', 'image/png,image/jpeg,application/pdf');
    expect(receiptCalls(fake)).toHaveLength(0);
  });

  test('a pick, a changed pick and Remove; nothing is sent at any of them', async ({ page }) => {
    const fake = newFake();
    await openEntry(page, fake);
    await input(page).setInputFiles(PNG);
    await expect(picked(page)).toHaveText(/^kassenbon\.png · .+ MB$/);
    await expect(page.locator('[data-test="expense-receipt-attach"]')).toHaveText('Choose a different file');
    await expect(page.locator('[data-test="expense-receipt-hint"]')).toHaveCount(0);

    await input(page).setInputFiles(PDF);
    await expect(picked(page)).toContainText('rechnung.pdf');

    await page.locator('[data-test="expense-receipt-remove"]').click();
    await expect(picked(page)).toHaveCount(0);
    await expect(page.locator('[data-test="expense-receipt-attach"]')).toHaveText('Attach receipt');
    expect(creates(fake)).toHaveLength(0);
    expect(receiptCalls(fake)).toHaveLength(0);
  });

  test('the three refusals at the pick, by the file\'s own bytes; exactly 5 MB is accepted and one byte more is not', async ({ page }) => {
    const fake = newFake();
    await openEntry(page, fake);
    const MAX = 5 * 1024 * 1024;

    await input(page).setInputFiles({ name: 'max.png', mimeType: 'image/png', buffer: withPngHead(MAX) });
    await expect(picked(page)).toHaveText('max.png · 5.0 MB');
    await expect(refusal(page)).toHaveCount(0);

    // A refused pick leaves the form as it was: the earlier pick stays.
    await input(page).setInputFiles({ name: 'over.png', mimeType: 'image/png', buffer: withPngHead(MAX + 1) });
    await expect(refusal(page)).toHaveText('The receipt is larger than 5 MB.');
    await expect(picked(page)).toContainText('max.png');

    await input(page).setInputFiles({ name: 'leer.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) });
    await expect(refusal(page)).toHaveText('Receipt is empty.');

    // By the bytes, not the name or the reported type: text called a PNG.
    await input(page).setInputFiles({ name: 'notiz.png', mimeType: 'image/png', buffer: Buffer.from('just text') });
    await expect(refusal(page)).toHaveText('Unsupported file type (allowed: PDF, JPEG, PNG).');
    await expect(refusal(page)).toHaveAttribute('role', 'alert');

    // And a real PNG with a wrong name and no reported type is accepted.
    await input(page).setInputFiles({ name: 'foto', mimeType: '', buffer: png });
    await expect(picked(page)).toContainText('foto');
    await expect(refusal(page)).toHaveCount(0);
    expect(creates(fake)).toHaveLength(0);
    expect(receiptCalls(fake)).toHaveLength(0);
  });

  test('Save with a file creates the expense, then uploads the receipt to it, and the tab says both were kept', async ({ page }) => {
    const fake = newFake();
    const dialog = await openEntry(page, fake);
    await input(page).setInputFiles(PNG);
    await fillRequired(page);
    await page.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();

    expect(creates(fake)).toHaveLength(1);
    const puts = receiptCalls(fake).filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    const newId = (fake.expenses[fake.expenses.length - 1] as { id: number }).id;
    expect(puts[0].path).toBe(`/invoicing/expenses/${newId}/receipt`);
    expect(fake.requests.indexOf(creates(fake)[0]), 'the create comes first').toBeLessThan(fake.requests.indexOf(puts[0]));
    expect(fake.receipts.has(newId)).toBe(true);
    await expect(summary(page)).toHaveText('By hand: 1 expense added to your book, with its receipt.');
  });

  test('Save without a file sends the one call, and the tab reads as today', async ({ page }) => {
    const fake = newFake();
    const dialog = await openEntry(page, fake);
    await fillRequired(page);
    await page.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();
    expect(creates(fake)).toHaveLength(1);
    expect(receiptCalls(fake)).toHaveLength(0);
    await expect(summary(page)).toHaveText('By hand: 1 expense added to your book.');
  });

  test('a refused create keeps the form, its error and the picked file, and uploads nothing', async ({ page }) => {
    const fake = newFake();
    fake.refuseNextCreate = { code: 'invalid_field', message: 'category is not one of your expense categories' };
    const dialog = await openEntry(page, fake);
    await input(page).setInputFiles(PNG);
    await fillRequired(page);
    await page.locator('[data-test="expense-save"]').click();
    await expect(page.locator('[data-test="expense-error"]')).toHaveText('category is not one of your expense categories');
    await expect(dialog).toBeVisible();
    await expect(picked(page)).toContainText('kassenbon.png');
    expect(receiptCalls(fake)).toHaveLength(0);
  });

  test('when the expense saves and the upload fails, the dialog closes and the tab says so, with where to add it', async ({ page }) => {
    const fake = newFake();
    fake.refuseNextUpload = { code: 'invalid_field', message: 'Unsupported file type (allowed: PDF, JPEG, PNG)' };
    const dialog = await openEntry(page, fake);
    await input(page).setInputFiles(PNG);
    await fillRequired(page);
    await page.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();
    await expect(summary(page)).toHaveText(
      "By hand: 1 expense added to your book. Its receipt was not attached: Unsupported file type (allowed: PDF, JPEG, PNG). Add it with Receipt on the expense's row."
    );
    // One expense, kept; no second create and no retry from the form.
    expect(creates(fake)).toHaveLength(1);
    expect(receiptCalls(fake).filter((r) => r.method === 'PUT')).toHaveLength(1);
    const newId = (fake.expenses[fake.expenses.length - 1] as { id: number }).id;
    expect(fake.receipts.has(newId)).toBe(false);
  });

  test('while Save runs with a file, Esc, the scrim, the ✕ and Cancel do not close the dialog', async ({ page }) => {
    const fake = newFake();
    let release: () => void = () => {};
    fake.holdCreate = new Promise<void>((resolve) => { release = resolve; });
    const dialog = await openEntry(page, fake);
    await input(page).setInputFiles(PNG);
    await fillRequired(page);
    await page.locator('[data-test="expense-save"]').click();
    await expect(page.locator('[data-test="expense-cancel"]')).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2); // the scrim
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).first().click({ force: true }); // the corner ✕
    await expect(dialog).toBeVisible();
    await page.locator('[data-test="expense-cancel"]').click({ force: true });
    await expect(dialog).toBeVisible();

    release();
    await expect(dialog).toBeHidden();
    await expect(summary(page)).toHaveText('By hand: 1 expense added to your book, with its receipt.');
  });

  test('editing an expense shows no receipt control', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const row = page.locator('[data-test="book-row"][data-type="out"]:visible').first();
    if (await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches)) await row.locator('[data-test="book-row-description"]').click();
    else await row.locator('[data-test="book-row-edit"]').click();
    await expect(page.getByRole('dialog', { name: 'Edit expense' })).toBeVisible();
    await expect(page.locator('[data-test="expense-receipt"]')).toHaveCount(0);
  });

  test('at 360px a 60-character file name wraps whole and nothing scrolls sideways', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-safari', 'a phone width');
    await page.setViewportSize({ width: 360, height: 780 });
    const fake = newFake();
    await openEntry(page, fake);
    const longName = `${'beleg-'.repeat(9)}2026.png`; // 62 characters
    await input(page).setInputFiles({ name: longName, mimeType: 'image/png', buffer: png });
    await expect(picked(page)).toContainText(longName);
    const fit = await picked(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, lines: el.getClientRects().length, overflow: getComputedStyle(el).textOverflow }));
    expect(fit.scroll, 'the name is not cut').toBeLessThanOrEqual(fit.client);
    expect(fit.overflow).not.toBe('ellipsis');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Where the control sits on the full-screen sheet when the form opens.
    const top = await page.locator('[data-test="expense-receipt-attach"]').evaluate((el) => Math.round(el.getBoundingClientRect().top));
    console.log(`#11510 at 360x780: the Attach receipt button's top is at ${top}px of 780`);
  });
});
