import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession } from './helpers/mockBackend';

/** The rent-receipt form remembers values only by the user's choice, and
 *  says where they came from (design_conventions §3.154, system_3 #11191; the
 *  server store is #11190). Every value here is invented (Decision 8): no
 *  spec, seed or screenshot of this tool may carry a real name or address.
 *  Catch-all /api/ → 404 is registered first, so nothing reaches a server. */

const ROUTE = '**/api/users/me/form-values/kvitto';
const SAVED = {
  values: { address: 'Testgatan 1, 111 11 Teststad', monthly_amount: 4500, recipient: 'Test Mottagare', payer: 'Test Betalare' },
  updated_at: '2026-11-14T12:00:00Z',
};
const NOTHING = { values: null };

type Reply = (route: Route) => Promise<void> | void;
const json = (status: number, body: unknown): Reply => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const err = (status: number): Reply => json(status, { error: { code: 'x', message: 'Failed' } });
const noContent: Reply = (route) => route.fulfill({ status: 204 });

interface Stub { get?: Reply; put?: Reply; del?: Reply }

/** Answers the three form-values calls and records what was sent. The
 *  handlers are read at call time, so a test can swap one between calls. */
async function open(page: Page, stub: Stub) {
  const calls: { method: string; body: unknown }[] = [];
  await page.route(/\/api\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route(ROUTE, async (route) => {
    const method = route.request().method();
    const raw = route.request().postData();
    calls.push({ method, body: raw ? JSON.parse(raw) : null });
    const reply = method === 'GET' ? stub.get : method === 'PUT' ? stub.put : method === 'DELETE' ? stub.del : undefined;
    return reply ? reply(route) : route.fulfill({ status: 404, body: '{}' });
  });
  await seedAdminSession(page);
  await page.goto('/admin/tools/kvitto');
  await dismissMobileSidebarIfPresent(page);
  return calls;
}

const field = (page: Page, name: string) => page.getByLabel(new RegExp(`^${name}`));
const keep = (page: Page) => page.getByRole('checkbox', { name: /Keep these values saved/ });
const generate = (page: Page) => page.locator('[data-test="kvitto-generate"]');
const t = (page: Page, id: string) => page.locator(`[data-test="${id}"]`);

async function fillAll(page: Page) {
  await field(page, 'Address').fill('Provvägen 2, 222 22 Provby');
  await field(page, 'Monthly amount').fill('3000');
  await field(page, 'Recipient').fill('Prov Mottagare');
  await field(page, 'Payer').fill('Prov Betalare');
}

async function makeReceipts(page: Page) {
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await generate(page).click();
  return (await download).suggestedFilename();
}

test.describe('#11191 Kvitto: remembered values (§3.154)', () => {
  test('saved values fill the form, say where they came from, and tick the box', async ({ page }) => {
    await open(page, { get: json(200, SAVED) });
    await expect(field(page, 'Address')).toHaveValue('Testgatan 1, 111 11 Teststad');
    await expect(field(page, 'Monthly amount')).toHaveValue('4500');
    await expect(field(page, 'Recipient')).toHaveValue('Test Mottagare');
    await expect(field(page, 'Payer')).toHaveValue('Test Betalare');
    await expect(t(page, 'kvitto-provenance')).toContainText(
      'Filled in with your last used values, saved to your account on 14 November 2026.');
    await expect(page.getByRole('button', { name: 'Forget them' })).toBeVisible();
    await expect(keep(page)).toBeChecked();
    await expect(t(page, 'kvitto-will-delete')).toHaveCount(0);
  });

  test('nothing saved: empty fields, no line, the box unchecked', async ({ page }) => {
    await open(page, { get: json(200, NOTHING) });
    await expect(t(page, 'kvitto-loading')).toHaveCount(0);
    for (const name of ['Address', 'Monthly amount', 'Recipient', 'Payer']) await expect(field(page, name)).toHaveValue('');
    await expect(t(page, 'kvitto-provenance')).toHaveCount(0);
    await expect(keep(page)).not.toBeChecked();
  });

  test('while the read is in flight the four fields are disabled, so typing cannot be overwritten (D13)', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await open(page, { get: async (route) => { await held; await json(200, SAVED)(route); } });
    await expect(t(page, 'kvitto-loading')).toHaveText('Loading your saved values…');
    for (const name of ['Address', 'Monthly amount', 'Recipient', 'Payer']) await expect(field(page, name)).toBeDisabled();
    await expect(field(page, 'Year')).toBeEnabled();
    release();
    await expect(t(page, 'kvitto-loading')).toHaveCount(0);
    await expect(field(page, 'Address')).toBeEnabled();
    await expect(field(page, 'Address')).toHaveValue('Testgatan 1, 111 11 Teststad');
  });

  test('hints describe each field, never a sample value, and every field is required', async ({ page }) => {
    await open(page, { get: json(200, NOTHING) });
    await expect(field(page, 'Address')).toHaveAttribute('placeholder', 'Street, number, postcode and town');
    await expect(field(page, 'Monthly amount')).toHaveAttribute('placeholder', 'Kronor per month');
    await expect(field(page, 'Recipient')).toHaveAttribute('placeholder', 'Name of the person paid');
    await expect(field(page, 'Payer')).toHaveAttribute('placeholder', 'Name of the person paying');
    for (const name of ['Year', 'Address', 'Monthly amount', 'Recipient', 'Payer']) {
      await expect(field(page, name)).toHaveAttribute('aria-required', 'true');
    }
  });

  test('the disabled button says what enables it, then names what is still empty', async ({ page }) => {
    await open(page, { get: json(200, NOTHING) });
    await expect(generate(page)).toBeDisabled();
    await expect(t(page, 'kvitto-missing')).toHaveText('Fill in every field to make the receipts.');
    await field(page, 'Address').fill('Provvägen 2, 222 22 Provby');
    await field(page, 'Payer').fill('Prov Betalare');
    await expect(t(page, 'kvitto-missing')).toHaveText('Still empty: Monthly amount, Recipient.');
    await field(page, 'Monthly amount').fill('3000');
    await field(page, 'Recipient').fill('Prov Mottagare');
    await expect(generate(page)).toBeEnabled();
    await expect(t(page, 'kvitto-missing')).toHaveCount(0);
  });

  test('ticked: making the receipts saves exactly the four fields, and nothing goes to web storage', async ({ page }) => {
    const calls = await open(page, { get: json(200, NOTHING), put: json(200, { ...SAVED, updated_at: '2026-11-16T12:00:00Z' }) });
    await fillAll(page);
    await keep(page).check();
    expect(await makeReceipts(page)).toMatch(/^kvitto_\d{4}\.pdf$/);
    await expect.poll(() => calls.filter((c) => c.method === 'PUT').length).toBe(1);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({ address: 'Provvägen 2, 222 22 Provby', monthly_amount: 3000, recipient: 'Prov Mottagare', payer: 'Prov Betalare' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await expect(t(page, 'kvitto-choice-failed')).toHaveCount(0);

    const storage = await page.evaluate(() => ({
      session: sessionStorage.length,
      local: Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n'),
    }));
    expect(storage.session).toBe(0);
    for (const value of ['Provvägen', '3000', 'Prov Mottagare', 'Prov Betalare']) expect(storage.local).not.toContain(value);
  });

  test('unticked with saved values: the warning shows before the tap, and making the receipts deletes them', async ({ page }) => {
    const calls = await open(page, { get: json(200, SAVED), del: noContent });
    await keep(page).uncheck();
    await expect(t(page, 'kvitto-will-delete')).toHaveText('Your saved values will be deleted when you make the receipts.');
    await makeReceipts(page);
    await expect.poll(() => calls.filter((c) => c.method === 'DELETE').length).toBe(1);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await expect(t(page, 'kvitto-will-delete')).toHaveCount(0);
  });

  test('unticked with nothing saved: making the receipts writes nothing', async ({ page }) => {
    const calls = await open(page, { get: json(200, NOTHING) });
    await fillAll(page);
    await makeReceipts(page);
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  test('Forget them deletes the record and empties the four fields', async ({ page }) => {
    const calls = await open(page, { get: json(200, SAVED), del: noContent });
    await page.getByRole('button', { name: 'Forget them' }).click();
    await expect(t(page, 'kvitto-provenance')).toHaveCount(0);
    for (const name of ['Address', 'Monthly amount', 'Recipient', 'Payer']) await expect(field(page, name)).toHaveValue('');
    await expect(keep(page)).not.toBeChecked();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  test.describe('failures (Decision 6)', () => {
    test('a failed read leaves the fields empty and editable, and the box unchecked', async ({ page }) => {
      await open(page, { get: err(500) });
      await expect(t(page, 'kvitto-load-failed')).toHaveText(
        'Your saved values could not be loaded. Fill in the form, or reload the page to try again.');
      await expect(field(page, 'Address')).toBeEnabled();
      await expect(field(page, 'Address')).toHaveValue('');
      await expect(keep(page)).not.toBeChecked();
    });

    test('a failed save still makes the receipts, keeps the values, and Try again saves', async ({ page }) => {
      const stub: Stub = { get: json(200, NOTHING), put: err(500) };
      const calls = await open(page, stub);
      await fillAll(page);
      await keep(page).check();
      await makeReceipts(page);
      await expect(t(page, 'kvitto-choice-failed')).toContainText('The receipts were made, but your values were not saved.');
      await expect(field(page, 'Payer')).toHaveValue('Prov Betalare');
      stub.put = json(200, SAVED);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(t(page, 'kvitto-choice-failed')).toHaveCount(0);
      expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
    });

    test('a failed delete still makes the receipts, and Try again deletes', async ({ page }) => {
      const stub: Stub = { get: json(200, SAVED), del: err(500) };
      const calls = await open(page, stub);
      await keep(page).uncheck();
      await makeReceipts(page);
      await expect(t(page, 'kvitto-choice-failed')).toContainText('The receipts were made, but your values were not deleted.');
      stub.del = noContent;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(t(page, 'kvitto-choice-failed')).toHaveCount(0);
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
    });

    test('a failed Forget them keeps the line and the values', async ({ page }) => {
      await open(page, { get: json(200, SAVED), del: err(500) });
      await page.getByRole('button', { name: 'Forget them' }).click();
      await expect(t(page, 'kvitto-forget-failed')).toHaveText('Your saved values were not deleted. Try again.');
      await expect(t(page, 'kvitto-provenance')).toContainText('Filled in with your last used values');
      await expect(field(page, 'Address')).toHaveValue('Testgatan 1, 111 11 Teststad');
    });

    test('a 401 on the read says the session ended, with a sign-in link back to the tool', async ({ page }) => {
      await open(page, { get: err(401) });
      await expect(t(page, 'kvitto-session-ended')).toContainText('Your session has ended. Sign in again.');
      await expect(t(page, 'kvitto-sign-in')).toHaveAttribute('href', '/login?expired=1&redirect=%2Fadmin%2Ftools%2Fkvitto');
      await expect(t(page, 'kvitto-load-failed')).toHaveCount(0);
    });

    test('a 401 on the save says the session ended, never "not saved"', async ({ page }) => {
      await open(page, { get: json(200, NOTHING), put: err(401) });
      await fillAll(page);
      await keep(page).check();
      await makeReceipts(page);
      await expect(t(page, 'kvitto-session-ended')).toContainText('Your session has ended. Sign in again.');
      await expect(t(page, 'kvitto-choice-failed')).toHaveCount(0);
    });
  });
});
