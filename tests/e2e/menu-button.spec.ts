import { test, expect, type Page } from '@playwright/test';

/** The phone's menu button can be seen and named (system_3 #10978, UX walk
 *  finding AP2; D9, D12, D7, §3.99). Before, its three bars were amber on the
 *  light page, 1.41:1 against a 3:1 floor for a control, in a clickable div
 *  with no name. Signed out on /login, every /api call answered here. */

async function open(page: Page) {
  await page.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/login');
}

/** WCAG contrast of the bars' colour against a surface colour. */
async function barsAgainst(page: Page, surfaceSelector: string): Promise<number> {
  return page.evaluate((sel) => {
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 0, g: 0, b: 0 };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const bar = parse(getComputedStyle(document.querySelector('.hamburger-icon span') as Element).backgroundColor);
    const surface = parse(getComputedStyle(document.querySelector(sel) as Element).backgroundColor);
    const [a, b] = [lum(bar), lum(surface)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, surfaceSelector);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`#10978 the menu button in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('at 390x844 it is a named button, 44px, at 3:1 or more on the page; open, on the drawer', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page);
      const button = page.getByRole('button', { name: 'Open menu' });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect.poll(() => barsAgainst(page, '#myVapp'), { message: 'bars on the page' }).toBeGreaterThanOrEqual(3);

      await button.click();
      const close = page.getByRole('button', { name: 'Close menu' });
      await expect(close).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.sidebar.show')).toBeVisible();
      // The bars' colour eases with their existing transition: read it once it has settled.
      await expect.poll(() => barsAgainst(page, '.sidebar'), { message: 'bars on the open drawer' }).toBeGreaterThanOrEqual(3);

      await close.click();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });

    test('at 1440x900 there is no menu button: the sidebar is the navigation', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      await expect(page.locator('.mobile-menu-toggle')).toHaveCount(0);
      await expect(page.locator('.sidebar')).toBeVisible();
    });
  });
}
