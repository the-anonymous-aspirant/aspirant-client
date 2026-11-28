import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSessionAs,
  seedViewerSession,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/** system_3 #12582: the Christmas cards, an admin-only picture puzzle, with
 *  design_agent's ack c78601. The words are the answers of a real hunt and
 *  this repository is public, so every word, picture and sentence here is
 *  invented. The server is faked in memory below; aspirant-server PR 258's own
 *  tests hold its half (no word on Play, a locked picture is a 404, the Admin
 *  gate on every route). */

const WORDS = ['Alpha', 'Bravo two', 'Charlie', 'Delta', 'Echo', 'Fox trot', 'Golf'];
const SENTENCE = 'An invented closing line for the test.';
// A one-pixel PNG; the fake reports a 4:3 card so the box keeps that ratio.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const norm = (s: string) => s.trim().split(/\s+/).join(' ').toLowerCase();

type Fake = {
  words: string[];
  solved: number;
  solvedAt: string[];
  sentence: string;
  answerStatus: number;
  posts: number;
  // #12780: each card's opening time (null is open now), the server's clock,
  // and the bodies Control's opening-times saves sent.
  opensAt: (string | null)[];
  now: string;
  opensPuts: unknown[];
};

function newFake(solved = 0): Fake {
  return {
    words: [...WORDS],
    solved,
    solvedAt: Array.from({ length: solved }, () => '2026-11-27T14:02:00Z'),
    sentence: SENTENCE,
    answerStatus: 200,
    posts: 0,
    opensAt: Array.from({ length: 7 }, () => null),
    now: '2026-12-01T12:00:00Z',
    opensPuts: [],
  };
}

const isOpen = (f: Fake, n: number) => !f.opensAt[n - 1] || Date.parse(f.now) >= Date.parse(f.opensAt[n - 1] as string);

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function control(f: Fake) {
  return {
    total: 7,
    solved: f.solved,
    sentence: f.sentence,
    cards: f.words.map((word, i) => ({
      number: i + 1,
      word,
      has_picture: true,
      width: 400,
      height: 300,
      state: i < f.solved ? 'solved' : i === f.solved ? 'current' : 'locked',
      solved_at: i < f.solved ? f.solvedAt[i] : null,
      opens_at: f.opensAt[i],
    })),
    now: f.now,
  };
}

async function install(page: Page, f: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(/\/api\/christmas\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/christmas/, '');
    const m = path.match(/\/cards\/(\d+)\//);
    const n = m ? Number(m[1]) : 0;
    if (req.method() === 'GET' && path === '/play') {
      if (f.solved === 7) {
        return json(route, 200, {
          total: 7,
          done: true,
          sentence: f.sentence,
          cards: f.words.map((_, i) => ({ number: i + 1, ready: true, open: true, opens_at: f.opensAt[i], width: 400, height: 300 })),
          now: f.now,
        });
      }
      const c = f.solved + 1;
      return json(route, 200, {
        total: 7,
        done: false,
        current: c,
        card: { number: c, ready: true, open: isOpen(f, c), opens_at: f.opensAt[c - 1], width: 400, height: 300 },
        now: f.now,
      });
    }
    if (req.method() === 'GET' && /^\/(control\/)?cards\/\d+\/picture$/.test(path)) {
      if (!path.startsWith('/control') && (n > f.solved + 1 || (n === f.solved + 1 && !isOpen(f, n)))) {
        return json(route, 404, { error: { code: 'not_found' } });
      }
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (req.method() === 'POST' && path.endsWith('/answer')) {
      f.posts += 1;
      if (f.answerStatus !== 200) return json(route, f.answerStatus, { error: { code: 'internal' } });
      if (n !== f.solved + 1) return json(route, 409, { error: { code: 'not_current' } });
      if (!isOpen(f, n)) return json(route, 409, { error: { code: 'not_open' } });
      const { answer } = req.postDataJSON();
      if (norm(answer) !== norm(f.words[n - 1])) return json(route, 200, { correct: false });
      f.solved = n;
      f.solvedAt[n - 1] = '2026-11-27T15:30:00Z';
      return json(route, 200, { correct: true, done: n === 7 });
    }
    if (req.method() === 'GET' && path === '/control') return json(route, 200, control(f));
    if (req.method() === 'PUT' && path.endsWith('/word')) {
      const { word } = req.postDataJSON();
      if (word.length > 20) return json(route, 400, { error: { code: 'too_long', field: 'word', limit: 20 } });
      f.words[n - 1] = word;
      return json(route, 200, control(f));
    }
    if (req.method() === 'PUT' && path === '/control/sentence') {
      f.sentence = req.postDataJSON().sentence;
      return json(route, 200, control(f));
    }
    if (req.method() === 'PUT' && path === '/control/opens') {
      const body = req.postDataJSON();
      f.opensPuts.push(body);
      f.opensAt = body.opens_at;
      return json(route, 200, control(f));
    }
    if (req.method() === 'POST' && path === '/control/reset') {
      const { to } = req.postDataJSON();
      f.solved = Math.min(f.solved, to - 1);
      f.solvedAt = f.solvedAt.slice(0, f.solved);
      return json(route, 200, control(f));
    }
    return json(route, 404, { error: { code: 'not_found' } });
  });
}

const field = (page: Page) => page.locator('[data-test="christmas-word"]');
const tryButton = (page: Page) => page.locator('[data-test="christmas-try"]');
const status = (page: Page) => page.locator('[data-test="christmas-status"]');
const cardLine = (page: Page) => page.locator('[data-test="christmas-card-line"]');

test.describe('/admin/christmas: admin-only', () => {
  test('a Viewer is sent to the admin sign-in', async ({ page }) => {
    await seedViewerSession(page);
    await install(page, newFake());
    await page.goto('/admin/christmas');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/christmas');
    await expect(page.locator('[data-test="christmas-app"]')).toHaveCount(0);
  });

  test('vinoly, a Member, is sent to the admin sign-in from Play and from Control', async ({ page }) => {
    await seedTrustedSessionAs(page, 'vinoly');
    await install(page, newFake());
    await page.goto('/admin/christmas');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/christmas');
    await page.goto('/admin/christmas/control');
    await expect(page).toHaveURL('/admin/login?redirect=/admin/christmas/control');
    await expect(page.locator('[data-test="christmas-app"]')).toHaveCount(0);
  });
});

test.describe('/admin/christmas: Play', () => {
  test('from the tile to card 1; a wrong word keeps the card; a right one moves on', async ({ page }) => {
    await seedAdminSession(page);
    await install(page, newFake());
    await page.goto('/admin');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('.application-card', { hasText: 'Christmas cards' }).click();
    await expect(page).toHaveURL(/\/admin\/christmas$/);
    await expect(cardLine(page)).toHaveText('Card 1 of 7');
    await expect(page.locator('[data-test="christmas-picture"]')).toBeVisible();
    await expect(field(page)).toHaveAttribute('maxlength', '20');

    await field(page).fill('Bravo');
    await tryButton(page).click();
    await expect(status(page)).toHaveText('Not this one. Try again.');
    await expect(cardLine(page)).toHaveText('Card 1 of 7');
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('Bravo');
    expect(await field(page).evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe(5);

    // Capitals and extra spaces do not matter.
    await field(page).fill('  ALPHA ');
    await field(page).press('Enter');
    await expect(cardLine(page)).toHaveText('Card 2 of 7');
    await expect(cardLine(page)).toBeFocused();
    await expect(field(page)).toHaveValue('');
    await expect(status(page)).toHaveText('');
  });

  test('a failed check is not a wrong word; an empty field sends nothing', async ({ page }) => {
    const fake = newFake();
    await seedAdminSession(page);
    await install(page, fake);
    await page.goto('/admin/christmas');
    await dismissMobileSidebarIfPresent(page);
    await expect(cardLine(page)).toHaveText('Card 1 of 7');

    await field(page).fill('   ');
    await tryButton(page).click();
    await expect(status(page)).toHaveText('');
    expect(fake.posts).toBe(0);

    fake.answerStatus = 500;
    await field(page).fill('Alpha');
    await tryButton(page).click();
    await expect(status(page)).toHaveText("Couldn't check that. Try again.");
    await expect(field(page)).toHaveValue('Alpha');
    await expect(cardLine(page)).toHaveText('Card 1 of 7');
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`the picture and Try fit the first screen at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedAdminSession(page);
      await install(page, newFake());
      await page.goto('/admin/christmas');
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('[data-test="christmas-picture"]')).toBeVisible();
      await expect
        .poll(() => tryButton(page).evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight))
        .toBe(true);
    });
  }

  test('the last right word shows the sentence and the cards; a reload stays there', async ({ page }) => {
    await seedAdminSession(page);
    await install(page, newFake(6));
    await page.goto('/admin/christmas');
    await dismissMobileSidebarIfPresent(page);
    await expect(cardLine(page)).toHaveText('Card 7 of 7');
    await field(page).fill('golf');
    await tryButton(page).click();
    await expect(page.locator('[data-test="christmas-sentence"]')).toHaveText(SENTENCE);
    await expect(page.locator('[data-test="christmas-thumb"]')).toHaveCount(7);
    // The thumbnails are pictures, not controls.
    await expect(page.locator('[data-test="christmas-finale"]').locator('button, a')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-test="christmas-sentence"]')).toHaveText(SENTENCE);
  });
});

test.describe('/admin/christmas/control', () => {
  test('words are masked until Show answers; states read in words', async ({ page }) => {
    await seedAdminSession(page);
    await install(page, newFake(2));
    await page.goto('/admin/christmas/control');
    await dismissMobileSidebarIfPresent(page);
    const row = (n: number) => page.locator(`[data-test="christmas-row-${n}"]`);
    await expect(row(1).locator('[data-test="christmas-row-state"]')).toContainText(/Solved \d{1,2} Nov, \d{2}:\d{2}/);
    await expect(row(3).locator('[data-test="christmas-row-state"]')).toContainText('Current');
    await expect(row(4).locator('[data-test="christmas-row-state"]')).toContainText('Locked');
    await expect(page.locator('[data-test="christmas-control"]')).not.toContainText('Bravo two');
    await expect(page.locator('[data-test="christmas-control"]')).not.toContainText(SENTENCE);
    await page.locator('[data-test="christmas-show-answers"]').getByRole('checkbox').check();
    await expect(row(2).locator('[data-test="christmas-word-text"]')).toHaveText('Bravo two');
    await expect(page.locator('[data-test="christmas-sentence-preview"]')).toHaveText(SENTENCE);
    // The toggle starts off again on every load.
    await page.reload();
    await expect(page.locator('[data-test="christmas-control"]')).not.toContainText('Bravo two');
  });

  test('a refused word keeps its draft; a saved one shows in its row', async ({ page }) => {
    const fake = newFake();
    await seedAdminSession(page);
    await install(page, fake);
    await page.goto('/admin/christmas/control');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('[data-test="christmas-show-answers"]').getByRole('checkbox').check();
    await page.locator('[data-test="christmas-word-edit-4"]').click();
    const input = page.locator('[data-test="christmas-word-input"]');
    await expect(input).toBeFocused();
    // maxlength stops typing at 20, so the over-long word goes in by script.
    await input.evaluate((el: HTMLInputElement) => {
      el.removeAttribute('maxlength');
    });
    await input.fill('An invented word too long');
    await page.locator('[data-test="christmas-word-save"]').click();
    await expect(page.locator('[data-test="christmas-row-4"]')).toContainText('This is too long.');
    await expect(input).toHaveValue('An invented word too long');
    await input.fill('Hotel');
    await page.locator('[data-test="christmas-word-save"]').click();
    await expect(page.locator('[data-test="christmas-row-4"] [data-test="christmas-word-text"]')).toHaveText('Hotel');
    expect(fake.words[3]).toBe('Hotel');
  });

  test('go back names its effect, then the table is redrawn', async ({ page }) => {
    const fake = newFake(4);
    await seedAdminSession(page);
    await install(page, fake);
    await page.goto('/admin/christmas/control');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('[data-test="christmas-go-back-select"]').click();
    await page.getByRole('option', { name: 'Card 3' }).click();
    await page.locator('[data-test="christmas-go-back"]').click();
    await expect(page.getByRole('dialog')).toContainText('Go back to card 3?');
    await expect(page.locator('[data-test="christmas-go-back-effect"]')).toHaveText(
      'Cards 3 to 7 will be locked again and their solved times cleared.',
    );
    await page.locator('[data-test="christmas-go-back-confirm"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-test="christmas-row-3"] [data-test="christmas-row-state"]')).toContainText('Current');
    await expect(page.locator('[data-test="christmas-row-4"] [data-test="christmas-row-state"]')).toContainText('Locked');
    expect(fake.solved).toBe(2);
  });
});

test.describe('#12780 the cards open one at a time', () => {
  test('a card before its time shows when it opens and counts down on the server\'s clock, then opens', async ({ page }) => {
    // The browser's clock is a day off: the countdown must run on the server's.
    await page.clock.install({ time: new Date('2026-12-18T09:00:00Z') });
    await seedAdminSession(page);
    const f = newFake(1);
    f.opensAt[1] = '2026-12-19T23:00:00Z';
    f.now = '2026-12-19T22:58:55Z';
    await install(page, f);
    await page.goto('/admin/christmas');

    await expect(cardLine(page)).toHaveText('Card 2 of 7');
    await expect(page.locator('[data-test="christmas-opens-at"]')).toHaveText('Opens on Sun 20 Dec, 00:00');
    const countdown = page.locator('[data-test="christmas-countdown"]');
    await expect(countdown).toHaveText('00:01:05');
    await expect(countdown).toHaveAttribute('role', 'timer');
    await expect(page.locator('[data-test="christmas-picture"]')).toHaveCount(0);
    await expect(field(page)).toHaveCount(0);

    await page.clock.fastForward(5000);
    await expect(countdown).toHaveText('00:01:00');

    // At the time the page asks the server again, and the server opens it.
    f.now = '2026-12-19T23:00:00Z';
    await page.clock.fastForward(61000);
    await expect(page.locator('[data-test="christmas-picture"]')).toBeVisible();
    await expect(field(page)).toBeVisible();
    await expect(page.locator('[data-test="christmas-opens"]')).toHaveCount(0);
  });

  test('card 1 can wait too, days away', async ({ page }) => {
    await seedAdminSession(page);
    const f = newFake();
    f.opensAt[0] = '2026-12-18T23:00:00Z';
    f.now = '2026-12-16T18:47:51Z';
    await install(page, f);
    await page.goto('/admin/christmas');
    await expect(cardLine(page)).toHaveText('Card 1 of 7');
    await expect(page.locator('[data-test="christmas-opens-at"]')).toHaveText('Opens on Sat 19 Dec, 00:00');
    await expect(page.locator('[data-test="christmas-countdown"]')).toHaveText(/^2 days 04:12:0\d$/);
  });

  test('Control shows each card\'s time, fills one a day from a date, and saves all seven at once', async ({ page }) => {
    await seedAdminSession(page);
    const f = newFake();
    f.opensAt[1] = '2026-12-19T23:00:00Z';
    await install(page, f);
    await page.goto('/admin/christmas/control');

    const opens = page.locator('[data-test="christmas-row-opens"]');
    await expect(opens.nth(0)).toContainText('Now');
    await expect(opens.nth(1)).toContainText('Sun 20 Dec, 00:00');

    await page.locator('[data-test="christmas-opens-edit"]').click();
    await expect(page.locator('[data-test="christmas-opens-input-2"]')).toHaveValue('2026-12-20T00:00');
    await page.locator('[data-test="christmas-opens-fill-from"]').fill('2026-12-19');
    await page.locator('[data-test="christmas-opens-fill"]').click();
    for (let n = 1; n <= 7; n++) {
      await expect(page.locator(`[data-test="christmas-opens-input-${n}"]`)).toHaveValue(`2026-12-${18 + n}T00:00`);
    }
    await page.locator('[data-test="christmas-opens-input-1"]').fill('');
    await page.locator('[data-test="christmas-opens-save"]').click();

    await expect(page.locator('[data-test="christmas-opens-save"]')).toHaveCount(0);
    expect(f.opensPuts).toEqual([
      { opens_at: [null, ...[19, 20, 21, 22, 23, 24].map((d) => `2026-12-${d}T23:00:00Z`)] },
    ]);
    await expect(opens.nth(0)).toContainText('Now');
    await expect(opens.nth(6)).toContainText('Fri 25 Dec, 00:00');
  });
});
