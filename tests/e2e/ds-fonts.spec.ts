import { test, expect } from '@playwright/test';

/**
 * system_3 #9580 (UX walk 2026-11-02 AC1): the client loads the design
 * system's Iosevka faces. Before, `src/main.js` imported tokens.css and
 * styles.css but not fonts.css, so `--font-family-base` named a face nobody
 * registered: `document.fonts` was empty, no woff2 was requested, and every
 * page rendered in the viewer's OS monospace while still looking styled.
 */

test('the Iosevka faces are registered and their woff2 files load', async ({ page }) => {
  const woff2: string[] = [];
  page.on('response', (r) => {
    if (r.ok() && /\.woff2(\?|$)/.test(r.url())) woff2.push(r.url());
  });
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/');
  await page.locator('h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  const faces = await page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.family.replace(/["']/g, '') === 'Iosevka')
      .map((f) => ({ weight: f.weight, status: f.status }))
  );
  console.log(`FONTS faces=${JSON.stringify(faces)} woff2=${woff2.length}`);

  // All three weights the tokens name are registered.
  expect(faces.map((f) => f.weight).sort()).toEqual(['400', '500', '700']);
  // The body's own face is fetched and in use, not just declared.
  expect(faces.find((f) => f.weight === '400')?.status).toBe('loaded');
  expect(woff2.length).toBeGreaterThanOrEqual(1);
});
