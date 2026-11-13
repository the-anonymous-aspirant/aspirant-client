import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The removed view on Transactions (system_3 #10633, design §3.143 Decision
 *  6): "Show N removed rows" below the list, absent at zero; the rows open in
 *  place with "Back to transactions"; Restore brings a row back unchanged;
 *  Delete for good arms first and never promises erasure (security c66065);
 *  the import line's "restore it on Transactions" opens the view (D14).
 *  Invented records; an in-memory fake behind a catch-all 404. */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  expenses: Json[];
  requests: Array<{ method: string; path: string; body: string; search: string }>;
}

const pay = (o: Json): Json => ({
  kind: 'incoming', currency: 'EUR', fee_cents: 0, net_cents: 0, sender_email: '', reference: '', method: '', note: '',
  client_id: null, on_invoice: false, on_issued_invoice: false, invoice: null, removed_at: null, created_at: '2026-10-01T09:00:00Z', ...o,
});
const spend = (o: Json): Json => ({ currency: 'EUR', client_id: null, reference: '', payee: '', note: '', removed_at: null, created_at: '2026-10-01T09:00:00Z', ...o });
const REMOVED = '2026-11-12T10:00:00Z';

const newFake = (withRemoved = true): Fake => ({
  payments: [
    pay({ id: 1, transaction_id: 'N26-live', source: 'n26', entry: 'import', paid_on: '2026-10-20T00:00:00Z', sender_name: 'Galerie Nord', note: 'Mural', category: 'paid_work', client_id: 1, gross_cents: 35000 }),
    pay({ id: 2, transaction_id: 'PP-gone', source: 'paypal', entry: 'import', paid_on: '2026-10-18T00:00:00Z', sender_name: 'Mara Esempio', note: 'Portrait', category: 'gift', client_id: 1, gross_cents: 4500, removed_at: withRemoved ? REMOVED : null }),
  ],
  expenses: [
    spend({ id: 2, transaction_id: 'N26-exp-gone', source: 'n26', entry: 'import', paid_on: '2026-10-16T00:00:00Z', reference: 'Copyshop Esempio', note: 'Prints', category: 'other', amount_cents: 1250, removed_at: withRemoved ? REMOVED : null }),
    spend({ id: 3, transaction_id: 'M-exp-gone', source: 'manual', entry: 'manual', paid_on: '2026-10-12T00:00:00Z', payee: 'Deutsche Bahn', note: 'Train', category: 'travel', amount_cents: 8900, removed_at: withRemoved ? REMOVED : null }),
  ],
  requests: [],
});

const json = (route: Route, status: number, body: Json) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake) {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '', search: url.search });
    const removed = url.searchParams.get('removed') === 'true';
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments.filter((p) => !!p.removed_at === removed) });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses.filter((e) => !!e.removed_at === removed) });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [] });
    const m = path.match(/^\/invoicing\/(payments|expenses)\/(restore|purge)$/);
    if (m && method === 'POST') {
      const ids: number[] = JSON.parse(req.postData() || '{}').ids || [];
      const list = m[1] === 'payments' ? fake.payments : fake.expenses;
      for (const id of ids) {
        const i = list.findIndex((r) => r.id === id);
        if (m[2] === 'restore') list[i].removed_at = null;
        else list.splice(i, 1);
      }
      return json(route, 200, { action: m[2], ids });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake) {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payment-row"]').first()).toBeVisible();
}

const posts = (fake: Fake) => fake.requests.filter((r) => r.method === 'POST').map((r) => ({ path: r.path, body: JSON.parse(r.body) }));

test.describe('#10633 Removed rows on Transactions', () => {
  test('"Show N removed rows" is absent when nothing is removed', async ({ page }) => {
    const fake = newFake(false);
    await open(page, fake);
    // Positive control: the panel did ask for the removed lists.
    await expect.poll(() => fake.requests.some((r) => r.path === '/invoicing/expenses' && r.search.includes('removed=true'))).toBe(true);
    await expect(page.locator('[data-test="removed-show"]')).toHaveCount(0);
  });

  test('the ghost opens the removed rows in place, and Back returns to the list', async ({ page }) => {
    await open(page, newFake());
    const show = page.locator('[data-test="removed-show"]');
    await expect(show).toHaveText('Show 3 removed rows');
    await show.click();
    const view = page.locator('[data-test="removed-view"]');
    await expect(view).toBeVisible();
    await expect(view.getByRole('heading', { name: 'Removed rows' })).toBeVisible();
    await expect(view.locator('[data-test="removed-payment-row"], [data-test="removed-expense-row"]')).toHaveCount(3);
    // In place: the list and its toolbar are gone while the view is open.
    await expect(page.locator('[data-test="payment-row"], [data-test="category-filter"], [data-test="removed-show"]')).toHaveCount(0);
    await view.locator('[data-test="removed-back"]').click();
    await expect(view).toHaveCount(0);
    await expect(page.locator('[data-test="payment-row"]')).toHaveCount(1);
  });

  test('Restore brings a payment and an expense back unchanged', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="removed-show"]').click();
    const view = page.locator('[data-test="removed-view"]');
    await view.locator('[data-test="removed-payment-row"][data-txn="PP-gone"] [data-test="removed-select"]').click();
    await view.locator('[data-test="removed-expense-row"][data-txn="M-exp-gone"] [data-test="removed-select"]').click();
    await view.locator('[data-test="removed-restore"]').click();
    await expect.poll(() => posts(fake)).toEqual([
      { path: '/invoicing/payments/restore', body: { ids: [2] } },
      { path: '/invoicing/expenses/restore', body: { ids: [3] } },
    ]);
    await expect(view.locator('[data-test="removed-payment-row"], [data-test="removed-expense-row"]')).toHaveCount(1);
    await view.locator('[data-test="removed-back"]').click();
    const back = page.locator('[data-test="payment-row"][data-txn="PP-gone"]');
    await expect(back.locator('[data-test="row-amount"]')).toHaveText('€45.00');
    await expect(back.locator('[data-test="payment-category"]')).toContainText('Gift');
    await expect(back.locator('[data-test="payment-client"]')).toContainText('Galerie Nord');
    await expect(page.locator('[data-test="expense-row"][data-txn="M-exp-gone"] [data-test="row-amount"]')).toHaveText('-€89.00');
    await expect(page.locator('[data-test="removed-show"]')).toHaveText('Show 1 removed row');
  });

  test('Delete for good arms first, never promises erasure, then purges', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="removed-show"]').click();
    const view = page.locator('[data-test="removed-view"]');
    await view.locator('[data-test="removed-select-all"]').getByRole('checkbox').check();
    const purge = view.locator('[data-test="removed-purge"]');
    await expect(purge).toHaveText('Delete for good');
    await purge.click();
    await expect(purge).toHaveText('Delete 3 rows for good');
    await expect(view.locator('[data-test="removed-purge-note"]')).toHaveText('Deleted from your book; the change is kept in its history.');
    await expect(view).not.toContainText(/erase|no trace|gone forever/i);
    expect(posts(fake)).toEqual([]);
    await purge.click();
    await expect.poll(() => posts(fake)).toEqual([
      { path: '/invoicing/payments/purge', body: { ids: [2] } },
      { path: '/invoicing/expenses/purge', body: { ids: [2, 3] } },
    ]);
    // Nothing removed is left: the view closes and the ghost is gone.
    await expect(view).toHaveCount(0);
    await expect(page.locator('[data-test="removed-show"]')).toHaveCount(0);
  });
});
