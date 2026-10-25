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
  seedCardgenResolved,
  cardgenSeed,
} from './helpers/mockBackend';

/** system_3 #8634 / #8650 — the card editor's Templates section: the list,
 *  the editor with provenance, override and reset, save as a version, history
 *  and restore, create, and the asset picker. Mocked in-process
 *  (helpers/mockBackend.ts installCardgenMocks; the chain merge over the
 *  seeded specs lives in resolveSeedTemplate). */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const BASE_SPEC = {
  size: { w_mm: 105, h_mm: 74.25, radius_mm: 5 },
  elements: {
    title: { kind: 'text', x_mm: 6, y_mm: 6, w_mm: 93, h_mm: 12, size_pt: 16, align: 'center', weight: 'bold', color: '#111111', z: 10, text: '' },
    body: { kind: 'text', x_mm: 8, y_mm: 22, w_mm: 89, h_mm: 34, size_pt: 8.5, align: 'center', color: '#111111', z: 10, text: '' },
    art: { kind: 'image', x_mm: 0, y_mm: 0, w_mm: 105, h_mm: 74.25, fit: 'cover', z: 0, hidden: true },
  },
};
const REL_SPEC = { elements: { art: { hidden: false }, title: { color: '#ffffff', size_pt: 18 } } };

const TEMPLATES = [
  { id: 1, slug: 'base', name: 'Base card', parent_template_id: null, parent_slug: '', current_version_no: 1, spec: BASE_SPEC },
  { id: 2, slug: 'relationship', name: 'Relationship front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: REL_SPEC },
  { id: 3, slug: 'action', name: 'Action front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: {} } },
];

const ASSETS = [
  { id: 1, sha256: 'a'.repeat(64), original_filename: 'moon.png', media_type: 'image/png', kind: 'image' as const, byte_size: 100, pixel_width: 600, pixel_height: 300, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/1/content', created_at: '2026-10-24T17:00:00Z' },
  { id: 4, sha256: 'b'.repeat(64), original_filename: 'display.ttf', media_type: 'font/ttf', kind: 'font' as const, byte_size: 100, pixel_width: 0, pixel_height: 0, uploaded_by_user_id: 1, content_url: '/api/cardgen/assets/4/content', created_at: '2026-10-24T17:00:00Z' },
];

async function openTemplates(page: Page): Promise<void> {
  await page.goto('/admin/cardgen/templates');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="templates-panel"]')).toBeVisible();
  await expect(page.locator('[data-test="template-list"] > li')).toHaveCount(3);
}

async function openEditor(page: Page, id: number): Promise<void> {
  await openTemplates(page);
  await page.locator(`[data-test="template-${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/cardgen/templates/${id}$`));
  await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
  await expect(page.locator('[data-test="element-list"] button')).not.toHaveCount(0);
}

test.describe('/admin/cardgen/templates — editor with version history', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes([]);
    seedCardgenTemplates(TEMPLATES.map((t) => ({ ...t, spec: JSON.parse(JSON.stringify(t.spec)) })));
    seedCardgenTemplateVersions({});
    seedCardgenExportProfiles([]);
    seedCardgenAssets(ASSETS);
    seedCardgenUsage({});
    seedCardgenRefusals([]);
    seedCardgenCards([]);
    seedCardgenResolved({});
    await installCardgenMocks(page);
  });

  test('lists templates with their parent and version', async ({ page }) => {
    await openTemplates(page);
    await expect(page.locator('[data-test="template-count"]')).toHaveText('3 templates');
    await expect(page.locator('[data-test="template-2"]')).toContainText('extends base');
    await expect(page.locator('[data-test="template-1"]')).toContainText('extends none');
    await expect(page.locator('[data-test="template-2"]')).toContainText('v1');
  });

  test('shows provenance per prop; editing an inherited value makes it own, Reset lets the parent show through', async ({ page }) => {
    await openEditor(page, 2);
    await page.locator('[data-test="element-title"]').click();
    const colour = page.locator('[data-test="prop-color"]');
    await expect(colour).toHaveAttribute('data-provenance', 'own');
    await expect(colour.locator('[data-test="prop-color-badge"]')).toHaveText('this template');
    const x = page.locator('[data-test="prop-x_mm"]');
    await expect(x).toHaveAttribute('data-provenance', 'inherited:base');
    await expect(x.locator('[data-test="prop-x_mm-badge"]')).toHaveText('from base');
    await expect(page.locator('[data-test="dirty-badge"]')).toHaveCount(0);

    // #8753 req 4: the inherited control is live; typing into it writes this
    // template's own layer and the badge flips. No Override step.
    await expect(page.locator('[data-test="prop-x_mm-override"]')).toHaveCount(0);
    const xInput = x.locator('input');
    await expect(xInput).toBeEnabled();
    await expect(xInput).toHaveValue('6');
    await xInput.fill('7');
    await expect(x).toHaveAttribute('data-provenance', 'own');
    await expect(x.locator('[data-test="prop-x_mm-badge"]')).toHaveText('this template');
    await expect(page.locator('[data-test="dirty-badge"]')).toBeVisible();
    await page.locator('[data-test="prop-x_mm-reset"]').click();
    await expect(x).toHaveAttribute('data-provenance', 'inherited:base');
    await expect(xInput).toHaveValue('6');
    await expect(page.locator('[data-test="dirty-badge"]')).toHaveCount(0);
  });

  test('saving creates v2, history lists v1 and v2, restoring v1 creates v3 with the v1 value', async ({ page }) => {
    await openEditor(page, 2);
    // Below md the editor starts at 50 % (#8753); the px assertion is at 100 %.
    await page.getByRole('radio', { name: '100 %' }).click();
    await page.locator('[data-test="element-title"]').click();
    const sizeInput = page.locator('[data-test="prop-size_pt"] input');
    await expect(sizeInput).toHaveValue('18');
    await sizeInput.fill('24');
    await expect(page.locator('[data-test="dirty-badge"]')).toBeVisible();
    // The preview overlays the draft: 24 pt = 32 px at 100 %.
    await expect(page.locator('[data-test="editor-preview"] [data-el="title"]')).toHaveCSS('font-size', '32px');
    await page.locator('[data-test="save-note"]').fill('bigger title');
    await page.locator('[data-test="save-version"]').click();
    await expect(page.locator('[data-test="template-version"]')).toContainText('v2');
    await expect(page.locator('[data-test="dirty-badge"]')).toHaveCount(0);
    await expect(page.locator('[data-test="version-2"]')).toContainText('bigger title');
    await expect(page.locator('[data-test="version-2"] [data-test="version-current"]')).toBeVisible();
    await expect(page.locator('[data-test="version-1"]')).toBeVisible();

    await page.locator('[data-test="restore-1"]').click();
    await expect(page.locator('[data-test="template-version"]')).toContainText('v3');
    await expect(page.locator('[data-test="version-3"]')).toContainText('restored from v1');
    await expect(page.locator('[data-test="prop-size_pt"] input')).toHaveValue('18');
    expect(cardgenSeed.templateVersions[2].map((v) => v.version_no)).toEqual([1, 2, 3]);
  });

  test('a new template extends base and opens with every prop inherited', async ({ page }) => {
    await openTemplates(page);
    await page.locator('[data-test="new-template"]').click();
    await page.locator('[data-test="create-name"]').fill('Life front');
    await page.locator('[data-test="create-slug"]').fill('life');
    await page.locator('[data-test="create-confirm"]').click();
    await expect(page.locator('[data-test="template-editor"]')).toBeVisible();
    await expect(page.locator('[data-test="template-version"]')).toContainText('life · v1');
    await page.locator('[data-test="element-body"]').click();
    await expect(page.locator('[data-test="prop-size_pt"]')).toHaveAttribute('data-provenance', 'inherited:base');
    await page.locator('[data-test="editor-back"]').click();
    await expect(page.locator('[data-test="template-list"] > li')).toHaveCount(4);
    await expect(page.locator('[data-test="template-4"]')).toContainText('extends base');
  });

  test('the asset picker sets a font by its server id and the preview uses it', async ({ page }) => {
    await openEditor(page, 2);
    await page.locator('[data-test="element-title"]').click();
    await page.locator('[data-test="prop-font_asset_id-pick"]').click();
    await expect(page.locator('[data-test="asset-picker"]')).toBeVisible();
    await expect(page.locator('[data-test="pick-asset-1"]')).toHaveCount(0);
    await page.locator('[data-test="pick-asset-4"]').click();
    await expect(page.locator('[data-test="prop-font_asset_id-value"]')).toHaveText('asset 4');
    const title = page.locator('[data-test="editor-preview"] [data-el="title"]');
    await expect.poll(() => title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('cardgen-font-4');
  });

  test('a hidden inherited element is drawn dashed in the editor and an own element can be added', async ({ page }) => {
    await openEditor(page, 1);
    await expect(page.locator('[data-test="editor-preview"] [data-el="art"]')).toHaveClass(/el--hidden/);
    await page.locator('[data-test="add-element"]').click();
    await page.locator('[data-test="add-element-name"]').fill('Bad Name');
    await page.locator('[data-test="add-element-confirm"]').click();
    await expect(page.getByText('Use lowercase letters, digits and underscores')).toBeVisible();
    await page.locator('[data-test="add-element-name"]').fill('frame');
    await page.locator('[data-test="add-element-confirm"]').click();
    await expect(page.locator('[data-test="element-frame"]')).toContainText('own');
    await expect(page.locator('[data-test="editor-preview"] [data-el="frame"]')).toBeVisible();
    await page.locator('[data-test="remove-element"]').click();
    await expect(page.locator('[data-test="element-frame"]')).toHaveCount(0);
  });
});
