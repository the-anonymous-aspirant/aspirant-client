import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #8409): an invoice without a PayPal import. "New
 *  invoice" enters a received payment by hand, then makes a draft from it.
 *  Every call is answered by an in-memory fake; a catch-all /api/ → 404 is
 *  registered FIRST so nothing reaches the live server. */

type Json = Record<string, any>;

interface Fake {
  clients: Json[];
  payments: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
  draftFailure?: { status: number; body: Json };
  deleteFailure?: { status: number; body: Json };
}

const manualRow = (over: Json = {}) => ({
  id: 40, kind: 'incoming', entry: 'manual', source: 'manual', transaction_id: 'M-0011223344556677',
  method: 'bank_transfer', reference: 'RE-17', paid_on: '2026-07-14T00:00:00Z', currency: 'EUR',
  gross_cents: 35000, sender_name: 'Galerie Nord', sender_email: '', note: 'Wandbild Juli',
  category: 'paid_work', client_id: 1, on_invoice: false, ...over,
});

function newFake(over: Partial<Fake> = {}): Fake {
  return {
    clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2\n13353 Berlin' }],
    payments: [],
    requests: [],
    ...over,
  };
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: fake.clients });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: fake.payments });
    if (path === '/invoicing/payments/manual' && method === 'POST') {
      const payment = manualRow({ ...JSON.parse(req.postData() || '{}'), id: 41 });
      fake.payments.push(payment);
      return json(route, 201, { payment });
    }
    const del = path.match(/^\/invoicing\/payments\/(\d+)$/);
    if (del && method === 'DELETE') {
      if (fake.deleteFailure) return json(route, fake.deleteFailure.status, fake.deleteFailure.body);
      fake.payments = fake.payments.filter((p) => p.id !== Number(del[1]));
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/invoicing/invoices' && method === 'POST') {
      if (fake.draftFailure) return json(route, fake.draftFailure.status, fake.draftFailure.body);
      return json(route, 201, { invoice: { id: 300, status: 'draft', client_id: 1, currency: 'EUR', service_date_from: '2026-07-14T00:00:00Z' }, line_items: [], payments: [], warnings: [] });
    }
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/invoices/300') {
      return json(route, 200, { invoice: { id: 300, status: 'draft', client_id: 1, currency: 'EUR', service_date_from: '2026-07-14T00:00:00Z' }, client_name: 'Galerie Nord', line_items: [{ id: 1, position: 1, description: 'Wandbild Juli', quantity_milli: 1000, unit_price_cents: 35000, line_total_cents: 35000 }], payments: [manualRow({ id: 41 })], warnings: [] });
    }
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="payments-panel"]')).toBeVisible();
}

test.describe('#8409 Invoices app — a payment entered by hand', () => {
  test('with no payments the ways in are equal and the toolbar is hidden', async ({ page }) => {
    await open(page, newFake());
    for (const id of ['manual-new', 'payments-import', 'n26-import']) {
      await expect(page.locator(`[data-test="${id}"]`)).toHaveClass(/btn--secondary/);
    }
    await expect(page.locator('[data-test="category-filter"]')).toHaveCount(0);
    await expect(page.locator('[data-test="create-invoice"]')).toHaveCount(0);
    await expect(page.locator('[data-test="payments-empty"]')).toContainText(
      'Enter a payment by hand, or import a PayPal CSV or Excel file, or N26 PDFs.',
    );
  });

  test('Enter payment by hand stores the payment, makes a draft from it and opens the editor', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    // system_3 #9942 (operator c61387): the button and the dialog say what
    // they do, enter a payment; the invoice comes after.
    await expect(page.locator('[data-test="manual-new"]')).toHaveText('Enter payment by hand');
    await page.locator('[data-test="manual-new"]').click();
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Enter payment by hand' })).toBeVisible();
    await expect(page.getByText('New invoice', { exact: true })).toHaveCount(0);

    // Nothing is sent until the required fields are filled.
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-error"]')).toHaveText('Choose the client who paid.');
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);

    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: 'Galerie Nord' }).click();
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('350,00');
    await page.locator('[data-test="manual-reference"]').fill('RE-17');
    await page.locator('[data-test="manual-payer"]').fill('Galerie Nord');
    await page.locator('[data-test="manual-note"]').fill('Wandbild Juli');
    await page.locator('[data-test="manual-save"]').click();

    await expect(page.locator('[data-test="invoice-editor"][data-status="draft"]')).toBeVisible();
    const posts = fake.requests.filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.path)).toEqual(['/invoicing/payments/manual', '/invoicing/invoices']);
    expect(JSON.parse(posts[0].body)).toEqual({
      client_id: 1, paid_on: '2026-07-14', gross_cents: 35000, method: 'bank_transfer',
      reference: 'RE-17', sender_name: 'Galerie Nord', note: 'Wandbild Juli',
    });
    expect(JSON.parse(posts[1].body)).toEqual({ payment_ids: [41] });
  });

  // system_3 #9949 (design_agent c61924): where the draft is made, a muted hint
  // says an amount over €250.00 needs the client's address to be issued.
  test('the amount hint names a client without an address above €250.00, and only then', async ({ page }) => {
    await open(page, newFake({ clients: [{ id: 1, name: 'Galerie Nord', address: 'Nordweg 2' }, { id: 2, name: 'Anna Ohne', address: '' }] }));
    await page.locator('[data-test="manual-new"]').click();
    const hint = 'Anna Ohne has no address: an invoice above €250.00 needs one before it can be issued.';
    const dialog = page.getByRole('dialog');
    const pick = async (name: string) => {
      await page.getByRole('combobox', { name: 'Client' }).click();
      await page.getByRole('option', { name }).click();
    };
    await pick('Anna Ohne');
    const amount = page.locator('[data-test="manual-amount"]');
    await amount.fill('250,00');
    await expect(dialog.getByText(hint)).toHaveCount(0);
    await amount.fill('400');
    await expect(dialog.getByText(hint)).toBeVisible();
    // Side by side, the hint hangs under Amount without pushing Date down
    // (the two labels' own spacing differs by under 2px; the drop was ~50px).
    const [d, m] = [await page.locator('[data-test="manual-date"]').boundingBox(), await amount.boundingBox()];
    // Side by side means Amount starts past Date's right edge; stacked on a
    // phone, AspInput's own padding still puts its <input> a little right of
    // the bare date input, so an x offset alone is not the test.
    if (m!.x >= d!.x + d!.width) expect(Math.abs(m!.y - d!.y), 'date and amount inputs stay level').toBeLessThanOrEqual(3);
    else expect(m!.y, 'stacked: Amount below Date').toBeGreaterThan(d!.y + d!.height);
    await amount.fill('120');
    await expect(dialog.getByText(hint)).toHaveCount(0);
    await amount.fill('400');
    await pick('Galerie Nord');
    await expect(dialog.getByText('has no address')).toHaveCount(0);
  });

  test('a refused draft keeps the stored payment and says so', async ({ page }) => {
    const fake = newFake({ draftFailure: { status: 422, body: { error: { code: 'payment_not_paid_work', message: 'payment M-1 is not paid work' } } } });
    await open(page, fake);
    await page.locator('[data-test="manual-new"]').click();
    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: 'Galerie Nord' }).click();
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('50');
    await page.locator('[data-test="manual-note"]').fill('Skizze');
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-error"]')).toContainText('The payment was saved, but no draft was made: payment M-1 is not paid work');
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);
  });

  test('without any client the dialog points to the Clients tab and cannot submit', async ({ page }) => {
    await open(page, newFake({ clients: [] }));
    await page.locator('[data-test="manual-new"]').click();
    await expect(page.locator('[data-test="manual-no-clients"]')).toHaveText('Add the client on the Clients tab first.');
    const save = page.locator('[data-test="manual-save"]');
    await expect(save).toBeDisabled();
    // The reason reads next to the disabled button too (#9926-A4), not only
    // up by the field it names, and the button points screen readers at it.
    await expect(page.locator('[data-test="manual-save-hint"]')).toHaveText('Add a client first.');
    await expect(save).toHaveAttribute('aria-describedby', 'manual-save-hint');
  });

  test('a hand-entered payment says so; Delete takes two presses and is offered only while no issued invoice covers it', async ({ page }) => {
    const fake = newFake({ payments: [manualRow(), manualRow({ id: 42, reference: '', method: 'cash', on_invoice: true, on_issued_invoice: true })] });
    await open(page, fake);
    const lines = page.locator('[data-test="payment-manual"]');
    await expect(lines.first()).toHaveText('Entered by hand · Banküberweisung (Bank transfer) · RE-17');
    await expect(lines.nth(1)).toHaveText('Entered by hand · Bar (Cash)');
    const del = page.locator('[data-test="payment-delete"]');
    await expect(del).toHaveCount(1);
    // #9934-B2 (operator c61373): the row without Delete says why, in the
    // server's own words (#10009: only an issued invoice blocks a delete).
    await expect(page.locator('[data-test="payment-no-delete-reason"]')).toHaveText('On an issued invoice — cancel that invoice first');

    await del.click();
    await expect(del).toHaveText('Delete this payment');
    expect(fake.requests.some((r) => r.method === 'DELETE')).toBe(false);
    await del.click();
    await expect.poll(() => fake.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual(['/invoicing/payments/40']);
    await expect(page.locator('[data-test="payment-manual"]')).toHaveCount(1);
  });

  // system_3 #10010 (operator c61587/c61868, server #10009): an imported
  // payment can be deleted too while no issued invoice covers it; armed, the
  // row says a re-import will not bring it back.
  test('an imported payment offers Delete, and says a re-import will not bring it back', async ({ page }) => {
    const fake = newFake({ payments: [manualRow({ id: 50, entry: 'import', source: 'paypal', reference: '' })] });
    await open(page, fake);
    await expect(page.locator('[data-test="payment-manual"]')).toHaveCount(0);
    await expect(page.locator('[data-test="payment-no-delete-reason"]')).toHaveCount(0);
    const del = page.locator('[data-test="payment-delete"]');
    await expect(del).toHaveText('Delete');
    await expect(page.locator('[data-test="payment-delete-consequence"]')).toHaveCount(0);
    await del.click();
    await expect(del).toHaveText('Delete this payment');
    await expect(page.locator('[data-test="payment-delete-consequence"]')).toHaveText('Gone for good: importing the same file again will not bring it back.');
    await del.click();
    await expect.poll(() => fake.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual(['/invoicing/payments/50']);
  });

  test('a payment on a draft or cancelled invoice can go, and says it comes off that invoice; on an issued one it says why not', async ({ page }) => {
    const fake = newFake({
      payments: [
        manualRow({ id: 60, on_invoice: true, on_issued_invoice: false }),
        manualRow({ id: 61, entry: 'import', source: 'n26', reference: '', on_invoice: true, on_issued_invoice: false, sender_name: 'Studio Süd' }),
        manualRow({ id: 62, entry: 'import', source: 'paypal', reference: '', on_invoice: true, on_issued_invoice: true, sender_name: 'Atelier Ost' }),
      ],
    });
    await open(page, fake);
    const dels = page.locator('[data-test="payment-delete"]');
    await expect(dels).toHaveCount(2);
    await dels.first().click();
    await expect(page.locator('[data-test="payment-delete-consequence"]')).toHaveText('It also comes off the draft or cancelled invoice that lists it. A draft keeps its lines, so check its total.');
    // Arming another row disarms the first; both sentences when both apply.
    await dels.nth(1).click();
    await expect(page.locator('[data-test="payment-delete-consequence"]')).toHaveText('Gone for good: importing the same file again will not bring it back. It also comes off the draft or cancelled invoice that lists it. A draft keeps its lines, so check its total.');
    await expect(page.locator('[data-test="payment-no-delete-reason"]')).toHaveCount(1);
    await expect(page.locator('[data-test="payment-no-delete-reason"]')).toHaveText('On an issued invoice — cancel that invoice first');
  });

  // design_agent c62100 (§3.129 Decision 6): a payment on an issued invoice
  // has nothing on this surface to act on, so it has no checkbox; its gutter
  // stays, and select-all counts the selectable rows only.
  for (const width of [1440, 390]) {
    test(`at ${width}px a payment on an issued invoice has no checkbox, keeps the gutter, and select-all leaves it out`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const fake = newFake({
        payments: [
          manualRow({ id: 70 }),
          manualRow({ id: 71, entry: 'import', source: 'paypal', reference: '', on_invoice: true, on_issued_invoice: true, sender_name: 'Atelier Ost' }),
          manualRow({ id: 72, entry: 'import', source: 'n26', reference: '', sender_name: 'Studio Süd' }),
        ],
      });
      await open(page, fake);
      const rows = page.locator('[data-test="payment-row"]');
      await expect(rows).toHaveCount(3);
      await expect(page.locator('[data-test="payment-select"]')).toHaveCount(2);
      const issued = rows.filter({ hasText: 'Atelier Ost' });
      await expect(issued.locator('[data-test="payment-select"]')).toHaveCount(0);
      // The gutter's stand-in is neither seen nor reachable.
      const ghost = issued.locator('[data-test="payment-select-gutter"]');
      await expect(ghost).toHaveCount(1);
      const ghostState = await ghost.evaluate((el) => {
        const all = [el, ...el.querySelectorAll('*')];
        return { visible: all.some((n) => getComputedStyle(n).visibility !== 'hidden' && (n as HTMLElement).getBoundingClientRect().width > 0 && n.tagName !== 'DIV' && n.tagName !== 'LABEL'), focusable: all.some((n) => (n as HTMLElement).tabIndex >= 0 && getComputedStyle(n).visibility !== 'hidden') };
      });
      expect(ghostState, 'the stand-in shows and focuses nothing').toEqual({ visible: false, focusable: false });
      // Every row's date starts on one left edge.
      const xs = await rows.evaluateAll((els) => els.map((r) => {
        const d = [...r.querySelectorAll('.nowrap')].find((n) => /\d{4}-\d{2}-\d{2}/.test(n.textContent || ''));
        return d ? Math.round(d.getBoundingClientRect().left) : -1;
      }));
      expect(new Set(xs).size, `date left edges ${xs}`).toBe(1);
      // Select-all takes the two selectable rows, not the issued one.
      const all = page.locator('[data-test="select-all-shown"]').locator('input[type="checkbox"]').first();
      await all.check();
      await expect(page.locator('[data-test="payment-select"] input[type="checkbox"]:checked, input[type="checkbox"][data-test="payment-select"]:checked')).toHaveCount(2);
      await expect(page.getByRole('button', { name: /Create invoice from 2 payments/ })).toBeVisible();
    });
  }

  test('a delete the server refuses is shown, and the row stays', async ({ page }) => {
    const fake = newFake({
      payments: [manualRow()],
      deleteFailure: { status: 409, body: { error: { code: 'payment_on_invoice', message: 'payment is on invoice 7; delete that draft (or cancel that invoice) first' } } },
    });
    await open(page, fake);
    const del = page.locator('[data-test="payment-delete"]');
    await del.click();
    await del.click();
    await expect(page.locator('[data-test="payment-error"]')).toContainText('delete that draft');
    await expect(page.locator('[data-test="payment-manual"]')).toHaveCount(1);
  });

  // design_agent's acceptance for the client PR (sign-off on #8409).
  for (const theme of ['light', 'dark'] as const) {
    test(`the head row reads Enter payment by hand, then Import, with no primary (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.emulateMedia({ colorScheme: theme });
      await open(page, newFake({ payments: [manualRow()] }));
      const [manual, imp] = await Promise.all(['manual-new', 'payments-import'].map((id) =>
        page.locator(`[data-test="${id}"]`).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, primary: el.classList.contains('btn--primary') }; })));
      const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
      if (narrow) expect(manual.y, 'phone: Enter payment by hand above Import').toBeLessThan(imp.y);
      else expect(manual.x, 'wide: Enter payment by hand left of Import').toBeLessThan(imp.x);
      expect([manual.primary, imp.primary], 'no primary in the head row').toEqual([false, false]);
      await expect(page.locator('[data-test="create-invoice"]')).toHaveClass(/btn--primary/);
    });
  }

  // system_3 #9942 (design_agent c61923, §3.127): the ways in are one row or
  // three, never two and one, at every width, and no label wraps within its
  // button. Swept, so a longer label fails here instead of shipping a 2+1.
  test('the head row is one line or three stacked full width, never two and one', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1100, height: 900 });
    await open(page, newFake({ payments: [manualRow()] }));
    for (let w = 600; w <= 1100; w += 4) {
      await page.setViewportSize({ width: w, height: 900 });
      const m = await page.evaluate(() => {
        const row = document.querySelector('.ways-in') as HTMLElement;
        const bs = ['manual-new', 'payments-import', 'n26-import'].map((id) => document.querySelector(`[data-test="${id}"]`) as HTMLElement);
        const rects = bs.map((b) => b.getBoundingClientRect());
        const lineHeight = (b: HTMLElement) => parseFloat(getComputedStyle(b).lineHeight) || 0;
        return {
          rows: new Set(rects.map((r) => Math.round(r.top))).size,
          rowWidth: Math.round(row.getBoundingClientRect().width),
          widths: rects.map((r) => Math.round(r.width)),
          // One line of text: the label's height is under two line heights.
          oneLine: bs.every((b) => { const span = b.querySelector('span') || b; return span.getBoundingClientRect().height < 2 * lineHeight(b) || b.getBoundingClientRect().height < 48; }),
        };
      });
      expect([1, 3], `rows at ${w}px`).toContain(m.rows);
      expect(m.oneLine, `a label wraps at ${w}px`).toBe(true);
      if (m.rows === 3) for (const bw of m.widths) expect(Math.abs(bw - m.rowWidth), `stacked full width at ${w}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the dialog footer: Create draft first on a phone, Cancel then Create draft at the right when wide', async ({ page }) => {
    await open(page, newFake());
    await page.locator('[data-test="manual-new"]').click();
    const save = await page.locator('[data-test="manual-save"]').boundingBox();
    const cancel = await page.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (narrow) {
      expect(save!.y, 'phone: primary on top').toBeLessThan(cancel!.y);
    } else {
      expect(cancel!.x + cancel!.width, 'wide: Cancel before Create draft').toBeLessThanOrEqual(save!.x);
    }
  });

  test('a hand-entered row with Delete keeps the payments table inside its column', async ({ page }) => {
    await open(page, newFake({ payments: [manualRow({ sender_name: 'Galerie Nord GmbH', reference: 'RE-2026-0017' })] }));
    const box = page.locator('[data-test="payments-panel"] .data-table__scroll').first();
    test.skip((await box.count()) === 0, 'phones show payment cards, not the table');
    await expect(page.locator('[data-test="payment-delete"]')).toBeVisible();
    const [scrollWidth, clientWidth] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth - clientWidth, 'no sideways scroll').toBeLessThanOrEqual(0);
  });
});
