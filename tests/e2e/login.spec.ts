import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedAdminSession, dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/** Covers system_3 #3342: a dedicated /login page for visitors bounced off a
 *  gated surface (nginx @browser_flows_login / @penpot_login), landing on a
 *  focused form instead of the home page.
 *
 *  Parity with the sidebar login is by construction — LoginView.vue renders
 *  the same Login.vue component, so these tests exercise the /login route's
 *  own responsibilities (mount, already-logged-in bypass, post-login return,
 *  open-redirect guard) rather than re-testing the login POST itself, which
 *  is already covered by the component the route reuses. */

async function mockLoginSuccess(page: Page, role = 'Admin'): Promise<void> {
  await page.route(/\/api\/login$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { username: 'e2e-tester', role } }),
    });
  });
}

// The two fields are selected by `name`, not by `id`. Login.vue's controls are
// AspInput now, and AspInput mints its own id so it can wire its `label` prop's
// `for` to the inner <input>; an id passed in from the call site would land on
// that input AFTER the component's own and break the association it exists to
// guarantee. `name` is the caller's attribute either way (it is what the
// password manager keys on), so it is the stable hook here.
async function fillAndSubmitLogin(page: Page): Promise<void> {
  await page.locator('input[name="username"]').fill('e2e-tester');
  await page.locator('input[name="password"]').fill('hunter2');
  await page.getByRole('button', { name: 'Login' }).click();
}

test.describe('Dedicated /login page', () => {
  test('anonymous visitor sees the shared login form', async ({ page }) => {
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('already-logged-in visitor is bounced off /login to home', async ({ page }) => {
    await seedAdminSession(page);
    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });

  test('a visitor bounced here with stale login display-state sees the form and does NOT loop (system_3 #4155)', async ({
    page,
  }) => {
    // The #4155 loop: nginx's auth_request bounces an INVALID session off a
    // gated surface to /login?redirect=<surface>. `user_name` is cached
    // display state that OUTLIVES the HttpOnly cookie, so it is still set on a
    // dead session. The old created() auto-forwarded on that stale flag → the
    // forwarded GET is rejected again → 302 /login → forward → an infinite
    // full-page reload (the flickering, shaking screen with an unclickable
    // sidebar the operator reported). The fix: a `redirect` param means this
    // session was just rejected for the target, so show the form — never
    // forward on stale display-state.
    await seedAdminSession(page);
    await page.goto('/login?redirect=/member');
    await dismissMobileSidebarIfPresent(page);
    await expect(page).toHaveURL('/login?redirect=/member');
    await expect(page.locator('input[name="username"]')).toBeVisible();
  });

  test('a visitor bounced here is NOT auto-forwarded to a proxied surface — the redirect-loop guard (system_3 #4155, supersedes #4081)', async ({
    page,
  }) => {
    // #4081 auto-forwarded an already-"logged-in" visitor to the proxied
    // redirect target via a full-page GET. The premise is unsound: you only
    // reach /login?redirect=<proxied> because nginx's auth_request REJECTED the
    // session for it, so the forwarded GET is rejected again and bounces
    // straight back — the #4155 loop. #4081's own test masked this by stubbing
    // the proxied target to 200, bypassing the real gate. The guard now: with a
    // redirect param present, created() must NOT navigate — it shows the form,
    // and onLogin() forwards once a fresh credential is valid. If created()
    // wrongly forwarded, the stub below would fire.
    await seedAdminSession(page);
    const proxied = '/admin/apps/system_3/';
    let forwarded = false;
    await page.route(proxied, (route) => {
      forwarded = true;
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>should not be reached</h1></body></html>',
      });
    });
    await page.goto('/login?redirect=' + encodeURIComponent(proxied));
    await dismissMobileSidebarIfPresent(page);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(forwarded).toBe(false);
  });

  test('successful login with no redirect param lands on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });

  test('successful login returns the visitor to the originally requested URL', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=/member');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/member');
  });

  test('successful login updates the sidebar to the logged-in state', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
    await dismissMobileSidebarIfPresent(page);
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  // Open-redirect guard: a `redirect` value that does not point same-origin
  // must never be honoured, or a crafted /login?redirect=https://evil link
  // could hand a fresh credential holder's next click to another origin.
  test('a protocol-relative redirect target is rejected, landing on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=//evil.example.com');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });

  test('an absolute external redirect target is rejected, landing on home', async ({ page }) => {
    await mockLoginSuccess(page);
    await page.goto('/login?redirect=https://evil.example.com');
    await dismissMobileSidebarIfPresent(page);
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL('/');
  });

  // Both mounts of this form, measured as a RATIO rather than as a token.
  //
  // The captions are `color: inherit` (AspInput's .field__label sets no
  // background of its own, so it must take the ink of the surface it is dropped
  // onto), which means their legibility is a property of the mount, not of the
  // component — and it was wrong on the /login mount in BOTH directions before
  // this was measured. The pre-migration `--brand-primary` caption rendered at
  // 1.41:1 on the light page; letting it inherit instead picked up Vuetify's
  // pinned `rgba(0,0,0,.87)` and rendered at 1.21:1 in dark. An assertion on
  // the colour VALUE would have been satisfied by either. The suite reads
  // ratios here for the same reason #877 was rewritten to (#4310): a field can
  // be exactly the colour the test demands and still be invisible.
  for (const [mount, path, container] of [
    ['dedicated /login page', '/login', '.login-view-card'],
    ['sidebar strip', '/', '.login-card'],
  ] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`credential captions clear AA on the ${mount} in ${theme}`, async ({ page }) => {
        // Activate the theme the way the app does — the `theme` key, read at
        // boot, which is what sets [data-theme] (#4245). Poking the attribute
        // after load flips the DS tokens without flipping the surfaces painted
        // by the app's own rules, and measures a page that never exists.
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await page.goto(path);
        // The sidebar mount is only on screen while the sidebar is: on mobile
        // the strip starts as an overlay that dismissMobileSidebarIfPresent
        // closes, which would leave this measuring a form nobody can see. The
        // /login mount is a page and needs the dismissal, because there the
        // overlay covers the form instead.
        if (container !== '.login-card') await dismissMobileSidebarIfPresent(page);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
          .toBe(theme);
        await expect(page.locator(`${container} .field__label`).first()).toBeVisible();

        const captions = page.locator(`${container} .field__label`);
        await expect(captions).toHaveCount(2);
        for (let i = 0; i < 2; i++) {
          expect(await contrastRatio(captions.nth(i)), `caption ${i} on ${mount}/${theme}`)
            .toBeGreaterThanOrEqual(4.5);
        }
        // The value ink too — a field whose caption is legible and whose typed
        // text is not is the #4201 defect one level down.
        const control = page.locator(`${container} input[name="username"]`);
        await control.fill('legible?');
        expect(await contrastRatio(control), `value ink on ${mount}/${theme}`)
          .toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // The AspInput migration (#4304) replaced two hand-rolled <label for> pairs
  // with the component's own `label` prop. Nothing in this file asserted the
  // association before — the pair could have pointed at nothing and every test
  // above would still pass, which is exactly what the pre-migration markup did
  // (`for="username"` against an input carrying `id="username"` worked, but the
  // same shape in UserForm.vue pointed at inputs with no id at all). Assert the
  // outcome the migration is supposed to guarantee, not the markup that
  // produces it: clicking the caption focuses the control it captions.
  test('each credential field is reachable by its visible caption', async ({ page }) => {
    await page.goto('/login');
    await dismissMobileSidebarIfPresent(page);

    for (const [caption, name, type] of [
      ['Username', 'username', 'text'],
      ['Password', 'password', 'password'],
    ] as const) {
      const control = page.locator(`input[name="${name}"]`);
      await expect(control).toHaveAttribute('type', type);

      // Clicking the label — not the input — must land the caret in the field.
      // Matched by hasText rather than exact text: AspInput renders the
      // required marker as a `*` span INSIDE the label, so the caption's text
      // content is "Username *", not "Username". The walk that migrated this
      // file found that by clicking and missing.
      await page.locator('.login-card label', { hasText: caption }).click();
      await expect(control).toBeFocused();

      // ...and the value still round-trips through v-model, which is the other
      // half a wrong-prop DS mount would silently drop (#4182: a blank control
      // renders and the suite stays green).
      await control.fill('typed-' + name);
      await expect(control).toHaveValue('typed-' + name);
    }
  });
});

/** Computed foreground-over-effective-background contrast for `locator` — the
 *  same measurement as tests/e2e/profile.spec.ts and trusted-contrast.spec.ts
 *  (#3027 / #3014): walks up to the first opaque background and composites a
 *  translucent foreground over it, so the number is what a reader sees rather
 *  than what a token declares. */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.first().evaluate((el) => {
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    let bg: { r: number; g: number; b: number; a: number } | null = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) bg = c;
    }
    const fg = parse(getComputedStyle(el).color);
    if (!fg || !bg) return 0;
    const eff =
      fg.a < 1
        ? {
            r: fg.r * fg.a + bg.r * (1 - fg.a),
            g: fg.g * fg.a + bg.g * (1 - fg.a),
            b: fg.b * fg.a + bg.b * (1 - fg.a),
          }
        : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}
