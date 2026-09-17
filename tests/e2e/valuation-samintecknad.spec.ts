import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

const REVIEW_LEGEND = 'Granska och justera';

/**
 * system_3 #6006: when a fastighetsutdrag shows the property is samintecknad (a
 * mortgage row reads `Belastar även`, or the current owners' purchase `avser även
 * annan fastighet`), the commander states it as `samintecknad: true` with the
 * evidence (aspirant-commander #6007). The operator asked for a friendly Swedish
 * "OBS! samintecknad" modal, and the warning must stay on the review after the
 * modal is closed. Names and beteckningar below are invented.
 */
function fastighetsutdrag(samintecknad: Record<string, unknown>) {
  return {
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
        ...samintecknad,
      },
    ],
    operator_defaults: {},
  };
}

const SAMINTECKNAD = fastighetsutdrag({
  samintecknad: true,
  samintecknad_evidence: [
    { section: 'agare', row: '2022-04-28', other_property: null },
    { section: 'inteckningar', row: '2', other_property: 'Testby EKLUNDA 1:11' },
    { section: 'inteckningar', row: '3', other_property: 'Testby EKLUNDA 1:11' },
  ],
});

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

test.describe('#6006 OBS! samintecknad', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('a samintecknad fastighetsutdrag opens the modal, and the warning stays after closing it', async ({
    page,
  }) => {
    await installCommanderMocks(page, { extractResponse: SAMINTECKNAD });
    await walkToReview(page);

    const dialog = page.getByRole('dialog', { name: 'OBS! samintecknad' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Fastigheten verkar vara samintecknad');
    await expect(dialog).toContainText('Kontrollera pantbreven innan du går vidare.');
    await expect(dialog).toContainText('Inteckning nr 2 och 3 belastar även Testby EKLUNDA 1:11.');
    await expect(dialog).toContainText('Köpet från 2022-04-28 avser även en annan fastighet.');

    await dialog.getByRole('button', { name: 'Jag förstår' }).click();
    await expect(dialog).toBeHidden();

    const banner = page.getByTestId('samintecknad-warning');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('OBS! samintecknad');
    await expect(banner).toContainText('fastighetsutdrag.pdf');
    await expect(banner).toContainText('Inteckning nr 2 och 3 belastar även Testby EKLUNDA 1:11.');
  });

  test('negative control: samintecknad=false shows neither modal nor warning', async ({ page }) => {
    await installCommanderMocks(page, {
      extractResponse: fastighetsutdrag({ samintecknad: false, samintecknad_evidence: [] }),
    });
    await walkToReview(page);

    await expect(page.getByRole('dialog', { name: 'OBS! samintecknad' })).toHaveCount(0);
    await expect(page.getByTestId('samintecknad-warning')).toHaveCount(0);
  });

  test('an older commander without the field shows neither modal nor warning', async ({ page }) => {
    await installCommanderMocks(page, { extractResponse: fastighetsutdrag({}) });
    await walkToReview(page);

    await expect(page.getByRole('dialog', { name: 'OBS! samintecknad' })).toHaveCount(0);
    await expect(page.getByTestId('samintecknad-warning')).toHaveCount(0);
  });
});
