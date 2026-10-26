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
  cardgenSeed,
} from './helpers/mockBackend';

/** system_3 #8634 / #8651 — the card editor's Cards section: create a card,
 *  edit its values over the template defaults, save as a version, restore,
 *  delete. Mocked in-process (helpers/mockBackend.ts installCardgenMocks;
 *  resolveSeedCard performs the server's value overlay over the seeded chain). */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

const BASE_SPEC = {
  size: { w_mm: 105, h_mm: 74.25, radius_mm: 5 },
  elements: {
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
  { id: 2, slug: 'relationship', name: 'Relationship front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { title: { color: '#ffffff' } } } },
  { id: 3, slug: 'action', name: 'Action front', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: {} } },
  { id: 4, slug: 'relationship_back', name: 'Relationship back', parent_template_id: 1, parent_slug: 'base', current_version_no: 1, spec: { elements: { title: { hidden: true }, body: { hidden: true } } } },
];
const CARDS = [
  { id: 11, slug: 'rel_v', name: 'V', card_type_id: 1, template_id: null, goal_card_id: null, relationship_type_id: 3, display_order: 1, current_version_no: 1, data: { values: { title: { text: 'V' } } } },
  { id: 13, slug: 'act_a', name: 'Act A', card_type_id: 2, template_id: null, goal_card_id: 7, relationship_type_id: null, display_order: 1, current_version_no: 1, data: { values: { title: { text: 'ACT A' } } } },
];

async function openCards(page: Page): Promise<void> {
  await page.goto('/admin/cardgen/cards');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="cards-panel"]')).toBeVisible();
  await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(cardgenSeed.cards.length);
}

async function openEditor(page: Page, id: number): Promise<void> {
  await openCards(page);
  await page.locator(`[data-test="review-edit-${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/cardgen/cards/${id}$`));
  await expect(page.locator('[data-test="card-editor"]')).toBeVisible();
  await expect(page.locator('[data-test="card-element-list"] button')).not.toHaveCount(0);
}

test.describe('/admin/cardgen/cards — card editor with version history', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes(TYPES);
    seedCardgenTemplates(TEMPLATES.map((t) => ({ ...t, spec: JSON.parse(JSON.stringify(t.spec)) })));
    seedCardgenTemplateVersions({});
    seedCardgenExportProfiles([]);
    seedCardgenAssets([]);
    seedCardgenUsage({});
    seedCardgenRefusals([]);
    seedCardgenCards(CARDS.map((c) => ({ ...c, data: JSON.parse(JSON.stringify(c.data)) })));
    seedCardgenCardVersions({});
    seedCardgenResolved({});
    await installCardgenMocks(page);
  });

  test('a new action card appears in the review and opens in the editor at v1', async ({ page }) => {
    await openCards(page);
    await page.locator('[data-test="new-card"]').click();
    await page.getByRole('combobox', { name: 'Type', exact: true }).click();
    await page.getByRole('option', { name: 'Action' }).click();
    await page.locator('[data-test="create-card-name"]').fill('Act B');
    await page.locator('[data-test="create-card-slug"]').fill('act_b');
    await page.locator('[data-test="create-card-confirm"]').click();
    await expect(page.locator('[data-test="card-editor"]')).toBeVisible();
    await expect(page.locator('[data-test="card-version"]')).toContainText('Action · act_b · v1');
    await page.locator('[data-test="card-back"]').click();
    await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(3);
    await expect(page.locator('[data-test="review-card-14"]')).toContainText('Act B');
  });

  test('a value shows its template default; typing sets the card text, Save creates v2', async ({ page }) => {
    await openEditor(page, 13);
    await page.locator('[data-test="card-element-body"]').click();
    const text = page.locator('[data-test="prop-text"]');
    await expect(text).toHaveAttribute('data-provenance', 'inherited:base');
    await expect(text.locator('textarea')).toHaveValue('Default body');
    await expect(page.locator('[data-test="card-editor-preview"] [data-el="body"]')).toHaveText('Default body');
    // #8753 req 4: the control is live; typing writes the card's own layer.
    await expect(page.locator('[data-test="prop-text-override"]')).toHaveCount(0);
    await expect(text.locator('textarea')).toBeEnabled();
    await text.locator('textarea').fill('Play this card <i>now</i>');
    await expect(text).toHaveAttribute('data-provenance', 'own');
    await expect(page.locator('[data-test="card-editor-preview"] [data-el="body"]')).toHaveText('Play this card <i>now</i>');
    await expect(page.locator('[data-test="card-editor-preview"] i')).toHaveCount(0);
    await expect(page.locator('[data-test="card-dirty-badge"]')).toBeVisible();
    await page.locator('[data-test="card-save-note"]').fill('body written');
    await page.locator('[data-test="card-save-version"]').click();
    await expect(page.locator('[data-test="card-version"]')).toContainText('v2');
    await expect(page.locator('[data-test="card-dirty-badge"]')).toHaveCount(0);
    await expect(text.locator('[data-test="prop-text-badge"]')).toHaveText('this card');
    await expect(page.locator('[data-test="version-2"]')).toContainText('body written');
  });

  test('Reset removes the override so the template default shows again', async ({ page }) => {
    await openEditor(page, 11);
    await page.locator('[data-test="card-element-title"]').click();
    const text = page.locator('[data-test="prop-text"]');
    await expect(text).toHaveAttribute('data-provenance', 'own');
    await expect(text.locator('textarea')).toHaveValue('V');
    await page.locator('[data-test="prop-text-reset"]').click();
    await expect(text).toHaveAttribute('data-provenance', 'inherited:base');
    await expect(text.locator('textarea')).toHaveValue('');
    await expect(page.locator('[data-test="card-element-title"]')).toContainText('template');
    // The relationship type has a back: it is drawn beside the front.
    await expect(page.locator('[data-test="card-editor-back"]')).toBeVisible();
  });

  test('history lists v1 and v2; restoring v1 creates v3 with the v1 text', async ({ page }) => {
    await openEditor(page, 13);
    await page.locator('[data-test="card-element-title"]').click();
    await page.locator('[data-test="prop-text"] textarea').fill('ACT A, SECOND');
    await page.locator('[data-test="card-save-version"]').click();
    await expect(page.locator('[data-test="card-version"]')).toContainText('v2');
    await expect(page.locator('[data-test="version-1"]')).toBeVisible();
    await expect(page.locator('[data-test="version-2"] [data-test="version-current"]')).toBeVisible();
    // #8804 O1: the version label and the inspector change together. Hold the
    // resolved read that follows the restore: until it lands the editor still
    // shows v2 with the v2 text, not v3 over the old face.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    let holds = 0;
    await page.route(/\/api\/cardgen\/cards\/13\/resolved$/, async (route: Route) => { holds += 1; await held; await route.fallback(); });
    await page.locator('[data-test="restore-1"]').click();
    await expect.poll(() => holds).toBe(1);
    await page.waitForTimeout(200);
    await expect(page.locator('[data-test="card-version"]')).toContainText('v2');
    await expect(page.locator('[data-test="prop-text"] textarea')).toHaveValue('ACT A, SECOND');
    release();
    await expect(page.locator('[data-test="card-version"]')).toContainText('v3');
    await expect(page.locator('[data-test="version-3"]')).toContainText('restored from v1');
    await expect(page.locator('[data-test="prop-text"] textarea')).toHaveValue('ACT A');
    expect(cardgenSeed.cardVersions[13].map((v) => v.version_no)).toEqual([1, 2, 3]);
  });

  test('Delete asks first, then the card leaves the review', async ({ page }) => {
    await openEditor(page, 11);
    await page.locator('[data-test="card-delete"]').click();
    await expect(page.locator('[data-test="card-delete-confirm"]')).toBeVisible();
    await page.locator('[data-test="card-delete-confirm"]').click();
    await expect(page.locator('[data-test="card-editor"]')).toHaveCount(0);
    await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(1);
    await expect(page.locator('[data-test="review-card-11"]')).toHaveCount(0);
  });

  test('a delete while a save\'s reload is in flight does not fetch the deleted card\'s faces (#8804 O6)', async ({ page }) => {
    // The walk saw GET /cards/110/resolved 404 right after the DELETE: a reload
    // whose getCard had returned before the delete fired its resolveCard after
    // it. Stage that by holding the getCard a save issues, deleting meanwhile.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    let holds = 0;
    const after: string[] = [];
    let deleted = false;
    page.on('response', (r) => { if (r.request().method() === 'DELETE') deleted = true; });
    page.on('request', (r) => { if (deleted && /\/api\/cardgen\/cards\/13\/resolved$/.test(r.url())) after.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await openEditor(page, 13);
    await page.locator('[data-test="card-element-title"]').click();
    await page.locator('[data-test="prop-text"] textarea').fill('ACT A, GOING');
    await page.route(/\/api\/cardgen\/cards\/13$/, async (route: Route) => {
      if (route.request().method() !== 'GET') { await route.fallback(); return; }
      // The card as the server knew it before the delete, delivered after it.
      const c = cardgenSeed.cards.find((x) => x.id === 13)!;
      const body = JSON.stringify({ card: { ...c, data: c.data || { values: {} } } });
      holds += 1;
      await held;
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    await page.locator('[data-test="card-save-version"]').click();
    await expect.poll(() => holds).toBe(1);
    await page.locator('[data-test="card-delete"]').click();
    await page.locator('[data-test="card-delete-confirm"]').click();
    await expect(page.locator('[data-test="card-editor"]')).toHaveCount(0);
    expect(deleted).toBe(true);
    release();
    await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(after).toEqual([]);
  });
});
