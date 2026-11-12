import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession, seedTrustedSessionAs } from './helpers/mockBackend';

/** Failed invoice-import uploads (system_3 #10536/#10564): an Admin page that
 *  lists them and fetches a kept copy, and one line on the Payments tab that
 *  says up front what happens to a file that fails (security ruling c65222). */

type Json = Record<string, any>;
const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const row = (over: Json = {}) => ({
  ID: 1, OwnerUserID: 1, CreatedAt: '2026-11-11T10:00:00Z', ImportKind: 'n26', Filename: 'statement.pdf',
  SizeBytes: 2048, SHA256: 'ab', ErrorCode: 'parse_failed',
  ErrorMessage: 'the file was recognised but a field was missing or malformed',
  DocumentKind: '', CandidateCount: 0, CopyPath: 'copy-1', CopyDeletedAt: null,
  copy_expires_at: '2026-11-18T10:00:00Z', overdue: false, ...over,
});

const FOUR_KINDS = [
  row({ ID: 1, Filename: 'kept.pdf', DocumentKind: 'n26_account_statement' }),
  row({ ID: 2, Filename: 'gone.pdf', CopyDeletedAt: '2026-11-10T00:00:00Z', copy_expires_at: undefined }),
  row({ ID: 3, Filename: 'late.pdf', overdue: true }),
  row({ ID: 4, Filename: 'big.csv', ImportKind: 'paypal', ErrorCode: 'too_large', ErrorMessage: 'the file is larger than 5 MB',
        CopyPath: '', CopyDeletedAt: '2026-11-11T10:00:00Z', copy_expires_at: undefined }),
];

async function openPage(page: Page, list: (route: Route) => Promise<void>): Promise<void> {
  await seedAdminSession(page);
  await page.route('**/api/admin/invoicing/import-failures', list);
  await page.goto('/admin/import-failures');
  await dismissMobileSidebarIfPresent(page);
}

test.describe('#10564 Admin — failed imports', () => {
  test('each status reads correctly, and Download shows only while a copy can be fetched', async ({ page }) => {
    await openPage(page, (r) => json(r, 200, { status: 'success', data: { failures: FOUR_KINDS } }));
    const rows = page.locator('[data-test="import-failure-row"]');
    await expect(rows).toHaveCount(4);
    const status = (name: string) => rows.filter({ hasText: name }).locator('[data-test="import-failure-status"]');
    await expect(status('kept.pdf')).toHaveText('Copy kept until 18 Nov');
    await expect(status('gone.pdf')).toHaveText('Copy deleted');
    await expect(status('late.pdf')).toHaveText('Past its window, deleted within the hour');
    await expect(status('big.csv')).toHaveText('No copy kept');
    // Absent, not disabled, where nothing on the page can fetch a copy.
    await expect(page.locator('[data-test="import-failure-download"]')).toHaveCount(1);
    await expect(rows.filter({ hasText: 'kept.pdf' }).locator('[data-test="import-failure-download"]')).toBeVisible();
    // The detected kind joins the line when there is one, and is left out
    // when there isn't (design_agent c65576).
    await expect(rows.filter({ hasText: 'kept.pdf' })).toContainText(
      'N26 · Account statement · the file was recognised but a field was missing or malformed · 2.0 KB');
    await expect(rows.filter({ hasText: 'big.csv' })).toContainText('PayPal · the file is larger than 5 MB · 2.0 KB');
    // Date and time, in her clock: 10:00Z is 11:00 in Berlin in November.
    await expect(rows.filter({ hasText: 'kept.pdf' })).toContainText('11 Nov 2026, 11:00');
  });

  test('a filename is rendered as text, never as markup', async ({ page }) => {
    await openPage(page, (r) => json(r, 200, { status: 'success', data: { failures: [row({ Filename: '<img src=x onerror=alert(1)>.pdf' })] } }));
    await expect(page.locator('[data-test="import-failure-row"]')).toContainText('<img src=x onerror=alert(1)>.pdf');
    await expect(page.locator('[data-test="import-failure-row"] img')).toHaveCount(0);
  });

  test('Download fetches that row\'s copy; a refusal is shown on the row', async ({ page }) => {
    let fetched = '';
    await page.route('**/api/admin/invoicing/import-failures/*/download', (r) => {
      fetched = new URL(r.request().url()).pathname;
      return json(r, 500, { error: { code: 'internal_error', message: 'Error recording the download' } });
    });
    await openPage(page, (r) => json(r, 200, { status: 'success', data: { failures: [row()] } }));
    await page.locator('[data-test="import-failure-download"]').click();
    await expect(page.locator('[data-test="import-failure-error"]')).toHaveText('Error recording the download');
    expect(fetched).toBe('/api/admin/invoicing/import-failures/1/download');
  });

  test('empty and failed read differently', async ({ page }) => {
    await openPage(page, (r) => json(r, 200, { status: 'success', data: { failures: [] } }));
    await expect(page.getByTestId('read-state-empty')).toContainText('No failed imports.');
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);

    await page.unroute('**/api/admin/invoicing/import-failures');
    await page.route('**/api/admin/invoicing/import-failures', (r) =>
      json(r, 500, { error: { code: 'internal_error', message: 'Error reading import failures' } }));
    await page.reload();
    await expect(page.getByTestId('read-state-failed')).toContainText('Failed imports did not load');
    await expect(page.getByTestId('read-state-failed')).toContainText('Error reading import failures');
  });

  test('the Admin landing lists the page among its Tools', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByText('Failed imports', { exact: true })).toBeVisible();
  });
});

// The before-upload caption (#10564) was removed at the operator's ask
// (c66326 on system_3 #9656, #10672); the after-failure sentence stays and is
// asserted in invoicing.spec and invoicing-n26.spec.
test.describe('#10672 Transactions — no before-upload caption', () => {
  test('the ways-in row carries no retention caption', async ({ page }) => {
    await page.route(/\/api\//, (r) => json(r, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
    await page.route(/\/api\/invoicing\//, (r) => {
      const path = new URL(r.request().url()).pathname.replace(/^\/api/, '');
      if (path === '/invoicing/profile') return json(r, 200, { saved: true, profile: { full_name: 'F', address: 'A', steuernummer: '1', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 1 } });
      if (path === '/invoicing/clients') return json(r, 200, { clients: [] });
      if (path === '/invoicing/payments') return json(r, 200, { payments: [] });
      if (path === '/invoicing/invoices') return json(r, 200, { invoices: [] });
      if (path === '/invoicing/audit-events') return json(r, 200, { events: [] });
      return json(r, 404, { error: { code: 'not_found', message: `unmocked ${path}` } });
    });
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member/personal/invoicing');
    await dismissMobileSidebarIfPresent(page);
    // Positive control: the ways-in row rendered, so the absences below are real.
    await expect(page.locator('[data-test="n26-import"]')).toBeVisible();
    await expect(page.locator('[data-test="import-retention-note"]')).toHaveCount(0);
    await expect(page.getByText('may be kept for up to 7 days')).toHaveCount(0);
  });
});
