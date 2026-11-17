import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { candidateMonths, invoiceCandidates, uninvoicedCandidates } from '../../src/components/invoicing/listGroups.js';

/** The month view on Invoices and the one-at-a-time review (system_3 #11505,
 *  epic #11497 items 1 and 2d; design_conventions §3.159 Decisions 4 and 5).
 *  A month picker leads the toolbar, "Generate invoices for {month}" drafts
 *  one invoice per paid-work payment that has none (aspirant-server #11504),
 *  and the editor walks the drafts as "Invoice x / y" with Reject, Later and
 *  Accept. Every call is answered by a stateful in-memory fake; a catch-all
 *  /api/ → 404 is registered first, so nothing reaches a server. */

type Json = Record<string, any>;

const payment = (id: number, paidOn: string, over: Json = {}) => ({
  id, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: `M-${id}`, method: 'bank_transfer',
  reference: '', paid_on: `${paidOn}T00:00:00Z`, currency: 'EUR', gross_cents: 10000 * id, sender_name: 'Galerie Nord',
  sender_email: '', note: `Work ${id}`, category: 'paid_work', client_id: 1, on_invoice: false, on_issued_invoice: false,
  invoice: null, ...over,
});

test.describe('#11505 listGroups: what a month\'s generation looks at', () => {
  const rows = [
    payment(1, '2026-10-03'),
    payment(2, '2026-10-12', { invoice: { id: 7, status: 'draft', invoice_number: null } }),
    payment(3, '2026-10-28', { category: 'gift' }),
    payment(4, '2026-10-30', { kind: 'withdrawal' }),
    payment(5, '2026-10-31', { source: 'n26', sender_name: 'PayPal Europe S.a.r.l.' }),
    payment(6, '2026-09-05', { invoice: { id: 1, status: 'issued', invoice_number: '2026-001' } }),
  ];

  test('money in, paid work, paid that month, never a PayPal transfer into N26', () => {
    expect(invoiceCandidates(rows, '2026-10').map((p: Json) => p.id)).toEqual([1, 2]);
    expect(uninvoicedCandidates(rows, '2026-10').map((p: Json) => p.id)).toEqual([1]);
    expect(invoiceCandidates(rows, '2026-09').map((p: Json) => p.id)).toEqual([6]);
    expect(uninvoicedCandidates(rows, '2026-09')).toEqual([]);
    expect(invoiceCandidates(rows, '2026-08')).toEqual([]);
    expect(invoiceCandidates(undefined, '2026-10')).toEqual([]);
  });

  test('the months that have a candidate, newest first', () => {
    expect(candidateMonths(rows)).toEqual(['2026-10', '2026-09']);
    expect(candidateMonths([])).toEqual([]);
  });
});

interface Fake {
  payments: Json[];
  invoices: Json[];
  next: number;
  nextId: number;
  // Invoice ids whose issue the server refuses, with its sentence.
  refuseIssue: Record<number, string>;
  requests: Array<{ method: string; path: string; body: string }>;
}

const issuedSeptember = () => ({
  id: 1, status: 'issued', client_id: 1, client_name: 'Galerie Nord', invoice_number: '2026-001', number: 1,
  issue_date: '2026-09-20T00:00:00Z', service_date_from: '2026-09-05T00:00:00Z', service_date_to: '2026-09-05T00:00:00Z',
  vat_rate_bp: 1900, total_cents: 40000, currency: 'EUR', payment_ids: [4],
});

function newFake(): Fake {
  return {
    payments: [
      payment(1, '2026-10-03'),
      payment(2, '2026-10-12'),
      payment(3, '2026-10-28'),
      payment(4, '2026-09-05', { on_invoice: true, on_issued_invoice: true, invoice: { id: 1, status: 'issued', invoice_number: '2026-001' } }),
      payment(5, '2026-10-20', { category: 'gift' }),
      payment(6, '2026-10-21', { category: 'other', client_id: null, sender_name: 'Unbekannt' }),
    ],
    invoices: [issuedSeptember()],
    next: 2,
    nextId: 10,
    refuseIssue: {},
    requests: [],
  };
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
  };
}

/** The server's side of #11504, for a month or for named payments: one draft
 *  per candidate that no live invoice covers, in paid-on order; the others
 *  come back as skipped. */
function generate(fake: Fake, body: { month?: string; payment_ids?: number[] }): Json {
  const out: Json = { invoices: [], skipped: [] };
  const wanted = body.payment_ids ? new Set(body.payment_ids) : null;
  for (const p of [...fake.payments].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : a.id - b.id))) {
    if (wanted ? !wanted.has(p.id) : p.kind !== 'incoming' || p.category !== 'paid_work' || !p.paid_on.startsWith(body.month!)) continue;
    if (p.invoice) {
      out.skipped.push({ payment_id: p.id, reason: 'already_on_invoice', invoice: p.invoice });
      continue;
    }
    const inv = {
      id: fake.nextId++, status: 'draft', client_id: p.client_id, client_name: 'Galerie Nord', invoice_number: null, number: null,
      issue_date: null, service_date_from: p.paid_on, service_date_to: p.paid_on, vat_rate_bp: 1900, total_cents: p.gross_cents,
      currency: 'EUR', payment_ids: [p.id],
    };
    fake.invoices.push(inv);
    p.invoice = { id: inv.id, status: 'draft', invoice_number: null };
    p.on_invoice = true;
    out.invoices.push(detailOf(fake, inv));
  }
  return out;
}

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    if (method !== 'GET') fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: fake.next } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/book/selection') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [] });
    if (path === '/invoicing/invoices' && method === 'GET') {
      const status = url.searchParams.get('status');
      return json(route, 200, { invoices: fake.invoices.filter((i) => !status || i.status === status) });
    }
    if (path === '/invoicing/invoices/generate' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const out = generate(fake, body);
      return json(route, out.invoices.length ? 201 : 200, out);
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)(\/issue)?$/);
    if (m) {
      const inv = fake.invoices.find((i) => i.id === Number(m[1]));
      if (!inv) return json(route, 404, { error: { code: 'not_found', message: 'Invoice not found' } });
      if (m[2] && method === 'POST') {
        if (fake.refuseIssue[inv.id]) return json(route, 422, { error: { code: 'client_address_missing', message: fake.refuseIssue[inv.id] } });
        const number = fake.next++;
        Object.assign(inv, { status: 'issued', number, invoice_number: `2026-${String(number).padStart(3, '0')}`, issue_date: '2026-11-16T00:00:00Z' });
        for (const p of fake.payments) if (inv.payment_ids.includes(p.id)) p.invoice = { id: inv.id, status: 'issued', invoice_number: inv.invoice_number };
        return json(route, 200, detailOf(fake, inv));
      }
      if (method === 'PUT') {
        const body = JSON.parse(req.postData() || '{}');
        if (body.line_items) {
          inv.line_items = body.line_items.map((l: Json, i: number) => ({ id: inv.id * 100 + i, position: i + 1, ...l, line_total_cents: Math.round((l.quantity_milli * l.unit_price_cents) / 1000) }));
          inv.total_cents = inv.line_items.reduce((n: number, l: Json) => n + l.line_total_cents, 0);
        }
        return json(route, 200, detailOf(fake, inv));
      }
      if (method === 'DELETE') {
        fake.invoices = fake.invoices.filter((i) => i.id !== inv.id);
        for (const p of fake.payments) if (inv.payment_ids.includes(p.id)) Object.assign(p, { invoice: null, on_invoice: false });
        return route.fulfill({ status: 204, body: '' });
      }
      return json(route, 200, detailOf(fake, inv));
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.locator('[data-test="invoices-panel"]')).toBeVisible();
}

const monthPicker = (page: Page) => page.getByRole('combobox', { name: 'Work done in' });
const generateButton = (page: Page) => page.locator('[data-test="generate-invoices"]');
const scope = (page: Page) => page.locator('[data-test="generate-scope"]');
const editor = (page: Page) => page.locator('[data-test="invoice-editor"]');
const dialog = (page: Page) => page.getByRole('dialog');
const summary = (page: Page) => page.locator('[data-test="review-summary"]');
// The description is a combobox: it suggests zir saved line categories.
const description = (page: Page) => page.getByRole('combobox', { name: 'Description, line 1' });
const writes = (fake: Fake) => fake.requests.map((r) => `${r.method} ${r.path.replace('/invoicing', '')}`);

async function chooseMonth(page: Page, label: string) {
  await monthPicker(page).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(monthPicker(page)).toContainText(label);
}

test.describe('#11505 the month view on Invoices', () => {
  test('opens on the newest month with paid work still to invoice, and says how many', async ({ page }) => {
    await open(page, newFake());
    await expect(monthPicker(page)).toContainText('October 2026');
    await expect(generateButton(page)).toHaveText('Generate invoices for October 2026');
    await expect(generateButton(page)).toBeEnabled();
    // Three paid-work payments in October; the gift is not one of them.
    await expect(scope(page)).toHaveText('3 payments to draft');
    // Nothing invoiced for October yet, and the empty state names the month.
    await expect(page.locator('[data-test="invoices-month-empty"]')).toContainText('No invoices for October 2026 yet');
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(0);

    await monthPicker(page).click();
    await expect(page.getByRole('option')).toHaveText(['All months', 'October 2026', 'September 2026']);
  });

  test('a month shows the invoices whose work was done in it; All months is the whole list, with no Generate', async ({ page }) => {
    await open(page, newFake());
    // September's payment is on an issued invoice: nothing to generate, said why.
    await chooseMonth(page, 'September 2026');
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="invoice-row"]')).toContainText('2026-001');
    await expect(generateButton(page)).toBeDisabled();
    await expect(scope(page)).toHaveText('Every paid-work payment in September 2026 has an invoice.');

    // All months: the button keeps its place, disabled, and says what it needs.
    await chooseMonth(page, 'All months');
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
    await expect(generateButton(page)).toHaveText('Generate invoices');
    await expect(generateButton(page)).toBeDisabled();
    await expect(scope(page)).toHaveText('Choose a month to generate its invoices.');
  });

  test('an invoice with no work date is filed under its issue month; a month with no paid work says so', async ({ page }) => {
    const fake = newFake();
    fake.invoices.push({ ...issuedSeptember(), id: 2, invoice_number: '2026-000', service_date_from: null, service_date_to: null, issue_date: '2026-08-14T00:00:00Z', payment_ids: [] });
    await open(page, fake);
    await monthPicker(page).click();
    await expect(page.getByRole('option')).toHaveText(['All months', 'October 2026', 'September 2026', 'August 2026']);
    await page.getByRole('option', { name: 'August 2026', exact: true }).click();
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="invoice-row"]')).toContainText('2026-000');
    await expect(generateButton(page)).toBeDisabled();
    await expect(scope(page)).toHaveText('No paid-work payments in August 2026.');
  });

  test('a draft waiting is work still to do: the tab opens on its month and the button reviews it', async ({ page }) => {
    const fake = newFake();
    // October is fully issued or drafted: one draft waits, nothing is left to draft.
    fake.payments = fake.payments.filter((p) => p.id === 1 || p.id === 4);
    fake.invoices.push({ id: 7, status: 'draft', client_id: 1, client_name: 'Galerie Nord', invoice_number: null, number: null, issue_date: null,
      service_date_from: '2026-10-03T00:00:00Z', service_date_to: '2026-10-03T00:00:00Z', vat_rate_bp: 1900, total_cents: 10000, currency: 'EUR', payment_ids: [1] });
    fake.payments[0].invoice = { id: 7, status: 'draft', invoice_number: null };
    await open(page, fake);
    await expect(monthPicker(page)).toContainText('October 2026');
    await expect(generateButton(page)).toHaveText('Review 1 draft for October 2026');
    await expect(scope(page)).toHaveText('1 draft waiting');
    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 1');
    // Nothing new was drafted: the one draft is the one from before.
    expect(fake.invoices.filter((i) => i.status === 'draft').map((i) => i.id)).toEqual([7]);
  });

  test('with nothing waiting it opens on All months, as before', async ({ page }) => {
    const fake = newFake();
    fake.payments = fake.payments.filter((p) => p.id === 4);
    await open(page, fake);
    await expect(monthPicker(page)).toContainText('All months');
    await expect(generateButton(page)).toBeDisabled();
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
  });
});

test.describe('#11505 generate, then review one at a time', () => {
  test('Accept issues, Reject deletes, Later keeps the draft; the counter moves and the line says what happened', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await generateButton(page).click();

    // 1 / 3: the first October payment, prefilled, and what Accept will do.
    await expect(dialog(page)).toContainText('Invoice 1 / 3 · Galerie Nord');
    await expect(editor(page)).toHaveAttribute('data-status', 'draft');
    await expect(description(page)).toHaveValue('Work 1');
    await expect(page.locator('[data-test="review-accept-note"]')).toContainText("Accept issues it as 2026-002 with today's date. It can't be changed or deleted afterwards. Reject deletes this draft: the payment stays without an invoice and is offered again next time.");
    expect(fake.requests[0]).toMatchObject({ method: 'POST', path: '/invoicing/invoices/generate', body: JSON.stringify({ month: '2026-10' }) });
    // Three drafts exist and nothing has a number yet.
    expect(fake.invoices.filter((i) => i.status === 'draft').map((i) => i.id)).toEqual([10, 11, 12]);
    expect(fake.next).toBe(2);

    fake.requests.length = 0;
    await page.locator('[data-test="review-accept"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 3');
    // Saved as shown, then issued: exactly those two writes, in that order.
    expect(writes(fake)).toEqual(['PUT /invoices/10', 'POST /invoices/10/issue']);
    expect(fake.invoices.find((i) => i.id === 10)).toMatchObject({ status: 'issued', invoice_number: '2026-002' });
    await expect(description(page)).toHaveValue('Work 2');
    await expect(page.locator('[data-test="review-accept-note"]')).toContainText('2026-003');

    fake.requests.length = 0;
    await page.locator('[data-test="review-reject"]').click();
    await expect(dialog(page)).toContainText('Invoice 3 / 3');
    expect(writes(fake)).toEqual(['DELETE /invoices/11']);
    expect(fake.invoices.some((i) => i.id === 11)).toBe(false);

    fake.requests.length = 0;
    await page.locator('[data-test="review-later"]').click();
    await expect(dialog(page)).toBeHidden();
    expect(writes(fake)).toEqual(['PUT /invoices/12']);
    expect(fake.invoices.find((i) => i.id === 12)).toMatchObject({ status: 'draft', invoice_number: null });
    // One number was drawn, by the one Accept.
    expect(fake.next).toBe(3);

    await expect(summary(page)).toHaveText('October 2026: 1 issued, 1 rejected, 1 left as a draft.');
    // The month now holds the issued invoice and the draft; the rejected
    // payment is free again and the draft waits for a second look.
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(2);
    await expect(scope(page)).toHaveText('1 payment to draft · 1 draft waiting');
    await expect(generateButton(page)).toHaveText('Generate invoices for October 2026');

    // The line is about the last review, so the tab's next action clears it.
    await chooseMonth(page, 'September 2026');
    await expect(summary(page)).toHaveCount(0);
  });

  test('a draft of the month that no listed payment points at is reviewed too', async ({ page }) => {
    const fake = newFake();
    // Started by hand; its payment was removed since, so no payment names it.
    fake.invoices.push({ id: 5, status: 'draft', client_id: 1, client_name: 'Galerie Nord', invoice_number: null, number: null, issue_date: null,
      service_date_from: '2026-10-01T00:00:00Z', service_date_to: '2026-10-01T00:00:00Z', vat_rate_bp: 1900, total_cents: 5000, currency: 'EUR', payment_ids: [],
      line_items: [{ id: 500, position: 1, description: 'By hand', quantity_milli: 1000, unit_price_cents: 5000, line_total_cents: 5000 }] });
    await open(page, fake);
    await expect(scope(page)).toHaveText('3 payments to draft · 1 draft waiting');
    await generateButton(page).click();
    // 1 October comes before the 3rd: the hand-made draft is first of four.
    await expect(dialog(page)).toContainText('Invoice 1 / 4');
    await expect(description(page)).toHaveValue('By hand');
  });

  test('a second press reviews the draft left from before together with the new one', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    await page.locator('[data-test="review-reject"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 3');
    // Closed part way: the two not decided stay drafts.
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(summary(page)).toHaveText('October 2026: 1 rejected, 2 left as drafts.');
    await expect(scope(page)).toHaveText('1 payment to draft · 2 drafts waiting');

    await generateButton(page).click();
    // The rejected payment (3 October) is drafted again and comes first by
    // date; the two drafts from before follow.
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    await expect(description(page)).toHaveValue('Work 1');
    expect(fake.invoices.filter((i) => i.status === 'draft').map((i) => i.id)).toEqual([11, 12, 13]);
    await page.locator('[data-test="review-later"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 3');
    await expect(description(page)).toHaveValue('Work 2');
  });

  test('an Accept the server refuses says why and stays on that invoice', async ({ page }) => {
    const fake = newFake();
    fake.refuseIssue[10] = 'The client has no postal address; an invoice over 250.00 € must name it.';
    await open(page, fake);
    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    await page.locator('[data-test="review-accept"]').click();
    await expect(page.locator('[data-test="invoice-error"]')).toHaveText('The client has no postal address; an invoice over 250.00 € must name it.');
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    expect(fake.invoices.find((i) => i.id === 10)).toMatchObject({ status: 'draft' });
    expect(fake.next).toBe(2);
    // Ze can pass over it and go on.
    await page.locator('[data-test="review-later"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 3');
  });

  test('what ze types in a draft is what Accept issues', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    await description(page).fill('Wandbild, Oktober');
    await page.locator('[data-test="review-accept"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 3');
    const put = fake.requests.find((r) => r.method === 'PUT' && r.path === '/invoicing/invoices/10')!;
    expect(JSON.parse(put.body).line_items[0].description).toBe('Wandbild, Oktober');
  });

  test('a generation the server fails says so and opens nothing', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.route(/\/api\/invoicing\/invoices\/generate$/, (route) => json(route, 500, { error: { code: 'server_error', message: 'Error generating invoices' } }));
    await generateButton(page).click();
    await expect(page.locator('[data-test="generate-error"]')).toContainText('The invoices could not be generated');
    await expect(dialog(page)).toBeHidden();
    await expect(generateButton(page)).toBeEnabled();
  });

  test('an invoice opened from the list is not a review: the two-press issue stays', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();

    await page.locator('[data-test="invoice-row"]').first().click();
    await expect(dialog(page)).toContainText('Draft invoice');
    await expect(page.locator('[data-test="review-accept"]')).toHaveCount(0);
    await expect(page.locator('[data-test="review-accept-note"]')).toHaveCount(0);
    await expect(page.locator('[data-test="draft-issue"]')).toBeVisible();
    await expect(page.locator('[data-test="draft-delete"]')).toBeVisible();
  });
});

test.describe('#11505 on a phone', () => {
  test('at 390×844 the month, its count and Generate are on the first screen, with nothing sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, newFake());
    for (const el of [monthPicker(page), generateButton(page), scope(page)]) {
      await expect(el).toBeVisible();
      const box = (await el.boundingBox())!;
      expect(box.y + box.height, 'on the first screen').toBeLessThanOrEqual(844);
      expect(box.x, 'inside the left edge').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'inside the right edge').toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await generateButton(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 3');
    // The three share one row, Reject on the left and Accept last, at 390 and
    // at 360 (design ack c70970).
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      const [reject, later, accept] = await Promise.all(
        ['review-reject', 'review-later', 'review-accept'].map(async (name) => (await page.locator(`[data-test="${name}"]`).boundingBox())!),
      );
      expect(reject.x, `${width}: Reject inside the left edge`).toBeGreaterThanOrEqual(0);
      expect(accept.x + accept.width, `${width}: Accept inside the right edge`).toBeLessThanOrEqual(width);
      expect(Math.abs(reject.y - accept.y), `${width}: one row`).toBeLessThanOrEqual(2);
      expect(Math.abs(later.y - accept.y), `${width}: one row`).toBeLessThanOrEqual(2);
      expect(reject.x + reject.width, `${width}: Reject, then Later`).toBeLessThanOrEqual(later.x);
      expect(later.x + later.width, `${width}: Later, then Accept`).toBeLessThanOrEqual(accept.x);
    }
  });

  test('on a phone the month and Generate come before the other filters', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, newFake());
    const month = (await monthPicker(page).boundingBox())!;
    const button = (await generateButton(page).boundingBox())!;
    const search = (await page.locator('[data-test="filter-search"]').boundingBox())!;
    expect(month.y + month.height, 'the month, then Generate').toBeLessThanOrEqual(button.y);
    expect(button.y + button.height, 'Generate, then the other filters').toBeLessThanOrEqual(search.y);
    // Both at the panel's full width.
    expect(Math.abs(month.width - button.width)).toBeLessThanOrEqual(2);
    expect(month.width).toBeGreaterThan(300);
  });
});

test.describe('#11505 on a wide screen', () => {
  test.skip(({ isMobile }) => isMobile, 'a desktop width on a desktop browser');

  for (const width of [1280, 1440]) {
    test(`at ${width} the month starts the toolbar, Generate ends its row, and the other filters keep their own row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, newFake());
      const panel = (await page.locator('[data-test="invoices-panel"]').boundingBox())!;
      const month = (await monthPicker(page).boundingBox())!;
      // The search field's own border box: its input sits inside, after the icon.
      const search = (await page.locator('.filter-field--search').boundingBox())!;
      const button = (await generateButton(page).boundingBox())!;
      const line = (await scope(page).boundingBox())!;
      expect(Math.abs(month.x - panel.x), 'the month starts at the left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(button.x + button.width - (panel.x + panel.width)), 'Generate ends at the right edge').toBeLessThanOrEqual(1);
      expect(Math.abs(button.y - month.y), 'Generate sits on the picker\'s line').toBeLessThanOrEqual(3);
      expect(line.y, 'its scope hangs under it').toBeGreaterThanOrEqual(button.y + button.height);
      expect(search.y, 'the other filters are the next row').toBeGreaterThanOrEqual(line.y + line.height);
      expect(Math.abs(search.x - panel.x), 'and start at the same left edge').toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

/** Generating from Transactions (system_3 #11506, epic #11497 items 2a and
 *  2c; §3.159 Decision 4): the ticked rows, or one row, go to the same
 *  endpoint as payment ids and into the same review. */
async function openTransactions(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="create-invoice"]')).toBeVisible();
}

const tick = (page: Page, id: number) => page.getByRole('checkbox', { name: `Select M-${id}`, exact: true }).check();
const generateSelected = (page: Page) => page.locator('[data-test="generate-selected"]');
const createInvoice = (page: Page) => page.locator('[data-test="create-invoice"]');
const generateHint = (page: Page) => page.locator('[data-test="generate-hint"]');
const pairCaption = (page: Page) => page.locator('[data-test="create-invoice-hint"]');
// A Transactions row: a table row on desktop, a card on a phone.
const txnRow = (page: Page, id: number) => page.locator(`[data-row-key="p${id}"]`);
const rowGenerate = (page: Page, id: number) => txnRow(page, id).locator('[data-test="row-generate"]');

test.describe('#11506 Generate invoices for the ticked Transactions rows', () => {
  test('it is the toolbar\'s one primary, after Create invoice, and both wait for a Paid work selection', async ({ page }) => {
    await openTransactions(page, newFake());
    await expect(generateSelected(page)).toHaveClass(/btn--primary/);
    await expect(createInvoice(page)).toHaveClass(/btn--secondary/);
    await expect(generateSelected(page)).toHaveText('Generate invoices');
    await expect(generateSelected(page)).toBeDisabled();
    await expect(createInvoice(page)).toBeDisabled();
    // Disabled for one reason, said once: both buttons point at the same line
    // (§3.114; design_agent c71081).
    await expect(pairCaption(page)).toHaveText('Select rows to set their category or remove them, or paid-work payments to invoice them.');
    await expect(generateSelected(page)).toHaveAttribute('aria-describedby', 'create-invoice-hint');
    await expect(createInvoice(page)).toHaveAttribute('aria-describedby', 'create-invoice-hint');
    await expect(generateHint(page)).toHaveCount(0);
    // Create invoice, then Generate invoices: the primary is last in reading
    // order, on a row or stacked.
    const create = (await createInvoice(page).boundingBox())!;
    const gen = (await generateSelected(page).boundingBox())!;
    expect(gen.x + gen.y * 10000).toBeGreaterThan(create.x + create.y * 10000);

    // A gift in the selection: neither acts, and the line says why.
    await tick(page, 1);
    await tick(page, 5);
    await expect(generateSelected(page)).toBeDisabled();
    await expect(pairCaption(page)).toHaveText('1 of the 2 selected is not Paid work. Untick it to create or generate invoices.');
    await expect(generateSelected(page)).toHaveAttribute('aria-describedby', 'create-invoice-hint');
    await expect(generateHint(page)).toHaveCount(0);
    await tick(page, 6);
    await expect(pairCaption(page)).toHaveText('2 of the 3 selected are not Paid work. Untick them to create or generate invoices.');
    // Unticked, the one Paid work row left is enough and the caption goes.
    await page.getByRole('checkbox', { name: 'Select M-5', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Select M-6', exact: true }).uncheck();
    await expect(generateSelected(page)).toBeEnabled();
    await expect(pairCaption(page)).toHaveCount(0);
    await expect(generateHint(page)).toHaveCount(0);
  });

  // The count is what the review will show (Design ack c71060). A payment on
  // an issued invoice has no checkbox, so this needs a list that lags the
  // server: the row says it is on an issued invoice, the flag does not yet.
  test('a ticked payment that already has an issued invoice is not counted, and alone it disables Generate with the reason', async ({ page }) => {
    const fake = newFake();
    Object.assign(fake.payments.find((p) => p.id === 3)!, { on_invoice: true, on_issued_invoice: false, invoice: { id: 99, status: 'issued', invoice_number: '2026-099' } });
    await openTransactions(page, fake);
    await tick(page, 3);
    await expect(generateSelected(page)).toBeDisabled();
    // Generate's own reason keeps its own line, and Generate points at it.
    await expect(generateHint(page)).toHaveText('Every ticked payment already has an invoice.');
    await expect(generateSelected(page)).toHaveAttribute('aria-describedby', 'generate-hint');
    await expect(pairCaption(page)).toHaveCount(0);
    await tick(page, 1);
    await expect(generateSelected(page)).toHaveText('Generate invoice');
    await expect(generateSelected(page)).toBeEnabled();
  });

  test('the label counts the invoices, and with two or more the line tells the pair apart', async ({ page }) => {
    await openTransactions(page, newFake());
    await tick(page, 2);
    await expect(generateSelected(page)).toHaveText('Generate invoice');
    await expect(page.locator('[data-test="generate-pair-hint"]')).toHaveCount(0);
    await tick(page, 1);
    await tick(page, 3);
    await expect(generateSelected(page)).toHaveText('Generate 3 invoices');
    await expect(createInvoice(page)).toHaveText('Create invoice from 3 payments');
    await expect(page.locator('[data-test="generate-pair-hint"]')).toHaveText('Generate makes one invoice per payment. Create invoice puts all 3 on one.');
  });

  test('two ticked rows become two drafts, reviewed one at a time; the line says what happened and nothing stays ticked', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await tick(page, 3);
    await tick(page, 1);
    await generateSelected(page).click();

    // The ids in the order ze ticked them; the server orders the drafts.
    expect(fake.requests[0]).toMatchObject({ method: 'POST', path: '/invoicing/invoices/generate', body: JSON.stringify({ payment_ids: [3, 1] }) });
    await expect(dialog(page)).toContainText('Invoice 1 / 2 · Galerie Nord');
    await expect(description(page)).toHaveValue('Work 1');
    // Drafts only: no number is drawn by the press.
    expect(fake.invoices.filter((i) => i.status === 'draft')).toHaveLength(2);
    expect(fake.next).toBe(2);
    // The October payment that was not ticked got nothing.
    expect(fake.payments.find((p) => p.id === 2)!.invoice).toBeNull();

    fake.requests.length = 0;
    await page.locator('[data-test="review-accept"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 2');
    await expect(description(page)).toHaveValue('Work 3');
    expect(writes(fake)).toEqual(['PUT /invoices/10', 'POST /invoices/10/issue']);
    await page.locator('[data-test="review-later"]').click();
    await expect(dialog(page)).toBeHidden();

    await expect(summary(page)).toHaveText('2 invoices: 1 issued, 1 left as a draft.');
    await expect(page.getByRole('checkbox', { name: 'Select M-3', exact: true })).not.toBeChecked();
    await expect(generateSelected(page)).toHaveText('Generate invoices');
    // The line is about the last review: the next tick clears it.
    await tick(page, 2);
    await expect(summary(page)).toHaveCount(0);
  });

  test('a ticked payment already on a draft is not drafted twice: its draft joins the review', async ({ page }) => {
    const fake = newFake();
    fake.invoices.push({
      id: 7, status: 'draft', client_id: 1, client_name: 'Galerie Nord', invoice_number: null, number: null, issue_date: null,
      service_date_from: '2026-10-12T00:00:00Z', service_date_to: '2026-10-12T00:00:00Z', vat_rate_bp: 1900, total_cents: 20000, currency: 'EUR', payment_ids: [2],
    });
    Object.assign(fake.payments.find((p) => p.id === 2)!, { on_invoice: true, invoice: { id: 7, status: 'draft', invoice_number: null } });
    await openTransactions(page, fake);
    await tick(page, 1);
    await tick(page, 2);
    await generateSelected(page).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 2');
    // One new draft, for payment 1; payment 2 keeps the draft it had.
    expect(fake.invoices.filter((i) => i.status === 'draft').map((i) => i.id).sort((a, b) => a - b)).toEqual([7, 10]);
    await page.locator('[data-test="review-later"]').click();
    await expect(dialog(page)).toContainText('Invoice 2 / 2');
    await expect(description(page)).toHaveValue('Work 2');
  });

  test('a generation the server fails says so, opens nothing and keeps the ticks', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await page.route(/\/api\/invoicing\/invoices\/generate$/, (route) => json(route, 500, { error: { code: 'server_error', message: 'Error generating invoices' } }));
    await tick(page, 1);
    await generateSelected(page).click();
    await expect(page.locator('[data-test="generate-error"]')).toContainText('The invoices could not be generated');
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('checkbox', { name: 'Select M-1', exact: true })).toBeChecked();
    await expect(generateSelected(page)).toBeEnabled();
  });
});

test.describe('#11506 Generate invoice on a Transactions row', () => {
  test('a Paid work payment with no invoice carries the button; a row with an invoice shows it; any other row shows nothing', async ({ page }) => {
    await openTransactions(page, newFake());
    for (const id of [1, 2, 3]) {
      await expect(rowGenerate(page, id)).toHaveText('Generate invoice');
      await expect(rowGenerate(page, id)).toHaveClass(/btn--secondary/);
      await expect(txnRow(page, id).locator('[data-test="row-invoice"]')).toHaveCount(0);
    }
    // Already invoiced: the invoice, and no button.
    await expect(rowGenerate(page, 4)).toHaveCount(0);
    await expect(txnRow(page, 4).locator('[data-test="row-invoice"]')).toContainText('2026-001');
    // A gift and an "other": neither, because nothing on the row would enable it.
    for (const id of [5, 6]) {
      await expect(rowGenerate(page, id)).toHaveCount(0);
      await expect(txnRow(page, id).locator('[data-test="row-invoice"]')).toHaveCount(0);
    }
    // The row's Client select is gone on every row.
    await expect(page.getByRole('combobox', { name: /^Client for / })).toHaveCount(0);
  });

  test('one press drafts that payment only and opens the review at 1 / 1; the ticks elsewhere stay', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await tick(page, 3);
    await rowGenerate(page, 2).click();
    expect(fake.requests[0]).toMatchObject({ method: 'POST', path: '/invoicing/invoices/generate', body: JSON.stringify({ payment_ids: [2] }) });
    await expect(dialog(page)).toContainText('Invoice 1 / 1 · Galerie Nord');
    await expect(description(page)).toHaveValue('Work 2');
    expect(fake.invoices.filter((i) => i.status === 'draft').map((i) => i.payment_ids)).toEqual([[2]]);
    expect(fake.next).toBe(2);

    fake.requests.length = 0;
    await page.locator('[data-test="review-accept"]').click();
    await expect(dialog(page)).toBeHidden();
    expect(writes(fake)).toEqual(['PUT /invoices/10', 'POST /invoices/10/issue']);
    // One invoice needs no count repeated.
    await expect(summary(page)).toHaveText('1 invoice: issued.');
    // The row now shows its invoice where the button was.
    await expect(rowGenerate(page, 2)).toHaveCount(0);
    await expect(txnRow(page, 2).locator('[data-test="row-invoice"]')).toContainText('2026-002');
    // The row ze had ticked for something else is still ticked.
    await expect(page.getByRole('checkbox', { name: 'Select M-3', exact: true })).toBeChecked();
  });

  test('rejected, the payment is free again and its row offers the button again', async ({ page }) => {
    const fake = newFake();
    await openTransactions(page, fake);
    await rowGenerate(page, 1).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 1');
    await page.locator('[data-test="review-reject"]').click();
    await expect(dialog(page)).toBeHidden();
    await expect(summary(page)).toHaveText('1 invoice: rejected.');
    expect(fake.invoices.filter((i) => i.status === 'draft')).toHaveLength(0);
    await expect(rowGenerate(page, 1)).toBeVisible();
  });
});

test.describe('#11506 the client on a desktop row', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone card already reads the client as text (#11019-A4)');

  test('reads as text under who, and a payment with none says "No client" in muted ink', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactions(page, newFake());
    await expect(txnRow(page, 1).locator('[data-test="row-client"]')).toHaveText('Galerie Nord');
    await expect(txnRow(page, 1).locator('[data-test="row-client"]')).not.toHaveClass(/muted/);
    await expect(txnRow(page, 6).locator('[data-test="row-client"]')).toHaveText('No client');
    await expect(txnRow(page, 6).locator('[data-test="row-client"]')).toHaveClass(/muted/);
    await expect(page.getByRole('columnheader', { name: 'Invoice', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Client', exact: true })).toHaveCount(0);
  });

  for (const width of [1280, 1440]) {
    test(`at ${width} with three ticked no button label wraps and the pair ends with the primary`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTransactions(page, newFake());
      for (const id of [1, 2, 3]) await tick(page, id);
      await expect(generateSelected(page)).toHaveText('Generate 3 invoices');
      const oneLine = async (sel: string) => {
        const box = (await page.locator(sel).first().boundingBox())!;
        return box.height;
      };
      // One text line each: a wrapped label would double the button's height.
      const heights = [await oneLine('[data-test="create-invoice"]'), await oneLine('[data-test="generate-selected"]'), await oneLine('[data-test="bulk-remove"]')];
      expect(Math.max(...heights) - Math.min(...heights), 'all three buttons one line high').toBeLessThanOrEqual(1);
      const create = (await createInvoice(page).boundingBox())!;
      const gen = (await generateSelected(page).boundingBox())!;
      expect(gen.y, 'the pair shares a row').toBe(create.y);
      expect(gen.x, 'the primary is rightmost').toBeGreaterThan(create.x + create.width - 1);
      expect(await rowGenerate(page, 1).evaluate((el) => el.scrollWidth <= el.clientWidth), 'the row button fits its column').toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test.describe('#11506 on a phone', () => {
  test('at 390×844 the card\'s button generates and does not open the card; the toolbar stacks with the primary last', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fake = newFake();
    await openTransactions(page, fake);
    const create = (await createInvoice(page).boundingBox())!;
    const gen = (await generateSelected(page).boundingBox())!;
    expect(gen.y, 'Generate under Create invoice').toBeGreaterThanOrEqual(create.y + create.height);
    expect(Math.abs(gen.width - create.width), 'both full width').toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await rowGenerate(page, 1).click();
    await expect(dialog(page)).toContainText('Invoice 1 / 1');
    // The review, not Edit payment.
    await expect(editor(page)).toBeVisible();
    expect(writes(fake)).toEqual(['POST /invoices/generate']);
  });
});
