import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #12264, review points 2-5): "Add client", and an
 *  edit that renames, ask before a second client of one name. The server's
 *  409 `client_exists` names the namesake; the Name field says so, with the
 *  door "Open" to that client, and the primary reads "Add a second …". Its
 *  press follows #12313's rule: not within 600 ms of the question, not with
 *  the key that raised it still down, never Enter in a field. A refused name
 *  or address prints the server's sentence at its field (#12298). The fake
 *  applies aspirant-server's rule (§3.142 Decision 4's "the same": case,
 *  accents, `. , - '` and spacing aside). Every name is invented; a
 *  catch-all /api/ → 404 is registered FIRST. */

type Json = Record<string, any>;

const sameName = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,\-'’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

const client = (id: number, name: string): Json => ({
  id, name, address: 'Erfundene Str. 1', email: '', paypal_email: '', iban: '', notes: '', phone: '', instagram_url: '', telegram_url: '',
  created_at: '2026-11-01T08:00:00Z', updated_at: '2026-11-01T08:00:00Z',
});

interface Fake {
  clients: Json[];
  requests: { method: string; path: string; body: Json }[];
}

const newFake = (): Fake => ({ clients: [client(1, 'Mara Esempio'), client(2, 'Luca Beispiel')], requests: [] });

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()!) : {};
    fake.requests.push({ method, path, body });
    if (path === '/invoicing/profile' && method === 'GET') {
      return json(route, 200, { saved: true, has_logo: false, profile: { full_name: 'F', address: 'A', steuernummer: '1', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    }
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: fake.clients });
    const put = /^\/invoicing\/clients\/(\d+)$/.exec(path);
    if ((path === '/invoicing/clients' && method === 'POST') || (put && method === 'PUT')) {
      const id = put ? Number(put[1]) : 0;
      const before = fake.clients.find((c) => c.id === id);
      const name = String(body.name || '').trim();
      const address = String(body.address || '');
      if (address.split('\n').length > 10 && (!before || address !== before.address)) {
        return json(route, 400, { error: { code: 'too_long', field: 'address', message: 'The address is at most 10 lines.', limit: 200, lines: 10 } });
      }
      if (!body.confirm_second_client && (!before || name !== before.name)) {
        const other = fake.clients.find((c) => c.id !== id && sameName(c.name) === sameName(name));
        if (other) return json(route, 409, { error: { code: 'client_exists', message: `${other.name} is already in your client book` }, client: other });
      }
      const { confirm_second_client: _, ...stored } = body;
      if (!before) {
        const created = { ...client(100 + fake.clients.length, name), ...stored, name };
        fake.clients.push(created);
        return json(route, 201, { client: created });
      }
      Object.assign(before, stored, { name });
      return json(route, 200, { client: before });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Clients' }).click();
  await expect(page.locator('[data-test="client-row"]').first()).toBeAttached();
}

const form = (page: Page) => page.locator('[data-test="client-form"]');
const nameInput = (page: Page) => form(page).locator('[data-test="client-name-input"]');
const save = (page: Page) => page.locator('[data-test="client-save"]');
const openDoor = (page: Page) => page.locator('[data-test="client-name-open"]');
const writes = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET');
const ASKED = 'Mara Esempio is already in your client book.';

async function addNamed(page: Page, name: string): Promise<void> {
  await page.locator('[data-test="client-add"]').click();
  await nameInput(page).fill(name);
}

async function openClientEdit(page: Page, id: number): Promise<void> {
  const row = page.locator(`[data-test="client-row"][data-client-id="${id}"]`);
  const button = row.locator(`[data-test="client-edit-${id}"]`);
  if (await button.isVisible()) await button.click();
  else await row.locator('strong').first().click();
  await expect(form(page)).toBeVisible();
}

test.describe('#12264 a second client of one name is asked about', () => {
  test('Save with a namesake stores nothing and asks at the Name field, with its door', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, '  MÀRA  esempio ');
    await save(page).click();
    await expect(form(page)).toContainText(ASKED);
    await expect(nameInput(page)).toHaveAttribute('aria-describedby', /.+/);
    const described = await nameInput(page).getAttribute('aria-describedby');
    await expect(page.locator(`[id="${described}"]`)).toHaveText(ASKED);
    await expect(save(page)).toHaveText('Add a second MÀRA  esempio');
    await expect(openDoor(page)).toHaveText('Open');
    await expect(openDoor(page)).toHaveAccessibleName('Open Mara Esempio');
    await expect(nameInput(page)).toBeFocused();
    expect(writes(fake)).toHaveLength(1);
    expect(fake.clients).toHaveLength(2);
  });

  test('the primary, pressed after the wait, adds the second client', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Mara Esempio');
    await save(page).click();
    await expect(save(page)).toHaveText('Add a second Mara Esempio');
    await page.waitForTimeout(700);
    await save(page).click();
    await expect(form(page)).toBeHidden();
    const posts = writes(fake).map((r) => r.body.confirm_second_client);
    expect(posts).toEqual([undefined, true]);
    expect(fake.clients.filter((c) => c.name === 'Mara Esempio')).toHaveLength(2);
  });

  test('a double-click on Save never confirms', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Mara Esempio');
    await save(page).dblclick();
    await expect(save(page)).toHaveText('Add a second Mara Esempio');
    await page.waitForTimeout(300);
    expect(writes(fake).every((r) => !r.body.confirm_second_client)).toBe(true);
    expect(fake.clients).toHaveLength(2);
    await page.waitForTimeout(500);
    await save(page).click();
    await expect(form(page)).toBeHidden();
    expect(fake.clients).toHaveLength(3);
  });

  test('a held key never confirms, and Enter in a field does not either', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Mara Esempio');
    await save(page).focus();
    await page.keyboard.down('Enter');
    await expect(save(page)).toHaveText('Add a second Mara Esempio');
    await page.waitForTimeout(700);
    await save(page).click();
    await expect(save(page)).toHaveText('Add a second Mara Esempio');
    await page.keyboard.up('Enter');
    await nameInput(page).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(writes(fake).every((r) => !r.body.confirm_second_client)).toBe(true);
    expect(fake.clients).toHaveLength(2);
    await save(page).click();
    await expect(form(page)).toBeHidden();
    expect(writes(fake).pop()!.body.confirm_second_client).toBe(true);
  });

  test('a change to the form takes the question back', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Mara Esempio');
    await save(page).click();
    await expect(form(page)).toContainText(ASKED);
    await nameInput(page).fill('Mara Esempio Rossi');
    await expect(form(page)).not.toContainText(ASKED);
    await expect(openDoor(page)).toHaveCount(0);
    await expect(save(page)).toHaveText('Save');
    await save(page).click();
    await expect(form(page)).toBeHidden();
    expect(writes(fake).pop()!.body.confirm_second_client).toBeUndefined();
  });

  test('"Open" asks first, then shows the namesake; "Keep editing" stays', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Mara Esempio');
    await form(page).getByLabel('Postal address').fill('Neue Str. 2');
    await save(page).click();
    await openDoor(page).click();
    await expect(page.locator('[data-test="unsent-ask"]')).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(form(page)).toContainText(ASKED);
    await openDoor(page).click();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(page.getByRole('dialog', { name: 'Edit client' })).toBeVisible();
    await expect(nameInput(page)).toHaveValue('Mara Esempio');
    await expect(form(page).getByLabel('Postal address')).toHaveValue('Erfundene Str. 1');
    await expect(form(page)).not.toContainText(ASKED);
    expect(writes(fake)).toHaveLength(1);
  });

  test('an edit that renames onto a namesake asks; one that keeps its name does not', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openClientEdit(page, 2);
    await nameInput(page).fill('mara esempio');
    await save(page).click();
    await expect(form(page)).toContainText(ASKED);
    await expect(save(page)).toHaveText('Save as a second mara esempio');
    await page.locator('[data-test="client-cancel"]').click();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(form(page)).toBeHidden();

    await openClientEdit(page, 1);
    await form(page).getByLabel('Notes').fill('pays late');
    await save(page).click();
    await expect(form(page)).toBeHidden();
    expect(writes(fake).pop()!.body).toMatchObject({ name: 'Mara Esempio', notes: 'pays late' });
  });

  test('a refused address prints at its field; an empty name at the Name field', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await addNamed(page, 'Ada Muster');
    const address = form(page).getByLabel('Postal address');
    await address.fill(Array.from({ length: 11 }, (_, i) => `Zeile ${i + 1}`).join('\n'));
    await save(page).click();
    const field = form(page).locator('[data-test="client-address-input"]');
    const described = await field.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${described}"]`)).toHaveText('Keep the address to 10 lines of at most 200 characters each.');
    await expect(field).toBeFocused();
    await expect(page.locator('[data-test="client-error"]')).toHaveCount(0);
    await address.fill('Weg 1');
    await expect(form(page)).not.toContainText('Keep the address to 10 lines');

    await nameInput(page).fill('  ');
    await save(page).click();
    await expect(nameInput(page)).toBeFocused();
    const nameMsg = await nameInput(page).getAttribute('aria-describedby');
    await expect(page.locator(`[id="${nameMsg}"]`)).toHaveText('A client needs a name.');
    expect(fake.clients).toHaveLength(2);
  });

  // A long name of words, and one of a single 200-character word: the
  // question, its door and the primary's label stay inside the screen, and
  // the page does not scroll sideways.
  const WORDS = ('Mara Esempio ' + 'Rossi Beispiel '.repeat(14)).slice(0, 200).trim();
  const ONE_WORD = 'M' + 'a'.repeat(199);
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    for (const long of [WORDS, ONE_WORD]) {
      test(`at ${vp.width} a ${long === WORDS ? 'long' : 'one-word'} name wraps in the form, no sideways scroll`, async ({ page }) => {
        await page.setViewportSize(vp);
        const fake = newFake();
        fake.clients.push(client(3, long));
        await open(page, fake);
        await addNamed(page, long);
        await save(page).click();
        await expect(save(page)).toHaveText(`Add a second ${long}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        const described = await nameInput(page).getAttribute('aria-describedby');
        for (const el of [save(page), save(page).locator('.btn__label'), openDoor(page), page.locator(`[id="${described}"]`)]) {
          const b = (await el.boundingBox())!;
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
        }
        await expect(openDoor(page)).toBeInViewport();
      });
    }
  }
});
