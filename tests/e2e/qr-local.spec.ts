import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { decodeQrImage } from './helpers/qrDecode';

/** Covers #9132 (operator c57326): QR codes are drawn in the browser. The QR
 *  generator and /support used to load <img src="https://api.qrserver.com/
 *  ...?data=<text>">, sending what was encoded to a third party. Now no request
 *  leaves for that service, the image is a blob: PNG, and decoding it gives
 *  back exactly the text, non-ASCII included. The room's join code is covered
 *  in constellations-room.spec.ts. */

function watchQrService(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (/qrserver\.com/.test(r.url())) hits.push(r.url());
  });
  return hits;
}

test('the QR generator draws the typed text locally, UTF-8 intact', async ({ page }) => {
  const hits = watchQrService(page);
  await page.addInitScript(() => localStorage.setItem('user_role', 'Viewer'));
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/applications/qr-generator');
  await dismissMobileSidebarIfPresent(page);

  const text = 'Hej på dig: åäö ÅÄÖ, https://example.com/?q=1&r=ü';
  await page.getByLabel('Enter text or URL').fill(text);
  const img = page.locator('.qr-image');
  await expect(img).toHaveAttribute('src', /^blob:/);

  const qr = await decodeQrImage(img);
  expect(qr.width).toBe(300);
  expect(qr.text).toBe(text);

  // Download is the drawn PNG itself.
  await expect(page.getByRole('link', { name: 'Download PNG' })).toHaveAttribute('href', /^blob:/);
  expect(hits).toEqual([]);
});

test('/support draws both codes locally, and they decode to the donate link and address', async ({ page }) => {
  const hits = watchQrService(page);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/support');
  await dismissMobileSidebarIfPresent(page);

  const bmac = page.locator('img[alt="Buy Me a Coffee QR Code"]');
  const btc = page.locator('.btc-card img.qr-image');
  await expect(bmac).toHaveAttribute('src', /^blob:/);
  await expect(btc).toHaveAttribute('src', /^blob:/);
  expect((await decodeQrImage(bmac)).text).toBe('https://buymeacoffee.com/theaspirant');
  expect((await decodeQrImage(btc)).text).toBe('bc1qj433rpvgrv8kzdrqa2uuxpgknzug3lqwzpzypj');
  expect(hits).toEqual([]);
});
