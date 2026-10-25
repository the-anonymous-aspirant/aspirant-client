import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  seedAdminSession,
  dismissMobileSidebarIfPresent,
  installCardgenMocks,
  seedCardgenAssets,
  seedCardgenUsage,
  seedCardgenRefusals,
  seedCardgenTypes,
  seedCardgenTemplates,
  seedCardgenTemplateVersions,
  seedCardgenExportProfiles,
  seedCardgenCards,
  seedCardgenCardVersions,
  seedCardgenResolved,
} from './helpers/mockBackend';

/** system_3 #8754 (D2 R1, R2): the review page is the print-scale preview.
 *  R1: the DOM renderer and the PDF export fall back to the same Roboto, so a
 *  body text breaks into the same number of lines on screen and on paper.
 *  R2: `*word*` is one bold, underlined run in both renderers; `\*` is a
 *  literal asterisk. The PDF is read from its own content streams (inflated
 *  with node:zlib): one `Tm` per text fragment, so distinct y values are lines. */

async function installNoiseCatchAll(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

// The seed body element (cardgen_template.go seedBaseSpec): 89 mm wide,
// 8.5 pt, centred, uppercase. The title is hidden so the body is the only text.
const BODY = { kind: 'text', x_mm: 8, y_mm: 22, w_mm: 89, h_mm: 34, size_pt: 8.5, line_height: 1.35, align: 'center', valign: 'top', transform: 'uppercase', color: '#111111', z: 10, text: '' };
const BASE_SPEC = { size: { w_mm: 105, h_mm: 74.25, radius_mm: 5 }, elements: { title: { kind: 'text', x_mm: 6, y_mm: 6, w_mm: 93, h_mm: 12, size_pt: 16, text: '', hidden: true }, body: BODY } };

// Goal-card style victory conditions of differing lengths (the D2 walk used
// the 16 goal cards; these span one to four lines at the seed width).
const TEXTS = [
  'Win when two of your connections are each other’s connection.',
  'You win when every player at the table holds at least one connection to you and none of them is a rival.',
  'These players must share a secret: when the game ends with the secret kept, every player in the triad wins together, and a player who told it loses.',
  'Two players who share a secret win when the secret is kept to the end of the game, unless a third player names both of them.',
];

function cardsFor(texts: string[]) {
  return texts.map((text, i) => ({
    id: 11 + i, slug: `p_${i}`, name: `P${i + 1}`, card_type_id: 1 + i, template_id: null, goal_card_id: null, relationship_type_id: null, display_order: 1, current_version_no: 1,
    data: { values: { body: { text } } },
  }));
}

async function seed(page: Page, texts: string[]): Promise<void> {
  await seedAdminSession(page);
  await installNoiseCatchAll(page);
  seedCardgenTypes(texts.map((_, i) => ({ id: 1 + i, slug: `t${i}`, name: `Type ${i + 1}`, description: '', front_template_id: 1, back_template_id: null, display_order: i + 1 })));
  seedCardgenTemplates([{ id: 1, slug: 'base', name: 'Base card', parent_template_id: null, parent_slug: '', current_version_no: 1, spec: JSON.parse(JSON.stringify(BASE_SPEC)) }]);
  seedCardgenTemplateVersions({});
  seedCardgenExportProfiles([{ id: 1, name: 'A4 2x4 fronts', spec: { card_w_mm: 105, card_h_mm: 74.25, radius_mm: 5, bleed_mm: 3, dpi: 300, crop_marks: true, backs: 'none', sheet: { page: 'A4', cols: 2, rows: 4, gap_mm: 0, margin_mm: 0, orientation: 'portrait' } } }]);
  seedCardgenAssets([]);
  seedCardgenUsage({});
  seedCardgenRefusals([]);
  seedCardgenCards(cardsFor(texts));
  seedCardgenCardVersions({});
  seedCardgenResolved({});
  await installCardgenMocks(page);
}

function contentStreams(pdf: Buffer): string[] {
  const out: string[] = [];
  const raw = pdf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const bytes = pdf.subarray(start, end);
    try {
      out.push(inflateSync(bytes).toString('latin1'));
    } catch {
      // not a Flate stream (an image); skip
    }
    re.lastIndex = end;
  }
  return out;
}

/** pdfmake's underline: a filled 0.5 pt rect (at 8.5 pt) drawn right after the run. */
const UNDERLINE_RECT = /[-\d.]+ [-\d.]+ [-\d.]+ 0\.5 re\s*\n?f(\s|$)/;

function pdfTextLineCount(pdf: Buffer): number {
  const ys = new Set<string>();
  for (const s of contentStreams(pdf)) {
    for (const t of s.matchAll(/1 0 0 1 [-\d.]+ ([-\d.]+) Tm/g)) ys.add(t[1]);
  }
  return ys.size;
}

async function exportOne(page: Page, typeName: string): Promise<Buffer> {
  await page.goto('/admin/cardgen/export');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="export-profile-facts"]')).toBeVisible();
  const select = page.locator('[data-test="export-type-select"]');
  if (await select.count()) {
    await page.getByRole('combobox', { name: 'Cards to export' }).click();
    await page.getByRole('option', { name: typeName }).click();
  } else {
    await page.getByRole('radio', { name: typeName }).click();
  }
  await page.locator('[data-test="export-build"]').click();
  await expect(page.locator('[data-test="export-result"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-test="export-pages"]')).toHaveText('1 page');
  const dl = page.waitForEvent('download');
  await page.locator('[data-test="export-download"]').click();
  const path = await (await dl).path();
  return readFileSync(path!);
}

async function domLineCounts(page: Page, n: number): Promise<number[]> {
  await page.goto('/admin/cardgen/cards');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="review-grid"] > li')).toHaveCount(n);
  await page.getByRole('radio', { name: '100 %' }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.fonts.check('12px cardgen-fallback'))).toBe(true);
  const counts: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const body = page.locator(`[data-test="card-face-${11 + i}"] [data-el="body"]`);
    await expect.poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('cardgen-fallback');
    // The text span is a flex item (one box), so lines are read from a Range
    // over its text: one client rect per line fragment, deduplicated by top.
    counts.push(await body.locator('.el-text').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      return tops.size;
    }));
  }
  return counts;
}

test.describe('the review is the print-scale preview (#8754)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('R1: a body text breaks into the same number of lines on screen and in the PDF', async ({ page }) => {
    await seed(page, TEXTS);
    const dom = await domLineCounts(page, TEXTS.length);
    expect(new Set(dom).size, `the fixture texts should span several line counts, got ${dom}`).toBeGreaterThan(1);
    for (let i = 0; i < TEXTS.length; i += 1) {
      const pdf = await exportOne(page, `Type ${i + 1}`);
      expect(pdfTextLineCount(pdf), `card ${i + 1}: DOM ${dom[i]} lines`).toBe(dom[i]);
    }
  });

  test('R2: *word* is one bold underlined run on screen and in the PDF; \\* is an asterisk', async ({ page }) => {
    await seed(page, ['You *must* answer, \\*always\\*.']);
    await page.goto('/admin/cardgen/cards');
    await dismissMobileSidebarIfPresent(page);
    const body = page.locator('[data-test="card-face-11"] [data-el="body"]');
    await expect(body).toHaveText('YOU MUST ANSWER, *ALWAYS*.', { useInnerText: true });
    const em = body.locator('.el-em');
    await expect(em).toHaveCount(1);
    await expect(em).toHaveText('must');
    await expect(em).toHaveCSS('font-weight', '700');
    await expect.poll(() => em.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');

    const pdf = await exportOne(page, 'Type 1');
    const raw = pdf.toString('latin1');
    // The only bold text is the emphasised run, so the Medium face is embedded
    // because of it; the underline is pdfmake's decoration, a filled rect of
    // thickness 0.5 + floor(max(size - 8, 0) / 2) * 0.12 pt under the run
    // (0.5 pt at 8.5 pt): `x y w 0.5 re` then `f` in the content stream.
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Medium/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Regular/);
    expect(contentStreams(pdf).some((s) => UNDERLINE_RECT.test(s))).toBe(true);
  });

  test('R2 negative: without *, no bold face is embedded and nothing is underlined', async ({ page }) => {
    await seed(page, ['You must answer.']);
    await page.goto('/admin/cardgen/cards');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('[data-test="card-face-11"] .el-em')).toHaveCount(0);
    const pdf = await exportOne(page, 'Type 1');
    expect(pdf.toString('latin1')).not.toMatch(/Roboto-Medium/);
    expect(contentStreams(pdf).some((s) => UNDERLINE_RECT.test(s))).toBe(false);
  });
});
