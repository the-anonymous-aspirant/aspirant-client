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

    // The "Klart!" step ships both formats side-by-side; the .pdf link
    // proves the LibreOffice path was taken (the 503-fallback drops it
    // and leaves the .docx-only flow).
    const pdfLink = page.getByRole('link', { name: 'Ladda ner .pdf' });
    await expect(pdfLink).toBeVisible();
    await expect(pdfLink).toHaveAttribute('download', /\.pdf$/);
  });

  test('#881 fallback path: 503 on PDF still ships the docx download', async ({ page }) => {
    await installCommanderMocks(page, { pdfReturns503: true });
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    const docxLink = page.getByRole('link', { name: 'Ladda ner .docx' });
    await expect(docxLink).toBeVisible({ timeout: 10_000 });
    // The PDF button hides when LibreOffice isn't available so the
    // operator isn't offered a broken link.
    await expect(page.getByRole('link', { name: 'Ladda ner .pdf' })).toHaveCount(0);
  });

  test('#1026 done step offers both .pdf and .docx downloads side-by-side', async ({ page }) => {
    // Operator follow-up: docx + pdf must both be reachable from the same
    // UI. Pre-fix the Done step exposed a single download whose extension
    // followed whichever format the doGenerate flow had cached.
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();

    const pdfLink = page.getByRole('link', { name: 'Ladda ner .pdf' });
    const docxLink = page.getByRole('link', { name: 'Ladda ner .docx' });
    await expect(pdfLink).toBeVisible({ timeout: 10_000 });
    await expect(docxLink).toBeVisible();

    // Both links carry the right MIME extension on their `download`
    // attribute so the browser saves under the .pdf / .docx name.
    await expect(pdfLink).toHaveAttribute('download', /\.pdf$/);
    await expect(docxLink).toHaveAttribute('download', /\.docx$/);

    // The .docx blob is reachable as a non-empty body.
    const docxHref = await docxLink.getAttribute('href');
    expect(docxHref).toMatch(/^blob:/);
    const docxBytes = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      return blob.size;
    }, docxHref);
    expect(docxBytes).toBeGreaterThan(0);
  });

  test('#992 every bordered review-step box keeps its content within bounds at desktop and mobile', async ({ page }) => {
    // Operator (2026-06-22) reported that the "small boxes with
    // värderingsinformation" still escape their bounding boxes on
    // desktop, distinct from the #949 comparable-card fix. The root-cause
    // ask (per the task body) is to govern overflow at the box level
    // rather than chasing per-instance regressions: every bordered or
    // bounded box in the review step must keep every descendant text
    // node inside its visible rectangle, at BOTH desktop and mobile
    // widths. Boxes covered:
    //   - .field-block (Värderingsobjekt / Källdokument / Värdebedömning
    //                    / Utfärdare — the property-metadata fieldsets)
    //   - .range-chart  (per-metric comparable-range visualisation)
    //   - .comparables-block (the white-island decision-support panel)
    //   - .comparable-card  (already pinned by #949 at mobile; this
    //                        guard re-checks it at both viewports so a
    //                        future card edit can't reopen #949 at desktop)
    const viewports = [
      { label: 'desktop', width: 1280, height: 900 },
      { label: 'mobile', width: 375, height: 800 },
    ];
    // .comparables-block is intentionally excluded — it wraps the
    // .comparable-cards-scroll horizontal-overflow strip whose cards
    // sit past the visible block at narrow viewports by design (#938
    // tier-2 swipe affordance). The cards themselves carry the bounds
    // contract, and the strip is its own scroll container.
    const boxSelectors = [
      '.field-block',
      '.range-chart',
      '.comparable-card',
    ];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await walkToReview(page);
      for (const selector of boxSelectors) {
        const boxes = page.locator(selector);
        const count = await boxes.count();
        expect(count, `${viewport.label}: expected ${selector} to render`).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const overflow = await boxes.nth(i).evaluate(el => {
            const boxRect = (el as HTMLElement).getBoundingClientRect();
            // Cover every text-bearing leaf inside the box. Inputs and
            // textareas overflow horizontally via their own scroll, so we
            // also assert that their bounding boxes sit inside the parent
            // — the rendered scrollbar gutter still counts as "escaped".
            const nodes = (el as HTMLElement).querySelectorAll(
              'span, dt, dd, p, legend, label, input, select, textarea, h4, h5',
            );
            return Array.from(nodes).flatMap(n => {
              const nr = (n as HTMLElement).getBoundingClientRect();
              // 1px tolerance for subpixel rounding.
              const right = nr.right - boxRect.right;
              const left = boxRect.left - nr.left;
              if (right > 1 || left > 1) {
                return [{ tag: (n as HTMLElement).tagName, text: (n.textContent || '').trim().slice(0, 40), right, left }];
              }
              return [];
            });
          });
          expect(
            overflow,
            `${viewport.label} ${selector}#${i} has descendants overflowing the box: ${JSON.stringify(overflow)}`,
          ).toEqual([]);
        }
      }
      // Reset to a fresh navigation between viewports so the next pass
      // starts from a clean Vue tree rather than re-using the same DOM.
      await page.goto('about:blank');
    }
  });

  test('#949 comparable-card text stays inside the card bounds at mobile width', async ({ page }) => {
    // Run the desktop chromium suite at iPhone-sized viewport so the
    // ≤768px @media block (where .comparable-card narrows to 180px) is
    // active. Local mobile-safari isn't runnable without webkit system
    // deps, so checking at chromium-with-resized-viewport keeps the
    // overflow regression caught locally — CI's mobile-safari project
    // re-validates the same surface.
    await page.setViewportSize({ width: 375, height: 800 });
    await walkToReview(page);
    const cards = page.locator('.comparable-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const overflow = await cards.nth(i).evaluate(el => {
        const cardRect = (el as HTMLElement).getBoundingClientRect();
        const texts = (el as HTMLElement).querySelectorAll('span, dt, dd, p');
        return Array.from(texts).flatMap(t => {
          const tr = (t as HTMLElement).getBoundingClientRect();
          // 1px tolerance for subpixel rounding.
          const right = tr.right - cardRect.right;
          const left = cardRect.left - tr.left;
          if (right > 1 || left > 1) {
            return [{ text: (t.textContent || '').trim(), right, left }];
          }
          return [];
        });
      });
      expect(overflow, `card #${i} has overflowing text: ${JSON.stringify(overflow)}`).toEqual([]);
    }
  });

  test('#948 range-chart legend names all three visual elements (subject, range, median)', async ({ page }) => {
    await walkToReview(page);
    // The comparables block only renders when the extract fixture
    // supplies comparable_sales; assert it's on screen, then assert the
    // legend caption mentions each of the three visual elements by name.
    // Pre-fix the median tick was unlabelled and read to the operator
    // as 'part of the blue bar'.
    const legend = page.locator('.comparables-block p.muted.small').first();
    await expect(legend).toBeVisible();
    const text = (await legend.textContent()) || '';
    expect(text).toMatch(/svart punkt/);
    expect(text).toMatch(/bl[åa] stapel/);
    expect(text).toMatch(/mitten-tick|medianv[äa]rde/);
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
    await expect(page.locator('.progress-bar').first()).toBeVisible();
    await assertSingleCanonicalStep(page);

    // Step 3: Review.
    await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible({
      timeout: 5_000,
    });
    await assertSingleCanonicalStep(page);

    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();

    // Step 4: Generating.
    await expect(page.locator('.progress-bar--lg')).toBeVisible();
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

  test('#991 extracting-step progress bar renders with size and animates', async ({ page }) => {
    // Reinstall mocks with a delay so the extracting step stays on screen
    // long enough to capture the fill band's computed `left` across frames.
    await installCommanderMocks(page, { extractDelayMs: 2500 });

    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
    await page.getByRole('button', { name: /Extrahera värden/ }).click();

    const bar = page.locator('.progress-bar').first();
    await expect(bar).toBeVisible();

    // Track-level regression: bar must occupy a real width and a non-zero
    // height. The previous spinner (#937) collapsed to ~0×0 from an inline
    // span; the bar variant must not regress to a zero-area element.
    const box = await bar.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(2);

    // Status text is visible and reads as one of the cycling extracting
    // phases — paired with the bar, this is what gives the operator
    // timing intuition rather than just "something is happening".
    await expect(page.locator('.progress-status').first()).toBeVisible();
    await expect(page.locator('.progress-status').first()).toHaveText(
      /(Läser PDF-filer|Klassificerar dokument|Extraherar värden|Bearbetar fält)…/
    );

    // Motion regression: the fill band's computed `left` MUST change
    // between frames. Two samples spaced ~400ms apart cover one full
    // 1.4s slide cycle either at the slow start/end or the fast middle.
    const fill = page.locator('.progress-bar__fill').first();
    const l1 = await fill.evaluate(el => getComputedStyle(el).left);
    await page.waitForTimeout(400);
    const l2 = await fill.evaluate(el => getComputedStyle(el).left);
    expect(l1).not.toBe(l2);
  });

  test('#936 done-step action buttons sit in a flex row with a visible gap', async ({ page }) => {
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();
    // After #1026 the Done step ships both formats side-by-side; the .pdf
    // link is the leftmost primary button when LibreOffice is available
    // (which the default mock provides). The spacing guard measures the
    // gap between the FIRST primary action and the secondary 'Skapa ett
    // nytt' button — same pre-#936 contract.
    const downloadLink = page.locator('a.btn-primary', { hasText: /Ladda ner/ }).first();
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });

    const actions = page.locator('.done-actions');
    await expect(actions).toBeVisible();
    const display = await actions.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('flex');

    // Find the secondary 'Skapa ett nytt' button and assert at least
    // var(--space-lg) (24px) of separation from the LAST primary action.
    // Pre-fix the buttons sat directly adjacent with only inline whitespace
    // between them.
    const primaryLinks = page.locator('a.btn-primary', { hasText: /Ladda ner/ });
    const lastPrimary = await primaryLinks.nth((await primaryLinks.count()) - 1).boundingBox();
    const secondary = await page
      .locator('.done-actions button.btn-secondary')
      .boundingBox();
    expect(lastPrimary).toBeTruthy();
    expect(secondary).toBeTruthy();
    const horizontalGap = secondary!.x - (lastPrimary!.x + lastPrimary!.width);
    const verticalGap = secondary!.y - (lastPrimary!.y + lastPrimary!.height);
    expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(16);
  });

  test('#991 generating-step progress bar animates and shows cycling status', async ({ page }) => {
    await installCommanderMocks(page, { generateDelayMs: 2500 });
    await walkToReview(page);
    await page.getByRole('button', { name: /Generera värdeutlåtande/ }).click();

    const bar = page.locator('.progress-bar--lg');
    await expect(bar).toBeVisible();

    // Status text is visible and reads as one of the cycling generating
    // phases. Bar + label together replace the single 48px circle the
    // operator could not see animate on desktop (#937).
    await expect(page.locator('.progress-status')).toBeVisible();
    await expect(page.locator('.progress-status')).toHaveText(
      /(Förbereder mall|Bygger underlag|Genererar diagram|Skapar PDF)…/
    );

    const fill = bar.locator('.progress-bar__fill');
    const l1 = await fill.evaluate(el => getComputedStyle(el).left);
    await page.waitForTimeout(400);
    const l2 = await fill.evaluate(el => getComputedStyle(el).left);
    expect(l1).not.toBe(l2);
  });

  test('#1026 marknadsvärde input renders thousands-spaced as the operator types', async ({ page }) => {
    // Operator complaint: '500000' and '5000000' look near-identical at a
    // glance during fast entry. The fix wires the marknadsvärde + intervall
    // inputs to a live thousands-grouping handler so the format updates on
    // every keystroke and the two amounts stay visually distinct mid-entry.
    await walkToReview(page);

    const marknadsvarde = page
      .locator('.field-row', { hasText: /^Marknadsvärde/ })
      .locator('input');
    await marknadsvarde.click();
    // Clear whatever the extract fixture seeded before exercising the
    // live-formatting path — sequenceKeyPresses below mimics fast typing.
    await marknadsvarde.fill('');
    await marknadsvarde.pressSequentially('5000000');
    await expect(marknadsvarde).toHaveValue('5 000 000');

    // Swap to the smaller amount and confirm grouping rebuilds (idempotent
    // on already-spaced input — the regression we'd catch is the formatter
    // double-spacing existing spaces into '50  000').
    await marknadsvarde.fill('');
    await marknadsvarde.pressSequentially('500000');
    await expect(marknadsvarde).toHaveValue('500 000');

    // Intervall behaves the same.
    const intervall = page
      .locator('.field-row', { hasText: /^Intervall/ })
      .locator('input');
    await intervall.click();
    await intervall.fill('');
    await intervall.pressSequentially('50000');
    await expect(intervall).toHaveValue('50 000');
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

  test('#1172 Om verktyget tab renders the field-first registry from the build-time snapshot', async ({ page }) => {
    // #1106 invariant carried forward: registry ships with the build (no
    // runtime fetch). Count any leak to /about so a regression that re-adds
    // the call red-lines the test rather than silently working off mocked
    // content.
    const aboutCalls: string[] = [];
    await page.route(/\/api\/commander\/valuation-statement\/about/, (route) => {
      aboutCalls.push(route.request().url());
      void route.fulfill({ status: 599, body: 'unexpected /about call' });
    });

    await page.goto('/trusted/valuation-statement');
    await dismissMobileSidebarIfPresent(page);

    // 'Om verktyget' is a top-level tab alongside 'Skapa' and 'Tidigare
    // värderingar' (#1172). Not visible until clicked; clicking switches
    // away from the wizard.
    const omVerktygetTab = page.locator('button[role="tab"]', { hasText: /^Om verktyget$/ });
    await expect(omVerktygetTab).toBeVisible();

    const aboutTab = page.locator('.about-tab');
    await expect(aboutTab).toBeHidden();

    await omVerktygetTab.click();
    await expect(aboutTab).toBeVisible();
    await expect(omVerktygetTab).toHaveAttribute('aria-selected', 'true');

    // 'Senast uppdaterad' metadata renders an ISO date; schema version
    // present as a secondary token.
    await expect(aboutTab.locator('.about-meta')).toContainText('Senast uppdaterad:');
    await expect(aboutTab.locator('.about-meta')).toContainText(/\d{4}-\d{2}-\d{2}/);

    // One row per docx-template slot, each row labelled with the human
    // field name (not the snake_case key) and the priority-ordered
    // strategy chain in compact Swedish prose.
    const adressField = aboutTab.locator('.about-field', { hasText: 'Adress' }).first();
    await expect(adressField).toBeVisible();
    const adressChain = adressField.locator('.about-chain-step');
    await expect(adressChain.nth(0)).toContainText("Fastighetsbyrån prosa: 'Adress:'-raden");
    await expect(adressChain.nth(1)).toContainText("UC-tabell: cellen under rubriken 'Adress'");

    // Engineering identifiers (snake_case strategy names, regex strings)
    // do not bleed into the rendered prose — the audience is a human
    // appraiser, not an engineer.
    await expect(aboutTab).not.toContainText('prose_adress_bullet');
    await expect(aboutTab).not.toContainText('uc_label_adress_below');

    // The whole point of #1106 / #1172: no network call for /about.
    expect(aboutCalls).toEqual([]);
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
