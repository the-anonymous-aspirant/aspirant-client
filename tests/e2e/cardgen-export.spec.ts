import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

/** system_3 #8634 / #8652 — the card editor's Export section: the print PDF
 *  built in the browser with pdfmake from the server-resolved faces. Mocked
 *  in-process; the page count is read from the panel and, for the download,
 *  from the file's page objects. */

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
  },
};

const TYPES = [
  { id: 1, slug: 'relationship', name: 'Relationship', description: '', front_template_id: 2, back_template_id: 4, display_order: 1 },
  { id: 2, slug: 'action', name: 'Action', description: '', front_template_id: 3, back_template_id: null, display_order: 2 },
];
const TEMPLATES = [
  { id: 1, slug: 'base', name: 'Base card', parent_template_id: null, parent_slug: '', current_version_no: 1, spec: BASE_SPEC },
  { id: 2, slug: 'relationship', name: 'Relationship front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { art: { hidden: false, asset_id: 1 }, title: { color: '#ffffff' } } } },
  { id: 3, slug: 'action', name: 'Action front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { title: { font_asset_id: 4 } } } },
  { id: 4, slug: 'relationship_back', name: 'Relationship back', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { art: { hidden: false, asset_id: 1 }, title: { hidden: true }, body: { hidden: true } } } },
];
const REL_CARDS = Array.from({ length: 8 }, (_, i) => ({
  id: 11 + i, slug: `rel_${i}`, name: `Rel ${i + 1}`, card_type_id: 1, template_id: null, goal_card_id: null, relationship_type_id: null, display_order: i + 1, current_version_no: 1,
  data: { values: { title: { text: `Rel ${i + 1}` } } },
}));
const ACT_CARD = { id: 31, slug: 'act_a', name: 'Act A', card_type_id: 2, template_id: null, goal_card_id: null, relationship_type_id: null, display_order: 1, current_version_no: 1, data: { values: { title: { text: 'ACT A' } } } };

const ASSETS = [
  { id: 1, sha256: 'a'.repeat(64), original_filename: 'moon.png', media_type: 'image/png', kind: 'image' as const, byte_size: 100, pixel_width: 4, pixel_height: 4, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/1/content', created_at: '2026-10-24T17:00:00Z' },
  { id: 4, sha256: 'b'.repeat(64), original_filename: 'display.ttf', media_type: 'font/ttf', kind: 'font' as const, byte_size: 100, pixel_width: 0, pixel_height: 0, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/4/content', created_at: '2026-10-24T17:00:00Z' },
];

const A4_2x4 = { card_w_mm: 105, card_h_mm: 74.25, radius_mm: 5, bleed_mm: 3, dpi: 300, crop_marks: true, backs: 'mirror', sheet: { page: 'A4', cols: 2, rows: 4, gap_mm: 0, margin_mm: 0, orientation: 'portrait' } };
const PROFILES = [
  { id: 1, name: 'Prototype A4 2x4', spec: A4_2x4 },
  { id: 2, name: 'A4 2x4 fronts only', spec: { ...A4_2x4, backs: 'none' } },
  { id: 3, name: 'A4 2x2', spec: { ...A4_2x4, sheet: { ...A4_2x4.sheet, cols: 2, rows: 2, gap_mm: 6, margin_mm: 10 } } },
];

async function openExport(page: Page): Promise<void> {
  await page.goto('/admin/cardgen/export');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="export-panel"]')).toBeVisible();
  await expect(page.locator('[data-test="export-profile-facts"]')).toBeVisible();
}

/** Below 640 px the card selection is a select (#8753 req 1); above, a radio strip. */
async function chooseCards(page: Page, name: string): Promise<void> {
  const select = page.locator('[data-test="export-type-select"]');
  if (await select.count()) {
    await page.getByRole('combobox', { name: 'Cards to export' }).click();
    await page.getByRole('option', { name }).click();
  } else {
    await page.getByRole('radio', { name }).click();
  }
}

async function chooseProfile(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Export profile' }).click();
  await page.getByRole('option', { name }).click();
}

async function build(page: Page): Promise<void> {
  await page.locator('[data-test="export-build"]').click();
  await expect(page.locator('[data-test="export-result"]')).toBeVisible({ timeout: 30000 });
}

function countPages(path: string): number {
  const bytes = readFileSync(path, 'latin1');
  return (bytes.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

test.describe('/admin/cardgen/export — print PDF', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes(TYPES);
    seedCardgenTemplates(TEMPLATES.map((t) => ({ ...t, spec: JSON.parse(JSON.stringify(t.spec)) })));
    seedCardgenTemplateVersions({});
    seedCardgenExportProfiles(PROFILES);
    seedCardgenAssets(ASSETS);
    seedCardgenUsage({});
    seedCardgenRefusals([]);
    seedCardgenCards([...REL_CARDS, ACT_CARD].map((c) => ({ ...c, data: JSON.parse(JSON.stringify(c.data)) })));
    seedCardgenCardVersions({});
    seedCardgenResolved({});
    await installCardgenMocks(page);
  });

  test('eight relationship cards on the A4 2x4 preset with mirrored backs make 2 pages, and the download has 2 page objects', async ({ page }) => {
    await openExport(page);
    await chooseCards(page, 'Relationship');
    await build(page);
    await expect(page.locator('[data-test="export-pages"]')).toHaveText('2 pages');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-test="export-download"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(countPages(path!)).toBe(2);
  });

  test('the same selection with backs off makes 1 page', async ({ page }) => {
    await openExport(page);
    await chooseProfile(page, 'A4 2x4 fronts only');
    await chooseCards(page, 'Relationship');
    await build(page);
    await expect(page.locator('[data-test="export-pages"]')).toHaveText('1 page');
  });

  test('a 2x2 sheet over the eight cards makes 4 pages: front, back, front, back', async ({ page }) => {
    await openExport(page);
    await chooseProfile(page, 'A4 2x2');
    await chooseCards(page, 'Relationship');
    await build(page);
    await expect(page.locator('[data-test="export-pages"]')).toHaveText('4 pages');
  });

  test('a raster under the profile DPI is listed as a warning naming the card; a card without raster adds none', async ({ page }) => {
    await openExport(page);
    await chooseCards(page, 'Relationship');
    await build(page);
    const warnings = page.locator('[data-test="export-warning-low-dpi"]');
    await expect(warnings.first()).toContainText('Rel 1: art is 4×4 px');
    await expect(warnings.first()).toContainText('against the profile\'s 300');
    // 8 fronts + 8 backs each carry the art: one grouped line for the one
    // asset (#8754 R3), the 16 per-face entries behind its disclosure.
    await expect(warnings).toHaveCount(16);
    const groups = page.locator('[data-test="export-dpi-group"]');
    await expect(groups).toHaveCount(1);
    await expect(groups.first()).toContainText('moon.png');
    await expect(groups.first()).toContainText('(4×4 px) prints at');
    await expect(groups.first()).toContainText('on 16 faces; 300 DPI needs 1276×913 px');
    // The asset name opens it in the viewer.
    await page.locator('[data-test="export-dpi-asset-1"]').click();
    await expect(page.locator('[data-test="asset-viewer"]')).toBeVisible();
    await page.locator('[data-test="viewer-close"]').click();

    await chooseCards(page, 'Action');
    await build(page);
    await expect(page.locator('[data-test="export-pages"]')).toHaveText('1 page');
    await expect(page.locator('[data-test="export-warning-low-dpi"]')).toHaveCount(0);
  });

  test('a card using a store font exports without a fallback warning', async ({ page }) => {
    await openExport(page);
    await chooseCards(page, 'Action');
    await build(page);
    await expect(page.locator('[data-test="export-result"]')).toBeVisible();
    await expect(page.locator('[data-test="export-warning-font-fallback"]')).toHaveCount(0);
    await expect(page.locator('[data-test="export-error"]')).toHaveCount(0);
  });
});
