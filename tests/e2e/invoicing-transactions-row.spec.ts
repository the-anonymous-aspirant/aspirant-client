import { test, expect, type Page, type Route, type Locator } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Transactions at desktop (system_3 #12275, from the #11498 review's D2-1,
 *  D2-2 and D2-3): a row reads the Book's "{who} · {what}" with at most one
 *  muted line under it, the payer's name once, and no Category label cut.
 *  Every call is answered by an in-memory fake; a catch-all /api/ → 404 is
 *  registered FIRST so nothing reaches the live server. Invented records
 *  only. */

type Json = Record<string, any>;

// The server's starter expense categories (aspirant-server
// data_models/invoicing_expenses.go DefaultExpenseCategories), one custom
// name of 20 characters, and one of 100, the server's limit (review point 2).
const STARTER = [
  'materials and supplies',
  'studio rent and energy',
  'insurance and fees',
  'advertising',
  'travel',
  'office and postage',
  'phone and internet',
  'advice',
  'training',
  'other',
];
const CUSTOM_20 = 'Werkzeuge und Zubehör';
const CUSTOM_100 =
  'Rahmen, Passepartouts und Glas für die Ausstellung im Kunstverein am Hafen, mit Lieferung und Montage';

const CLIENTS = [
  { id: 1, name: 'Mara Esempio', address: 'Beispielweg 1' },
  { id: 2, name: 'Lena Maier', address: 'Musterstraße 2' },
];

const pay = (over: Json): Json => ({
  kind: 'incoming',
  currency: 'EUR',
  fee_cents: 0,
  net_cents: 0,
  sender_email: '',
  reference: '',
  method: '',
  source: 'manual',
  entry: 'manual',
  category: 'paid_work',
  client_id: null,
  on_invoice: false,
  on_issued_invoice: false,
  invoice: null,
  removed_at: null,
  created_at: '2026-11-10T10:00:00Z',
  ...over,
});

const spend = (over: Json): Json => ({
  currency: 'EUR',
  client_id: null,
  reference: '',
  payee: '',
  removed_at: null,
  source: 'n26',
  entry: 'import',
  created_at: '2026-11-10T10:00:00Z',
  amount_cents: 1234,
  ...over,
});

const PAYMENTS = [
  // A hand entry whose payer is its client: the walk's four-line row.
  pay({
    id: 1,
    transaction_id: 'M-same',
    paid_on: '2026-11-20T00:00:00Z',
    method: 'paypal',
    reference: 'PPHAND00000000001',
    sender_name: 'Mara Esempio',
    note: 'Anzahlung Porträt',
    client_id: 1,
    gross_cents: 30000,
  }),
  // The same by §3.142 Decision 4: case, a dot and a space apart.
  pay({
    id: 2,
    transaction_id: 'M-norm',
    paid_on: '2026-11-19T00:00:00Z',
    method: 'cash',
    sender_name: 'mara  esempio.',
    note: 'Skizze',
    client_id: 1,
    gross_cents: 5000,
  }),
  // Someone else paid for the client's work.
  pay({
    id: 3,
    transaction_id: 'M-other',
    paid_on: '2026-11-18T00:00:00Z',
    method: 'cash',
    sender_name: 'Jonas Beispiel',
    note: 'Geschenkgutschein',
    client_id: 2,
    gross_cents: 8000,
  }),
  // An import with a payer e-mail and no client.
  pay({
    id: 4,
    transaction_id: 'PP-none',
    source: 'paypal',
    entry: 'import',
    paid_on: '2026-11-17T00:00:00Z',
    sender_name: 'Kiosk Esempio',
    sender_email: 'kiosk@example.test',
    note: 'Postkarten',
    category: 'uncategorised',
    gross_cents: 2000,
  }),
  // An import whose payer is its client: nothing under the line.
  pay({
    id: 5,
    transaction_id: 'PP-same',
    source: 'paypal',
    entry: 'import',
    paid_on: '2026-11-16T00:00:00Z',
    sender_name: 'Lena Maier',
    sender_email: 'lena@example.test',
    note: 'Porträt',
    client_id: 2,
    gross_cents: 45000,
  }),
];

const EXPENSES = [...STARTER, CUSTOM_20, CUSTOM_100].map((category, i) =>
  spend({
    id: 100 + i,
    transaction_id: `N26-E${i}`,
    paid_on: `2026-11-${String(15 - Math.min(i, 13)).padStart(2, '0')}T00:00:00Z`,
    payee: `Laden ${i + 1}`,
    note: 'Kartenzahlung',
    category,
  })
);

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.route(/\/api\//, (route) =>
    json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } })
  );
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/invoicing/profile')
      return json(route, 200, {
        saved: true,
        profile: {
          full_name: 'Flower Example',
          address: 'A',
          steuernummer: '12/345/67890',
          is_kleinunternehmer: true,
          invoice_number_prefix: '2026',
          next_invoice_number: 1,
        },
      });
    if (path === '/invoicing/clients') return json(route, 200, { clients: CLIENTS });
    if (path === '/invoicing/payments' && method === 'GET')
      return json(route, 200, { payments: PAYMENTS });
    if (path === '/invoicing/invoices' && method === 'GET')
      return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET')
      return json(route, 200, { expenses: EXPENSES });
    if (path === '/invoicing/expense-categories' && method === 'GET')
      return json(route, 200, {
        categories: [...STARTER, CUSTOM_20, CUSTOM_100].map((name, i) => ({
          id: i + 1,
          name,
          counts_as: name,
          created_at: '2026-01-01T00:00:00Z',
        })),
      });
    if (path === '/invoicing/book/selection' && method === 'GET')
      return json(route, 200, {
        selection: {
          preset: 'work_only',
          changed: false,
          income: ['paid_work'],
          expense_all: true,
          expense: [],
        },
        presets: [{ id: 'work_only', name: 'Work only', builtin: true }],
      });
    return json(route, 404, {
      error: { code: 'not_found', message: `unmocked ${method} ${path}` },
    });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
  await expect(row(page, 'M-same')).toBeVisible();
}

const row = (page: Page, txn: string) =>
  page.locator(
    `[data-test="payment-row"][data-txn="${txn}"], [data-test="expense-row"][data-txn="${txn}"]`
  );

// The text lines an element's text takes: the distinct tops of its line
// boxes. Inline runs of one line share a top to within a few pixels.
const linesOf = (loc: Locator) =>
  loc.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [...range.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => r.top)
      .sort((a, b) => a - b);
    let lines = 0;
    let last = -Infinity;
    for (const t of tops) {
      if (t - last > 4) lines += 1;
      last = t;
    }
    return lines;
  });

test.describe('#12275 Transactions at desktop: a row in two lines, every category whole', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone card is not changed by this task (ruling 4)');

  test('a hand-entered payment whose payer is its client is two lines, with the name once', async ({
    page,
  }) => {
    await open(page);
    const r = row(page, 'M-same');
    const who = r.locator('td:has([data-test="row-who"])');
    await expect(r.locator('[data-test="row-who-what"]')).toHaveText(
      'Mara Esempio · Anzahlung Porträt'
    );
    await expect(r.locator('[data-test="row-detail"]')).toHaveText('PayPal · PPHAND00000000001');
    await expect(r.locator('[data-test="row-client"]')).toHaveCount(0);
    expect((await who.innerText()).split('Mara Esempio').length - 1, 'the name prints once').toBe(
      1
    );
    expect(await linesOf(r.locator('[data-test="row-who-what"]')), 'who and what on one line').toBe(
      1
    );
    expect(await linesOf(r.locator('[data-test="row-detail"]')), 'one muted line').toBe(1);
    // No cell of the row takes more than two text lines.
    for (const cell of await r.locator('td').all())
      expect(await linesOf(cell), 'a cell of the row').toBeLessThanOrEqual(2);
    // The muted line is in the muted ink.
    const [ink, muted] = await r.locator('[data-test="row-detail"]').evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--text-muted)';
      el.appendChild(probe);
      const out = [getComputedStyle(el).color, getComputedStyle(probe).color];
      probe.remove();
      return out;
    });
    expect(ink).toBe(muted);
  });

  test('"the same" is §3.142 Decision 4: case, dots and spaces do not make a second name', async ({
    page,
  }) => {
    await open(page);
    const r = row(page, 'M-norm');
    await expect(r.locator('[data-test="row-detail"]')).toHaveText('Bar (Cash)');
    await expect(r.locator('[data-test="row-client"]')).toHaveCount(0);
  });

  test('a client other than the payer, or none, is said on the muted line', async ({ page }) => {
    await open(page);
    await expect(row(page, 'M-other').locator('[data-test="row-detail"]')).toHaveText(
      'Bar (Cash) · Client: Lena Maier'
    );
    await expect(row(page, 'M-other').locator('[data-test="row-client"]')).toHaveText(
      'Client: Lena Maier'
    );
    await expect(row(page, 'PP-none').locator('[data-test="row-detail"]')).toHaveText('No client');
  });

  test("an import's payer e-mail leaves the row, and a payer who is the client adds no line", async ({
    page,
  }) => {
    await open(page);
    for (const txn of ['PP-none', 'PP-same']) {
      const text = await row(page, txn).locator('td:has([data-test="row-who"])').innerText();
      expect(text, `${txn}: no e-mail`).not.toContain('@example.test');
    }
    await expect(row(page, 'PP-same').locator('[data-test="row-who-what"]')).toHaveText(
      'Lena Maier · Porträt'
    );
    await expect(row(page, 'PP-same').locator('[data-test="row-detail"]')).toHaveCount(0);
  });

  test('an expense prints no client', async ({ page }) => {
    await open(page);
    const r = row(page, 'N26-E0');
    await expect(r.locator('[data-test="row-who-what"]')).toHaveText('Laden 1 · Kartenzahlung');
    await expect(r.locator('[data-test="row-client"], [data-test="row-detail"]')).toHaveCount(0);
  });

  for (const width of [1440, 1024]) {
    test(`no Category label is cut at ${width}: every starter category and a 20-character one on one line, 100 characters wrap`, async ({
      page,
    }) => {
      await open(page, width);
      const cut = async (txn: string) =>
        row(page, txn)
          .locator('.select__value')
          .evaluate((el) => {
            const trigger = el.closest('.select__trigger') as HTMLElement;
            return {
              text: el.textContent!.trim(),
              wide: el.scrollWidth > el.clientWidth + 1,
              tall: trigger.scrollHeight > trigger.clientHeight + 1,
              ellipsis:
                getComputedStyle(el).textOverflow === 'ellipsis' &&
                getComputedStyle(el).whiteSpace === 'nowrap',
            };
          });
      for (const [i, name] of [...STARTER, CUSTOM_20].entries()) {
        const txn = `N26-E${i}`;
        const c = await cut(txn);
        expect(c.text, txn).toBe(name);
        expect(c.wide || c.tall, `"${name}" is cut`).toBe(false);
        expect(
          await linesOf(row(page, txn).locator('.select__value')),
          `"${name}" on one line`
        ).toBe(1);
      }
      const long = `N26-E${STARTER.length + 1}`;
      const c = await cut(long);
      expect(c.text).toBe(CUSTOM_100);
      expect(c.wide || c.tall, 'the 100-character name is cut').toBe(false);
      expect(
        await linesOf(row(page, long).locator('.select__value')),
        'the 100-character name wraps'
      ).toBeGreaterThan(1);
      // A payment's longest income category, too.
      const u = await row(page, 'PP-none')
        .locator('.select__value')
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(u, '"Uncategorised" is cut').toBe(false);
    });
  }

  test('the Invoice button stays whole, the last column stays 12rem, and nothing scrolls sideways', async ({
    page,
  }) => {
    await open(page);
    const generate = row(page, 'M-same').locator('[data-test="row-generate"]');
    await expect(generate).toBeVisible();
    expect(await linesOf(generate), '"Generate invoice" on one line').toBe(1);
    expect(
      await generate.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      '"Generate invoice" is cut'
    ).toBe(true);
    const generateBox = (await generate.boundingBox())!;
    const cellBox = (await row(page, 'M-same')
      .locator('td:has([data-test="row-generate"])')
      .boundingBox())!;
    expect(generateBox.x + generateBox.width, 'the button inside its cell').toBeLessThanOrEqual(
      cellBox.x + cellBox.width + 1
    );
    const last = (await row(page, 'M-same').locator('td').last().boundingBox())!;
    expect(Math.round(last.width)).toBe(192);
    const scroll = page.locator('[data-test="payments-panel"] .data-table__scroll').first();
    const [sw, cw] = await scroll.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(sw, 'no sideways scroll').toBeLessThanOrEqual(cw + 1);
  });
});
