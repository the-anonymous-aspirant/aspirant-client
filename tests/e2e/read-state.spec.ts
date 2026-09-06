import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent, seedAdminSession, seedTrustedSession } from './helpers/mockBackend';

/**
 * system_3 #5302 (#5278-A1) — the read-state grammar, on the two renders that
 * had no read state at all.
 *
 * The #5260 cohesion walk found one condition shipping three grammars. These
 * two pages had the worst of them: `MessageBoardView` caught every failure into
 * `console.error` and left the same empty rectangle a thread with no messages
 * produces, and `/admin/system-health` rendered a heading, a Refresh button and
 * nothing.
 *
 * That is why these two carry the component's first tests. On a page that
 * already distinguished empty from failed, "empty and failed look different"
 * passes whether or not the change works; here it cannot.
 *
 * Every case below pairs the state under test with its sibling, because the
 * claim is about the DIFFERENCE. A test that only asserted "the failed state is
 * visible" would pass against a component that rendered the same thing for all
 * three.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const dead = (route: Route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });

/** What `GET /api/health` actually returns — flat, no `data` envelope. */
const HEALTH_BODY = { status: 'ok', service: 'server', checks: { database: 'connected' } };

const MESSAGE = {
  ID: 1,
  Content: 'first post',
  SenderID: 1,
  SentAt: '2026-09-01T10:00:00Z',
};

async function board(page: Page, opts: { messages: 'some' | 'none' | 'fail' }): Promise<void> {
  await seedTrustedSession(page);
  await page.route('**/api/data_models/users', json({ items: [{ ID: 1, username: 'someone', display_name: 'Someone' }] }));
  await page.route('**/api/data_models/message', (route) => {
    if (opts.messages === 'fail') return dead(route);
    return json({ items: opts.messages === 'some' ? [MESSAGE] : [] })(route);
  });
  await page.goto('/member/shared/message-board');
  await dismissMobileSidebarIfPresent(page);
}

test.describe('#5302 message board read states', () => {
  test('a failed read and an empty board do not look the same', async ({ page }) => {
    // The defect, stated as a test. Both used to render an empty rectangle.
    await board(page, { messages: 'fail' });
    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    await expect(page.getByTestId('read-state-empty')).toHaveCount(0);

    await board(page, { messages: 'none' });
    await expect(page.getByTestId('read-state-empty')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });

  test('a board with messages renders the messages and no state at all', async ({ page }) => {
    // The control for both cases above: with data, neither state appears, so a
    // component that rendered its states unconditionally would fail here.
    await board(page, { messages: 'some' });
    await expect(page.getByText('first post')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
    await expect(page.getByTestId('read-state-empty')).toHaveCount(0);
  });

  test('the failed state says what failed and what still works, in the product voice', async ({
    page,
  }) => {
    await board(page, { messages: 'fail' });
    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toContainText('The message board did not load');
    await expect(page.getByTestId('read-state-still-works')).toContainText('You can still post');

    // The whole point of the grammar: no transport detail on the page. Asserted
    // against the page body, not against the component, because a leak can
    // arrive from anywhere on the route.
    await expect(page.locator('body')).not.toContainText('status code');
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('the failed state offers a retry that actually re-reads', async ({ page }) => {
    await seedTrustedSession(page);
    await page.route('**/api/data_models/users', json({ items: [] }));
    let attempts = 0;
    await page.route('**/api/data_models/message', (route) => {
      attempts += 1;
      // Fail once, then succeed — so the retry has something to prove.
      if (attempts === 1) return dead(route);
      return json({ items: [MESSAGE] })(route);
    });
    await page.goto('/member/shared/message-board');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    await page.getByTestId('read-state-retry').click();
    await expect(page.getByText('first post')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

test.describe('#5302 system health read states', () => {
  const HEALTH_ROUTES = [
    '**/api/health',
    '**/api/system/containers',
    '**/api/system/disk',
    '**/api/system/db-stats',
  ];

  test('every endpoint down renders a failure, not an empty page', async ({ page }) => {
    // Before this the page rendered its heading, its Refresh button and nothing
    // — which is also what a page with no data looks like.
    await seedAdminSession(page);
    for (const r of HEALTH_ROUTES) await page.route(r, dead);
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('System health did not load');
    await expect(page.getByTestId('read-state-still-works')).toContainText('rest of the admin area');
    await expect(page.locator('body')).not.toContainText('status code');
    await expect(page.locator('body')).not.toContainText('Unexpected error');
  });

  test('control: endpoints answering renders the data and no read state', async ({ page }) => {
    await seedAdminSession(page);
    // The shape the server actually serves, read live 2026-09-06T04:52Z:
    // {"checks":{"database":"connected"},"service":"server","status":"ok"} —
    // flat, no `data` envelope. The old mock wrapped it, which made
    // `this.health` truthy in the test and undefined in production, so the
    // partial-failure case below passed against a response nobody serves
    // (#5312).
    await page.route('**/api/health', json(HEALTH_BODY));
    await page.route('**/api/system/containers', json({ containers: [] }));
    await page.route('**/api/system/disk', json({ disks: [], volumes: [], images: {} }));
    await page.route('**/api/system/db-stats', json({ data: { size_mb: 1 } }));
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByText('OK')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });

  test('a partial failure is not a failure — the page shows what answered', async ({ page }) => {
    // The existing behaviour worth keeping: this page fans out to four
    // endpoints and only a total failure is a failed read. A grammar that
    // blanked the page whenever one endpoint was down would be a regression
    // dressed as a fix.
    await seedAdminSession(page);
    // The shape the server actually serves, read live 2026-09-06T04:52Z:
    // {"checks":{"database":"connected"},"service":"server","status":"ok"} —
    // flat, no `data` envelope. The old mock wrapped it, which made
    // `this.health` truthy in the test and undefined in production, so the
    // partial-failure case below passed against a response nobody serves
    // (#5312).
    await page.route('**/api/health', json(HEALTH_BODY));
    await page.route('**/api/system/containers', dead);
    await page.route('**/api/system/disk', dead);
    await page.route('**/api/system/db-stats', dead);
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByText('OK')).toBeVisible();
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

/**
 * The defect the §3.90 frames caught and the assertions above did not.
 *
 * `.messages-container` paints `--surface-card`, which is dark in BOTH themes,
 * and set no ink. Nothing noticed while its only children were message rows
 * carrying their own colours — but the moment a read state mounted inside it,
 * the heading measured rgb(66,66,66) on rgb(66,66,66): 1.00:1, present in the
 * DOM and invisible on screen. Every `toContainText` above passed.
 *
 * So the assertion has to be a RATIO, not a token name and not the presence of
 * text. A ratio is the only form of this claim that a future re-theme cannot
 * quietly break.
 */
const AA_TEXT = 4.5;

test.describe('#5302 read-state ink pairs with the surface it lands on', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the failed state is legible inside the message board's dark card — ${theme}`, async ({
      page,
    }) => {
      // Seed the session FIRST and make this script throw-proof. On webkit the
      // unguarded `document.documentElement.setAttribute` in an init script
      // threw before `seedTrustedSession`'s own init script had run, so the
      // router guard saw no role and redirected to `/` — the locator below then
      // reported "element(s) not found" on a page that was never the one under
      // test. Chromium passed throughout, which is the whole reason the suite
      // runs two engines.
      await board(page, { messages: 'fail' });
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t);
        } catch {}
        document.documentElement?.setAttribute('data-theme', t);
      }, theme);
      await page.reload();
      await dismissMobileSidebarIfPresent(page);
      await expect(page.getByTestId('read-state-failed')).toBeVisible();

      const heading = page.getByTestId('read-state-failed').locator('.empty-state__heading, h2, h3').first();
      await expect(heading).toBeVisible();

      const ratio = await heading.evaluate((el) => {
        const parse = (s: string) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
        const lum = (rgb: number[]) => {
          const f = (v: number) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
        };
        // Walk up for the first ancestor that actually paints a background.
        let bg = 'rgba(0, 0, 0, 0)';
        for (let n: Element | null = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
            bg = c;
            break;
          }
        }
        const a = lum(parse(getComputedStyle(el).color));
        const b = lum(parse(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });

      expect(ratio, `failed-state heading ink vs its surface in ${theme}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  }
});

/**
 * #5303 (#5278-B1) — the renders that showed the WRONG state.
 *
 * Two of the four the finding named turned out not to be read states at all,
 * and are covered here as the boundary rather than as adoptions. See the task
 * comment; the short version is that `/applications/constellations` shows a
 * DEGRADATION banner above content that still works, and `/profile`'s error
 * line is an inline notice shared with its save and upload actions. Replacing
 * either page's content with a failed state would take away the thing the
 * message says still works.
 */
test.describe('#5303 pushups', () => {
  const seed = async (page: Page, ok: boolean) => {
    await seedTrustedSession(page);
    await page.addInitScript(() => localStorage.setItem('user_name', 'robert'));
    await page.route('**/api/pushups/entries', (route) =>
      ok ? json({ entries: [] })(route) : dead(route),
    );
    await page.route('**/api/pushups/milestones', (route) =>
      ok ? json({ milestones: [] })(route) : dead(route),
    );
    await page.goto('/member/personal/pappas-pushups');
    await dismissMobileSidebarIfPresent(page);
  };

  test('a load failure speaks Swedish, not axios', async ({ page }) => {
    await seed(page, false);
    const failed = page.getByTestId('read-state-failed');
    await expect(failed).toBeVisible();
    // This page's copy is Swedish and stays Swedish. A shared component that
    // Anglicised one page's failure would be a regression wearing a fix's
    // clothes, which is why the component takes the words rather than owning
    // them.
    await expect(failed).toContainText('Utmaningen kunde inte laddas');
    await expect(page.getByTestId('read-state-retry')).toHaveText('Försök igen');
    await expect(page.locator('body')).not.toContainText('status code');
    await expect(page.locator('body')).not.toContainText('Kunde inte hämta data');
  });

  test('control: entries answering renders the challenge and no read state', async ({ page }) => {
    await seed(page, true);
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

test.describe('#5303 goals', () => {
  const seed = async (page: Page, ok: boolean) => {
    await seedTrustedSession(page);
    await page.route('**/api/goals/trees', (route) =>
      ok ? json({ trees: [] })(route) : dead(route),
    );
    await page.goto('/member/shared/goals');
    await dismissMobileSidebarIfPresent(page);
  };

  test('a load failure drops the transport prefix', async ({ page }) => {
    await seed(page, false);
    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    // The exact string that used to be the page body.
    await expect(page.locator('body')).not.toContainText('Failed to load trees');
    await expect(page.locator('body')).not.toContainText('status code');
  });

  test('control: trees answering renders the list and no read state', async ({ page }) => {
    await seed(page, true);
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

test.describe('#5303 profile keeps its inline notice and gains a skeleton', () => {
  test('the load state is a skeleton, and the inline error line is untouched', async ({ page }) => {
    await seedTrustedSession(page);
    // Hold the profile read open so the loading state is observable rather
    // than a frame nobody sees.
    let release: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/profile', async (route) => {
      await held;
      return json({ data: { username: 'someone', display_name: 'Someone' } })(route);
    });
    await page.goto('/profile');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('read-state-loading')).toBeVisible();
    release!();
    await expect(page.getByTestId('read-state-loading')).toHaveCount(0);
    // The inline notice is not a read state and must not have become one.
    await expect(page.getByTestId('read-state-failed')).toHaveCount(0);
  });
});

/**
 * #5312 — system health's `empty` state must not wear the `failed` state's words.
 *
 * Filed by the #5305 validation gate against #5278. It is the one `ReadState`
 * call site where a variable `:state` met a fixed `heading`/`message`, so an
 * empty read said "System health did not load" under an empty-state icon. Every
 * other page pins its state to a literal, which is why static copy is right
 * there and was wrong only here.
 *
 * The state is reachable in this page's most likely real failure — server up,
 * monitor sidecar down — so the cases below drive it the way production does
 * rather than by forcing the branch.
 */
test.describe('#5312 system health tells empty and failed apart', () => {
  const SYSTEM = ['**/api/system/containers', '**/api/system/disk', '**/api/system/db-stats'];

  const load = async (page: Page, health: 'ok' | 'dead') => {
    await seedAdminSession(page);
    await page.route('**/api/health', (route) =>
      health === 'ok' ? json(HEALTH_BODY)(route) : dead(route),
    );
    // Answering with nothing, not failing: this is the sidecar-up-but-empty
    // shape, which is what makes `empty` reachable at all.
    for (const r of SYSTEM) await page.route(r, json({ containers: [], disks: [], volumes: [], data: null }));
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);
  };

  test('an empty read says empty things, and specifically NOT the failure words', async ({
    page,
  }) => {
    await load(page, 'ok');
    // The assertion is the DIFFERENCE, because the bug was the two states
    // sharing one sentence. Naming only what empty should say would have
    // passed against the broken build too, since the failure copy is also a
    // string that renders.
    const body = page.locator('body');
    await expect(body).not.toContainText('System health did not load');
    await expect(body).not.toContainText('None of the system endpoints answered');
    await expect(body).not.toContainText('rest of the admin area is unaffected');
  });

  test('a total failure still says the failure words', async ({ page }) => {
    // The other half of the same claim: the failed copy must not have been
    // deleted while separating them.
    await seedAdminSession(page);
    await page.route('**/api/health', dead);
    for (const r of SYSTEM) await page.route(r, dead);
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByTestId('read-state-failed')).toBeVisible();
    await expect(page.locator('body')).toContainText('System health did not load');
  });

  test('the banner renders from the shape the server actually serves', async ({ page }) => {
    // It never rendered in production: the page read `.data.data` while
    // `/health` serves a flat body, so `health` was undefined and the whole
    // `v-if="health"` block was silently absent.
    await seedAdminSession(page);
    await page.route('**/api/health', json(HEALTH_BODY));
    for (const r of SYSTEM) await page.route(r, json({ containers: [], disks: [], volumes: [] }));
    await page.goto('/admin/system-health');
    await dismissMobileSidebarIfPresent(page);

    await expect(page.getByText('OK', { exact: true })).toBeVisible();
    await expect(page.locator('body')).toContainText('database');
    await expect(page.locator('body')).toContainText('connected');
    // And nothing invents values the endpoint does not send.
    await expect(page.locator('body')).not.toContainText('undefined');
  });
});
