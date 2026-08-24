<template>
  <div class="scratchpad-view">
    <h1>Scratchpad</h1>
    <p class="page-subtitle">
      A personal note that syncs live across every device you're logged in on.
    </p>

    <div class="scratchpad-card">
      <div class="scratchpad-card-header">
        <span class="scratchpad-status">{{ statusText }}</span>
      </div>
      <textarea
        ref="editor"
        v-model="text"
        class="scratchpad-editor"
        spellcheck="false"
        placeholder="Paste or type here — visible on every device you're logged in on. Stored in plain text on the server."
        @input="onInput"
      ></textarea>
    </div>
  </div>
</template>

<script>
import { getScratchpad, putScratchpad } from '../../../composables/useScratchpad.js';

// Cross-device sync tuning.
const SAVE_DEBOUNCE_MS = 500; // debounce a write after the last keystroke
const POLL_INTERVAL_MS = 1000; // pull remote changes ~1s

export default {
  data() {
    return {
      text: '',
      // lastKnown is the last value we know is in sync with the server (from a
      // GET or a confirmed PUT). The editor is "dirty" (the user is actively
      // typing unsaved changes) exactly when text !== lastKnown.
      lastKnown: '',
      lastKnownUpdatedAt: null,
      saving: false,
      loaded: false,
      error: null,
      saveTimer: null,
      pollTimer: null,
    };
  },
  computed: {
    dirty() {
      return this.text !== this.lastKnown;
    },
    statusText() {
      if (this.error) return this.error;
      if (!this.loaded) return 'Loading…';
      if (this.saving || this.dirty) return 'Saving…';
      return 'Saved';
    },
  },
  methods: {
    // On each edit, debounce a write. This never blocks the poll; the poll just
    // won't clobber the editor while dirty (see pollRemote).
    onInput() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
    },
    async save() {
      // Snapshot what we're sending so a keystroke landing mid-request doesn't
      // falsely mark us in sync with stale text.
      const sending = this.text;
      this.saving = true;
      this.error = null;
      try {
        const resp = await putScratchpad(sending);
        this.lastKnown = sending;
        this.lastKnownUpdatedAt = resp.updated_at;
      } catch (err) {
        this.error = err.response?.data?.error?.message || 'Save failed';
      } finally {
        this.saving = false;
      }
    },
    async pollRemote() {
      // Don't fight an in-flight write, and don't clobber active typing.
      if (this.saving || this.dirty) return;
      try {
        const resp = await getScratchpad();
        if (this.isNewer(resp.updated_at, this.lastKnownUpdatedAt)) {
          // Re-check dirtiness after the await — the user may have started
          // typing while the GET was in flight.
          if (this.saving || this.dirty) return;
          this.text = resp.text;
          this.lastKnown = resp.text;
          this.lastKnownUpdatedAt = resp.updated_at;
        }
      } catch (err) {
        // A 401 is handled globally (main.js interceptor); swallow transient
        // poll errors so a blip doesn't wipe the editor.
        if (err.response?.status !== 401) {
          this.error = null;
        }
      }
    },
    isNewer(a, b) {
      if (!a) return false;
      if (!b) return true;
      return new Date(a).getTime() > new Date(b).getTime();
    },
  },
  async mounted() {
    try {
      const resp = await getScratchpad();
      this.text = resp.text;
      this.lastKnown = resp.text;
      this.lastKnownUpdatedAt = resp.updated_at;
    } catch (err) {
      this.error = err.response?.data?.error?.message || 'Failed to load scratchpad';
    } finally {
      this.loaded = true;
    }
    this.pollTimer = setInterval(() => this.pollRemote(), POLL_INTERVAL_MS);
  },
  beforeUnmount() {
    clearTimeout(this.saveTimer);
    clearInterval(this.pollTimer);
    // Flush a pending edit so navigating away doesn't drop the last change.
    if (this.dirty) this.save();
  },
};
</script>

<style scoped>
/* Match the member tool-page vocabulary (#4220): flow inside the router content
   area with the shared padded, centered container + <h1> + .page-subtitle, and
   shell the editor in a token-styled card — the pattern PappasPushups and the
   other member pages use. Replaces the previous position:fixed full-bleed layout
   that read as a one-off. */
.scratchpad-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-lg);
  min-height: 100vh;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-md);
  text-align: center;
}

.scratchpad-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 60vh;
  background-color: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.scratchpad-card-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: var(--space-xs) var(--space-md);
  border-bottom: 1px solid var(--border-card);
  flex-shrink: 0;
}

.scratchpad-status {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.scratchpad-editor {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: var(--space-md);
  background-color: transparent;
  /* The card is a dark surface (--surface-card); editor ink is the on-dark
     token, matching the card content vocabulary in the other member pages. */
  color: var(--text-on-dark);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--text-base);
  line-height: 1.5;
}

.scratchpad-editor::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}
</style>
