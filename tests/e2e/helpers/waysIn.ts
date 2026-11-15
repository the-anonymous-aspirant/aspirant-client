import { expect, type Page } from '@playwright/test';

/**
 * Below 640px the four ways in (Enter payment by hand, Enter expense by hand,
 * Import PayPal file, Import N26 files) fold behind one "Add or import"
 * disclosure (system_3 #11019-A2; Design ack c69874 item 1). Opens it when it
 * is a closed disclosure. At 640px and up the wrapper is a plain div, and an
 * open fold stays open, so on those this does nothing.
 */
export async function openWaysIn(page: Page): Promise<void> {
  const fold = page.locator('[data-test="ways-in-fold"]');
  await fold.waitFor();
  const closedDetails = await fold.evaluate((el) => el.tagName === 'DETAILS' && !(el as HTMLDetailsElement).open);
  if (!closedDetails) return;
  await fold.locator('[data-test="ways-in-summary"]').click();
  await expect(fold).toHaveAttribute('open', '');
}
