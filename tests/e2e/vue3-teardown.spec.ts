import { test, expect, type Page } from '@playwright/test';
import { seedViewerSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #5324 — four views declared `beforeDestroy`, the Vue 2 hook name. Vue 3 (this
 * app is vue ^3.4.21) never calls it, so those bodies had never run.
 *
 * Two of them held teardown that MUST run and did not, and this file pins that
 * it now does. The other two held `AssetManager.releaseAsset` calls that must
 * NOT run — the cache is a flat, un-refcounted, process-wide hash -> objectURL
 * map, so a per-view release revokes URLs other mounted components still hold
 * (#5330 measures exactly that happening via HomeView). Those hooks were
 * deleted rather than renamed, which is a runtime no-op because they never
 * fired; there is nothing behavioural to assert for them, and asserting the
 * absence of a source string is a job for grep, not for a browser.
 *
 * So what is pinned here is GameWordWeaver's three effects, each separately,
 * because the whole body is untested by construction — it has never executed:
 *
 *   1. the setInterval game tick stops
 *   2. the window keydown listener is removed
 *   3. the background music is paused
 *
 * Each assertion must FAIL against origin/main. A test written for a hook that
 * never ran is worthless if it passes either way, so the negative control is
 * part of the deliverable, not a nicety.
 *
 * WordWeaver pulls audio from /api/fetch-object/* and scores from
 * /api/games/scores; nothing is served in preview, so both are mocked the way
 * the rest of the suite does it.
 */

async function installWordWeaverMocks(page: Page): Promise<void> {
  // Catch-all FIRST — Playwright's LAST matching route wins, so the specific
  // handlers below override it.
  //
  // This must answer 404 and NEVER 401. vite.config.js proxies /api to the real
  // server, so an unmocked call leaves the preview, comes back 401, and
  // src/main.js's global axios interceptor removes user_name/user_role — after
  // which the router's tier guard bounces the in-app navigation these tests
  // depend on to '/'. Without this route the failure reads as "the sidebar link
  // does not work", which is not what is broken. (Same mechanism as #5330.)
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/fetch-object/'),
    (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(0) })
  );
  await page.route(
    (url) => url.pathname === '/api/games/scores',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      })
  );
}

/**
 * Navigate AWAY from the game the way a person does — an in-app link, which is
 * a router push.
 *
 * NOT `page.goto()`. A goto is a full page load: it tears down the whole JS
 * context, which (a) resets the instrumentation these tests install and (b)
 * never runs a component unmount at all, so every assertion below would pass
 * against broken code. The sidebar rail carries the link at desktop widths;
 * at mobile widths it is behind the hamburger and the specs skip instead, since
 * lifecycle is not a viewport question.
 */
async function leaveViaSpaNavigation(page: Page): Promise<void> {
  await page.locator('.sidebar [href="/applications"]').first().click();
  await expect(page).toHaveURL(/\/applications$/);
}

/** Count live intervals by wrapping the timer API before any app code runs. */
async function instrumentTimers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // @ts-expect-error test-only probe
    window.__liveIntervals = new Set();
    const realSet = window.setInterval.bind(window);
    const realClear = window.clearInterval.bind(window);
    // @ts-expect-error test-only probe
    window.setInterval = (...args) => {
      const id = realSet(...(args as Parameters<typeof setInterval>));
      // @ts-expect-error test-only probe
      window.__liveIntervals.add(id);
      return id;
    };
    // @ts-expect-error test-only probe
    window.clearInterval = (id) => {
      // @ts-expect-error test-only probe
      window.__liveIntervals.delete(id);
      return realClear(id as number);
    };
  });
}

/** Count window keydown listeners the app adds, by name, before app code runs. */
async function instrumentKeydown(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // @ts-expect-error test-only probe
    window.__keydownCount = 0;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    // @ts-expect-error test-only probe
    window.addEventListener = (type, ...rest) => {
      // @ts-expect-error test-only probe
      if (type === 'keydown') window.__keydownCount += 1;
      return add(type, ...(rest as [EventListenerOrEventListenerObject]));
    };
    // @ts-expect-error test-only probe
    window.removeEventListener = (type, ...rest) => {
      // @ts-expect-error test-only probe
      if (type === 'keydown') window.__keydownCount -= 1;
      return remove(type, ...(rest as [EventListenerOrEventListenerObject]));
    };
  });
}

test.describe('#5324 WordWeaver teardown actually runs on unmount', () => {
  test.beforeEach(async ({ page }) => {
    await seedViewerSession(page);
    await installWordWeaverMocks(page);
  });

  test('the game-loop interval is cleared when you navigate away', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'needs the desktop sidebar rail to navigate in-app'
    );
    await instrumentTimers(page);
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('button', { name: 'Start Game' }).click();

    // The tick exists while playing — without this the assertion below could
    // pass because no interval was ever created.
    // @ts-expect-error test-only probe
    await expect.poll(() => page.evaluate(() => window.__liveIntervals.size)).toBeGreaterThan(0);

    await leaveViaSpaNavigation(page);

    await expect
      // @ts-expect-error test-only probe
      .poll(() => page.evaluate(() => window.__liveIntervals.size), {
        message: 'the game tick keeps running after the component is gone',
      })
      .toBe(0);
  });

  test('the window keydown listener is removed when you navigate away', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'needs the desktop sidebar rail to navigate in-app'
    );
    await instrumentKeydown(page);
    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);

    // @ts-expect-error test-only probe
    const whileMounted = await page.evaluate(() => window.__keydownCount);
    expect(whileMounted, 'the view registers a keydown listener').toBeGreaterThan(0);

    await leaveViaSpaNavigation(page);

    // @ts-expect-error test-only probe
    const afterLeaving = await page.evaluate(() => window.__keydownCount);
    expect(afterLeaving, 'the listener outlived the component').toBeLessThan(whileMounted);
  });

  test('the background music is paused when you navigate away', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'needs the desktop sidebar rail to navigate in-app'
    );

    // Spy on pause() rather than requiring real playback: autoplay policy
    // differs across browsers and an unstarted <audio> would make the
    // assertion vacuous (it is already paused, so "is it paused?" passes
    // against broken code). What teardown owes is the CALL.
    await page.addInitScript(() => {
      // @ts-expect-error test-only probe
      window.__pauseCalls = 0;
      const real = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function patched(...args) {
        // @ts-expect-error test-only probe
        window.__pauseCalls += 1;
        return real.apply(this, args);
      };
    });

    await page.goto('/games/wordweaver');
    await dismissMobileSidebarIfPresent(page);
    await page.getByRole('button', { name: 'Start Game' }).click();
    // Three <audio> elements ship on this view (bg music + two effects); the
    // background track is the looping one, which is what teardown pauses.
    await expect(page.locator('audio[loop]')).toBeAttached();

    // Baseline immediately before leaving, so only teardown's call is counted
    // — the game-over path calls pause() too and must not be mistaken for it.
    // @ts-expect-error test-only probe
    const before = await page.evaluate(() => window.__pauseCalls);

    await leaveViaSpaNavigation(page);

    // @ts-expect-error test-only probe
    const after = await page.evaluate(() => window.__pauseCalls);
    expect(after, 'unmount did not pause the background music').toBeGreaterThan(before);
  });
});
