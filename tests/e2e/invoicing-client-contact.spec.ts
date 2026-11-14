import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #10003, the client half of #9971): a client's
 *  phone and social links, zir own social links on the issuer profile, and
 *  the client's added/edited times in Berlin time. The fake applies the
 *  server's rules from aspirant-server #10002: a handle or link is stored as
 *  one canonical URL, anything else is refused with its own code.
 *  Catch-all /api/ → 404 first. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The server's normalisation (handlers/invoicing_links.go), reduced to what
// the spec feeds it.
const normalise = (kind: 'instagram' | 'telegram', raw: string): string | null => {
  const s = String(raw || '').trim();
  if (!s) return '';
  let handle = s;
  if (s.includes('/') || s.includes(':')) {
    let u: URL;
    try {
      u = new URL(s.includes('://') ? s : `https://${s}`);
    } catch {
      return null;
    }
    const hosts = kind === 'instagram' ? ['instagram.com', 'www.instagram.com'] : ['t.me', 'telegram.me'];
    if (!/^https?:$/.test(u.protocol) || !hosts.includes(u.hostname)) return null;
    // Exactly one path segment: a profile, not a post (as the server).
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length !== 1) return null;
    handle = segs[0];
  }
  handle = handle.replace(/^@/, '');
  if (kind === 'instagram') return /^[A-Za-z0-9._]{1,30}$/.test(handle) && /\w/.test(handle) ? `https://www.instagram.com/${handle.toLowerCase()}/` : null;
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(handle) ? `https://t.me/${handle}` : null;
};

const refuse = (body: Json): Json | null => {
  if (!/^[0-9+()/. -]{0,40}$/.test(String(body.phone || '').trim())) return { code: 'invalid_phone', message: 'phone may hold digits, spaces and + - ( ) / . only, at most 40 characters' };
  if (normalise('instagram', body.instagram_url) === null) return { code: 'invalid_instagram', message: 'instagram_url takes a handle (@name) or a link to a profile on instagram.com' };
  if (normalise('telegram', body.telegram_url) === null) return { code: 'invalid_telegram', message: 'telegram_url takes a handle (@name) or a link to a profile on t.me' };
  return null;
};

interface Fake {
  invoices?: Json[];
  invoicesFail?: boolean;
  invoicesDelayMs?: number;
  csvFail?: boolean;
  clients: Json[];
  profile: Json;
  requests: { method: string; path: string; body: string }[];
}

const newFake = (): Fake => ({
  clients: [
    {
      id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: 'info@galerie.test', paypal_email: '', notes: '',
      phone: '+49 30 1234567', instagram_url: 'https://www.instagram.com/galerie.nord/', telegram_url: 'https://t.me/galerie_nord',
      created_at: '2026-11-05T14:07:31Z', updated_at: '2026-11-06T00:12:05Z',
    },
    { id: 2, name: 'Anna Example', address: 'Weg 1', email: '', paypal_email: '', notes: '', phone: '', instagram_url: '', telegram_url: '', created_at: '2026-07-01T08:00:00Z', updated_at: '2026-07-01T08:00:00Z' },
  ],
  profile: { full_name: 'F', address: 'A', steuernummer: '1', email: '', phone: '', instagram_url: 'https://www.instagram.com/flower.studio/', telegram_url: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 },
  requests: [],
});

async function open(page: Page, fake: Fake, tab = 'Clients'): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile' && method === 'GET') return json(route, 200, { saved: true, profile: fake.profile, has_logo: false });
    if (path === '/invoicing/profile' && method === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      const r = refuse(body);
      if (r) return json(route, 400, { error: r });
      fake.profile = { ...body, instagram_url: normalise('instagram', body.instagram_url), telegram_url: normalise('telegram', body.telegram_url) };
      return json(route, 200, { profile: fake.profile, saved: true });
    }
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices') {
      if (fake.invoicesDelayMs) await new Promise((r) => setTimeout(r, fake.invoicesDelayMs));
      if (fake.invoicesFail) return json(route, 500, { error: { code: 'internal', message: 'boom' } });
      return json(route, 200, { invoices: fake.invoices || [] });
    }
    if (path === '/invoicing/export/clients.csv') {
      if (fake.csvFail) return json(route, 500, { error: { code: 'internal', message: 'recording the export failed' } });
      return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', headers: { 'Content-Disposition': 'attachment; filename="Kunden.csv"' }, body: '\ufeffName;Adresse\n' });
    }
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    if ((path === '/invoicing/clients' && method === 'POST') || (/^\/invoicing\/clients\/\d+$/.test(path) && method === 'PUT')) {
      const body = JSON.parse(req.postData() || '{}');
      const r = refuse(body);
      if (r) return json(route, 400, { error: r });
      const stored = { ...body, phone: String(body.phone || '').trim(), instagram_url: normalise('instagram', body.instagram_url), telegram_url: normalise('telegram', body.telegram_url), updated_at: '2026-11-06T09:30:00Z' };
      if (method === 'POST') {
        const client = { id: 100 + fake.clients.length, ...stored, created_at: '2026-11-06T09:30:00Z' };
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
  if (tab) await page.getByRole('tab', { name: tab }).click();
  if (tab === 'Clients') await openAllLetters(page);
}

// The client book folds by first letter (§3.145, system_3 #10817). These tests
// are about rows, not folding, so every letter is opened.
async function openAllLetters(page: Page): Promise<void> {
  const groups = page.locator('[data-test="client-group"]');
  // A book with no clients shows the empty state and no groups.
  await expect(page.locator('[data-test="client-group"], [data-test="clients-empty"]').first()).toBeAttached();
  for (const g of await groups.all()) {
    if (!(await g.evaluate((el) => (el as HTMLDetailsElement).open))) await g.locator('[data-test="client-group-summary"]').click();
  }
}

const row = (page: Page, name: string) => page.locator('[data-test="client-row"]', { hasText: name });
const form = (page: Page) => page.locator('[data-test="client-form"]');
const lastBody = (fake: Fake, method: string, path: RegExp) => JSON.parse(fake.requests.filter((r) => r.method === method && path.test(r.path)).pop()!.body);

test.describe('#10003 Clients — phone and social links', () => {
  test('the list shows the phone as a tel: link and each social link as the stored URL, in a new tab', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const nord = row(page, 'Galerie Nord');
    await expect(nord.locator('[data-test="client-phone"]')).toHaveAttribute('href', 'tel:+49301234567');
    const ig = nord.locator('[data-test="client-instagram"]');
    await expect(ig).toHaveText('Instagram @galerie.nord');
    await expect(ig).toHaveAttribute('href', 'https://www.instagram.com/galerie.nord/');
    await expect(ig).toHaveAttribute('target', '_blank');
    await expect(ig).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(ig).toHaveAttribute('aria-label', 'Instagram: @galerie.nord (opens in a new tab)');
    const tg = nord.locator('[data-test="client-telegram"]');
    await expect(tg).toHaveText('Telegram @galerie_nord');
    await expect(tg).toHaveAttribute('href', 'https://t.me/galerie_nord');
    // A client with none of them shows nothing extra.
    await expect(row(page, 'Anna Example').locator('[data-test="client-phone"], [data-test="client-social"]')).toHaveCount(0);
  });

  // security c62062: only the two stored shapes ever reach an href, even if a
  // row somehow holds anything else.
  test('a stored link in any other shape is not rendered as a link', async ({ page }) => {
    const fake = newFake();
    fake.clients[1] = { ...fake.clients[1], instagram_url: 'javascript:alert(1)', telegram_url: 'https://evil.example/t' };
    await open(page, fake);
    const anna = row(page, 'Anna Example');
    await expect(anna.locator('[data-test="client-social"], [data-test="client-instagram"], [data-test="client-telegram"]')).toHaveCount(0);
    expect(await page.locator('a[href^="javascript:"], a[href*="evil.example"]').count()).toBe(0);
    // The edit form still shows what is stored, so ze can correct it.
    await page.locator('[data-test="client-edit-2"]').click();
    await expect(form(page).getByLabel('Instagram', { exact: true })).toHaveValue('javascript:alert(1)');
  });

  test('phone and links are saved with a new client and come back canonical', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await page.locator('[data-test="client-add"]').click();
    await form(page).getByLabel('Name').fill('Clara Example');
    await form(page).getByLabel('Phone').fill(' +49 151 2345678 ');
    await form(page).getByLabel('Instagram').fill('@Clara.Ink');
    await form(page).getByLabel('Telegram').fill('t.me/clara_ink');
    await expect(form(page).getByRole('group', { name: 'Social media' })).toBeVisible();
    await page.locator('[data-test="client-save"]').click();
    await expect(form(page)).toBeHidden();
    expect(lastBody(fake, 'POST', /^\/invoicing\/clients$/)).toMatchObject({ name: 'Clara Example', phone: ' +49 151 2345678 ', instagram_url: '@Clara.Ink', telegram_url: 't.me/clara_ink' });
    const clara = row(page, 'Clara Example');
    await expect(clara.locator('[data-test="client-instagram"]')).toHaveAttribute('href', 'https://www.instagram.com/clara.ink/');
    await expect(clara.locator('[data-test="client-telegram"]')).toHaveAttribute('href', 'https://t.me/clara_ink');
    const id = fake.clients.find((c) => c.name === 'Clara Example')!.id;
    await page.locator(`[data-test="client-edit-${id}"]`).click();
    await expect(form(page).getByLabel('Instagram')).toHaveValue('https://www.instagram.com/clara.ink/');
  });

  for (const [field, value, code, text] of [
    ['Phone', 'call me', 'invalid_phone', 'Use digits, spaces and + - ( ) / . only, at most 40 characters.'],
    ['Instagram', 'javascript:alert(1)', 'invalid_instagram', 'Use an Instagram name (@name) or a link to an Instagram profile.'],
    ['Telegram', 'https://evil.example/x', 'invalid_telegram', 'Use a Telegram name (@name) or a t.me link.'],
  ] as const) {
    test(`a refused ${field} (${code}) shows on its own field, keeps the text and takes focus`, async ({ page }) => {
      const fake = newFake();
      await open(page, fake);
      await page.locator('[data-test="client-edit-2"]').click();
      const input = form(page).getByLabel(field);
      await input.fill(value);
      await page.locator('[data-test="client-save"]').click();
      // A `has` locator is queried inside each .field, so it is rooted at page.
      const fieldEl = form(page).locator('.field').filter({ has: page.getByLabel(field, { exact: true }) });
      await expect(fieldEl).toContainText(text);
      await expect(input).toHaveValue(value);
      await expect(input).toBeFocused();
      await expect(form(page)).toBeVisible();
      await expect(page.locator('[data-test="client-error"]')).toHaveCount(0);
      // Editing the field clears its refusal.
      await input.fill('');
      await expect(fieldEl).not.toContainText(text);
    });
  }

  test('the edit dialog says the days the client was added and updated, in zir calendar', async ({ page }) => {
    const fake = newFake();
    // Added 23:30Z on 5 Nov is 00:30 on 6 Nov in Berlin (design_agent c62046).
    fake.clients.push({ id: 3, name: 'Late Example', address: '', email: '', paypal_email: '', notes: '', created_at: '2026-11-05T23:30:00Z', updated_at: '2026-11-05T23:45:00Z' });
    await open(page, fake);
    await page.locator('[data-test="client-edit-1"]').click();
    await expect(page.locator('[data-test="client-stamp"]')).toHaveText('Added 2026-11-05 · updated 2026-11-06');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    // Updated the same day it was added: no "updated".
    await page.locator('[data-test="client-edit-2"]').click();
    await expect(page.locator('[data-test="client-stamp"]')).toHaveText('Added 2026-07-01');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('[data-test="client-edit-3"]').click();
    await expect(page.locator('[data-test="client-stamp"]')).toHaveText('Added 2026-11-06');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    // A new client has no times yet.
    await page.locator('[data-test="client-add"]').click();
    await expect(page.locator('[data-test="client-stamp"]')).toHaveCount(0);
  });
});

// design_agent c62046: the Contact links take the link ink of what they sit
// on, and meet 4.5:1 there, in both themes, in the table and on the cards.
test.describe('#10003 Contact links meet their setter', () => {
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`at ${width}px (${theme}) the phone and social links read at 4.5:1`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
        const fake = newFake();
        await open(page, fake);
        const nord = row(page, 'Galerie Nord');
        for (const id of ['client-phone', 'client-instagram', 'client-telegram']) {
          const ratio = await nord.locator(`[data-test="${id}"]`).evaluate((el) => {
            // A color-mix() link ink computes to `color(srgb r g b)` in 0..1;
            // rgb()/rgba() are 0..255.
            const rgb = (s: string) => {
              const n = (s.match(/\d*\.?\d+/g) || []).map(Number);
              if (s.startsWith('color(srgb')) return [...n.slice(0, 3).map((v) => v * 255), ...n.slice(3, 4)];
              return n.slice(0, 4);
            };
            const lum = (c: number[]) => {
              const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            let bg: number[] = [255, 255, 255];
            for (let n: Element | null = el; n; n = n.parentElement) {
              const c = rgb(getComputedStyle(n).backgroundColor);
              if (c.length === 3 || (c.length === 4 && c[3] > 0.99)) { bg = c; break; }
            }
            const fg = rgb(getComputedStyle(el).color);
            const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
            return (x + 0.05) / (y + 0.05);
          });
          expect(ratio, `${id} at ${width}px ${theme}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

test.describe('#10003 Issuer profile — zir social links', () => {
  const openProfile = async (page: Page, fake: Fake) => {
    await open(page, fake, '');
    await page.getByRole('button', { name: 'Edit profile' }).click();
  };
  const pform = (page: Page) => page.locator('[data-test="profile-form"]');

  test('a save keeps zir stored links and stores new ones canonical', async ({ page }) => {
    const fake = newFake();
    await openProfile(page, fake);
    await expect(pform(page).getByRole('group', { name: 'Social media' })).toBeVisible();
    await expect(pform(page).getByLabel('Instagram')).toHaveValue('https://www.instagram.com/flower.studio/');
    await pform(page).getByLabel('Telegram').fill('@flower_studio');
    await page.locator('[data-test="profile-save"]').click();
    await expect(pform(page)).toBeHidden();
    // The Instagram link ze did not touch goes back with the save, so the
    // server's replace keeps it (it was dropped before #10003).
    expect(lastBody(fake, 'PUT', /^\/invoicing\/profile$/)).toMatchObject({ instagram_url: 'https://www.instagram.com/flower.studio/', telegram_url: '@flower_studio' });
    expect(fake.profile.telegram_url).toBe('https://t.me/flower_studio');
  });

  test('a refused link shows on its own field', async ({ page }) => {
    const fake = newFake();
    await openProfile(page, fake);
    const ig = pform(page).getByLabel('Instagram');
    await ig.fill('https://www.instagram.com/p/abc/');
    await page.locator('[data-test="profile-save"]').click();
    await expect(pform(page).locator('.field').filter({ has: page.getByLabel('Instagram', { exact: true }) })).toContainText('Use an Instagram name (@name) or a link to an Instagram profile.');
    await expect(ig).toBeFocused();
    await expect(pform(page)).toBeVisible();
  });
});

// system_3 #10006 (operator c61586): a small statistics section on the
// client, in Edit client: invoices issued (count), what they came to, and
// the last one's date. Issued only: a cancelled invoice (its Storno
// replacement is counted) and a draft count for nothing.
test.describe("#10006 Clients — a client's figures", () => {
  const inv = (id: number, client: number, status: string, issue: string | null, cents: number) => ({
    id, client_id: client, status, issue_date: issue ? `${issue}T00:00:00Z` : null, total_cents: cents, currency: 'EUR', invoice_number: issue ? `2026-00${id}` : null,
  });

  test('counts issued invoices, sums their gross, and names the latest issue date', async ({ page }) => {
    const fake = newFake();
    fake.invoices = [
      inv(1, 1, 'issued', '2026-07-03', 35000),
      inv(2, 1, 'issued', '2026-09-21', 12000),
      inv(3, 1, 'cancelled', '2026-08-10', 50000),
      inv(4, 1, 'draft', null, 7000),
      inv(5, 2, 'issued', '2026-10-01', 9900),
    ];
    await open(page, fake);
    await page.locator('[data-test="client-edit-1"]').click();
    await expect(page.locator('[data-test="client-stats-count"]')).toHaveText('2');
    await expect(page.locator('[data-test="client-stats-total"]')).toHaveText('€470.00');
    await expect(page.locator('[data-test="client-stats-last"]')).toHaveText('2026-09-21');
    await expect(page.locator('[data-test="client-stats"]')).toContainText('Issued invoices');
  });

  test('a client whose only invoice was cancelled reads "No issued invoices."; Add client shows no figures', async ({ page }) => {
    const fake = newFake();
    fake.invoices = [inv(3, 2, 'cancelled', '2026-08-10', 50000)];
    await open(page, fake);
    await page.locator('[data-test="client-edit-2"]').click();
    await expect(page.locator('[data-test="client-stats-none"]')).toHaveText('No issued invoices.');
    await expect(page.locator('[data-test="client-stats"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('[data-test="client-add"]').click();
    await expect(page.locator('[data-test="client-stats"], [data-test="client-stats-none"]')).toHaveCount(0);
  });

  // design_agent c62125: a failure is said, not dropped; the form still saves.
  test('if the invoice list cannot be read, the block says so and the client still saves', async ({ page }) => {
    const fake = newFake();
    fake.invoicesFail = true;
    await open(page, fake);
    await page.locator('[data-test="client-edit-1"]').click();
    await expect(page.locator('[data-test="client-stats-failed"]')).toHaveText('Invoice figures could not be loaded.');
    await expect(page.locator('[data-test="client-stats"]')).toHaveCount(0);
    await page.locator('[data-test="client-form"]').getByLabel(/^Name/).fill('Galerie Nord GmbH');
    await page.locator('[data-test="client-save"]').click();
    await expect(page.locator('[data-test="client-form"]')).toBeHidden();
    expect(fake.requests.some((r) => r.method === 'PUT' && r.path === '/invoicing/clients/1')).toBe(true);
  });

  // design_agent c62125 (D15): the fields never move once the dialog is open.
  for (const width of [1440, 390]) {
    for (const [label, setup] of [
      ['figures', (f: Fake) => { f.invoices = [inv(1, 1, 'issued', '2026-07-03', 35000)]; }],
      ['no issued invoices', (f: Fake) => { f.invoices = []; }],
      ['a failed load', (f: Fake) => { f.invoicesFail = true; }],
    ] as const) {
      test(`at ${width}px Name does not move when ${label} arrive`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fake = newFake();
        setup(fake);
        fake.invoicesDelayMs = 800;
        await open(page, fake);
        await page.locator('[data-test="client-edit-1"]').click();
        const name = page.locator('[data-test="client-form"]').getByLabel(/^Name/);
        await expect(name).toBeVisible();
        const before = (await name.boundingBox())!.y;
        await expect(page.locator('.client-stats-slot')).toHaveAttribute('aria-busy', 'false', { timeout: 5000 });
        const after = (await name.boundingBox())!.y;
        expect(Math.abs(after - before), `Name moved from ${before} to ${after}`).toBeLessThanOrEqual(0.5);
      });
    }
  }
});

// system_3 #10013 (operator c61628; server #10012): the client list as a
// CSV, from the Clients tab, saying what it holds and how many first.
test.describe('#10013 Clients — the client list as a CSV', () => {
  test('the caption counts the clients and says notes are left out; the file is Kunden.csv', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const btn = page.locator('[data-test="export-clients-csv"]');
    await expect(btn).toHaveText('Client list (CSV)');
    await expect(page.locator('[data-test="export-clients-csv-scope"]')).toHaveText('2 clients, one row each. Notes are left out.');
    await expect(btn).toHaveAttribute('aria-describedby', 'clients-csv-scope');
    const dl = page.waitForEvent('download');
    await btn.click();
    expect((await dl).suggestedFilename()).toBe('Kunden.csv');
    expect(fake.requests.some((r) => r.method === 'GET' && r.path === '/invoicing/export/clients.csv')).toBe(true);
  });

  test('one client reads in the singular; none disables the button and says why', async ({ page }) => {
    const one = newFake();
    one.clients = one.clients.slice(0, 1);
    await open(page, one);
    await expect(page.locator('[data-test="export-clients-csv-scope"]')).toHaveText('1 client, one row. Notes are left out.');

    const none = newFake();
    none.clients = [];
    await open(page, none);
    await expect(page.locator('[data-test="export-clients-csv"]')).toBeDisabled();
    await expect(page.locator('[data-test="export-clients-csv-scope"]')).toHaveText('No clients yet.');
  });

  test('a failed download says why, and nothing is saved', async ({ page }) => {
    const fake = newFake();
    fake.csvFail = true;
    await open(page, fake);
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('[data-test="export-clients-csv"]').click();
    await expect(page.locator('[data-test="export-clients-csv-error"]')).toHaveText('recording the export failed');
    expect(downloaded).toBe(false);
  });
});
