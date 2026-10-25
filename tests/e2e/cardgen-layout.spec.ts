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
  seedCardgenTemplateVersions,
  seedCardgenExportProfiles,
  seedCardgenCards,
  seedCardgenCardVersions,
  seedCardgenResolved,
} from './helpers/mockBackend';

/** system_3 #8753 (D2 findings U1, U3, U11) — the Card Editor's layout rules
 *  and addressable editors: no page scrolls sideways at 390 px; the element
 *  list never paints over the inspector at 1024 and 1280; a template or card
 *  has a URL that opens its editor, and the asset viewer's "Used by" links
 *  land on it. Mocked in-process; the 25-card deck mirrors the review's walk. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const BASE_SPEC = {
  size: { w_mm: 105, h_mm: 74.25, radius_mm: 5 },
  elements: {
    art: { kind: 'image', x_mm: 0, y_mm: 0, w_mm: 105, h_mm: 74.25, fit: 'cover', z: 0, hidden: true },
    title: { kind: 'text', x_mm: 6, y_mm: 6, w_mm: 93, h_mm: 12, size_pt: 16, align: 'center', weight: 'bold', color: '#111111', z: 10, text: '' },
    body: { kind: 'text', x_mm: 8, y_mm: 22, w_mm: 89, h_mm: 34, size_pt: 8.5, align: 'center', color: '#111111', z: 10, text: 'Default body' },
    silent_icon: { kind: 'image', x_mm: 3, y_mm: 3, w_mm: 6, h_mm: 6, fit: 'contain', z: 20, hidden: true },
  },
};
const TYPES = [
  { id: 1, slug: 'relationship', name: 'Relationship', description: '', front_template_id: 2, back_template_id: 4, display_order: 1 },
  { id: 2, slug: 'action', name: 'Action', description: '', front_template_id: 3, back_template_id: null, display_order: 2 },
  { id: 3, slug: 'life', name: 'Life', description: '', front_template_id: 3, back_template_id: null, display_order: 3 },
  { id: 4, slug: 'connection', name: 'Connection', description: '', front_template_id: 2, back_template_id: 4, display_order: 4 },
];
const TEMPLATES = [
  { id: 1, slug: 'base', name: 'Base card', parent_template_id: null, parent_slug: '', current_version_no: 1, spec: BASE_SPEC },
  { id: 2, slug: 'relationship', name: 'Relationship front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { art: { hidden: false, asset_id: 1 }, title: { color: '#ffffff' } } } },
  { id: 3, slug: 'action', name: 'Action front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: {} } },
  { id: 4, slug: 'relationship_back', name: 'Relationship back', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { art: { hidden: false, asset_id: 1 }, title: { hidden: true }, body: { hidden: true } } } },
];
const CARDS = Array.from({ length: 25 }, (_, i) => ({
  id: 11 + i, slug: `c_${i}`, name: `Card ${i + 1}`, card_type_id: 1 + (i % 4), template_id: null, goal_card_id: null, relationship_type_id: null, display_order: i + 1, current_version_no: 1,
  data: { values: { title: { text: `Card ${i + 1}` } } },
}));
const ASSETS = [
  { id: 1, sha256: 'a'.repeat(64), original_filename: 'moon.png', media_type: 'image/png', kind: 'image' as const, byte_size: 100, pixel_width: 4, pixel_height: 4, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/1/content', created_at: '2026-10-24T17:00:00Z' },
];
const PROFILES = [
  { id: 1, name: 'Prototype A4 2x4', spec: { card_w_mm: 105, card_h_mm: 74.25, radius_mm: 5, bleed_mm: 3, dpi: 300, crop_marks: true, backs: 'mirror', sheet: { page: 'A4', cols: 2, rows: 4, gap_mm: 0, margin_mm: 0, orientation: 'portrait' } } },
];

async function seedAll(page: Page): Promise<void> {
  await seedAdminSession(page);
  await installNoiseCatchAll(page);
  seedCardgenTypes(TYPES);
  seedCardgenTemplates(TEMPLATES.map((t) => ({ ...t, spec: JSON.parse(JSON.stringify(t.spec)) })));
  seedCardgenTemplateVersions({});
  seedCardgenExportProfiles(PROFILES);
  seedCardgenAssets(ASSETS);
  seedCardgenUsage({ 1: { templates: [{ id: 2, slug: 'relationship', name: 'Relationship front', version_no: 1, elements: ['art'] }], cards: [{ id: 11, slug: 'c_0', name: 'Card 1', version_no: 1, elements: ['art'] }] } });
  seedCardgenRefusals([]);
  seedCardgenCards(CARDS.map((c) => ({ ...c, data: JSON.parse(JSON.stringify(c.data)) })));
  seedCardgenCardVersions({});
  seedCardgenResolved({});
  await installCardgenMocks(page);
}

async function widths(page: Page): Promise<{ scroll: number; client: number }> {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

test.describe('phone: no page scrolls sideways (U1, U2)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the five pages fit a 390 px viewport', async ({ page }) => {
    await seedAll(page);
    for (const path of ['/admin/cardgen/assets', '/admin/cardgen/templates', '/admin/cardgen/cards', '/admin/cardgen/export', '/admin/cardgen/templates/2']) {
      await page.goto(path);
      await dismissMobileSidebarIfPresent(page);
      await expect(page.locator('[data-test="cardgen-app"]')).toBeVisible();
      if (path.endsWith('/cards')) await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(25);
      if (path.endsWith('/templates/2')) await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
      await page.waitForTimeout(300);
      const w = await widths(page);
      expect(w.scroll, `${path}: scrollWidth ${w.scroll} vs clientWidth ${w.client}`).toBe(w.client);
    }
  });

  test('the editor starts at 50 % on a phone and Save stays within the viewport', async ({ page }) => {
    await seedAll(page);
    await page.goto('/admin/cardgen/templates/2');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
    await expect(page.getByRole('radio', { name: '50 %' })).toBeChecked();
    const save = await page.locator('[data-test="save-version"]').boundingBox();
    expect(save).not.toBeNull();
    expect(save!.x + save!.width).toBeLessThanOrEqual(390);
    await expect(page.locator('[data-test="review-type-select"]')).toHaveCount(0);
    await page.goto('/admin/cardgen/cards');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="review-type-select"]')).toBeVisible();
  });
});

for (const width of [1024, 1280]) {
  test.describe(`desktop ${width}: the element list stays inside its column (U3)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('every element row fits and none overlaps the inspector', async ({ page }) => {
      await seedAll(page);
      await page.goto('/admin/cardgen/templates/2');
      await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
      await page.locator('[data-test="element-silent_icon"]').click();
      const rows = page.locator('[data-test="element-list"] .element');
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      const inspector = await page.locator('[data-test="element-inspector"]').boundingBox();
      expect(inspector).not.toBeNull();
      for (let i = 0; i < n; i += 1) {
        const row = rows.nth(i);
        const fits = await row.evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(fits, `element row ${i} overflows its box`).toBe(true);
        const box = (await row.boundingBox())!;
        expect(box.x + box.width, `element row ${i} overlaps the inspector`).toBeLessThanOrEqual(inspector!.x + 0.5);
      }
    });
  });
}

test.describe('addressable editors (U11)', () => {
  test('a template and a card open from their URLs and return to their lists', async ({ page }) => {
    await seedAll(page);
    await page.goto('/admin/cardgen/templates/2');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
    await expect(page.locator('[data-test="template-version"]')).toContainText('relationship');
    await page.locator('[data-test="editor-back"]').click();
    await expect(page).toHaveURL(/\/admin\/cardgen\/templates$/);
    await expect(page.locator('[data-test="template-list"] > li')).toHaveCount(4);

    await page.goto('/admin/cardgen/cards/11');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="card-editor"]')).toBeVisible();
    await expect(page.locator('[data-test="card-version"]')).toContainText('c_0');
    await page.locator('[data-test="card-back"]').click();
    await expect(page).toHaveURL(/\/admin\/cardgen\/cards$/);
    await expect(page.locator('[data-test="review-grid"]')).toBeVisible();
  });

  test('the asset viewer\'s Used-by links land on the item', async ({ page }) => {
    await seedAll(page);
    await page.goto('/admin/cardgen/assets');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('[data-test="asset-card-1"]').click();
    const link = page.locator('[data-test="usage-template"] a');
    await expect(link).toHaveAttribute('href', '/admin/cardgen/templates/2');
    await link.click();
    await expect(page).toHaveURL(/\/admin\/cardgen\/templates\/2$/);
    await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
  });
});
