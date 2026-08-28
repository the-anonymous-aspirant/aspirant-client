import { test, expect, type Page, type Locator } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4446 (#4442-A10d) — the /applications, /games and /quizzes surfaces adopt two
 * DS primitives: glyph-only controls become AspButton size="icon" (§3.89 /
 * §3.23 rule-4) and three tab strips become AspSegmented as="tabs" (§3.89 Q1).
 *
 * These assert the OUTCOME — a DS root, an accessible name, a real target box,
 * a working handler, the ARIA the pattern promises — not the class list of the
 * moment, so a regression is caught however it is reintroduced.
 *
 * The second half of the file guards the strips this child deliberately did NOT
 * port. Each holds for a recorded reason, and each guard exists so a later
 * reflexive port reds a test instead of silently degrading the surface:
 *
 *   H1  GameTimeline.vue `.history-tabs` (x2) — members carry <img> icons and a
 *       live count; `opt.icon` is text-only, so the image cannot ride. #4450.
 *   H2  GameWordWeaver.vue `.language-selector` — members carry :title (the full
 *       language name) and :disabled; `disabled` rides, the title has no seam.
 *       Also #4450.
 *   H3  EmotionalExcellence.vue `.intensity-buttons` — a 1-5 rating SCALE, not a
 *       tab/mode/filter strip. AspSegmented mutes its selected member on purpose
 *       so a mode choice does not spend the accent budget, which is backwards
 *       for the primary datum on that card. The DS has no scale primitive.
 */

/** Computed foreground-over-effective-background contrast for `el`.
 *  Same measurement as tests/e2e/trusted-contrast.spec.ts:25 (#3027 / #3014). */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let bg = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    return (Math.max(lum(eff), lum(bg)) + 0.05) / (Math.min(lum(eff), lum(bg)) + 0.05);
  });
}

/**
 * The shape every ported strip must have: a named tablist, the expected members,
 * a selected member whose aria-controls resolves to a real tabpanel, and one tab
 * stop for the whole group (the roving tabindex the native strips never had).
 */
async function expectPortedTabStrip(
  page: Page,
  groupName: string,
  labels: string[],
  selected: string,
  panelId: string,
): Promise<void> {
  const strip = page.getByRole('tablist', { name: groupName });
  await expect(strip, `${groupName}: rendered`).toBeVisible();
  await expect(strip.locator('.segmented__item'), `${groupName}: DS members`).toHaveCount(labels.length);
  await expect(strip.getByRole('tab'), `${groupName}: member labels`).toHaveText(labels);

  const live = page.getByRole('tab', { name: selected, exact: true });
  await expect(live, `${groupName}: selected member says so`).toHaveAttribute('aria-selected', 'true');
  await expect(live, `${groupName}: names its panel`).toHaveAttribute('aria-controls', panelId);
  await expect(page.locator(`#${panelId}`), `${groupName}: the panel is a tabpanel`)
    .toHaveAttribute('role', 'tabpanel');

  await expect(live, `${groupName}: owns the tab stop`).toHaveAttribute('tabindex', '0');
  const other = labels.find((l) => l !== selected)!;
  await expect(page.getByRole('tab', { name: other, exact: true }), `${groupName}: siblings are skipped`)
    .toHaveAttribute('tabindex', '-1');

  // The strip inherits the consumer's ink (§3.18); assert the outcome rather
  // than reading the token names off the stylesheet.
  const selectedInk = await contrastRatio(live);
  expect(selectedInk, `${groupName}: selected member clears AA`).toBeGreaterThanOrEqual(4.5);
  const mutedInk = await contrastRatio(page.getByRole('tab', { name: other, exact: true }));
  expect(mutedInk, `${groupName}: unselected member clears AA`).toBeGreaterThanOrEqual(4.5);
}

/**
 * WordWeaver pulls its three sound files from /api/fetch-object/* on mount and
 * its leaderboard from /api/games/scores. Nothing is served in preview, so the
 * page otherwise runs on a burst of failed requests — which crashed the WebKit
 * page mid-suite (an ordering-dependent flake, not a regression: the same
 * navigation passes on its own). Mocking them is the suite's own convention:
 * no backend is required to run these tests.
 */
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

// ---------------------------------------------------------------- ported ----

test.describe('#4446 /games/wordweaver — glyph-only controls + tab strip', () => {
  test.beforeEach(async ({ page }) => {
    await installWordWeaverMocks(page);
  });

  test('the tab strip is AspSegmented as="tabs" over four real panels', async ({ page }) => {
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('h1', { hasText: 'WordWeaver' })).toBeVisible();

    await expectPortedTabStrip(
      page,
      'WordWeaver views',
      ['Game', 'Valid Words', 'Highscores', 'About'],
      'Game',
      'ww-panel-game',
    );

    // The Game panel wraps three blocks in one display:contents tabpanel, so
    // the board is inside it and the layout is unchanged.
    await expect(page.locator('#ww-panel-game .board')).toBeVisible();
    await expect(page.locator('#ww-panel-game .score')).toBeVisible();

    // Clicking a member still switches the panel...
    await page.getByRole('tab', { name: 'About', exact: true }).click();
    await expect(page.locator('#ww-panel-about')).toBeVisible();
    await expect(page.locator('#ww-panel-game')).toHaveCount(0);

    // ...and so does the keyboard, which is what as="tabs" buys.
    await page.getByRole('tab', { name: 'About', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Highscores', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#ww-panel-scores')).toBeVisible();
  });

  test('the mute control is an icon AspButton that kept an accessible name', async ({ page }) => {
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);

    // NOTE (#4446 decision H4): .sound-toggle is display:none at EVERY
    // breakpoint on origin/main and this port did not change that — the control
    // is unreachable in the running app, which is reported to the operator
    // rather than silently "fixed" here. So this asserts the attached element,
    // not a visible one. Do not "repair" this test by unhiding the control.
    const btn = page.locator('.sound-toggle button');
    await expect(btn, 'mute: exists').toHaveCount(1);
    await expect(btn, 'mute: is the DS icon shape').toHaveClass(/btn--size-icon/);
    // The native control had no aria-label — its accessible name came from the
    // `title` the port moved into AspTooltip, so the label had to be added or
    // the port would have left it nameless.
    await expect(btn, 'mute: named').toHaveAttribute('aria-label', 'Mute');
    await expect(btn, 'mute: still hidden, per H4').toBeHidden();
  });

  test('the d-pad glyphs are icon AspButtons that still move the piece', async ({ page }) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width > 768, '.mobile-controls is display:none >=769px — mobile project only');

    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('button', { name: 'Start Game' }).click();

    const dpad = page.locator('.mobile-controls');
    await expect(dpad).toBeVisible();

    for (const name of ['Move Left', 'Move Down', 'Move Right']) {
      const btn = page.getByRole('button', { name });
      await expect(btn, `${name}: rendered`).toBeVisible();
      await expect(btn, `${name}: is the DS icon shape`).toHaveClass(/btn--size-icon/);
      const box = await btn.boundingBox();
      expect(box, `${name}: has a box`).not.toBeNull();
      // The consumer keeps the 60x60 thumb target rather than taking the DS
      // 44x44 default; size="icon" is documented as a fixed >=44px SQUARE, so
      // assert the square and the floor, which is what the rule actually says.
      expect(Math.round(box!.width), `${name}: square`).toBe(Math.round(box!.height));
      expect(Math.round(box!.width), `${name}: clears the 44px target floor`).toBeGreaterThanOrEqual(44);
      const ink = await contrastRatio(btn);
      expect(ink, `${name}: glyph clears AA`).toBeGreaterThanOrEqual(4.5);
    }

    // The handler still fires through AspButton's emitted click: the falling
    // piece spawns in the centre column, so Move Left moves it one column left.
    const columnOf = () =>
      page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#ww-panel-game .board .row'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('.cell'));
          const i = cells.findIndex((c) => (c.textContent ?? '').trim() !== '');
          if (i !== -1) return i;
        }
        return -1;
      });

    const before = await columnOf();
    expect(before, 'a piece is on the board').toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Move Left' }).click();
    await expect.poll(columnOf, { message: 'Move Left moved the piece' }).toBe(before - 1);
  });
});

test.describe('#4446 /applications/emotional-excellence — tab strip', () => {
  test('the tab strip is AspSegmented as="tabs" over three real panels', async ({ page }) => {
    await page.goto('/applications/emotional-excellence');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('h1', { hasText: 'Emotional Excellence' })).toBeVisible();

    await expectPortedTabStrip(
      page,
      'Emotion tracker views',
      ['Current', 'Collected Data', 'Emotion Heatmap'],
      'Current',
      'ee-panel-current',
    );

    await page.getByRole('tab', { name: 'Emotion Heatmap', exact: true }).click();
    await expect(page.locator('#ee-panel-heatmap')).toBeVisible();
    await expect(page.locator('#ee-panel-heatmap h2')).toHaveText('Emotion Heatmap');

    await page.getByRole('tab', { name: 'Collected Data', exact: true }).click();
    await expect(page.locator('#ee-panel-data')).toBeVisible();
    await expect(page.locator('#ee-panel-current')).toHaveCount(0);
  });
});

test.describe('#4446 /games/easter-hunt — tab strip', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    // No hunt is running in the fixture, which is the state the view is built
    // for (`No active game right now`); the strip renders either way.
    await page.route((url) => url.pathname.startsWith('/api/games/easter-hunt'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) }),
    );
  });

  test('the tab strip is AspSegmented as="tabs" and switches the rules panel', async ({ page }) => {
    await page.goto('/games/easter-hunt');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('h1', { hasText: 'Easter Egg Hunt' })).toBeVisible();

    await expectPortedTabStrip(
      page,
      'Easter hunt views',
      ['Rules', 'Game'],
      'Rules',
      'eh-panel-rules',
    );
    await expect(page.locator('#eh-panel-rules h3')).toHaveText('How to Play');

    await page.getByRole('tab', { name: 'Game', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Game', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#eh-panel-rules')).toHaveCount(0);
  });
});

// ------------------------------------------------------------------ held ----

test.describe('#4446 strips held out of the port, and why', () => {
  test('H1 GameTimeline history tabs stay native, with their <img> icons and live counts', async ({ page }) => {
    await page.goto('/quizzes/timeline-tech');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.mode-selector')).toBeVisible();

    // Held for #4450: AspSegmented interpolates opt.icon as TEXT, so these
    // <img> icons cannot ride an option. Porting would mean degrading them to
    // emoji, which is a downgrade of the view, not a migration.
    const strip = page.locator('.leaderboard-section .history-tabs');
    await expect(strip, 'the leaderboard strip is still native').toBeVisible();
    await expect(strip.locator('button.tab-btn')).toHaveCount(2);
    await expect(strip.locator('.segmented__item'), 'not ported while #4450 is open').toHaveCount(0);
    await expect(page.locator('.leaderboard-section .history-tabs button').first())
      .toContainText('Sequencing');
  });

  test('H2 the WordWeaver language selector stays native, keeping its per-member title', async ({ page }) => {
    await installWordWeaverMocks(page);
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);

    // Held for #4450: `disabled` rides an AspSegmented option, but `title` —
    // the only disclosure of what EN/SV/PT mean — has no per-option seam.
    const strip = page.locator('.language-selector');
    await expect(strip.locator('button.lang-btn')).toHaveCount(3);
    await expect(strip.locator('.segmented__item'), 'not ported while #4450 is open').toHaveCount(0);
    await expect(strip.locator('button', { hasText: 'EN' })).toHaveAttribute('title', 'English');
    await expect(strip.locator('button', { hasText: 'SV' })).toHaveAttribute('title', 'Svenska');
  });

  test('H3 the emotion intensity scale stays a native rating input', async ({ page }) => {
    await page.goto('/applications/emotional-excellence');
    await dismissMobileSidebarIfPresent(page);

    // Held by decision, not by a DS gap: this is a value the user enters and
    // saves, so muting the selected member the way AspSegmented does on purpose
    // would be backwards. If a scale primitive is wanted it belongs in the DS.
    const scale = page.locator('.intensity-buttons');
    await expect(scale.locator('button')).toHaveCount(5);
    await expect(scale.locator('.segmented__item'), 'deliberately not an AspSegmented').toHaveCount(0);

    await scale.locator('button', { hasText: '4' }).click();
    await expect(scale.locator('button.active')).toHaveText('4');
  });
});
