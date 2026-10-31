import { test, expect } from '@playwright/test';

/** Covers #9234: the suite's preview refuses any /api call no spec stubbed,
 *  instead of proxying it to the backend on :8081 (production on the cell).
 *  vite.config.js `e2eUnstubbedGate` answers it with a local 503, and
 *  playwright.config.ts turns it on through webServer.env. If either goes,
 *  these calls reach the backend again and this spec goes red.
 *
 *  The probe path exists nowhere, so even a broken gate sends nothing that
 *  could act. */

const PROBE = '/api/e2e-gate-probe-9234';

async function call(page: import('@playwright/test').Page, method: string) {
  return page.evaluate(
    async ([url, m]) => {
      const r = await fetch(url, { method: m, body: m === 'GET' ? undefined : '{}' });
      return { status: r.status, body: await r.text() };
    },
    [PROBE, method] as const,
  );
}

test.describe('#9234 unstubbed /api calls are refused locally', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  for (const method of ['GET', 'POST']) {
    test(`an unstubbed ${method} gets the gate's 503`, async ({ page }) => {
      const r = await call(page, method);
      expect(r.status).toBe(503);
      expect(r.body).toContain(`e2e: unstubbed ${method} ${PROBE} refused`);
    });
  }

  test('a page.route stub still answers before the gate', async ({ page }) => {
    await page.route(PROBE, (route) => route.fulfill({ status: 200, body: 'stubbed' }));
    const r = await call(page, 'GET');
    expect(r).toEqual({ status: 200, body: 'stubbed' });
  });
});
