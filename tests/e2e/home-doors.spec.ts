import { test, expect, type Page } from '@playwright/test';
import { seedTrustedSession } from './helpers/mockBackend';

/**
 * The landing page shows its doors on a phone (system_3 #10977, UX walk AP1;
 * design_conventions S1, S2, D0, D11, §3.121).
 *
 * At 390px the first screen was the menu button, the title, one sentence and
 * the picture. The sign-in form and the links to Applications and Support were
 * inside the closed drawer, and nothing on the page said so. Now the page shows
 * Sign in (when signed out), Applications and Support above the picture. The
 * drawer stays closed on load, and from 768px the sidebar alone carries them.
 */

const PHONE = { width: 390, height: 844 };
const SENTENCE = 'Just my little slice of the internet - feel free to look around :)';

const doors = (page: Page) => page.locator('[data-test="home-doors"]');
const door = (page: Page, name: string) => page.locator(`[data-test="home-door-${name}"]`);

async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home h1')).toHaveText('The Aspirant');
  await expect(page.locator('.aspiring-hand')).toBeVisible();
}

test.describe('#10977 the landing page on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('signed out: Sign in, Applications and Support sit on the first screen, above the picture', async ({
    page,
  }) => {
    await openHome(page);

    // Real links, in order, each to its own page.
    const links = doors(page).locator('a');
    await expect(links).toHaveText(['Sign in', 'Applications', 'Support']);
    await expect(door(page, 'sign-in')).toHaveAttribute('href', '/login');
    await expect(door(page, 'applications')).toHaveAttribute('href', '/applications');
    await expect(door(page, 'support')).toHaveAttribute('href', '/support');

    // On the first screen and above the picture.
    const hand = await page.locator('.aspiring-hand').boundingBox();
    for (const name of ['sign-in', 'applications', 'support']) {
      const box = await door(page, name).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.y + box!.height, `${name} is on the first screen`).toBeLessThanOrEqual(PHONE.height);
      expect(box!.y + box!.height, `${name} is above the picture`).toBeLessThanOrEqual(hand!.y);
    }

    // The owner's sentence is unchanged, the drawer is closed on load (§3.121),
    // and nothing scrolls sideways.
    await expect(page.locator('.home .page-subtitle')).toHaveText(SENTENCE);
    await expect(page.locator('.mobile-overlay')).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    ).toBe(false);
  });

  test('Sign in opens the sign-in page', async ({ page }) => {
    await openHome(page);
    await door(page, 'sign-in').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signed in: no Sign in door, and the other two stay', async ({ page }) => {
    await seedTrustedSession(page);
    await openHome(page);
    await expect(door(page, 'sign-in')).toHaveCount(0);
    await expect(doors(page).locator('a')).toHaveText(['Applications', 'Support']);
  });
});

test.describe('#10977 the landing page on a desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'a desktop width on a desktop browser');

  test('at 1440 the sidebar carries the doors and the page has no second set', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    await expect(doors(page)).toBeHidden();
    await expect(page.locator('.sidebar a[href="/applications"]')).toBeVisible();
    await expect(page.locator('.sidebar a[href="/support"]')).toBeVisible();
  });
});
