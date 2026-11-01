import { test, expect, type Page } from '@playwright/test';

/**
 * #9193 (§3.121, §3.120, §1.3) — the public route title sits on one step, and
 * the nav labels sit on one step in every state. Measured on the served site
 * (#9105 b3_raw.json): titles ran 19.2 / 28.8 / 40 / 64 px by route, and the
 * active nav label jumped 17.6 -> 22.4 px (its row 79 -> 88 px) in white
 * while the inactive items were amber, inverting §1.3. Logs a HEAD line per
 * route and a NAV line per active route so a capture states which code it
 * measured.
 */

const ROUTES = [
  '/',
  '/login',
  '/verify-email',
  '/reset-password',
  '/signup',
  '/forgot-password',
  '/support',
  '/no-such-page',
];

async function open(page: Page, path: string, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/signup/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signup_enabled: true }) }),
  );
  await page.goto(path);
  await page.locator('.fade-in h1').first().waitFor();
  await page.waitForTimeout(300);
}

/** A token's computed colour, read through a probe element. */
function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const el = document.createElement('div');
    el.style.color = `var(${n})`;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, name);
}

interface NavRow {
  label: string;
  active: boolean;
  size: string;
  color: string;
  height: number;
  cue: string;
  ratio: number;
}

function navRows(page: Page): Promise<NavRow[]> {
  return page.evaluate(() => {
    const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ground = getComputedStyle(document.querySelector('.sidebar')!).backgroundColor;
    return Array.from(document.querySelectorAll<HTMLElement>('.nav-links a')).map((a) => {
      const span = a.querySelector('span') as HTMLElement;
      const cs = getComputedStyle(span);
      const l1 = lum(rgb(cs.color));
      const l2 = lum(rgb(ground));
      const acs = getComputedStyle(a);
      return {
        label: span.textContent!.trim(),
        active: a.classList.contains('active'),
        size: cs.fontSize,
        color: cs.color,
        height: Math.round(a.getBoundingClientRect().height * 10) / 10,
        cue: `${acs.boxShadow}|${acs.borderLeftWidth} ${acs.borderLeftStyle}`,
        ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
      };
    });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9193 heading and nav steps (${theme})`, () => {
    test('every public route title computes to --text-xl', async ({ page }, info) => {
      test.setTimeout(120_000);
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      for (const path of ROUTES) {
        await open(page, path, theme);
        const size = await page.locator('.fade-in h1').first().evaluate((h) => getComputedStyle(h).fontSize);
        console.log(`HEAD ${info.project.name} ${theme} ${path} h1=${size}`);
        expect(parseFloat(size), `${path} title`).toBeCloseTo(22.4, 2);
      }
    });

    test('nav labels: one size in every state; active amber with a non-colour cue; inactive on-dark ink', async ({
      page,
    }, info) => {
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      for (const path of ['/', '/support']) {
        await open(page, path, theme);
        if (phone) {
          await page.locator('.mobile-menu-toggle').click();
          await page.locator('.sidebar.show').waitFor();
          await page.waitForTimeout(400);
        }
        const amber = await token(page, '--brand-primary');
        const ink = await token(page, '--text-on-dark');
        const rows = await navRows(page);
        console.log(
          `NAV ${info.project.name} ${theme} ${path} ` +
            rows.map((r) => `${r.label}${r.active ? '*' : ''}:${r.size}/${r.height}/${r.color}/${r.ratio}`).join(' '),
        );
        const active = rows.filter((r) => r.active);
        const inactive = rows.filter((r) => !r.active);
        expect(active, `${path} has one active item`).toHaveLength(1);
        // WebKit reports 16.799999px for the same step.
        for (const r of rows) expect(parseFloat(r.size), `${r.label} label size`).toBeCloseTo(16.8, 2);
        for (const r of inactive) expect(r.height, `${r.label} row height`).toBe(active[0].height);
        expect(active[0].color, 'active label is amber').toBe(amber);
        expect(active[0].cue, 'active item carries a non-colour cue').toMatch(/3px 0px 0px 0px inset/);
        for (const r of inactive) {
          expect(r.color, `${r.label} inactive ink`).toBe(ink);
          expect(r.cue, `${r.label} has no active cue`).not.toMatch(/inset/);
          expect(r.ratio, `${r.label} contrast on the sidebar`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  });
}
