import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * The RGB guesser fits a phone's first screen and ends where its content ends
 * (system_3 #10997, UX walk AG5; design_conventions D11, S1, S2, §3.114).
 *
 * At 390px the page was 2,139px tall: the target circle at y ~285, Guess! at
 * y ~1,155 on an 844px screen, and ~900px of blank page after the game (ten
 * hidden placeholder slots for the guess history). Nothing said what the game
 * was. The title position is asserted with its sibling pages in
 * page-gutter-applications.spec.ts.
 */

const HOW_TO =
  'Match the target colour with the R, G and B sliders. After each guess, every channel says higher or lower. You have 10 guesses.';

async function openGame(page: Page, size: { width: number; height: number }) {
  await seedViewerSession(page);
  await page.setViewportSize(size);
  await page.goto('/quizzes/rbguesser');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('.RBGuesser h1')).toHaveText('RGB Guesser');
}

const bottomOf = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  return box!.y + box!.height;
};

test.describe('#10997 the RGB guesser on a phone', () => {
  const PHONE = { width: 390, height: 844 };

  test('the how-to line, the target, the three sliders and Guess! are on the first screen', async ({ page }) => {
    await openGame(page, PHONE);
    await expect(page.locator('[data-test="rgb-how-to"]')).toHaveText(HOW_TO);
    for (const sel of ['.target-circle', '#r-slider', '#g-slider', '#b-slider']) {
      expect(await bottomOf(page, sel), `${sel} is on the first screen`).toBeLessThanOrEqual(PHONE.height);
    }
    const guess = page.getByRole('button', { name: 'Guess!' });
    await expect(guess).toBeVisible();
    const g = (await guess.boundingBox())!;
    expect(g.y + g.height, 'Guess! is on the first screen').toBeLessThanOrEqual(PHONE.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    ).toBe(false);
  });

  test('the page ends where the game ends: no blank history slots', async ({ page }) => {
    await openGame(page, PHONE);
    await expect(page.locator('.guess-item')).toHaveCount(0);
    const contentBottom = await bottomOf(page, '.controls-card');
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    // The shell's bottom gutter (16px on a phone) plus the card's own margin.
    expect(scrollHeight, 'no blank page after the game').toBeLessThanOrEqual(Math.max(PHONE.height, contentBottom + 64));
  });

  test('a guess adds one history entry and gives a hint per channel', async ({ page }) => {
    await openGame(page, PHONE);
    await page.getByRole('button', { name: 'Guess!' }).click();
    await expect(page.locator('.guess-item')).toHaveCount(1);
    await expect(page.locator('.hint')).toHaveText([/higher|lower|^$/i, /higher|lower|^$/i, /higher|lower|^$/i]);
    // Hints appear only on a channel that is off, so at least one shows at 0,0,0
    // unless the target is pure black.
    const shown = await page.locator('.hint').evaluateAll((els) => els.filter((e) => e.textContent!.trim()).length);
    expect(shown).toBeGreaterThan(0);
  });
});

test.describe('#10997 the RGB guesser on a desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'a desktop width on a desktop browser');

  test('at 1440 the game is on the first screen and the page ends with it', async ({ page }) => {
    const DESKTOP = { width: 1440, height: 900 };
    await openGame(page, DESKTOP);
    await expect(page.locator('[data-test="rgb-how-to"]')).toBeVisible();
    const g = (await page.getByRole('button', { name: 'Guess!' }).boundingBox())!;
    expect(g.y + g.height).toBeLessThanOrEqual(DESKTOP.height);
    const contentBottom = await bottomOf(page, '.controls-card');
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThanOrEqual(Math.max(DESKTOP.height, contentBottom + 80));
  });
});
