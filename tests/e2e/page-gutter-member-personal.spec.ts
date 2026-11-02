import { test } from '@playwright/test';
import { expectSignedInGutter } from './helpers/pageGutter';

/**
 * system_3 #9598 (#9501-A3, §3.121, §3.114): the member/personal leaf pages
 * take the one page gutter, as the admin leaves did in #9596. Each root
 * padded itself or added a top margin, and most centred their column (a 100vh
 * flex box, `margin: 0 auto`, or text-align on the whole page). At 1440 the
 * title sat at x 232-726, y 56-96, against the public 232/32, and short pages
 * scrolled 64 px past their content (the 2026-11-01 measurement on #9501).
 * Asserted against the public reference, read first in the same window, under
 * an admin session with `/api/` stubbed.
 */
const MEMBER_PERSONAL = [
  '/member/personal/ludde-analytics',
  '/member/personal/valuation-statement',
  '/member/personal/pappas-pushups',
  '/member/personal/pappas-sit-ups',
  '/member/personal/30-year-gift',
  '/member/personal/jobs',
  '/member/personal/invoicing',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9598 member personal pages take the one gutter (${theme})`, () => {
    test('every member/personal page: the public edge and title, nothing centred, no scroll past the content', async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      );
      await expectSignedInGutter(page, info, theme, MEMBER_PERSONAL);
    });
  });
}
