import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** One refusal state and one failure state on the member pages (system_3
 *  #11025, UX walk finding AM8; D2, D5, S3, D9, D7). Modelled on the Invoices
 *  refusal: one message in place of the page body, the true reason in plain
 *  words, a retry only where retrying can help, and no live controls while
 *  nothing is loaded. Every /api call (and the planner's generator fetch) is
 *  answered here; a catch-all /api/ is registered first. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function base(page: Page, user = 'vinoly'): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await seedTrustedSessionAs(page, user);
}

async function go(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissMobileSidebarIfPresent(page);
}

const refused = (page: Page) => page.getByTestId('read-state-refused');
const failed = (page: Page) => page.getByTestId('read-state-failed');
const retry = (page: Page) => page.getByTestId('read-state-retry');
// What the walk saw reach the page: server messages and service names.
const LEAKS = ['Insufficient permissions', 'translator service', 'status code', 'AxiosError', 'aspirant-'];

async function noLeaks(page: Page) {
  const text = await page.locator('main, .page, body').first().innerText();
  for (const leak of LEAKS) expect(text, leak).not.toContain(leak);
}

test.describe('#11025 push-ups and sit-ups', () => {
  test('a 403 on push-ups is the Swedish refusal, with no retry', async ({ page }) => {
    await base(page, 'jenny');
    await page.route(/\/api\/pushups\//, (route) => json(route, 403, { error: { code: 'forbidden', message: 'Insufficient permissions' } }));
    await go(page, '/member/personal/pappas-pushups');
    await expect(refused(page)).toContainText('Den här appen tillhör ett annat konto');
    await expect(refused(page)).toContainText('Bara ägaren och en administratör kan öppna den.');
    await expect(retry(page)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Vi nådde inte servern');
    await noLeaks(page);
  });

  test('a 502 on push-ups names the service, in Swedish, with a retry', async ({ page }) => {
    await base(page, 'robert');
    await page.route(/\/api\/pushups\//, (route) => json(route, 502, {}));
    await go(page, '/member/personal/pappas-pushups');
    await expect(failed(page)).toContainText('Utmaningen kunde inte laddas');
    await expect(failed(page)).toContainText('Tjänsten bakom sidan är inte igång just nu.');
    await expect(retry(page)).toHaveText('Försök igen');
  });

  test('a 403 on sit-ups is the Swedish refusal, with no retry', async ({ page }) => {
    await base(page, 'jenny');
    await page.route(/\/api\/situps\//, (route) => json(route, 403, {}));
    await go(page, '/member/personal/pappas-sit-ups');
    await expect(refused(page)).toContainText('Den här appen tillhör ett annat konto');
    await expect(retry(page)).toHaveCount(0);
  });
});

test.describe('#11025 a 401 is a session that ended, not a refusal', () => {
  test('Jobs says the session ended, once, with a Sign in link back to the page', async ({ page }) => {
    await base(page);
    await page.route(/\/api\/jobs/, (route) => json(route, 401, {}));
    await go(page, '/member/personal/jobs');
    const out = page.getByTestId('read-state-signed-out');
    await expect(out).toHaveCount(1);
    await expect(out).toContainText('Your session has ended');
    await expect(out).toContainText('Sign in again.');
    await expect(page.locator('body')).not.toContainText('belongs to another account');
    const href = await page.getByTestId('read-state-sign-in').getAttribute('href');
    expect(href).toBe('/login?expired=1&redirect=%2Fmember%2Fpersonal%2Fjobs');
    await expect(retry(page)).toHaveCount(0);
  });

  test('push-ups says it in Swedish', async ({ page }) => {
    await base(page, 'robert');
    await page.route(/\/api\/pushups\//, (route) => json(route, 401, {}));
    await go(page, '/member/personal/pappas-pushups');
    const out = page.getByTestId('read-state-signed-out');
    await expect(out).toContainText('Din session har gått ut');
    await expect(out).toContainText('Logga in igen.');
    await expect(page.getByTestId('read-state-sign-in')).toHaveText('Logga in');
  });
});

test.describe('#11025 Jobs', () => {
  test('a 403 is said once, in place of the page, with no controls', async ({ page }) => {
    await base(page, 'jenny');
    await page.route(/\/api\/jobs/, (route) => json(route, 403, { error: { code: 'forbidden', message: 'Insufficient permissions' } }));
    await go(page, '/member/personal/jobs');
    await expect(refused(page)).toHaveCount(1);
    await expect(refused(page)).toContainText('This app belongs to another account');
    await expect(page.locator('[data-test="jobs-table"]')).toHaveCount(0);
    await expect(page.locator('[data-test="jobs-filter"]')).toHaveCount(0);
    await expect(retry(page)).toHaveCount(0);
    await noLeaks(page);
  });

  test('a failed jobs read replaces the controls and the table, and Try again recovers', async ({ page }) => {
    await base(page);
    let first = true;
    await page.route(/\/api\/jobs(\?.*)?$/, (route) => {
      if (first) {
        first = false;
        return json(route, 503, { detail: 'jobs-scraper unavailable' });
      }
      return json(route, 200, { jobs: [], total: 0 });
    });
    await page.route(/\/api\/jobs\/about$/, (route) => json(route, 200, { description: 'Part-time work', in_scope: [], out_of_scope: [] }));
    await page.route(/\/api\/jobs\/sources$/, (route) => json(route, 200, { sources: [], global_criteria: null }));
    await go(page, '/member/personal/jobs');
    await expect(failed(page)).toContainText('The jobs could not be loaded');
    await expect(failed(page)).toContainText('The service behind this page is not running right now.');
    await expect(page.locator('[data-test="jobs-filter"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('jobs-scraper');
    await retry(page).click();
    await expect(failed(page)).toHaveCount(0);
    await expect(page.locator('[data-test="jobs-table"]')).toBeVisible();
  });

  test('when every read fails, the page says it once', async ({ page }) => {
    await base(page);
    await page.route(/\/api\/jobs/, (route) => json(route, 502, { detail: 'jobs-scraper unavailable' }));
    await go(page, '/member/personal/jobs');
    await expect(failed(page)).toHaveCount(1);
    await expect(failed(page)).toContainText('The jobs could not be loaded');
    await expect(page.locator('[data-test="about-me-error"]')).toHaveCount(0);
    await expect(page.locator('.sources-status.error')).toHaveCount(0);
    const text = await page.locator('.page').first().innerText();
    expect(text.split('not running right now').length - 1).toBe(1);
  });

  test('a failed sources read says so in plain words, in ink that reads on its dark bar', async ({ page }) => {
    await base(page);
    await page.route(/\/api\/jobs(\?.*)?$/, (route) => json(route, 200, { jobs: [], total: 0 }));
    await page.route(/\/api\/jobs\/about$/, (route) => json(route, 200, { description: 'Part-time work', in_scope: [], out_of_scope: [] }));
    await page.route(/\/api\/jobs\/sources$/, (route) => json(route, 502, { detail: 'jobs-scraper unavailable' }));
    await go(page, '/member/personal/jobs');
    const line = page.locator('.sources-status.error');
    await expect(line).toHaveText('Sources could not be loaded. The service behind this page is not running right now. This is usually temporary.');
    await expect(page.locator('body')).not.toContainText('jobs-scraper');
    const ink = await line.evaluate((el) => getComputedStyle(el).color);
    // --feedback-error-text-on-dark, not the #c00 fallback of a token that never existed.
    expect(ink).not.toBe('rgb(204, 0, 0)');
  });
});

test.describe('#11025 Translator', () => {
  test('a failed languages read stands in place of the form, with a retry that recovers', async ({ page }) => {
    await base(page);
    let first = true;
    await page.route(/\/api\/translator\/languages$/, (route) => {
      if (first) {
        first = false;
        return json(route, 502, {});
      }
      return json(route, 200, { languages: [{ code: 'en', name: 'English', targets: ['sv'] }], installed_pairs: 1, total_pairs: 1, installed: ['en-sv'] });
    });
    await go(page, '/member/shared/translator');
    await expect(failed(page)).toContainText('The translator could not be loaded');
    await expect(page.locator('.translate-card')).toHaveCount(0);
    await noLeaks(page);
    await retry(page).click();
    await expect(page.locator('.translate-card')).toBeVisible();
  });

  test('a 403 is the refusal, with no form and no retry', async ({ page }) => {
    await base(page, 'jenny');
    await page.route(/\/api\/translator\/languages$/, (route) => json(route, 403, {}));
    await go(page, '/member/shared/translator');
    await expect(refused(page)).toContainText('This app belongs to another account');
    await expect(page.locator('.translate-card')).toHaveCount(0);
    await expect(retry(page)).toHaveCount(0);
  });
});

test.describe('#11025 reMarkable planner', () => {
  const GENERATOR = /raw\.githubusercontent\.com\/.*generate_planner\.html$/;

  test('a failed generator load says so, offers a retry, and offers no Download', async ({ page }) => {
    await base(page);
    await page.route(GENERATOR, (route) => route.fulfill({ status: 500, body: '' }));
    await go(page, '/member/shared/remarkable-pdfs');
    await expect(failed(page)).toContainText('The generator could not be loaded');
    await expect(page.locator('body')).not.toContainText('Loading generator');
    await expect(page.getByRole('button', { name: 'Download as PDF' })).toHaveCount(0);
    await expect(retry(page)).toBeVisible();
  });

  test('a loaded generator shows its preview and its actions', async ({ page }) => {
    await base(page);
    await page.route(GENERATOR, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>planner</p>' }));
    await go(page, '/member/shared/remarkable-pdfs');
    await expect(page.locator('.preview-iframe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download as PDF' })).toBeEnabled();
    await expect(failed(page)).toHaveCount(0);
  });
});
