import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Edit a payment in its hand-entry dialog (system_3 #10694, design §3.143
 *  Decision 5): a hand-entered row changes in full, an imported one keeps
 *  what the bank recorded, a draft's line names it and locks its category,
 *  an issued one only reads; History lists the row's events newest first;
 *  Remove arms first and states its side effect. Invented records only;
 *  every call is answered by an in-memory fake, behind a catch-all 404. */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  events: Json[];
  removeFailure?: { status: number; body: Json };
  requests: Array<{ method: string; path: string; body: string }>;
}

const pay = (over: Json): Json => ({
  kind: 'incoming', currency: 'EUR', fee_cents: 0, net_cents: 0, sender_email: '', reference: '', method: '', note: '',
  client_id: null, on_invoice: false, on_issued_invoice: false, invoice: null, removed_at: null, created_at: '2026-10-01T09:00:00Z', ...over,
});

const newFake = (): Fake => ({
  payments: [
    pay({ id: 1, transaction_id: 'M-hand', source: 'manual', entry: 'manual', method: 'bank_transfer', reference: 'RE-17', paid_on: '2026-10-20T00:00:00Z', sender_name: 'Galerie Nord', note: 'Mural', category: 'paid_work', client_id: 1, gross_cents: 35000 }),
    pay({ id: 2, transaction_id: 'N26-imp', source: 'n26', entry: 'import', paid_on: '2026-10-18T00:00:00Z', sender_name: 'Mara Esempio', reference: 'N26-REF-9', note: 'Portrait', category: 'uncategorised', gross_cents: 45000 }),
    pay({ id: 3, transaction_id: 'PP-draft', source: 'paypal', entry: 'import', paid_on: '2026-10-16T00:00:00Z', sender_name: 'Atelier Ost', sender_email: 'ost@example.test', note: 'Poster', category: 'paid_work', client_id: 1, gross_cents: 12000, on_invoice: true, invoice: { id: 12, status: 'draft', invoice_number: null } }),
    pay({ id: 4, transaction_id: 'PP-issued', source: 'paypal', entry: 'import', paid_on: '2026-10-14T00:00:00Z', sender_name: 'Studio Süd', note: 'Logo', category: 'paid_work', client_id: 1, gross_cents: 80000, on_invoice: true, on_issued_invoice: true, invoice: { id: 7, status: 'issued', invoice_number: '2026-014' } }),
  ],
  events: [
    { id: 11, created_at: '2026-11-10T10:00:00Z', action: 'import', entity_type: 'payment', entity_id: 2, details: '{"source":"n26"}' },
    { id: 12, created_at: '2026-11-12T09:30:00Z', action: 'categorise', entity_type: 'payment', entity_id: 2, details: '{"before":{"category":"uncategorised"},"after":{"category":"gift"}}' },
    { id: 13, created_at: '2026-11-12T11:00:00Z', action: 'categorise', entity_type: 'payment', entity_id: 2, details: '{"before":{"category":"gift"},"after":{"category":"uncategorised"}}' },
  ],
  requests: [],
});

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2' }, { id: 2, name: 'Mara Esempio', address: 'Weg 3' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments.filter((p) => !p.removed_at) });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') {
      const id = Number(url.searchParams.get('entity_id'));
      const events = fake.events.filter((e) => e.entity_type === url.searchParams.get('entity_type') && e.entity_id === id);
      return json(route, 200, { events: [...events].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) });
    }
    let m = path.match(/^\/invoicing\/payments\/(\d+)$/);
    if (m && method === 'PATCH') {
      const p = fake.payments.find((x) => x.id === Number(m![1]))!;
      Object.assign(p, JSON.parse(req.postData() || '{}'));
      return json(route, 200, { payment: p });
    }
    m = path.match(/^\/invoicing\/payments\/(\d+)\/remove$/);
    if (m && method === 'POST') {
      if (fake.removeFailure) return json(route, fake.removeFailure.status, fake.removeFailure.body);
      fake.payments.find((x) => x.id === Number(m![1]))!.removed_at = '2026-11-12T12:00:00Z';
      return json(route, 200, { removed: 1 });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payment-row"]').first()).toBeVisible();
}

const narrowOf = (page: Page) => page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);

// Desktop opens through the row's Edit; a phone through the card's body.
async function openEdit(page: Page, txn: string) {
  const row = page.locator(`[data-test="payment-row"][data-txn="${txn}"]`);
  if (await narrowOf(page)) await row.locator('[data-test="row-who"]').click();
  else await row.locator('[data-test="payment-edit"]').click();
  const dialog = page.getByRole('dialog', { name: 'Edit payment' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const patches = (fake: Fake) => fake.requests.filter((r) => r.method === 'PATCH').map((r) => ({ path: r.path, body: JSON.parse(r.body) }));

test.describe('#10694 Edit a payment', () => {
  test('a hand-entered payment changes in full, and Save sends only what changed', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand');
    await expect(dialog.locator('[data-test="manual-date"]')).toHaveValue('2026-10-20');
    await expect(dialog.locator('[data-test="manual-amount"]')).toHaveValue('350');
    await expect(dialog.locator('[data-test="edit-facts"]')).toHaveCount(0);
    await dialog.locator('[data-test="manual-amount"]').fill('360,50');
    await dialog.locator('[data-test="manual-note"]').fill('Mural, east wall');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(patches(fake)).toEqual([{ path: '/invoicing/payments/1', body: { gross_cents: 36050, note: 'Mural, east wall' } }]);
  });

  // design_agent c66539 (call 1): "Paid by" keeps §3.142 in edit mode.
  test('editing a hand payment to a new name says Save adds it, and Save sends new_client_name', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand');
    await dialog.locator('[data-test="manual-payer"]').fill('Studio Neu');
    await expect(dialog.locator('[data-test="manual-payer-line"]')).toHaveText('Not in your client book yet: Save adds it.');
    await dialog.locator('[data-test="manual-payer-line"]').click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(patches(fake)).toEqual([{ path: '/invoicing/payments/1', body: { sender_name: 'Studio Neu', new_client_name: 'Studio Neu' } }]);
  });

  test('editing a hand payment to a name close to a client stops Save with the Use / Add choice', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand');
    await dialog.locator('[data-test="manual-payer"]').fill('Mara E.');
    await expect(dialog.locator('[data-test="manual-payer-line"]')).toHaveText('Close to a client in your book:');
    await expect(dialog.locator('[data-test="manual-payer-add-new"]')).toHaveText('Add “Mara E.” as a new client');
    // The suggestion list covers the footer on a phone, as for a real user;
    // leaving the field closes it.
    await dialog.locator('[data-test="manual-payer-line"]').click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog.locator('[data-test="manual-error"]')).toHaveText('Choose a client from your book, or add “Mara E.” as a new client.');
    expect(patches(fake)).toEqual([]);
    await dialog.locator('[data-test="manual-payer-use-2"]').click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(patches(fake)).toEqual([{ path: '/invoicing/payments/1', body: { sender_name: 'Mara Esempio', client_id: 2 } }]);
  });

  test('an imported payment shows the bank\'s facts as text; only category, what for and client change', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp');
    await expect(dialog.locator('[data-test="edit-imported-lead"]')).toHaveText(
      "These details came from N26 and can't be changed. If they were read wrong, remove this payment and enter it by hand.",
    );
    const facts = dialog.locator('[data-test="edit-facts"]');
    await expect(facts).toContainText('2026-10-18');
    await expect(facts).toContainText('€450.00');
    await expect(facts).toContainText('Paid by (from the bank)');
    await expect(facts).toContainText('Mara Esempio');
    await expect(facts).toContainText('N26-REF-9');
    // Nothing the bank recorded is an input.
    await expect(dialog.locator('[data-test="manual-date"], [data-test="manual-amount"], [data-test="manual-payer"]')).toHaveCount(0);
    await dialog.locator('[data-test="edit-category"]').click();
    await page.getByRole('option', { name: 'Gift', exact: true }).click();
    await dialog.locator('[data-test="edit-client"]').click();
    await page.getByRole('option', { name: 'Mara Esempio', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    expect(patches(fake)).toEqual([{ path: '/invoicing/payments/2', body: { category: 'gift', client_id: 2 } }]);
  });

  test('a payment on a draft names the draft, locks its category, and Remove says it comes off the draft', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'PP-draft');
    await expect(dialog.locator('[data-test="edit-draft-line"]')).toHaveText(
      'On draft invoice D-12. The draft keeps the amount and description it was made with: change them there too.',
    );
    await expect(dialog.locator('[data-test="edit-category"]')).toBeDisabled();
    await expect(dialog.locator('[data-test="edit-category-locked"]')).toHaveText('On draft invoice D-12: take it off the draft first.');
    const remove = dialog.locator('[data-test="edit-remove"]');
    await expect(remove).toHaveText('Remove');
    await remove.click();
    await expect(remove).toHaveText('Remove this payment');
    await expect(dialog.locator('[data-test="edit-remove-effect"]')).toHaveText('It is also taken off draft D-12.');
    expect(fake.requests.some((r) => r.path.endsWith('/remove'))).toBe(false);
    await remove.click();
    await expect(dialog).toBeHidden();
    expect(fake.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual(['/invoicing/payments/3/remove']);
    await expect(page.locator('[data-test="payment-row"][data-txn="PP-draft"]')).toHaveCount(0);
  });

  test('a payment on an issued invoice only reads, with only Close', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'PP-issued');
    await expect(dialog.locator('[data-test="edit-issued-line"]')).toHaveText(
      'On issued invoice 2026-014. Cancel that invoice to change or remove this payment.',
    );
    await expect(dialog.locator('[data-test="edit-facts"]')).toContainText('Studio Süd');
    await expect(dialog.locator('input, textarea, [data-test="edit-category"], [data-test="edit-client"]')).toHaveCount(0);
    await expect(dialog.locator('[data-test="edit-remove"], [data-test="manual-save"]')).toHaveCount(0);
    await dialog.locator('[data-test="edit-close"]').click();
    await expect(dialog).toBeHidden();
    expect(patches(fake)).toEqual([]);
  });

  test('History lists the row\'s events newest first', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp');
    const history = dialog.locator('[data-test="edit-history"]');
    await expect(history).not.toHaveAttribute('open', '');
    await history.locator('summary').click();
    await expect(history.locator('[data-test="edit-history-line"]')).toHaveText([
      /^12 Nov 2026 · Category: Gift → Uncategorised$/,
      /^12 Nov 2026 · Category: Uncategorised → Gift$/,
      /^10 Nov 2026 · Imported$/,
    ]);
  });

  test('a remove the server refuses is shown in the dialog, and the row stays', async ({ page }) => {
    const fake = newFake();
    fake.removeFailure = { status: 409, body: { error: { code: 'payment_on_invoice', message: 'payment is on issued invoice 2026-014; cancel it first' } } };
    await open(page, fake);
    const dialog = await openEdit(page, 'M-hand');
    await dialog.locator('[data-test="edit-remove"]').click();
    await dialog.locator('[data-test="edit-remove"]').click();
    await expect(dialog.locator('[data-test="manual-error"]')).toHaveText('payment is on issued invoice 2026-014; cancel it first');
    await expect(dialog).toBeVisible();
  });

  test('on a phone a card\'s body opens its dialog; its checkbox does not', async ({ page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width > 640, 'phone layout only');
    const fake = newFake();
    await open(page, fake);
    const card = page.locator('.payment-card[data-txn="M-hand"]');
    await card.locator('[data-test="payment-select"]').click();
    await expect(page.getByRole('dialog', { name: 'Edit payment' })).toHaveCount(0);
    await card.locator('[data-test="row-who"]').click();
    await expect(page.getByRole('dialog', { name: 'Edit payment' })).toBeVisible();
  });

  test('a new payment by hand still opens as before', async ({ page }) => {
    await open(page, newFake());
    await page.locator('[data-test="manual-new"]').click();
    const dialog = page.getByRole('dialog', { name: 'Enter payment by hand' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save payment' })).toBeVisible();
    await expect(dialog.locator('[data-test="edit-history"], [data-test="edit-remove"], [data-test="edit-category"]')).toHaveCount(0);
  });
});
