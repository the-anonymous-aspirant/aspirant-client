import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #9928, operator c61358): "What it was for" is one
 *  field that suggests categories (Tattoo, Tattoo (small), Tattoo (big), plus
 *  her own) and still accepts free text. Her categories live in this
 *  browser's localStorage. Catch-all /api/ → 404 is registered first. */

type Json = Record<string, any>;
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Fake { posts: Array<{ path: string; body: Json }> }

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (method === 'POST') fake.posts.push({ path, body: JSON.parse(req.postData() || '{}') });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2' }] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/payments/manual') return json(route, 201, { payment: { id: 41, entry: 'manual', source: 'manual', category: 'paid_work', client_id: 1, gross_cents: 9000, currency: 'EUR' } });
    if (path === '/invoicing/invoices' && method === 'POST') return json(route, 201, { invoice: { id: 300, status: 'draft' }, line_items: [], payments: [], warnings: [] });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/invoices/300') {
      return json(route, 200, { invoice: { id: 300, status: 'draft', client_id: 1, currency: 'EUR', service_date_from: '2026-07-14T00:00:00Z' }, client_name: 'Galerie Nord', line_items: [{ id: 1, position: 1, description: 'Tattoo (small)', quantity_milli: 1000, unit_price_cents: 9000, line_total_cents: 9000 }], payments: [], warnings: [] });
    }
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function openDialog(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('[data-test="manual-new"]').click();
  await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
}

const note = (page: Page) => page.locator('[data-test="manual-note"]');
// The suggestions a field shows right now (empty while its list is closed).
async function shown(page: Page, field: ReturnType<Page['locator']>): Promise<string[]> {
  if ((await field.getAttribute('aria-expanded')) !== 'true') return [];
  const id = await field.getAttribute('aria-controls');
  return page.locator(`#${id} [role="option"]`).allInnerTexts();
}
const DEFAULTS = ['Tattoo', 'Tattoo (small)', 'Tattoo (big)'];

test.describe('#9928 Invoices app — "What it was for" suggests categories and takes free text', () => {
  test('a click into the empty field lists every entry; typing narrows it, and no match closes it', async ({ page }) => {
    await openDialog(page, { posts: [] });
    const field = note(page);
    await expect(field).toHaveAttribute('role', 'combobox');
    await expect(field).toHaveAttribute('placeholder', 'Choose or type, e.g. Tattoo');
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await field.click();
    await expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(await shown(page, field)).toEqual(DEFAULTS);
    await field.fill('sm');
    expect(await shown(page, field)).toEqual(['Tattoo (small)']);
    // A list whose only entry is already in the field adds nothing: closed.
    await field.fill('Tattoo (small)');
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await field.fill('Wandbild');
    await expect(field).toHaveAttribute('aria-expanded', 'false');
  });

  test('picking by click or by keyboard fills the field exactly; Enter does not submit the dialog; Escape keeps the text', async ({ page }) => {
    const fake: Fake = { posts: [] };
    await openDialog(page, fake);
    const field = note(page);
    await field.click();
    await page.getByRole('option', { name: 'Tattoo (big)' }).click();
    await expect(field).toHaveValue('Tattoo (big)');
    await expect(field).toHaveAttribute('aria-expanded', 'false');

    await field.fill('');
    await field.press('ArrowDown');
    await field.press('ArrowDown');
    await expect(field).toHaveAttribute('aria-activedescendant', /-1$/);
    await field.press('Enter');
    await expect(field).toHaveValue('Tattoo (small)');
    expect(fake.posts).toHaveLength(0);
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();

    await field.fill('tatt');
    await expect(field).toHaveAttribute('aria-expanded', 'true');
    await field.press('Escape');
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await expect(field).toHaveValue('tatt');
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
  });

  test('a default, or any spelling of one, offers no save or remove; a new text offers Save', async ({ page }) => {
    await openDialog(page, { posts: [] });
    await note(page).fill('Tattoo (big)');
    await expect(page.locator('[data-test="line-desc-save"]')).toHaveCount(0);
    await expect(page.locator('[data-test="line-desc-remove"]')).toHaveCount(0);
    await note(page).fill('  tattoo (Small) ');
    await expect(page.locator('[data-test="line-desc-save"]')).toHaveCount(0);
    await note(page).fill('Cover-up');
    await expect(page.locator('[data-test="line-desc-save"]')).toHaveText('Save as a category on this device');
  });

  test('her own category is saved, survives a reload, and can be removed again', async ({ page }) => {
    await openDialog(page, { posts: [] });
    const field = note(page);
    await field.fill('Cover-up');
    await page.locator('[data-test="line-desc-save"]').click();
    await expect(page.locator('[data-test="line-desc-remove"]')).toHaveText('Remove from this device’s categories');
    await field.fill('');
    await field.click();
    expect(await shown(page, field)).toEqual([...DEFAULTS, 'Cover-up']);

    await page.reload();
    await dismissMobileSidebarIfPresent(page);
    await page.locator('[data-test="manual-new"]').click();
    await note(page).click();
    expect(await shown(page, note(page))).toEqual([...DEFAULTS, 'Cover-up']);

    await note(page).fill('Cover-up');
    await page.locator('[data-test="line-desc-remove"]').click();
    await note(page).fill('');
    await note(page).click();
    expect(await shown(page, note(page))).toEqual(DEFAULTS);
  });

  test('her categories follow the defaults alphabetically, not in save order', async ({ page }) => {
    await openDialog(page, { posts: [] });
    for (const c of ['Walk-in', 'Cover-up', 'Nachstechen']) {
      await note(page).fill(c);
      await page.locator('[data-test="line-desc-save"]').click();
    }
    await note(page).fill('');
    await note(page).click();
    expect(await shown(page, note(page))).toEqual([...DEFAULTS, 'Cover-up', 'Nachstechen', 'Walk-in']);
  });

  test('free text is sent exactly as typed, and the draft line offers the same list', async ({ page }) => {
    const fake: Fake = { posts: [] };
    await openDialog(page, fake);
    await note(page).fill('Cover-up');
    await page.locator('[data-test="line-desc-save"]').click();
    await note(page).fill('Tattoo (small), Unterarm');
    // Nothing matches, so the list is already closed (an Escape now would close the dialog).
    await expect(note(page)).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: 'Galerie Nord' }).click();
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('90');
    await page.locator('[data-test="manual-save"]').click();
    const manual = fake.posts.find((p) => p.path === '/invoicing/payments/manual');
    expect(manual?.body.note).toBe('Tattoo (small), Unterarm');

    const editor = page.locator('[data-test="invoice-editor"][data-status="draft"]');
    await expect(editor).toBeVisible();
    const line = editor.getByRole('combobox', { name: 'Description, line 1' });
    await expect(line).toHaveValue('Tattoo (small)');
    await line.fill('');
    await line.click();
    expect(await shown(page, line)).toEqual([...DEFAULTS, 'Cover-up']);
  });

  test('with browser storage blocked the field still works: defaults offered, nothing to save, no error', async ({ page }) => {
    // Refuse writes to this feature's keys only: the session seed writes
    // localStorage too, and must keep working.
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (String(key).startsWith('invoicing.')) throw new Error('blocked');
        return orig.call(this, key, value);
      };
    });
    await openDialog(page, { posts: [] });
    await note(page).click();
    expect(await shown(page, note(page))).toEqual(DEFAULTS);
    await note(page).fill('Cover-up');
    await expect(note(page)).toHaveValue('Cover-up');
    await expect(page.locator('[data-test="line-desc-save"]')).toHaveCount(0);
    await expect(page.locator('[data-test="manual-error"]')).toHaveCount(0);
  });
});
