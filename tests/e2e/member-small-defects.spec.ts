import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** The member area's smaller defects (system_3 #11027, UX walk finding AM9;
 *  D2, S3, §3.99, §3.120 Q1, §3.122 P3, D8). Every /api call is answered
 *  here; a catch-all /api/ is registered first. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function base(page: Page) {
  await page.route(/\/api\//, (r) => json(r, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
}

const PROFILE = { saved: true, profile: { full_name: 'Flora Testperson', address: 'A', steuernummer: '11/111/11111', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 6 } };
const INVOICE = (id: number, n: string) => ({
  id, invoice_number: n, status: 'issued', client_name: 'Galerie Beispiel', client_id: 1,
  service_date: '2026-09-05', issue_date: '2026-11-14', total_cents: 15000, currency: 'EUR', lines: [],
});

async function openInvoicing(page: Page, tab = 'Invoices') {
  await base(page);
  await page.route(/\/api\/invoicing\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/invoicing/profile') return json(route, 200, PROFILE);
    if (path === '/invoicing/invoices') return json(route, 200, { invoices: [INVOICE(1, '2026-001'), INVOICE(2, '2026-002')] });
    if (path === '/invoicing/payments') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses') return json(route, 200, { expenses: [] });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payers/candidates') return json(route, 200, { payers: [], left_out: {} });
    return json(route, 404, { error: { code: 'not_found', message: path } });
  });
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await page.getByRole('tab', { name: tab }).click();
}

test.describe('#11027 the admin sign-in, for a member already signed in', () => {
  test('a signed-in member sent to /admin is told why there is a second sign-in', async ({ page }) => {
    await base(page);
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('[data-test="signed-in-not-admin"]')).toHaveText(
      "You are signed in, but your account is not an administrator. Admin needs an administrator's sign-in below."
    );
  });

  test('a visitor who is not signed in sees no such line', async ({ page }) => {
    await base(page);
    await page.goto('/admin/login');
    await expect(page.locator('[data-test="signed-in-not-admin"]')).toHaveCount(0);
  });
});

test.describe('#11027 the Invoices app', () => {
  test('Edit profile is at least 24px tall', async ({ page }) => {
    await openInvoicing(page);
    const box = (await page.locator('[data-test="profile-edit"]').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
  });

  test('each invoice tick box has a 44px target, on a phone and on a desk', async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openInvoicing(page);
      const boxes = page.locator('[data-test="invoice-select"]');
      await expect(boxes.first()).toBeVisible();
      const target = await boxes.first().evaluate((input) => {
        const label = input.closest('label') as HTMLElement;
        const r = label.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      expect(target.w, `${width}px`).toBeGreaterThanOrEqual(44);
      expect(target.h, `${width}px`).toBeGreaterThanOrEqual(44);
    }
  });

  test('at 390px no Issuer line starts with the separator', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openInvoicing(page);
    // The Issuer is one line since system_3 #11019-A1; the rule is the same.
    const line = page.locator('.issuer-line__items');
    await expect(line).toBeVisible();
    const starts = await line.evaluate((p) => {
      // The first glyph of each rendered line, read from client rects of every text node.
      const firsts: string[] = [];
      let lastTop = -Infinity;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent || '';
        for (let i = 0; i < text.length; i++) {
          if (!text[i].trim()) continue;
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const top = Math.round(range.getBoundingClientRect().top);
          if (top > lastTop + 2) {
            firsts.push(text[i]);
            lastTop = top;
          }
        }
      }
      return firsts;
    });
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(starts).not.toContain('·');
  });
});

test.describe('#11027 the Files page', () => {
  async function openFiles(page: Page) {
    await base(page);
    await page.route(/\/api\/files/, (r) => json(r, 200, { files: [], folders: [], items: [] }));
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member/shared/files');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  }

  test('the title is the one page-title size at 390 and at 1440', async ({ page }) => {
    const sizes: string[] = [];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await openFiles(page);
      sizes.push(await page.getByRole('heading', { level: 1, name: 'Files' }).evaluate((h) => getComputedStyle(h).fontSize));
    }
    expect(sizes[0]).toBe(sizes[1]);
    expect(sizes[0]).toBe('22.4px');
  });

  test('Choose files is the house button and opens the picker', async ({ page }) => {
    await openFiles(page);
    const choose = page.getByRole('button', { name: 'Choose files' });
    await expect(choose).toHaveClass(/btn--/);
    const chooser = page.waitForEvent('filechooser');
    await choose.click();
    expect((await chooser).isMultiple()).toBe(true);
  });
});

test.describe('#11027 the member home', () => {
  test('at 390px the Invoices tile description is whole', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await base(page);
    await seedTrustedSessionAs(page, 'vinoly');
    await page.goto('/member');
    await dismissMobileSidebarIfPresent(page);
    const desc = page.locator('.application-card', { hasText: 'Invoices' }).locator('.card-content p');
    await expect(desc).toHaveText('Record payments and issue invoices for your work');
    const clipped = await desc.evaluate((p) => p.scrollHeight > p.clientHeight + 1);
    expect(clipped).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
