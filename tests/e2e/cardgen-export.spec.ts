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

// A real 248x171 JPEG (a gradient, written by PyMuPDF with correct markers;
// pdfkit refuses hand-made bytes). Its aspect, 1.450, matches the middle rows'
// 108x74.25 mm box (1.455, no crop) and not the edge rows' 108x77.25 mm box
// (1.398, a crop), so one export places it both ways (#8819).
const JPEG_248x171 = Buffer.from('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GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGIiIiIiIiIiIiIiIiIiIiL/8QAFhEBAQEAAAAAAAAAAAAAAAAAEQBQ/9oACAECAQE/AWZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZwP//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEABj8CKr//xAAVEAEBAAAAAAAAAAAAAAAAAAAAAf/aAAgBAQABPyGEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhCEIQhC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', 'base64');

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

  test('a placed JPEG lands in the file as JPEG, once, whether or not its box crops it (#8804 O2)', async ({ page }) => {
    seedCardgenAssets([{ ...ASSETS[0], original_filename: 'bg.jpg', media_type: 'image/jpeg', pixel_width: 248, pixel_height: 171 }, ASSETS[1]]);
    await page.route(/\/api\/cardgen\/assets\/1\/content$/, async (route: Route) => {
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }, body: JPEG_248x171 });
    });
    await openExport(page);
    await chooseProfile(page, 'A4 2x4 fronts only');
    await chooseCards(page, 'Relationship');
    await build(page);
    await expect(page.locator('[data-test="export-pages"]')).toHaveText('1 page');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-test="export-download"]').click();
    const path = await (await downloadPromise).path();
    const bytes = readFileSync(path!);
    const text = bytes.toString('latin1');
    // One image object for the eight placements, DCT-encoded at the source's
    // own pixel size, no alpha mask: the canvas crop used to write one RGBA
    // PNG per asset per box aspect.
    expect(text.match(/\/Subtype\s*\/Image/g) || []).toHaveLength(1);
    expect(text.match(/\/Filter\s*\/DCTDecode/g) || []).toHaveLength(1);
    expect(text).toMatch(/\/Width 248\b/);
    expect(text).toMatch(/\/Height 171\b/);
    expect(text).not.toMatch(/\/SMask/);
    // The stored bytes themselves, unchanged.
    expect(bytes.indexOf(JPEG_248x171)).toBeGreaterThan(-1);
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
