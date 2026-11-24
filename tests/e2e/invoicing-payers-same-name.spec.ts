import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #12319, §3.142 Decisions 3-5): one person who paid
 *  by PayPal and by bank transfer is two rows in "Add payers". Ticked with one
 *  new name, they are one client: the later row says so, the button counts
 *  clients, and Save posts each row's name for the server to group. A later
 *  row can still be a second person. "Add … as a new client" shows the choice
 *  as made. Every call is answered by an in-memory fake of aspirant-server; a
 *  catch-all /api/ → 404 is registered FIRST. Every name and email is invented. */

type Json = Record<string, any>;

interface Fake {
  clients: Json[];
  payers: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
}

const payer = (over: Json = {}): Json => ({
  key: 'email:mara@example.test', payer: 'Mara Esempio', tidied_name: 'Mara Esempio', paypal_email: 'mara@example.test',
  payment_ids: [21, 22], payment_count: 2, totals: [{ currency: 'EUR', cents: 24000 }],
  first_paid_on: '2026-08-12', last_paid_on: '2026-10-03', ...over,
});

// The PayPal row first (most payments), then the same person's bank row.
const bankRow = (over: Json = {}): Json =>
  payer({ key: 'name:mara esempio', payer: 'MARA ESEMPIO', tidied_name: 'Mara Esempio', paypal_email: '', payment_ids: [31], payment_count: 1, totals: [{ currency: 'EUR', cents: 12000 }], first_paid_on: '2026-09-01', last_paid_on: '2026-09-01', ...over });

function newFake(over: Partial<Fake> = {}): Fake {
  return { clients: [{ id: 1, name: 'Galerie Nord', paypal_email: '' }], payers: [payer(), bankRow()], requests: [], ...over };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

async function open(page: Page, fake: Fake): Promise<void> {
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
    if (path === '/invoicing/payers/candidates' && method === 'GET') return json(route, 200, { payers: fake.payers, left_out: {} });
    if (path === '/invoicing/payers' && method === 'POST') {
      // As the server (#12319): rows of one new name are one client, unless
      // a row says second_client.
      const rows: Json[] = JSON.parse(body).payers;
      const groups = new Set<string>();
      rows.forEach((r, i) => {
        if (r.new_client_name) groups.add(r.second_client ? `second:${i}` : norm(r.new_client_name));
      });
      const linked = rows.reduce((n, r) => n + r.payment_ids.length, 0);
      const ids = new Set(rows.flatMap((r) => r.payment_ids));
      fake.payers = fake.payers.filter((p) => !p.payment_ids.some((id: number) => ids.has(id)));
      return json(route, 200, { clients_added: groups.size, payments_linked: linked, clients: [] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Clients' }).click();
  await page.locator('[data-test="clients-add-from-payments"]').click();
  await expect(page.locator('[data-test="payers-dialog"]')).toBeVisible();
}

const rows = (page: Page) => page.locator('[data-test="payers-row"]');
const check = (page: Page, i: number) => rows(page).nth(i).locator('input[type="checkbox"]');
const lineOf = (page: Page, i: number) => rows(page).nth(i).locator('[data-test="payers-row-book-line"]');
const save = (page: Page) => page.locator('[data-test="payers-save"]');
const posted = (fake: Fake) => JSON.parse(fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payers')[0].body).payers;

const JOINED = 'Same name as a row above: one client is added for all of them.';

test.describe('#12319 one person listed twice is one client', () => {
  test('two rows of one new name: the later row says so, the button counts one client, Save adds it', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await check(page, 0).check();
    await check(page, 1).check();
    await expect(lineOf(page, 0)).toHaveText('Not in your client book yet: it will be added.');
    await expect(lineOf(page, 1)).toHaveText(JOINED);
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-add-second"]')).toHaveText('Add as a second Mara Esempio');
    await expect(save(page)).toHaveText('Add to client book (1)');
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(page.locator('[data-test="payers-dialog"]')).toBeHidden();
    // Each row posts its own name; the server makes them one client.
    expect(posted(fake)).toEqual([
      { payment_ids: [21, 22], new_client_name: 'Mara Esempio' },
      { payment_ids: [31], new_client_name: 'Mara Esempio' },
    ]);
    await expect(page.locator('[data-test="clients-payers-summary"]')).toHaveText('Client book: added 1 client, linked 3 payments.');
  });

  test('three rows of one person count one client; a changed name is its own again', async ({ page }) => {
    const fake = newFake({ payers: [payer(), bankRow(), bankRow({ key: 'name:m esempio', payer: 'm. esempio', tidied_name: 'M. Esempio', payment_ids: [41] })] });
    await open(page, fake);
    for (const i of [0, 1, 2]) await check(page, i).check();
    await rows(page).nth(2).locator('[data-test="payers-row-name"]').fill('mara esempio');
    await expect(lineOf(page, 2)).toHaveText(JOINED);
    await expect(save(page)).toHaveText('Add to client book (1)');
    // If ze means two people, ze can change a name: the row follows the typing.
    await rows(page).nth(2).locator('[data-test="payers-row-name"]').fill('Mara Rossi');
    await expect(lineOf(page, 2)).toHaveText('Not in your client book yet: it will be added.');
    await expect(save(page)).toHaveText('Add to client book (2)');
  });

  test('two different PayPal emails: the later row says the first is kept', async ({ page }) => {
    const fake = newFake({ payers: [payer(), payer({ key: 'email:m.esempio@example.test', paypal_email: 'm.esempio@example.test', payment_ids: [51] })] });
    await open(page, fake);
    await check(page, 0).check();
    await check(page, 1).check();
    await expect(lineOf(page, 1)).toHaveText(`${JOINED} The client keeps the first row's PayPal email.`);
  });

  test('"Add as a second …" makes the row its own client, and typing clears it', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await check(page, 0).check();
    await check(page, 1).check();
    await rows(page).nth(1).locator('[data-test="payers-row-book-add-second"]').click();
    await expect(lineOf(page, 1)).toHaveText('Save adds a second “Mara Esempio”.');
    await expect(rows(page).nth(1).locator('[data-test="payers-row-book-choices"]')).toHaveCount(0);
    await expect(save(page)).toHaveText('Add to client book (2)');
    await save(page).click();
    await expect(page.locator('[data-test="payers-dialog"]')).toBeHidden();
    expect(posted(fake)).toEqual([
      { payment_ids: [21, 22], new_client_name: 'Mara Esempio' },
      { payment_ids: [31], new_client_name: 'Mara Esempio', second_client: true },
    ]);
    await expect(page.locator('[data-test="clients-payers-summary"]')).toHaveText('Client book: added 2 clients, linked 3 payments.');
  });

  test('typing in a second row\'s field opens the question again', async ({ page }) => {
    await open(page, newFake());
    await check(page, 0).check();
    await check(page, 1).check();
    await rows(page).nth(1).locator('[data-test="payers-row-book-add-second"]').click();
    await rows(page).nth(1).locator('[data-test="payers-row-name"]').fill('Mara  Esempio');
    await expect(lineOf(page, 1)).toHaveText(JOINED);
    await expect(save(page)).toHaveText('Add to client book (1)');
  });

  test('a row in the book and rows of a new name count their clients apart', async ({ page }) => {
    const fake = newFake({ payers: [payer(), bankRow(), payer({ key: 'name:galerie nord', payer: 'GALERIE NORD', tidied_name: 'Galerie Nord', paypal_email: '', payment_ids: [61] })] });
    await open(page, fake);
    for (const i of [0, 1, 2]) await check(page, i).check();
    await expect(lineOf(page, 2)).toHaveText('In your client book.');
    await expect(save(page)).toHaveText('Add to client book (2)');
  });

  test('a close name settled on the first row settles the later one too', async ({ page }) => {
    const fake = newFake({ clients: [{ id: 1, name: 'Mara Esempio Rossi', paypal_email: '' }] });
    await open(page, fake);
    await check(page, 0).check();
    await check(page, 1).check();
    await expect(lineOf(page, 0)).toHaveText('Close to a client in your book:');
    await expect(lineOf(page, 1)).toHaveText(JOINED);
    await expect(page.locator('[data-test="payers-save-hint"]')).toHaveText('Choose Use or Add for Mara Esempio');
    await rows(page).nth(0).locator('[data-test="payers-row-book-add-new"]').click();
    // Ruling 5: the choice is shown as made, and its buttons go.
    await expect(lineOf(page, 0)).toHaveText('Save adds “Mara Esempio” as a new client.');
    await expect(rows(page).nth(0).locator('[data-test="payers-row-book-choices"]')).toHaveCount(0);
    await expect(page.locator('[data-test="payers-save-hint"]')).toHaveCount(0);
    await expect(save(page)).toHaveText('Add to client book (1)');
    // Typing opens the choice again.
    await rows(page).nth(0).locator('[data-test="payers-row-name"]').fill('Mara Esempi');
    await expect(lineOf(page, 0)).toHaveText('Close to a client in your book:');
    await expect(rows(page).nth(0).locator('[data-test="payers-row-book-add-new"]')).toBeVisible();
  });

  test('at 360 the longest line wraps under the name field with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, newFake());
    await check(page, 0).check();
    await check(page, 1).check();
    await expect(lineOf(page, 1)).toHaveText(JOINED);
    expect(JOINED.length).toBe(62);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const field = (await rows(page).nth(1).locator('[data-test="payers-row-name"]').boundingBox())!;
    const line = (await lineOf(page, 1).boundingBox())!;
    expect(line.y).toBeGreaterThanOrEqual(field.y + field.height - 1);
    expect(line.x + line.width).toBeLessThanOrEqual(360);
    const ghost = (await rows(page).nth(1).locator('[data-test="payers-row-book-add-second"]').boundingBox())!;
    expect(ghost.x + ghost.width).toBeLessThanOrEqual(360);
  });
});
