<template>
  <!-- #4848: the room's bottom control bar. Replaces the accumulating row of
       long text buttons (Read the rules / Dictionary / Leave room) with a fixed,
       compact set of circular icon buttons that select which face the spinning
       card shows. The operator asked for icon buttons ("circular icons … would
       read even cleaner") and for all of them to fit a mobile screen without
       clutter. Each button is a real <button> with an aria-label and a short
       visible caption; the active face is marked. Icons are inline SVG (the app
       ships no icon font) drawn in currentColor, so they read light on the dark
       room chrome. -->
  <nav class="constellation-room-nav" aria-label="Room panels" data-testid="room-nav">
    <button
      v-for="item in items"
      :key="item.face"
      type="button"
      class="constellation-room-nav-btn"
      :class="{ 'is-active': item.face === activeFace }"
      :aria-pressed="item.face === activeFace"
      :aria-label="item.label"
      :data-testid="`room-nav-${item.face}`"
      @click="$emit('select', item.face)"
    >
      <span class="constellation-room-nav-icon" aria-hidden="true" v-html="item.icon"></span>
      <span class="constellation-room-nav-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup>
// Presentational: the room shell owns `boardFace` and flips the card; this bar
// only reports which control was tapped. `items` is fixed here rather than
// passed in because the icon set is intrinsic to the control, not data.
import { computed } from 'vue';

const props = defineProps({
  activeFace: { type: String, default: 'game' },
  // Whether the goal-card dictionary control is shown (#4807). Kept optional so
  // a room without the dictionary feature can hide it without a fifth stub.
  showDictionary: { type: Boolean, default: true },
});
defineEmits(['select']);

// 24x24 line icons, stroke = currentColor. Kept inline: the app has no icon
// font and these are intrinsic to this control.
const ICONS = {
  // game: the avatar ring — a centre node with nodes around it.
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="4.2" r="1.6"/><circle cx="19" cy="9" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="5" cy="9" r="1.6"/><path d="M12 6v3.8M13.7 11l3.6-1.4M13 13.8l2.6 3M11 13.8l-2.6 3M10.3 11L6.7 9.6"/></svg>',
  // rules: an open book.
  rules: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.6 5.5 8.5 5 6 5H3.5v12.5H6c2.5 0 4.6.5 6 1.5"/><path d="M12 6.5C13.4 5.5 15.5 5 18 5h2.5v12.5H18c-2.5 0-4.6.5-6 1.5"/><path d="M12 6.5V19"/></svg>',
  // dictionary: stacked goal cards.
  dictionary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6.5" width="12" height="14" rx="1.6"/><path d="M4.5 4.5h9M4.5 8v11.5"/><path d="M10 10.5h6M10 14h4"/></svg>',
  // history: a clock with a rewind arrow.
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.2 4.2v3.6h3.6"/><path d="M12 7.8V12l3 1.8"/></svg>',
  // settings: three sliders.
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="17" r="2"/></svg>',
};

const items = computed(() =>
  [
    { face: 'game', label: 'Game', icon: ICONS.game },
    { face: 'rules', label: 'Rules', icon: ICONS.rules },
    props.showDictionary ? { face: 'dictionary', label: 'Cards', icon: ICONS.dictionary } : null,
    { face: 'history', label: 'History', icon: ICONS.history },
    { face: 'settings', label: 'Settings', icon: ICONS.settings },
  ].filter(Boolean),
);
</script>

<style scoped>
.constellation-room-nav {
  margin-top: 1.5rem;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
  width: 100%;
  max-width: 30rem;
}

.constellation-room-nav-btn {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.25rem 0;
  font: inherit;
}

/* The tap target is the round icon chip: fixed square box so it stays circular
   regardless of the label under it (§-441 — a round control whose size follows
   its content is round only by coincidence). */
.constellation-room-nav-icon {
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid #334155;
  background: #131a33;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.constellation-room-nav-icon svg {
  width: 1.4rem;
  height: 1.4rem;
}

.constellation-room-nav-label {
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.constellation-room-nav-btn:hover .constellation-room-nav-icon {
  border-color: #64748b;
  color: #f8fafc;
}

.constellation-room-nav-btn.is-active {
  color: #f8fafc;
}

.constellation-room-nav-btn.is-active .constellation-room-nav-icon {
  border-color: #6366f1;
  background: #6366f1;
  color: #f8fafc;
}

.constellation-room-nav-btn:focus-visible .constellation-room-nav-icon {
  outline: 2px solid #a5b4fc;
  outline-offset: 2px;
}

/* Mobile: keep all controls on one row without wrapping. The icon chip shrinks
   a little and the label stays readable; five chips + gaps fit a 320px viewport. */
@media (max-width: 30rem) {
  .constellation-room-nav {
    gap: 0.25rem;
  }
  .constellation-room-nav-icon {
    width: 2.5rem;
    height: 2.5rem;
  }
  .constellation-room-nav-label {
    font-size: 0.65rem;
  }
}
</style>
