import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  installJobsMocks,
  seedJobsRows,
  seedJobsSources,
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

  test('Not-interested button PATCHes /hide and drops the row', async ({ page }) => {
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

  test('Save button PATCHes /save; row stays in All and Save flips to Saved ✓', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="jobs-table"] tbody tr')).toHaveCount(3);

    const patchPromise = page.waitForRequest(
      (req) =>
        req.method() === 'PATCH' &&
        req.url().endsWith('/api/jobs/job-002/save'),
    );
    await page.locator('[data-test-save="job-002"]').click();
    await patchPromise;

    // The row stays in the All view (saved is a distinct state, not a
    // rejection) but the Save button flips to a disabled "Saved ✓" indicator.
    await expect(page.locator('[data-test-row-id="job-002"]')).toBeVisible();
    const savedBtn = page.locator('[data-test-save="job-002"]');
    await expect(savedBtn).toHaveText(/Saved/);
    await expect(savedBtn).toBeDisabled();
    // Seed carries the stamped saved_at, is_hidden stays false.
    expect(jobsSeed.rows.find((r) => r.id === 'job-002')!.saved_at).not.toBeNull();
    expect(jobsSeed.rows.find((r) => r.id === 'job-002')!.is_hidden).toBe(false);
  });

  test('Saved tab lists only saved rows and requests filter=saved', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    // Save one row on the All tab.
    await page.locator('[data-test-save="job-001"]').click();
    await expect(page.locator('[data-test-save="job-001"]')).toHaveText(/Saved/);

    // Switch to the Saved tab; it must send filter=saved and render only
    // the saved row.
    const savedRequest = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/api/jobs') &&
        new URL(req.url()).searchParams.get('filter') === 'saved',
    );
    await page.locator('[data-test="jobs-tab-saved"]').click();
    await savedRequest;

    await expect(page.locator('[data-test="jobs-table"] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-test="jobs-table"] tbody tr').first()).toContainText(
      'English-speaking barista',
    );

    // Switching back to All drops the filter and re-shows all 3 rows —
    // saved rows remain in All (only rejected rows drop out).
    await page.locator('[data-test="jobs-tab-all"]').click();
    await expect(page.locator('[data-test="jobs-table"] tbody tr')).toHaveCount(3);
  });

  test('Saved tab empty state guides the operator to press Save', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('[data-test="jobs-tab-saved"]').click();
    await expect(page.locator('[data-test="jobs-empty"]')).toContainText('No saved jobs yet');
  });

  test('salary column is hidden from the default view', async ({ page }) => {
    // #1411 amendment 4718 — salary is null on 88% of rows (only
    // remotive_worldwide publishes it), so it's dropped from the default
    // table. The API still returns salary_min/max on each row (for a
    // future detail panel) but the /trusted/jobs table no longer surfaces
    // them, and no sort-salary control exists.
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.locator('[data-test="sort-salary"]')).toHaveCount(0);
    await expect(page.locator('.col-salary')).toHaveCount(0);
    // The seeded rows carry EUR salary strings — none should render on the
    // default view. Assert on values that only appear in a salary cell.
    await expect(page.locator('[data-test="jobs-table"] tbody')).not.toContainText('12 EUR');
    await expect(page.locator('[data-test="jobs-table"] tbody')).not.toContainText('25 EUR');
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

  test('sources panel is collapsed by default and expands on click', async ({ page }) => {
    // Per #1411-B5 / task #1419 — surface which sources are producing
    // data and what each filters on, without spending vertical space
    // by default.
    seedJobsRows(SEED_ROWS);
    seedJobsSources([
      {
        source: 'berlinstartupjobs',
        description: 'English-speaking Berlin startup roles via Algolia backend.',
        proxy: 'direct',
        last_run_at: '2026-06-30T18:00:00Z',
        last_run_status: 'success',
        row_count: 84,
      },
      {
        source: 'expat_berlin',
        description: 'expat.com Berlin forum threads tagged as jobs.',
        proxy: 'direct',
        last_run_at: '2026-06-30T18:05:00Z',
        last_run_status: 'failed',
        row_count: 0,
      },
    ]);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    const panel = page.locator('[data-test="sources-panel"]');
    await expect(panel).toBeVisible();
    // <details> starts closed — the body is in the DOM but not rendered.
    // Contents inside a closed <details> are not visible per Playwright's
    // visibility semantics, and the panel's own ``open`` property flips
    // once the summary is clicked.
    await expect(page.locator('[data-test="sources-table"]')).not.toBeVisible();
    await expect(panel).not.toHaveJSProperty('open', true);

    await panel.locator('[data-test="sources-panel-summary"]').click();
    await expect(panel).toHaveJSProperty('open', true);
    await expect(page.locator('[data-test="sources-table"]')).toBeVisible();
    await expect(page.locator('[data-test="sources-table"] tbody tr')).toHaveCount(2);

    const bsj = page.locator('[data-test-source="berlinstartupjobs"]');
    await expect(bsj).toContainText('English-speaking Berlin startup roles');
    await expect(bsj).toContainText('84');
    await expect(bsj.locator('.badge-run-ok')).toContainText('success');

    const expat = page.locator('[data-test-source="expat_berlin"]');
    await expect(expat.locator('.badge-run-fail')).toContainText('failed');
    await expect(expat).toContainText('0');
  });

  test('sources panel surfaces global classifier criteria once', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    seedJobsSources([
      { source: 'x', description: 'stub', row_count: 0 },
    ]);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('[data-test="sources-panel-summary"]').click();
    const crit = page.locator('[data-test="sources-global-criteria"]');
    await expect(crit).toContainText('≤ 10 km');
    await expect(crit).toContainText('required');
    await expect(crit).toContainText('barista');
    await expect(crit).toContainText('senior');
  });

  test('about-me block renders above the sources panel with description and role lists', async ({ page }) => {
    // Per #1411-B6 — surface what the operator is optimising for so
    // /trusted/jobs opens with a scannable target-description above the
    // sources panel and the table. Data comes from GET /api/jobs/about.
    seedJobsRows(SEED_ROWS);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    const about = page.locator('[data-test="about-me"]');
    await expect(about).toBeVisible();
    await expect(about).toContainText('Berlin');
    await expect(about).toContainText('10 km');
    await expect(about).toContainText('No prior experience');

    const inScope = page.locator('[data-test="about-me-in-scope"]');
    await expect(inScope).toContainText('Looking for');
    await expect(inScope.locator('.keyword-pill-whitelist')).toContainText([
      'barista',
      'cleaner',
    ]);

    const outOfScope = page.locator('[data-test="about-me-out-of-scope"]');
    await expect(outOfScope).toContainText('Not looking for');
    await expect(outOfScope.locator('.keyword-pill-blacklist')).toContainText([
      'senior',
      'engineer',
    ]);

    // Block renders above the sources panel in the reading order.
    const aboutBox = await about.boundingBox();
    const panelBox = await page.locator('[data-test="sources-panel"]').boundingBox();
    expect(aboutBox!.y).toBeLessThan(panelBox!.y);
  });

  test('sources panel renders empty state when no scraper flows are registered', async ({ page }) => {
    seedJobsRows(SEED_ROWS);
    seedJobsSources([]);
    await page.goto('/trusted/jobs');
    await dismissMobileSidebarIfPresent(page);

    await page.locator('[data-test="sources-panel-summary"]').click();
    await expect(page.locator('[data-test="sources-empty"]')).toBeVisible();
    await expect(page.locator('[data-test="sources-empty"]')).toContainText('No scraper flows');
  });
});
