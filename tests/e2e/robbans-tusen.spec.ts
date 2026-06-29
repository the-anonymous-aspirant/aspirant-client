import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

const TINY_WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
  'base64',
);

async function mockAudioAsset(page: Page): Promise<void> {
  await page.route(/\/api\/fetch-object\/[0-9a-f]{64}/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      body: TINY_WAV,
    });
  });
}

async function mockPushupEndpoints(page: Page): Promise<void> {
  await page.route(/\/api\/pushups\/entries$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    });
  });
  await page.route(/\/api\/pushups\/milestones$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ milestones: [] }),
    });
  });
}

test.describe('Robbans Tusen audio widget scoped to Pappas pushups', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await mockAudioAsset(page);
    await mockPushupEndpoints(page);
  });

  test('renders on /trusted/pappas-pushups with play button and volume slider', async ({ page }) => {
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    const widget = page.locator('.robbans-tusen');
    await expect(widget).toBeVisible();
    await expect(widget.locator('.rt-button')).toBeVisible();
    await expect(widget.locator('input.rt-volume[type="range"]')).toBeVisible();
  });

  test('volume slider input persists to localStorage', async ({ page }) => {
    await page.goto('/trusted/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
    const slider = page.locator('input.rt-volume');
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '0.25';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const stored = await page.evaluate(() => localStorage.getItem('robbans_tusen_volume'));
    expect(stored).toBe('0.25');
  });

  test('widget does NOT render on the site root', async ({ page }) => {
    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.robbans-tusen')).toHaveCount(0);
  });

  test('widget does NOT render on other Trusted routes', async ({ page }) => {
    await page.goto('/trusted/goals');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.robbans-tusen')).toHaveCount(0);
  });
});
