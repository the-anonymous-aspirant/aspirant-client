import { test, expect, type Page, type Locator, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #9968/#9965, operator c61550): "make sure that
 *  buttons like (Set category of selected payments), and banuberviesning
 *  (bank transfer) are big enough that we don't have text wrapping".
 *  A control's lines are the distinct line-box tops of its text nodes. */

type Json = Record<string, any>;
const json = (route: Route, status: number, body: Json) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pay = (id: number, tx: string, cat: string) => ({ id, kind: 'incoming', entry: 'import', source: 'paypal', transaction_id: tx, paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: cat, client_id: 1 });

async function open(page: Page): Promise<void> {
  await page.route(/\/api\//, (r) => json(r, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/invoicing/profile') return json(r, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(r, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2', email: '', paypal_email: '' }] });
    if (path === '/invoicing/payments') return json(r, 200, { payments: [pay(10, 'TX1', 'paid_work'), pay(11, 'TX2', 'uncategorised')] });
    if (path === '/invoicing/invoices') return json(r, 200, { invoices: [] });
    return json(r, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

const lines = (el: Locator) =>
  el.evaluate((node) => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width >= 1 && !tops.some((t) => Math.abs(t - r.top) <= 3)) tops.push(r.top);
      }
    }
    return tops.length;
  });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// 700 sits in the 641-767 band where option text is --text-base (16px) while
// the desktop layout still applies: the case that wrapped Status and Set category.
for (const width of [1440, 1024, 768, 700, 390]) {
  test.describe(`#9968 no wrapping at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('Set category, the Method select and the Status filter each fit on one line', async ({ page }) => {
      await open(page);
      const setCategory = page.locator('.set-category [role="combobox"]');
      await expect(setCategory).toContainText('Set category of selected payments');
      expect(await lines(setCategory), 'Set category of selected payments').toBe(1);
      expect(await noSideScroll(page), 'payments: no side scroll').toBe(true);

      await page.locator('[data-test="manual-new"]').click();
      const method = page.locator('[data-test="manual-form"] [role="combobox"]').filter({ hasText: 'Banküberweisung' });
      await expect(method).toContainText('Banküberweisung (Bank transfer)');
      expect(await lines(method), 'Banküberweisung (Bank transfer)').toBe(1);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();

      await page.getByRole('tab', { name: 'Invoices' }).click();
      const status = page.locator('.filter-field--status [role="combobox"]');
      await expect(status).toContainText('All statuses');
      expect(await lines(status), 'All statuses').toBe(1);
      expect(await noSideScroll(page), 'invoices: no side scroll').toBe(true);
    });

    // design_agent on #9968: Method's width floor follows its current value,
    // so every option is checked, and the pair must not jump between them.
    test('every Method option fits on one line, and the Method box keeps one width', async ({ page }) => {
      await open(page);
      await page.locator('[data-test="manual-new"]').click();
      const form = page.locator('[data-test="manual-form"]');
      const method = form.locator('.manual-form__pair--method [role="combobox"]');
      const widths = new Set<number>();
      const options = ['Banküberweisung (Bank transfer)', 'PayPal', 'Stripe', 'Bar (Cash)', 'Sonstige (Other)'];
      for (const name of options) {
        await method.click();
        await page.getByRole('option', { name, exact: true }).click();
        await expect(method).toContainText(name);
        expect(await lines(method), name).toBe(1);
        widths.add(Math.round((await method.boundingBox())!.width));
      }
      expect([...widths], 'Method width across options').toHaveLength(1);
    });

    // design_agent on #9968: the filter row wraps by its own content. One row
    // where all four fit; otherwise Client | Status above the date pair.
    test('the Invoices filters sit in one row, or Client | Status above the date pair', async ({ page }) => {
      await open(page);
      await page.getByRole('tab', { name: 'Invoices' }).click();
      const top = async (sel: string) => Math.round((await page.locator(sel).boundingBox())!.y);
      const [search, status, from, until] = await Promise.all([
        top('[data-test="filter-search"]'), top('.filter-field--status [role="combobox"]'),
        top('[data-test="filter-from"]'), top('[data-test="filter-to"]'),
      ]);
      expect(from, 'the two dates share a row').toBe(until);
      if (width >= 1024) {
        expect(new Set([search, status, from]).size, `one row at ${width}`).toBe(1);
      } else if (width > 640) {
        expect(search, `Client and Status share a row at ${width}`).toBe(status);
        expect(from, `the dates sit below at ${width}`).toBeGreaterThan(status);
      }
      expect(await noSideScroll(page)).toBe(true);
    });
  });
}
