import { test, expect, type Page } from '@playwright/test';

/**
 * #9190 (§3.121, §3.119) — the shell has ONE breakpoint: a phone is under
 * 768px, a desktop is 768px and up. On a phone the nav drawer is closed on
 * first load (it opened over a scrim on every public route, covering half the
 * screen: #9105 B1-1) and opens only from the menu toggle. At every width
 * exactly one of the two navigation controls exists: the toggle or the rail.
 */

const ROUTES: Array<[string, string]> = [
  ['/', 'The Aspirant'],
  ['/login', 'Login'],
  ['/support', 'Support'],
];

async function load(page: Page, width: number, path: string): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto(path);
}

/** Where the shell's two navigation controls stand. The rail counts as shown
 *  when the sidebar occupies on-screen width; off-canvas (translated out, or
 *  0px wide) does not. */
async function shell(page: Page) {
  return page.evaluate(() => {
    const toggle = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    const r = sidebar?.getBoundingClientRect();
    const onScreen = (el: Element | null) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && b.width > 0 && b.height > 0;
    };
    return {
      toggle: onScreen(toggle),
      rail: !!r && r.width > 0 && r.right > 1,
      overlay: onScreen(overlay),
    };
  });
}

/** The heading's centre hits the heading itself, not a drawer or scrim. */
async function headingUnobscured(page: Page, text: string): Promise<boolean> {
  const h1 = page.locator('h1', { hasText: text }).first();
  await expect(h1).toBeVisible();
  return h1.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + Math.min(b.width / 2, 40), b.top + b.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

for (const width of [390, 767]) {
  for (const [path, heading] of ROUTES) {
    test(`${width}px ${path}: the drawer is closed on first load`, async ({ page }) => {
      await load(page, width, path);
      // Polled: the drawer's slide transition must settle before geometry is read.
      await expect.poll(() => shell(page), { message: `${width}px ${path}` }).toEqual({
        toggle: true,
        rail: false,
        overlay: false,
      });
      expect(await headingUnobscured(page, heading), `${path} heading unobscured`).toBe(true);
    });
  }
}

for (const width of [768, 769]) {
  test(`${width}px: the rail shows and no menu toggle exists`, async ({ page }) => {
    await load(page, width, '/');
    await expect.poll(() => shell(page)).toEqual({ toggle: false, rail: true, overlay: false });
  });
}

test('one tap opens the drawer with its overlay; a tap on the overlay closes it', async ({ page }) => {
  await load(page, 390, '/');
  await page.locator('.mobile-menu-toggle').click();
  await expect(page.locator('.mobile-overlay')).toBeVisible();
  await expect.poll(async () => (await shell(page)).rail).toBe(true);
  // The overlay sits under the 200px drawer on its left; tap its exposed right side.
  await page.mouse.click(370, 600);
  await expect(page.locator('.mobile-overlay')).toHaveCount(0);
  await expect.poll(() => shell(page)).toEqual({ toggle: true, rail: false, overlay: false });
});

test('resizing desktop → phone → desktop keeps exactly one control', async ({ page }) => {
  await load(page, 1024, '/');
  await expect.poll(() => shell(page)).toEqual({ toggle: false, rail: true, overlay: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => shell(page)).toEqual({ toggle: true, rail: false, overlay: false });
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect.poll(() => shell(page)).toEqual({ toggle: false, rail: true, overlay: false });
});
