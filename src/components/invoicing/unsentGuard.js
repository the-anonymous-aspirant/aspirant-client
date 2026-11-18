// Ask before an exit throws away what was typed (system_3 #11632, §3.166,
// cited as #11629 until it merges). The one shared piece for the Invoices
// app's dialogs: an Options-API mixin.
//
// A dialog that uses it supplies:
// - `unsentValue()`: what its Save would send, normalised the way Save
//   normalises it (trimmed, parsed), so a field typed and put back is equal
//   again;
// - `unsentBusy` (computed): a write is in flight;
// - `closeNow()`: its own close, exactly as it closed before.
// It calls `takeUnsentBaseline()` wherever it sets its values: on open, after
// a load, after a write the server accepted.
//
// Every exit (Esc, the scrim and the corner ✕ through the modal's
// `update:open`, the footer's Cancel or "Not now", and Back) calls
// `requestClose()`. With nothing unsent it closes at once. With something
// unsent the footer gives way to `UnsentAsk`, and every exit then means "Keep
// editing" until ze answers. While a write is in flight no exit closes and
// none asks.
//
// Back: the dialog's own history entry is pushed when `open` turns true and
// unwound when it closes (`overlayHistory.js`). A Back gesture has already
// used its entry by the time the close runs, so a Back that asks, or that
// comes while a write runs, pushes a fresh entry; a Back that closes at once
// marks the entry used, so the close does not unwind a second one.
//
// The browser's own prompt (`beforeunload`) is raised only while an open
// dialog holds something unsent.

import { popOverlay, pushOverlay } from '../../directives/overlayHistory.js';

const guarded = new Set();

function onBeforeUnload(event) {
  for (const vm of guarded) {
    if (vm.open && vm.hasUnsent()) {
      event.preventDefault();
      // Chromium and Safari still read returnValue.
      event.returnValue = '';
      return '';
    }
  }
  return undefined;
}

function track(vm, on) {
  if (typeof window === 'undefined') return;
  const had = guarded.size > 0;
  if (on) guarded.add(vm);
  else guarded.delete(vm);
  if (!had && guarded.size) window.addEventListener('beforeunload', onBeforeUnload);
  if (had && !guarded.size) window.removeEventListener('beforeunload', onBeforeUnload);
}

export const unsentGuard = {
  data() {
    return {
      unsentAsking: false,
      unsentBaseline: null,
    };
  },
  watch: {
    open: {
      immediate: true,
      handler(isOpen, wasOpen) {
        if (isOpen && !wasOpen) this.unsentOpened();
        else if (!isOpen && wasOpen) this.unsentClosed();
      },
    },
  },
  beforeUnmount() {
    if (this.open) this.unsentClosed();
  },
  methods: {
    unsentSnapshot() {
      return JSON.stringify(this.unsentValue());
    },
    takeUnsentBaseline() {
      this.unsentBaseline = this.unsentSnapshot();
    },
    hasUnsent() {
      return this.unsentBaseline !== null && this.unsentSnapshot() !== this.unsentBaseline;
    },
    // Returns true when the dialog closed.
    requestClose() {
      if (this.unsentBusy) return false;
      if (this.unsentAsking) return false;
      if (this.hasUnsent()) {
        this.unsentReturnFocus = typeof document !== 'undefined' ? document.activeElement : null;
        this.unsentAsking = true;
        return false;
      }
      this.closeNow();
      return true;
    },
    keepEditing() {
      this.unsentAsking = false;
      const back = this.unsentReturnFocus;
      this.unsentReturnFocus = null;
      this.$nextTick(() => {
        if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
      });
      this.unsentKeptEditing();
    },
    discardUnsent() {
      this.unsentAsking = false;
      this.unsentReturnFocus = null;
      this.closeNow();
    },
    // A dialog may override this to disarm a step the ask interrupted.
    unsentKeptEditing() {},
    unsentOpened() {
      this.unsentAsking = false;
      this.unsentBackUsed = false;
      this.unsentToken = pushOverlay(() => this.unsentOnBack());
      track(this, true);
    },
    unsentClosed() {
      this.unsentAsking = false;
      this.unsentBaseline = null;
      track(this, false);
      if (this.unsentToken && !this.unsentBackUsed) popOverlay(this.unsentToken);
      this.unsentToken = null;
      this.unsentBackUsed = false;
    },
    unsentOnBack() {
      // The gesture has used the entry this token stood for.
      this.unsentToken = null;
      const willClose = !this.unsentBusy && !this.unsentAsking && !this.hasUnsent();
      if (willClose) {
        this.unsentBackUsed = true;
        this.closeNow();
        return;
      }
      // Asked, busy or already asking: the dialog stays, so it needs an entry
      // again, or the next Back would leave the page.
      this.unsentToken = pushOverlay(() => this.unsentOnBack());
      this.requestClose();
    },
  },
};
