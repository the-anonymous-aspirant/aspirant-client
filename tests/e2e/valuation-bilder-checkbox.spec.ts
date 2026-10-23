import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';
import {
  BILDER_FRAN_KUND,
  withBilderFranKund,
  withoutBilderFranKund,
} from '../../src/components/valuation/bilderNote.js';

/**
 * system_3 #8420: Jenny asked for "en ruta jag kan klicka i eller liknande så att
 * den lägger till 'bilder från kund har tagits i beaktning' vid de fall det
 * finns". The tick writes the sentence into the free-text note (bilder_note),
 * ahead of anything she typed; unticking removes only that sentence.
 */

const SENTENCE = 'Bilder från kund har tagits i beaktning.';
const REVIEW_LEGEND = 'Granska och justera';

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
}

const note = (page: Page) =>
  page.locator('.field-row', { has: page.locator('label', { hasText: 'Anteckning om bilder/skick' }) }).locator('textarea');
const box = (page: Page) => page.getByRole('checkbox', { name: 'Bilder från kund har tagits i beaktning' });

/** The JSON body of the next POST /generate (the docx request). */
async function generatedNote(page: Page): Promise<unknown> {
  const req = page.waitForRequest(
    r => r.method() === 'POST' && /\/valuation-statement\/generate$/.test(r.url()),
  );
  await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
  return (await req).postDataJSON().bilder_note;
}

test.describe('#8420 Bilder från kund', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('ticking puts the sentence ahead of the typed note, which stays as typed, and it reaches the statement', async ({
    page,
  }) => {
    await walkToReview(page);
    await note(page).fill('Badrummet behöver renoveras.');
    await expect(box(page)).not.toBeChecked();

    await box(page).check();
    await expect(note(page)).toHaveValue(`${SENTENCE} Badrummet behöver renoveras.`);
    expect(await generatedNote(page)).toBe(`${SENTENCE} Badrummet behöver renoveras.`);
  });

  test('unticking takes out only the sentence', async ({ page }) => {
    await walkToReview(page);
    await box(page).check();
    await expect(note(page)).toHaveValue(SENTENCE);
    // Typed after the tick: must survive the untick.
    await note(page).fill(`${SENTENCE} Nyrenoverat kök.`);
    await expect(box(page)).toBeChecked();

    await box(page).uncheck();
    await expect(note(page)).toHaveValue('Nyrenoverat kök.');
    expect(await generatedNote(page)).toBe('Nyrenoverat kök.');
  });

  test('unticked, the statement is unchanged (negative control)', async ({ page }) => {
    await walkToReview(page);
    await note(page).fill('Gott skick.');
    expect(await generatedNote(page)).toBe('Gott skick.');
  });

  test('a saved valuation with the sentence reopens ticked', async ({ page }) => {
    seedProcessedRows([{
      id: 'with-photos',
      name: '2026-10-01_Testby Eklunda 1:76',
      final_values: { objekt: 'Testby Eklunda 1:76', bilder_note: `${SENTENCE} Gott skick.` },
    }]);
    await page.goto('/member/personal/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('tab', { name: 'Tidigare värderingar' }).click();
    await page.locator('[data-test-row-id="with-photos"] .row-menu-trigger').click();
    await page.locator('[data-test-row-id="with-photos"] .row-menu-popover >> text=Redigera').click();

    await expect(box(page)).toBeChecked();
    await expect(note(page)).toHaveValue(`${SENTENCE} Gott skick.`);
  });

  test('the box starts at the note field’s left edge', async ({ page }) => {
    await walkToReview(page);
    const [boxRect, noteRect] = [
      await page.getByTestId('bilder-fran-kund').boundingBox(),
      await note(page).boundingBox(),
    ];
    expect(Math.abs(boxRect!.x - noteRect!.x)).toBeLessThanOrEqual(1);
  });

  test('the box reads as a sentence, not a row caption (the phone caption rule is uppercase)', async ({ page }) => {
    await walkToReview(page);
    const style = await page.getByTestId('bilder-fran-kund').evaluate(el => {
      const cs = getComputedStyle(el);
      return { transform: cs.textTransform, letterSpacing: cs.letterSpacing };
    });
    expect(style.transform).toBe('none');
    expect(style.letterSpacing).toBe('normal');
  });

  test('desktop: the caption lines up with the note’s first line', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 768, 'one-column row: the caption sits above the field');
    await walkToReview(page);
    const delta = await page.locator('.field-row', { has: page.locator('label', { hasText: 'Anteckning om bilder/skick' }) })
      .evaluate(row => {
        const lab = row.querySelector(':scope > label') as HTMLElement;
        const ta = row.querySelector('textarea') as HTMLElement;
        const lcs = getComputedStyle(lab), tcs = getComputedStyle(ta);
        const lr = lab.getBoundingClientRect(), tr = ta.getBoundingClientRect();
        const labCentre = lr.top + parseFloat(lcs.paddingTop) + parseFloat(lcs.lineHeight) / 2;
        const taCentre = tr.top + parseFloat(tcs.borderTopWidth) + parseFloat(tcs.paddingTop) + parseFloat(tcs.lineHeight) / 2;
        return Math.abs(taCentre - labCentre);
      });
    expect(delta).toBeLessThanOrEqual(2);
  });
});

test.describe('#8420 note helpers', () => {
  test('add: sentence first, typed text kept byte for byte, never twice', () => {
    expect(withBilderFranKund('')).toBe(BILDER_FRAN_KUND);
    expect(withBilderFranKund('   ')).toBe(BILDER_FRAN_KUND);
    expect(withBilderFranKund('Gott skick.')).toBe(`${BILDER_FRAN_KUND} Gott skick.`);
    expect(withBilderFranKund(`${BILDER_FRAN_KUND} X`)).toBe(`${BILDER_FRAN_KUND} X`);
  });

  test('remove: only the sentence and the one space joining it', () => {
    expect(withoutBilderFranKund(BILDER_FRAN_KUND)).toBe('');
    expect(withoutBilderFranKund(`${BILDER_FRAN_KUND} Gott skick.`)).toBe('Gott skick.');
    expect(withoutBilderFranKund(`Gott skick. ${BILDER_FRAN_KUND}`)).toBe('Gott skick.');
    expect(withoutBilderFranKund('Gott  skick.\nRad två.')).toBe('Gott  skick.\nRad två.');
  });
});
