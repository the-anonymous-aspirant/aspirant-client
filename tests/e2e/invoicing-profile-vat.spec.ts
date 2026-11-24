import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #12261, ruling 3; design_agent c76335): every draft
 *  is worked out from the profile's current VAT setting, so the profile
 *  editor says how many drafts a change of the box reworks, while the box
 *  differs from the saved setting. The count is the profile answer's
 *  `draft_count`, read each time the editor opens, from an in-memory fake of
 *  aspirant-server; a catch-all /api/ → 404 is registered FIRST. Every name
 *  is invented. */

type Json = Record<string, any>;

interface Fake {
  klein: boolean;
  drafts?: number; // undefined: an answer without draft_count, as before
  profileReads: number;
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) =>
    json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } })
  );
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/invoicing/profile' && method === 'GET') {
      fake.profileReads += 1;
      const body: Json = {
        saved: true,
        has_logo: false,
        profile: {
          full_name: 'Flower Example',
          address: 'Weg 1',
          steuernummer: '12/345/67890',
          email: '',
          is_kleinunternehmer: fake.klein,
          invoice_number_prefix: '2026',
          next_invoice_number: 4,
        },
      };
      if (fake.drafts !== undefined) body.draft_count = fake.drafts;
      return json(route, 200, body);
    }
    if (path === '/invoicing/clients' && method === 'GET') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET')
      return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices' && method === 'GET')
      return json(route, 200, { invoices: [] });
    if (path === '/invoicing/expenses' && method === 'GET')
      return json(route, 200, { expenses: [] });
    return json(route, 404, {
      error: { code: 'not_found', message: `unmocked ${method} ${path}` },
    });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="profile-edit"]')).toBeVisible();
}

async function openEditor(page: Page): Promise<void> {
  const reads = page.waitForResponse(
    (r) => r.url().endsWith('/invoicing/profile') && r.request().method() === 'GET'
  );
  await page.locator('[data-test="profile-edit"]').click();
  await expect(page.locator('[data-test="profile-form"]')).toBeVisible();
  await reads;
}

const box = (page: Page) =>
  page.getByRole('checkbox', { name: /Kleinunternehmerin under § 19 UStG/ });
const line = (page: Page) => page.locator('[data-test="profile-vat-drafts"]');

test.describe('#12261 the profile says which drafts a VAT change reworks', () => {
  test('three drafts: the line shows only while the box differs from the saved setting', async ({
    page,
  }) => {
    const fake: Fake = { klein: true, drafts: 3, profileReads: 0 };
    await open(page, fake);
    await openEditor(page);
    await expect(box(page)).toBeChecked();
    await expect(line(page)).toHaveCount(0);
    await box(page).uncheck();
    await expect(line(page)).toHaveText('3 drafts will be worked out again with this setting.');
    await box(page).check();
    await expect(line(page)).toHaveCount(0);
  });

  test('one draft reads in the singular, from VAT on to Kleinunternehmerin', async ({ page }) => {
    const fake: Fake = { klein: false, drafts: 1, profileReads: 0 };
    await open(page, fake);
    await openEditor(page);
    await expect(box(page)).not.toBeChecked();
    await box(page).check();
    await expect(line(page)).toHaveText('1 draft will be worked out again with this setting.');
  });

  test('no draft, or an answer without draft_count, draws no line', async ({ page }) => {
    for (const drafts of [0, undefined]) {
      const fake: Fake = { klein: true, drafts, profileReads: 0 };
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await open(page, fake);
      await openEditor(page);
      await box(page).uncheck();
      await expect(page.locator('[data-test="profile-form"]')).toBeVisible();
      await expect(line(page), `draft_count ${drafts}`).toHaveCount(0);
    }
  });

  test('the count is read again each time the editor opens', async ({ page }) => {
    const fake: Fake = { klein: true, drafts: 3, profileReads: 0 };
    await open(page, fake);
    await openEditor(page);
    await page.locator('[data-test="profile-cancel"]').click();
    await expect(page.locator('[data-test="profile-form"]')).toHaveCount(0);
    fake.drafts = 2; // a draft issued on the Invoices tab meanwhile
    await openEditor(page);
    await box(page).uncheck();
    await expect(line(page)).toHaveText('2 drafts will be worked out again with this setting.');
  });

  test('at 360 the line wraps inside the dialog with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const fake: Fake = { klein: true, drafts: 12, profileReads: 0 };
    await open(page, fake);
    await openEditor(page);
    await box(page).uncheck();
    await expect(line(page)).toHaveText('12 drafts will be worked out again with this setting.');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const b = (await line(page).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  });
});
