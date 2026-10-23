import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';
import { safeStem, statementFilename } from '../../src/components/valuation/statementFilename.js';

/**
 * system_3 #8421: "att när filen sparas döps den till namnet för
 * fastigheten/lägenheten". The saved .docx/.pdf is named after the property's
 * objekt_short, in the create flow and in a re-download from Tidigare
 * värderingar, never the server's timestamped "vardeutlatande_<stamp>".
 * Every beteckning and förening below is invented.
 */

const REVIEW_LEGEND = 'Granska och justera';

async function walkToDone(page: Page, objektShort?: string): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
  if (objektShort !== undefined) {
    await page.locator('.field-row', { hasText: /^Objekt \(i löptext\)$/ }).locator('input').fill(objektShort);
  }
  await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
  await expect(page.getByRole('heading', { name: /Klart/ })).toBeVisible({ timeout: 15_000 });
}

const docxLink = (page: Page) => page.getByRole('link', { name: /Ladda ner \.docx/ });
const pdfLink = (page: Page) => page.getByRole('link', { name: /Ladda ner \.pdf/ });

test.describe('#8421 the saved statement is named after the property', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('an apartment: "LGH <nr> <förening>", not the server name', async ({ page }) => {
    // The default extraction's objekt_short is "LGH 1001 Brf Exempel".
    await walkToDone(page);
    await expect(docxLink(page)).toHaveAttribute('download', 'LGH 1001 Brf Exempel.docx');
    await expect(pdfLink(page)).toHaveAttribute('download', 'LGH 1001 Brf Exempel.pdf');
  });

  test('a house: the beteckning with its colon made file-safe, å/ä/ö kept', async ({ page }) => {
    await walkToDone(page, 'Täby Åkerby 1:76');
    await expect(docxLink(page)).toHaveAttribute('download', 'Täby Åkerby 1-76.docx');
  });

  test('no identifier at all: "Värdeutlåtande <datum>"', async ({ page }) => {
    await page.goto('/member/personal/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.getByTestId('manual-entry').click();
    await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible();
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    await expect(page.getByRole('heading', { name: /Klart/ })).toBeVisible({ timeout: 15_000 });
    await expect(docxLink(page)).toHaveAttribute('download', /^Värdeutlåtande \d{4}-\d{2}-\d{2}\.docx$/);
  });

  test('a re-download from Tidigare värderingar gets the same name', async ({ page }) => {
    seedProcessedRows([{
      id: 'house',
      name: '2026-08-12_Testby Eklunda 1:76',
      final_values: { objekt: 'Testby Eklunda 1:76', objekt_short: 'Testby Eklunda 1:76', datum: '2026-08-12' },
    }]);
    await page.goto('/member/personal/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: 'Tidigare värderingar' }).click();

    for (const [item, name] of [['.docx', 'Testby Eklunda 1-76.docx'], ['.pdf', 'Testby Eklunda 1-76.pdf']]) {
      await page.locator('[data-test-row-id="house"] .row-menu-trigger').click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-test-row-id="house"] .row-menu-popover').getByRole('menuitem', { name: item, exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(name);
    }
  });
});

test.describe('#8421 file-name rules', () => {
  test('forbidden characters, trailing dots and length', () => {
    expect(safeStem('A/B\\C*D?E"F<G>H|I')).toBe('A B C D E F G H I');
    expect(safeStem('Eklunda 1:76')).toBe('Eklunda 1-76');
    expect(safeStem('  Brf Ödegården.  ')).toBe('Brf Ödegården');
    expect(safeStem('Rad ett\nrad två\t')).toBe('Rad ett rad två');
    expect([...safeStem('x'.repeat(300))]).toHaveLength(120);
    expect(safeStem('.:/')).toBe('-');
    expect(safeStem('.hidden')).toBe('hidden');
    expect(safeStem(`${'x'.repeat(119)}. y`)).toBe('x'.repeat(119));
  });

  test('the identifier chain and its fallbacks', () => {
    expect(statementFilename({ objekt_short: 'LGH 1101 Brf Test', objekt: 'LGH 1101 Brf Test (769600-0000)' }, 'pdf'))
      .toBe('LGH 1101 Brf Test.pdf');
    expect(statementFilename({ objekt: 'LGH 1101 Brf Test (769600-0000)' }, 'docx')).toBe('LGH 1101 Brf Test.docx');
    expect(statementFilename({ adress: 'Exempelgatan 1' }, 'docx')).toBe('Exempelgatan 1.docx');
    expect(statementFilename({ datum: '2026-10-22' }, 'docx')).toBe('Värdeutlåtande 2026-10-22.docx');
    expect(statementFilename({ objekt_short: 'CON', datum: '2026-10-22' }, 'docx')).toBe('Värdeutlåtande CON.docx');
    // Decomposed a + ring (as macOS can produce) is saved composed.
    expect(statementFilename({ objekt_short: 'Ta\u030Aby 1:2' }, 'pdf')).toBe('T\u00E5by 1-2.pdf');
  });
});
