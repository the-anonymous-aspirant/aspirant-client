import { test } from '@playwright/test';
import { expectSignedInGutter } from './helpers/pageGutter';

/**
 * system_3 #9597 (#9501-A2, §3.121, §3.114): the member/shared leaf pages take
 * the one page gutter, as the admin leaves did in #9596. Each root padded
 * itself and centred its column (a 100vh flex box, `margin: 0 auto`, or both;
 * Files also centred its text). At 1440 the title sat at x 394-786, y 71,
 * against the public 232/32, and short pages scrolled 64 px past their content
 * (the 2026-11-01 measurement on #9501). Asserted against the public
 * reference, read first in the same window, under an admin session with
 * `/api/` stubbed.
 */
const MEMBER_SHARED = [
  '/member/shared/files',
  '/member/shared/message-board',
  '/member/shared/translator',
  '/member/shared/goals',
  '/member/shared/remarkable-pdfs',
  '/member/shared/scratchpad',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9597 member shared pages take the one gutter (${theme})`, () => {
    test('every member/shared page: the public edge and title, nothing centred, no scroll past the content', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      // Remarkable PDFs loads its generator from GitHub; answer it here so the
      // read never leaves the box.
      await page.route('https://raw.githubusercontent.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<p>planner</p>' })
      );
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      );
      await expectSignedInGutter(page, info, theme, MEMBER_SHARED);
    });
  });
}
