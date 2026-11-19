import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedTrustedSession } from './helpers/mockBackend';

/**
 * The Applications family answers "where am I, and how do I get back to the
 * list?" on every page under it (system_3 #11000, UX walk AG8):
 *   - the sidebar's Applications item stays marked;
 *   - a link above the title goes back to the index the page is listed on;
 *   - the title is the item's one name, as its index card lists it;
 *   - the title sits left in the page gutter, in the page's own ink.
 */

type Page_ = { path: string; title: string; back: string; backTo: string; member?: boolean; subtitle?: string };

const PAGES: Page_[] = [
  { path: '/applications/quizzes', title: 'Quiz Center', back: 'Applications', backTo: '/applications' },
  { path: '/applications/games', title: 'Game Center', back: 'Applications', backTo: '/applications' },
  { path: '/applications/transparencymapper', title: 'Transperator', back: 'Applications', backTo: '/applications' },
  { path: '/applications/qr-generator', title: 'QR Generator', back: 'Applications', backTo: '/applications' },
  { path: '/applications/emotional-excellence', title: 'Emotional Excellence', back: 'Applications', backTo: '/applications', subtitle: 'Alpha: a proof-of-concept tracker of emotion.' },
  { path: '/applications/constellations', title: 'Constellations', back: 'Applications', backTo: '/applications' },
  { path: '/quizzes/rbguesser', title: 'RGB Guesser', back: 'Quiz Center', backTo: '/applications/quizzes' },
  { path: '/quizzes/sql', title: 'Personality Test: SQL', back: 'Quiz Center', backTo: '/applications/quizzes' },
  { path: '/quizzes/timeline-tech', title: 'Innovation Quiz', back: 'Quiz Center', backTo: '/applications/quizzes', subtitle: 'Put inventions in order, or guess the year each was made.' },
  { path: '/quizzes/timeline-people', title: 'People Quiz', back: 'Quiz Center', backTo: '/applications/quizzes', subtitle: 'Put historical figures in order, or guess the year each one belongs to.' },
  { path: '/quizzes/timeline-conflicts', title: 'Conflict Quiz', back: 'Quiz Center', backTo: '/applications/quizzes', subtitle: 'Put historical conflicts in order, or guess the year each one began.' },
  { path: '/games/wordweaver', title: 'WordWeaver', back: 'Game Center', backTo: '/applications/games' },
  { path: '/games/flappyduo', title: 'Flappy Duo', back: 'Game Center', backTo: '/applications/games' },
  { path: '/games/easter-hunt', title: 'Easter Egg Hunt', back: 'Game Center', backTo: '/applications/games', member: true },
];

async function open(page: Page, p: Page_, theme: 'light' | 'dark' = 'light') {
  // A member can open every page in the family; a viewer cannot open the hunt.
  if (p.member) await seedTrustedSession(page);
  else await page.addInitScript(() => localStorage.setItem('user_role', 'Viewer'));
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto(p.path);
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="application-title"]')).toBeVisible();
}

// The page's ink, read off a probe styled with the token the title uses.
const inkOfPage = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--text-on-light)';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });

for (const p of PAGES) {
  test(`#11000 ${p.path}: one name, a way back, and the section marked`, async ({ page }) => {
    await open(page, p);
    const title = page.locator('[data-test="application-title"]');
    await expect(title).toHaveText(p.title);
    // Only one page title.
    await expect(page.locator('h1:visible')).toHaveCount(1);
    const back = page.locator('[data-test="application-back"]');
    await expect(back).toHaveText(new RegExp(`${p.back}$`));
    await expect(back).toHaveAttribute('href', p.backTo);
    // The sidebar's Applications item is marked, on the page under it too.
    await expect(page.locator('.nav-links a[href="/applications"]')).toHaveClass(/\bactive\b/);

    const s = await title.evaluate((el) => ({ align: getComputedStyle(el).textAlign, color: getComputedStyle(el).color }));
    expect(s.align, 'the title sits left, not centred').toBe('left');
    expect(s.color, "the title is in the page's ink").toBe(await inkOfPage(page));
    // The back link sits above the title, at the same left edge.
    const [b, t] = [(await back.boundingBox())!, (await title.boundingBox())!];
    expect(b.y + b.height).toBeLessThanOrEqual(t.y + 1);
    expect(Math.abs(b.x - t.x)).toBeLessThanOrEqual(1);
    expect(b.height, 'the back link is at least 44px tall').toBeGreaterThanOrEqual(44);
    // The registry's back glyph, not a typed arrow (§3.113).
    await expect(back.locator('.asp-icon')).toHaveCount(1);
    if (p.subtitle) await expect(page.locator('[data-test="application-subtitle"]')).toHaveText(p.subtitle);
    // Nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('#11000 the back link reaches its index, from a page opened by a direct link', async ({ page }) => {
  await open(page, PAGES.find((x) => x.path === '/quizzes/sql')!);
  await page.locator('[data-test="application-back"]').click();
  await expect(page).toHaveURL(/\/applications\/quizzes$/);
  await expect(page.locator('[data-test="application-title"]')).toHaveText('Quiz Center');
});

test('#11000 WordWeaver\'s title is in the page ink in dark too, and no longer amber in light', async ({ page }) => {
  const ww = PAGES.find((x) => x.path === '/games/wordweaver')!;
  await open(page, ww, 'light');
  const light = await page.locator('[data-test="application-title"]').evaluate((el) => getComputedStyle(el).color);
  expect(light).not.toBe('rgb(255, 179, 0)');
  expect(light).toBe(await inkOfPage(page));
});

test('#11000 Game Center\'s subtitle is regular weight, as the other indexes\' are', async ({ page }) => {
  await open(page, PAGES.find((x) => x.path === '/applications/games')!);
  const w = await page.locator('.game-hub h2.page-subtitle').evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(w)).toBeLessThan(600);
});

// §3.107: the 3-line clamp stays, so every index card's description must fit
// it: no clamp may be cutting one (design ack on #11000).
for (const width of [390, 360]) {
  test(`#11000 at ${width}px every index card's description is whole`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const index of ['/applications', '/applications/quizzes', '/applications/games']) {
      await page.addInitScript(() => localStorage.setItem('user_role', 'Trusted'));
      await page.goto(index);
      await dismissMobileSidebarIfPresent(page);
      const d = page.locator('.card-description');
      await expect(d.first()).toBeVisible();
      const cut = await d.evaluateAll((els) => els.filter((el) => el.scrollHeight > el.clientHeight).map((el) => el.textContent?.trim()));
      expect(cut, `${index} at ${width}`).toEqual([]);
    }
  });
}
