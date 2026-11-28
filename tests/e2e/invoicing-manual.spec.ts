import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

/** Invoices app (system_3 #8409, #10539): a payment entered by hand, saved on
 *  its own (§3.142 Decision 1 — no draft is made here; an invoice is made
 *  later from the list). "Paid by" (Decision 2) can add the payer to the
 *  client book in the same save (Decision 3), matched against it by Decision
 *  4's "same"/"close" rule. Every call is answered by an in-memory fake; a
 *  catch-all /api/ → 404 is registered FIRST so nothing reaches the live
 *  server. */

type Json = Record<string, any>;

interface Fake {
  clients: Json[];
  payments: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
  deleteFailure?: { status: number; body: Json };
  /** system_3 #12295: the row a create looks like; answered 409
   *  possible_duplicate until the request confirms. */
  twin?: Json;
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
      const posted = JSON.parse(req.postData() || '{}');
      if (fake.twin && posted.confirm_duplicate !== true) {
        return json(route, 409, { error: { code: 'possible_duplicate', message: 'a payment with the same day, amount and payer is already in your book; send confirm_duplicate to save this one as well' }, duplicate_of: fake.twin.id, payment: fake.twin });
      }
      const payment = manualRow({ ...posted, id: 41 });
      fake.payments.push(payment);
      const body: Json = { payment };
      // Mirrors the server's one-transaction add (system_3 #10539, design
      // §3.142 Decision 3): a new_client_name in the request gets a client
      // back alongside the payment.
      if (posted.new_client_name) body.client = { id: 9, name: posted.new_client_name };
      return json(route, 201, body);
    }
    const del = path.match(/^\/invoicing\/payments\/(\d+)$/);
    if (del && method === 'DELETE') {
      if (fake.deleteFailure) return json(route, fake.deleteFailure.status, fake.deleteFailure.body);
      fake.payments = fake.payments.filter((p) => p.id !== Number(del[1]));
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/invoicing/invoices' && method === 'POST') {
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
      'Enter a payment or an expense by hand, or import a PayPal CSV or Excel file, or an N26 CSV export or PDFs.',
    );
  });

  // §3.142 Decision 1 (design_agent c65348 on #10539): Save records the
  // payment and nothing else; no draft is made.
  test('Enter payment by hand saves the payment only, with no client chosen, and the region says so', async ({ page }) => {
    const fake = newFake({ clients: [] });
    await open(page, fake);
    await openWaysIn(page);
    await expect(page.locator('[data-test="manual-new"]')).toHaveText('Enter payment by hand');
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Enter payment by hand' })).toBeVisible();
    await expect(page.getByText('Enter a payment you received. It is saved as paid work. To invoice it, select it in the list and use Create invoice.')).toBeVisible();

    // Nothing is sent until the required fields are filled; an empty client
    // book is no longer one of them (Decision 1: saving can add the client).
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-date-error"]')).toHaveText('Enter the date the money was received.');
    await expect(page.locator('[data-test="manual-date"]')).toBeFocused();
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);

    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('350,00');
    await page.locator('[data-test="manual-reference"]').fill('RE-17');
    // "Paid by" left empty: saved with no client, like an imported payment.
    await page.locator('[data-test="manual-note"]').fill('Wandbild Juli');
    await page.locator('[data-test="manual-save"]').click();

    await expect(page.locator('[data-test="manual-form"]')).toHaveCount(0); // the dialog closed
    const posts = fake.requests.filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.path)).toEqual(['/invoicing/payments/manual']);
    expect(JSON.parse(posts[0].body)).toEqual({
      paid_on: '2026-07-14', gross_cents: 35000, method: 'bank_transfer',
      reference: 'RE-17', sender_name: '', note: 'Wandbild Juli',
    });
    // §3.142 Decision 1's import-state line, same region the imports use.
    await expect(page.locator('[data-test="manual-summary"]')).toContainText('By hand: saved €350.00.');
  });

  // §3.142 Decision 3: before Save, the "Paid by" field says what Save will
  // do with the typed name, against Decision 4's "same"/"close"/neither.
  test('Paid by: same, close (Use or Add as new), and new all read correctly, and Save refuses an open close choice', async ({ page }) => {
    const fake = newFake({ clients: [{ id: 1, name: 'Mara Esempio' }] });
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    const payer = page.locator('[data-test="manual-payer"]');
    const line = page.locator('[data-test="manual-payer-line"]');

    // Matches the server's own one-line-of-200-runes rule (security review
    // on #10549, c65494): a pasted multi-kilobyte string must not run the
    // Decision 4 matcher against every client on each keystroke.
    await expect(payer).toHaveAttribute('maxlength', '200');

    // Empty: no line.
    await expect(line).toHaveCount(0);

    // The same as a client in the book: nothing is asked.
    await payer.fill('Mara Esempio');
    await expect(line).toHaveText('In your client book.');

    // No client close to it: Save will add it.
    await payer.fill('Totally Different Person');
    await expect(line).toHaveText('Not in your client book yet: Save adds it.');

    // Close to one: the Use/Add choice, and Save refuses while it stands open.
    await payer.fill('Mara E.');
    await expect(line).toHaveText('Close to a client in your book:');
    await expect(page.locator('[data-test="manual-payer-use-1"]')).toHaveText('Use Mara Esempio');
    await expect(page.locator('[data-test="manual-payer-add-new"]')).toHaveText('Add “Mara E.” as a new client');
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('90');
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-payer-error"]')).toHaveText('Choose a client from your book, or add “Mara E.” as a new client.');
    expect(fake.requests.some((r) => r.method === 'POST')).toBe(false);

    // Picking "Use" resolves it to the existing client.
    await page.locator('[data-test="manual-payer-use-1"]').click();
    await expect(line).toHaveText('In your client book.');
    await payer.fill('Mara E.'); // back to close, to exercise "Add as new" next
    await page.locator('[data-test="manual-payer-add-new"]').click();
    await page.locator('[data-test="manual-save"]').click();
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payments/manual');
    expect(JSON.parse(posts[0].body)).toMatchObject({ sender_name: 'Mara E.', new_client_name: 'Mara E.' });
  });

  // §3.142 Decision 3: adding a close choice edits the field, so typing again
  // re-opens Decision 4 from scratch rather than keeping a stale resolution.
  test('typing again after "Add as new" re-opens the close choice', async ({ page }) => {
    await open(page, newFake({ clients: [{ id: 1, name: 'Mara Esempio' }] }));
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    const payer = page.locator('[data-test="manual-payer"]');
    await payer.fill('Mara E.');
    await page.locator('[data-test="manual-payer-add-new"]').click();
    // Still close (b) to "Mara Esempio" — "es" prefixes "esempio" — but a
    // different string, so this proves re-evaluation happened rather than
    // the close state merely persisting unchanged.
    await payer.fill('Mara Es');
    await expect(page.locator('[data-test="manual-payer-line"]')).toHaveText('Close to a client in your book:');
  });

  // system_3 #12319, ruling 5: a choice that was made is shown as made. After
  // "Add … as a new client" the line says what Save does and the buttons go,
  // as they go after "Use"; the new client's optional fields appear.
  test('"Add as new" shows the choice as made, and typing opens it again', async ({ page }) => {
    await open(page, newFake({ clients: [{ id: 1, name: 'Mara Esempio' }] }));
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    const payer = page.locator('[data-test="manual-payer"]');
    const line = page.locator('[data-test="manual-payer-line"]');
    await payer.fill('Mara E.');
    await page.locator('[data-test="manual-payer-add-new"]').click();
    await expect(line).toHaveText('Save adds “Mara E.” as a new client.');
    await expect(page.locator('[data-test="manual-payer-choices"]')).toHaveCount(0);
    await expect(page.locator('[data-test="manual-new-client-email"]')).toBeVisible();
    await payer.fill('Mara Es');
    await expect(line).toHaveText('Close to a client in your book:');
    await expect(page.locator('[data-test="manual-payer-add-new"]')).toHaveText('Add “Mara Es” as a new client');
  });

  // §3.142 Decision 3: adding a new payer and saving are one transaction; the
  // server's own refusal (a name already in the book, raced in) surfaces as
  // the save error, never a silent duplicate.
  test('a client_exists refusal from the server surfaces as the save error', async ({ page }) => {
    const fake = newFake({ clients: [] });
    await mock(page, fake);
    await page.route(/\/api\/invoicing\/payments\/manual$/, (route) =>
      json(route, 409, { error: { code: 'client_exists', message: 'Mara Esempio is already in your client book' }, client: { id: 9, name: 'Mara Esempio' } }));
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member/personal/invoicing');
    await dismissMobileSidebarIfPresent(page);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await page.locator('[data-test="manual-payer"]').fill('Mara Esempio');
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('90');
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-error"]')).toHaveText('“Mara Esempio” is already in your client book. Pick it from the list, or use another name.');
  });

  // §3.142 Decision 1: when the save also added a client, the region's line
  // continues with that fact.
  test('a new payer saved by hand is named in the region, with the added-client clause', async ({ page }) => {
    const fake = newFake({ clients: [] });
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await page.locator('[data-test="manual-payer"]').fill('Mara Esempio');
    await expect(page.locator('[data-test="manual-payer-line"]')).toHaveText('Not in your client book yet: Save adds it.');
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('350,00');
    await page.locator('[data-test="manual-save"]').click();
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payments/manual');
    expect(JSON.parse(posts[0].body)).toEqual({
      paid_on: '2026-07-14', gross_cents: 35000, method: 'bank_transfer',
      reference: '', sender_name: 'Mara Esempio', note: '', new_client_name: 'Mara Esempio',
    });
    await expect(page.locator('[data-test="manual-summary"]')).toHaveText('By hand: saved €350.00 from Mara Esempio. Added Mara Esempio to your client book.');
  });

  test('a hand-entered payment says so, and every payment row offers Edit instead of Delete', async ({ page }) => {
    const fake = newFake({ payments: [manualRow(), manualRow({ id: 42, reference: '', method: 'cash', on_invoice: true, on_issued_invoice: true })] });
    await open(page, fake);
    const lines = page.locator('[data-test="payment-manual"]');
    // "By hand" is on the date line (§3.143 Decision 3, system_3 #10630);
    // this line adds how it was paid and the reference. Both rows share a
    // day, so the later one (id 42) comes first, newest first.
    await expect(lines.first()).toHaveText('Bar (Cash)');
    await expect(lines.nth(1)).toHaveText('Banküberweisung (Bank transfer) · RE-17');
    await expect(page.locator('[data-test="payment-row"] [data-test="row-source"]')).toHaveText(['By hand', 'By hand']);
    // §3.143 Decision 5 (system_3 #10694): the row's Edit replaces its
    // Delete, issued or not; removing moves into the edit dialog.
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (!narrow) await expect(page.locator('[data-test="payment-edit"]')).toHaveCount(2);
    await expect(page.locator('[data-test="payment-delete"]')).toHaveCount(0);
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
      // Below 640px, two or more ticked rows put Create invoice in the pair,
      // where its visible text is "As 1 invoice" (system_3 #11371).
      const create = page.locator('[data-test="create-invoice"]');
      await expect(create).toBeVisible();
      await expect(create).toHaveText(width < 640 ? 'As 1 invoice' : 'Create invoice from 2 payments');
    });
  }

  // design_agent's acceptance for the client PR (sign-off on #8409).
  for (const theme of ['light', 'dark'] as const) {
    test(`the head row reads Enter payment by hand, then Import, with no primary (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.emulateMedia({ colorScheme: theme });
      await open(page, newFake({ payments: [manualRow(), manualRow({ id: 42, transaction_id: 'M-0011223344556678' })] }));
      await openWaysIn(page);
      const [manual, imp] = await Promise.all(['manual-new', 'payments-import'].map((id) =>
        page.locator(`[data-test="${id}"]`).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, primary: el.classList.contains('btn--primary') }; })));
      const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
      if (narrow) expect(manual.y, 'phone: Enter payment by hand above Import').toBeLessThan(imp.y);
      else expect(manual.x, 'wide: Enter payment by hand left of Import').toBeLessThan(imp.x);
      expect([manual.primary, imp.primary], 'no primary in the head row').toEqual([false, false]);
      // The panel's one primary is on the toolbar: Generate invoices since
      // system_3 #11506, with Create invoice secondary beside it (§3.159
      // Decision 4). Below 640px those sit in the phone's bar, shown only
      // once a row is ticked (system_3 #11371); two rows put both buttons
      // in it (one alone offers Generate only).
      if (narrow) {
        await page.locator('[data-row-key="p40"]').getByRole('checkbox', { name: /^Select / }).check();
        await page.locator('[data-row-key="p42"]').getByRole('checkbox', { name: /^Select / }).check();
      }
      await expect(page.locator('[data-test="generate-selected"]')).toHaveClass(/btn--primary/);
      await expect(page.locator('[data-test="create-invoice"]')).toHaveClass(/btn--secondary/);
    });
  }

  // The ways-in sweep (one row or all stacked, never a partial row) lives in
  // invoicing-transactions.spec.ts since the fourth button (system_3 #10627).

  test('the dialog footer: Save payment first on a phone, Cancel then Save payment at the right when wide', async ({ page }) => {
    await open(page, newFake());
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    const save = await page.locator('[data-test="manual-save"]').boundingBox();
    const cancel = await page.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
    const narrow = await page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
    if (narrow) {
      expect(save!.y, 'phone: primary on top').toBeLessThan(cancel!.y);
    } else {
      expect(cancel!.x + cancel!.width, 'wide: Cancel before Save payment').toBeLessThanOrEqual(save!.x);
    }
  });

  test('a hand-entered row with Edit keeps the payments table inside its column', async ({ page }) => {
    await open(page, newFake({ payments: [manualRow({ sender_name: 'Galerie Nord GmbH', reference: 'RE-2026-0017' })] }));
    const box = page.locator('[data-test="payments-panel"] .data-table__scroll').first();
    test.skip((await box.count()) === 0, 'phones show payment cards, not the table');
    await expect(page.locator('[data-test="payment-edit"]')).toBeVisible();
    const [scrollWidth, clientWidth] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth - clientWidth, 'no sideways scroll').toBeLessThanOrEqual(0);
  });
});

// system_3 #11507 (epic #11497 item 5; Design ack c71154): when Save will add
// "Paid by" to the client book, what ze knows about that client can be typed
// once, here. The fields exist only while a client is about to be added.
test.describe('#11507 a new client\'s address and email, typed with the payment', () => {
  const address = (page: Page) => page.locator('[data-test="manual-new-client-address"]');
  const email = (page: Page) => page.locator('[data-test="manual-new-client-email"]');

  test('the two fields show for a new name only, and reach the request with it', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
    // Nothing typed yet: no client would be added, so no fields.
    await expect(address(page)).toHaveCount(0);
    await expect(email(page)).toHaveCount(0);

    // A name already in the book links that client: still no fields.
    await page.locator('[data-test="manual-payer"]').fill('Galerie Nord');
    await expect(address(page)).toHaveCount(0);

    // A new name: both appear, optional by their labels.
    await page.locator('[data-test="manual-payer"]').fill('Mara Esempio');
    await expect(page.getByLabel('Address (optional)')).toBeVisible();
    await expect(page.getByLabel('Email (optional)')).toHaveAttribute('type', 'email');

    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('350,00');
    await page.getByLabel('Address (optional)').fill('Via Esempio 3\n00100 Roma');
    await page.getByLabel('Email (optional)').fill('mara@example.test');
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-form"]')).toHaveCount(0);

    const posts = fake.requests.filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.path)).toEqual(['/invoicing/payments/manual']);
    expect(JSON.parse(posts[0].body)).toMatchObject({
      sender_name: 'Mara Esempio', new_client_name: 'Mara Esempio',
      new_client_address: 'Via Esempio 3\n00100 Roma', new_client_email: 'mara@example.test',
    });
  });

  test('left blank they are not sent, and a name already in the book sends neither', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await page.locator('[data-test="manual-date"]').fill('2026-07-14');
    await page.locator('[data-test="manual-amount"]').fill('90');
    await page.locator('[data-test="manual-payer"]').fill('Mara Esempio');
    await expect(address(page)).toBeVisible();
    await page.locator('[data-test="manual-save"]').click();
    await expect(page.locator('[data-test="manual-form"]')).toHaveCount(0);
    const body = JSON.parse(fake.requests.filter((r) => r.method === 'POST')[0].body);
    expect(body.new_client_name).toBe('Mara Esempio');
    expect(body).not.toHaveProperty('new_client_address');
    expect(body).not.toHaveProperty('new_client_email');
  });
});

// system_3 #11586: the dialog's date field takes the page theme's colour
// scheme from the design system, not the OS's (it used to say
// `color-scheme: light dark`, which follows the OS).
test.describe('#11586 the hand-entry date field follows the page theme, not the OS', () => {
  for (const [theme, os] of [['dark', 'light'], ['light', 'dark']] as const) {
    test(`${theme} theme on a ${os} OS: the date field computes ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
      await open(page, newFake({ clients: [] }));
      await openWaysIn(page);
      await page.locator('[data-test="manual-new"]').click();
      const date = page.locator('[data-test="manual-date"]');
      await expect(date).toBeVisible();
      expect(await date.evaluate((el) => getComputedStyle(el).colorScheme)).toBe(theme);
    });
  }
});

// system_3 #12295: a look-alike is asked about once and never refused. The
// server finds it (PR 252); the dialog asks, offers the row, and the second
// press saves. That press follows #12313's rule: deaf for 600 ms after the
// question appears, so a double tap on Save does not also answer it.
test.describe('#12295 the same payment typed twice', () => {
  const lena = () => manualRow({ id: 40, method: 'cash', reference: '', paid_on: '2026-08-03T00:00:00Z', gross_cents: 7000, sender_name: 'Lena Maier', client_id: null, note: 'Skizze' });
  const QUESTION = 'A payment of €70.00 from Lena Maier on that day is already in your book.';

  async function typeLena(page: Page, amount = '70,00') {
    await openWaysIn(page);
    await page.locator('[data-test="manual-new"]').click();
    await page.locator('[data-test="manual-date"]').fill('2026-08-03');
    await page.locator('[data-test="manual-amount"]').fill(amount);
    await page.locator('[data-test="manual-payer"]').fill('Lena Maier');
  }
  const posts = (fake: Fake) => fake.requests.filter((r) => r.method === 'POST' && r.path === '/invoicing/payments/manual');

  test('Save asks, saves nothing, and "Save as a second payment" saves it after a moment', async ({ page }) => {
    const twin = lena();
    const fake = newFake({ payments: [twin], twin });
    await open(page, fake);
    await typeLena(page);
    // A fixed clock from here: the second press stays too soon until the test
    // moves it. It is set only once the dialog is open, because a frozen clock
    // stops AspModal's open from finishing.
    await page.clock.setFixedTime(new Date('2026-08-10T10:00:00Z'));
    const save = page.locator('[data-test="manual-save"]');
    await expect(save).toHaveText('Save payment');
    await save.click();

    const question = page.locator('[data-test="manual-twin"]');
    await expect(question).toHaveAttribute('role', 'status');
    await expect(page.locator('[data-test="manual-twin-line"]')).toHaveText(QUESTION);
    await expect(page.locator('[data-test="manual-twin-open"]')).toHaveText('Open');
    await expect(save).toHaveText('Save as a second payment');
    await expect(page.locator('[data-test="manual-error"]')).toHaveCount(0);
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();
    expect(posts(fake)).toHaveLength(1);
    expect(JSON.parse(posts(fake)[0].body)).not.toHaveProperty('confirm_duplicate');

    // The press of a double tap, within 600 ms of the question: not taken.
    await save.click();
    await page.waitForTimeout(300);
    expect(posts(fake)).toHaveLength(1);
    await expect(page.locator('[data-test="manual-form"]')).toBeVisible();

    // A moment later the press saves, with the confirmation.
    await page.clock.setFixedTime(new Date('2026-08-10T10:00:00.700Z'));
    await save.click();
    await expect(page.locator('[data-test="manual-form"]')).toHaveCount(0);
    expect(posts(fake)).toHaveLength(2);
    expect(JSON.parse(posts(fake)[1].body)).toMatchObject({ paid_on: '2026-08-03', gross_cents: 7000, sender_name: 'Lena Maier', confirm_duplicate: true });
  });

  // design c78412 on system_3 #12295 (§3.173 Decision 1): the footer reads
  // the refusal line, then the question, then the buttons. The two show
  // together only when the second press is refused.
  test('a refused second press: the refusal line, then the question, then the buttons', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const twin = lena();
    const fake = newFake({ payments: [twin], twin });
    await open(page, fake);
    await typeLena(page);
    await page.clock.setFixedTime(new Date('2026-08-10T10:00:00Z'));
    const save = page.locator('[data-test="manual-save"]');
    await save.click();
    await expect(save).toHaveText('Save as a second payment');

    await page.route(/\/api\/invoicing\/payments\/manual$/, (route) =>
      json(route, 500, { error: { code: 'internal', message: 'The payment could not be saved. Try again.' } }));
    await page.clock.setFixedTime(new Date('2026-08-10T10:00:00.700Z'));
    await save.click();

    const refusal = page.locator('[data-test="manual-error"]');
    const question = page.locator('[data-test="manual-twin"]');
    // A code without a sentence of its own reads the fallback (#12300).
    await expect(refusal).toHaveText('This could not be saved.');
    await expect(question).toBeVisible();
    await expect(save).toHaveText('Save as a second payment');
    const [r, q, s] = await Promise.all([refusal, question, save].map((l) => l.boundingBox()));
    expect(r!.y + r!.height).toBeLessThanOrEqual(q!.y + 1);
    expect(q!.y + q!.height).toBeLessThanOrEqual(s!.y + 1);
    for (const l of [refusal, question, save]) await expect(l).toBeInViewport();
  });

  test('changing the day, the amount or the payer clears the question', async ({ page }) => {
    const twin = lena();
    const fake = newFake({ payments: [twin], twin });
    await open(page, fake);
    const save = page.locator('[data-test="manual-save"]');
    const question = page.locator('[data-test="manual-twin"]');
    await typeLena(page);
    for (const [field, other, back] of [
      ['manual-amount', '71,00', '70,00'],
      ['manual-date', '2026-08-04', '2026-08-03'],
      ['manual-payer', 'Lena Meier', 'Lena Maier'],
    ]) {
      await save.click();
      await expect(question).toBeVisible();
      await page.locator(`[data-test="${field}"]`).fill(other);
      await expect(question).toHaveCount(0);
      await expect(save).toHaveText('Save payment');
      await page.locator(`[data-test="${field}"]`).fill(back);
      await expect(question).toHaveCount(0);
    }
    // The note is not part of the question: changing it keeps it.
    await save.click();
    await expect(question).toBeVisible();
    await page.locator('[data-test="manual-note"]').fill('Skizze 2');
    await expect(question).toBeVisible();
    // No press ever confirmed.
    expect(posts(fake).every((r) => !('confirm_duplicate' in JSON.parse(r.body)))).toBe(true);
  });

  test('"Open" asks first about what was typed, then opens that payment', async ({ page }) => {
    const twin = lena();
    const fake = newFake({ payments: [twin], twin });
    await open(page, fake);
    await typeLena(page);
    await page.locator('[data-test="manual-save"]').click();
    await page.locator('[data-test="manual-twin-open"]').click();
    // Something is typed, so the exit asks (§3.166); Keep editing stays.
    await expect(page.locator('[data-test="unsent-ask"]')).toBeVisible();
    await page.locator('[data-test="unsent-keep"]').click();
    await expect(page.getByRole('dialog', { name: 'Enter payment by hand' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Edit payment' })).toHaveCount(0);
    // Asked again, and discarded: that payment opens.
    await page.locator('[data-test="manual-twin-open"]').click();
    await page.locator('[data-test="unsent-discard"]').click();
    await expect(page.getByRole('dialog', { name: 'Enter payment by hand' })).toHaveCount(0);
    const edit = page.getByRole('dialog', { name: 'Edit payment' });
    await expect(edit).toBeVisible();
    await expect(edit.locator('[data-test="manual-amount"]')).toHaveValue('70');
    await expect(edit.locator('[data-test="manual-note"]')).toHaveValue('Skizze');
  });

  // The door is a touch control on a phone: the house's 44px.
  test('at 390px the question wraps before its door, and the door is 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const twin = lena();
    const fake = newFake({ payments: [twin], twin });
    await open(page, fake);
    await typeLena(page);
    await page.locator('[data-test="manual-save"]').click();
    const line = await page.locator('[data-test="manual-twin-line"]').boundingBox();
    const door = await page.locator('[data-test="manual-twin-open"]').boundingBox();
    expect(door!.height).toBeGreaterThanOrEqual(44);
    expect(door!.y).toBeGreaterThanOrEqual(line!.y + line!.height - 1);
  });
});
