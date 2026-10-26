import { test, expect, type Page, type Route } from '@playwright/test';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installCardgenMocks,
  seedCardgenAssets,
  seedCardgenUsage,
  seedCardgenRefusals,
  seedCardgenTypes,
  seedCardgenTemplates,
  seedCardgenExportProfiles,
  seedCardgenCards,
  seedCardgenResolved,
  type CardgenResolvedFace,
} from './helpers/mockBackend';

/** system_3 #8634 / #8649 — the card editor's Cards section, the print-scale
 *  review: every card drawn from its server-resolved faces at physical size.
 *  The server is mocked in-process (helpers/mockBackend.ts installCardgenMocks). */

const PX_PER_MM = 96 / 25.4;

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

function face(elements: CardgenResolvedFace['elements'], size = { w_mm: 105, h_mm: 74.25, radius_mm: 3 }): CardgenResolvedFace {
  return { chain: ['base', 'relationship'], size, size_provenance: {}, elements };
}

const TYPES = [
  { id: 1, slug: 'relationship', name: 'Relationship', description: '', display_order: 1 },
  { id: 2, slug: 'action', name: 'Action', description: '', display_order: 2 },
];

const CARDS = [
  { id: 11, slug: 'rel_v', name: 'V', card_type_id: 1, template_id: 5, goal_card_id: null, relationship_type_id: 3, display_order: 1, current_version_no: 2 },
  { id: 12, slug: 'rel_w', name: 'W', card_type_id: 1, template_id: 5, goal_card_id: null, relationship_type_id: 4, display_order: 2, current_version_no: 1 },
  { id: 13, slug: 'act_a', name: 'Act A', card_type_id: 2, template_id: 6, goal_card_id: 7, relationship_type_id: null, display_order: 1, current_version_no: 1 },
  // #8804 O5: a caption this long used to widen the grid cell past the card.
  { id: 14, slug: 'rel_ktp', name: 'KITCHEN TABLE POLYAMORY', card_type_id: 1, template_id: 5, goal_card_id: null, relationship_type_id: 5, display_order: 3, current_version_no: 1 },
];

const RESOLVED = {
  11: {
    front: face([
      { name: 'bg', props: { kind: 'rect', x_mm: 0, y_mm: 0, w_mm: 105, h_mm: 74.25, fill: '#223355', z: 0 }, provenance: {} },
      { name: 'art', props: { kind: 'image', x_mm: 5, y_mm: 5, w_mm: 40, h_mm: 40, asset_id: 1, fit: 'contain', z: 1 }, provenance: {} },
      { name: 'title', props: { kind: 'text', x_mm: 50, y_mm: 10, w_mm: 50, h_mm: 12, text: 'V <b>bold</b>', size_pt: 18, weight: 'bold', color: '#ffffff', font_asset_id: 4, z: 2 }, provenance: {} },
      { name: 'secret', props: { kind: 'text', x_mm: 50, y_mm: 30, w_mm: 50, h_mm: 10, text: 'hidden note', hidden: true, z: 2 }, provenance: {} },
    ]),
    back: face([{ name: 'bg', props: { kind: 'rect', x_mm: 0, y_mm: 0, w_mm: 105, h_mm: 74.25, fill: '#aa3344', z: 0 }, provenance: {} }]),
  },
  12: {
    front: face([{ name: 'title', props: { kind: 'text', x_mm: 5, y_mm: 5, w_mm: 95, h_mm: 10, text: 'W', size_pt: 14 }, provenance: {} }]),
    back: null,
  },
  13: {
    front: face([{ name: 'title', props: { kind: 'text', x_mm: 5, y_mm: 5, w_mm: 53, h_mm: 10, text: 'Act A', size_pt: 14 }, provenance: {} }], { w_mm: 63, h_mm: 88, radius_mm: 3 }),
    back: null,
  },
  14: {
    front: face([{ name: 'title', props: { kind: 'text', x_mm: 5, y_mm: 5, w_mm: 95, h_mm: 10, text: 'KITCHEN TABLE POLYAMORY', size_pt: 14 }, provenance: {} }]),
    back: null,
  },
};

const ASSETS = [
  { id: 1, sha256: 'a'.repeat(64), original_filename: 'moon.png', media_type: 'image/png', kind: 'image' as const, byte_size: 100, pixel_width: 600, pixel_height: 300, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/1/content', created_at: '2026-10-24T17:00:00Z' },
  { id: 4, sha256: 'b'.repeat(64), original_filename: 'display.ttf', media_type: 'font/ttf', kind: 'font' as const, byte_size: 100, pixel_width: 0, pixel_height: 0, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/4/content', created_at: '2026-10-24T17:00:00Z' },
];

/** Below 640 px the type filter is a select (#8753 req 1); above, a radio strip. */
async function chooseType(page: Page, name: string): Promise<void> {
  const select = page.locator('[data-test="review-type-select"]');
  if (await select.count()) {
    await page.getByRole('combobox', { name: 'Show cards of type' }).click();
    await page.getByRole('option', { name }).click();
  } else {
    await page.getByRole('radio', { name }).click();
  }
}

async function openReview(page: Page): Promise<void> {
  await page.goto('/admin/cardgen/cards');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="review-panel"]')).toBeVisible();
  await expect(page.locator('[data-test="review-grid"]')).toBeVisible();
}

test.describe('/admin/cardgen/cards — print-scale review', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes(TYPES);
    seedCardgenTemplates([]);
    seedCardgenExportProfiles([]);
    seedCardgenAssets(ASSETS);
    seedCardgenUsage({});
    seedCardgenRefusals([]);
    seedCardgenCards(CARDS);
    seedCardgenResolved(RESOLVED);
    await installCardgenMocks(page);
  });

  test('draws every card at its physical size, hides hidden elements, renders text as text', async ({ page }) => {
    await openReview(page);
    await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(4);
    await expect(page.locator('[data-test="review-count"]')).toHaveText('4 cards');
    // Below md the review starts at 50 % (#8753 req 1); the size assertions are at 100 %.
    await page.getByRole('radio', { name: '100 %' }).click();
    const faceV = page.locator('[data-test="card-face-11"]');
    const box = await faceV.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - 105 * PX_PER_MM)).toBeLessThan(1);
    expect(Math.abs(box!.height - 74.25 * PX_PER_MM)).toBeLessThan(1);
    const tall = await page.locator('[data-test="card-face-13"]').boundingBox();
    expect(Math.abs(tall!.width - 63 * PX_PER_MM)).toBeLessThan(1);
    expect(Math.abs(tall!.height - 88 * PX_PER_MM)).toBeLessThan(1);
    // Markup in a text value is text, never HTML.
    await expect(faceV.locator('[data-el="title"]')).toHaveText('V <b>bold</b>');
    await expect(faceV.locator('b')).toHaveCount(0);
    await expect(faceV.locator('[data-el="secret"]')).toHaveCount(0);
    await expect(faceV.locator('[data-el="bg"]')).toHaveCSS('background-color', 'rgb(34, 51, 85)');
  });

  test('a long caption wraps under the card instead of widening its grid cell (#8804 O5)', async ({ page }) => {
    await openReview(page);
    await page.getByRole('radio', { name: '100 %' }).click();
    const item = page.locator('[data-test="review-card-14"]');
    const face = page.locator('[data-test="card-face-14"]');
    const [itemBox, faceBox] = await Promise.all([item.boundingBox(), face.boundingBox()]);
    expect(itemBox).not.toBeNull();
    expect(faceBox).not.toBeNull();
    // The grid cell is exactly the card's width -- not wider to fit the caption.
    expect(Math.abs(itemBox!.width - faceBox!.width)).toBeLessThan(1);
    expect(Math.abs(faceBox!.width - 105 * PX_PER_MM)).toBeLessThan(1);
    // The name is still fully present, just wrapped -- nothing was truncated away.
    await expect(item.locator('.review-name')).toHaveText('KITCHEN TABLE POLYAMORY');
    const fits = await item.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, 'the caption overflowed the grid cell instead of wrapping').toBe(true);
  });

  test('resolves artwork and fonts from the asset store by server id', async ({ page }) => {
    await openReview(page);
    const art = page.locator('[data-test="card-face-11"] [data-el="art"] img');
    await expect(art).toHaveAttribute('src', /^blob:/);
    const title = page.locator('[data-test="card-face-11"] [data-el="title"]');
    await expect.poll(() => title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('cardgen-font-4');
    await expect(title).toHaveCSS('font-weight', '700');
  });

  test('zoom scales the faces, the back side draws the back face', async ({ page }) => {
    await openReview(page);
    await page.getByRole('radio', { name: '100 %' }).click();
    await page.getByRole('radio', { name: '50 %' }).click();
    const box = await page.locator('[data-test="card-face-11"]').boundingBox();
    expect(Math.abs(box!.width - 52.5 * PX_PER_MM)).toBeLessThan(1);
    await page.getByRole('radio', { name: 'Back' }).click();
    const faceV = page.locator('[data-test="card-face-11"]');
    await expect(faceV.locator('[data-el="bg"]')).toHaveCSS('background-color', 'rgb(170, 51, 68)');
    await expect(faceV.locator('[data-el="title"]')).toHaveCount(0);
    // A card without a back shows the empty face at its size.
    await expect(page.locator('[data-test="card-face-12"]')).toHaveClass(/card-face--empty/);
  });

  test('filters by card type and shows the empty state for a type with no cards', async ({ page }) => {
    await openReview(page);
    await chooseType(page, 'Action');
    await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(1);
    await expect(page.locator('[data-test="review-card-13"]')).toBeVisible();
    seedCardgenCards([]);
    await chooseType(page, 'Relationship');
    await expect(page.locator('[data-test="review-grid"]')).toHaveCount(0);
    await expect(page.getByText('No cards')).toBeVisible();
  });
});
