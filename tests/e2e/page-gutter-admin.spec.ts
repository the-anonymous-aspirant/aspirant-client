import { test } from '@playwright/test';
import { expectSignedInGutter } from './helpers/pageGutter';

/**
 * system_3 #9596 (#9501-A1, §3.121, §3.114): the admin leaf pages take the one
 * page gutter, as the hubs did in #9286. Each root used to pad itself, centre
 * its column in a 100vh flex box and, for most, cap it with `margin: 0 auto`.
 * At 1440 the title sat at x 718-786, y 71, against the public 232/32, and
 * every short page scrolled 64 px past its content (the 2026-11-01
 * measurement on #9501). Asserted against the public reference, read first
 * in the same window, under an admin session with `/api/` stubbed.
 */
const ADMIN = [
  '/admin/users',
  '/admin/assets',
  '/admin/system-health',
  '/admin/advisor',
  '/admin/browser-flows',
  '/admin/voice-commander',
  '/admin/tools/kvitto',
  '/admin/cardgen',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9596 admin leaf pages take the one gutter (${theme})`, () => {
    test('every admin page: the public edge and title y, nothing centred, no scroll past the content', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      );
      await expectSignedInGutter(page, info, theme, ADMIN);
    });
  });
}
