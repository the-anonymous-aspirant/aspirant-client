import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** #4174: covers the card→page→edit→sync happy path for /member/shared/scratchpad.
 *  The scratchpad API (GET/PUT /api/users/me/scratchpad) is mocked in-process
 *  via page.route() with a stateful in-memory buffer — no aspirant-server is
 *  required. Real cross-device + per-user isolation is exercised manually as
 *  the task's Dogfood evidence after both PRs deploy. */

type ScratchpadState = { text: string; updated_at: string | null };

// Installs a stateful mock. Returns handles to inspect PUTs and mutate the
// server-side value (to simulate another device writing).
async function installScratchpadMock(page: Page, initial: ScratchpadState) {
  const state: ScratchpadState = { ...initial };
  const puts: string[] = [];
  let tick = 1;

  // Bare /api catch-all so unrelated background calls (asset prefetch, etc.)
  // don't spam the log. Registered FIRST so the specific route (registered
  // later) wins at match time.
  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/users/me/scratchpad', async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state),
      });
      return;
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { text: string };
      state.text = body.text;
      state.updated_at = `2026-08-22T00:00:${String(tick++).padStart(2, '0')}Z`;
      puts.push(body.text);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state),
      });
      return;
    }
    await route.fulfill({ status: 405, body: '' });
  });

  return {
    puts,
    // Simulate another device writing a newer value.
    remoteWrite(text: string) {
      state.text = text;
      state.updated_at = `2026-08-22T01:00:${String(tick++).padStart(2, '0')}Z`;
    },
  };
}

test.describe('/member/shared/scratchpad — sync loop', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
  });

  test('Trusted card navigates to the scratchpad and loads existing content', async ({ page }) => {
    await installScratchpadMock(page, { text: 'existing note', updated_at: '2026-08-22T00:00:00Z' });

    await page.goto('/member');
    await dismissMobileSidebarIfPresent(page);

    const card = page.locator('.application-card', { hasText: 'Scratchpad' });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/member\/shared\/scratchpad$/);
    const editor = page.locator('.scratchpad-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('existing note');
  });

  test('typing fires a debounced PUT with the new text', async ({ page }) => {
    const mock = await installScratchpadMock(page, { text: '', updated_at: null });

    await page.goto('/member/shared/scratchpad');
    const editor = page.locator('.scratchpad-editor');
    await expect(editor).toBeVisible();

    await editor.fill('hello from device A');

    // Debounced ~500ms; wait for the PUT to land.
    await expect.poll(() => mock.puts.at(-1)).toBe('hello from device A');
    await expect(page.locator('.scratchpad-status')).toHaveText('Saved');
  });

  test('poll pulls a remote change when the editor is not being typed in', async ({ page }) => {
    const mock = await installScratchpadMock(page, { text: 'start', updated_at: '2026-08-22T00:00:00Z' });

    await page.goto('/member/shared/scratchpad');
    const editor = page.locator('.scratchpad-editor');
    await expect(editor).toHaveValue('start');

    // Another device writes; the ~1s poll should pull it in without a reload.
    mock.remoteWrite('written from device B');
    await expect(editor).toHaveValue('written from device B', { timeout: 4000 });
  });
});
