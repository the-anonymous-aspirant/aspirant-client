import { test, expect, type Page } from '@playwright/test';

/**
 * A signed-out first page loads none of the large libraries that only a few
 * screens use (system_3 #11650): pdfmake (KvittoMaker, the card generator),
 * chart.js (the Pappas trackers, a browser flow's detail, the SQL game) and
 * vue-flow with dagre (a goal's tree). Before, the router imported those
 * views statically, so every first page loaded them, pdfmake's 1.87 MB among
 * them. Every /api call is answered 401 here: nobody is signed in.
 */

const LARGE = /pdfmake|chart\.js|chart_js|@kurkle|kurkle|@vue-flow|vue-flow|@dagrejs|dagrejs/;

async function firstPageRequests(page: Page, path: string): Promise<string[]> {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(new URL(r.url()).pathname));
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'signed out' } }) }),
  );
  await page.goto(path, { waitUntil: 'networkidle' });
  return urls;
}

for (const path of ['/', '/login']) {
  test(`#11650 signed out, ${path} requests no large library`, async ({ page }) => {
    const urls = await firstPageRequests(page, path);
    // The page did load its own scripts, so an empty list cannot pass.
    expect(urls.some((u) => /\.(js|vue|ts)$|\/@vite\/|\/assets\//.test(u))).toBe(true);
    expect(urls.filter((u) => LARGE.test(u))).toEqual([]);
  });
}
