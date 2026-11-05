import { test, expect, type Page, type Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The issuer's logo in the invoicing Profile editor (system_3 #9858-B1, server
 *  #9859). The logo is staged and sent by the dialog's Save, like every other
 *  field, so Cancel discards it (design ack c60880). Against an in-memory fake
 *  of /api/invoicing/*. As in invoicing.spec.ts, a catch-all
 *  /api/ → 404 is registered first so no call reaches a live server. */

type Json = Record<string, any>;

interface Fake {
  hasLogo: boolean;
  logo: Buffer | null;
  refuseUpload?: string;
  profilePuts: number;
  lastPut?: Record<string, any>;
  storedPhone?: string;
  requests: Array<{ method: string; path: string; body: Buffer | null; contentType: string }>;
}

// A real PNG (correct CRCs and zlib stream) of w×h opaque black pixels.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function blackPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h); // filter byte 0 + black pixels
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const profile = {
  full_name: 'Flower Example',
  address: 'Beispielstraße 1\n10117 Berlin',
  steuernummer: '12/345/67890',
  email: '',
  is_kleinunternehmer: true,
  invoice_number_prefix: '2026',
  next_invoice_number: 1,
};

async function mockInvoicing(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postDataBuffer(), contentType: req.headers()['content-type'] || '' });

    if (path === '/invoicing/profile' && method === 'GET') {
      return json(route, 200, { profile: { ...profile, phone: fake.storedPhone || '' }, saved: true, has_logo: fake.hasLogo });
    }
    if (path === '/invoicing/profile' && method === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      // The server's phone rule (aspirant-server #9992): letters are refused.
      if (/[a-z]/i.test(body.phone || '')) {
        return json(route, 400, { error: { code: 'invalid_phone', message: 'phone may hold digits, spaces and + - ( ) / . only, at most 40 characters' } });
      }
      fake.lastPut = body;
      if (body.invoice_number_prefix === 'bad/prefix') {
        return json(route, 400, { error: { code: 'bad_request', message: 'invoice_number_prefix must be 1-20 letters, digits or hyphens' } });
      }
      fake.profilePuts += 1;
      return json(route, 200, { profile: body, saved: true });
    }
    if (path === '/invoicing/profile/logo' && method === 'GET') {
      if (!fake.logo) return json(route, 404, { error: { code: 'not_found', message: 'No logo is set' } });
      return route.fulfill({ status: 200, contentType: 'image/png', body: fake.logo });
    }
    if (path === '/invoicing/profile/logo' && method === 'PUT') {
      if (fake.refuseUpload) return json(route, 400, { error: { code: 'bad_request', message: fake.refuseUpload } });
      fake.logo = blackPng(60, 30);
      fake.hasLogo = true;
      return json(route, 200, { logo: { sha256: 'x', width: 60, height: 30 }, saved: true });
    }
    if (path === '/invoicing/profile/logo' && method === 'DELETE') {
      fake.logo = null;
      fake.hasLogo = false;
      return json(route, 200, { deleted: true });
    }
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
  await page.locator('[data-test="profile-edit"]').click();
  await expect(page.locator('[data-test="profile-form"]')).toBeVisible();
}

const logoRequests = (fake: Fake, method: string) =>
  fake.requests.filter((r) => r.path === '/invoicing/profile/logo' && r.method === method);
const requestOrder = (fake: Fake) =>
  fake.requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`);

const newFake = (over: Partial<Fake> = {}): Fake => ({ hasLogo: false, logo: null, requests: [], profilePuts: 0, ...over });

// The preview is decoded, not just present: an <img> with a blob URL that
// failed to load would still be "visible".
async function expectPreview(page: Page, naturalWidth: number): Promise<void> {
  const img = page.locator('[data-test="profile-logo-preview"]');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(naturalWidth);
}

const chooseLogo = (page: Page, buffer: Buffer, name = 'Logo novo.png') =>
  page.locator('[data-test="profile-logo-input"]').setInputFiles({ name, mimeType: 'image/png', buffer });
const save = (page: Page) => page.locator('[data-test="profile-save"]').click();
const form = (page: Page) => page.locator('[data-test="profile-form"]');

test.describe('#9858 Invoices: the issuer logo in the profile editor', () => {
  test('with no logo the editor offers an upload and fetches nothing', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    await expect(page.locator('[data-test="profile-logo-none"]')).toHaveText('No logo');
    await expect(page.locator('[data-test="profile-logo-upload"]')).toHaveText('Upload logo');
    await expect(page.locator('[data-test="profile-logo-remove"]')).toHaveCount(0);
    expect(logoRequests(fake, 'GET')).toHaveLength(0);
  });

  test('a chosen file is previewed at once and sent by Save, before the profile', async ({ page, browserName }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    const file = blackPng(400, 200);
    await chooseLogo(page, file);
    await expectPreview(page, 400);
    await expect(page.locator('[data-test="profile-logo-upload"]')).toHaveText('Replace logo');
    await expect(page.locator('[data-test="profile-logo-remove"]')).toBeVisible();
    expect(logoRequests(fake, 'PUT'), 'nothing is sent before Save').toHaveLength(0);

    await save(page);
    await expect(form(page)).toBeHidden();
    expect(requestOrder(fake)).toEqual(['PUT /invoicing/profile/logo', 'PUT /invoicing/profile']);
    const [put] = logoRequests(fake, 'PUT');
    expect(put.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(put.body!.toString('latin1')).toContain('name="logo"; filename="Logo novo.png"');
    // WebKit's request interception does not carry a multipart file's bytes,
    // so the payload itself is checked where the browser exposes it.
    if (browserName === 'chromium') expect(put.body!.includes(file)).toBe(true);

    // Reopened, the tile shows what the server holds: its normalized PNG.
    await page.locator('[data-test="profile-edit"]').click();
    await expectPreview(page, 60);
  });

  test('Cancel discards a chosen file', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    await chooseLogo(page, blackPng(400, 200));
    await expectPreview(page, 400);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(form(page)).toBeHidden();
    expect(requestOrder(fake)).toEqual([]);

    await page.locator('[data-test="profile-edit"]').click();
    await expect(page.locator('[data-test="profile-logo-none"]')).toBeVisible();
  });

  test('a set logo is previewed on open, and Remove deletes it on Save', async ({ page }) => {
    const fake = newFake({ hasLogo: true, logo: blackPng(60, 30) });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    await expectPreview(page, 60);
    await page.locator('[data-test="profile-logo-remove"]').click();
    await expect(page.locator('[data-test="profile-logo-none"]')).toBeVisible();
    await expect(page.locator('[data-test="profile-logo-upload"]')).toHaveText('Upload logo');
    expect(logoRequests(fake, 'DELETE'), 'nothing is sent before Save').toHaveLength(0);

    await save(page);
    await expect(form(page)).toBeHidden();
    expect(requestOrder(fake)).toEqual(['DELETE /invoicing/profile/logo', 'PUT /invoicing/profile']);

    // The page's own state follows: reopening fetches no logo that is gone.
    const gets = logoRequests(fake, 'GET').length;
    await page.locator('[data-test="profile-edit"]').click();
    await expect(page.locator('[data-test="profile-logo-none"]')).toBeVisible();
    expect(logoRequests(fake, 'GET')).toHaveLength(gets);
  });

  test("a refused logo saves nothing and keeps the dialog as it was", async ({ page }) => {
    const fake = newFake({ refuseUpload: 'the logo must be a PNG or JPEG image' });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    await form(page).getByLabel('Steuernummer (Tax number)').fill('98/765/43210');
    await chooseLogo(page, Buffer.from('GIF89a not a png'), 'logo.png');
    await save(page);
    await expect(page.locator('[data-test="profile-logo-error"]')).toHaveText('the logo must be a PNG or JPEG image');
    await expect(form(page)).toBeVisible();
    await expect(form(page).getByLabel('Steuernummer (Tax number)')).toHaveValue('98/765/43210');
    expect(fake.profilePuts).toBe(0);
  });

  test('a saved logo with a refused profile is reported as a partial save', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);

    await chooseLogo(page, blackPng(400, 200));
    await form(page).getByLabel('Invoice number prefix').fill('bad/prefix');
    await save(page);
    await expect(page.locator('[data-test="profile-error"]')).toHaveText(
      'The logo was saved; the profile was not: invoice_number_prefix must be 1-20 letters, digits or hyphens',
    );
    await expect(form(page)).toBeVisible();

    // Retrying sends only the profile: the logo is already saved.
    await form(page).getByLabel('Invoice number prefix').fill('2026');
    await save(page);
    await expect(form(page)).toBeHidden();
    expect(logoRequests(fake, 'PUT')).toHaveLength(1);
    expect(fake.profilePuts).toBe(1);
  });
});

// system_3 #9993 (operator c61727): an optional phone, printed under the email
// on new invoices only when set. The server is the only gate on its characters.
test.describe('#9993 Invoices: the issuer phone in the profile editor', () => {
  test('a phone is offered after Email, says when it prints, and is saved with the profile', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);
    const phone = form(page).getByLabel('Phone');
    await expect(phone).toHaveAttribute('type', 'tel');
    await expect(form(page)).toContainText('Printed under your email on new invoices. Leave it empty to leave it off.');
    await phone.fill('+49 30 1234567');
    await save(page);
    await expect(form(page)).toBeHidden();
    expect(fake.lastPut?.phone).toBe('+49 30 1234567');
  });

  test('a stored phone loads into the field', async ({ page }) => {
    const fake = newFake({ storedPhone: '+49 171 5550123' });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);
    await expect(form(page).getByLabel('Phone')).toHaveValue('+49 171 5550123');
  });

  // design_agent on #9993: the refusal shows on the Phone field itself, in
  // place of its hint, the field takes focus, and her text is kept.
  test('a refused phone says why on the field, takes focus and keeps her text', async ({ page }) => {
    const fake = newFake();
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);
    const phone = form(page).getByLabel('Phone');
    await phone.fill('call me');
    await save(page);
    const field = page.locator('[data-test="profile-form"] .field').filter({ has: page.locator('[data-test="profile-phone"]') });
    await expect(field).toContainText('Use digits, spaces and + - ( ) / . only, at most 40 characters.');
    await expect(field).not.toContainText('Printed under your email on new invoices.');
    await expect(phone).toBeFocused();
    await expect(phone).toHaveValue('call me');
    await expect(page.locator('[data-test="profile-error"]')).toHaveCount(0);
    await expect(form(page)).toBeVisible();
    expect(fake.profilePuts).toBe(0);
    // Editing the number clears the refusal.
    await phone.fill('+49 30 1234567');
    await expect(field).toContainText('Printed under your email on new invoices.');
  });

  test('an empty phone is sent empty, so no Tel. line prints', async ({ page }) => {
    const fake = newFake({ storedPhone: '+49 171 5550123' });
    await mockInvoicing(page, fake);
    await seedTrustedSessionAs(page, 'vinoly');
    await openEditor(page);
    await form(page).getByLabel('Phone').fill('');
    await save(page);
    await expect(form(page)).toBeHidden();
    expect(fake.lastPut?.phone).toBe('');
  });
});
