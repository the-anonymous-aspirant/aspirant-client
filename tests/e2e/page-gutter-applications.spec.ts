import { test } from '@playwright/test';
import { expectSignedInGutter } from './helpers/pageGutter';

/**
 * system_3 #9599 (#9501-A4, §3.121, §3.114): the applications, games, quiz and
 * profile leaf pages take the one page gutter, as the admin leaves did in
 * #9596. Each root padded or centred itself (a 100vh flex box, `margin: 0
 * auto`, centred text across the page), two left their title's top margin
 * standing, and two put the title inside a painted card or panel. At 1440 the
 * title sat at x 232-753, y 47-89, against the public 232/32 (the 2026-11-01
 * measurement on #9501). Asserted against the public reference, read first in
 * the same window, under an admin session with `/api/` stubbed.
 */
const APPLICATIONS = [
  '/applications/qr-generator',
  '/applications/transparencymapper',
  '/applications/emotional-excellence',
  '/applications/constellations',
  '/games/wordweaver',
  '/quizzes/sql',
  '/profile',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9599 applications, games, quiz and profile pages take the one gutter (${theme})`, () => {
    test('every page: the public edge and title, nothing centred, no scroll past the content', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      );
      await expectSignedInGutter(page, info, theme, APPLICATIONS);
    });
  });
}
