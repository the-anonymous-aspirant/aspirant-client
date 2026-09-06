import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * system_3 #5304 (#5278-B2) — no axios error reaches a person.
 *
 * #5302 built the read-state grammar and #5303 adopted it on the audited
 * renders. This is the part that keeps the class closed: a static check over
 * `src/` that fails when a transport string is wired back into something
 * somebody reads.
 *
 * # The rule, and why it is this one
 *
 * `err.response?.data?.error?.message` — the API's OWN structured message — is
 * product prose written by us, and it stays. `err.message` — axios's — is the
 * leak. So the invariant is "no `err.message` reaches a render", not "no error
 * text is ever shown"; the second reading would have deleted four legitimate
 * server messages while I was fixing this.
 *
 * # Why a static check and not a runtime one
 *
 * `ReadState` warns in dev when a transport-shaped string arrives as its
 * `message` prop, which catches a string that flows through the component. It
 * cannot see a page that renders one directly, and this cannot see a string
 * assembled at runtime. Two doors, two checks; either alone leaves one open.
 *
 * # What makes this trustworthy
 *
 * A green static check that has never been seen red is not evidence. The
 * detector is therefore exported as a pure function and exercised against
 * known-bad and known-good snippets in the same file, so its ability to FAIL is
 * asserted on every run rather than demonstrated once by hand at review time.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'src');

/**
 * Files where a transport string is deliberately allowed to reach a person.
 *
 * Empty, and that is a finding rather than an aspiration: all 39 sites in `src`
 * at the time of writing flowed to something a person reads, and none of them
 * had a reason to. An entry here is a visible edit with a reason attached, not
 * a silent gap.
 */
const ALLOW: Array<{ file: string; line: number; why: string }> = [
  {
    file: 'src/components/sidebar/Login.vue',
    line: 159,
    why:
      'This file uses `fetch`, not axios, and throws its own Error with product ' +
      'prose for a rejected sign-in — `err.rejected` marks that arm. The message ' +
      'read there is ours or the API\'s, never a transport string; the network ' +
      'arm beside it gets its own sentence. The detector cannot tell a ' +
      'hand-thrown Error from a transport one, which is exactly why an entry ' +
      'here is a visible edit with a reason rather than a silent skip.',
  },
];

/** Strip comment context so the check counts code, not prose about code. */
export function stripComments(source: string): string {
  return (
    source
      // <!-- ... --> in the template
      .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
      // /* ... */ anywhere
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      // // ... to end of line. Deliberately naive about `//` inside a string:
      // a URL literal loses its tail, which can only ever cause a MISSED
      // violation on that line, never a false one — and the two-check design
      // above is what covers the miss.
      .replace(/\/\/[^\n]*/g, '')
  );
}

/**
 * `err.message` and its spellings, on something that looks like a caught error.
 *
 * The lookbehind is load-bearing and the positive control below is what found
 * it: without it, `err.response?.data?.error?.message` matches on its own
 * `error?.message` tail, and the check would have demanded the deletion of
 * exactly the API messages this rule exists to keep. The identifier has to be
 * a bare one — the head of an expression — not a property in a chain.
 */
const TRANSPORT = /(?<![.\w$])(?:err|error|e)\s*\??\.\s*message\b/;

/** A line that only logs is fine — a transport string in the console helps. */
const LOG_ONLY = /console\s*\.\s*\w+\s*\(/;

export function violations(source: string, file = '<inline>'): string[] {
  const out: string[] = [];
  stripComments(source)
    .split('\n')
    .forEach((line, i) => {
      if (!TRANSPORT.test(line)) return;
      if (LOG_ONLY.test(line)) return;
      if (ALLOW.some((a) => a.file === file && a.line === i + 1)) return;
      out.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(vue|js|ts)$/.test(entry) ? [full] : [];
  });
}

test.describe('#5304 no axios error reaches a person', () => {
  test('the detector fails on a transport string and passes clean code', () => {
    // The positive control, run every time rather than demonstrated once. If
    // the detector stops detecting — a regex edit, a strip-comments change —
    // this goes red before the repo scan below can go quietly green.
    const bad = [
      `this.error = err.message;`,
      `this.error = 'Failed: ' + (err.response?.data?.error?.message || err.message);`,
      `error.value = e?.message ?? 'x';`,
      `alert('Upload failed: ' + error.message);`,
    ];
    for (const snippet of bad) {
      expect(violations(snippet), `should be flagged: ${snippet}`).toHaveLength(1);
    }

    const good = [
      // The API's own message — product prose, and the thing this must not eat.
      `this.error = err.response?.data?.error?.message || 'That did not save.';`,
      // Logging is where a transport string belongs.
      `console.error('Goals: could not load trees', err);`,
      `console.warn('upload failed: ' + err.message);`,
      // Prose about the rule is not the rule.
      `// the old code used err.message here`,
      `/* err.message was the leak */`,
      `<!-- the catch arm put err.message on the page -->`,
    ];
    for (const snippet of good) {
      expect(violations(snippet), `should NOT be flagged: ${snippet}`).toHaveLength(0);
    }
  });

  test('no file under src renders a transport string', () => {
    const found = walk(SRC).flatMap((file) =>
      violations(readFileSync(file, 'utf8'), path.relative(path.resolve(HERE, '..', '..'), file)),
    );

    expect(
      found,
      [
        'A transport error is reaching a person.',
        '',
        'Keep the API\'s own message — err.response?.data?.error?.message — and put',
        'words a person recognises in the fallback. The axios message belongs in',
        'console.error, where it helps and nobody reads it by accident.',
        '',
        found.join('\n'),
      ].join('\n'),
    ).toEqual([]);
  });

  test('the scan actually reads files', () => {
    // The empty-result control (§4.13): an empty violation list is a claim
    // about the scan as much as about the source. If `walk` returned nothing —
    // a moved directory, a changed extension filter — the test above would pass
    // for the wrong reason and pass forever.
    const files = walk(SRC);
    expect(files.length, 'src should contain scannable files').toBeGreaterThan(50);
    expect(
      files.some((f) => f.endsWith('components/ReadState.vue')),
      'the scan should reach the component this whole epic child is about',
    ).toBe(true);
  });
});

/**
 * The sign-in form, which is the one site where the static rule was wrong.
 *
 * `Login.vue` uses `fetch`, not axios, and throws its own `Error` carrying
 * product prose when the server says no — so the `err.message` the detector
 * flagged there was never a transport string. The §3.90 capture is what caught
 * it: the before frame already read "Invalid username or password".
 *
 * The conversion still earned its place, because collapsing both arms into the
 * credentials sentence would tell an offline person their password is wrong.
 * These two cases pin the split so a later tidy cannot merge them again.
 */
test.describe('#5304 the sign-in form tells the truth about which failure it hit', () => {
  const attempt = async (page: Page, handler: (route: Route) => unknown) => {
    await page.route('**/api/login', handler);
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await page.locator('input').first().fill('someone');
    await page.locator('input[type="password"]').first().fill('wrong-password');
    await page.getByRole('button', { name: /log ?in|sign ?in/i }).first().click();
  };

  test('a rejected sign-in talks about the credentials', async ({ page }) => {
    await attempt(page, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await expect(page.locator('body')).toContainText('username and password did not match');
    await expect(page.locator('body')).not.toContainText('could not reach the server');
  });

  test('a rejected sign-in prefers the server\'s own words when it sent any', async ({ page }) => {
    // A locked account or a rate limit is something the person can act on, and
    // "wrong password" would be false in both cases.
    await attempt(page, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Too many attempts. Try again in 15 minutes.' } }),
      }),
    );
    await expect(page.locator('body')).toContainText('Too many attempts');
  });

  test('a network failure does NOT claim the password was wrong', async ({ page }) => {
    // The regression this pair exists to prevent. Telling someone whose
    // connection dropped that their credentials are wrong is a false statement,
    // and it is the failure a single collapsed message produces.
    await attempt(page, (route) => route.abort('failed'));
    await expect(page.locator('body')).toContainText('could not reach the server');
    await expect(page.locator('body')).not.toContainText('did not match');
    await expect(page.locator('body')).not.toContainText('Failed to fetch');
  });
});
