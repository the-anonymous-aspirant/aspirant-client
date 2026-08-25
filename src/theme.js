/**
 * @fileoverview Live OS-preference following for the app theme (#4245, audit
 * #4241 report #72 finding F3, corpus §3.83).
 *
 * The FIRST-PAINT resolution lives in index.html, inline and pre-module, so the
 * page is already themed before this bundle parses — see the comment there. All
 * this module adds is the second half of the same grammar the system_3 console
 * uses (frontend-vue/src/components/ThemeToggle.vue): while the user has made
 * NO explicit choice, keep following the OS preference *live*, so flipping the
 * system theme flips the open tab instead of waiting for a reload. Once a
 * choice is stored, the stored value wins and the OS no longer overrides it.
 *
 * Storage key is `theme`, shared on purpose with both system_3 frontends — the
 * console at /admin/apps/system_3/ and this app are the same origin, so a flip
 * in either lands in the other. The console owns the toggle UI; this app has no
 * control of its own yet, which is why "follow the OS" is the only way a user
 * here changes theme and why it has to be live rather than boot-only.
 */

const STORAGE_KEY = 'theme';

/** Start following `prefers-color-scheme` for as long as no choice is stored.
 *  Returns a teardown fn; the app never calls it (the listener is app-lifetime)
 *  but tests and any future toggle need a way to detach. */
export function installThemeWatcher() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const onChange = (event) => {
    let hasChoice = false;
    try {
      hasChoice = !!window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unreadable: we cannot tell whether a choice exists, and
      // overriding a choice the user may have made is the worse error of the
      // two. Leave the attribute where first paint put it.
      return;
    }
    if (hasChoice) return;
    document.documentElement.setAttribute('data-theme', event.matches ? 'dark' : 'light');
  };

  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
