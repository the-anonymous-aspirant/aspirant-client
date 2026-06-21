import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
  OPERATOR_DEFAULTS,
  GOLDEN_DOCX,
} from './helpers/mockBackend';

const REVIEW_LEGEND = 'Granska och justera';

/** Drive the upload step and wait for the review step to render. */
async function walkToReview(page: Page): Promise<void> {
  await page.goto('/trusted/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Värdeutlåtande' })).toBeVisible();
  // The file input is `display: none`; setInputFiles bypasses that.
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(REVIEW_LEGEND) })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Värdeutlåtande BR-flow regression', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('#884 dropzone signals multi-file upload', async ({ page }) => {
    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.dropzone-headline')).toContainText(/flera/i);
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('multiple', '');
    await expect(fileInput).toHaveAttribute('accept', /pdf/);
  });

  test('#879 operator defaults pre-fill the review form', async ({ page }) => {
    await walkToReview(page);
    // Each field's <input v-model> mirrors reviewedFields.{key}; the
    // hydrateReview pass copies operator_defaults into the matching slots.
    const ortInput = page.locator('.field-row', { hasText: /^Ort/ }).locator('input');
    await expect(ortInput).toHaveValue(OPERATOR_DEFAULTS.ort);

    const namnInput = page.locator('.field-row', { hasText: 'Mäklarens namn' }).locator('input');
    await expect(namnInput).toHaveValue(OPERATOR_DEFAULTS.maklare_namn);

    const titelInput = page.locator('.field-row', { hasText: 'Titel/funktion' }).locator('input');
    await expect(titelInput).toHaveValue(OPERATOR_DEFAULTS.maklare_titel);

    const foretagInput = page.locator('.field-row', { hasText: 'Företagets namn' }).locator('input');
    await expect(foretagInput).toHaveValue(OPERATOR_DEFAULTS.foretag);
  });

  test('#877 confidence buckets paint each row and tint the input', async ({ page }) => {
    await walkToReview(page);
    // The extract fixture seeds at least one row per bucket; assert each
    // class is present and its input carries the bucket-specific tint that
    // ValuationStatement.vue's scoped style applies.
    const confidentRow = page.locator('.field-row.confident').first();
    await expect(confidentRow).toBeVisible();
    const confidentBg = await confidentRow
      .locator('input, select, textarea')
      .first()
      .evaluate(el => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(confidentBg).toBe('rgba(72, 187, 120, 0.12)');

    const uncertainRow = page.locator('.field-row.uncertain').first();
    await expect(uncertainRow).toBeVisible();
    const uncertainBg = await uncertainRow
      .locator('input, select, textarea')
      .first()
      .evaluate(el => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(uncertainBg).toBe('rgba(237, 137, 54, 0.12)');

    const manualRow = page.locator('.field-row.manual').first();
    await expect(manualRow).toBeVisible();
    const manualBg = await manualRow
      .locator('input, select, textarea')
      .first()
      .evaluate(el => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(manualBg).toBe('rgba(66, 153, 225, 0.12)');

    const notFoundRow = page.locator('.field-row.not-found').first();
    await expect(notFoundRow).toBeVisible();
    const notFoundBg = await notFoundRow
      .locator('input, select, textarea')
      .first()
      .evaluate(el => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(notFoundBg).toBe('rgba(245, 101, 101, 0.12)');
  });

  test('#938 comparable-sales render as range charts plus card strip', async ({ page }) => {
    await walkToReview(page);
    const block = page.locator('.comparables-block');
    await expect(block).toBeVisible();

    // #909: the decision-support block stays on a white island so the
    // dark-on-dark readability issue does not return.
    const blockBg = await block.evaluate(el => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(blockBg).toBe('rgb(255, 255, 255)');

    // Tier 1 — one range chart per numeric metric with comparable data
    // in the fixture (pris, kr/m², avgift/mån, årsavgift, säljdatum, m²).
    // The mock fixture omits subject `boarea`, so the subject dot only
    // shows on metrics whose subject value comes from the form
    // (marknadsvarde_kr → Pris, datum → Säljdatum).
    const ranges = page.locator('.range-chart');
    await expect(ranges).not.toHaveCount(0);
    await expect(page.locator('.range-chart[data-metric="pris_kr"]')).toBeVisible();
    await expect(page.locator('.range-chart[data-metric="pris_per_m2"]')).toBeVisible();
    await expect(page.locator('.range-chart[data-metric="salj_datum"]')).toBeVisible();

    // The subject dot renders only when subject + range are both known.
    // Pris carries the marknadsvarde dot; Avgift/mån has no form-side
    // subject so its chart stays dot-less.
    await expect(
      page.locator('.range-chart[data-metric="pris_kr"] .range-chart__dot'),
    ).toBeVisible();
    await expect(
      page.locator('.range-chart[data-metric="avgift_kr_manad"] .range-chart__dot'),
    ).toHaveCount(0);

    // Tier 2 — horizontal-scroll card strip. Cards render most-recent
    // first; the fixture's 2026-04-12 row sits ahead of 2026-03-30.
    const cards = page.locator('.comparable-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator('.comparable-card__brf')).toHaveText('Brf Solviken');
    await expect(cards.nth(1).locator('.comparable-card__brf')).toHaveText('Brf Bryggan');

    // The strip is a horizontal-overflow container so swipe/scroll works
    // on touch.
    const scrollContainer = page.locator('.comparable-cards-scroll');
    const overflowX = await scrollContainer.evaluate(el => getComputedStyle(el as HTMLElement).overflowX);
    expect(overflowX).toBe('auto');
  });

  test('#880 source-date inputs use the native date picker', async ({ page }) => {
    await walkToReview(page);
    const dateInputs = [
      'Datavärdering',
      'Fastighetsutdrag',
      'Lägenhetsförteckning',
      'Datum',
    ];
    for (const label of dateInputs) {
      const input = page.locator('.field-row', { hasText: new RegExp(`^${label}`) }).locator('input');
      await expect(input).toHaveAttribute('type', 'date');
    }
  });

  test('#881 PDF export ships the download with application/pdf', async ({ page }) => {
    await walkToReview(page);

    const generateRequest = page.waitForRequest(
      req => req.url().includes('/valuation-statement/generate') && req.url().includes('format=pdf'),
    );
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    const req = await generateRequest;
    const response = await req.response();
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toBe('application/pdf');

    // The "Klart!" step labels the download by extension; .pdf proves the
    // success path was taken (the 503-fallback would label as .docx).
    const downloadLink = page.locator('a.btn-primary', { hasText: /Ladda ner/ });
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toContainText('.pdf');
    await expect(downloadLink).toHaveAttribute('download', /\.pdf$/);
  });

  test('#881 fallback path: 503 on PDF transparently serves docx', async ({ page }) => {
    await installCommanderMocks(page, { pdfReturns503: true });
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    const downloadLink = page.locator('a.btn-primary', { hasText: /Ladda ner/ });
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });
    await expect(downloadLink).toContainText('.docx');
  });

  test('#959 every wizard step renders through the canonical ValuationStep wrapper, centered', async ({ page }) => {
    // Slow both transient endpoints so the extracting + generating steps
    // stay on screen long enough to inspect their layout.
    await installCommanderMocks(page, { extractDelayMs: 1500, generateDelayMs: 1500 });
    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);

    // Step 1: Upload — wrapper rendered.
    await assertSingleCanonicalStep(page);

    await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
    await page.getByRole('button', { name: /Extrahera värden/ }).click();

    // Step 2: Extracting.
    await expect(page.locator('.spinner').first()).toBeVisible();
    await assertSingleCanonicalStep(page);

    // Step 3: Review.
    await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible({
      timeout: 5_000,
    });
    await assertSingleCanonicalStep(page);

    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();

    // Step 4: Generating.
    await expect(page.locator('.full-spinner')).toBeVisible();
    await assertSingleCanonicalStep(page);

    // Step 5: Done — and the action row sits on the card's center axis,
    // the regression guard for #959 / #936. Pre-refactor, .done-actions
    // was a full-width block-flex row whose buttons fell to the left;
    // post-refactor it's a flex-item inside the narrow wrapper and
    // centers naturally.
    await expect(page.getByRole('heading', { name: /Klart/ })).toBeVisible({ timeout: 5_000 });
    await assertSingleCanonicalStep(page);

    const card = await page.locator('.valuation-step').boundingBox();
    const actions = await page.locator('.done-actions').boundingBox();
    expect(card).toBeTruthy();
    expect(actions).toBeTruthy();
    const cardCenter = card!.x + card!.width / 2;
    const actionsCenter = actions!.x + actions!.width / 2;
    expect(Math.abs(cardCenter - actionsCenter)).toBeLessThan(4);
  });

  test('#937 extracting-step spinners render with size and animate', async ({ page }) => {
    // Reinstall mocks with a delay so the extracting step stays on screen
    // long enough to capture the spinner's computed transform across frames.
    await installCommanderMocks(page, { extractDelayMs: 2500 });

    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
    await page.getByRole('button', { name: /Extrahera värden/ }).click();

    const spinner = page.locator('.spinner').first();
    await expect(spinner).toBeVisible();

    // Regression: the span used to be `display: inline` so width/height
    // collapsed to 0 and the rotation had nothing visible to spin.
    const box = await spinner.boundingBox();
    expect(box?.width).toBeGreaterThan(10);
    expect(box?.height).toBeGreaterThan(10);

    // Regression: the keyframe used only `to { rotate(360deg) }`, leaving
    // the implicit `from` as `transform: none` — matrix-identical to the
    // `to` state, so some engines collapsed the animation to a no-op.
    // Sample transform twice with a frame in between; the matrix MUST move.
    const t1 = await spinner.evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(400);
    const t2 = await spinner.evaluate(el => getComputedStyle(el).transform);
    expect(t1).not.toBe('none');
    expect(t2).not.toBe('none');
    expect(t1).not.toBe(t2);
  });

  test('#936 done-step action buttons sit in a flex row with a visible gap', async ({ page }) => {
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    const downloadLink = page.locator('a.btn-primary', { hasText: /Ladda ner/ });
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });

    const actions = page.locator('.done-actions');
    await expect(actions).toBeVisible();
    const display = await actions.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('flex');

    // The two action elements sit side-by-side in the row. Their bounding
    // boxes should be horizontally separated by at least var(--space-lg)
    // (24px on the design tokens) — the regression guarded here is the
    // pre-fix layout where the buttons sat directly adjacent with only
    // the inline whitespace between them.
    const primary = await downloadLink.boundingBox();
    const secondary = await page
      .locator('.done-actions button.btn-secondary')
      .boundingBox();
    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();
    const horizontalGap = secondary!.x - (primary!.x + primary!.width);
    const verticalGap = secondary!.y - (primary!.y + primary!.height);
    // Either same row with a real horizontal gap, or stacked with a real
    // vertical gap — both honor the spacing the operator asked for.
    expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(16);
  });

  test('#937 generating-step full spinner animates', async ({ page }) => {
    await installCommanderMocks(page, { generateDelayMs: 2500 });
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();

    const spinner = page.locator('.full-spinner');
    await expect(spinner).toBeVisible();
    const t1 = await spinner.evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(400);
    const t2 = await spinner.evaluate(el => getComputedStyle(el).transform);
    expect(t1).not.toBe(t2);
  });

  test('#886 generated docx contract: golden fixture has no run-level yellow highlight', async ({ page }) => {
    // The mocked /generate?format=pdf 503-falls-back to /generate (docx);
    // the docx body is the bundled golden fixture. The test downloads it,
    // unzips word/document.xml and asserts the post-#886 OOXML rule:
    //   ZERO  <w:r><w:rPr><w:highlight w:val="yellow"/>...</w:r>
    //   ANY   <w:pPr><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:pPr>
    //         (operator-invisible after LibreOffice PDF render, per #886)
    await installCommanderMocks(page, { pdfReturns503: true });
    await walkToReview(page);

    const downloadRequest = page.waitForRequest(
      req =>
        req.url().includes('/valuation-statement/generate') &&
        !req.url().includes('format=pdf'),
    );
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    const req = await downloadRequest;
    const response = await req.response();
    const served = await response!.body();

    expect(served.equals(GOLDEN_DOCX)).toBe(true);
    const { documentXml } = await unzipDocx(served);
    const runYellow = (documentXml.match(/<w:r\b[^>]*>\s*<w:rPr>(?:(?!<\/w:r>).)*?<w:highlight\s+w:val="yellow"/gs) || []).length;
    expect(runYellow).toBe(0);
  });
});

/** Assert exactly one <section.valuation-step> is on screen — the
 *  invariant that the canonical wrapper component owns every step. If
 *  a future step bypasses <ValuationStep> for its own <div class="card">,
 *  this either matches zero (no .valuation-step at all) or matches the
 *  wrong count (wrapper + raw card). Either way it red-lines the test. */
async function assertSingleCanonicalStep(page: Page): Promise<void> {
  const step = page.locator('.valuation-step');
  await expect(step).toHaveCount(1);
  await expect(step).toBeVisible();
}

/** Tiny ZIP central-directory parser. Avoids pulling in a JS zip dep just
 *  for one XML extraction; a docx is a single-shot read of one entry. */
async function unzipDocx(buf: Buffer): Promise<{ documentXml: string }> {
  // End-of-central-directory record begins with PK\x05\x06.
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = buf.lastIndexOf(eocdSig);
  if (eocdOffset < 0) throw new Error('not a zip');
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);

  let p = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central dir');
    const compressionMethod = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const fileNameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + fileNameLen).toString('utf8');
    if (name === 'word/document.xml') {
      const lhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhFileNameLen + lhExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compressedSize);
      const zlib = await import('node:zlib');
      const inflated =
        compressionMethod === 0
          ? compressed
          : zlib.inflateRawSync(compressed);
      return { documentXml: inflated.toString('utf8') };
    }
    p += 46 + fileNameLen + extraLen + commentLen;
  }
  throw new Error('word/document.xml not found in docx');
}
