import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers #9196 (§3.121, §1.1, §1.3, §1.5): the 404 page speaks English, and
 *  its action and /support's donate action are the primary AspButton rendered
 *  as the links they are (DS #9246) — one fill, radius and height with every
 *  other primary action, where they were a Material-blue 48px link-button and
 *  a 53px amber pill. */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

async function open(page: Page, url: string, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto(url);
  await dismissMobileSidebarIfPresent(page);
}

/** The primary fill and radius as tokens, resolved through a probe. */
function primaryTokens(page: Page) {
  return page.evaluate(() => {
    const p = document.createElement('div');
    p.style.cssText = 'background: var(--brand-primary); border-radius: var(--radius-md)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p);
    const out = { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
    p.remove();
    return out;
  });
}

const box = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      bg: cs.backgroundColor,
      radius: cs.borderTopLeftRadius,
      height: el.getBoundingClientRect().height.toFixed(2),
      underline: cs.textDecorationLine,
    };
  });

for (const theme of ['light', 'dark'] as const) {
  test.describe(`#9196 primary actions (${theme})`, () => {
    test('the 404 page is in English, and its action is a link home', async ({ page }) => {
      await open(page, '/no-such-page-9196', theme);
      const content = page.locator('.not-found-content');
      await expect(content.locator('h1')).toHaveText('Page not found');
      await expect(content.locator('.not-found-message')).toHaveText('There is nothing at /no-such-page-9196.');
      await expect(content.locator('.not-found-message code')).toHaveText('/no-such-page-9196');
      for (const sv of ['Sidan', 'hittas', 'Tillbaka', 'startsidan']) await expect(content).not.toContainText(sv);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');

      const home = page.getByRole('link', { name: 'Back to the home page' });
      await expect(home).toHaveAttribute('href', '/');
      await home.click();
      await expect(page).toHaveURL(/\/$/);
    });

    test('the 404 and /support actions compute AspButton primary, at the login button height', async ({ page }) => {
      await open(page, '/login', theme);
      const ref = await box(page, '.page .card button[type=submit]');

      await open(page, '/no-such-page-9196', theme);
      const tokens = await primaryTokens(page);
      const home = await box(page, '.not-found-home');

      await open(page, '/support', theme);
      const donate = await box(page, '.bmac-button');
      const link = page.getByRole('link', { name: 'Buy me a coffee' });
      await expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/theaspirant');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

      for (const [name, b] of [['404', home], ['support', donate]] as const) {
        expect(b.tag, name).toBe('A');
        expect(b.bg, name).toBe(tokens.bg);
        expect(b.radius, name).toBe(tokens.radius);
        expect(b.height, name).toBe(ref.height);
        expect(b.underline, name).toBe('none');
      }
    });
  });
}

test('no Material-blue #1976d2 remains in src/', () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/1976d2/i.test(readFileSync(p, 'utf8'))) hits.push(path.relative(SRC, p));
    }
  };
  walk(SRC);
  expect(hits).toEqual([]);
});
