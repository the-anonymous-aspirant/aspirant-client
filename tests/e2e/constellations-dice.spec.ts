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

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
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

    await page.goto(`/member/shared/constellations/room/${ROOM_CODE}`);
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('dice-status')).toHaveText('Not rolled yet');

    // Another player's roll lands — this page never clicks the die.
    mock.setDice({ faces: [4], nonce: 7, rolled_at: '2026-08-31T00:00:01Z' });

    await expect(page.getByTestId('dice-status')).toHaveText('Rolled 4', { timeout: 6000 });
  });
});
