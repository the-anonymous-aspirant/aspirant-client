import { test, expect, type Page, type Route } from '@playwright/test';
import { seedTrustedSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4604 / #4587-F3 — the iconised dice roller. Covers the F3 acceptance: a
 * click rolls (spins, then settles on the server-resolved faces from B2,
 * #4597) and a second viewer converges on the same settled value purely from
 * the D1 short-poll (#4600), with no click of their own.
 *
 * `GET .../state` and `POST .../dice/roll` are mocked in-process via
 * page.route() — no aspirant-server is required, matching the #4601 shell
 * spec's pattern. The shell/board itself is not re-asserted here; that is
 * #4601's row.
 */

const ROOM_CODE = 'ABCDE';

type DiceState = { faces: number[]; nonce: number; rolled_at?: string } | null;

// Installs a stateful mock for the state poll + the roll endpoint. `setDice`
// lets a test simulate another player's roll landing between polls, without
// this page ever clicking the die itself.
async function installMock(page: Page, initialDice: DiceState) {
  let dice = initialDice;
  let rollCount = 0;

  await page.route(/qrserver\.com/, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
  });

  await page.route(/\/api\//, async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/constellations/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (req.method() === 'POST' && /\/dice\/roll$/.test(url.pathname)) {
      rollCount += 1;
      // Deterministic non-1 face so a settle can never coincidentally match
      // the resting glyph's implicit face.
      dice = { faces: [4], nonce: rollCount, rolled_at: '2026-08-31T00:00:00Z' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dice) });
      return;
    }

    if (/\/state$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: ROOM_CODE,
          player_count: 4,
          status: 'active',
          occupancy: 2,
          members: [{ user_id: 1 }, { user_id: 2 }],
          relationships: [],
          dice,
          history_cursor: null,
        }),
      });
      return;
    }

    await route.fulfill({ status: 204, body: '' });
  });

  return {
    setDice(next: DiceState) {
      dice = next;
    },
  };
}

test.describe('#4604 Constellations dice roller', () => {
  test('clicking the die spins and settles on the server-resolved face', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, null);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('dice-status')).toHaveText('Not rolled yet');

    await page.getByTestId('dice-roll').click();
    await expect(page.getByTestId('dice-status')).toHaveText('Rolling…');

    // Settle lands ~2s after click; give it margin over the fixed spin.
    await expect(page.getByTestId('dice-status')).toHaveText('Rolled 4', { timeout: 4000 });
  });

  test('a second viewer converges on the same settled value from the poll alone', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, null);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('dice-status')).toHaveText('Not rolled yet');

    // Another player's roll lands — this page never clicks the die.
    mock.setDice({ faces: [4], nonce: 7, rolled_at: '2026-08-31T00:00:01Z' });

    await expect(page.getByTestId('dice-status')).toHaveText('Rolled 4', { timeout: 6000 });
  });

  // #4806 ask 4 — "the icon for the dice should have a default dice phase".
  // The die used to render as a blank rounded square before the first roll
  // (displayFace 0 had no pip layout).
  test('the die rests on a face before anyone has rolled, without claiming a result', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, null);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const die = page.getByTestId('dice-roll');
    await expect(die.locator('.constellations-dice-pip')).toHaveCount(1);
    await expect(die).toHaveClass(/is-resting/);

    // The resting face is a render default, not a result: the status line and
    // the accessible name must both still read as un-rolled.
    await expect(page.getByTestId('dice-status')).toHaveText('Not rolled yet');
    await expect(die).toHaveAttribute('aria-label', 'Roll the die');
  });

  // #4832 — entering a room that already has a roll must NOT auto-spin. The
  // roll present in the first /state snapshot is pre-existing state: the die
  // shows its settled face immediately and never enters the rolling state (only
  // an explicit click, or a live roll after entry, spins).
  test('entering a room with a pre-existing roll shows the settled face without auto-rolling', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, { faces: [4], nonce: 7, rolled_at: '2026-08-31T00:00:00Z' });

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    const status = page.getByTestId('dice-status');
    const die = page.getByTestId('dice-roll');

    // Adopted silently: the settled value appears well within the 2s spin
    // window (SPIN_MS = 2000). A regression that spins on entry would still read
    // "Rolling…" at 1800ms and fail this assertion.
    await expect(status).toHaveText('Rolled 4', { timeout: 1800 });
    await expect(die).not.toHaveClass(/is-rolling/);
    await expect(die.locator('.constellations-dice-pip')).toHaveCount(4);
    await expect(die).toHaveAttribute('aria-label', 'Roll the die — currently showing 4');
  });

  // A live roll AFTER entry must still spin — the fix scopes the silent adopt to
  // the entry snapshot only, preserving the #4604 convergence animation.
  test('a roll landing after entry still spins', async ({ page }) => {
    await seedTrustedSession(page);
    const mock = await installMock(page, null);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByTestId('dice-status')).toHaveText('Not rolled yet');

    // Another player's roll arrives on a later poll — this must animate.
    mock.setDice({ faces: [4], nonce: 3, rolled_at: '2026-08-31T00:00:02Z' });
    await expect(page.getByTestId('dice-status')).toHaveText('Rolling…', { timeout: 3000 });
    await expect(page.getByTestId('dice-status')).toHaveText('Rolled 4', { timeout: 4000 });
  });

  // The resting state must clear once a real value lands, or the muted
  // placeholder pips would sit on top of a genuine roll.
  test('the resting state clears once a face is rolled', async ({ page }) => {
    await seedTrustedSession(page);
    await installMock(page, null);

    await page.goto(`/applications/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await page.getByTestId('dice-roll').click();
    await expect(page.getByTestId('dice-status')).toHaveText('Rolled 4', { timeout: 4000 });

    const die = page.getByTestId('dice-roll');
    await expect(die).not.toHaveClass(/is-resting/);
    await expect(die.locator('.constellations-dice-pip')).toHaveCount(4);
    await expect(die).toHaveAttribute('aria-label', 'Roll the die — currently showing 4');
  });
});
