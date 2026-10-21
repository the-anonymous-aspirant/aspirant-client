import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, D2 (system_3 #8367-D2): the review list with filters and
 *  search, the issued-invoice detail (PDF preview, payments, history), and
 *  exports behind the §5 validation screen. Catch-all /api/ → 404 first. */

type Json = Record<string, any>;

const issued = { id: 100, status: 'issued', client_id: 1, client_name: 'Galerie Nord', service_date_from: '2026-07-14T00:00:00Z', service_date_to: '2026-07-14T00:00:00Z', currency: 'EUR', invoice_number: '2026-001', issue_date: '2026-10-21T00:00:00Z', total_cents: 35000 };
const cancelled = { ...issued, id: 101, status: 'cancelled', invoice_number: '2026-002', client_name: 'Anna Example', client_id: 2 };
const draft = { ...issued, id: 102, status: 'draft', invoice_number: null, issue_date: null, client_name: 'Galerie Nord' };

interface Fake {
  validation: Json;
  listCalls: URLSearchParams[];
  requests: string[];
  audit: Json[];
}

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockAll(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    fake.requests.push(path + url.search);
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'Weg 1', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 3 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [{ id: 1, name: 'Galerie Nord', address: 'x' }, { id: 2, name: 'Anna Example', address: 'y' }] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/invoices') {
      fake.listCalls.push(url.searchParams);
      let rows = [issued, cancelled, draft];
      const status = url.searchParams.get('status');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      if (status) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => r.client_name.toLowerCase().includes(q));
      if (url.searchParams.get('issued_from') === '2026-12-01') rows = [];
      return json(route, 200, { invoices: rows });
    }
    if (path === '/invoicing/invoices/100') {
      return json(route, 200, { invoice: issued, line_items: [{ id: 1, position: 1, description: 'Wandbild Juli', quantity_milli: 1000, unit_price_cents: 35000, line_total_cents: 35000 }], payments: [{ id: 10, transaction_id: '1AA11111AA1111111', paid_on: '2026-07-14T00:00:00Z', gross_cents: 35000, currency: 'EUR' }], warnings: [] });
    }
    if (path === '/invoicing/invoices/100/pdf') return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: fake.audit });
    if (path === '/invoicing/validation') return json(route, 200, fake.validation);
    if (path === '/invoicing/export/invoices.csv') return route.fulfill({ status: 200, contentType: 'text/csv', body: '\ufeffRechnungsnummer;Status\n2026-001;issued\n' });
    if (path === '/invoicing/invoices/100/export.csv') return route.fulfill({ status: 200, contentType: 'text/csv', body: '\ufeffRechnungsnummer;Pos.\n2026-001;1\n' });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
}

function newFake(): Fake {
  return {
    validation: { ok: true, violations: [], warnings: [] },
    listCalls: [],
    requests: [],
    audit: [
      { id: 2, action: 'issue', entity_type: 'invoice', entity_id: 100, created_at: '2026-10-21T10:00:00Z', details: '<b>not markup</b>' },
      { id: 1, action: 'create', entity_type: 'invoice', entity_id: 100, created_at: '2026-10-20T09:00:00Z', details: '' },
    ],
  };
}

async function openInvoicesTab(page: Page, fake: Fake): Promise<void> {
  await mockAll(page, fake);
  await seedTrustedSessionAs(page, 'flowah');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(3);
}

test.describe('#8367 Invoices app — review list, detail, validated exports', () => {
  test('status, date and client filters are sent to the server and narrow the list', async ({ page }) => {
    const fake = newFake();
    await openInvoicesTab(page, fake);

    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Issued' }).click();
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
    expect(fake.listCalls.at(-1)!.get('status')).toBe('issued');

    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'All statuses' }).click();
    await page.getByLabel('Search by client name').fill('anna');
    await expect(page.locator('[data-test="invoice-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="invoice-row"]')).toContainText('2026-002');
    expect(fake.listCalls.at(-1)!.get('q')).toBe('anna');

    await page.getByLabel('Search by client name').fill('');
    await page.locator('[data-test="filter-from"]').fill('2026-12-01');
    await expect(page.locator('[data-test="invoices-filtered-empty"]')).toBeVisible();
    expect(fake.listCalls.at(-1)!.get('issued_from')).toBe('2026-12-01');
  });

  test('a clean validation downloads all invoices as CSV', async ({ page }) => {
    const fake = newFake();
    await openInvoicesTab(page, fake);
    const download = page.waitForEvent('download');
    await page.locator('[data-test="export-all-csv"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Rechnungen.csv');
    await expect(page.locator('[data-test="validation-ok"]')).toBeVisible();
  });

  test('violations block the export and are listed; the CSV is never requested', async ({ page }) => {
    const fake = newFake();
    fake.validation = { ok: false, violations: [{ code: 'number_gap', message: 'numbers under "2026" jump from 1 to 3' }], warnings: [] };
    await openInvoicesTab(page, fake);
    await page.locator('[data-test="export-all-csv"]').click();
    await expect(page.locator('[data-test="validation-blocked"]')).toBeVisible();
    await expect(page.locator('[data-test="validation-violations"]')).toContainText('jump from 1 to 3');
    await expect(page.locator('[data-test="validation-download-anyway"]')).toHaveCount(0);
    expect(fake.requests.some((r) => r.startsWith('/invoicing/export/invoices.csv'))).toBe(false);
  });

  test('warnings alone are shown and can be accepted', async ({ page }) => {
    const fake = newFake();
    fake.validation = { ok: true, violations: [], warnings: [{ code: 'total_mismatch_payments', message: 'invoice 100 totals 35000 cents, its payments 34000 cents' }] };
    await openInvoicesTab(page, fake);
    await page.locator('[data-test="export-all-csv"]').click();
    await expect(page.locator('[data-test="validation-warnings"]')).toContainText('its payments 34000 cents');
    const download = page.waitForEvent('download');
    await page.locator('[data-test="validation-download-anyway"]').click();
    expect((await download).suggestedFilename()).toBe('Rechnungen.csv');
  });

  test('an issued invoice shows its payments, history and (on desktop) the PDF preview', async ({ page }, testInfo) => {
    const fake = newFake();
    await openInvoicesTab(page, fake);
    await page.locator('[data-test="invoice-row"][data-status="issued"]').click();
    await expect(page.locator('[data-test="invoice-number"]')).toHaveText('2026-001');

    await expect(page.locator('[data-test="invoice-payments"]')).toContainText('1AA11111AA1111111');
    const events = page.locator('[data-test="history-event"]');
    await expect(events).toHaveCount(2);
    await expect(events.first()).toContainText('Issued');
    await expect(events.nth(1)).toContainText('Draft created');
    expect(fake.requests).toContain('/invoicing/audit-events?entity_type=invoice&entity_id=100');

    const preview = page.locator('[data-test="invoice-pdf-preview"]');
    if (testInfo.project.name === 'mobile-safari') {
      await expect(preview).toHaveCount(0);
      await expect(page.locator('[data-test="invoice-pdf"]')).toBeVisible();
    } else {
      // A blob: URL of the fetched PDF: the stored PDF is served as an
      // attachment, which an <iframe> would download instead of showing.
      await expect(preview).toHaveAttribute('src', /^blob:/);
      expect(fake.requests).toContain('/invoicing/invoices/100/pdf');
    }
  });

  test('a single invoice downloads as CSV after validation', async ({ page }) => {
    const fake = newFake();
    await openInvoicesTab(page, fake);
    await page.locator('[data-test="invoice-row"][data-status="issued"]').click();
    // Headless Chromium has no PDF viewer, so the preview may raise its own
    // download; wait for the CSV one.
    const download = page.waitForEvent('download', (d) => d.suggestedFilename().endsWith('.csv'));
    await page.locator('[data-test="invoice-csv"]').click();
    expect((await download).suggestedFilename()).toBe('Rechnung-2026-001.csv');
  });
});
