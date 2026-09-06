import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  seedAdminSession,
  seedTrustedSession,
  seedViewerSession,
  dismissMobileSidebarIfPresent,
} from './helpers/mockBackend';

/**
 * #5284 (system_3 §3.106 R6b) — ONE hub-card grammar for the client.
 *
 * The client shipped two answers to one question ("launch an app"):
 * /applications rendered AspCard tiles (title in a header slot, a centered
 * glyph, a trailing `Open →` link in a footer) while /member, /admin, /quizzes
 * and /games rendered ApplicationCard (drawn icon on top, then title and
 * description, whole card clickable). The ruling picks the icon-led whole-card
 * grammar; /applications adopts it and the `Open →` link drops.
 *
 * These assert the RENDERED OUTCOME, not the arrays or the class list of the
 * moment:
 *
 *  - the hubs agree on one card root, and the AspCard tile is gone from the
 *    surface entirely (the two-grammar state is what fails here);
 *  - the icon leads the card GEOMETRICALLY (top edges compared), so a CSS
 *    reorder that leaves the DOM order intact is still caught;
 *  - the whole card is the affordance, checked by clicking the bottom-right
 *    corner — the region that used to be the `Open →` footer and was the only
 *    part of the old tile that read as a link. A click on the title would have
 *    passed before the change too, so it would not be evidence.
 *
 * No backend runs. The icon fetches (/api/fetch-object/<md5>) fail in preview
 * and each card falls back to ApplicationCard's #5162 default-image path, which
 * is also what an unauthenticated visitor sees; the cards carry their text and
 * their box either way.
 */

/** The five hubs that answer "launch an app", and the session each needs. */
const HUBS: { path: string; seed: (page: Page) => Promise<void>; label: string }[] = [
  { path: '/applications', seed: seedViewerSession, label: 'applications' },
  { path: '/quizzes', seed: seedViewerSession, label: 'quizzes' },
  { path: '/games', seed: seedViewerSession, label: 'games' },
  { path: '/member', seed: seedTrustedSession, label: 'member' },
  { path: '/admin', seed: seedAdminSession, label: 'admin' },
];

/** The six rows of the /applications registry, by rendered title. */
const APPLICATION_TITLES = [
  'Transperator',
  'Quiz Center',
  'Game Center',
  'Emotional Excellence',
  'QR Generator',
  'Constellations',
];

async function box(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  expect(b, 'element has a layout box').not.toBeNull();
  return b!;
}

test.describe('#5284 one hub-card grammar (§3.106 R6b)', () => {
  for (const hub of HUBS) {
    test(`${hub.label}: renders the icon-led card and no AspCard tile`, async ({ page }) => {
      await hub.seed(page);
      await page.goto(hub.path);
      await dismissMobileSidebarIfPresent(page);

      const cards = page.locator('.application-card');
      await expect(cards.first(), `${hub.path}: renders hub cards`).toBeVisible();
      expect(await cards.count(), `${hub.path}: at least one card`).toBeGreaterThan(0);

      // The other grammar must not survive anywhere on the surface. Before
      // this change /applications answered 6 here and every other hub 0.
      await expect(page.locator('.app-card'), `${hub.path}: no AspCard tiles`).toHaveCount(0);
      await expect(page.getByText('Open →'), `${hub.path}: no trailing Open link`).toHaveCount(0);
    });
  }

  test('/applications renders one card per registry row, icon above title', async ({ page }) => {
    await seedViewerSession(page);
    await page.goto('/applications');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.application-list .application-card');
    await expect(cards).toHaveCount(APPLICATION_TITLES.length);
    for (const title of APPLICATION_TITLES) {
      await expect(cards.filter({ hasText: title }), `${title}: one card`).toHaveCount(1);
    }

    const card = cards.filter({ hasText: 'QR Generator' });

    // The icon slot is filled either way: a real <img> when the asset resolves,
    // the placeholder div when it does not. Both are the card's icon ROW, and
    // the grammar is about where it sits, not whether the bytes arrived.
    const icon = card.locator('.app-image');
    await expect(icon, 'the card has an icon slot').toHaveCount(1);

    const heading = card.locator('.card-content h2');
    await expect(heading).toHaveText('QR Generator');
    const description = card.locator('.card-content p');
    await expect(description).toContainText('Generate QR codes');

    // Geometric order, not DOM order: icon-top is the ruling's substance.
    const iconBox = await box(icon);
    const headingBox = await box(heading);
    const descriptionBox = await box(description);
    expect(iconBox.y, 'icon sits above the title').toBeLessThan(headingBox.y);
    expect(headingBox.y, 'title sits above the description').toBeLessThan(descriptionBox.y);
  });

  test('the whole card is the affordance — its far corner routes', async ({ page }) => {
    await seedViewerSession(page);
    await page.goto('/applications');
    await dismissMobileSidebarIfPresent(page);

    const card = page.locator('.application-list .application-card', { hasText: 'QR Generator' });

    // Scroll it into view BEFORE measuring. `boundingBox()` is viewport-
    // relative, and at 390x844 this card sits below the fold, so its y is off
    // screen and the `elementFromPoint` probes below return null — which reads
    // as "the card does not own its bottom band" when the truth is "the point
    // was not on screen". `click()` auto-scrolls and hid this on desktop.
    await card.scrollIntoViewIfNeeded();
    const b = await box(card);

    // §3.99 tier 1: 24x24 CSS px is the universal floor for an interactive
    // control. Asserted because the card being a large target is the ruling's
    // stated reason for preferring this grammar, not an incidental property.
    expect(Math.round(b.width), 'card clears the 24px target floor (width)').toBeGreaterThanOrEqual(
      24
    );
    expect(
      Math.round(b.height),
      'card clears the 24px target floor (height)'
    ).toBeGreaterThanOrEqual(24);

    // Two regions far from the heading, hit-tested before anything is clicked:
    // the bottom band (the old tile's `Open →` footer territory) and the right
    // edge at mid-height. `elementFromPoint` is the honest form of "the card
    // owns this pixel" — and it costs no second navigation, which matters
    // because re-running `dismissMobileSidebarIfPresent` after a `goBack()`
    // RE-OPENS the sidebar (the helper's toggle click is unconditional) and
    // hangs on mobile-safari.
    //
    // NOT the literal bottom-right corner: ApplicationCard is `border-radius:
    // var(--radius-pill)` = 40px, so a point 6px in from the corner falls
    // OUTSIDE the rounded shape and lands on the grid container (Playwright
    // reports `.application-list intercepts pointer events`). That is true of
    // /member and /admin too — the shared grammar's shape, not something this
    // change introduced — so both probes sit on edges, not on the corner.
    const owns = await page.evaluate(
      ([x1, y1, x2, y2]) => {
        const cardAt = (x: number, y: number) => {
          const el = document.elementFromPoint(x, y);
          const c = el && (el as Element).closest('.application-card');
          return !!c && (c.textContent ?? '').includes('QR Generator');
        };
        return { bottom: cardAt(x1, y1), right: cardAt(x2, y2) };
      },
      [b.x + b.width / 2, b.y + b.height - 6, b.x + b.width - 6, b.y + b.height / 2]
    );
    expect(owns.bottom, 'the card owns its bottom band').toBe(true);
    expect(owns.right, 'the card owns its right edge').toBe(true);

    // And the bottom band actually routes — a title click would have passed
    // before this change too, so it would not be evidence.
    await card.click({ position: { x: b.width / 2, y: b.height - 6 } });
    await expect(page, 'bottom band routes').toHaveURL(/\/applications\/qr-generator$/);
  });
});

/**
 * #5327 (§3.107) — the hub card sizes to its content, so nothing is clipped.
 *
 * `.application-card` used to be a fixed `height: 160px` with `overflow:
 * hidden` around unconstrained children, so anything that did not fit was cut
 * at whatever pixel the box edge landed on. Measured across all five hubs at
 * 390x844, 34 of 35 cards overflowed. Raising the number did not fix it (190px
 * still clipped 15, because the box is `border-box` with a 3px border and
 * /admin carries a 3-line title), and a number large enough to clear everything
 * left most cards a third empty. The ruling was to drop the fixed height and
 * let the grid's default `align-items: stretch` keep each row even.
 *
 * These assert the property, not a number — a future longer title cannot
 * reintroduce the defect without failing here.
 */
const CARD_HUBS: { path: string; seed: (page: Page) => Promise<void>; label: string }[] = [
  { path: '/applications', seed: seedViewerSession, label: 'applications' },
  { path: '/quizzes', seed: seedViewerSession, label: 'quizzes' },
  { path: '/games', seed: seedViewerSession, label: 'games' },
  { path: '/member', seed: seedTrustedSession, label: 'member' },
  { path: '/admin', seed: seedAdminSession, label: 'admin' },
];

test.describe('#5327 hub cards size to their content', () => {
  for (const hub of CARD_HUBS) {
    test(`${hub.label}: no card overflows its own box`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await hub.seed(page);
      await page.goto(hub.path);
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('.application-card').first()).toBeVisible();

      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('.application-card')]
          .map((el) => ({
            title: el.querySelector('h2')?.textContent?.trim() ?? '?',
            over: el.scrollHeight - el.clientHeight,
          }))
          .filter((c) => c.over > 1)
      );
      expect(bad, `${hub.path}: cards clipping their own content`).toEqual([]);
    });

    test(`${hub.label}: every card in a row is the same height`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await hub.seed(page);
      await page.goto(hub.path);
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('.application-card').first()).toBeVisible();

      // Dropping the fixed height is only acceptable because the grid keeps a
      // ROW even; without this the fix would trade clipping for a ragged grid.
      const ragged = await page.evaluate(() => {
        const rows: Record<number, number[]> = {};
        for (const el of document.querySelectorAll('.application-card')) {
          const r = el.getBoundingClientRect();
          (rows[Math.round(r.top)] ||= []).push(Math.round(r.height));
        }
        return Object.entries(rows)
          .filter(([, hs]) => new Set(hs).size > 1)
          .map(([top, hs]) => ({ top, hs }));
      });
      expect(ragged, `${hub.path}: rows with mismatched card heights`).toEqual([]);
    });
  }

  test('a description too long for 3 lines is absorbed by the clamp, not by the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedViewerSession(page);
    await page.goto('/applications');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.application-card').first()).toBeVisible();

    // The registry has no description long enough to exceed 3 lines now that
    // the card grows, so the safety net is exercised by injecting one.
    //
    // Asserted as "the paragraph's own clamp engages while the CARD does not
    // overflow", not as "the text ends with an ellipsis": the ellipsis is
    // painted by the engine and never appears in the DOM text, so a
    // string-ending assertion would be untestable here and would pass or fail
    // for reasons unrelated to what it claims.
    const result = await page.evaluate(() => {
      const card = document.querySelector('.application-card') as HTMLElement;
      const p = card.querySelector('.card-content p') as HTMLElement;
      p.textContent = 'x '.repeat(200).trim();
      // force layout
      void card.offsetHeight;
      return {
        clampEngaged: p.scrollHeight > p.clientHeight + 1,
        cardOverflow: card.scrollHeight - card.clientHeight,
        textOverflow: getComputedStyle(p).textOverflow,
        lineClamp: getComputedStyle(p).webkitLineClamp,
      };
    });

    expect(result.clampEngaged, 'the paragraph clamp absorbs the overflow').toBe(true);
    expect(result.cardOverflow, 'the card itself still does not clip').toBeLessThanOrEqual(1);
    expect(result.lineClamp, 'the 3-line clamp is in force').toBe('3');
    expect(result.textOverflow, 'the ellipsis affordance is declared explicitly').toBe('ellipsis');
  });
});
