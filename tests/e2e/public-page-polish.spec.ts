import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent, openMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * UX walk AP6 (system_3 #10982): three small public-page defects.
 * - Every route shared one <title>, 404 included.
 * - The 404 path and the Bitcoin address rendered in the browser's own
 *   monospace instead of the house face (Iosevka).
 * - The act of signing in was called "Login" on the card and the sidebar
 *   form, "sign in" everywhere else; the sidebar's form labels were amber
 *   (inherited from .sidebar) where the card's are white.
 */

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('AP6: one title per public page', () => {
  const TITLED: Array<[string, string]> = [
    ['/', 'The Aspirant'],
    ['/login', 'Sign in · The Aspirant'],
    ['/admin/login', 'Admin sign-in · The Aspirant'],
    ['/verify-email', 'Verify email · The Aspirant'],
    ['/reset-password', 'Reset password · The Aspirant'],
    ['/signup', 'Sign up · The Aspirant'],
    ['/forgot-password', 'Forgot password · The Aspirant'],
    ['/support', 'Support · The Aspirant'],
    ['/this-path-does-not-exist', 'Page not found · The Aspirant'],
  ];

  for (const [path, title] of TITLED) {
    test(`${path} sets the tab title to "${title}"`, async ({ page }) => {
      await page.goto(path);
      await dismissMobileSidebarIfPresent(page);
      await expect(page).toHaveTitle(title);
    });
  }
});

test.describe('AP6: code-style text takes the house face', () => {
  for (const width of [390, 1440]) {
    test(`the 404 path and the BTC address are Iosevka at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });

      await page.goto('/this-path-does-not-exist');
      await dismissMobileSidebarIfPresent(page);
      const path = page.locator('.not-found-message code');
      await expect(path).toBeVisible();
      await expect.poll(() => path.evaluate((el) => getComputedStyle(el).fontFamily))
        .toContain('Iosevka');

      await page.goto('/support');
      await dismissMobileSidebarIfPresent(page);
      const address = page.locator('.address-box code');
      await expect(address).toBeVisible();
      await expect.poll(() => address.evaluate((el) => getComputedStyle(el).fontFamily))
        .toContain('Iosevka');

      expect(await noSideways(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('AP6: one verb for signing in, one ink for its labels', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the card and the sidebar form agree, in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.emulateMedia({ colorScheme: theme });

      await page.goto('/login');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('h1')).toHaveText('Sign in');
      const cardButton = page.getByRole('button', { name: 'Sign in' });
      await expect(cardButton).toBeVisible();
      const cardLabel = page.locator('.login-view-card .field__label').first();
      const cardColor = await cardLabel.evaluate((el) => getComputedStyle(el).color);

      await page.goto('/admin/login');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('h1')).toHaveText('Admin sign-in');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

      // The sidebar mounts the same form on any anonymous public page.
      await page.goto('/support');
      await openMobileSidebarIfPresent(page);
      const sidebarForm = page.locator('.sidebar .login-card');
      await expect(sidebarForm.getByRole('button', { name: 'Sign in' })).toBeVisible();
      const sidebarLabel = sidebarForm.locator('.field__label').first();
      const sidebarColor = await sidebarLabel.evaluate((el) => getComputedStyle(el).color);

      expect(sidebarColor, 'sidebar label ink matches the card label ink').toBe(cardColor);
    });
  }
});
