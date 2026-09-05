import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5162 (#5148-B1) — a registered asset whose bytes are not in the store must
 * render the default image, not an empty box.
 *
 * The failure this pins is not hypothetical. aspirant-client#270/#271 merged
 * twelve icon hashes whose bytes had not been uploaded to the object store;
 * `AssetManager._loadAsset` rejected for each, every consumer left its entry
 * unset, and `ApplicationCard`'s `v-else` rendered a blank div. Nine member
 * cards and two admin tiles showed empty boxes for ~41 hours (system_3 #4840)
 * — visibly worse than the generic placeholder they had replaced.
 *
 * The tests drive the real seam rather than the store: the catch-all 404s
 * every `/api/fetch-object/<md5>`, and the second test additionally serves a
 * real PNG for the `default` hash. Registration order matters — Playwright's
 * LAST matching route wins, so the catch-all is installed first.
 */

// The `default` entry of src/asset_manager.js's assetMap.
const DEFAULT_ASSET_HASH = 'babd3aeb9544a9d3e623757494942d70';

// 1x1 transparent PNG — enough for URL.createObjectURL and an <img> src.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** 404 every asset fetch — the "bytes are not in the store" condition. */
async function failEveryAssetFetch(page: Page): Promise<void> {
  await page.route(/\/api\/fetch-object\//, async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

/** Serve a real image for the fallback asset only. Registered AFTER the
 *  catch-all so it wins — the reverse order silently swallows it. */
async function serveOnlyTheDefaultAsset(page: Page): Promise<void> {
  await page.route(`**/api/fetch-object/${DEFAULT_ASSET_HASH}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
}

test.describe('#5162 missing asset renders the default image', () => {
  test('the empty box is what happens when the default is missing too', async ({ page }) => {
    // Negative control. Without it, the assertion in the next test could pass
    // for a reason other than the fallback — this pins that the placeholder IS
    // reachable, so seeing an <img> in the next test means something.
    await failEveryAssetFetch(page);
    await seedViewerSession(page);
    await page.goto('/quizzes');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.quiz-list .application-card');
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().locator('.app-image-placeholder')).toHaveCount(1);
    await expect(cards.first().locator('img.app-image')).toHaveCount(0);
  });

  test('a card whose icon is absent falls back to the default image', async ({ page }) => {
    await failEveryAssetFetch(page);
    await serveOnlyTheDefaultAsset(page);
    await seedViewerSession(page);
    await page.goto('/quizzes');
    await dismissMobileSidebarIfPresent(page);

    const cards = page.locator('.quiz-list .application-card');
    await expect(cards.first()).toBeVisible();
    // Every card's own icon 404s, so each <img> present here came through the
    // fallback rather than its registered hash.
    await expect(cards.first().locator('img.app-image')).toHaveCount(1);
    await expect(cards.first().locator('.app-image-placeholder')).toHaveCount(0);

    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('img.app-image')).toHaveCount(1);
    }
  });

  test('an unknown asset NAME still rejects rather than falling back', async () => {
    // A name absent from assetMap is a typo, not drift. Rendering a plausible
    // default for it would hide the bug the throw exists to surface.
    //
    // Asserted in NODE, importing the module directly, rather than in the
    // page: the suite runs against a production `vite preview` build, which
    // has no module graph to `import('/src/asset_manager.js')` from. This repo
    // has no unit-test lane (devDependencies: @playwright/test, vite, and the
    // vue plugin), so a spec file importing the source is where a pure-logic
    // assertion lives until one exists.
    const assetManager = (await import('../../src/asset_manager.js')).default;
    await expect(assetManager.getAsset('definitely-not-a-registered-asset')).rejects.toThrow(
      /not found in asset map/
    );
  });

  test('every registry icon key is a real assetMap entry', async () => {
    // The sibling of the test above, and the reason it is worth having: a
    // typo'd `icon` key reaches getAsset as an unknown NAME, whose throw each
    // consumer swallows in its own catch — so it degrades to exactly the empty
    // box this task removes, with no fallback and no console trace pointing at
    // the registry. Caught here at build time instead.
    const assetManager = (await import('../../src/asset_manager.js')).default;
    const known = new Set(assetManager.getAvailableAssetNames());
    const { SHARED_APPS, PERSONAL_APPS } = await import('../../src/views/member/apps.js');
    const registryIcons = [...SHARED_APPS, ...PERSONAL_APPS].map((app) => app.icon);
    expect(registryIcons.length).toBeGreaterThan(0);
    expect(registryIcons.filter((icon) => !known.has(icon))).toEqual([]);
  });
});
