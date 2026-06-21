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
 *  Confidence mix is deliberate so each .field-row.{bucket} class appears. */
const EXTRACT_RESPONSE = {
  documents: [
    {
      filename: 'lgh_utdrag.pdf',
      document_type: 'lgh_utdrag',
      fields: [
        { key: 'forening_namn', value: 'Brf Exempel', confidence: 'confident', source_page: 1 },
        { key: 'lgh_skatteverket', value: '1001', confidence: 'confident', source_page: 1 },
        { key: 'organisationsnummer', value: '769600-0000', confidence: 'confident', source_page: 1 },
        { key: 'adress', value: 'Exempelgatan 1', confidence: 'confident', source_page: 2 },
        { key: 'postort', value: 'Nynäshamn', confidence: 'confident', source_page: 2 },
        { key: 'document_date', value: '2026-06-01', confidence: 'confident', source_page: 1 },
      ],
    },
    {
      filename: 'datavardering.pdf',
      document_type: 'datavardering',
      fields: [
        { key: 'marknadsvarde_suggested', value: '3050000', confidence: 'uncertain', source_page: 3 },
        { key: 'osakerhet_uppat', value: '50000', confidence: 'uncertain', source_page: 3 },
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EXTRACT_RESPONSE),
    });
  });

  await page.route(/\/api\/commander\/valuation-statement\/generate(\?.*)?$/, async (route: Route) => {
    const url = route.request().url();
    const isPdfRequest = url.includes('format=pdf');

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
 *  the operator's normal first action is to tap the hamburger or the
 *  overlay. We do the same here; a no-op on viewports where the overlay
 *  never renders (desktop). */
export async function dismissMobileSidebarIfPresent(page: Page): Promise<void> {
  const overlay = page.locator('.mobile-overlay');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click();
    await overlay.waitFor({ state: 'hidden', timeout: 5_000 });
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
