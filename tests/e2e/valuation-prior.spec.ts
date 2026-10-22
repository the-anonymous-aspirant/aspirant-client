import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';
import { findPriorValuations, propertyKeys } from '../../src/components/valuation/priorValuations.js';

/**
 * system_3 #8419: Jenny asked to be warned when she has valued the same
 * property before ("ifall de skickar ärendet på nytt och jag glömt bort, så jag
 * inte sätter något helt annat värde plötsligt"). Her own history is matched
 * against the property on the review step; the warning names the earlier
 * date and value and never blocks. Every beteckning, förening and org number
 * below is invented.
 */

const REVIEW_LEGEND = 'Granska och justera';
const HISTORY_TAB = 'Tidigare värderingar';

const HOUSE_EXTRACT = {
  documents: [
    {
      filename: 'fastighetsutdrag.pdf',
      fields: [
        { key: 'source_class', value: 'fastighetsutdrag', confidence: 'confident', source_page: 1 },
        { key: 'property_shape', value: 'fastighet', confidence: 'confident', source_page: 1 },
        { key: 'objekt', value: 'Testby Eklunda 1:76', confidence: 'confident', source_page: 1 },
        { key: 'objekt_short', value: 'Testby Eklunda 1:76', confidence: 'confident', source_page: 1 },
        { key: 'upplatelseform', value: 'Friköpt', confidence: 'confident', source_page: 1 },
        { key: 'document_date', value: '2026-09-15', confidence: 'confident', source_page: 1 },
      ],
      outcome: 'extracted',
    },
  ],
  operator_defaults: {},
};

function valuation(
  id: string,
  objekt: string,
  extra: Record<string, unknown> = {},
  createdAt = '2026-08-12T09:00:00Z',
) {
  return {
    id,
    name: `2026-08-12_${objekt}`,
    final_values: {
      objekt,
      objekt_short: objekt.replace(/\s*\([^)]*\)\s*$/, ''),
      marknadsvarde_kr: '3 050 000',
      intervall_kr: '50 000',
      datum: '2026-08-12',
      ...extra,
    },
    extracted_values: { objekt },
    created_at: createdAt,
  };
}

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Värdeutlåtande' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
}

const objektInput = (page: Page) =>
  page.locator('.field-row', { hasText: /^Objekt$/ }).locator('input');

const valueRow = (page: Page) =>
  page.locator('.field-row', { has: page.locator('label', { hasText: 'Marknadsvärde (kr)' }) });

test.describe('#8419 Värderad tidigare', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('a property valued before shows the earlier date and value, in the banner and at the value field', async ({
    page,
  }) => {
    await installCommanderMocks(page, { extractResponse: HOUSE_EXTRACT });
    seedProcessedRows([
      valuation('older', 'Testby Eklunda 1:76', { marknadsvarde_kr: '2 900 000', datum: '2026-03-02' }, '2026-03-02T09:00:00Z'),
      valuation('other-property', 'Testby Eklunda 1:77'),
      valuation('newer', 'TESTBY EKLUNDA 1 : 76'),
    ]);
    await walkToReview(page);

    const banner = page.getByTestId('prior-valuation-warning');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Värderad tidigare');
    // Named as on her form, not as the earlier row spelled it.
    await expect(banner).toContainText('Du har värderat Testby Eklunda 1:76 tidigare.');
    // Newest first; the neighbouring 1:77 is a different property.
    const items = banner.getByTestId('prior-valuation-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText('2026-08-12 · 3 050 000 kr ± 50 000 kr');
    await expect(items.nth(1)).toHaveText('2026-03-02 · 2 900 000 kr ± 50 000 kr');

    // The hint under Marknadsvärde: newest value, at the input's left edge, and
    // announced with the field.
    const input = valueRow(page).locator('input');
    const hint = valueRow(page).locator('.field__message--hint');
    await expect(hint).toHaveText('Senast: 3 050 000 kr ± 50 000 kr (2026-08-12)');
    await expect(input).toHaveAccessibleDescription('Senast: 3 050 000 kr ± 50 000 kr (2026-08-12)');
    // The input's visible box is AspInput's control (the confidence stripe is
    // its left edge); the bare <input> sits inside it.
    const box = valueRow(page).locator('.field__control');
    const [hintBox, controlBox] = [await hint.boundingBox(), await box.boundingBox()];
    expect(Math.abs(hintBox!.x - controlBox!.x)).toBeLessThanOrEqual(1);

    // It informs; generating is not held back.
    await expect(page.getByRole('button', { name: /Generera värdeutlåtande/ })).toBeEnabled();
  });

  test('a never-valued property shows nothing', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: HOUSE_EXTRACT });
    seedProcessedRows([valuation('other', 'Testby Eklunda 1:77'), valuation('lgh', 'LGH 1001 Brf Annan (769600-1111)')]);
    await walkToReview(page);

    await expect(page.getByTestId('prior-valuation-warning')).toHaveCount(0);
    await expect(valueRow(page).locator('.field__message--hint')).toHaveCount(0);
    await expect(valueRow(page).locator('input')).toHaveAccessibleDescription('');
  });

  test('a renamed valuation shows its name; an automatic name is not repeated', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: HOUSE_EXTRACT });
    seedProcessedRows([
      { ...valuation('renamed', 'Testby Eklunda 1:76'), name: 'Kunden återkom' },
      valuation('auto', 'Testby Eklunda 1:76', {}, '2026-01-10T09:00:00Z'),
    ]);
    await walkToReview(page);
    const items = page.getByTestId('prior-valuation-item');
    await expect(items.nth(0)).toHaveText('2026-08-12 · 3 050 000 kr ± 50 000 kr · Kunden återkom');
    await expect(items.nth(1)).toHaveText('2026-08-12 · 3 050 000 kr ± 50 000 kr');
  });

  test('the banner follows samintecknad and leads the extraction warnings', async ({ page }) => {
    const doc = HOUSE_EXTRACT.documents[0];
    await installCommanderMocks(page, {
      extractResponse: {
        ...HOUSE_EXTRACT,
        documents: [{
          ...doc,
          samintecknad: true,
          samintecknad_evidence: [{ section: 'inteckningar', row: '2', other_property: 'Testby EKLUNDA 1:11' }],
          diagnostics: { ocr_used: true, outcome: 'extracted' },
        }],
      },
    });
    seedProcessedRows([valuation('older', 'Testby Eklunda 1:76')]);
    await walkToReview(page);
    await page.getByRole('dialog', { name: 'OBS! samintecknad' }).getByRole('button', { name: 'Jag förstår' }).click();

    const order = await page.locator('.extract-warning').evaluateAll(els =>
      els.map(e => e.getAttribute('data-testid')),
    );
    expect(order).toEqual(['samintecknad-warning', 'prior-valuation-warning', 'extract-ocr-warning']);
  });

  test('a long apartment Objekt wraps inside the banner', async ({ page }) => {
    const long = 'LGH 1201 Bostadsrättsföreningen Testgårdens Kvarter Norra Upplagan (769600-0000)';
    await installCommanderMocks(page, {
      extractResponse: {
        ...HOUSE_EXTRACT,
        documents: [{
          ...HOUSE_EXTRACT.documents[0],
          fields: HOUSE_EXTRACT.documents[0].fields.map(f =>
            f.key === 'objekt' || f.key === 'objekt_short' ? { ...f, value: long } : f),
        }],
      },
    });
    seedProcessedRows([valuation('lgh', long, { marknadsvarde_kr: '12 500 000', intervall_kr: '250 000' })]);
    await walkToReview(page);
    const banner = page.getByTestId('prior-valuation-warning');
    await expect(banner).toBeVisible();
    const inner = await banner.evaluate(el => {
      const col = el.querySelector(':scope > div') as HTMLElement;
      return { banner: el.scrollWidth - el.clientWidth, column: col.scrollWidth - col.clientWidth };
    });
    expect(inner).toEqual({ banner: 0, column: 0 });
    // "12 500 000 kr ± 250 000 kr" is one estimate: one line box, never split.
    const lineBoxes = await banner.locator('.prior-amount').first().evaluate(el => el.getClientRects().length);
    expect(lineBoxes).toBe(1);
  });

  test('an apartment written differently (case, org number format, förening spelling) still matches', async ({
    page,
  }) => {
    // The default extraction is "LGH 1001 Brf Exempel (769600-0000)".
    await installCommanderMocks(page);
    seedProcessedRows([valuation('lgh', 'lgh 1001 Bostadsrättsföreningen Exempel (7696000000)')]);
    await walkToReview(page);

    await expect(page.getByTestId('prior-valuation-warning')).toBeVisible();
    await expect(page.getByTestId('prior-valuation-item')).toHaveCount(1);
  });

  test('the warning follows Objekt as it is corrected', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: HOUSE_EXTRACT });
    seedProcessedRows([valuation('older', 'Testby Eklunda 1:76')]);
    await walkToReview(page);
    const banner = page.getByTestId('prior-valuation-warning');
    await expect(banner).toBeVisible();

    await objektInput(page).fill('Testby Eklunda 1:99');
    await expect(banner).toHaveCount(0);
    await objektInput(page).fill('Testby Eklunda 1:76');
    await expect(banner).toBeVisible();
  });

  test('Edit does not warn about the row being edited, only about other valuations of it', async ({ page }) => {
    await installCommanderMocks(page);
    seedProcessedRows([valuation('only', 'Testby Eklunda 1:76')]);
    await page.goto('/member/personal/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: HISTORY_TAB }).click();

    await page.locator('[data-test-row-id="only"] .row-menu-trigger').click();
    await page.locator('[data-test-row-id="only"] .row-menu-popover >> text=Redigera').click();
    await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible();
    await expect(objektInput(page)).toHaveValue('Testby Eklunda 1:76');
    await expect(page.getByTestId('prior-valuation-warning')).toHaveCount(0);
  });

  test('a history read that fails leaves the review unwarned and working', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: HOUSE_EXTRACT });
    await page.route(/\/api\/commander\/valuation-statement\/processed(\?.*)?$/, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await walkToReview(page);
    await expect(page.getByTestId('prior-valuation-warning')).toHaveCount(0);
    await expect(objektInput(page)).toHaveValue('Testby Eklunda 1:76');
  });
});

test.describe('#8419 property keys', () => {
  const match = (a: string, b: string) =>
    findPriorValuations([{ id: 1, final_values: { objekt: b }, created_at: '' }], { objekt: a }).length === 1;

  test('houses: spacing, case and co-encumbered properties in parentheses do not matter', () => {
    expect(match('Testby Eklunda 1:76', 'TESTBY  EKLUNDA 1 : 76')).toBe(true);
    expect(match('Testby Eklunda 1:76', 'Testby Eklunda 1:76 (Testby Eklunda 1:11)')).toBe(true);
    expect(match('Testby Eklunda 1:76', 'Testby Eklunda 1:7')).toBe(false);
    expect(match('Testby Eklunda 1:76', 'Annanby Eklunda 1:76')).toBe(false);
  });

  test('apartments: org number + LGH number decide, whatever the förening is called', () => {
    expect(match('LGH 1001 Brf Exempel (769600-0000)', 'LGH 1001 Bostadsrättsföreningen Exempel (org 7696000000)')).toBe(true);
    expect(match('LGH 1001 Brf Exempel (769600-0000)', 'LGH 1002 Brf Exempel (769600-0000)')).toBe(false);
    expect(match('LGH 1001 Brf Exempel (769600-0000)', 'LGH 1001 Brf Annan (769600-1111)')).toBe(false);
  });

  test('Objekt decides; the short form stands in only when Objekt is blank', () => {
    const rows = [{ id: 1, final_values: { objekt: 'Testby Eklunda 1:76' }, created_at: '' }];
    expect(findPriorValuations(rows, { objekt: 'Testby Eklunda 1:99', objekt_short: 'Testby Eklunda 1:76' })).toHaveLength(0);
    expect(findPriorValuations(rows, { objekt: '', objekt_short: 'Testby Eklunda 1:76' })).toHaveLength(1);
  });

  test('a blank or near-blank identity matches nothing', () => {
    expect(propertyKeys('').size).toBe(0);
    expect(propertyKeys(null).size).toBe(0);
    expect(match('-', '-')).toBe(false);
  });
});
