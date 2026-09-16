import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

const REVIEW_LEGEND = 'Granska och justera';

/**
 * A single uploaded document whose overall layout classified to none of the
 * three known sources (source_class = null) but whose objekt strategy chain
 * still resolved the identity fields. Before #5947, hydrateReview bucketed
 * documents only into datavardering / lagenhetsforteckning / fastighetsutdrag
 * and consulted only those buckets for the identity slots, so this document
 * was consulted for none of them and its objekt / objekt_short were silently
 * dropped from the review form. This fixture is the drop-then-survive path:
 * no classified document supplies these fields, so the only way they reach
 * the form is the unclassified fallback the fix adds.
 */
const UNCLASSIFIED_ONLY = {
  documents: [
    {
      filename: 'unclassified.pdf',
      fields: [
        { key: 'source_class', value: null, confidence: 'not_found', source_page: null },
        { key: 'property_shape', value: 'bostadsratt', confidence: 'confident', source_page: 1 },
        {
          key: 'objekt',
          value: 'LGH 1201 HSB Brf Klövern i Norsborg (7164164183)',
          confidence: 'confident',
          source_page: 1,
        },
        {
          key: 'objekt_short',
          value: 'LGH 1201 HSB Brf Klövern i Norsborg',
          confidence: 'confident',
          source_page: 1,
        },
        { key: 'adress', value: 'Linvägen 11', confidence: 'confident', source_page: 1 },
        { key: 'kommun', value: 'Botkyrka', confidence: 'confident', source_page: 1 },
      ],
    },
  ],
  operator_defaults: {},
};

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Värdeutlåtande' })).toBeVisible();
  // The file input is `display: none`; setInputFiles bypasses that.
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('#5947 identity fields survive the merge from an unclassified document', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page, { extractResponse: UNCLASSIFIED_ONLY });
  });

  test('objekt / objekt_short / adress from a source_class=null doc reach the review form', async ({
    page,
  }) => {
    await walkToReview(page);

    // Exact-label locators: 'Objekt' must not also match 'Objekt (i löptext)'.
    const objektInput = page
      .locator('.field-row', { has: page.getByText('Objekt', { exact: true }) })
      .locator('input');
    await expect(objektInput).toHaveValue('LGH 1201 HSB Brf Klövern i Norsborg (7164164183)');

    const objektShortInput = page
      .locator('.field-row', { has: page.getByText('Objekt (i löptext)', { exact: true }) })
      .locator('input');
    await expect(objektShortInput).toHaveValue('LGH 1201 HSB Brf Klövern i Norsborg');

    const adressInput = page
      .locator('.field-row', { has: page.getByText('Adress', { exact: true }) })
      .locator('input');
    await expect(adressInput).toHaveValue('Linvägen 11');
  });
});
