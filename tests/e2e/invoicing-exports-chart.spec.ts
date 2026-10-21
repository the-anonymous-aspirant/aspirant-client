import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, E3 (system_3 #8367-E3): the Excel workbook and Jobcenter
 *  bundle downloads (behind the §5 validation screen) and the invoices-per-
 *  month chart. Catch-all /api/ → 404 first. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const inv = (id: number, issue: string) => ({ id, status: 'issued', client_name: 'Galerie Nord', invoice_number: `2026-00${id}`, issue_date: `${issue}T00:00:00Z`, service_date_from: `${issue}T00:00:00Z`, total_cents: 1000, currency: 'EUR' });

interface Fake {
  issued: Json[];
  validation: Json;
  requests: string[];
}

async function open(page: Page, fake: Fake): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-09-15T12:00:00Z'));
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    fake.requests.push(path + url.search);
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 4 } });
    if (path === '/invoicing/clients' || path === '/invoicing/payments') return json(route, 200, { clients: [], payments: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: fake.issued });
    if (path === '/invoicing/validation') return json(route, 200, fake.validation);
    if (path === '/invoicing/export/workbook.xlsx') return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'PK' });
    if (path === '/invoicing/export/jobcenter-bundle.zip') return route.fulfill({ status: 200, contentType: 'application/zip', body: 'PK' });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
  await seedTrustedSessionAs(page, 'flowah');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
}

const newFake = (): Fake => ({
  issued: [inv(1, '2026-07-03'), inv(2, '2026-07-28'), inv(3, '2026-09-02')],
  validation: { ok: true, violations: [], warnings: [] },
  requests: [],
});

test.describe('#8367 Invoices app — workbook and bundle downloads, chart', () => {
  test('the Excel workbook downloads after a clean validation', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const download = page.waitForEvent('download');
    await page.locator('[data-test="export-workbook"]').click();
    expect((await download).suggestedFilename()).toBe('Rechnungen.xlsx');
    expect(fake.requests).toContain('/invoicing/validation');
  });

  test('the Jobcenter bundle downloads after a clean validation', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const download = page.waitForEvent('download');
    await page.locator('[data-test="export-bundle"]').click();
    expect((await download).suggestedFilename()).toBe('Jobcenter-Nachweise.zip');
  });

  test('a violation blocks both downloads', async ({ page }) => {
    const fake = newFake();
    fake.validation = { ok: false, violations: [{ code: 'pdf_missing', message: 'issued invoice 3 has no stored PDF' }], warnings: [] };
    await open(page, fake);
    for (const button of ['export-workbook', 'export-bundle']) {
      await page.locator(`[data-test="${button}"]`).click();
      await expect(page.locator('[data-test="validation-violations"]')).toContainText('no stored PDF');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    expect(fake.requests.some((r) => r.startsWith('/invoicing/export/'))).toBe(false);
  });

  test('the chart counts issued invoices per month, zero-filled to this month', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const chart = page.locator('[data-test="invoices-chart"]');
    await expect(chart).toHaveAttribute('data-labels', 'Jul 2026,Aug 2026,Sep 2026');
    await expect(chart).toHaveAttribute('data-counts', '2,0,1');
    expect(fake.requests).toContain('/invoicing/invoices?status=issued');
  });

  test('with nothing issued the chart says so', async ({ page }) => {
    const fake = newFake();
    fake.issued = [];
    await open(page, fake);
    await expect(page.locator('[data-test="invoices-chart-empty"]')).toBeVisible();
  });
});
