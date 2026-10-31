import { test, expect, type Page, type Route } from '@playwright/test';

/** Covers #9195 (§1.2, §1.5, §3.121): the five auth routes put their form on
 *  the signature dark AspCard (#424242 light, #2a2a2a dark) under the route
 *  title, and every text inside the card, in each state the route can show,
 *  clears 4.5:1 against what is actually behind it. The ratio is measured, not read off a token:
 *  each text element's ink is composited over the first painted backgrounds
 *  up its ancestor chain, so a tint (the session notice) or a fill (the
 *  submit button) is what it is measured on. */

const CARD = { light: 'rgb(66, 66, 66)', dark: 'rgb(42, 42, 42)' } as const;

interface Scenario {
  name: string;
  path: string;
  /** The element that proves the state is showing. */
  ready: string;
  act?: (page: Page) => Promise<void>;
  routes?: (page: Page) => Promise<void>;
}

const json = (status: number, body: unknown) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const SCENARIOS: Scenario[] = [
  { name: 'login', path: '/login', ready: 'input[name=username]' },
  { name: 'login, session expired', path: '/login?expired=1', ready: '.session-expired-notice' },
  {
    name: 'login, rejected',
    path: '/login',
    ready: '.error-message',
    routes: (page) => page.route('**/api/login', json(401, { error: { message: 'That username and password did not match.' } })),
    act: async (page) => {
      await page.locator('.card input[name=username]').fill('someone');
      await page.locator('.card input[name=password]').fill('wrong');
      await page.locator('.card button[type=submit]').click();
    },
  },
  { name: 'forgot', path: '/forgot-password', ready: 'input[name=email]' },
  {
    name: 'forgot, rejected',
    path: '/forgot-password',
    ready: '[data-testid=forgot-error]',
    routes: (page) => page.route('**/api/password/forgot', json(400, { error: { message: 'Enter a valid address.' } })),
    act: async (page) => {
      await page.locator('.card input[name=email]').fill('a@b.c');
      await page.locator('.card [data-testid=forgot-submit]').click();
    },
  },
  {
    name: 'forgot, sent',
    path: '/forgot-password',
    ready: '[data-testid=forgot-done]',
    routes: (page) => page.route('**/api/password/forgot', json(200, { message: 'If that address has an account, a reset link is on its way.' })),
    act: async (page) => {
      await page.locator('.card input[name=email]').fill('a@b.c');
      await page.locator('.card [data-testid=forgot-submit]').click();
    },
  },
  { name: 'reset, no token', path: '/reset-password', ready: '.message--error' },
  { name: 'reset', path: '/reset-password?token=t', ready: 'input[name=new-password]' },
  { name: 'verify, no token', path: '/verify-email', ready: '.message--error' },
  { name: 'verify', path: '/verify-email?token=t', ready: '.lede' },
  {
    name: 'signup, closed',
    path: '/signup',
    ready: '[data-testid=signup-closed]',
    routes: (page) => page.route('**/api/signup/status', json(200, { signup_enabled: false })),
  },
  {
    name: 'signup, status unknown',
    path: '/signup',
    ready: '[data-testid=signup-status-unknown]',
    routes: (page) => page.route('**/api/signup/status', json(500, {})),
  },
  {
    name: 'signup, rejected',
    path: '/signup',
    ready: '[data-testid=signup-error]',
    routes: (page) => page.route('**/api/signup/status', json(200, { signup_enabled: true })),
    act: async (page) => {
      await page.locator('.card input[name=username]').fill('someone');
      await page.locator('.card input[name=email]').fill('a@b.c');
      await page.locator('.card input[name=new-password]').fill('x');
      await page.locator('.card [data-testid=signup-submit]').click();
    },
  },
];

/** Every visible element with its own text inside the card, with the measured
 *  ratio of its ink to what is painted behind it. */
function measure(page: Page) {
  return page.locator('.page .card').first().evaluate((card) => {
    const parse = (c: string): number[] | null => {
      let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      m = c.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
      if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
      return null;
    };
    const over = (top: number[], under: number[]) =>
      [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const behind = (el: Element): number[] => {
      const layers: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] === 1) break;
        }
      }
      return layers.reverse().reduce((acc, l) => over(l, acc), [255, 255, 255, 1]);
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const out: { text: string; ratio: number }[] = [];
    for (const el of Array.from(card.querySelectorAll('*'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent!.trim())
        .join(' ')
        .trim();
      const box = (el as HTMLElement).getBoundingClientRect();
      if (!own || box.width === 0 || box.height === 0) continue;
      const bg = behind(el);
      const ink = over(parse(getComputedStyle(el).color)!, bg);
      const [a, b] = [lum(ink), lum(bg)];
      out.push({ text: own.slice(0, 40), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
    }
    return out;
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9195 auth cards, ${theme}`, () => {
    for (const s of SCENARIOS) {
      test(`${s.name}: on the dark AspCard, every text clears 4.5:1`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
        await s.routes?.(page);
        await page.goto(s.path);
        await s.act?.(page);
        await expect(page.locator(s.ready).first()).toBeVisible();
        // Measure at rest: a click leaves the pointer over the submit button,
        // and AspButton's hover is the design system's own pair, mid-transition
        // for 150ms (#9237).
        await page.mouse.move(0, 0);
        await page.waitForTimeout(300);

        const card = page.locator('.page .card');
        await expect(card).toHaveCount(1);
        await expect(card).toHaveCSS('background-color', CARD[theme]);
        // The route title stays the page's h1 above the card (#9193, #9192).
        await expect(card.locator('h1')).toHaveCount(0);
        await expect(page.locator('.page > h1')).toHaveCount(1);
        await expect(card.locator(s.ready).first()).toBeVisible();

        const texts = await measure(page);
        expect(texts.length).toBeGreaterThan(0);
        const low = texts.filter((t) => t.ratio < 4.5).map((t) => `${t.text} ${t.ratio.toFixed(2)}`);
        expect(low, texts.map((t) => `${t.text} ${t.ratio.toFixed(2)}`).join(' | ')).toEqual([]);
      });
    }
  });
}

test('the sidebar mount of the form stays a bare block, not a card', async ({ page }) => {
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/support');
  const toggle = page.locator('.mobile-menu-toggle');
  if (await toggle.isVisible()) await toggle.click();
  const form = page.locator('.sidebar .login-card');
  await expect(form).toBeVisible();
  await expect(page.locator('.sidebar .card')).toHaveCount(0);
});
