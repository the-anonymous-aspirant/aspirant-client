import { test, expect, type Page, type Route, type Locator } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The advisor says when its documents could not be read, and its dark cards
 *  keep their words in light (system_3 #11005, UX walk finding AA3; D2, D7,
 *  D9). Before, a failed documents read showed "No documents uploaded yet."
 *  and in the light theme the upload labels, the question hint and the empty
 *  line took the page's dark ink on the dark card. Every /api call is answered
 *  here; a catch-all /api/ is registered first. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const SOURCES = { total_documents: 1, total_chunks: 4, domains: [{ name: 'legal', display_name: 'Legal', icon: 'scale', document_count: 1, has_content: true }] };

async function open(page: Page, docs: Array<{ status: number; body?: unknown }>, sources = { status: 200, body: SOURCES as unknown }) {
  await page.addInitScript(() => {
    localStorage.setItem('user_role', 'Admin');
    localStorage.setItem('user_name', 'e2e-admin');
  });
  await page.route(/\/api\//, (r) => json(r, 404, { detail: 'not stubbed' }));
  await page.route(/\/api\/profile$/, (r) => json(r, 200, { username: 'e2e-admin', avatar_url: '' }));
  await page.route(/\/api\/advisor\/sources/, (r) => json(r, sources.status, sources.body ?? {}));
  await page.route(/\/api\/advisor\/documents/, (r) => {
    const next = docs.length > 1 ? docs.shift()! : docs[0];
    return json(r, next.status, next.body ?? {});
  });
  await page.goto('/admin/advisor');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Document Management' })).toBeVisible();
}

const failed = (page: Page) => page.locator('[data-test="advisor-docs-failed"]');
const empty = (page: Page) => page.locator('[data-test="advisor-docs-empty"]');

/** Foreground over the nearest opaque background, as in trusted-contrast.spec.ts. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let bg = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff = fg.a < 1 ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) } : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

test.describe('#11005 a failed documents read is not an empty list', () => {
  test('a 502 says so in the sources card\'s words, with no empty line, and Try again recovers', async ({ page }) => {
    await open(page, [{ status: 502 }, { status: 200, body: [{ id: 1, filename: 'contract.pdf', domain: 'legal', access_level: 'admin', chunk_count: 4 }] }]);
    await expect(failed(page)).toContainText('Failed to load documents: the advisor service did not answer');
    await expect(empty(page)).toHaveCount(0);
    await expect(page.getByText('No documents uploaded yet.')).toHaveCount(0);
    await page.locator('[data-test="advisor-docs-retry"]').click();
    await expect(failed(page)).toHaveCount(0);
    await expect(page.locator('.doc-row')).toContainText('contract.pdf');
  });

  test('the empty line appears only after a read that returned none', async ({ page }) => {
    await open(page, [{ status: 200, body: { items: [] } }]);
    await expect(empty(page)).toHaveText('No documents uploaded yet.');
    await expect(failed(page)).toHaveCount(0);
  });

  test('a failed sources read offers a retry too', async ({ page }) => {
    let first = true;
    await open(page, [{ status: 200, body: [] }], { status: 502, body: {} });
    await expect(page.locator('[data-test="advisor-sources-failed"]')).toContainText('Failed to load sources: the advisor service did not answer');
    await page.unroute(/\/api\/advisor\/sources/);
    await page.route(/\/api\/advisor\/sources/, (r) => {
      first = false;
      return json(r, 200, SOURCES);
    });
    await page.locator('[data-test="advisor-sources-retry"]').click();
    await expect(page.locator('.sources-stats')).toContainText('1 documents');
    expect(first).toBe(false);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`#11005 the dark cards keep their words in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('labels, the question hint, the empty line and the failed line read at AA on their card', async ({ page }) => {
      await open(page, [{ status: 200, body: [] }]);
      for (const label of ['Domain', 'Access Level', 'Files (PDF, DOCX, TXT)']) {
        const el = page.locator('.form-group label', { hasText: label }).first();
        await expect(el).toBeVisible();
        expect(await contrastRatio(el), `${label} label`).toBeGreaterThanOrEqual(4.5);
      }
      expect(await contrastRatio(page.locator('.empty-chat p')), 'question hint').toBeGreaterThanOrEqual(4.5);
      expect(await contrastRatio(empty(page)), 'empty line').toBeGreaterThanOrEqual(4.5);
    });

    test('the failed line reads at AA on its card', async ({ page }) => {
      await open(page, [{ status: 502 }]);
      expect(await contrastRatio(failed(page).locator('.error-text')), 'failed line').toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe('#11005 the file control is a DS button', () => {
  test('Choose files opens the picker, and the chosen names read beside it', async ({ page }) => {
    await open(page, [{ status: 200, body: [] }]);
    await expect(page.locator('[data-test="advisor-file-input"]')).toBeHidden();
    await expect(page.locator('[data-test="advisor-chosen-files"]')).toHaveText('No file chosen');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-test="advisor-choose-files"]').click();
    await (await chooser).setFiles([
      { name: 'lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { name: 'policy.txt', mimeType: 'text/plain', buffer: Buffer.from('cover') },
    ]);
    await expect(page.locator('[data-test="advisor-chosen-files"]')).toHaveText('2 files: lease.pdf, policy.txt');
  });

  test('at 390px nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, [{ status: 502 }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
