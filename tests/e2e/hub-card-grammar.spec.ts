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
