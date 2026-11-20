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

async function mock(page: Page, { steuernummer = '12/345/67890', payments = null as Json[] | null } = {}): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Beispielstraße 1\n10117 Berlin', steuernummer, email: '', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 2 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin', email: 'info@galerie.test', paypal_email: 'pay@galerie.test' }] });
    if (path === '/invoicing/payments' && payments) return json(route, 200, { payments });
    if (path === '/invoicing/payments') {
      return json(route, 200, {
        payments: [
          { id: 10, kind: 'incoming', transaction_id: 'TX1', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR', gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: 'pay@galerie.test', note: 'Wandbild Juli', category: 'paid_work', client_id: 1 },
          { id: 11, kind: 'incoming', transaction_id: 'TX2', paid_on: '2026-07-20T00:00:00Z', currency: 'EUR', gross_cents: 5000, sender_name: 'Aunt', sender_email: 'aunt@example.test', note: 'Happy birthday', category: 'gift', client_id: null },
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

async function open(page: Page, theme: 'light' | 'dark', opts?: { steuernummer?: string; payments?: Json[] }): Promise<void> {
  await mock(page, opts);
  await seedTrustedSessionAs(page, 'vinoly');
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
  // The direction strip leads the toolbar (§3.143 Decision 3, system_3 #10630).
  Transactions: () => '[data-test="direction-filter"]',
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
      // The Issuer is one line now (system_3 #11019-A1); its first text still
      // sits on the cards' gutter.
      const inset = await page.locator('[data-test="profile-card"]').evaluate((card) =>
        Math.round(card.querySelector('.issuer-line__items')!.getBoundingClientRect().left - card.getBoundingClientRect().left));
      expect(inset, 'card text at card.left + 2px border + 16px').toBe(18);

      for (const tab of ['Transactions', 'Invoices', 'Clients']) {
        await page.getByRole('tab', { name: tab }).click();
        const sel = PANEL_EDGE[tab](narrow);
        await expect(page.locator(sel).first()).toBeVisible();
        expect(await leftOf(page, sel), `${tab}: first panel element`).toBe(edge);
        expect(await noSideScroll(page), `${tab}: no horizontal scroll`).toBe(true);
      }
    });
  }

  test('the guardrail states are visible: missing Steuernummer on the card and in the draft, the Create invoice caption', async ({ page, isMobile }) => {
    await open(page, 'light', { steuernummer: '' });
    await expect(page.locator('[data-test="steuernummer-missing"]')).toContainText('Missing: needed to issue');
    // Below 640px nothing of the bar is on the page while nothing is ticked
    // (system_3 #11371), so this caption only shows once a row is ticked.
    if (!isMobile) {
      await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveText('Select rows to set their category or remove them, or paid-work payments to invoice them.');
      await expect(page.locator('[data-test="create-invoice"]')).toHaveAttribute('aria-describedby', 'create-invoice-hint');
    }

    // TX1 is Paid work; the list runs newest first, so it is named, not taken by position.
    await page.getByRole('checkbox', { name: 'Select TX1' }).click();
    await expect(page.locator('[data-test="create-invoice-hint"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Invoices' }).click();
    await page.locator('[data-test="invoice-row"][data-status="draft"]').click();
    await expect(page.locator('[data-test="draft-issue-blocked"]')).toContainText('Add a Steuernummer (tax number) in the issuer profile to issue.');
    // The server stays the gate: the issue button is not newly disabled.
    await expect(page.locator('[data-test="draft-issue"]')).toBeEnabled();
    expect(await noSideScroll(page), 'draft editor: no horizontal scroll').toBe(true);
  });

  test('an issued invoice states that it is read-only, and the detail does not scroll sideways', async ({ page }) => {
    await open(page, 'light');
    await page.getByRole('tab', { name: 'Invoices' }).click();
    await page.locator('[data-test="invoice-row"][data-status="issued"]').click();
    await expect(page.locator('[data-test="invoice-readonly"]')).toHaveText(
      "An issued invoice can't be changed. To correct it, cancel it and issue a new one.",
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
    const box = page.locator('[data-test="payments-panel"] .data-table__scroll').first();
    test.skip((await box.count()) === 0, 'phones show payment cards, not the table');
    const [scrollWidth, clientWidth] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth, 'no sideways scroll in the payments table').toBeLessThanOrEqual(clientWidth + 1);
    // Fitting by truncation does not count: every select value shows whole.
    const cut = await box.evaluate((el) =>
      [...el.querySelectorAll('.select__value')].filter((v) => v.scrollWidth > v.clientWidth + 1).map((v) => v.textContent!.trim()));
    expect(cut, 'select values cut off in the table').toEqual([]);
  });

  // system_3 #11027 (UX walk AM9, PR 481): "No line starts with a separator."
  // §3.122 P3 wraps between whole phrases (§3.53), so the "·" ends the item
  // before it: when the line wraps it stays at the end of the first line. This
  // test used to assert the opposite (the dot sits with the text after it),
  // which #11027 deliberately reversed; aligned in system_3 #11281.
  test('every "·" on the Issuer line stays with the item it ends', async ({ page }) => {
    // Missing Steuernummer: the one line with a separator (the name, then
    // the badge; Design ack c69874 item 3), the likeliest to wrap at 390.
    await open(page, 'light', { steuernummer: '' });
    // Same line = vertical centres closer than half a line; separate flex
    // items on one line can differ by a pixel, a wrap moves a whole line.
    const pairs = await page.locator('[data-test="profile-card"]').evaluate((card) => {
      const centre = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      return [...card.querySelectorAll('span')]
        .filter((s) => s.textContent!.trim() === '·')
        .map((dot) => ({
          gap: Math.abs(centre(dot) - centre(dot.previousElementSibling!)),
          lineHeight: dot.getBoundingClientRect().height,
        }));
    });
    expect(pairs.length, 'one separator, between the name and the badge').toBe(1);
    for (const { gap, lineHeight } of pairs) {
      expect(gap, 'the separator sits on the line of the item before it').toBeLessThan(lineHeight / 2);
    }
  });

  // The list folds by month (§3.145, system_3 #10636), so the first group's
  // summary is the list's first content (design_agent c68002 and c68157, the
  // note under §3.145 Decision 4): it is wholly on the first screen, the
  // newest month is open, and the first card starts directly under it. On a
  // phone the gaps above the list are 4px to make that hold.
  test('on a 390×844 phone the first month line is on the first screen, with the first card directly under it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'light');
    const group = page.locator('[data-test="ledger-group"]').first();
    const summary = group.locator('[data-test="ledger-group-summary"]');
    await expect(summary).toBeVisible();
    await expect(group).toHaveAttribute('open', '');
    const summaryBottom = await summary.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(summaryBottom, 'first month summary ends above the fold').toBeLessThanOrEqual(844);
    const card = group.locator('[data-test="payment-row"], [data-test="expense-row"]').first();
    await expect(card).toBeVisible();
    const top = await card.evaluate((el) => el.getBoundingClientRect().top);
    // Nothing between them but the list's own gap.
    expect(top - summaryBottom, 'first card starts directly under the summary').toBeGreaterThanOrEqual(0);
    expect(top - summaryBottom, 'first card starts directly under the summary').toBeLessThanOrEqual(12);
    const cardHeight = await page.locator('[data-test="profile-card"]').evaluate((el) => el.getBoundingClientRect().height);
    // One line since system_3 #11019-A1 (was 132px). On a phone its padding
    // above and below the 44px line is 8px since #11576: 2px border + 8px +
    // 44px + 8px + 2px = 64px.
    expect(cardHeight, 'Issuer card one line, at most 66px on a phone').toBeLessThanOrEqual(66);
  });

  // The brief's target for #11019 (§3.157, "The budget"): two cards whole on
  // a 390×844 first screen. The measurement gate (system_3 #11373, report
  // 1102) found the second card's box 9.8px under the fold, and 25px under it
  // when both cards still need an invoice, where the "Generate invoice" button
  // was cut. design_agent's ruling c71509 on #11019 takes spacing from above
  // the list, on a phone only (system_3 #11576): 32px as built, four gaps of
  // 4px and 16px of the Issuer card's padding.
  const needInvoice = [7, 6].map((n) => ({
    id: n, kind: 'incoming', entry: 'manual', source: 'manual', method: 'bank_transfer', reference: `E2E-00${n}`,
    transaction_id: `M-e2e-${n}`, paid_on: `2026-09-${n === 7 ? '28' : '12'}T00:00:00Z`, created_at: '2026-09-29T09:00:00Z',
    currency: 'EUR', gross_cents: 6000 * n, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild (klein)',
    category: 'paid_work', client_id: 1, on_invoice: false, on_issued_invoice: false, invoice: null,
  }));
  const boxOf = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, left: r.left }; });

  for (const theme of ['light', 'dark'] as const) {
    test(`on a 390×844 phone two cards that still need an invoice end above the fold, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, theme, { payments: needInvoice });
      const cards = page.locator('[data-test="payment-row"]');
      await expect(cards).toHaveCount(2);
      const second = cards.nth(1);
      const button = second.locator('[data-test="row-generate"]');
      await expect(button).toHaveText('Generate invoice');
      const cardBottom = await second.evaluate((el) => el.getBoundingClientRect().bottom);
      const buttonBottom = await button.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(buttonBottom, `the second card's Generate invoice ends at ${buttonBottom.toFixed(1)}px`).toBeLessThanOrEqual(844);
      expect(cardBottom, `the second card ends at ${cardBottom.toFixed(1)}px`).toBeLessThanOrEqual(844);

      // Where the room came from: 4px, not 16px, at each of the four gaps
      // above the list, and 8px, not 16px, above and below the Issuer line.
      // c71509 on #11019 set the gaps at 12px; c73520 on #11020 took them to
      // 4px so the Invoice filter's line fits the same budget.
      const head = await boxOf(page, '.page-head');
      const card = await boxOf(page, '[data-test="profile-card"]');
      const line = await boxOf(page, '[data-test="profile-edit"]');
      const tabs = await boxOf(page, '.tabs');
      const fold = await boxOf(page, '[data-test="ways-in-summary"]');
      const filters = await boxOf(page, '[data-test="category-filter"]');
      const gaps = { 'title to Issuer': card.top - head.bottom, 'Issuer to tabs': tabs.top - card.bottom, 'tabs to Add or import': fold.top - tabs.bottom, 'Add or import to the filters': filters.top - fold.bottom };
      for (const [name, gap] of Object.entries(gaps)) expect(Math.abs(gap - 4), `${name}: ${gap.toFixed(1)}px`).toBeLessThanOrEqual(0.5);
      // 2px border + 8px + the 44px line + 8px + 2px.
      expect(Math.abs(card.height - 64), `Issuer card ${card.height.toFixed(1)}px`).toBeLessThanOrEqual(0.5);
      // What the trim must not take (c71509): the two 44px targets and the
      // page's 16px side inset.
      expect(line.height, 'the Issuer line is a 44px target').toBeGreaterThanOrEqual(44);
      expect(fold.height, '"Add or import" is a 44px target').toBeGreaterThanOrEqual(44);
      expect(Math.round(card.left), 'the 16px page inset').toBe(16);
      expect(await noSideScroll(page)).toBe(true);
    });
  }

  // Under the tabs, on a phone (design_agent c73534 on system_3 #11020): a
  // tab whose first block draws its own edge (Transactions' "Add or import",
  // Clients' "Add client") starts 4px under the strip, as c73520 set. A tab
  // whose first block is plain text (Invoices' "Work done in", the Book's
  // "Counting with" sentence) starts 8px under it, so the text does not hang
  // off the strip. Pinned so a later trim cannot take the 8px back.
  for (const theme of ['light', 'dark'] as const) {
    test(`on a 390×844 phone each tab's first block sits 4px under the tabs, 8px where it is plain text, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, theme);
      const want: Record<string, number> = { Transactions: 4, Invoices: 8, Book: 8, Clients: 4 };
      for (const [name, gap] of Object.entries(want)) {
        await page.getByRole('tab', { name, exact: true }).click();
        await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
        const measured = await page.locator('.tabs').evaluate((tabs) => {
          const panel = tabs.nextElementSibling as HTMLElement;
          const first = [...panel.children].find((el) => el.getBoundingClientRect().height > 2 && getComputedStyle(el).position !== 'absolute');
          return first!.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom;
        });
        expect(Math.abs(measured - gap), `${name}: ${measured.toFixed(1)}px under the tabs`).toBeLessThanOrEqual(0.5);
      }
    });
  }

  test('at desktop width the spacing above the list is unchanged', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'the desktop layout; a phone has the tighter spacing above');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, 'light', { payments: needInvoice });
    const head = await boxOf(page, '.page-head');
    const card = await boxOf(page, '[data-test="profile-card"]');
    const tabs = await boxOf(page, '.tabs');
    const waysIn = await boxOf(page, '[data-test="manual-new"]');
    expect(Math.abs(card.top - head.bottom - 16), 'title to Issuer').toBeLessThanOrEqual(0.5);
    expect(Math.abs(tabs.top - card.bottom - 16), 'Issuer to tabs').toBeLessThanOrEqual(0.5);
    expect(Math.abs(waysIn.top - tabs.bottom - 16), 'tabs to the ways in').toBeLessThanOrEqual(0.5);
    expect(Math.abs(card.height - 80), `Issuer card ${card.height.toFixed(1)}px`).toBeLessThanOrEqual(0.5);
  });
});
