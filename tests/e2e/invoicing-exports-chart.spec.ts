import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Invoices app, E3 (system_3 #8367-E3, #9897): the issued-invoices ZIP
 *  download (behind the §5 validation screen) and the invoices-per-month
 *  chart. Catch-all /api/ → 404 first. */

type Json = Record<string, any>;

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const inv = (id: number, issue: string) => ({ id, status: 'issued', client_name: 'Galerie Nord', invoice_number: `2026-00${id}`, issue_date: `${issue}T00:00:00Z`, service_date_from: `${issue}T00:00:00Z`, total_cents: 1000, currency: 'EUR' });

interface Fake {
  clients?: Json[];
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
    if (path === '/invoicing/clients' || path === '/invoicing/payments') return json(route, 200, { clients: fake.clients || [], payments: [] });
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: fake.issued });
    if (path === '/invoicing/validation') return json(route, 200, fake.validation);
    if (path === '/invoicing/export/invoices.zip') return route.fulfill({ status: 200, contentType: 'application/zip', body: 'PK' });
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: 'Invoices' }).click();
}

const newFake = (): Fake => ({
  issued: [inv(1, '2026-07-03'), inv(2, '2026-07-28'), inv(3, '2026-09-02')],
  validation: { ok: true, violations: [], warnings: [] },
  requests: [],
});

test.describe('#8367 Invoices app — ZIP download, chart', () => {
  test('the issued invoices ZIP downloads after a clean validation', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const zip = page.locator('[data-test="export-zip"]');
    await expect(zip).toHaveText('Issued invoices (PDF, ZIP)');
    const download = page.waitForEvent('download');
    await zip.click();
    expect((await download).suggestedFilename()).toBe('Rechnungen.zip');
    expect(fake.requests).toContain('/invoicing/export/invoices.zip');
  });

  test('a violation blocks the download', async ({ page }) => {
    const fake = newFake();
    fake.validation = { ok: false, violations: [{ code: 'pdf_missing', message: 'Invoice 2026-003 has no PDF.' }], warnings: [] };
    await open(page, fake);
    await page.locator('[data-test="export-zip"]').click();
    await expect(page.locator('[data-test="validation-violations"]')).toContainText('Invoice 2026-003 has no PDF.');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    expect(fake.requests.some((r) => r.startsWith('/invoicing/export/'))).toBe(false);
  });

  test('the chart counts issued invoices per month, zero-filled to this month', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const chart = page.locator('[data-test="invoices-chart"]');
    await expect(chart).toHaveAttribute('data-labels', 'Jul 2026,Aug 2026,Sep 2026');
    await expect(chart).toHaveAttribute('data-counts', '2,0,1');
    // #9972: one unfiltered read feeds the counts and the income.
    expect(fake.requests).toContain('/invoicing/invoices');
  });

  test('with nothing issued the chart says so', async ({ page }) => {
    const fake = newFake();
    fake.issued = [];
    await open(page, fake);
    await expect(page.locator('[data-test="invoices-chart-empty"]')).toBeVisible();
  });
});

// system_3 #9972 (operator c61586): clients over time (cumulative), EUR income
// and invoices issued per month, on one month axis. Income counts issued
// invoices only, like the invoice count. Dating (operator c61853, #10005):
// income and clients by the service period, invoices by the issue date.
const served = (id: number, client: number, service: string, issue: string, cents: number) => ({
  ...inv(id, issue), client_id: client, service_date_from: `${service}T00:00:00Z`, total_cents: cents,
});

test.describe('#9972 Invoices app: the statistics', () => {
  test('income and clients follow the service month, invoices the issue month, all on one axis', async ({ page }) => {
    const fake = newFake();
    fake.issued = [
      served(1, 1, '2026-06-20', '2026-07-03', 35000),
      served(2, 1, '2026-07-10', '2026-07-28', 12000),
      served(3, 2, '2026-08-25', '2026-09-02', 9000),
      // Cancelled and draft count for nothing: client 3 has no issued invoice.
      { ...served(4, 3, '2026-05-01', '2026-08-10', 50000), status: 'cancelled' },
      { ...served(5, 3, '2026-08-11', '2026-08-11', 7000), status: 'draft', invoice_number: null, issue_date: null },
    ];
    // A client with no invoice at all is not counted either.
    fake.clients = [{ id: 4, name: 'D', created_at: '2026-06-01T10:00:00Z' }];
    await open(page, fake);
    const chart = page.locator('[data-test="invoices-chart"]');
    await expect(chart).toHaveAttribute('data-labels', 'Jun 2026,Jul 2026,Aug 2026,Sep 2026');
    await expect(chart).toHaveAttribute('data-clients', '1,1,2,2');
    await expect(chart).toHaveAttribute('data-income', '350,120,90,0');
    await expect(chart).toHaveAttribute('data-counts', '0,2,0,1');
    for (const id of ['stat-clients', 'stat-income', 'stat-invoices']) {
      await expect(page.locator(`[data-test="${id}"] .asp-chart[data-rendered="true"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-test="stat-clients-range"]')).toHaveText('running total; each client counts from the month of the work on their first issued invoice');
    await expect(page.locator('[data-test="stat-income-range"]')).toHaveText('issued invoices, by the month the work was done; this month so far');
  });

  test('clients without an issued invoice leave the statistics empty', async ({ page }) => {
    const fake = newFake();
    fake.issued = [{ ...served(4, 3, '2026-05-01', '2026-08-10', 50000), status: 'cancelled' }];
    fake.clients = [{ id: 3, name: 'C', created_at: '2026-06-01T10:00:00Z' }];
    await open(page, fake);
    await expect(page.locator('[data-test="invoices-chart-empty"]')).toHaveText('No issued invoices yet.');
  });

  // design_agent on #10005: the shared month axis only pays off if the months
  // line up, so the plot areas and month positions are measured.
  for (const width of [1440, 390]) {
    test(`at ${width}px the three plot areas line up and a month sits at one x`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const fake = newFake();
      fake.issued = [served(1, 1, '2026-06-20', '2026-07-03', 35000), served(3, 2, '2026-08-25', '2026-09-02', 9000)];
      await open(page, fake);
      const ids = ['stat-clients', 'stat-income', 'stat-invoices'];
      const probe = async (id: string) => {
        const el = page.locator(`[data-test="${id}"] .asp-chart`);
        await expect(el).toHaveAttribute('data-month-x', /\d/);
        return {
          left: Number(await el.getAttribute('data-plot-left')),
          right: Number(await el.getAttribute('data-plot-right')),
          xs: (await el.getAttribute('data-month-x'))!.split(',').map(Number),
          top: (await el.boundingBox())!.x,
        };
      };
      const [c, i, n] = [await probe(ids[0]), await probe(ids[1]), await probe(ids[2])];
      for (const other of [i, n]) {
        expect(Math.abs(other.top + other.left - (c.top + c.left)), 'plot left edges').toBeLessThanOrEqual(1);
        expect(Math.abs(other.top + other.right - (c.top + c.right)), 'plot right edges').toBeLessThanOrEqual(1);
        other.xs.forEach((x, k) => expect(Math.abs(other.top + x - (c.top + c.xs[k])), `month ${k} x`).toBeLessThanOrEqual(1));
      }
      const totals = (await page.locator('[data-test="invoices-chart"]').getAttribute('data-clients'))!.split(',').map(Number);
      totals.slice(1).forEach((v, k) => expect(v, 'the running total never drops').toBeGreaterThanOrEqual(totals[k]));
    });
  }
});
