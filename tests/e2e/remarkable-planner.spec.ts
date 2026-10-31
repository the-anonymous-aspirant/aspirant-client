import { test, expect, type Page } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers #9132 PR B (operator c57326): the reMarkable planner is a page on
 *  this site. RemarkablePdfs used to fetch a generator from
 *  raw.githubusercontent.com into an iframe's srcdoc; that file had gone 404,
 *  and the origin sat in the content policy. Now the view frames
 *  /remarkable/calendar.html (this year) or ?year=next, the page loads only
 *  same-origin files (its script, its stylesheet, its self-hosted Crimson Pro),
 *  and it renders without one parser-inserted style attribute, so it passes
 *  `style-src 'self'`. */

function watchForeign(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.host !== new URL(page.url() || 'http://x').host && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      hits.push(u.host);
    }
  });
  return hits;
}

test('the planner preview is this site\'s page, for this year and next', async ({ page }) => {
  const foreign = watchForeign(page);
  const year = new Date().getFullYear();
  await seedTrustedSession(page);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/member/shared/remarkable-pdfs');
  await dismissMobileSidebarIfPresent(page);

  const frameEl = page.locator('[data-test="remarkable-preview"]');
  await expect(frameEl).toHaveAttribute('src', '/remarkable/calendar.html');
  const frame = page.frameLocator('[data-test="remarkable-preview"]');
  // The page builds ~530 A4 pages in script; give that its own budget.
  const BUILD = { timeout: 30_000 };
  await expect(frame.locator('#end-page')).toBeAttached(BUILD);
  const inner = page.frame({ url: /\/remarkable\/calendar\.html$/ })!;
  expect(await inner.title()).toBe(`${year} Planner`);
  expect(await frame.locator('.page').count()).toBeGreaterThan(500);
  // style-src 'self': the generator writes its markup with innerHTML, so any
  // style="" in it would be parser-inserted and refused.
  expect(await frame.locator('[style]').count()).toBe(0);
  expect(await inner.evaluate(async () => { await document.fonts.ready; return document.fonts.check("16px 'Crimson Pro'"); })).toBe(true);

  await expect(page.getByRole('radio', { name: `${year} planner` })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: `${year + 1} planner` }).click();
  await expect(frameEl).toHaveAttribute('src', '/remarkable/calendar.html?year=next');
  await expect(frame.locator('#end-page')).toBeAttached(BUILD);
  await expect.poll(async () => page.frame({ url: /\?year=next$/ })?.title(), BUILD).toBe(`${year + 1} Planner`);
  expect(await frame.locator('[style]').count()).toBe(0);

  expect(foreign).toEqual([]);
});

test('the planner page loads only same-origin files', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/remarkable/calendar.html');
  await page.evaluate(() => document.fonts.ready);
  const origin = new URL(page.url()).origin;
  expect(urls.filter((u) => !u.startsWith(origin))).toEqual([]);
  for (const path of ['/remarkable/calendar.js', '/remarkable/calendar.css', '/remarkable/fonts/CrimsonPro-latin.woff2']) {
    expect(urls, path).toContain(origin + path);
  }
  await expect(page.locator('#end-page a')).toHaveAttribute('href', 'https://github.com/the-anonymous-aspirant');
});
