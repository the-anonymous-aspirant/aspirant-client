import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** system_3 #11488 (a security finding from the review of PR 508): the
 *  reMarkable preview shows HTML fetched from another repository in an
 *  `<iframe srcdoc>`. A srcdoc frame with no `sandbox` has the app's own
 *  origin, so the fetched file's script ran as the app, in the member's
 *  session. With `sandbox="allow-scripts"` and no `allow-same-origin` the
 *  script still runs, in an origin of its own that can read nothing of ours.
 *
 *  The generator here is a probe, not a calendar: its script writes what it
 *  could reach into its own document, and the test reads that back. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const ANY_GENERATOR = /raw\.githubusercontent\.com\/.*_calendar_year\.html$/;

// What the app keeps in web storage for the session (seedTrustedSessionAs).
const SESSION_NAME = 'vinoly';

const PROBE = `<!doctype html><html><body><p id="probe">not run</p><script>
  var out = { origin: self.origin, hasOpener: window.opener !== null };
  try { out.storage = 'read:' + localStorage.getItem('user_name'); } catch (e) { out.storage = 'refused:' + e.name; }
  try { out.parent = 'read:' + parent.document.title; } catch (e) { out.parent = 'refused:' + e.name; }
  document.getElementById('probe').textContent = JSON.stringify(out);
</script></body></html>`;

async function open(page: Page): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await seedTrustedSessionAs(page, SESSION_NAME);
  await page.route(ANY_GENERATOR, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PROBE }));
  await page.goto('/member/shared/remarkable-pdfs');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('.preview-iframe')).toBeVisible();
}

test.describe('#11488 the reMarkable preview frame is sandboxed', () => {
  test('the frame allows scripts and nothing else', async ({ page }) => {
    await open(page);
    const sandbox = await page.locator('.preview-iframe').getAttribute('sandbox');
    expect(sandbox, 'the frame has a sandbox attribute').not.toBeNull();
    const tokens = (sandbox ?? '').split(/\s+/).filter(Boolean);
    expect(tokens).toEqual(['allow-scripts']);
    expect(tokens).not.toContain('allow-same-origin');
  });

  test('the fetched script runs, in an origin that cannot read the app', async ({ page }) => {
    await open(page);
    // Positive control: the app's own page does hold the value the probe asks for.
    expect(await page.evaluate(() => localStorage.getItem('user_name'))).toBe(SESSION_NAME);

    const probe = page.frameLocator('.preview-iframe').locator('#probe');
    await expect(probe).not.toHaveText('not run');
    const seen = JSON.parse((await probe.textContent()) ?? '{}');
    expect(seen.origin, 'an opaque origin').toBe('null');
    expect(seen.storage, 'web storage').toMatch(/^refused:/);
    expect(seen.parent, 'the parent document').toMatch(/^refused:/);
    expect(JSON.stringify(seen)).not.toContain(SESSION_NAME);
  });

  test('"Open in New Tab" opens the file with no way back to the app window', async ({ page, context }) => {
    await open(page);
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open in New Tab' }).click(),
    ]);
    const probe = tab.locator('#probe');
    await expect(probe).not.toHaveText('not run');
    const seen = JSON.parse((await probe.textContent()) ?? '{}');
    expect(seen.hasOpener, 'window.opener in the new tab').toBe(false);
  });
});
