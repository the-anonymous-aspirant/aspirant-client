import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  type InstallOpts,
} from './helpers/mockBackend';

/**
 * system_3 #9439: the admin's save returned 422 from /generate and the page
 * said "Servern svarade inte" — the server HAD answered, with the deliberate
 * #5943 refusal ("set your appraiser identity before generating"), but the
 * view read `data.error.message` while valuation_statement's endpoints answer
 * with FastAPI's `{"detail": ...}`, so every real message fell through to the
 * generic fallback. The user then read a validation message as an outage.
 */

const REVIEW_LEGEND = 'Granska och justera';
const DETAIL =
  'Appraiser name (mäklarnamn) is required to sign the värdeutlåtande. ' +
  'Set your appraiser identity before generating.';

async function generateWith(page: Page, opts: InstallOpts): Promise<void> {
  await seedTrustedSession(page);
  await installCommanderMocks(page, opts);
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.getByTestId('manual-entry').click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible();
  await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
}

const generateError = (page: Page) =>
  page.locator('.error-text', { hasText: /Misslyckades att generera/ });

test.describe('#9439 a rejected save shows the server\'s reason', () => {
  test('a FastAPI {"detail"} 422 renders its detail, not "Servern svarade inte"', async ({ page }) => {
    await generateWith(page, { generateStatus: 422, generateErrorBody: { detail: DETAIL } });

    const err = generateError(page);
    await expect(err).toBeVisible();
    await expect(err).toContainText(DETAIL);
    await expect(err).not.toContainText('Servern svarade inte');
    // Back on the review step, where the field to fix is.
    await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible();
  });

  test('the {error:{message}} envelope other commander routes use still renders', async ({ page }) => {
    await generateWith(page, {
      generateStatus: 400,
      generateErrorBody: { error: { code: 'bad_request', message: 'Fältet datum saknas.' } },
    });
    await expect(generateError(page)).toContainText('Fältet datum saknas.');
  });

  test('a pydantic validation list is joined into one readable line', async ({ page }) => {
    await generateWith(page, {
      generateStatus: 422,
      generateErrorBody: {
        detail: [
          { loc: ['body', 'marknadsvarde_kr'], msg: 'field required', type: 'value_error.missing' },
          { loc: ['body', 'datum'], msg: 'invalid date', type: 'value_error.date' },
        ],
      },
    });
    await expect(generateError(page)).toContainText('field required; invalid date');
  });

  test('a body with no message at all still falls back to the page prose', async ({ page }) => {
    await generateWith(page, { generateStatus: 500, generateErrorBody: {} });
    await expect(generateError(page)).toContainText('Servern svarade inte');
  });
});
