import { test, expect, type Page, type Route, type Request } from '@playwright/test';
import { seedAdminSession } from './helpers/mockBackend';

/** Admin → System health, Containers section (system_3 #10558; design
 *  c65900, security c65887, design_conventions §3.144). Each card carries the
 *  nightly usage rollup's line and, only where /containers says
 *  `controllable: true`, a Stop or Start control. Stop asks first; Start does
 *  not. The status word after a click comes only from a re-read of
 *  /containers. Every /api call is answered here; the clock is Playwright's,
 *  so the 2 s polls and the 30 s window run without waiting. */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Container = { name: string; status: string; controllable?: boolean; disk_mb?: number | null };

const running = (name: string, extra: Partial<Container> = {}) => ({
  name, status: 'running', cpu_percent: 1.5, memory_usage_mb: 120, memory_limit_mb: 512, memory_percent: 23,
  network_rx_mb: 1.5, network_tx_mb: 2.5, uptime: '3 days', disk_mb: 812.4, ...extra,
});
const exited = (name: string, extra: Partial<Container> = {}) => ({
  name, status: 'exited', cpu_percent: 0, memory_usage_mb: 0, memory_limit_mb: 0, memory_percent: 0,
  network_rx_mb: 0, network_tx_mb: 0, uptime: '-', disk_mb: 1310.2, ...extra,
});

const USAGE = {
  as_of: '2026-11-12T03:00:04Z',
  services: [
    { service_name: 'browser', kind: 'container', memory_mb: 120, disk_mb: 812.4, last_used_at: '2026-11-11T00:00:00Z', request_count: 1204, request_count_member: 37 },
    { service_name: 'penpot-frontend', kind: 'container', memory_mb: null, disk_mb: 1310.2, last_used_at: null, request_count: 0, request_count_member: 0 },
    { service_name: 'server', kind: 'container', memory_mb: 80, disk_mb: 40, last_used_at: null, request_count: null, request_count_member: null },
    // A feature row has no container and is never shown, even under a name a container also has.
    { service_name: 'cards', kind: 'feature', memory_mb: null, disk_mb: null, last_used_at: '2026-11-10T00:00:00Z', request_count: 55, request_count_member: null },
  ],
};

type Mock = {
  containers: Container[];
  posts: { url: string; body: string | null }[];
  /** GET /api/system/containers calls answered, so a re-read is observable. */
  reads?: number;
  answer?: (action: string, name: string) => { status: number; body: unknown } | null;
  /** When false, a 202 leaves the status as it was (the monitor is slow). */
  flips: boolean;
};

async function open(page: Page, mock: Mock, usage: unknown = USAGE) {
  await page.clock.install({ time: new Date('2026-11-12T09:00:00Z') });
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/health$/, (route) => json(route, 200, { status: 'ok' }));
  await page.route(/\/api\/system\/containers$/, (route) => {
    mock.reads = (mock.reads ?? 0) + 1;
    return json(route, 200, { containers: mock.containers });
  });
  await page.route(/\/api\/system\/disk$/, (route) => json(route, 200, { disks: [], volumes: [], images: { total_count: 0, total_size_mb: 0 } }));
  await page.route(/\/api\/system\/db-stats$/, (route) => json(route, 404, { error: { code: 'not_found', message: 'none' } }));
  await page.route(/\/api\/system\/service-usage$/, (route) =>
    json(route, 200, { status: 'success', data: usage, message: 'Latest service usage rollup' }));
  await page.route(/\/api\/system\/containers\/[^/]+\/(start|stop)$/, (route, request: Request) => {
    const m = /\/containers\/([^/]+)\/(start|stop)$/.exec(new URL(request.url()).pathname)!;
    const name = decodeURIComponent(m[1]);
    const action = m[2];
    mock.posts.push({ url: new URL(request.url()).pathname, body: request.postData() });
    const refusal = mock.answer?.(action, name);
    if (refusal) return json(route, refusal.status, refusal.body);
    if (mock.flips) {
      mock.containers = mock.containers.map((c) =>
        c.name === name ? (action === 'stop' ? exited(name, { controllable: c.controllable }) : running(name, { controllable: c.controllable })) : c);
    }
    return json(route, 202, { name, action, accepted: true });
  });
  await seedAdminSession(page);
  await page.goto('/admin/system-health');
  await expect(page.locator('.container-card').first()).toBeVisible();
}

const card = (page: Page, name: string) => page.locator(`[data-test="container-${name}"]`);

function fleet(): Container[] {
  return [
    running('aspirant-online-browser-1', { controllable: true }),
    running('aspirant-online-server-1', { controllable: false }),
    exited('aspirant-online-penpot-frontend-1', { controllable: true }),
    // Outside this cell's compose pattern: keeps its raw name, and an older
    // monitor that sends no `controllable` gets no control.
    running('commander-test-pg5907', { disk_mb: null }),
  ];
}

test('each card reads its usage line, image size and readable name; controls only where the server says so', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: true };
  await open(page, mock);

  await expect(page.locator('.container-count')).toHaveText('3 / 4 running');
  await expect(page.locator('[data-test="usage-as-of"]')).toHaveText('Usage as of 12 Nov');
  await expect(page.locator('.section-note')).toHaveText("Services without a Stop button keep the cell running and can't be stopped from here.");

  const browser = card(page, 'aspirant-online-browser-1');
  await expect(browser.locator('.container-name')).toHaveText('browser');
  await expect(browser.locator('[data-test="usage-line"]')).toHaveText('Last used 11 Nov · 1,204 requests in 30 days, 37 by members');
  await expect(browser.locator('[data-test="container-image"]')).toHaveText(/IMAGE\s*812\.4 MB/);
  await expect(browser.locator('[data-test="container-stop"]')).toHaveText('Stop');
  await expect(browser.locator('[data-test="container-start"]')).toHaveCount(0);

  const server = card(page, 'aspirant-online-server-1');
  await expect(server.locator('[data-test="usage-line"]')).toHaveText('No usage signal for this service');
  await expect(server.locator('button')).toHaveCount(0);

  const penpot = card(page, 'aspirant-online-penpot-frontend-1');
  await expect(penpot.locator('.container-name')).toHaveText('penpot-frontend');
  await expect(penpot).toHaveClass(/stopped/);
  await expect(penpot.locator('[data-test="usage-line"]')).toHaveText('No requests in the last 30 days');
  await expect(penpot.locator('[data-test="container-image"]')).toHaveText(/IMAGE\s*1\.3 GB/);
  await expect(penpot.locator('[data-test="container-start"]')).toHaveText('Start');
  // Not dimmed: it carries a usage line and a Start button (c65900, #10594).
  expect(await penpot.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

  const raw = card(page, 'commander-test-pg5907');
  await expect(raw.locator('.container-name')).toHaveText('commander-test-pg5907');
  await expect(raw.locator('[data-test="usage-line"]')).toHaveText('No usage signal for this service');
  await expect(raw.locator('[data-test="container-image"]')).toHaveCount(0);
  await expect(raw.locator('button')).toHaveCount(0);

  // Feature rows never become cards.
  await expect(page.locator('.container-name', { hasText: /^cards$/ })).toHaveCount(0);
  expect(mock.posts).toHaveLength(0);
});

test('before the first nightly run the header says so and no card carries a usage line', async ({ page }) => {
  await open(page, { containers: fleet(), posts: [], flips: true }, { as_of: null, services: [] });
  await expect(page.locator('[data-test="usage-as-of"]')).toHaveText('No usage read yet');
  await expect(page.locator('[data-test="usage-line"]')).toHaveCount(0);
});

test('Stop asks first; Cancel sends nothing; confirming sends one bodyless POST and the status comes from the re-read', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: true };
  await open(page, mock);
  const browser = card(page, 'aspirant-online-browser-1');

  await browser.locator('[data-test="container-stop"]').click();
  const dialog = page.locator('[data-test="stop-confirm"]');
  await expect(dialog).toContainText('browser will be unreachable until you start it again.');
  await expect(dialog).toContainText('It stays stopped until you start it here or until the next deploy.');
  await expect(dialog).toContainText('Last used 11 Nov · 1,204 requests in 30 days, 37 by members');
  await expect(page.locator('[data-test="stop-confirm-button"]')).toHaveText('Stop browser');
  await page.locator('[data-test="stop-cancel"]').click();
  await expect(dialog).toHaveCount(0);
  expect(mock.posts).toHaveLength(0);

  await browser.locator('[data-test="container-stop"]').click();
  await page.locator('[data-test="stop-confirm-button"]').click();
  const stop = browser.locator('[data-test="container-stop"]');
  await expect(stop).toHaveText('Stopping…');
  await expect(stop).toBeDisabled();
  // A second click while in flight sends nothing more.
  await stop.click({ force: true });
  expect(mock.posts).toEqual([{ url: '/api/system/containers/aspirant-online-browser-1/stop', body: null }]);
  // The card still says running until the re-read lands.
  await expect(browser.locator('.container-status')).toHaveText('running');

  await page.clock.runFor(2000);
  await expect(browser.locator('.container-status')).toHaveText('exited');
  await expect(browser.locator('[data-test="container-start"]')).toHaveText('Start');
  await expect(browser.locator('[data-test="container-start"]')).toBeEnabled();
  expect(mock.posts).toHaveLength(1);
});

test('Start needs no confirm and is the undo for Stop', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: true };
  await open(page, mock);
  const penpot = card(page, 'aspirant-online-penpot-frontend-1');
  await penpot.locator('[data-test="container-start"]').click();
  await expect(page.locator('[data-test="stop-confirm"]')).toHaveCount(0);
  await expect(penpot.locator('[data-test="container-start"]')).toHaveText('Starting…');
  expect(mock.posts).toEqual([{ url: '/api/system/containers/aspirant-online-penpot-frontend-1/start', body: null }]);
  await page.clock.runFor(2000);
  await expect(penpot.locator('.container-status')).toHaveText('running');
  await expect(penpot.locator('[data-test="container-stop"]')).toHaveText('Stop');
});

test('a status still unchanged after 30 s says so under the button and re-enables it', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: false };
  await open(page, mock);
  const browser = card(page, 'aspirant-online-browser-1');
  await browser.locator('[data-test="container-stop"]').click();
  await page.locator('[data-test="stop-confirm-button"]').click();
  await expect(browser.locator('[data-test="container-stop"]')).toHaveText('Stopping…');
  await page.clock.runFor(28000);
  await expect(browser.locator('[data-test="control-caption"]')).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(browser.locator('[data-test="control-caption"]')).toHaveText('Stop sent; the monitor still reports running. Refresh to check.');
  await expect(browser.locator('[data-test="container-stop"]')).toHaveText('Stop');
  await expect(browser.locator('[data-test="container-stop"]')).toBeEnabled();
});

// system_3 #10643: the poll after a Stop or Start is for whoever is on the
// page. Leaving it mid-action ends the re-reads; before, they ran on for the
// rest of the 30 s window. The route change is in-app (the Admin tile, then
// Back), so the page's timers survive it and only the flag can stop them.
test('leaving the page mid-action stops the status re-reads', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: false };
  await open(page, mock);
  await page.goto('/admin');
  await page.getByText('System Health', { exact: true }).click();
  const browser = card(page, 'aspirant-online-browser-1');
  await browser.locator('[data-test="container-stop"]').click();
  await page.locator('[data-test="stop-confirm-button"]').click();
  await expect(browser.locator('[data-test="container-stop"]')).toHaveText('Stopping…');
  // Two polls land while the page is open, so the loop is known to be running.
  const before = mock.reads ?? 0;
  await page.clock.runFor(4000);
  await expect.poll(() => mock.reads ?? 0).toBe(before + 2);

  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('.container-card')).toHaveCount(0);
  const left = mock.reads ?? 0;
  // The rest of the 30 s window and well past it: no further read. A poll's
  // GET is answered here only after the browser sends it, so each step of the
  // clock is followed by a request of the test's own: by the time that one is
  // answered, a GET the poll had sent before it has been counted.
  for (let i = 0; i < 3; i += 1) {
    await page.clock.runFor(20000);
    await page.evaluate(() => fetch('/api/health').then((r) => r.status));
  }
  expect(mock.reads ?? 0).toBe(left);
});

const REFUSALS: { name: string; status: number; body: unknown; words: string }[] = [
  { name: 'control_disabled', status: 503, body: { error: { code: 'control_disabled', message: 'x' } }, words: "Start and stop aren't set up on this cell yet." },
  { name: 'not_controllable', status: 403, body: { error: { code: 'not_controllable', message: 'x' } }, words: "This service can't be started or stopped from here." },
  { name: 'not_found', status: 404, body: { error: { code: 'not_found', message: 'x' } }, words: 'No container by that name now. Refresh the page.' },
  { name: 'docker_error', status: 502, body: { error: { code: 'docker_error', message: 'The Docker API refused the stop' } }, words: "The stop didn't go through: Docker refused it." },
  { name: 'monitor unreachable', status: 502, body: { error: { code: 'bad_gateway', message: 'Monitor service unavailable' } }, words: "The stop didn't go through: the monitor didn't answer." },
  { name: 'monitor_auth_failed', status: 502, body: { error: { code: 'monitor_auth_failed', message: 'x' } }, words: "The monitor refused the server's credentials." },
];

for (const r of REFUSALS) {
  test(`a refused stop (${r.name}) says so in words on the card, never the raw message`, async ({ page }) => {
    const mock: Mock = { containers: fleet(), posts: [], flips: true, answer: () => ({ status: r.status, body: r.body }) };
    await open(page, mock);
    const browser = card(page, 'aspirant-online-browser-1');
    await browser.locator('[data-test="container-stop"]').click();
    const readsBefore = mock.reads ?? 0;
    await page.locator('[data-test="stop-confirm-button"]').click();
    const alert = browser.locator('[data-test="control-error"]');
    await expect(alert).toHaveText(r.words);
    // The error is followed by a re-read, so the status word is current (§3.144 D5).
    await expect.poll(() => mock.reads ?? 0).toBeGreaterThan(readsBefore);
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(browser).not.toContainText('The Docker API refused the stop');
    await expect(browser.locator('[data-test="container-stop"]')).toBeEnabled();
    await expect(browser.locator('.container-status')).toHaveText('running');
  });
}

test('a stop the network drops says the monitor did not answer', async ({ page }) => {
  const mock: Mock = { containers: fleet(), posts: [], flips: true };
  await open(page, mock);
  await page.route(/\/api\/system\/containers\/[^/]+\/stop$/, (route) => route.abort('failed'));
  const browser = card(page, 'aspirant-online-browser-1');
  await browser.locator('[data-test="container-stop"]').click();
  await page.locator('[data-test="stop-confirm-button"]').click();
  await expect(browser.locator('[data-test="control-error"]')).toHaveText("The stop didn't go through: the monitor didn't answer.");
});

test('below 640px the control takes the full card width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { containers: fleet(), posts: [], flips: true });
  const browser = card(page, 'aspirant-online-browser-1');
  const button = await browser.locator('[data-test="container-stop"]').boundingBox();
  const content = await browser.locator('.container-control').boundingBox();
  expect(Math.abs(button!.width - content!.width)).toBeLessThan(1);
  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
