import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** A refused Save shows its reason where ze is looking (system_3 #12298).
 *  A refusal about one field prints at that field and focus moves there
 *  (ruling 1); one about no field prints in the dialog's footer, above the
 *  buttons, and focus stays on the button pressed (rulings 2, 3). Either
 *  goes when its cause is edited (ruling 4). The test never scrolls: every
 *  box is measured where the user's own presses left the page, against the
 *  viewport and every scrolling ancestor (the review's probe_inview, #11498
 *  walk w2). */

type Json = Record<string, any>;

interface Fake {
  payments: Json[];
  invoices: Json[];
  items: Record<number, Json[]>;
  links: Record<number, number[]>;
  requests: Array<{ method: string; path: string; body: string }>;
  clientFailure?: { status: number; body: Json };
  draftFailure?: { status: number; body: Json };
  createFailure?: { status: number; body: Json };
}

const PROFILE = { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '12/345/67890', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 };

function newFake(): Fake {
  return {
    payments: [
      { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild Juli', category: 'paid_work', client_id: 1 },
      { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 12000, sender_name: 'Galerie Nord', sender_email: '', note: 'Portrait', category: 'paid_work', client_id: 1 },
    ],
    invoices: [],
    items: {},
    links: {},
    requests: [],
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function detail(fake: Fake, inv: Json): Json {
  const payments = fake.payments.filter((p) => (fake.links[inv.id] || []).includes(p.id));
  return { invoice: inv, line_items: fake.items[inv.id] || [], payments, warnings: [] };
}

async function mockAll(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() || '';
    fake.requests.push({ method, path, body });

    if (path === '/invoicing/profile' && method === 'GET') return json(route, 200, { saved: true, profile: PROFILE });
    if (path === '/invoicing/profile' && method === 'PUT') return json(route, 200, { saved: true, profile: JSON.parse(body) });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/clients' && method === 'POST') {
      if (fake.clientFailure) return json(route, fake.clientFailure.status, fake.clientFailure.body);
      return json(route, 201, { client: { id: 2, ...JSON.parse(body) } });
    }
    if (path === '/invoicing/payments') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/validation') return json(route, 200, { violations: [], warnings: [] });
    if (path === '/invoicing/export/invoices.zip') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html>502 Bad Gateway</html>' });
    if (path === '/invoicing/invoices' && method === 'GET') {
      return json(route, 200, { invoices: fake.invoices.map((i) => ({ ...i, client_name: 'Galerie Nord' })) });
    }
    if (path === '/invoicing/invoices' && method === 'POST') {
      if (fake.createFailure) return json(route, fake.createFailure.status, fake.createFailure.body);
      const ids: number[] = JSON.parse(body).payment_ids;
      const id = 100 + fake.invoices.length;
      const ps = fake.payments.filter((p) => ids.includes(p.id));
      const total = ps.reduce((s, p) => s + p.gross_cents, 0);
      const inv = { id, status: 'draft', client_id: 1, service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-20T00:00:00Z', vat_rate_bp: 1900, currency: 'EUR', invoice_number: null, issue_date: null, total_cents: total };
      fake.invoices.push(inv);
      fake.links[id] = ids;
      fake.items[id] = ps.map((p, i) => ({ id: i + 1, position: i + 1, description: p.note, quantity_milli: 1000, unit_price_cents: p.gross_cents, line_total_cents: p.gross_cents }));
      return json(route, 201, detail(fake, inv));
    }
    const m = path.match(/^\/invoicing\/invoices\/(\d+)(\/issue|\/cancel)?$/);
    if (m) {
      const inv = fake.invoices.find((i) => i.id === Number(m[1]))!;
      if (!m[2] && method === 'GET') return json(route, 200, detail(fake, inv));
      if (!m[2] && method === 'PUT') {
        if (fake.draftFailure) return json(route, fake.draftFailure.status, fake.draftFailure.body);
        return json(route, 200, detail(fake, inv));
      }
      if (m[2] === '/issue') {
        Object.assign(inv, { status: 'issued', invoice_number: '2026-001', number: 1, issue_date: '2026-10-21T00:00:00Z' });
        return json(route, 200, detail(fake, inv));
      }
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mockAll(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
}

/** Whether the whole box is on screen: inside the viewport and inside every
 *  ancestor that scrolls (the dialog's body, the sheet). */
function boxInView(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) return false;
    if (r.top < -1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.right > window.innerWidth + 1) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o !== 'auto' && o !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) return false;
    }
    return true;
  });
}

async function expectInView(loc: Locator): Promise<void> {
  await expect(loc).toBeVisible();
  // Focus scrolls a field into view; the poll waits for that to settle.
  await expect.poll(() => boxInView(loc), { timeout: 3000 }).toBe(true);
}

/** The refusal printed at an AspInput or AspTextarea, in its hint's place. */
const fieldLine = (page: Page, testId: string): Locator =>
  page.locator('.field').filter({ has: page.locator(`[data-test="${testId}"]`) }).locator('.field__message--error');

async function createFromTwo(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Select TX1' }).check();
  await page.getByRole('checkbox', { name: 'Select TX2' }).check();
  await page.locator('[data-test="create-invoice"]').click();
  await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
}

for (const size of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`#12298 a refusal where ze is looking, ${size.width}`, () => {
    test.use({ viewport: size });
    // The two widths are set here; the phone project would only repeat them.
    test.skip(({ isMobile }) => isMobile, 'widths set by this spec');

    test('Add client: an empty name at Name, focused; a server refusal above the buttons; each goes when edited', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await page.getByRole('tab', { name: 'Clients' }).click();
      await page.locator('[data-test="client-add"]').click();
      const save = page.locator('[data-test="client-save"]');
      await save.click();

      const nameLine = fieldLine(page, 'client-name-input');
      await expect(nameLine).toHaveText('A client needs a name.');
      await expectInView(nameLine);
      await expect(page.locator('[data-test="client-name-input"]')).toBeFocused();
      await page.locator('[data-test="client-name-input"]').fill('Anna Example');
      await expect(nameLine).toHaveCount(0);

      // A refusal with no field of the form; the client has no sentence for
      // this one, so it says its fallback (system_3 #12300 review point 3).
      fake.clientFailure = { status: 500, body: { error: { code: 'internal_error', message: 'Error creating client' } } };
      await save.click();
      const footer = page.locator('[data-test="client-error"]');
      await expect(footer).toHaveText('This could not be saved.');
      await expect(footer).toHaveAttribute('role', 'alert');
      await expectInView(footer);
      await expect(save).toBeFocused();

      // The "Close without saving?" ask takes the footer; Keep editing
      // brings the line back.
      await page.locator('[role="dialog"] .modal__close').last().click();
      await expect(page.locator('[data-test="unsent-ask"]')).toBeVisible();
      await expect(footer).toHaveCount(0);
      await page.locator('[data-test="unsent-keep"]').click();
      await expect(footer).toBeVisible();

      // Any change to the form removes the footer line.
      await page.locator('[data-test="client-name-input"]').fill('Anna Example B');
      await expect(footer).toHaveCount(0);
    });

    test('Issuer profile: an empty Full name at that field, focused, and nothing sent', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await page.locator('[data-test="profile-edit"]').click();
      const name = page.locator('[data-test="profile-full-name"]');
      await name.fill('');
      await page.locator('[data-test="profile-save"]').click();

      const line = fieldLine(page, 'profile-full-name');
      await expect(line).toHaveText('Enter your full name. It is printed on every invoice.');
      await expectInView(line);
      await expect(name).toBeFocused();
      expect(fake.requests.some((r) => r.method === 'PUT' && r.path === '/invoicing/profile')).toBe(false);
      await name.fill('Flower Example');
      await expect(line).toHaveCount(0);
    });

    test('Enter payment: no date at the date, focused; the line goes when a date is typed', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      // Below 640px the ways in sit behind the "Add or import" fold, which
      // opens by itself only while the list is empty; this fake has payments.
      const summary = page.locator('[data-test="ways-in-summary"]');
      if (await summary.count()) await summary.click();
      await page.locator('[data-test="manual-new"]').click();
      await page.locator('[data-test="manual-save"]').click();

      const line = page.locator('[data-test="manual-date-error"]');
      await expect(line).toHaveText('Enter the date the money was received.');
      await expectInView(line);
      await expect(page.locator('[data-test="manual-date"]')).toBeFocused();
      await page.locator('[data-test="manual-date"]').fill('2026-07-14');
      await expect(line).toHaveCount(0);
    });

    test('Draft invoice: a text quantity under its line, focused; a server refusal above the buttons', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await createFromTwo(page);

      const quantity = page.getByLabel('Quantity, line 1');
      await quantity.fill('two');
      await page.locator('[data-test="draft-save"]').click();
      const lineError = page.locator('[data-test="draft-line-error"]');
      await expect(lineError).toContainText('Line 1: enter the quantity and the price as numbers');
      await expectInView(lineError);
      await expect(quantity).toBeFocused();
      expect(fake.requests.some((r) => r.method === 'PUT')).toBe(false);
      await quantity.fill('2');
      await expect(lineError).toHaveCount(0);

      fake.draftFailure = { status: 500, body: { error: { code: 'internal_error', message: 'The server could not be reached. Try again.' } } };
      const save = page.locator('[data-test="draft-save"]');
      await save.click();
      const footer = page.locator('[data-test="invoice-error"]');
      await expect(footer).toHaveText('The server could not be reached. Try again.');
      await expectInView(footer);
      await expect(save).toBeFocused();
      await page.getByLabel('Description, line 1').fill('Wandbild Juli, groß');
      await expect(footer).toHaveCount(0);
    });

    test('Cancel invoice (Storno): no reason at the reason field, focused; it goes as the reason is typed', async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await createFromTwo(page);
      await page.locator('[data-test="draft-issue"]').click();
      await page.locator('[data-test="issue-confirm-button"]').click();
      await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');

      await page.locator('[data-test="invoice-cancel"]').click();
      await page.locator('[data-test="invoice-cancel-confirm"]').click();
      const line = fieldLine(page, 'cancel-reason');
      await expect(line).toHaveText('Give a reason for the cancellation.');
      await expectInView(line);
      await expect(page.locator('[data-test="cancel-reason"]')).toBeFocused();
      await expect(page.locator('[data-test="invoice-error"]')).toHaveCount(0);
      await page.locator('[data-test="cancel-reason"]').fill('Wrong amount');
      await expect(line).toHaveCount(0);
    });

    test('Check before export: a failed download is said above the buttons, the success line goes, and the check can run again', async ({ page }) => {
      const fake = newFake();
      fake.invoices.push({ id: 100, status: 'issued', client_id: 1, service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-14T00:00:00Z', vat_rate_bp: 0, currency: 'EUR', invoice_number: '2026-001', number: 1, issue_date: '2026-10-21T00:00:00Z', total_cents: 35000 });
      await open(page, fake);
      await page.getByRole('tab', { name: 'Invoices' }).click();
      await page.locator('[data-test="export-zip"]').click();

      const footer = page.locator('[data-test="download-error"]');
      await expect(footer).toHaveText('The export was refused or did not arrive. Run the check again.');
      await expectInView(footer);
      await expect(page.locator('[data-test="validation-ok"]')).toHaveText('The data passes every check.');
      const recheck = page.locator('[data-test="validation-recheck"]');
      await expect(recheck).toBeFocused();

      const checks = () => fake.requests.filter((r) => r.path === '/invoicing/validation').length;
      const before = checks();
      await recheck.click();
      await expect.poll(checks).toBe(before + 1);
    });

    test('Transactions: a refused Create invoice line goes when ze changes the selection', async ({ page }) => {
      const fake = newFake();
      fake.createFailure = { status: 409, body: { error: { code: 'conflict', message: 'A payment is already on an invoice.' } } };
      await open(page, fake);
      await page.getByRole('checkbox', { name: 'Select TX1' }).check();
      await page.getByRole('checkbox', { name: 'Select TX2' }).check();
      await page.locator('[data-test="create-invoice"]').click();
      const line = page.locator('[data-test="create-error"]:visible');
      await expect(line).toHaveText('A payment is already on an invoice.');
      await page.getByRole('checkbox', { name: 'Select TX2' }).uncheck();
      await expect(page.locator('[data-test="create-error"]')).toHaveCount(0);
    });
  });
}
