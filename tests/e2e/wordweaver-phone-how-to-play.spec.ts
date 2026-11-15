import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * WordWeaver tells a phone how to play (system_3 #10995, UX walk AG3;
 * design_conventions S1, S2, D11, D12).
 *
 * At 390px the page dropped all three instruction lines (`.intro-text` is
 * display:none below 769px), and those lines name arrow keys a phone does not
 * have. A first-time visitor saw an empty grid and a Start button. Now one line,
 * worded for touch, sits under the title before the game starts and names the
 * ← ↓ → buttons that appear under the board once it does. At 1440 the three
 * original lines are unchanged and the touch line is not shown.
 */

const PHONE = { width: 390, height: 844 };
const TOUCH_LINE =
  'Letters fall one at a time. Steer each with the ← ↓ → buttons under the board to spell the longest words across and down.';

// Same mocks as applications-primitives.spec.ts: the three sound files and the
// leaderboard, so the page does not run on a burst of failed requests.
async function installWordWeaverMocks(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/fetch-object/'),
    (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(0) }),
  );
  await page.route(
    (url) => url.pathname === '/api/games/scores',
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
}

const touchLine = (page: Page) => page.locator('[data-test="wordweaver-touch-how-to"]');

test.beforeEach(async ({ page }) => {
  await seedViewerSession(page);
  await installWordWeaverMocks(page);
});

test.describe('#10995 WordWeaver on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('h1', { hasText: 'WordWeaver' })).toBeVisible();
  });

  test('before the game starts, one touch line says how to play, on the first screen', async ({ page }) => {
    await expect(touchLine(page)).toBeVisible();
    await expect(touchLine(page)).toHaveText(TOUCH_LINE);
    // Between the title and the Start button, on the first screen.
    const line = (await touchLine(page).boundingBox())!;
    const title = (await page.locator('#wordweaver h1').boundingBox())!;
    const start = (await page.getByRole('button', { name: 'Start Game' }).boundingBox())!;
    expect(line.y).toBeGreaterThan(title.y);
    expect(line.y + line.height).toBeLessThanOrEqual(start.y);
    expect(line.y + line.height).toBeLessThanOrEqual(PHONE.height);
    // It names no key a phone does not have, and the desktop lines stay hidden.
    await expect(touchLine(page)).not.toContainText(/arrow keys/i);
    // The three arrows name one control, so they share a line.
    const arrowLines = await touchLine(page).evaluate((p) => {
      const text = p.firstChild?.nodeType === 3 ? p.firstChild : [...p.childNodes].find((n) => n.nodeType === 3 && /←/.test(n.textContent!))!;
      const s = text!.textContent!;
      const tops = ['←', '↓', '→'].map((ch) => {
        const r = document.createRange();
        const i = s.indexOf(ch);
        r.setStart(text!, i);
        r.setEnd(text!, i + 1);
        return Math.round(r.getBoundingClientRect().top);
      });
      return new Set(tops).size;
    });
    expect(arrowLines, 'the ← ↓ → trio is on one line').toBe(1);
    await expect(page.locator('.intro-text')).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    ).toBe(false);
  });

  test('the buttons the line names are there once the game starts', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Game' }).click();
    for (const name of ['Move Left', 'Move Down', 'Move Right']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });
});

test.describe('#10995 WordWeaver on a desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'a desktop width on a desktop browser');

  test('at 1440 the three original lines stay and the touch line is not shown', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/games/wordweaver');
    await expect(page.locator('.intro-text')).toBeVisible();
    await expect(page.locator('.intro-text')).toContainText('Navigate with the arrow keys');
    await expect(touchLine(page)).toBeHidden();
  });
});
