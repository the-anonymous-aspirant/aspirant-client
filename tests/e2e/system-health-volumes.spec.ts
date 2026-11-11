import { test, expect, type Route } from '@playwright/test';
import { seedAdminSession } from './helpers/mockBackend';

/** Admin → System health, Volumes card (system_3 #10568-A1). Once monitor
 *  runs without the capabilities that bypass file modes (#10568-A3), a
 *  directory it cannot enter comes back as { size_mb: null, unreadable: true }
 *  (#10568-A2). The row says so in place of a size, never a dash or a 0
 *  (security c65612). Every /api call is answered here. */

const json = (route: Route, status: number, body: Record<string, any>) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const disk = {
  disks: [{ mount: '/', label: 'Root', total_gb: 100, used_gb: 40, free_gb: 60, percent: 40 }],
  volumes: [
    { name: '/data/aspirant/files', size_mb: null, ref_count: -1, unreadable: true },
    { name: '/data/aspirant/models', size_mb: 2048, ref_count: -1 },
    // A null size without the flag is not "unreadable": it keeps formatMB's dash (design_agent c65622).
    { name: '/data/aspirant/legacy', size_mb: null, ref_count: -1 },
    { name: 'aspirant_pgdata', size_mb: 512.5, ref_count: 1 },
  ],
  images: { total_count: 3, total_size_mb: 900 },
};

test('a volume monitor cannot read says so instead of a size; the others keep theirs', async ({ page }) => {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/health$/, (route) => json(route, 200, { status: 'ok' }));
  await page.route(/\/api\/system\/containers$/, (route) => json(route, 200, { containers: [] }));
  await page.route(/\/api\/system\/disk$/, (route) => json(route, 200, disk));
  await page.route(/\/api\/system\/db-stats$/, (route) => json(route, 404, { error: { code: 'not_found', message: 'none' } }));
  await seedAdminSession(page);
  await page.goto('/admin/system-health');

  const rows = page.locator('.info-row').filter({ has: page.locator('.info-label.mono') });
  const files = rows.filter({ hasText: '/data/aspirant/files' });
  await expect(files.locator('[data-test="volume-unreadable"]')).toHaveText("monitor can't read it");
  await expect(files).not.toContainText('MB');
  await expect(files).not.toContainText('—');
  await expect(rows.filter({ hasText: '/data/aspirant/models' })).toContainText('2.0 GB');
  await expect(rows.filter({ hasText: 'aspirant_pgdata' })).toContainText('512.5 MB');
  await expect(rows.filter({ hasText: '/data/aspirant/legacy' }).locator('.info-value')).toHaveText('—');
  await expect(page.locator('[data-test="volume-unreadable"]')).toHaveCount(1);
});
