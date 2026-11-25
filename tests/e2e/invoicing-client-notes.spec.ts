import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, Clients tab (system_3 #9987, the client half of #9962):
 *  Flower's notes on a client. Entered in the Add/Edit dialog, saved with the
 *  client, shown as one muted ellipsis-cut line in the list. Built to
 *  design_agent's Design ack c61704 on #9987. Catch-all /api/ → 404 first;
 *  every invoicing call the page makes is stubbed below. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const LONG = 'Prefers invoices by post, never by email. Ask about the spring exhibition catalogue before the next order, and mention the framing discount.';

interface Fake {
  clients: Json[];
  requests: { method: string; path: string; body: string }[];
}

const newFake = (): Fake => ({
  clients: [
    { id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n20095 Hamburg', email: 'info@galerie.test', paypal_email: '', notes: LONG },
    { id: 2, name: 'Anna Example', address: 'Weg 1', email: '', paypal_email: '', notes: 'Short.' },
    { id: 3, name: 'Bert Example', address: 'Weg 3', email: '', paypal_email: '', notes: '' },
  ],
  requests: [],
});

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    const body = JSON.parse(req.postData() || '{}');
    // The server's own rule (aspirant-server b47fe1c): trimmed, at most 5000.
    if ((path === '/invoicing/clients' && method === 'POST') || (/^\/invoicing\/clients\/\d+$/.test(path) && method === 'PUT')) {
      const notes = String(body.notes ?? '').trim();
      if ([...notes].length > 5000) return json(route, 400, { error: { code: 'too_long', field: 'notes', limit: 5000, message: 'notes: must be at most 5000 characters' } });
      if (method === 'POST') {
        const client = { id: 100 + fake.clients.length, ...body, notes };
        fake.clients.push(client);
        return json(route, 201, { client });
      }
      const id = Number(path.split('/').pop());
      const i = fake.clients.findIndex((c) => c.id === id);
      fake.clients[i] = { ...fake.clients[i], ...body, notes };
      return json(route, 200, { client: fake.clients[i] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Clients' }).click();
  await expect(page.locator('[data-test="client-row"]')).toHaveCount(fake.clients.length);
  await openAllLetters(page);
}

// The client book folds by first letter (§3.145, system_3 #10817). These tests
// are about rows, not folding, so every letter is opened.
async function openAllLetters(page: Page): Promise<void> {
  const groups = page.locator('[data-test="client-group"]');
  // A book with no clients shows the empty state and no groups.
  await expect(page.locator('[data-test="client-group"], [data-test="client-list"], [data-test="clients-empty"]').first()).toBeAttached();
  for (const g of await groups.all()) {
    if (!(await g.evaluate((el) => (el as HTMLDetailsElement).open))) await g.locator('[data-test="client-group-summary"]').click();
  }
}

const row = (page: Page, name: string) => page.locator('[data-test="client-row"]', { hasText: name });
const form = (page: Page) => page.locator('[data-test="client-form"]');
const notesField = (page: Page) => form(page).getByLabel('Notes');

// Open a client for editing the way the page offers it: the row's Edit on
// desktop; below 640px a tap on the card, which has no Edit button
// (§3.159 Decision 3, system_3 #11501).
async function openClientEdit(page: Page, id: number | string): Promise<void> {
  const row = page.locator(`[data-test="client-row"][data-client-id="${id}"]`);
  await expect(row).toBeVisible();
  const button = row.locator(`[data-test="client-edit-${id}"]`);
  if (await button.count()) await button.click();
  else await row.locator('strong').first().click();
}

test.describe('#9987 Clients — notes', () => {
  test('notes are saved with a new client, line breaks and all, and read back exactly', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="client-add"]').click();
    await expect(form(page)).toContainText('Never printed on an invoice or included in an export.');
    await form(page).getByLabel('Name').fill('Clara Example');
    await notesField(page).fill('Call before 10.\nPays by transfer.');
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    const post = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/clients').pop()!;
    expect(JSON.parse(post.body)).toMatchObject({ name: 'Clara Example', notes: 'Call before 10.\nPays by transfer.' });
    await expect(row(page, 'Clara Example').locator('[data-test="client-notes"]')).toBeVisible();

    const clara = fake.clients.find((c) => c.name === 'Clara Example')!;
    await openClientEdit(page, clara.id);
    await expect(notesField(page)).toHaveValue('Call before 10.\nPays by transfer.');
  });

  test('an edit to the notes is saved with PUT; Cancel discards one', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 2);
    await expect(notesField(page)).toHaveValue('Short.');
    await notesField(page).fill('Changed, then cancelled.');
    // An edit is unsent, so Cancel asks first (system_3 #11669); Discard
    // changes closes without a write.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(form(page)).toBeHidden();
    expect(fake.requests.some((r) => r.method === 'PUT')).toBe(false);
    await openClientEdit(page, 2);
    await expect(notesField(page)).toHaveValue('Short.');

    await notesField(page).fill('Now kept.');
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    const put = fake.requests.filter((r) => r.method === 'PUT' && r.path === '/invoicing/clients/2').pop()!;
    expect(JSON.parse(put.body)).toMatchObject({ name: 'Anna Example', notes: 'Now kept.' });
    await expect(row(page, 'Anna Example').locator('[data-test="client-notes"]')).toHaveText('Now kept.');
  });

  test('more than 5000 characters shows the refusal at the notes and keeps the text in the field', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 3);
    const tooLong = 'x'.repeat(5001);
    await notesField(page).fill(tooLong);
    // No maxlength: the field holds all 5001 characters.
    await expect(notesField(page)).toHaveValue(tooLong);
    await page.locator('[data-test="client-save"]').click();
    // At the field, in the client's words (system_3 #12300).
    await expect(form(page).locator('.field').filter({ has: page.getByLabel('Notes', { exact: true }) })).toContainText('Keep the notes to 5,000 characters at most.');
    await expect(page.locator('[data-test="client-error"]')).toHaveCount(0);
    await expect(form(page)).toBeVisible();
    await expect(notesField(page)).toHaveValue(tooLong);
  });

  test('in the list a long note is one line cut with an ellipsis, and no notes shows nothing', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const long = row(page, 'Galerie Nord').locator('[data-test="client-notes"]');
    const short = row(page, 'Anna Example').locator('[data-test="client-notes"]');
    await expect(long).toBeVisible();
    await expect(short).toHaveText('Short.');
    await expect(row(page, 'Bert Example').locator('[data-test="client-notes"]')).toHaveCount(0);
    const m = await long.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { h: el.getBoundingClientRect().height, cut: el.scrollWidth > el.clientWidth, overflow: cs.textOverflow, ws: cs.whiteSpace };
    });
    const oneLine = await short.evaluate((el) => el.getBoundingClientRect().height);
    // One line box: the long note is exactly as tall as a one-word note.
    expect(m.h).toBeCloseTo(oneLine, 0);
    expect(m.cut).toBe(true);
    expect(m.overflow).toBe('ellipsis');
    expect(m.ws).toBe('nowrap');
  });
});
