import { test, expect, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** System health when some reads fail (system_3 #11003, UX walk AA1; D2, D4).
 *  The containers and disk reads answered 502 and the page showed a green
 *  "OK", a Server card and a Database card, with Containers and Disk simply
 *  absent. A failed read now keeps its section's heading and says so, and the
 *  banner says what it covers. Every /api call is answered here. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const HEALTH = { status: 'ok', service: 'server', checks: { database: 'connected' } };
const CONTAINERS = {
  containers: [
    {
      name: 'aspirant-online-server-1',
      status: 'running',
      cpu_percent: 1,
      memory_mb: 100,
      memory_limit_mb: 1000,
      uptime: '2h',
    },
  ],
};
const DISK = {
  disks: [{ mount: '/', label: 'Root', total_gb: 100, used_gb: 40, percent_used: 40 }],
  volumes: [{ name: 'aspirant_pgdata', size_mb: 512.5, ref_count: 1 }],
  images: { total_count: 3, total_size_mb: 900 },
};
const DB = { data: { table_count: 2, total_rows: 10, total_size_mb: 1, tables: [] } };

type Answer = 'ok' | number;

async function open(
  page: Page,
  answers: { health?: Answer; containers?: Answer; disk?: Answer; db?: Answer }
) {
  const state = { health: 'ok', containers: 'ok', disk: 'ok', db: 'ok', ...answers } as Record<
    string,
    Answer
  >;
  const serve = (key: string, body: unknown) => (route: Route) =>
    state[key] === 'ok'
      ? json(route, 200, body)
      : json(route, state[key] as number, { error: { code: 'bad_gateway', message: 'x' } });
  await page.route(/\/api\//, (route) =>
    json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } })
  );
  await page.route(/\/api\/health$/, serve('health', HEALTH));
  await page.route(/\/api\/system\/containers$/, serve('containers', CONTAINERS));
  await page.route(/\/api\/system\/disk$/, serve('disk', DISK));
  await page.route(/\/api\/system\/db-stats$/, serve('db', DB));
  await seedAdminSession(page);
  await page.goto('/admin/system-health');
  await dismissMobileSidebarIfPresent(page);
  return state;
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`containers and disk failed: the banner and both sections say so (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page, { containers: 502, disk: 502 });

      const banner = page.locator('[data-test="status-banner-partial"]');
      // The banner also carries Refresh now (system_3 #11007, beside the
      // verdict); the wording lives in .status-label alone.
      await expect(banner.locator('.status-label')).toHaveText(
        'Server and database OK. Containers and disk could not be read.'
      );
      await expect(banner).toHaveClass(/degraded/);
      // Its words clear AA on its own ground, in both themes.
      const ratio = await banner.evaluate((el) => {
        const rgb = (c: string) => c.match(/[\d.]+/g)!.map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        // Paint the ground exactly as composited: a probe with the banner's background.
        const cs = getComputedStyle(el);
        const probe = document.createElement('canvas');
        probe.width = probe.height = 1;
        const ctx = probe.getContext('2d')!;
        ctx.fillStyle = cs.backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const tint = cs.backgroundImage.match(/rgba?\([^)]+\)/);
        if (tint) {
          ctx.fillStyle = tint[0];
          ctx.fillRect(0, 0, 1, 1);
        }
        const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
        const a = lum(rgb(cs.color));
        const g2 = lum([r, g, b]);
        return (Math.max(a, g2) + 0.05) / (Math.min(a, g2) + 0.05);
      });
      expect(ratio, `banner ink ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      await expect(page.getByText('OK', { exact: true })).toHaveCount(0);
      // First screen: the banner answers "is anything wrong?" without scrolling.
      const box = (await banner.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);

      const containers = page.locator('[data-test="read-failed-containers"]');
      await expect(page.getByRole('heading', { name: 'Containers' })).toBeVisible();
      await expect(containers).toContainText(
        'Could not read containers: the monitor did not answer.'
      );
      await expect(containers.getByRole('button', { name: 'Try again' })).toBeVisible();

      const disk = page.locator('[data-test="read-failed-disk"]');
      await expect(disk.getByRole('heading', { name: 'Disk Usage' })).toBeVisible();
      await expect(disk).toContainText('Could not read disk usage: the monitor did not answer.');
      await expect(disk.getByRole('button', { name: 'Try again' })).toBeVisible();

      // What did answer is unchanged.
      await expect(page.locator('.db-summary')).toContainText('2 tables');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      ).toBe(false);
    });
  }
}

test("every read returned: the banner is the server's own word and nothing says it failed", async ({
  page,
}) => {
  await open(page, {});
  await expect(page.getByText('OK', { exact: true })).toBeVisible();
  await expect(page.locator('[data-test="status-banner-partial"]')).toHaveCount(0);
  await expect(page.locator('.read-failed')).toHaveCount(0);
  await expect(page.locator('.container-card')).toHaveCount(1);
  await expect(page.locator('.disk-bar-container')).toHaveCount(1);
});

test('Try again reads again, and a read that now answers replaces its failure', async ({
  page,
}) => {
  const state = await open(page, { containers: 502, disk: 502 });
  await expect(page.locator('[data-test="read-failed-containers"]')).toBeVisible();
  state.containers = 'ok';
  state.disk = 'ok';
  await page.locator('[data-test="read-failed-disk"]').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.container-card')).toHaveCount(1);
  await expect(page.locator('.disk-bar-container')).toHaveCount(1);
  await expect(page.locator('.read-failed')).toHaveCount(0);
  await expect(page.getByText('OK', { exact: true })).toBeVisible();
});

test('the server health read failed: the Server card says so, and the banner says only what it knows', async ({
  page,
}) => {
  await open(page, { health: 500 });
  await expect(page.locator('[data-test="read-failed-health"]')).toContainText(
    'Could not read server health: the server answered with an error (500).'
  );
  await expect(page.locator('[data-test="status-banner-partial"] .status-label')).toHaveText(
    'Server health could not be read.'
  );
  await expect(page.locator('.container-card')).toHaveCount(1);
});

test('the database statistics read failed: the Database card says so', async ({ page }) => {
  await open(page, { db: 503 });
  await expect(page.locator('[data-test="read-failed-db"]')).toContainText(
    'Could not read database statistics: the server did not answer.'
  );
  await expect(page.locator('[data-test="status-banner-partial"] .status-label')).toHaveText(
    'Server and database OK. Database statistics could not be read.'
  );
});
