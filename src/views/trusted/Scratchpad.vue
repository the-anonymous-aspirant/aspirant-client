<template>
  <div class="scratchpad-view" :style="viewStyle">
    <div class="scratchpad-toolbar">
      <span class="scratchpad-title">Scratchpad</span>
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
</template>

<script>
import { sidebarWidth } from '../../global_state_manager.js';
import { getScratchpad, putScratchpad } from '../../composables/useScratchpad.js';

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
    viewStyle() {
      return { left: sidebarWidth.value };
    },
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
.scratchpad-view {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.scratchpad-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--surface-card);
  border-bottom: 1px solid var(--border-card);
  flex-shrink: 0;
}

.scratchpad-title {
  color: var(--text-on-dark);
  font-size: var(--text-base);
  font-weight: 600;
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
  background-color: var(--surface-page);
  color: var(--text-primary, #1a1a1a);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--text-base);
  line-height: 1.5;
}

.scratchpad-editor::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}
</style>
