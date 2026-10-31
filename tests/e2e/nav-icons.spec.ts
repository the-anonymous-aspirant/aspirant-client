import { test, expect, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { openMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #9194 (§3.121, WCAG 1.1.1) — each nav item shows its own icon, and one
 * failed asset never blanks the others. Measured on the served site (#9105
 * b3_raw.json): Home, Applications and Support all showed the default image,
 * because the sidebar awaited its icons in turn inside one try and the Home
 * hash 404'd first. The alt rule: a nav icon beside its label is decorative,
 * and the home hero describes the drawing rather than carrying an address.
 *
 * Each hash is served as a PNG of its own width, so an icon's naturalWidth
 * says which asset it shows, the default fallback included.
 */

// Hashes from src/asset_manager.js's assetMap.
const HASH = {
  nav_home_icon: '6a9cd5807678009a717d5f472d179876',
  applications: '21ad7ec5e702e6fb91c8142bcb18ff67',
  coffemug: 'b5eeea9419635aaa0313bc4167c95731',
  default: 'babd3aeb9544a9d3e623757494942d70',
};
const WIDTH: Record<string, number> = {
  [HASH.nav_home_icon]: 11,
  [HASH.applications]: 12,
  [HASH.coffemug]: 13,
  [HASH.default]: 14,
};
const OTHER_WIDTH = 20;

/** A blank RGBA PNG `w` pixels square. */
function png(w: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(w * (1 + w * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Serves every asset at its width; any hash in `fail` is aborted instead. */
async function open(page: Page, path: string, fail: string[] = []): Promise<void> {
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(/\/api\/fetch-object\//, (route) => {
    const hash = new URL(route.request().url()).pathname.split('/').pop()!;
    if (fail.includes(hash)) return route.abort();
    return route.fulfill({ status: 200, contentType: 'image/png', body: png(WIDTH[hash] ?? OTHER_WIDTH) });
  });
  await page.goto(path);
  await openMobileSidebarIfPresent(page);
}

/** label -> the naturalWidth of the icon beside it, once every icon has loaded. */
async function navIcons(page: Page): Promise<Record<string, number>> {
  const read = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLElement>('.nav-links a')).map((a) => {
          const img = a.querySelector('img');
          return [a.textContent!.trim(), img && img.complete ? img.naturalWidth : 0];
        }),
      ),
    );
  await expect.poll(async () => Object.values(await read()).every((w) => w > 0)).toBe(true);
  const icons = await read();
  console.log(`ICONS ${test.info().project.name} ${JSON.stringify(icons)}`);
  return icons;
}

test('each nav item shows its own icon', async ({ page }) => {
  await open(page, '/');
  expect(await navIcons(page)).toEqual({ Home: 11, Applications: 12, Support: 13 });
});

test('a failed Home icon leaves the other items their own icons', async ({ page }) => {
  await open(page, '/', [HASH.nav_home_icon]);
  expect(await navIcons(page)).toEqual({ Home: 14, Applications: 12, Support: 13 });
});

test('nav icons are decorative and the home hero describes its drawing', async ({ page }) => {
  await open(page, '/');
  await navIcons(page);
  const navAlts = await page.locator('.nav-links img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt')));
  expect(navAlts).toEqual(['', '', '']);
  for (const name of ['Home', 'Applications', 'Support'])
    await expect(page.locator('.nav-links').getByRole('link', { name, exact: true })).toHaveCount(1);
  await expect(page.locator('img.aspiring-hand')).toHaveAttribute('alt', 'A hand reaching for a circle');
});

test('a collapsed nav keeps each link named by its label', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the logo toggles the drawer on a phone; collapse is desktop only');
  await open(page, '/');
  await navIcons(page);
  await page.locator('.aspiring-hand-logo').click();
  await expect(page.locator('.nav-links .empty-slot')).toHaveCount(3);
  for (const name of ['Home', 'Applications', 'Support']) {
    const link = page.locator('.nav-links').getByRole('link', { name, exact: true });
    await expect(link).toHaveCount(1);
    // The label is in the link for screen readers but takes no visible space.
    const box = await link.getByText(name, { exact: true }).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
  }
});
