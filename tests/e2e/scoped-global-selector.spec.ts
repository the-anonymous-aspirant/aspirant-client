import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * system_3 #11455. In a scoped `<style>`, Vue replaces a whole selector that
 * contains `:global(…)` with the part inside the parentheses. So
 * `:global([data-theme='dark']) .legend .swatch` compiles to a bare
 * `[data-theme=dark]` rule: the declaration lands on `<html>` and never on the
 * element the author named. Two views shipped that shape. Browser Flows' dark
 * legend fills never applied, and a meal-log rule put `color-scheme: dark` on
 * `<html>` for every page, which is where the app's dark scrollbars and native
 * controls came from.
 *
 * The guard reads the source, because the built CSS shows only what survived.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return name.endsWith('.vue') ? [full] : [];
  });
}

/** Every selector in `css` that pairs `:global(…)` with more selector, before
 *  or after it. A selector that is `:global(…)` and nothing else is what the
 *  feature is for, and is not reported. */
export function mixedGlobalSelectors(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const whole = /^:global\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)$/;
  const found: string[] = [];
  for (const match of bare.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (!prelude.includes(':global(') || prelude.startsWith('@')) continue;
    // Split the selector list on commas that are not inside parentheses.
    let depth = 0;
    let start = 0;
    const parts: string[] = [];
    for (let i = 0; i < prelude.length; i++) {
      const ch = prelude[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(prelude.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(prelude.slice(start));
    for (const part of parts.map((p) => p.trim())) {
      if (part.includes(':global(') && !whole.test(part)) found.push(part);
    }
  }
  return found;
}

const scopedBlocks = (source: string): string[] =>
  [...source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)].filter((m) => /\bscoped\b/.test(m[1])).map((m) => m[2]);

test.describe('#11455 a scoped :global() selector names nothing but its global part', () => {
  test('the check tells the two shapes apart', () => {
    // The shape that shipped, and its mirror image.
    expect(mixedGlobalSelectors(":global([data-theme='dark']) .legend .swatch { background: red; }")).toEqual([
      ":global([data-theme='dark']) .legend .swatch",
    ]);
    expect(mixedGlobalSelectors('.card :global(.btn) { color: red; }')).toEqual(['.card :global(.btn)']);
    expect(mixedGlobalSelectors('.a, :global(.b) > .c { color: red; }')).toEqual([':global(.b) > .c']);
    // What is allowed: the whole selector global, or no :global() at all.
    expect(mixedGlobalSelectors(':global(.btn .label) { color: red; }')).toEqual([]);
    expect(mixedGlobalSelectors(":global(html[data-theme='dark']), .plain { color: red; }")).toEqual([]);
    expect(mixedGlobalSelectors("[data-theme='dark'] .legend .swatch { background: red; }")).toEqual([]);
    expect(mixedGlobalSelectors('/* :global(.x) .y { } */ .z { color: red; }')).toEqual([]);
  });

  test('no scoped style in src mixes :global() with more selector', () => {
    const files = vueFiles(SRC);
    // Positive control on the walk: it found the app's views, scoped blocks included.
    expect(files.length, 'vue files found').toBeGreaterThan(50);
    let scoped = 0;
    const offenders: string[] = [];
    for (const file of files) {
      for (const block of scopedBlocks(readFileSync(file, 'utf8'))) {
        scoped += 1;
        for (const selector of mixedGlobalSelectors(block)) offenders.push(`${path.relative(SRC, file)}: ${selector}`);
      }
    }
    expect(scoped, 'scoped style blocks read').toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});

// The dark colour scheme is asked for on purpose, on <html>, in src/style.css.
// It used to arrive by the accident above. The value on <html> is the same as
// before in both themes; what changed is that a rule now says so.
test.describe('#11455 the dark theme asks for the dark colour scheme, the light one does not', () => {
  const NOW = new Date('2026-11-14T10:00:00');

  async function openMealLog(page: Page, theme: 'light' | 'dark'): Promise<void> {
    await page.clock.setFixedTime(NOW);
    await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
    await page.route(/\/api\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"not_found","message":"not stubbed"}}' }));
    await page.route(/\/api\/data_models\/ludde_feeding_times$/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ ID: 1, timestamp: new Date('2026-11-14T06:15:00').toISOString(), comment: '' }] }) }));
    await seedTrustedSessionAs(page, 'jenny');
    await page.goto('/member/personal/ludde-analytics');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('.datetime-input')).toBeVisible();
  }

  const schemes = (page: Page) =>
    page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      html: getComputedStyle(document.documentElement).colorScheme,
      input: getComputedStyle(document.querySelector('.datetime-input')!).colorScheme,
    }));

  test('dark: <html> and the meal log\'s date input compute color-scheme dark', async ({ page }) => {
    await openMealLog(page, 'dark');
    expect(await schemes(page)).toEqual({ theme: 'dark', html: 'dark', input: 'dark' });
  });

  test('light: neither does', async ({ page }) => {
    await openMealLog(page, 'light');
    expect(await schemes(page)).toEqual({ theme: 'light', html: 'normal', input: 'normal' });
  });
});
