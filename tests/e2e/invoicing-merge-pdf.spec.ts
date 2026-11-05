import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app (system_3 #9960, the client half of #9956): tick issued
 *  invoices and download them as one PDF, behind the §5 validation screen.
 *  Built to design_agent's Design ack c61504 on #9960. Catch-all /api/ → 404
 *  first; every invoicing call the Invoices tab makes is stubbed below. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const inv = (id: number, status: string, number: string | null) => ({
  id,
  status,
  client_name: 'Galerie Nord',
  invoice_number: number,
  issue_date: number ? '2026-09-02T00:00:00Z' : null,
  service_date_from: '2026-09-01T00:00:00Z',
  total_cents: 1000 * id,
  currency: 'EUR',
});

interface Fake {
  invoices: Json[];
  validation: Json;
  merged: { status: number; body?: Json };
  requests: string[];
}

const newFake = (): Fake => ({
  invoices: [
    inv(3, 'issued', '2026-003'),
    inv(2, 'cancelled', '2026-002'),
    inv(1, 'issued', '2026-001'),
    inv(4, 'draft', null),
  ],
  validation: { ok: true, violations: [], warnings: [] },
  merged: { status: 200 },
  requests: [],
});

async function open(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    fake.requests.push(path + url.search);
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 5 } });
    if (path === '/invoicing/clients' || path === '/invoicing/payments') return json(route, 200, { clients: [], payments: [] });
    if (path === '/invoicing/invoices') {
      const status = url.searchParams.get('status');
      return json(route, 200, { invoices: fake.invoices.filter((i) => !status || i.status === status) });
    }
    if (path === '/invoicing/validation') return json(route, 200, fake.validation);
    if (path === '/invoicing/export/invoices-merged.pdf') {
      if (fake.merged.status !== 200) return json(route, fake.merged.status, fake.merged.body || {});
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4' });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(fake.invoices.length);
}

const rowFor = (page: Page, number: string) => page.locator('[data-test="invoice-row"]', { hasText: number });
const tick = (page: Page, number: string) =>
  page.getByRole('checkbox', { name: `Select invoice ${number}` });
const download = (page: Page) => page.locator('[data-test="download-merged"]');
const scope = (page: Page) => page.locator('[data-test="export-merged-scope"]');
const LABEL = 'Invoice list (single PDF)';

test.describe('#9960 Invoices — select and download as one PDF', () => {
  test('only issued rows carry a checkbox, and the left-out line says why', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(page.locator('[data-test="invoice-select"]')).toHaveCount(2);
    await expect(tick(page, '2026-001')).toBeVisible();
    await expect(tick(page, '2026-003')).toBeVisible();
    await expect(tick(page, '2026-002')).toHaveCount(0);
    await expect(page.locator('[data-test="merge-left-out"]')).toHaveText(
      "Drafts and cancelled invoices are left out: a draft has no PDF yet, and a cancelled invoice's PDF does not show it was cancelled.",
    );
  });

  test('with nothing ticked the button is disabled and the caption says how', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await expect(download(page)).toBeDisabled();
    await expect(download(page)).toHaveText(LABEL);
    await expect(scope(page)).toHaveText('Tick issued invoices in the list to get them in one PDF.');
  });

  test('a filter change unselects the rows it hides, so the count is only rows on screen', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await tick(page, '2026-001').check();
    await tick(page, '2026-003').check();
    await expect(scope(page)).toHaveText('2 ticked invoices in one PDF, in number order.');
    await expect(download(page)).toHaveText(LABEL);
    await expect(download(page)).toBeEnabled();
    fake.invoices = fake.invoices.filter((i) => i.id !== 1);
    await page.locator('[data-test="filter-search"] input, input[data-test="filter-search"]').first().fill('Galerie');
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(3);
    await expect(scope(page)).toHaveText('1 ticked invoice in one PDF.');
  });

  test('select-all ticks every shown issued row and reads indeterminate on a partial selection', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const all = page.locator('[data-test="select-all-shown"]').getByRole('checkbox');
    await tick(page, '2026-001').check();
    expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await all.check();
    await expect(tick(page, '2026-003')).toBeChecked();
    await expect(scope(page)).toHaveText('2 ticked invoices in one PDF, in number order.');
    await all.uncheck();
    await expect(download(page)).toBeDisabled();
  });

  test('select-all is absent when no shown row is issued', async ({ page }) => {
    const fake = newFake();
    fake.invoices = fake.invoices.filter((i) => i.status !== 'issued');
    await open(page, fake);
    await expect(page.locator('[data-test="select-all-shown"]').getByRole('checkbox')).toHaveCount(0);
    await expect(download(page)).toBeDisabled();
  });

  test('the ticked invoices download as Rechnungen.pdf after a clean validation', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await tick(page, '2026-003').check();
    await tick(page, '2026-001').check();
    const file = page.waitForEvent('download');
    await download(page).click();
    expect((await file).suggestedFilename()).toBe('Rechnungen.pdf');
    expect(fake.requests).toContain('/invoicing/export/invoices-merged.pdf?ids=1,3');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    // The selection is kept: a download changes no row.
    await expect(scope(page)).toHaveText('2 ticked invoices in one PDF, in number order.');
  });

  test('a refused invoice is named under the selection row, and the selection is kept', async ({ page }) => {
    const fake = newFake();
    fake.merged = {
      status: 422,
      body: { error: { code: 'invoice_cancelled', message: 'invoice 2026-003 is cancelled; its stored PDF does not show that, so it is left out of a merged download' } },
    };
    await open(page, fake);
    await tick(page, '2026-003').check();
    await download(page).click();
    await expect(page.locator('[data-test="download-error"]')).toContainText('invoice 2026-003 is cancelled');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const alert = page.locator('[data-test="merge-error"]');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toContainText('invoice 2026-003 is cancelled');
    await expect(scope(page)).toHaveText('1 ticked invoice in one PDF.');
  });

  test('a tick does not open the invoice; a click on the row does', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    await tick(page, '2026-001').check();
    await expect(tick(page, '2026-001')).toBeChecked();
    expect(fake.requests.some((r) => r.startsWith('/invoicing/invoices/'))).toBe(false);
    await expect(page.locator('[data-test="invoice-editor"]')).toHaveCount(0);
    // Keyboard too: Space on a focused checkbox toggles it, it does not open the row.
    await tick(page, '2026-003').focus();
    await page.keyboard.press('Space');
    await expect(tick(page, '2026-003')).toBeChecked();
    expect(fake.requests.some((r) => r.startsWith('/invoicing/invoices/'))).toBe(false);
    await rowFor(page, '2026-001').getByText('Galerie Nord').click();
    await expect.poll(() => fake.requests.some((r) => r.startsWith('/invoicing/invoices/1'))).toBe(true);
  });
});
