import { test, expect, type Locator, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** /support on a phone (system_3 #10981, UX walk AP5; S2, D11, D16). At 390px
 *  each card led with a QR code, which a phone cannot scan from its own
 *  screen, and the button and address sat below the first screen. Both codes
 *  were white on the card's dark with a 1-module margin. Each card now leads
 *  with its action at phone width, and each code is dark on light with the
 *  spec's 4-module quiet zone, in both themes. */

const BMAC = 'https://buymeacoffee.com/theaspirant';
const BTC = 'bc1qj433rpvgrv8kzdrqa2uuxpgknzug3lqwzpzypj';

async function open(page: Page, theme: string, width: number) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.route(/\/api\//, (r) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await page.goto('/support');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('.btc-card img.qr-image')).toBeVisible();
}

/** Scan as a strict reader does: the image as drawn, no added margin, and
 *  dark-on-light only (no inversion). The helper used elsewhere pads the image
 *  and tries both polarities, which would pass the old codes too. */
async function strictScan(img: Locator): Promise<string | null> {
  const px = await img.evaluate(async (el: HTMLImageElement) => {
    if (!el.complete || !el.naturalWidth)
      await new Promise((r) => el.addEventListener('load', r, { once: true }));
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  });
  const found = jsQR(Uint8ClampedArray.from(px.data), px.w, px.h, {
    inversionAttempts: 'dontInvert',
  });
  return found ? found.data : null;
}

for (const theme of ['light', 'dark'] as const) {
  test(`at 390px each card leads with its action, on the first screen (${theme})`, async ({
    page,
  }) => {
    await open(page, theme, 390);
    const button = page.getByRole('link', { name: /Buy me a coffee/ });
    const copy = page.getByRole('button', { name: 'Copy address' });
    const address = page.locator('.address-box');
    const bmacCode = page.locator('.bmac-card .qr-code');
    const btcCode = page.locator('.btc-card .qr-code');

    const y = async (l: Locator) => (await l.boundingBox())!;
    const [b, bq, a, c, cq] = await Promise.all([
      y(button),
      y(bmacCode),
      y(address),
      y(copy),
      y(btcCode),
    ]);
    expect(b.y, 'the button comes before its code').toBeLessThan(bq.y);
    expect(c.y, 'the copy control comes before the code').toBeLessThan(cq.y);
    expect(a.y + a.height, 'the address is on the first screen').toBeLessThanOrEqual(844);
    expect(c.y + c.height, 'Copy address is on the first screen').toBeLessThanOrEqual(844);
    expect(b.y + b.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
  });

  test(`at 1440px the code is shown above its action, as before (${theme})`, async ({ page }) => {
    await open(page, theme, 1440);
    const button = (await page.getByRole('link', { name: /Buy me a coffee/ }).boundingBox())!;
    const bq = (await page.locator('.bmac-card .qr-code').boundingBox())!;
    const copy = (await page.getByRole('button', { name: 'Copy address' }).boundingBox())!;
    const cq = (await page.locator('.btc-card .qr-code').boundingBox())!;
    expect(bq.y).toBeLessThan(button.y);
    expect(cq.y).toBeLessThan(copy.y);
    expect(copy.y + copy.height).toBeLessThanOrEqual(900);
  });

  test(`both codes scan as drawn: dark on light, own quiet zone (${theme})`, async ({ page }) => {
    await open(page, theme, 390);
    expect(await strictScan(page.locator('.bmac-card img.qr-image'))).toBe(BMAC);
    expect(await strictScan(page.locator('.btc-card img.qr-image'))).toBe(BTC);
    // The tile behind the image is white in both themes.
    const ground = await page
      .locator('.btc-card .qr-code')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ground).toBe('rgb(255, 255, 255)');
  });
}

test('Copy address copies the address and says so', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t: string) => (((window as any).__copied = t), Promise.resolve()) },
      configurable: true,
    });
  });
  await open(page, 'light', 390);
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copied)).toBe(BTC);
});
