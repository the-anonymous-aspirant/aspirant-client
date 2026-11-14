import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedViewerSession } from './helpers/mockBackend';

/** Flappy Duo on a phone and in dark (system_3 #10993, UX walk AG1; D11, D9,
 *  D7, §3.122 P3). At 390px Player 2's bird started past the right edge; in
 *  dark the instruction panel kept its light fill under light ink (about
 *  1.08:1); the board was taller than the screen; and at 1440px the High
 *  Scores panel sat on the playfield. Every /api call is answered here. */

async function open(page: Page, theme: string, width: number) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.route(/\/api\//, (r) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await seedViewerSession(page);
  await page.goto('/games/flappyduo');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('.game-area .bird.player2')).toBeVisible();
}

const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;

/** WCAG contrast of an element's ink against its own painted background. */
const ratio = (page: Page, sel: string) =>
  page.locator(sel).evaluate((el) => {
    const rgb = (c: string) =>
      c
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ink = lum(rgb(getComputedStyle(el).color));
    let n: Element | null = el;
    let bg = 'rgba(0, 0, 0, 0)';
    while (n && /rgba\(.*, 0\)$/.test(bg)) {
      bg = getComputedStyle(n).backgroundColor;
      n = n.parentElement;
    }
    const ground = lum(rgb(bg));
    return (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05);
  });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`both birds are on the board, the ground on the first screen (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await open(page, theme, width);
      const board = await box(page, '.game-area');
      for (const sel of ['.game-area .bird.player1', '.game-area .bird.player2']) {
        const b = await box(page, sel);
        expect(b.x, `${sel} left`).toBeGreaterThanOrEqual(board.x);
        expect(b.x + b.width, `${sel} right`).toBeLessThanOrEqual(board.x + board.width);
      }
      const ground = await box(page, '.game-area .ground');
      expect(ground.y + ground.height, 'the ground is on the first screen').toBeLessThanOrEqual(
        page.viewportSize()!.height
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      ).toBe(false);
    });

    test(`the instructions read on their own panel and name each bird (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await open(page, theme, width);
      await expect(page.locator('[data-test="instructions-p1"]')).toContainText(
        'Player 1, the amber bird'
      );
      await expect(page.locator('[data-test="instructions-p2"]')).toContainText(
        'Player 2, the white bird'
      );
      for (const sel of ['[data-test="instructions-p1"]', '[data-test="instructions-p2"]']) {
        const r = await ratio(page, sel);
        expect(r, `${sel} ${theme} ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    test(`High Scores sits outside the playfield (${theme}, ${width}px)`, async ({ page }) => {
      await open(page, theme, width);
      await expect(page.locator('.game-area .high-scores-panel')).toHaveCount(0);
      const scores = await box(page, '[data-test="high-scores"]');
      const board = await box(page, '.game-area');
      expect(scores.y).toBeGreaterThanOrEqual(board.y + board.height);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`on a touch phone the lines name each bird and its side, on their own panel (${theme})`, async ({
    browser,
  }) => {
    // The branch a phone player sees: `isMobileDevice` is true only with touch.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.route(/\/api\//, (r) =>
      r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await seedViewerSession(page);
    await page.goto('/games/flappyduo');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="instructions-p1"]')).toContainText(
      'Player 1, the amber bird: tap the left side to flap'
    );
    await expect(page.locator('[data-test="instructions-p2"]')).toContainText(
      'Player 2, the white bird: tap the right side to flap'
    );
    await expect(page.locator('.bird-swatch.player1')).toBeVisible();
    await expect(page.locator('.bird-swatch.player2')).toBeVisible();
    for (const sel of ['[data-test="instructions-p1"]', '[data-test="instructions-p2"]']) {
      const r = await ratio(page, sel);
      expect(r, `${sel} touch ${theme} ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
    await context.close();
  });
}

test('after a game, both birds start inside the board again', async ({ page }) => {
  await open(page, 'light', 390);
  await page.getByRole('button', { name: 'Start Game' }).click();
  // Nobody flaps: both fall to the ground and the game ends.
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible({ timeout: 15000 });
  const board = await box(page, '.game-area');
  const b2 = await box(page, '.game-area .bird.player2');
  expect(b2.x + b2.width).toBeLessThanOrEqual(board.x + board.width);
  const ground = await box(page, '.game-area .ground');
  expect(ground.y + ground.height).toBeLessThanOrEqual(844);
});

test('at Start the board grows into the space the instructions leave, and the ground stays on screen', async ({
  page,
}) => {
  await open(page, 'light', 390);
  const before = await box(page, '.game-area');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.time-display')).toBeVisible();
  const during = await box(page, '.game-area');
  expect(during.height).toBeGreaterThan(before.height);
  expect(during.y + during.height).toBeLessThanOrEqual(844);
});
