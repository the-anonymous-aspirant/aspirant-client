<template>
  <!--
    #4603 / #4587-F2 — the relationship control panel. Originally a pinned
    right-edge panel (operator default, epic #4587 c25764 Q4); since #4883
    item 4 it sits in flow beneath the board. Per §3.100 this panel is CHROME,
    so it is DS Asp* + tokens; only the graph canvas is bespoke SVG. Type
    colours come from the vocabulary rows (A2 data), never frontend constants.

    Presentational only: the room shell owns the selection state and the B1/C1
    calls; this component renders the vocabulary and emits intents.

    #4806 ask 3 — "I'd like for the modal that requests you to select two
    players only appear when you click on a player." The panel is pair-scoped:
    the hint, the type buttons and Clear mount only while a selection is in
    progress (`open`).

    #4883 items 1 and 4 — the operator retired the back/forward arrows ("I'd
    like to remove the back and forth buttons currently placed on the game
    screen, we can retire that") and moved this interface off the board ("for
    the relationship forming functionality, can we have the interface appear
    underneath the game board?"). Two consequences:

      - the `constellation-panel-history` arrows are gone, and with them this
        component's only board-scoped content. The undo/redo SERVER verbs are
        untouched — only their client callers go;
      - with nothing board-scoped left, the whole component renders NOTHING
        when `open` is false. It used to be an always-present box because the
        arrows lived in it; below the board an empty bordered box would just be
        a hole in the stack. What the player is holding is now said by
        ConstellationSelectedRelationship, which sits above this.
  -->
  <div v-if="open" class="constellation-panel" data-testid="control-panel">
    <div class="constellation-panel-picker" data-testid="pair-picker">
      <div class="constellation-panel-picker-head">
        <p class="constellation-panel-hint" data-testid="panel-hint">{{ hint }}</p>
        <AspButton
          variant="ghost"
          size="icon"
          class="constellation-panel-dismiss"
          title="Dismiss without editing"
          aria-label="Dismiss without editing"
          data-testid="dismiss-picker"
          @click="$emit('dismiss')"
        >
          ×
        </AspButton>
      </div>

      <AspButton
        v-for="t in types"
        :key="t.id"
        variant="secondary"
        size="sm"
        :disabled="!pairSelected || busy"
        class="constellation-panel-type"
        :title="t.label.toUpperCase()"
        data-testid="type-button"
        :data-type-code="t.code"
        @click="$emit('set-type', t.id)"
      >
        <span class="constellation-panel-swatch" :style="{ background: t.colour }" aria-hidden="true" />
        {{ t.code }}
      </AspButton>

      <AspButton
        variant="destructive"
        size="sm"
        :disabled="!pairSelected || busy"
        class="constellation-panel-clear"
        title="Clear the pair's connection"
        data-testid="clear-button"
        @click="$emit('clear')"
      >
        Clear
      </AspButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { AspButton } from '@aspirant/design-system';

// types: normalized A2 vocabulary rows [{ id, code, label, colour }] in
// display order. open: a selection is in progress, so the pair picker is
// mounted. selectedCount: how many avatars are currently picked (0-2) — it
// drives the hint. pairSelected: exactly two, so an edit can be committed.
const props = defineProps({
  types: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  pairSelected: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

defineEmits(['set-type', 'clear', 'dismiss']);

// The old copy was "Select two players", written for a panel that was always
// on screen. Now that the picker only appears once you have clicked someone,
// that sentence is wrong the moment it is read — you have already selected one.
const hint = computed(() => {
  if (props.pairSelected) return 'Set the pair’s connection';
  if (props.selectedCount === 1) return 'Select one more player';
  return 'Select two players';
});
</script>

<style scoped>
/* #4883 item 4: the panel is no longer a pinned right-edge overlay on the
   board — it sits in flow beneath it. Below the board there is horizontal room
   the right edge never had, so the type buttons lay out as a centred wrapping
   row rather than a narrow column, and the box tracks its content width
   instead of a fixed 6.5rem gutter. */
.constellation-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #1e293b;
  border-radius: 12px;
  background: #0e1428;
  width: 100%;
  max-width: 32rem;
  box-sizing: border-box;
}

/* The head, the type buttons and Clear are siblings inside the picker; they
   flow as one centred wrapping row so a six-type vocabulary fits a phone
   without a scroll, with the hint on its own first line. */
.constellation-panel-picker {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
}

.constellation-panel-picker-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex-basis: 100%;
}

.constellation-panel-hint {
  margin: 0;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  flex: 1 1 auto;
}

.constellation-panel-dismiss {
  flex: none;
}

.constellation-panel-type {
  justify-content: flex-start;
}

.constellation-panel-swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  margin-right: 0.5rem;
  flex: none;
}
</style>
