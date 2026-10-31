import { test, expect, type Page } from '@playwright/test';

/**
 * #9192 (§3.121, §3.114) — one page gutter at the root. `#app`'s padding
 * stacked on each view's own, so a phone's first content edge sat anywhere
 * from x = 44 to 64, every short page scrolled 64 px past nothing (the
 * padding sat outside `#myVapp`'s 100vh), and the first heading's y ran from
 * 48 to 203 by route. Asserts the outcome on all 9 public routes: one content
 * edge, one title y, no scroll on a page that fits, nothing centred. Logs a
 * GUTTER line per route and theme so a capture states which code it measured.
 */

const ROUTES = [
  '/',
  '/login',
  '/verify-email',
  '/reset-password',
  '/signup',
  '/forgot-password',
  '/about',
  '/support',
  '/no-such-page',
];

/** Routes whose content fits a 900 px (desktop) and 844 px (phone) window. */
const FITS = ['/login', '/verify-email', '/reset-password', '/signup', '/forgot-password', '/no-such-page'];

async function open(page: Page, path: string, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/signup/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signup_enabled: true }) }),
  );
  await page.goto(path);
  await page.locator('.fade-in h1').first().waitFor();
  // Let the route's fade-in and any image settle before reading geometry.
  await page.waitForTimeout(400);
}

interface Geometry {
  edge: number;
  titleTop: number;
  titleAlign: string;
  scrollHeight: number;
  innerHeight: number;
  centred: string[];
  toggleBottom: number | null;
}

/** The view's first content edge (leftmost in-flow box with size), the first
 *  heading's top, the document's scroll extent, and any in-flow text block
 *  that centres itself. */
function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    // The routed view's root: router-view carries .fade-in (App.vue), and so
    // may other nodes, so take the one holding the route's heading.
    const root = Array.from(document.querySelectorAll<HTMLElement>('.fade-in')).find((e) => e.querySelector('h1'))!;
    const onOwnGround = (el: HTMLElement) => {
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;
      }
      return false;
    };
    let edge = Infinity;
    const centred: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      edge = Math.min(edge, r.left);
      // Page-level text only: a card (any box below the root that paints its
      // own ground) lays out its own interior.
      if (/^H[1-6]$|^P$/.test(el.tagName) && cs.textAlign === 'center' && !onOwnGround(el))
        centred.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }
    const h1 = root.querySelector('h1') as HTMLElement;
    const toggle = document.querySelector('.mobile-menu-toggle') as HTMLElement | null;
    return {
      edge: Math.round(edge * 10) / 10,
      titleTop: Math.round(h1.getBoundingClientRect().top * 10) / 10,
      titleAlign: getComputedStyle(h1).textAlign,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      centred,
      toggleBottom: toggle && toggle.getBoundingClientRect().width > 0 ? Math.round(toggle.getBoundingClientRect().bottom) : null,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9192 one page gutter (${theme})`, () => {
    test('every public route: one content edge, one title y, nothing centred, no phantom scroll', async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      // The spec's windows: 1440x900, and the phone at 390x844 (the iPhone 13
      // project's own viewport is 390x664, the screen less browser chrome).
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      const rows: Array<Geometry & { path: string }> = [];
      for (const path of ROUTES) {
        await open(page, path, theme);
        const g = await measure(page);
        rows.push({ path, ...g });
        console.log(
          `GUTTER ${info.project.name} ${theme} ${path} edge=${g.edge} title=${g.titleTop} ` +
            `scroll=${g.scrollHeight}/${g.innerHeight} toggle=${g.toggleBottom} centred=${g.centred.join(',') || '-'}`,
        );
      }

      const edges = new Set(rows.map((r) => r.edge));
      expect([...edges], 'one first-content edge across routes').toHaveLength(1);
      if (phone) expect(rows[0].edge, 'phone gutter is --space-md').toBe(16);

      const tops = rows.map((r) => r.titleTop);
      expect(Math.max(...tops) - Math.min(...tops), `title tops ${tops.join(', ')}`).toBeLessThanOrEqual(1);
      // The title clears the fixed chrome on a phone (the drawer toggle).
      for (const r of rows) if (r.toggleBottom !== null) expect(r.titleTop, `${r.path} title under the toggle`).toBeGreaterThan(r.toggleBottom);

      for (const r of rows) {
        expect(r.titleAlign, `${r.path} title aligns left`).not.toBe('center');
        expect(r.centred, `${r.path} centred text blocks`).toEqual([]);
      }

      for (const r of rows.filter((x) => FITS.includes(x.path)))
        expect(r.scrollHeight, `${r.path} scrolls past nothing`).toBe(r.innerHeight);
    });
  });
}

test('the sidebar nav stays centred in its column (the #app centring it used to inherit)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, 'the desktop column; the phone drawer is the same component');
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/', 'light');
  const rows = await page.evaluate(() => {
    const col = document.querySelector('.nav-links')!.getBoundingClientRect();
    const mid = (r: DOMRect) => r.left + r.width / 2;
    return Array.from(document.querySelectorAll<HTMLElement>('.nav-links a')).map((a) => {
      // The label span is a flex column as wide as the link, so measure the
      // text run itself; the icon only moves with text-align when it is the
      // loaded <img> (its placeholder is a block).
      const label = a.querySelector('span') as HTMLElement;
      const text = document.createRange();
      text.selectNodeContents(label);
      const icon = a.querySelector('img') as HTMLElement | null;
      return {
        label: label.textContent!.trim(),
        labelOff: Math.round(mid(text.getBoundingClientRect()) - mid(col)),
        iconOff: icon ? Math.round(mid(icon.getBoundingClientRect()) - mid(col)) : 0,
      };
    });
  });
  console.log(`SIDEBAR ${rows.map((r) => `${r.label}:${r.labelOff}/${r.iconOff}`).join(' ')}`);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(Math.abs(r.labelOff), `${r.label} label centred`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.iconOff), `${r.label} icon centred`).toBeLessThanOrEqual(1);
  }
});
