import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app layout (system_3 #8400, design_agent's spec on #8399,
 *  corpus §3.114): two left edges only, a glance-sized Issuer card, nothing
 *  that scrolls sideways on a phone, and the §10 guardrail states visible
 *  where they matter. Measured on the built page at each project's width
 *  (chromium 1280, mobile-safari 390), in both themes. Catch-all /api/ → 404
 *  is registered FIRST so no call reaches the live server. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const issued = { id: 100, status: 'issued', client_id: 1, client_name: 'Galerie Nord', invoice_number: '2026-001', issue_date: '2026-10-21T00:00:00Z', service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-14T00:00:00Z', total_cents: 35000, currency: 'EUR', vat_rate_bp: 0 };
const draft = { ...issued, id: 102, status: 'draft', invoice_number: null, issue_date: null, total_cents: 5000 };
const item = { id: 1, position: 1, description: 'Wandbild Juli, Acryl auf Leinwand, 120 × 80 cm', quantity_milli: 1000, unit_price_cents: 35000, line_total_cents: 35000 };

async function mock(page: Page, { steuernummer = '12/345/67890' } = {}): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Beispielstraße 1\n10117 Berlin', steuernummer, email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 2 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin', email: 'info@galerie.test', paypal_email: 'pay@galerie.test' }] });
    if (path === '/invoicing/payments') {
      return json(route, 200, {
        payments: [
          { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'paid_work', client_id: 1, bank_deposit_id: null },
          { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null, bank_deposit_id: null },
        ],
      });
    }
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [issued, draft] });
    if (path === '/invoicing/invoices/100') return json(route, 200, { invoice: issued, client_name: 'Galerie Nord', line_items: [item], payments: [], warnings: [] });
    if (path === '/invoicing/invoices/102') return json(route, 200, { invoice: draft, client_name: 'Galerie Nord', line_items: [{ ...item, id: 2 }], payments: [], warnings: [] });
    if (path === '/invoicing/invoices/100/pdf') return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
}

async function open(page: Page, theme: 'light' | 'dark', opts?: { steuernummer?: string }): Promise<void> {
  await mock(page, opts);
  await seedTrustedSessionAs(page, 'flowah');
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="profile-card"]')).toBeVisible();
}

const leftOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().left));

// Neither the page nor an open dialog may scroll sideways. A modal scrolls its
// own body, so the document alone misses it: every scroll box in a dialog is
// checked too, except a table's own deliberate sideways scroller.
const noSideScroll = (page: Page) =>
  page.evaluate(() => {
    if (document.documentElement.scrollWidth > window.innerWidth) return false;
    return [...document.querySelectorAll('[role="dialog"], [role="dialog"] *')]
      .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
      .filter((el) => !el.matches('.items-wrap, .data-table__scroll'))
      .every((el) => el.scrollWidth <= el.clientWidth + 1);
  });

// The element that starts each panel at the page edge: the first control on
// Payments and Invoices; on Clients, wide puts Add client at the right, so
// the list carries the edge there.
const PANEL_EDGE: Record<string, (narrow: boolean) => string> = {
  Payments: () => '[data-test="category-filter"]',
  // The search box's own border box (AspInput's icon sits inside it).
  Invoices: () => '.filter-field--search',
  Clients: (narrow) => (narrow ? '[data-test="client-add"]' : '[data-test="client-row"]'),
};

test.describe('#8400 Invoices app layout (spec #8399, §3.114)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every tab shares the page edge and the card insets by its padding token (${theme})`, async ({ page }) => {
      await open(page, theme);
      const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
      const edge = await leftOf(page, 'h1');
      expect(await leftOf(page, '[data-test="profile-card"]'), 'card').toBe(edge);
      expect(await leftOf(page, '.tabs'), 'tabs').toBe(edge);
      const inset = await page.locator('[data-test="profile-card"]').evaluate((card) =>
        Math.round(card.querySelector('h2')!.getBoundingClientRect().left - card.getBoundingClientRect().left));
      expect(inset, 'card text at card.left + 2px border + 16px').toBe(18);

      for (const tab of ['Payments', 'Invoices', 'Clients']) {
        await page.getByRole('tab', { name: tab }).click();
        const sel = PANEL_EDGE[tab](narrow);
        await expect(page.locator(sel).first()).toBeVisible();
        expect(await leftOf(page, sel), `${tab}: first panel element`).toBe(edge);
        expect(await noSideScroll(page), `${tab}: no horizontal scroll`).toBe(true);
      }
    });
  }

  test('the guardrail states are visible: missing Steuernummer on the card and in the draft, the Create invoice caption', async ({ page }) => {
    await open(page, 'light', { steuernummer: '' });
    await expect(page.locator('[data-test="steuernummer-missing"]')).toContainText('issuing blocked');
    await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveText('Mark payments as Paid work, then select them to create an invoice.');
    await expect(page.locator('[data-test="create-invoice"]')).toHaveAttribute('aria-describedby', 'create-invoice-hint');

    await page.locator('[data-test="payment-select"]').first().click();
    await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Invoices' }).click();
    await page.locator('[data-test="invoice-row"][data-status="draft"]').click();
    await expect(page.locator('[data-test="draft-issue-blocked"]')).toContainText('Add a Steuernummer in the issuer profile to issue.');
    // The server stays the gate: the issue button is not newly disabled.
    await expect(page.locator('[data-test="draft-issue"]')).toBeEnabled();
    expect(await noSideScroll(page), 'draft editor: no horizontal scroll').toBe(true);
  });

  test('an issued invoice states that it is read-only, and the detail does not scroll sideways', async ({ page }) => {
    await open(page, 'light');
    await page.getByRole('tab', { name: 'Invoices' }).click();
    await page.locator('[data-test="invoice-row"][data-status="issued"]').click();
    await expect(page.locator('[data-test="invoice-readonly"]')).toHaveText(
      'Issued invoices cannot be changed. To correct one, cancel it (Storno) and issue a new invoice.',
    );
    await expect(page.locator('[data-test="draft-issue-blocked"]')).toHaveCount(0);
    expect(await noSideScroll(page), 'detail: no horizontal scroll').toBe(true);
  });

  // #8407: three defects from design_agent's conformance read of the
  // served #8400 bundle.
  for (const theme of ['light', 'dark'] as const) {
    test(`nothing from the page shell paints over an open modal (${theme})`, async ({ page }) => {
      await open(page, theme, { steuernummer: '' });
      const toggle = page.locator('.mobile-menu-toggle');
      test.skip(!(await toggle.isVisible()), 'the hamburger exists only below 768px');
      await page.getByRole('tab', { name: 'Invoices' }).click();
      await page.locator('[data-test="invoice-row"][data-status="draft"]').click();
      await expect(page.locator('[data-test="draft-lines"]')).toBeVisible();
      // What a tap at the hamburger's spot would hit: the sheet, not the shell.
      const hit = await toggle.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && !!top.closest('[role="dialog"], .modal__scrim');
      });
      expect(hit, 'the hamburger is under the modal').toBe(true);
    });
  }

  test('the payments table fits its column at desktop width with the sidebar open', async ({ page }) => {
    await open(page, 'light');
    // The first table is the incoming payments; a second lists bank deposits.
    const box = page.locator('[data-test="payments-panel"] .data-table__scroll').first();
    test.skip((await box.count()) === 0, 'phones show payment cards, not the table');
    const [scrollWidth, clientWidth] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth, 'no sideways scroll in the payments table').toBeLessThanOrEqual(clientWidth + 1);
    // Fitting by truncation does not count: every select value shows whole.
    const cut = await box.evaluate((el) =>
      [...el.querySelectorAll('.select__value')].filter((v) => v.scrollWidth > v.clientWidth + 1).map((v) => v.textContent!.trim()));
    expect(cut, 'select values cut off in the table').toEqual([]);
  });

  test('the "·" before "next invoice" never ends a line on its own', async ({ page }) => {
    await open(page, 'light', { steuernummer: '' });
    // Same line = vertical centres closer than half a line; separate flex
    // items on one line can differ by a pixel, a wrap moves a whole line.
    const { gap, lineHeight } = await page.locator('[data-test="profile-card"]').evaluate((card) => {
      const centre = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      const dotEl = [...card.querySelectorAll('span')].find((s) => s.textContent!.trim() === '·')!;
      const nextEl = card.querySelector('[data-test="profile-next-number"]')!;
      return { gap: Math.abs(centre(dotEl) - centre(nextEl)), lineHeight: nextEl.getBoundingClientRect().height };
    });
    expect(gap, 'the separator sits on the line of the text after it').toBeLessThan(lineHeight / 2);
  });

  test('on a 390×844 phone the first payment card is on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'light');
    const card = page.locator('[data-test="payment-row"]').first();
    await expect(card).toBeVisible();
    const top = await card.evaluate((el) => el.getBoundingClientRect().top);
    expect(top, 'first payment card starts above the fold').toBeLessThan(844);
    const cardHeight = await page.locator('[data-test="profile-card"]').evaluate((el) => el.getBoundingClientRect().height);
    expect(cardHeight, 'Issuer card under 140px').toBeLessThan(140);
  });
});
