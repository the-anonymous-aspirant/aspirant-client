import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #12086, the visible half of #11551): a client's
 *  IBAN, so later N26 payments from that account land on the client. The fake
 *  applies aspirant-server's rules from #12084: spaces and case are
 *  normalised away, "" clears, and a value failing the ISO 13616 mod-97 check
 *  is refused with `invalid_iban`. Every IBAN here is the published example
 *  or a variant of it; every name is invented. Catch-all /api/ → 404 first. */

type Json = Record<string, any>;

const EXAMPLE = 'DE89 3704 0044 0532 0130 00';
const EXAMPLE_STORED = 'DE89370400440532013000';
// The example with its last digit changed: the right shape, the wrong check.
const ONE_DIGIT_OFF = 'DE89 3704 0044 0532 0130 01';
// The published Maltese example, 31 characters: the longest kind the field
// shows, and wider than the field at 360px once grouped.
const LONG = 'MT84 MALT 0110 0001 2345 MTLC AST0 01S';
const LONG_STORED = 'MT84MALT011000012345MTLCAST001S';
const REFUSAL = 'Not a valid IBAN. Check each character against the original.';

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// data_models.NormaliseIBAN and ValidIBAN, reduced to what the spec feeds them.
const normaliseIban = (raw: string): string => String(raw || '').replace(/\s+/g, '').toUpperCase();
const validIban = (iban: string): boolean => {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
};

interface Fake {
  clients: Json[];
  requests: { method: string; path: string; body: string }[];
}

const newFake = (): Fake => ({
  clients: [
    { id: 1, name: 'Invented Payer One', address: 'Erfundene Str. 1', email: '', paypal_email: '', iban: EXAMPLE_STORED, notes: '', phone: '', instagram_url: '', telegram_url: '', created_at: '2026-11-01T08:00:00Z', updated_at: '2026-11-01T08:00:00Z' },
    { id: 2, name: 'Invented Payer Two', address: 'Erfundene Str. 2', email: '', paypal_email: '', iban: '', notes: '', phone: '', instagram_url: '', telegram_url: '', created_at: '2026-11-02T08:00:00Z', updated_at: '2026-11-02T08:00:00Z' },
  ],
  requests: [],
});

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile' && method === 'GET') {
      return json(route, 200, { saved: true, has_logo: false, profile: { full_name: 'F', address: 'A', steuernummer: '1', email: '', phone: '', instagram_url: '', telegram_url: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    }
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    if ((path === '/invoicing/clients' && method === 'POST') || (/^\/invoicing\/clients\/\d+$/.test(path) && method === 'PUT')) {
      const body = JSON.parse(req.postData() || '{}');
      const stored: Json = { ...body, updated_at: '2026-11-23T09:30:00Z' };
      if ('iban' in body) {
        const iban = normaliseIban(body.iban);
        if (iban !== '' && !validIban(iban)) return json(route, 400, { error: { code: 'invalid_iban', field: 'iban', message: 'iban must be a valid IBAN when given' } });
        stored.iban = iban;
      }
      if (method === 'POST') {
        const client = { id: 100 + fake.clients.length, iban: '', ...stored, created_at: '2026-11-23T09:30:00Z' };
        fake.clients.push(client);
        return json(route, 201, { client });
      }
      const id = Number(path.split('/').pop());
      const i = fake.clients.findIndex((c) => c.id === id);
      fake.clients[i] = { ...fake.clients[i], ...stored };
      return json(route, 200, { client: fake.clients[i] });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Clients' }).click();
  await openAllLetters(page);
}

async function openAllLetters(page: Page): Promise<void> {
  const groups = page.locator('[data-test="client-group"]');
  await expect(page.locator('[data-test="client-group"], [data-test="client-list"], [data-test="clients-empty"]').first()).toBeAttached();
  for (const g of await groups.all()) {
    if (!(await g.evaluate((el) => (el as HTMLDetailsElement).open))) await g.locator('[data-test="client-group-summary"]').click();
  }
}

const form = (page: Page) => page.locator('[data-test="client-form"]');
const ibanInput = (page: Page) => form(page).locator('[data-test="client-iban-input"]');
const lastBody = (fake: Fake, method: string, path: RegExp) => JSON.parse(fake.requests.filter((r) => r.method === method && path.test(r.path)).pop()!.body);

// The row's Edit on desktop; below 640px a tap on the card (§3.159 Decision 3).
async function openClientEdit(page: Page, id: number): Promise<void> {
  const row = page.locator(`[data-test="client-row"][data-client-id="${id}"]`);
  await expect(row).toBeVisible();
  const button = row.locator(`[data-test="client-edit-${id}"]`);
  if (await button.count()) await button.click();
  else await row.locator('strong').first().click();
}

test.describe('#12086 Clients: the IBAN that links imported N26 payments', () => {
  test('the field sits after PayPal email, with its hint, labelled IBAN', async ({ page }) => {
    await open(page, newFake());
    await page.locator('[data-test="client-add"]').click();
    await expect(form(page).getByLabel('IBAN', { exact: true })).toBeVisible();
    // A phone keyboard starts in capitals and does not "correct" the letters.
    await expect(ibanInput(page)).toHaveAttribute('autocapitalize', 'characters');
    await expect(ibanInput(page)).toHaveAttribute('autocorrect', 'off');
    await expect(ibanInput(page)).toHaveAttribute('spellcheck', 'false');
    await expect(ibanInput(page)).toHaveAttribute('autocomplete', 'off');
    await expect(form(page)).toContainText('Imported N26 payments from this account are linked to the client.');
    const indexOf = (label: string) =>
      form(page).getByLabel(label, { exact: true }).evaluate((el) => [...el.closest('[data-test="client-form"]')!.querySelectorAll('input')].indexOf(el as HTMLInputElement));
    expect(await indexOf('IBAN')).toBe((await indexOf('PayPal email')) + 1);
  });

  test('an IBAN saved with a new client comes back, after a reload, in groups of four', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="client-add"]').click();
    await form(page).getByLabel('Name').fill('Invented Payer Three');
    await ibanInput(page).fill(' de89 3704 0044 0532 0130 00 ');
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    expect(lastBody(fake, 'POST', /^\/invoicing\/clients$/).iban).toBe(' de89 3704 0044 0532 0130 00 ');
    const saved = fake.clients.find((c) => c.name === 'Invented Payer Three')!;
    expect(saved.iban).toBe(EXAMPLE_STORED);

    await page.reload();
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: 'Clients' }).click();
    await openAllLetters(page);
    await openClientEdit(page, saved.id);
    await expect(ibanInput(page)).toHaveValue(EXAMPLE);
  });

  test('the client row does not show the IBAN', async ({ page }) => {
    await open(page, newFake());
    const row = page.locator('[data-test="client-row"][data-client-id="1"]');
    await expect(row).toBeVisible();
    await expect(row).not.toContainText('DE89');
    await expect(row).not.toContainText('3704');
  });

  test('an edit sends the stored IBAN back unchanged, and clearing the field removes it', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 1);
    await expect(ibanInput(page)).toHaveValue(EXAMPLE);
    await form(page).getByLabel('Email', { exact: true }).fill('payer.one@example.test');
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    expect(normaliseIban(lastBody(fake, 'PUT', /^\/invoicing\/clients\/1$/).iban)).toBe(EXAMPLE_STORED);
    expect(fake.clients[0].iban).toBe(EXAMPLE_STORED);

    await openClientEdit(page, 1);
    await ibanInput(page).fill('');
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    expect(lastBody(fake, 'PUT', /^\/invoicing\/clients\/1$/).iban).toBe('');
    expect(fake.clients[0].iban).toBe('');
    await openClientEdit(page, 1);
    await expect(ibanInput(page)).toHaveValue('');
  });

  test('an IBAN that fails the check is refused on its own field, which takes the focus, and typing clears it', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 2);
    await ibanInput(page).fill(ONE_DIGIT_OFF);
    await page.locator('[data-test="client-save"]').click();
    const refusal = REFUSAL;
    await expect(form(page)).toContainText(refusal);
    await expect(ibanInput(page)).toBeFocused();
    await expect(ibanInput(page)).toHaveValue(ONE_DIGIT_OFF);
    expect(fake.clients[1].iban).toBe('');
    await ibanInput(page).fill(EXAMPLE);
    await expect(form(page)).not.toContainText(refusal);
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    expect(fake.clients[1].iban).toBe(EXAMPLE_STORED);
  });

  test('what ze types is kept as typed: no regrouping while typing', async ({ page }) => {
    await open(page, newFake());
    await openClientEdit(page, 2);
    await ibanInput(page).pressSequentially('de8937040044 0532013000');
    await expect(ibanInput(page)).toHaveValue('de8937040044 0532013000');
  });

  test('the stored IBAN retyped ungrouped in lower case is no edit: Esc closes without asking', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 1);
    await ibanInput(page).fill(EXAMPLE_STORED.toLowerCase());
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test="unsent-ask"]')).toHaveCount(0);
    await expect(form(page)).toBeHidden();
    expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  test('a cleared IBAN on a client that had one is unsent: Esc asks', async ({ page }) => {
    await open(page, newFake());
    await openClientEdit(page, 1);
    await ibanInput(page).fill('   ');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test="unsent-ask"]')).toBeVisible();
  });

  test('a long IBAN is stored and shown grouped; at 360px it scrolls inside its field, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const fake = newFake();
    fake.clients[1].iban = LONG_STORED;
    await open(page, fake);
    await openClientEdit(page, 2);
    await expect(ibanInput(page)).toHaveValue(LONG);
    const box = (await ibanInput(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('at 360px the field and the grouped IBAN fit without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, newFake());
    await openClientEdit(page, 1);
    await expect(ibanInput(page)).toHaveValue(EXAMPLE);
    const box = (await ibanInput(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    // The whole grouped value is visible in the input, not scrolled inside it.
    expect(await ibanInput(page).evaluate((el) => (el as HTMLInputElement).scrollWidth <= (el as HTMLInputElement).clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
