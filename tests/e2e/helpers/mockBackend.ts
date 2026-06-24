import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDocx = readFileSync(
  path.join(here, '..', 'fixtures', 'golden', 'vardeutlatande.golden.docx'),
);

/** Minimal byte-valid PDF — enough for `application/pdf` MIME detection. */
export const GOLDEN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
    'xref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n',
);

export const GOLDEN_DOCX: Buffer = goldenDocx;

/** Operator-defaults block that #879 surfaces in the review step pre-fill. */
export const OPERATOR_DEFAULTS = {
  ort: 'Nynäshamn',
  maklare_namn: 'Jenny Wiklund',
  maklare_titel: 'Auktoriserad mäklare',
  foretag: 'Wiklund Mäkleri',
  likviditet: 'god',
};

/** Structured comparable-sales row — #878 column-table render. */
const COMPARABLE_ROWS = [
  {
    forening: 'Brf Solviken',
    area_m2: '62,5',
    balkong: 'ja',
    avgift_kr_manad: '3450',
    arsavgift_kr: '41400',
    pris_kr: '3100000',
    pris_per_m2: '49600',
    salj_datum: '2026-04-12',
  },
  {
    forening: 'Brf Bryggan',
    area_m2: '58',
    balkong: 'nej',
    avgift_kr_manad: '3120',
    arsavgift_kr: '37440',
    pris_kr: '2925000',
    pris_per_m2: '50431',
    salj_datum: '2026-03-30',
  },
];

/** Extract response that drives the review step the spec asserts against.
 *  Confidence mix is deliberate so each .field-row.{bucket} class appears:
 *  the lgh_utdrag PDF feeds 'confident' identifier slots, the datavardering
 *  PDF feeds 'uncertain' appraisal slots, operator-defaulted slots paint
 *  'manual', and unfed slots (bilder_note, fastighetsutdrag_date) stay
 *  'not_found'. Field shape follows the #1113 field-first contract — each
 *  PDF surfaces the full slot set; per-PDF source_class routes the date
 *  rows. */
const EXTRACT_RESPONSE = {
  documents: [
    {
      filename: 'lgh_utdrag.pdf',
      fields: [
        { key: 'source_class', value: 'lagenhetsforteckning', confidence: 'confident', source_page: 1 },
        { key: 'property_shape', value: 'bostadsratt', confidence: 'confident', source_page: 1 },
        { key: 'objekt', value: 'LGH 1001 Brf Exempel (769600-0000)', confidence: 'confident', source_page: 1 },
        { key: 'objekt_short', value: 'LGH 1001 Brf Exempel', confidence: 'confident', source_page: 1 },
        { key: 'adress', value: 'Exempelgatan 1', confidence: 'confident', source_page: 2 },
        { key: 'kommun', value: 'Nynäshamn', confidence: 'confident', source_page: 2 },
        { key: 'upplatelseform', value: 'Bostadsrätt', confidence: 'confident', source_page: 1 },
        { key: 'document_date', value: '2026-06-01', confidence: 'confident', source_page: 1 },
        { key: 'marknadsvarde_kr', value: null, confidence: 'not_found', source_page: null },
        { key: 'intervall_kr', value: null, confidence: 'not_found', source_page: null },
      ],
    },
    {
      filename: 'datavardering.pdf',
      fields: [
        { key: 'source_class', value: 'datavardering', confidence: 'confident', source_page: 1 },
        { key: 'property_shape', value: 'bostadsratt', confidence: 'confident', source_page: 1 },
        { key: 'objekt', value: 'LGH 1001 Brf Exempel (769600-0000)', confidence: 'uncertain', source_page: 1 },
        { key: 'objekt_short', value: 'LGH 1001 Brf Exempel', confidence: 'uncertain', source_page: 1 },
        { key: 'adress', value: 'Exempelgatan 1', confidence: 'uncertain', source_page: 1 },
        { key: 'kommun', value: 'Nynäshamn', confidence: 'uncertain', source_page: 1 },
        { key: 'upplatelseform', value: 'Bostadsrätt', confidence: 'uncertain', source_page: 1 },
        { key: 'marknadsvarde_kr', value: '3050000', confidence: 'uncertain', source_page: 3 },
        { key: 'intervall_kr', value: '50000', confidence: 'uncertain', source_page: 3 },
        { key: 'document_date', value: '2026-05-20', confidence: 'confident', source_page: 1 },
      ],
      comparable_sales: COMPARABLE_ROWS,
    },
  ],
  operator_defaults: OPERATOR_DEFAULTS,
};

export interface InstallOpts {
  /** Override the body of POST /generate?format=pdf (default: minimal PDF). */
  pdfBody?: Buffer;
  /** Override the body of POST /generate (no format) (default: golden docx). */
  docxBody?: Buffer;
  /** Force PDF route to 503 so the client falls back to docx. */
  pdfReturns503?: boolean;
  /** Delay /extract response in ms, holding the per-file spinner on screen. */
  extractDelayMs?: number;
  /** Delay /generate response in ms, holding the full spinner on screen. */
  generateDelayMs?: number;
}

/** Install routes for every backend endpoint the Värdeutlåtande view calls.
 *  Each test starts from a clean review-form state seeded by the fixed
 *  EXTRACT_RESPONSE; per-test overrides go through `opts`.
 *
 *  Routes are matched LIFO — most-recently-registered wins — so the
 *  noise-suppressing catch-all is installed FIRST and the specific handlers
 *  added after it take precedence. */
export async function installCommanderMocks(page: Page, opts: InstallOpts = {}): Promise<void> {
  // Vuetify's asset loaders and other background calls hit /api/* via the
  // vite proxy, which has nothing to forward to in the e2e env. Stub them
  // to a 204 so the WebServer log stays readable when a real failure
  // surfaces — but register BEFORE the specific handlers so they win.
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  // page.route's URL glob matches path + query as one string; "?" is a
  // single-char wildcard in globs, so a regex is the safer match anchor for
  // endpoints that vary by query string.
  await page.route(/\/api\/commander\/valuation-statement\/extract$/, async (route: Route) => {
    if (opts.extractDelayMs) {
      await new Promise(resolve => setTimeout(resolve, opts.extractDelayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EXTRACT_RESPONSE),
    });
  });

  await page.route(/\/api\/commander\/valuation-statement\/generate(\?.*)?$/, async (route: Route) => {
    const url = route.request().url();
    const isPdfRequest = url.includes('format=pdf');

    if (opts.generateDelayMs) {
      await new Promise(resolve => setTimeout(resolve, opts.generateDelayMs));
    }

    if (isPdfRequest) {
      if (opts.pdfReturns503) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { error_code: 'libreoffice_unavailable', message: 'PDF export unavailable' },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="vardeutlatande.pdf"' },
        body: opts.pdfBody ?? GOLDEN_PDF,
      });
      return;
    }

    // Fallback (no ?format=): the view requests the docx after a 503 on PDF.
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      headers: { 'content-disposition': 'attachment; filename="vardeutlatande.docx"' },
      body: opts.docxBody ?? GOLDEN_DOCX,
    });
  });

  await page.route(/\/api\/commander\/valuation-statement\/operator-defaults$/, async (route: Route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  // ---------- processed-valuations store ('Tidigare värderingar' tab, #1154) ----------
  await installProcessedValuationsMocks(page);
}

/** In-memory seed store for the /processed* endpoints. Reset on every
 *  installCommanderMocks call so each test starts clean. Exposed so a
 *  test can seed rows via `seedProcessedRows([...])` or assert on
 *  `processedSeed.rows` after a wizard run. */
export const processedSeed: { rows: any[] } = { rows: [] };

export interface SeedRow {
  id?: string;
  name: string;
  input_files?: string[];
  extracted_values?: Record<string, unknown>;
  final_values?: Record<string, unknown>;
  was_manually_edited?: boolean;
  created_at?: string;
  updated_at?: string;
}

export function seedProcessedRows(rows: SeedRow[] = []) {
  const now = '2026-06-24T20:00:00Z';
  processedSeed.rows = rows.map((r, i) => ({
    id: r.id ?? `seed-${i + 1}`,
    name: r.name,
    input_files: r.input_files ?? [],
    extracted_values: r.extracted_values ?? {},
    final_values: r.final_values ?? {},
    was_manually_edited: r.was_manually_edited ?? false,
    created_at: r.created_at ?? now,
    updated_at: r.updated_at ?? now,
    created_by: null,
  }));
}

export async function installProcessedValuationsMocks(page: Page): Promise<void> {
  processedSeed.rows = [];

  // GET /export.csv must be matched BEFORE the /:id route — Playwright's
  // page.route is LIFO so the most-specific pattern is registered LAST
  // for priority, but we register .csv FIRST then the others on top.
  // Actually playwright's order: routes are matched in REGISTRATION order
  // (first match wins) — confirmed in docs. We register exact match → :id → collection.
  await page.route(/\/api\/commander\/valuation-statement\/processed\/export\.csv$/, async (route: Route) => {
    const rows = processedSeed.rows;
    const header = ['id', 'name', 'created_at', 'updated_at', 'was_manually_edited'];
    const body = [
      header.join(','),
      ...rows.map(r => header.map(k => String((r as any)[k])).join(',')),
    ].join('\n') + '\n';
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      headers: { 'content-disposition': 'attachment; filename="processed_valuations.csv"' },
      body,
    });
  });

  await page.route(/\/api\/commander\/valuation-statement\/processed\/[^/?]+$/, async (route: Route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').pop()!;
    const method = route.request().method();
    const idx = processedSeed.rows.findIndex(r => r.id === id);

    if (method === 'GET') {
      if (idx < 0) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(processedSeed.rows[idx]) });
      return;
    }
    if (method === 'PATCH') {
      if (idx < 0) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      const patch = JSON.parse(route.request().postData() || '{}');
      const row = processedSeed.rows[idx];
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.extracted_values !== undefined) row.extracted_values = patch.extracted_values;
      if (patch.final_values !== undefined) row.final_values = patch.final_values;
      row.was_manually_edited =
        JSON.stringify(row.final_values) !== JSON.stringify(row.extracted_values);
      row.updated_at = new Date().toISOString();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
      return;
    }
    if (method === 'DELETE') {
      if (idx >= 0) processedSeed.rows.splice(idx, 1);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.route(/\/api\/commander\/valuation-statement\/processed(\?.*)?$/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: processedSeed.rows,
          total: processedSeed.rows.length,
          limit: 500,
          offset: 0,
        }),
      });
      return;
    }
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      const id = body.id ?? `created-${processedSeed.rows.length + 1}`;
      const final = body.final_values ?? {};
      const extracted = body.extracted_values ?? {};
      const row = {
        id,
        name: body.name ?? `${new Date().toISOString().slice(0, 10)}_${(final as any).objekt_short ?? 'valuation'}`,
        input_files: body.input_files ?? [],
        extracted_values: extracted,
        final_values: final,
        was_manually_edited: JSON.stringify(final) !== JSON.stringify(extracted),
        created_by: body.created_by ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      processedSeed.rows.unshift(row);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) });
      return;
    }
    await route.fallback();
  });
}

/** Seed localStorage with a Trusted-role session so the router guard lets
 *  the view mount; called via addInitScript so it runs before any nav. */
export async function seedTrustedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('user_token', 'e2e-test-token');
    localStorage.setItem('user_role', 'Trusted');
    localStorage.setItem('user_name', 'e2e-tester');
  });
}

/** On mobile the sidebar starts visible on initial page load and overlays
 *  the route content, intercepting every click. checkMobile() only auto-
 *  hides on a *transition* into mobile (not on a fresh mobile mount), so
 *  the operator's normal first action is to tap the hamburger.
 *
 *  We click the hamburger rather than the overlay because .sidebar (z:1000)
 *  visually covers the left ~200px of the overlay (which is 100% wide), and
 *  Playwright's default click target is the element center — falling inside
 *  the sidebar. .mobile-menu-toggle has z-index 1001 and stays above the
 *  sidebar even when shown. A no-op on viewports where the toggle never
 *  renders (desktop). */
export async function dismissMobileSidebarIfPresent(page: Page): Promise<void> {
  const toggle = page.locator('.mobile-menu-toggle');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await page.locator('.mobile-overlay').waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/** A pair of `name + buffer + mimeType` chunks fed to setInputFiles; the
 *  PDF body is byte-minimal because the upload step does not parse the
 *  content (commander does, but commander is mocked). */
export const PDF_UPLOAD_PAYLOAD = [
  {
    name: 'lgh_utdrag.pdf',
    mimeType: 'application/pdf',
    buffer: GOLDEN_PDF,
  },
  {
    name: 'datavardering.pdf',
    mimeType: 'application/pdf',
    buffer: GOLDEN_PDF,
  },
];
