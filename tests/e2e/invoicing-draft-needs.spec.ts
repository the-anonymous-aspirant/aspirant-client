import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** A draft says what issuing needs, shows its total and what it covers, and
 *  stops on a difference before it is issued (system_3 #12274). Every call is
 *  answered by an in-memory fake; a catch-all /api/ → 404 is registered
 *  first, so nothing reaches a server. */

type Json = Record<string, any>;

const payment = (id: number, over: Json = {}) => ({
  id, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: `M-${id}`, method: 'bank_transfer',
  reference: '', paid_on: '2026-10-03T00:00:00Z', currency: 'EUR', gross_cents: 30000, sender_name: 'Dragan Petrovic',
  sender_email: '', note: 'Wandbild', category: 'paid_work', client_id: 1, on_invoice: true, on_issued_invoice: false,
  invoice: null, ...over,
});

interface Fake {
  payments: Json[];
  invoices: Json[];
  next: number;
  requests: Array<{ method: string; path: string; body: string }>;
  issueRefusal?: Json;
  saveRefusal?: Json;
  clients?: Json[];
  // system_3 #12318: the removed payments Transactions lists, and per draft
  // the ones a restore would put back on it.
  removed?: Json[];
  restorable?: Record<number, number[]>;
}

const draft = (id: number, paymentIds: number[], over: Json = {}) => ({
  id, status: 'draft', client_id: 1, client_name: 'Dragan Petrovic', invoice_number: null, number: null, issue_date: null,
  service_date_from: '2026-10-03T00:00:00Z', service_date_to: '2026-10-03T00:00:00Z', vat_rate_bp: 1900, total_cents: 30000,
  currency: 'EUR', payment_ids: paymentIds, ...over,
});

// The payments stay uninvoiced in the list, so the month offers its
// generation; the fake's generation hands back the drafts set up here.
function newFake(payments: Json[], invoices: Json[]): Fake {
  return { payments: payments.map((p) => ({ ...p, on_invoice: false })), invoices, next: 2, requests: [] };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function detailOf(fake: Fake, inv: Json): Json {
  const payments = fake.payments.filter((p) => inv.payment_ids.includes(p.id));
  return {
    invoice: inv,
    line_items: inv.line_items || payments.map((p, i) => ({ id: inv.id * 100 + i, position: i + 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents })),
    payments,
    warnings: [],
    client_name: inv.client_name,
    restorable_payment_ids: (fake.restorable && fake.restorable[inv.id]) || [],
  };
}

async function mock(page: Page, fake: Fake, opts: { kleinunternehmer?: boolean } = {}): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    if (method !== 'GET') fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: opts.kleinunternehmer !== false, invoice_number_prefix: '2026', next_invoice_number: fake.next } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients || [{ id: 1, name: 'Dragan Petrovic', address: 'Nordweg 2\n13353 Berlin', email: '', paypal_email: '' }, { id: 2, name: 'Galerie Nord', address: 'Südweg 1', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: url.searchParams.get('removed') ? fake.removed || [] : fake.payments });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/book/selection') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [] });
    if (path === '/invoicing/invoices' && method === 'GET') {
      const status = url.searchParams.get('status');
      return json(route, 200, { invoices: fake.invoices.filter((i) => !status || i.status === status) });
    }
    if (path === '/invoicing/invoices/generate' && method === 'POST') {
      return json(route, 201, { invoices: fake.invoices.filter((i) => i.status === 'draft').map((i) => detailOf(fake, i)), skipped: [] });
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)(\/issue)?$/);
    if (m) {
      const inv = fake.invoices.find((i) => i.id === Number(m[1]));
      if (!inv) return json(route, 404, { error: { code: 'not_found', message: 'Invoice not found' } });
      if (m[2] && method === 'POST') {
        if (fake.issueRefusal) return json(route, 422, fake.issueRefusal);
        const number = fake.next++;
        Object.assign(inv, { status: 'issued', number, invoice_number: `2026-${String(number).padStart(3, '0')}`, issue_date: '2026-11-16T00:00:00Z' });
        return json(route, 200, detailOf(fake, inv));
      }
      if (method === 'PUT') {
        if (fake.saveRefusal) return json(route, 400, fake.saveRefusal);
        const body = JSON.parse(req.postData() || '{}');
        if (body.payment_ids) inv.payment_ids = body.payment_ids;
        if (body.line_items) {
          inv.line_items = body.line_items.map((l: Json, i: number) => ({ id: inv.id * 100 + i, position: i + 1, ...l, line_total_cents: Math.round((l.quantity_milli * l.unit_price_cents) / 1000) }));
          inv.total_cents = inv.line_items.reduce((n: number, l: Json) => n + l.line_total_cents, 0);
        }
        return json(route, 200, detailOf(fake, inv));
      }
      return json(route, 200, detailOf(fake, inv));
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake, opts: { kleinunternehmer?: boolean } = {}): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
  await mock(page, fake, opts);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.locator('[data-test="invoices-panel"]')).toBeVisible();
}

const dialog = (page: Page) => page.getByRole('dialog');
const accept = (page: Page) => page.locator('[data-test="review-accept"]');
const issueCalls = (fake: Fake) => fake.requests.filter((r) => r.path.endsWith('/issue'));
const price = (page: Page, n = 1) => page.getByRole('textbox', { name: `Unit price, line ${n}` });
const description = (page: Page, n = 1) => page.getByRole('combobox', { name: `Description, line ${n}` });

// The month's review (#11505): "Generate invoices" walks the drafts the fake
// hands back. Its POST is the one write before the dialog opens.
async function review(page: Page, fake: Fake) {
  await page.locator('[data-test="generate-invoices"]').click();
  await expect(dialog(page)).toContainText('Invoice 1 / 1');
  fake.requests.length = 0;
}

async function openFromList(page: Page) {
  await page.locator('[data-test="invoice-row"]').first().click();
  await expect(dialog(page)).toContainText('Draft invoice');
}

test.describe('#12274 a draft says what issuing needs', () => {
  test('an empty description is marked on open, and Accept sends nothing and goes to it', async ({ page }) => {
    const fake = newFake([payment(1, { note: '' })], [draft(10, [1])]);
    await open(page, fake);
    await review(page, fake);

    await expect(page.locator('[data-test="draft-needed-description"]')).toHaveText('Needed to issue: say what the work was.');
    await expect(page.locator('[data-test="draft-needed-quantity"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-needed-price"]')).toHaveCount(0);
    await expect(accept(page)).toBeEnabled();
    await accept(page).click();
    await expect(description(page)).toBeFocused();
    expect(fake.requests).toEqual([]);

    await description(page).fill('Wandbild, Oktober');
    await expect(page.locator('[data-test="draft-needed-description"]')).toHaveCount(0);
    await accept(page).click();
    await expect.poll(() => issueCalls(fake).length).toBe(1);
  });

  test('a zero price, an empty quantity, no client and no service date are each marked', async ({ page }) => {
    const fake = newFake(
      [payment(1, { client_id: 1 }), payment(2, { client_id: 2, sender_name: 'Galerie Nord', gross_cents: 6000 })],
      [draft(10, [1, 2], { client_id: null, client_name: '', line_items: [{ id: 1, position: 1, description: 'Wandbild', quantity_milli: 0, unit_price_cents: 0, line_total_cents: 0 }] })],
    );
    await open(page, fake);
    // The list shows a draft under the month its work was done, so the dates
    // are cleared in the dialog, not in the fixture.
    await openFromList(page);
    await page.locator('[data-test="draft-to"]').fill('');
    await page.locator('[data-test="draft-from"]').fill('');

    await expect(page.locator('[data-test="draft-needed-client"]')).toHaveText('Needed to issue: choose the client. The 2 payments name different clients.');
    await expect(page.locator('[data-test="draft-needed-date"]')).toHaveText('Needed to issue: the day the work was done.');
    await expect(page.locator('[data-test="draft-needed-quantity"]')).toHaveText('Needed to issue: a quantity above zero.');
    await expect(page.locator('[data-test="draft-needed-price"]')).toHaveText('Needed to issue: a price above zero.');

    // "Issue invoice…" arms nothing and goes to the first: the client.
    await page.locator('[data-test="draft-issue"]').click();
    await expect(page.locator('[data-test="issue-confirm"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-client"]')).toBeFocused();
    expect(fake.requests).toEqual([]);
  });

  test('the service period: until before from, and a day after today', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    await open(page, fake);
    await openFromList(page);
    await page.locator('[data-test="draft-to"]').fill('2026-10-01');
    await expect(page.locator('[data-test="draft-needed-date"]')).toHaveText('“Service until” is before “Service date (from)”.');
    await page.locator('[data-test="draft-to"]').fill('2026-11-20');
    await expect(page.locator('[data-test="draft-needed-date"]')).toHaveText('After today: it can be issued from that day.');
    await page.locator('[data-test="draft-to"]').fill('2026-11-16');
    await expect(page.locator('[data-test="draft-needed-date"]')).toHaveCount(0);
  });

  test('no lines: marked, and the press goes to Add line', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1], { line_items: [] })]);
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-needed-lines"]')).toHaveText('Needed to issue: at least one line.');
    await accept(page).click();
    await expect(page.locator('[data-test="draft-add-line"]')).toBeFocused();
    expect(fake.requests).toEqual([]);
  });
});

test.describe('#12274 the total, what the draft covers, and a difference', () => {
  test('the total and one covered payment, by amount, payer and day', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-total"]')).toHaveText('Total€300.00');
    await expect(page.locator('[data-test="draft-covers-head"]')).toHaveText('Covers 1 payment: €300.00 from Dragan Petrovic, 2026-10-03');
    await expect(page.locator('[data-test="draft-difference"]')).toHaveCount(0);
    await expect(accept(page)).toHaveText('Accept');
  });

  test('with VAT: the net, the VAT inside the total, and the total', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    await open(page, fake, { kleinunternehmer: false });
    await review(page, fake);
    // 300,00 × 1900 / 11900 = 47,899… → 47,90.
    await expect(page.locator('[data-test="draft-total-net"]')).toHaveText('€252.10');
    await expect(page.locator('[data-test="draft-total-vat"]')).toHaveText('€47.90');
    await expect(page.locator('[data-test="draft-total-gross"]')).toHaveText('€300.00');
  });

  test('several payments: one line each and a sum; a payer-less one and a PayPal id', async ({ page }) => {
    const fake = newFake(
      [payment(1), payment(2, { sender_name: '', gross_cents: 7000, paid_on: '2026-08-20T00:00:00Z' }), payment(3, { source: 'paypal', transaction_id: '9AB12345CD6789012', gross_cents: 2000 })],
      [draft(10, [1, 2, 3], { total_cents: 39000 })],
    );
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-covers-head"]')).toHaveText('Covers 3 payments, €390.00 in all:');
    await expect(page.locator('[data-test="draft-covers-item"]')).toHaveText([
      '€300.00 from Dragan Petrovic, 2026-10-03',
      '€70.00, 2026-08-20',
      '€20.00 from Dragan Petrovic (PayPal 9AB12345CD6789012), 2026-10-03',
    ]);
  });

  test('two currencies: no sum and no difference', async ({ page }) => {
    const fake = newFake([payment(1), payment(2, { currency: 'USD', gross_cents: 5000 })], [draft(10, [1, 2], { line_items: [{ id: 1, position: 1, description: 'Wandbild', quantity_milli: 1000, unit_price_cents: 100, line_total_cents: 100 }] })]);
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-covers-head"]')).toHaveText('Covers 2 payments:');
    await expect(page.locator('[data-test="draft-covers-currencies"]')).toHaveText('The payments are in different currencies.');
    await expect(page.locator('[data-test="draft-difference"]')).toHaveCount(0);
  });

  test('a price edit shows the difference before any save; a price that is not a number shows none', async ({ page }) => {
    const fake = newFake([payment(1, { gross_cents: 35000 })], [draft(10, [1], { total_cents: 35000 })]);
    await open(page, fake);
    await review(page, fake);
    await price(page).fill('35');
    await expect(page.locator('[data-test="draft-difference"]')).toHaveText('The total (€35.00) differs from the payments it covers (€350.00).');
    expect(fake.requests).toEqual([]);
    // The footer changes only when ze leaves the field.
    await expect(accept(page)).toHaveText('Accept');
    await price(page).fill('3x');
    await expect(page.locator('[data-test="draft-difference"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-total"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-needed-price"]')).toBeVisible();
  });

  test('Accept with a difference takes a second press, and a double tap is not one', async ({ page }) => {
    const fake = newFake([payment(1, { gross_cents: 35000 })], [draft(10, [1], { total_cents: 35000 })]);
    await open(page, fake);
    await review(page, fake);
    await price(page).fill('35');
    await price(page).blur();
    await expect(accept(page)).toHaveText('Accept with this difference');
    await expect(page.locator('[data-test="review-accept-difference"]')).toHaveText('The total (€35.00) differs from the payments it covers (€350.00).');

    // A double tap: two presses in one task, so their time stamps are
    // milliseconds apart however loaded the host is. Armed, nothing sent.
    await accept(page).evaluate((el) => {
      (el as HTMLElement).click();
      (el as HTMLElement).click();
    });
    await expect(accept(page)).toHaveText('Issue now');
    await expect(page.locator('[data-test="issue-confirm"]')).toHaveText('Press Issue now to issue it with this difference.');
    expect(fake.requests).toEqual([]);

    await page.waitForTimeout(700);
    await accept(page).click();
    await expect.poll(() => issueCalls(fake).length).toBe(1);
    const put = fake.requests.find((r) => r.method === 'PUT')!;
    expect(JSON.parse(put.body).line_items[0].unit_price_cents).toBe(3500);
  });

  test('a change after arming disarms it', async ({ page }) => {
    const fake = newFake([payment(1, { gross_cents: 35000 })], [draft(10, [1], { total_cents: 35000 })]);
    await open(page, fake);
    await review(page, fake);
    await price(page).fill('35');
    await price(page).blur();
    await accept(page).click();
    await expect(accept(page)).toHaveText('Issue now');
    await price(page).fill('36');
    await expect(accept(page)).not.toHaveText('Issue now');
    expect(fake.requests).toEqual([]);
  });

  test('outside a review the confirmation names the difference', async ({ page }) => {
    const fake = newFake([payment(1, { gross_cents: 35000 })], [draft(10, [1], { total_cents: 35000 })]);
    await open(page, fake);
    await openFromList(page);
    await price(page).fill('35');
    await page.locator('[data-test="draft-issue"]').click();
    await expect(page.locator('[data-test="issue-confirm"]')).toContainText('The total (€35.00) differs from the payments it covers (€350.00).');
  });

  // system_3 #12318 ruling 4: said in place of the covers line, and no
  // "Issue invoice…", since nothing in the dialog could enable it (§3.22).
  test('a draft that covers no payment says it cannot be issued, and has no "Issue invoice…"', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [])]);
    await open(page, fake);
    await openFromList(page);
    const line = page.locator('[data-test="draft-no-payment"]');
    await expect(line).toHaveText('This draft covers no payment, so it cannot be issued. Delete the draft.');
    await expect(line).toHaveAttribute('role', 'status');
    await expect(page.locator('[data-test="draft-covers-head"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-difference"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-issue"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-save"]')).toBeVisible();
    await expect(page.locator('[data-test="draft-delete"]')).toBeVisible();
  });
});

test.describe('#12274 each refusal in the app\'s words', () => {
  const cases: Array<[string, Json, string]> = [
    ['client_incomplete', { missing: 'client' }, 'Choose the client.'],
    ['client_incomplete', { missing: 'name' }, 'The client has no name. Add it under Clients.'],
    ['client_address_required', { total_cents: 30000, limit_cents: 25000, currency: 'EUR' }, "This invoice totals €300.00. Above €250.00 an invoice needs the client's postal address. Add it under Clients."],
    ['profile_incomplete', { missing: ['steuernummer'] }, 'Your Issuer profile is not complete: the Steuernummer is missing.'],
    ['profile_incomplete', { missing: ['name', 'address'] }, 'Your Issuer profile is not complete: the name and the address are missing.'],
    ['line_items_incomplete', { missing: 'lines' }, 'Add at least one line.'],
    ['line_items_incomplete', { position: 1 }, 'Line 1 needs a description, a quantity above zero and a price above zero.'],
    ['total_zero', { total_cents: 0, currency: 'EUR' }, 'The invoice totals €0.00, so it cannot be issued.'],
    ['service_date_invalid', { reason: 'missing' }, 'Enter the day the work was done.'],
    ['service_date_invalid', { reason: 'ends_before_start' }, '“Service until” is before “Service date (from)”.'],
    ['service_date_invalid', { reason: 'after_today', date: '2026-11-20' }, 'The work is dated after today. The invoice can be issued from that day.'],
    ['payment_removed', { payment_id: 1 }, 'A payment this draft covers was removed. Restore it, or delete the draft.'],
    ['payment_not_paid_work', { reason: 'no_payments' }, 'This draft covers no payment, so it cannot be issued.'],
    ['payment_paypal_transfer', { payment_id: 1 }, 'A payment this draft covers is a transfer from PayPal to your bank, not income.'],
    ['payment_already_invoiced', { payment_id: 1, invoice_id: 3, invoice_number: '2026-012' }, 'A payment this draft covers is already on invoice 2026-012.'],
    ['payment_not_found', { payment_id: 1 }, 'A payment this draft covers no longer exists. Delete the draft.'],
    ['issue_date_before_previous', { latest: '2026-12-01' }, 'The last invoice is dated after today, so this one cannot be issued yet.'],
    ['unprintable_characters', { characters: '田' }, 'The invoice cannot print “田”. Change it in the profile, the client or the lines.'],
    ['not_a_draft', { status: 'issued' }, 'This invoice is already issued.'],
    ['something_new', {}, 'The invoice could not be issued. Your changes to the draft are saved.'],
  ];

  test('every code the issue press can answer, and an unknown one', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    await open(page, fake);
    await review(page, fake);
    for (const [code, details, sentence] of cases) {
      fake.issueRefusal = { error: { code, message: `server words for ${code}`, details } };
      await accept(page).click();
      await expect(page.locator('[data-test="invoice-error"]')).toHaveText(sentence);
      await expect(page.locator('[data-test="invoice-error"]')).not.toContainText('server words');
    }
  });

  test('a quantity over 10,000 names its line', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    fake.saveRefusal = { error: { code: 'quantity_too_large', message: 'item 1 exceeds 10000 units', details: { position: 1 } } };
    await open(page, fake);
    await review(page, fake);
    await accept(page).click();
    await expect(page.locator('[data-test="invoice-error"]')).toHaveText('Line 1: the quantity is too large.');
    expect(issueCalls(fake)).toEqual([]);
  });
});

test.describe('#12274 the address note follows the buttons', () => {
  test('in a review it says to press Later', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1], { client_id: 2 })]);
    fake.clients = [{ id: 2, name: 'Galerie Nord', address: '', email: '', paypal_email: '' }];
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-no-address-text"]')).toHaveText(
      "This invoice totals €300.00 gross. Above €250.00 it must name Galerie Nord's postal address. Press Later to keep this draft, then add the address under Clients.",
    );
  });
});

test.describe('#12274 at 390, nothing scrolls sideways', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('two covered payments with long ids wrap inside the sheet', async ({ page }) => {
    const fake = newFake(
      [payment(1, { source: 'paypal', transaction_id: 'M-f3eeec8bca9260af0000' }), payment(2, { source: 'paypal', transaction_id: 'M-69aff11a7cfdf7570000', gross_cents: 6000 })],
      [draft(10, [1, 2], { total_cents: 36000 })],
    );
    await open(page, fake);
    await review(page, fake);
    await expect(page.locator('[data-test="draft-covers-item"]')).toHaveCount(2);
    const over = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] *')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').map((el) => `${el.tagName}.${el.className}`),
    );
    expect(over).toEqual([]);
  });
});

test.describe('#12318 a draft whose payment was removed, and taking one off', () => {
  // Review point 4: "Restore" is named only when a removed payment's latest
  // removal names this draft, with the button as Transactions shows it.
  test('the empty draft names the way back when a restore would put its payment back', async ({ page }) => {
    const removed = [payment(7, { removed_at: '2026-11-15T09:00:00Z' }), payment(8, { removed_at: '2026-11-15T09:05:00Z', category: 'gift' })];
    const fake = newFake([payment(1)], [draft(10, [])]);
    fake.removed = removed;
    fake.restorable = { 10: [7] };
    await open(page, fake);
    await openFromList(page);
    await expect(page.locator('[data-test="draft-no-payment"]')).toHaveText(
      'This draft covers no payment, so it cannot be issued. Restore its payment under Transactions, “Show 2 removed rows”, or delete the draft.',
    );
    await expect(page.locator('[data-test="draft-issue"]')).toHaveCount(0);
    // The button reads as the line names it.
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await page.getByRole('tab', { name: 'Transactions' }).click();
    await expect(page.locator('[data-test="removed-show"]')).toHaveText('Show 2 removed rows');
  });

  test('"Take off" is staged into Save draft, keeps the lines, and shows the difference', async ({ page }) => {
    const fake = newFake([payment(1), payment(2, { sender_name: 'Galerie Nord', paid_on: '2026-10-05T00:00:00Z' })], [draft(10, [1, 2], { total_cents: 60000 })]);
    await open(page, fake);
    await openFromList(page);
    const items = page.locator('[data-test="draft-covers-item"]');
    await expect(items).toHaveCount(2);
    await expect(page.locator('[data-test="draft-take-off"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Take off €300\.00 from Dragan Petrovic/ })).toBeVisible();
    fake.requests.length = 0;

    await page.getByRole('button', { name: /^Take off €300\.00 from Dragan Petrovic/ }).click();
    // One left: no list, so no Take off; the head names the one.
    await expect(items).toHaveCount(0);
    await expect(page.locator('[data-test="draft-take-off"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-covers-head"]')).toContainText('Covers 1 payment: €300.00 from Galerie Nord');
    await expect(page.locator('[data-test="draft-difference"]')).toHaveText('The total (€600.00) differs from the payments it covers (€300.00).');
    expect(fake.requests).toHaveLength(0);

    // Unsent until saved: closing asks.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test="unsent-ask"]')).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();

    await page.locator('[data-test="draft-save"]').click();
    await expect.poll(() => fake.requests.filter((r) => r.method === 'PUT').length).toBe(1);
    const body = JSON.parse(fake.requests.find((r) => r.method === 'PUT')!.body);
    expect(body.payment_ids).toEqual([2]);
    expect(body.line_items).toHaveLength(2);
    expect(fake.invoices[0].payment_ids).toEqual([2]);
  });

  test('a draft over one payment offers no Take off', async ({ page }) => {
    const fake = newFake([payment(1)], [draft(10, [1])]);
    await open(page, fake);
    await openFromList(page);
    await expect(page.locator('[data-test="draft-covers-head"]')).toContainText('Covers 1 payment');
    await expect(page.locator('[data-test="draft-take-off"]')).toHaveCount(0);
  });

  test('at 390px each Take off is 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fake = newFake([payment(1), payment(2, { sender_name: 'Galerie Nord' })], [draft(10, [1, 2], { total_cents: 60000 })]);
    await open(page, fake);
    await openFromList(page);
    for (const box of await page.locator('[data-test="draft-take-off"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
  });
});
