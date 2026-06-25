import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
  processedSeed,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

const HISTORY_TAB = 'Tidigare värderingar';
const CREATE_TAB = 'Skapa';

async function openHistory(page: Page): Promise<void> {
  await page.goto('/trusted/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: HISTORY_TAB }).click();
  await expect(page.getByRole('tab', { name: HISTORY_TAB })).toHaveAttribute('aria-selected', 'true');
}

test.describe('Tidigare värderingar tab — list + edit + delete', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('list renders seeded rows with metadata', async ({ page }) => {
    seedProcessedRows([
      {
        id: 'row-a',
        name: '2026-06-20_LGH 1001',
        final_values: {
          fastighetsbeteckning: 'Hägersten 1:1',
          objekt_short: 'LGH 1001 Brf Exempel',
          adress: 'Exempelgatan 1',
          marknadsvarde_kr: '3 050 000',
        },
        extracted_values: { marknadsvarde_kr: '3 050 000' },
        was_manually_edited: false,
      },
      {
        id: 'row-b',
        name: '2026-06-21_LGH 2002',
        final_values: {
          objekt_short: 'LGH 2002 Brf Två',
          adress: 'Annan väg 7',
          marknadsvarde_kr: '4 200 000',
        },
        extracted_values: { marknadsvarde_kr: '4 000 000' },
        was_manually_edited: true,
      },
    ]);

    await openHistory(page);

    const table = page.locator('[data-test="history-table"]');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(2);

    const editedRow = page.locator('[data-test-row-id="row-b"]');
    await expect(editedRow).toContainText('LGH 2002 Brf Två');
    await expect(editedRow).toContainText('4 200 000');

    const autoRow = page.locator('[data-test-row-id="row-a"]');
    await expect(autoRow).toContainText('LGH 1001 Brf Exempel');
  });

  test('empty state renders friendly message', async ({ page }) => {
    await openHistory(page);
    await expect(page.getByText(/Inga sparade värderingar/)).toBeVisible();
  });

  test('rename via inline input PATCHes the row', async ({ page }) => {
    seedProcessedRows([{ id: 'row-rename', name: 'old-name' }]);
    await openHistory(page);

    const input = page.locator('[data-test-row-id="row-rename"] .history-name-input');
    await input.fill('new-name');
    // change event fires on blur; tab away
    await input.blur();

    // The mock PATCH mutates the seed directly, so re-reading reflects the rename.
    await expect.poll(() => processedSeed.rows[0].name, { timeout: 3_000 }).toBe('new-name');
  });

  test('Edit returns to Skapa tab on the Review step with final_values loaded', async ({ page }) => {
    seedProcessedRows([{
      id: 'row-edit',
      name: '2026-06-22_LGH 3003',
      final_values: {
        objekt: 'LGH 3003 Brf Tre (123)',
        objekt_short: 'LGH 3003 Brf Tre',
        adress: 'Tredje gatan 3',
        kommun: 'Stockholm',
        upplatelseform: 'Bostadsrätt',
        marknadsvarde_kr: '5 500 000',
        intervall_kr: '100 000',
        datum: '2026-06-22',
        ort: 'Stockholm',
        maklare_namn: 'Test Mäklare',
        maklare_titel: 'Fastighetsmäklare',
        foretag: 'Test AB',
        likviditet: 'normal',
      },
      extracted_values: {},
    }]);

    await openHistory(page);
    await page.locator('[data-test-row-id="row-edit"] .row-menu-trigger').click();
    await page.locator('[data-test-row-id="row-edit"] .row-menu-popover >> text=Redigera').click();

    // Tab switches back to Skapa
    await expect(page.getByRole('tab', { name: CREATE_TAB })).toHaveAttribute('aria-selected', 'true');
    // Review step is visible
    await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible();
    // final_values flowed into the form
    const objektInput = page.locator('.field-row', { hasText: /^Objekt$/ }).locator('input');
    await expect(objektInput).toHaveValue('LGH 3003 Brf Tre (123)');
    const adressInput = page.locator('.field-row', { hasText: /^Adress$/ }).locator('input').first();
    await expect(adressInput).toHaveValue('Tredje gatan 3');
  });

  test('Delete with confirm removes the row', async ({ page }) => {
    seedProcessedRows([
      { id: 'row-del-1', name: 'keep' },
      { id: 'row-del-2', name: 'drop' },
    ]);

    await openHistory(page);
    await expect(page.locator('[data-test="history-table"] tbody tr')).toHaveCount(2);

    // Accept the window.confirm
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-test-row-id="row-del-2"] .row-menu-trigger').click();
    await page.locator('[data-test-row-id="row-del-2"] .row-menu-popover >> text=Radera').click();

    await expect(page.locator('[data-test-row-id="row-del-2"]')).toHaveCount(0);
    await expect(page.locator('[data-test="history-table"] tbody tr')).toHaveCount(1);
    expect(processedSeed.rows.map(r => r.id)).toEqual(['row-del-1']);
  });

  test('Delete is no-op when the operator cancels the confirm', async ({ page }) => {
    seedProcessedRows([{ id: 'row-cancel', name: 'survives' }]);
    await openHistory(page);

    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('[data-test-row-id="row-cancel"] .row-menu-trigger').click();
    await page.locator('[data-test-row-id="row-cancel"] .row-menu-popover >> text=Radera').click();

    await expect(page.locator('[data-test-row-id="row-cancel"]')).toBeVisible();
    expect(processedSeed.rows).toHaveLength(1);
  });

  test('CSV export triggers a download', async ({ page }) => {
    seedProcessedRows([{ id: 'row-csv', name: 'export-me' }]);
    await openHistory(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportera alla till CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/processed_valuations.*\.csv$/);
  });

  test('Generera persists a new row to the history store', async ({ page }) => {
    // Walk the existing wizard end-to-end then assert the seed got a row.
    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
    await page.getByRole('button', { name: /Extrahera värden/ }).click();
    await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    await expect(page.getByRole('heading', { name: /Klart/ })).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => processedSeed.rows.length, { timeout: 5_000 }).toBe(1);
    const row = processedSeed.rows[0];
    expect(row.input_files).toEqual(['lgh_utdrag.pdf', 'datavardering.pdf']);
    expect(row.final_values.objekt).toMatch(/LGH 1001/);
  });
});
