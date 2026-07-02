import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  installJobsMocks,
  seedJobsRows,
  jobsSeed,
} from './helpers/mockBackend';

/** Per #1290 epic / #1294 F1: covers the card→page→filter→hide happy path
 *  for /trusted/jobs. The jobs API is mocked in-process via page.route()
 *  — no aspirant-browser or aspirant-server is required to run this spec.
 *  Real-backend integration is exercised manually after PR 1 (the
 *  aspirant-server jobs proxy) and PR 2 (this view) both deploy. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  // Bare /api catch-all so unrelated background calls (asset_manager prefetch
  // hashes, vuetify housekeeping, etc.) don't spam the webServer log when
  // a real failure surfaces. Registered BEFORE the jobs mocks so the
  // more-specific patterns win at match time.
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const SEED_ROWS = [
  {
    id: 'job-001',
    title: 'English-speaking barista',
    company: 'Cafe Kreuzberg',
    description_excerpt: 'Part-time barista role in central Kreuzberg.',
    source: 'berlinstartupjobs.com',
    distance_km: 1.8,
    salary_min: 12,
    salary_max: 14,
    currency: 'EUR',
    seen_on_sites_count: 1,
    scraped_at: '2026-06-30T18:00:00Z',
  },
  {
    id: 'job-002',
    title: 'Junior frontend engineer',
    company: 'Acme GmbH',
    description_excerpt: 'Vue + TypeScript shop, part-time considered.',
    source: 'jobs.smashing.de',
    distance_km: 4.2,
    salary_min: 25,
    salary_max: 30,
    currency: 'EUR',
    seen_on_sites_count: 2,
    dedup_group_id: 'dg-frontend',
    scraped_at: '2026-06-30T17:00:00Z',
  },
  {
    id: 'job-003',
    title: 'Weekend bookshop assistant',
    company: 'Buchladen Mitte',
    description_excerpt: 'Saturday + Sunday shifts.',
    source: 'indeed.de',
    distance_km: 8.5,
    salary_min: 13,
    salary_max: null,
    currency: 'EUR',
    seen_on_sites_count: 1,
    scraped_at: '2026-06-30T16:00:00Z',
  },
];

test.describe('/trusted/jobs — card→page→filter→hide', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installNoiseCatchAll(page);
    await installJobsMocks(page);
  });

  test('Trusted card navigates to the jobs page and renders rows', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted');
    await dismissMobileSidebarIfPresent(page);

    const card = page.locator('.application-card', { hasText: 'Jobs' });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/trusted\/jobs$/);
    await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible();

    const table = page.locator('[data-test="jobs-table"]');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(3);

    // Default sort is distance asc — closest row appears first.
    const firstRowTitle = table.locator('tbody tr').first();
    await expect(firstRowTitle).toContainText('English-speaking barista');
    await expect(firstRowTitle).toContainText('1.8 km');
  });

  test('seen-on-N-sites badge renders only when count > 1', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    const multi = page.locator('[data-test-row-id="job-002"]');
    await expect(multi.locator('.badge-sites')).toBeVisible();
    await expect(multi.locator('.badge-sites')).toContainText('×2');
    await expect(multi.locator('.badge-sites')).toHaveAttribute('title', 'Seen on 2 sites');

    const single = page.locator('[data-test-row-id="job-001"]');
    await expect(single.locator('.badge-sites')).toHaveCount(0);
  });

  test('all rendered rows have the same pixel height', async ({ page }) => {
    // Row-height parity is the operator's scan-friendliness contract for
    // /trusted/jobs (#1411 Part 1). One long-title + short-title row and
    // one short-title + long-excerpt row still render at the same height.
    const paddedRows = [
      ...SEED_ROWS,
      {
        id: 'job-004',
        title:
          'Senior full-stack platform engineer with kubernetes and observability expertise for late-stage growth fintech based in Kreuzberg',
        company: 'LongName Berlin GmbH',
        description_excerpt: 'Very long description that should be clipped to a single line.',
        source: 'stellenanzeigen.de',
        distance_km: 2.4,
        salary_min: 45,
        salary_max: 70,
        currency: 'EUR',
        seen_on_sites_count: 1,
        scraped_at: '2026-06-30T15:00:00Z',
      },
      {
        id: 'job-005',
        title: 'Kellner',
        company: null,
        description_excerpt: null,
        source: 'meinestadt.de',
        distance_km: 0.6,
        salary_min: null,
        salary_max: null,
        currency: null,
        seen_on_sites_count: 1,
        scraped_at: '2026-06-30T14:00:00Z',
      },
    ];
    seedJobsRows(paddedRows);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    const rows = page.locator('[data-test="jobs-table"] tbody tr');
    await expect(rows).toHaveCount(5);

    const heights = await rows.evaluateAll((els) =>
      els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().height)),
    );
    // All rows within 2px of the first — the fixed 80px row height locks
    // this; the 2px tolerance absorbs Chromium's sub-pixel rounding around
    // the collapsed border between adjacent rows.
    const [first] = heights;
    for (const h of heights) {
      expect(Math.abs(h - first)).toBeLessThanOrEqual(2);
    }
    // Sanity: every row is at least 70px — a regression that dropped the
    // fixed height would render short-title rows at ~40px.
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(70);
    }
  });

  test('distance badge surfaces the per-row km value', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test-row-id="job-001"] .badge-distance')).toContainText('1.8 km');
    await expect(page.locator('[data-test-row-id="job-002"] .badge-distance')).toContainText('4.2 km');
    await expect(page.locator('[data-test-row-id="job-003"] .badge-distance')).toContainText('8.5 km');
  });

  test('free-text filter narrows the visible rows', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    const table = page.locator('[data-test="jobs-table"]');
    await expect(table.locator('tbody tr')).toHaveCount(3);

    await page.locator('[data-test="jobs-filter"]').fill('barista');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr').first()).toContainText('English-speaking barista');

    await page.locator('[data-test="jobs-filter"]').fill('');
    await expect(table.locator('tbody tr')).toHaveCount(3);
  });

  test('hide button PATCHes the API and drops the row', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="jobs-table"] tbody tr')).toHaveCount(3);

    const patchPromise = page.waitForRequest(
      (req) =>
        req.method() === 'PATCH' &&
        req.url().endsWith('/api/jobs/job-002/hide'),
    );
    await page.locator('[data-test-hide="job-002"]').click();
    await patchPromise;

    await expect(page.locator('[data-test-row-id="job-002"]')).toHaveCount(0);
    await expect(page.locator('[data-test="jobs-table"] tbody tr')).toHaveCount(2);
    expect(jobsSeed.rows.find((r) => r.id === 'job-002')!.is_hidden).toBe(true);
  });

  test('sort by salary surfaces the highest-paying row first', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('[data-test="sort-salary"]').click();

    const firstRow = page.locator('[data-test="jobs-table"] tbody tr').first();
    await expect(firstRow).toContainText('Junior frontend engineer');
  });

  test('empty feed renders the friendly empty state', async ({ page }) => {
    seedJobsRows([]);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="jobs-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="jobs-empty"]')).toContainText('No jobs in the feed yet');
  });

  test('empty filter result reports the active query', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('[data-test="jobs-filter"]').fill('quantumastronomy');
    await expect(page.locator('[data-test="jobs-empty"]')).toContainText('No jobs match');
  });
});
