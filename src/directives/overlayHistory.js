/**
 * Overlay ⇄ browser-history integration.  (#4172)
 *
 * Every "overlay-shaped" surface (dialog, modal, side sheet, popup, the mobile
 * nav drawer) that opens on top of a screen pushes a browser-history entry when
 * it opens and closes itself when the user presses Back — the swipe-back
 * gesture on iOS Safari / Android Chrome, the Android OS back button, or the
 * browser back control. The intuitive expectation is met: Back closes the thing
 * the user most recently opened, leaving them on the underlying screen; a second
 * Back then navigates away as before.
 *
 * Mechanism
 * ---------
 * On open we `history.pushState` an entry that carries the SAME URL as the
 * current route (only a state marker distinguishes it). Because the URL is
 * unchanged, unwinding one of these entries never triggers a route navigation:
 * vue-router sees the same path on the resulting popstate and does nothing.
 *
 * Overlays form a LIFO stack — Back closes the top-most only, so nested overlays
 * (e.g. a confirm opened from within another overlay) close in reverse order.
 *
 * A manual close (close button, scrim click, Escape, programmatic) unwinds the
 * one entry we pushed via `history.back()`, so the history stack stays honest
 * and a Back-close and a manual close reach the same state. The popstate that
 * `history.back()` emits is swallowed by a guard counter so it does not close a
 * second overlay.
 *
 * The `v-overlay-history` directive is the intended consumer. Because the app's
 * overlays are all `v-if`-gated, an element's mount == overlay-open and its
 * unmount == overlay-close, so a directive needs no watcher and works
 * identically for Options-API and Composition-API components. Opt in by adding
 * the directive to the overlay's root (scrim) element, with the overlay's own
 * close handler as the value:
 *
 *   <div v-if="showDialog"
 *        v-overlay-history="cancel"
 *        class="dialog-overlay">…</div>
 *
 * The value is the SAME handler the scrim click / Cancel button already uses, so
 * a Back-close runs exactly the same close path as a manual one.
 */

const STATE_KEY = '__overlayHistory';

const stack = []; // [{ token, close }] — top of stack is the last element.
let installed = false;

// Number of popstate events to consume silently. Armed when *we* call
// history.back() to unwind our own entry during a manual close: that echo
// popstate must not be mistaken for a fresh Back gesture and close another
// overlay.
let selfUnwinds = 0;

function onPopState() {
  if (selfUnwinds > 0) {
    // Echo of our own history.back() from popOverlay(): the overlay is already
    // closing. Consume it and stop.
    selfUnwinds -= 1;
    return;
  }
  // A genuine Back gesture. Close the top-most overlay, if any. The underlying
  // route is untouched because our entry carried the same URL. If the stack is
  // empty this Back belongs to the route — do nothing and let vue-router handle
  // it.
  const top = stack.pop();
  if (top) {
    top.close();
  }
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', onPopState);
}

/**
 * Register an overlay as open. Pushes a same-URL history entry and returns an
 * opaque token to hand back to popOverlay() when the overlay closes by any
 * non-Back path.
 * @param {() => void} close - closes the overlay (the same handler its scrim /
 *   close button uses); invoked when a Back gesture pops this entry.
 * @returns {object} token
 */
export function pushOverlay(close) {
  install();
  const token = {};
  stack.push({ token, close });
  // Preserve vue-router's own history.state bookkeeping (position/back/forward)
  // and add our marker on top, so the router stays consistent across the entry.
  const base =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
  window.history.pushState({ ...base, [STATE_KEY]: stack.length }, '');
  return token;
}

/**
 * Deregister an overlay that closed by a non-Back path (close button, scrim
 * click, Escape, programmatic). If the entry is still on the stack — i.e. a Back
 * gesture (onPopState) has not already removed it — unwind the one history entry
 * we pushed so the stack stays honest. A no-op otherwise.
 * @param {object} token - the value returned by pushOverlay().
 */
export function popOverlay(token) {
  const idx = stack.findIndex((e) => e.token === token);
  if (idx === -1) return; // already removed by a Back gesture or a nav teardown.
  stack.splice(idx, 1);
  // Unwind exactly one pushed entry. history.back() emits a popstate we must
  // ignore (this overlay is already closed), so arm the self-unwind guard.
  selfUnwinds += 1;
  window.history.back();
}

/**
 * Drop every tracked overlay WITHOUT unwinding history. Call this when a real
 * route navigation tears an open overlay down: the navigation itself
 * restructures the history stack, so calling history.back() here would undo it.
 * Any leftover same-URL entries are consumed harmlessly if the user later Backs
 * over them. Wired via router.beforeEach on a path change.
 */
export function clearForNavigation() {
  stack.length = 0;
}

/** Test-only: reset module state between specs. Not used by app code. */
export function __resetOverlayHistory() {
  stack.length = 0;
  selfUnwinds = 0;
}

/** Test-only: current tracked overlay depth. */
export function __overlayDepth() {
  return stack.length;
}

/**
 * overlayHistoryWatch — the Options-API counterpart to `v-overlay-history`, for
 * an overlay rendered by a COMPONENT rather than by a `v-if`-gated element of
 * our own.  (#4516)
 *
 * The directive above rests on a premise that holds for every hand-rolled
 * overlay in this app and for none of the DS ones: the scrim is an element we
 * write, so its mount is the open and its unmount is the close. `AspModal`
 * renders its scrim inside a `<Teleport>`, which makes the component's root a
 * non-element node — Vue silently drops a runtime directive placed there (the
 * shape recorded on `AspTooltip` in #4446). There is no element of ours left to
 * hang the lifecycle on.
 *
 * So the binding moves to the signal that was always the real one: the state
 * edge. Every consumer here is Options-API, holding its open state in `data()`,
 * where a composable cannot reach — hence a watch handler and not a
 * `useOverlayHistory()`.
 *
 *   watch: {
 *     deleteTarget: overlayHistoryWatch('cancelDelete'),
 *   },
 *
 * `closeMethod` names a method on the component: the SAME one the dialog's
 * Cancel button and `AspModal`'s own dismiss paths (scrim press, Escape, the ✕)
 * already call, so a Back-close and every manual close reach one state. It is a
 * method name rather than a closure because the returned watcher is created
 * once per component definition and shared by every instance of it; `this` is
 * what distinguishes them, and Vue calls an Options watch handler with the
 * instance as `this`.
 *
 * Truthiness is the open test, so an object-valued handle (`deleteTarget`, a
 * file; `schemaModal`, a fetched schema) works unchanged alongside a boolean.
 * A change from one open value to another — swapping which row is being
 * confirmed without closing the dialog — is not an edge and pushes nothing.
 *
 * Boundary: a component torn down while its overlay is open fires no watcher,
 * so its stack entry survives. A real route change already clears the whole
 * stack (`clearForNavigation`, wired in the router), which is the only teardown
 * path these views have; an overlay under an ancestor `v-if` would need the
 * directive or an explicit `beforeUnmount` pop instead.
 */
export function overlayHistoryWatch(closeMethod) {
  // Per-instance, because the watcher itself is shared across instances.
  const tokens = new WeakMap();
  return function overlayHistoryWatcher(value, previous) {
    const isOpen = Boolean(value);
    const wasOpen = Boolean(previous);
    if (isOpen === wasOpen) return;
    if (isOpen) {
      if (typeof this[closeMethod] !== 'function') {
        if (import.meta && import.meta.env && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            '[overlayHistoryWatch] no such method on the component:',
            closeMethod,
          );
        }
        return;
      }
      tokens.set(this, pushOverlay(() => this[closeMethod]()));
      return;
    }
    const token = tokens.get(this);
    if (token) {
      tokens.delete(this);
      popOverlay(token);
    }
  };
}

/**
 * v-overlay-history — bind a `v-if`-gated overlay element's lifecycle to the
 * browser history so Back closes it. See the module header for usage. The
 * binding value is the overlay's own close handler.
 */
export const overlayHistory = {
  mounted(el, binding) {
    const close = binding.value;
    if (typeof close !== 'function') {
      if (import.meta && import.meta.env && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[v-overlay-history] expects a close function as its value; got',
          typeof close,
        );
      }
      return;
    }
    el.__overlayHistoryToken = pushOverlay(() => close());
  },
  unmounted(el) {
    if (el.__overlayHistoryToken) {
      popOverlay(el.__overlayHistoryToken);
      el.__overlayHistoryToken = null;
    }
  },
};

export default overlayHistory;
