import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

/** system_3 #11668 (A1 of #11632; §3.166, cited as #11629): an exit from
 *  the expense or payment form asks before it throws away what was typed,
 *  and closes at once when nothing was. Every call is answered by an
 *  in-memory fake; a catch-all /api/ → 404 is registered first. */

type Json = Record<string, any>;
interface Fake {
  expenses: Json[];
  requests: Array<{ method: string; path: string }>;
  // A write held open until released, so a test can act while it runs.
  hold?: boolean;
  release?: () => void;
}

const exp = (over: Json): Json => ({
  currency: 'EUR', payee: '', reference: '', note: '', removed_at: null, created_at: '2026-10-01T09:00:00Z', ...over,
});
const newFake = (): Fake => ({
  expenses: [exp({ id: 21, transaction_id: 'M-hand-e', source: 'manual', entry: 'manual', paid_on: '2026-10-20T00:00:00Z', payee: 'Copyshop Esempio', reference: 'R-7', note: 'Prints', category: 'other', amount_cents: 1250 })],
  requests: [],
});
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: ['materials and supplies', 'other', 'travel'].map((name, i) => ({ id: i + 1, name })) });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (method === 'POST' || method === 'PATCH') {
      if (fake.hold) await new Promise<void>((resolve) => (fake.release = resolve));
      if (path === '/invoicing/expenses/manual') return json(route, 201, { expense: exp({ id: 30, transaction_id: 'M-new', source: 'manual', entry: 'manual', paid_on: '2026-11-01T00:00:00Z', amount_cents: 999, category: 'other' }) });
      if (path === '/invoicing/payments/manual') return json(route, 201, { payment: { id: 40 }, client: null });
      return json(route, 400, { error: { code: 'bad_request', message: 'refused' } });
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

const dialog = (page: Page) => page.getByRole('dialog');
const ask = (page: Page) => page.locator('[data-test="unsent-ask"]');
const closeX = (page: Page) => dialog(page).getByRole('button', { name: 'Close dialog' });
const writes = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET');

async function newExpense(page: Page) {
  await openWaysIn(page);
  await page.locator('[data-test="expense-new"]').click();
  await expect(dialog(page)).toBeVisible();
}
async function editExpense(page: Page) {
  const row = page.locator('[data-test="expense-row"][data-txn="M-hand-e"]');
  const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
  if (narrow) await row.locator('[data-test="row-who"]').click();
  else await row.locator('[data-test="expense-edit"]').click();
  await expect(dialog(page)).toBeVisible();
}
async function newPayment(page: Page) {
  await openWaysIn(page);
  await page.locator('[data-test="manual-new"]').click();
  await expect(dialog(page)).toBeVisible();
}

// Each exit, by name. The scrim exists only at 768px or wider.
const exits: Record<string, (page: Page) => Promise<void>> = {
  Esc: (page) => page.keyboard.press('Escape'),
  '✕': (page) => closeX(page).click(),
  Back: (page) => page.goBack(),
  Cancel: (page) => dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click(),
};

test.describe('#11668 the expense form asks before an exit throws away what was typed', () => {
  for (const [name, exit] of Object.entries(exits)) {
    test(`${name}: with nothing typed it closes at once; with a change it asks`, async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await newExpense(page);
      await exit(page);
      await expect(dialog(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/member\/personal\/invoicing/);

      await newExpense(page);
      await dialog(page).locator('[data-test="expense-payee"]').fill('Papierladen');
      await exit(page);
      await expect(ask(page)).toBeVisible();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).locator('[data-test="expense-payee"]')).toHaveValue('Papierladen');
      expect(writes(fake)).toEqual([]);
    });
  }

  test('the scrim asks at 768px or wider', async ({ page, isMobile }) => {
    test.skip(isMobile, 'below 768px the dialog is a sheet with no scrim');
    await page.setViewportSize({ width: 1024, height: 800 });
    await open(page, newFake());
    await newExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Papierladen');
    await page.mouse.click(5, 5);
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await dialog(page).locator('[data-test="expense-payee"]').fill('');
    await page.mouse.click(5, 5);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a field typed and put back closes at once', async ({ page }) => {
    await open(page, newFake());
    await newExpense(page);
    const payee = dialog(page).locator('[data-test="expense-payee"]');
    await payee.fill('Papierladen');
    await payee.fill('  ');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('the ask: its line is announced, focus is on Keep editing, the form cannot change, and every exit keeps editing', async ({ page }) => {
    await open(page, newFake());
    await newExpense(page);
    const payee = dialog(page).locator('[data-test="expense-payee"]');
    await payee.fill('Papierladen');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test="unsent-ask-line"]')).toHaveText('Close without saving? What is not saved yet will be lost.');
    await expect(page.locator('[data-test="unsent-ask-line"]')).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-test="unsent-keep"]')).toBeFocused();
    await expect(page.locator('[data-test="unsent-discard"]')).toHaveText('Discard changes');
    await expect(dialog(page).locator('[data-test="expense-form"]')).toHaveAttribute('inert', /.*/);
    // While it asks, each exit leaves the dialog open, as typed.
    await page.keyboard.press('Escape');
    await closeX(page).click();
    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(ask(page)).toBeVisible();
    await expect(payee).toHaveValue('Papierladen');
    await expect(page).toHaveURL(/\/member\/personal\/invoicing/);
  });

  test('Keep editing returns to the form as typed, and the next Esc asks again; Discard changes closes', async ({ page }) => {
    await open(page, newFake());
    await newExpense(page);
    const payee = dialog(page).locator('[data-test="expense-payee"]');
    await payee.fill('Papierladen');
    await payee.focus();
    await page.keyboard.press('Escape');
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(ask(page)).toHaveCount(0);
    await expect(payee).toHaveValue('Papierladen');
    await expect(payee).toBeFocused();
    await expect(dialog(page).locator('[data-test="expense-save"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    // Reopened, the form is blank.
    await newExpense(page);
    await expect(dialog(page).locator('[data-test="expense-payee"]')).toHaveValue('');
  });

  test('a picked receipt counts as unsent', async ({ page }) => {
    await open(page, newFake());
    await newExpense(page);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await dialog(page).locator('[data-test="expense-receipt-input"]').setInputFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: png });
    await expect(dialog(page).locator('[data-test="expense-receipt-file"]')).toContainText('beleg.png');
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
  });

  test('an edited expense: a change asks, the record unchanged closes at once, and Discard leaves the record as it was', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await editExpense(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await editExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Copyshop Neu');
    await page.keyboard.press('Escape');
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(writes(fake)).toEqual([]);
    await editExpense(page);
    await expect(dialog(page).locator('[data-test="expense-payee"]')).toHaveValue('Copyshop Esempio');
  });

  test('an armed Remove is disarmed by Keep editing', async ({ page }) => {
    await open(page, newFake());
    await editExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Copyshop Neu');
    await dialog(page).locator('[data-test="edit-remove"]').click();
    await expect(dialog(page).locator('[data-test="edit-remove"]')).toHaveText('Remove this expense');
    await page.keyboard.press('Escape');
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(dialog(page).locator('[data-test="edit-remove"]')).toHaveText('Remove');
  });

  test('while a save is in flight no exit closes and none asks; when it fails, Back asks', async ({ page }) => {
    const fake = newFake();
    fake.hold = true;
    await open(page, fake);
    await editExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Copyshop Neu');
    await dialog(page).locator('[data-test="expense-save"]').click();
    await expect.poll(() => writes(fake).length).toBe(1);
    await page.keyboard.press('Escape');
    await closeX(page).click();
    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(ask(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/member\/personal\/invoicing/);
    // The save is refused (the fake answers 400 to an expense PATCH), so the
    // change is still unsent: Back now asks.
    fake.release!();
    await expect(dialog(page).locator('[data-test="expense-error"]')).toBeVisible();
    await page.goBack();
    await expect(ask(page)).toBeVisible();
  });

  test('Back: with nothing changed it closes and stays on the page; with a change, twice in a row, the dialog stays open on the same address', async ({ page }) => {
    await open(page, newFake());
    const url = page.url();
    await newExpense(page);
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(url);

    await newExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Papierladen');
    await page.goBack();
    await expect(ask(page)).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await page.goBack();
    await expect(ask(page)).toBeVisible();
    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    expect(page.url()).toBe(url);
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
  });

  test('a reload raises the browser\'s prompt only while something is unsent', async ({ page }) => {
    await open(page, newFake());
    await newExpense(page);
    const prevented = () => page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(await prevented()).toBe(false);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Papierladen');
    expect(await prevented()).toBe(true);
    await dialog(page).locator('[data-test="expense-payee"]').fill('');
    expect(await prevented()).toBe(false);
  });

  test('at 360px the line wraps, both buttons are full width, and nothing scrolls sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone width');
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, newFake());
    await newExpense(page);
    await dialog(page).locator('[data-test="expense-payee"]').fill('Papierladen');
    await page.keyboard.press('Escape');
    const footer = (await ask(page).boundingBox())!;
    for (const id of ['unsent-keep', 'unsent-discard']) {
      const b = (await page.locator(`[data-test="${id}"]`).boundingBox())!;
      expect(Math.abs(b.width - footer.width), id).toBeLessThanOrEqual(1);
    }
    const keep = (await page.locator('[data-test="unsent-keep"]').boundingBox())!;
    const discard = (await page.locator('[data-test="unsent-discard"]').boundingBox())!;
    expect(keep.y, 'Keep editing first').toBeLessThan(discard.y);
    const lines = await page.locator('[data-test="unsent-ask-line"]').evaluate((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    });
    expect(lines).toBeGreaterThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('#11668 the payment form asks before an exit throws away what was typed', () => {
  for (const [name, exit] of Object.entries(exits)) {
    test(`${name}: with nothing typed it closes at once; with a change it asks; Discard closes`, async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await newPayment(page);
      await exit(page);
      await expect(dialog(page)).toHaveCount(0);

      await newPayment(page);
      await dialog(page).locator('[data-test="manual-form"] input[type="date"]').first().fill('2026-11-02');
      await exit(page);
      await expect(ask(page)).toBeVisible();
      await page.locator('[data-test="unsent-discard"]').click();
      await expect(dialog(page)).toHaveCount(0);
      expect(writes(fake)).toEqual([]);
    });
  }
});
