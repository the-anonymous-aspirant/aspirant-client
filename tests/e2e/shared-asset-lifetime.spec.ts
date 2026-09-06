import { test, expect } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5330 — leaving `/` used to revoke the sidebar logo's object URL.
 *
 * `AssetManager._cachedAssets` is a FLAT map keyed by content hash and shared by
 * every consumer, with no reference counting. `HomeView` released
 * `aspiring_hand` on unmount; that is also the sidebar's logo, and the sidebar
 * lives outside `<router-view>`, so it does not remount. Leaving `/` therefore
 * revoked a URL the sidebar's `<img>` was still pointed at.
 *
 * Two things make this test shaped the way it is, and both are the difference
 * between measuring the bug and measuring nothing:
 *
 *  - **It fetches the URL rather than reading `naturalWidth`.** The image keeps
 *    painting after revocation because the bitmap is already decoded —
 *    `naturalWidth` stays 864 either way. Only resolving the URL distinguishes a
 *    live blob from a dangling one.
 *  - **It navigates by clicking, never `page.goto()`.** A goto is a full page
 *    load: it never unmounts the component and it re-creates every object URL,
 *    so the assertion would pass against the broken build.
 *
 * The `<img>` is tagged before navigating and the tag checked afterwards, so a
 * pass cannot come from the sidebar having quietly remounted and re-fetched.
 */

/** 1x1 transparent PNG — enough for URL.createObjectURL and an <img> src.
 *  Same fixture shape tests/e2e/asset-fallback.spec.ts uses. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** Resolve the sidebar logo's own src from inside the page. A revoked blob
 *  URL rejects; a live one resolves. */
async function logoUrlState(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    // The logo specifically, not `.sidebar img` first — the rail also renders
    // per-link icons, and selecting positionally would silently measure the
    // wrong asset if their order ever changed.
    const img = document.querySelector('.aspiring-hand-logo') as HTMLImageElement | null;
    if (!img) return { found: false, alive: false, tagged: null as string | null };
    const src = img.currentSrc || img.src;
    let alive = false;
    try {
      const r = await fetch(src);
      alive = r.ok;
    } catch {
      alive = false;
    }
    return { found: true, alive, tagged: img.dataset.probeTag ?? null };
  });
}

test.describe('#5330 a mounted consumer keeps its asset when another view unmounts', () => {
  test('the sidebar logo URL still resolves after leaving /', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'needs the desktop sidebar rail to navigate in-app'
    );

    // 404, never 401: vite proxies /api to the real server, and a 401 would
    // trip main.js's axios interceptor into clearing user_role, after which the
    // router guard bounces the navigation and this measures the auth path.
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    // Assets must actually resolve — the whole assertion is about the object
    // URL built from these bytes. Registered AFTER the catch-all so it wins.
    await page.route(
      (url) => url.pathname.startsWith('/api/fetch-object/'),
      (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG })
    );
    await seedViewerSession(page);

    await page.goto('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.aspiring-hand-logo')).toBeVisible();

    // Positive control: the URL is alive BEFORE we navigate. Without this, a
    // dead URL afterwards could just mean the asset never loaded at all.
    await expect
      .poll(async () => (await logoUrlState(page)).alive, {
        message: 'the sidebar logo URL resolves while on /',
      })
      .toBe(true);

    await page.evaluate(() => {
      const img = document.querySelector('.aspiring-hand-logo') as HTMLImageElement | null;
      if (img) img.dataset.probeTag = 'original';
    });

    // In-app navigation — this is what unmounts HomeView.
    await page.locator('.sidebar [href="/applications"]').first().click();
    await expect(page).toHaveURL(/\/applications$/);

    const after = await logoUrlState(page);
    expect(after.found, 'the sidebar is still rendered').toBe(true);
    expect(after.tagged, 'the sidebar did not remount — same element').toBe('original');
    expect(after.alive, 'leaving / revoked the sidebar logo URL').toBe(true);
  });
});
