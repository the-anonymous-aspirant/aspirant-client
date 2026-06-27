import { test, expect, type Page } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

const PLACEHOLDER_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

const TINY_WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
  'base64',
);

async function mockAudioAsset(page: Page): Promise<void> {
  await page.route(`**/api/fetch-object/${PLACEHOLDER_HASH}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: TINY_WAV,
    });
  });
}

test.describe('Robbans Tusen site-wide audio widget', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await mockAudioAsset(page);
  });

  test('renders the play button and volume slider on the home page', async ({ page }) => {
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    const widget = page.locator('.robbans-tusen');
    await expect(widget).toBeVisible();
    await expect(widget.locator('.rt-button')).toBeVisible();
    await expect(widget.locator('input.rt-volume[type="range"]')).toBeVisible();
  });

  test('volume slider input persists to localStorage', async ({ page }) => {
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    const slider = page.locator('input.rt-volume');
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '0.25';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stored = await page.evaluate(() => localStorage.getItem('robbans_tusen_volume'));
    expect(stored).toBe('0.25');
  });

  test('widget survives route changes (singleton mount in App.vue)', async ({ page }) => {
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.robbans-tusen')).toBeVisible();
    await page.goto('/about');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.robbans-tusen')).toBeVisible();
  });
});
