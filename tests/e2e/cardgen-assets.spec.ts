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
  type CardgenAssetSeed,
} from './helpers/mockBackend';

/** system_3 #8634 / #8648 — the card editor's Assets section: upload with
 *  progress, the grid, the viewer by kind, usage, and delete. The server is
 *  mocked in-process (helpers/mockBackend.ts installCardgenMocks); every byte
 *  the viewer renders comes from the mocked content route as a blob. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

function asset(id: number, kind: CardgenAssetSeed['kind'], name: string): CardgenAssetSeed {
  const type = { image: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf', font: 'font/ttf' }[kind];
  return {
    id,
    sha256: `sha-${id}`.padEnd(64, '0'),
    original_filename: name,
    media_type: type,
    kind,
    byte_size: 1234 * id,
    pixel_width: kind === 'image' ? 600 : 0,
    pixel_height: kind === 'image' ? 300 : 0,
    uploaded_by_user_id: 1,
    content_url: `/api/cardgen/assets/${id}/content`,
    created_at: '2026-10-24T17:00:00Z',
  };
}

// Asset 1 carries the uploader's display name (#8758); the others come as an
// older server would send them, id only.
const ASSETS = [{ ...asset(1, 'image', 'moon.png'), uploaded_by_name: 'Anna' }, asset(2, 'svg', 'mark.svg'), asset(3, 'pdf', 'cards.pdf'), asset(4, 'font', 'display.ttf')];

async function openAssets(page: Page): Promise<void> {
  await page.goto('/admin/cardgen/assets');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="assets-panel"]')).toBeVisible();
}

test.describe('/admin/cardgen/assets — uploader and viewer', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes([]);
    seedCardgenTemplates([]);
    seedCardgenExportProfiles([]);
    seedCardgenAssets(ASSETS.map((a) => ({ ...a })));
    seedCardgenUsage({});
    seedCardgenRefusals(['bad.txt']);
    await installCardgenMocks(page);
  });

  test('lists the stored assets with thumbnails or kind badges and filters by kind', async ({ page }) => {
    await openAssets(page);
    await expect(page.locator('[data-test="asset-grid"] > li')).toHaveCount(4);
    await expect(page.locator('[data-test="asset-count"]')).toHaveText('4 assets');
    const thumb = page.locator('[data-test="asset-card-1"] img');
    await expect(thumb).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('[data-test="asset-card-4"]')).toContainText('Font');
    await page.getByRole('radio', { name: 'Fonts' }).click();
    await expect(page.locator('[data-test="asset-grid"] > li')).toHaveCount(1);
    await expect(page.locator('[data-test="asset-card-4"]')).toBeVisible();
  });

  test('uploads picked files one by one with progress, reports a refusal and a duplicate', async ({ page }) => {
    await openAssets(page);
    await page.locator('[data-test="asset-file-input"]').setInputFiles([
      { name: 'orion.png', mimeType: 'image/png', buffer: Buffer.alloc(400, 1) },
      { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') },
      { name: 'moon.png', mimeType: 'image/png', buffer: Buffer.alloc(100, 2) },
    ]);
    const rows = page.locator('[data-test="upload-rows"] li');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('[data-test="upload-row-stored"]')).toHaveCount(2);
    await expect(page.locator('[data-test="upload-row-failed"]')).toContainText('Unsupported file type: bad.txt');
    await expect(rows.filter({ hasText: 'moon.png' })).toContainText('Already stored');
    await expect(rows.filter({ hasText: 'orion.png' })).toContainText('Stored');
    await expect(page.locator('[data-test="asset-grid"] > li')).toHaveCount(5);
    await expect(page.locator('[data-test="asset-count"]')).toHaveText('5 assets');
  });

  test('the viewer names the uploader, or falls back to the id for a row without a name (#8758)', async ({ page }) => {
    await openAssets(page);
    await page.locator('[data-test="asset-card-2"]').click();
    await expect(page.locator('[data-test="asset-viewer"]')).toBeVisible();
    await expect(page.locator('[data-test="viewer-uploaded"]').locator('..')).toContainText('by user 1');
  });

  test('the viewer shows an image at fit and real size with its print size', async ({ page }) => {
    await openAssets(page);
    await page.locator('[data-test="asset-card-1"]').click();
    const viewer = page.locator('[data-test="asset-viewer"]');
    await expect(viewer).toBeVisible();
    const img = page.locator('[data-test="viewer-image"]');
    await expect(img).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('[data-test="viewer-pixels"]')).toContainText('600×300 px, 50.8×25.4 mm at 300 DPI');
    await expect(page.locator('[data-test="viewer-meta"]')).toContainText('image (image/png)');
    await expect(page.locator('[data-test="viewer-uploaded"]').locator('..')).toContainText('by Anna');
    await expect(page.locator('[data-test="usage-none"]')).toBeVisible();
    await page.getByRole('radio', { name: 'Real size' }).click();
    await expect(img).toHaveClass(/real/);
  });

  test('the viewer frames a PDF, samples a font, and shows SVG only as an image', async ({ page }) => {
    await openAssets(page);
    await page.locator('[data-test="asset-card-3"]').click();
    await expect(page.locator('[data-test="viewer-pdf"]')).toHaveAttribute('src', /^blob:/);
    await page.locator('[data-test="viewer-close"]').click();
    await expect(page.locator('[data-test="asset-viewer"]')).toHaveCount(0);

    await page.locator('[data-test="asset-card-4"]').click();
    const sample = page.locator('[data-test="viewer-font-sample"]');
    await expect(sample).toBeVisible();
    await expect.poll(() => sample.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('cardgen-font-4');
    await page.locator('[data-test="viewer-close"]').click();

    await page.locator('[data-test="asset-card-2"]').click();
    await expect(page.locator('[data-test="viewer-image"]')).toHaveAttribute('src', /^blob:/);
    // No affordance opens the raw SVG in a document context.
    await expect(page.locator('[data-test="asset-viewer"] a[href^="blob:"], [data-test="asset-viewer"] a[target="_blank"]')).toHaveCount(0);
    await expect(page.locator('[data-test="asset-viewer"] iframe, [data-test="asset-viewer"] object, [data-test="asset-viewer"] embed')).toHaveCount(0);
  });

  test('a referenced asset lists its users and cannot be deleted; an unreferenced one can', async ({ page }) => {
    seedCardgenUsage({
      1: {
        templates: [{ id: 5, slug: 'constellation', name: 'Constellation front', version_no: 3, elements: ['art'] }],
        cards: [{ id: 9, slug: 'rel_v', name: 'V', version_no: 2, elements: ['title'] }],
      },
    });
    await openAssets(page);
    await page.locator('[data-test="asset-card-1"]').click();
    await expect(page.locator('[data-test="usage-template"]')).toContainText('Constellation front (v3): art');
    await expect(page.locator('[data-test="usage-card"]')).toContainText('V (v2): title');
    await expect(page.locator('[data-test="viewer-delete"]')).toBeDisabled();
    await page.locator('[data-test="viewer-close"]').click();

    await page.locator('[data-test="asset-card-2"]').click();
    await expect(page.locator('[data-test="usage-none"]')).toBeVisible();
    await expect(page.locator('[data-test="viewer-delete"]')).toBeEnabled();
    await page.locator('[data-test="viewer-delete"]').click();
    await page.locator('[data-test="viewer-delete-confirm"]').click();
    await expect(page.locator('[data-test="asset-viewer"]')).toHaveCount(0);
    await expect(page.locator('[data-test="asset-grid"] > li')).toHaveCount(3);
    await expect(page.locator('[data-test="asset-card-2"]')).toHaveCount(0);
  });

  test('a PDF whose stored bytes are not a PDF gets no frame (#8709)', async ({ page }) => {
    // The list says pdf, the content route serves image/png: the viewer must
    // not hand those bytes to the <iframe> as a blob: document.
    seedCardgenAssets([...ASSETS.map((a) => ({ ...a })), { ...asset(5, 'pdf', 'odd.pdf'), media_type: 'image/png' }]);
    await openAssets(page);
    await page.locator('[data-test="asset-card-5"]').click();
    await expect(page.locator('[data-test="viewer-blob-error"]')).toContainText('not application/pdf');
    await expect(page.locator('[data-test="viewer-pdf"]')).toHaveCount(0);
    await expect(page.locator('[data-test="asset-viewer"] iframe')).toHaveCount(0);
  });
});

// A real 1240x853 PNG (flat, written by PyMuPDF), the size of a 300 DPI card
// background: at "Fit" it fills the preview the way the store's art does.
const PNG_1240x853 = Buffer.from('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', 'base64');

test.describe('/admin/cardgen/assets — the viewer keeps "Used by" in view at 1440x900 (#8804 O4)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installNoiseCatchAll(page);
    seedCardgenTypes([]);
    seedCardgenTemplates([]);
    seedCardgenExportProfiles([]);
    seedCardgenAssets([{ ...asset(1, 'image', 'constellation-bg.png'), pixel_width: 1240, pixel_height: 853, uploaded_by_name: 'Anna' }]);
    seedCardgenUsage({ 1: { templates: [{ id: 5, slug: 'constellation_front', name: 'Constellation front', version_no: 3, elements: ['art'] }], cards: [{ id: 110, slug: 'ktp', name: 'KITCHEN TABLE POLYAMORY', version_no: 2, elements: ['art'] }] } });
    seedCardgenRefusals([]);
    await installCardgenMocks(page);
    await page.route(/\/api\/cardgen\/assets\/1\/content$/, async (route: Route) => {
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }, body: PNG_1240x853 });
    });
  });

  test('the usage heading and its first entry are within the unscrolled modal body beside the preview', async ({ page }) => {
    await openAssets(page);
    await page.locator('[data-test="asset-card-1"]').click();
    await expect(page.locator('[data-test="asset-viewer"]')).toBeVisible();
    const img = page.locator('[data-test="viewer-image"]');
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1240);
    const usageCard = page.locator('[data-test="usage-card"]');
    await expect(usageCard).toHaveCount(1);
    // The fixture did fill the preview: the image is drawn large, not as a thumbnail.
    const imgBox = await img.boundingBox();
    expect(imgBox!.height).toBeGreaterThan(200);
    const body = page.locator('.modal__body');
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
    const bodyBox = await body.boundingBox();
    const heading = page.locator('[data-test="viewer-usage"] h3');
    await expect(heading).toBeInViewport();
    await expect(usageCard).toBeInViewport();
    for (const el of [heading, usageCard]) {
      const box = await el.boundingBox();
      expect(box!.bottom ?? box!.y + box!.height).toBeLessThanOrEqual(bodyBox!.y + bodyBox!.height + 0.5);
      expect(box!.y).toBeGreaterThanOrEqual(bodyBox!.y - 0.5);
    }
    // Beside the preview, not under it.
    expect(bodyBox!.width).toBeGreaterThan(0);
    const metaBox = await page.locator('[data-test="viewer-meta"]').boundingBox();
    expect(metaBox!.x).toBeGreaterThan(imgBox!.x + imgBox!.width - 1);
  });
});
