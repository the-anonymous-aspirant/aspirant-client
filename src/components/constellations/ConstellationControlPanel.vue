<template>
  <!--
    #4603 / #4587-F2 — the relationship control panel. Pinned right-edge panel
    (operator default, epic #4587 c25764 Q4). Per §3.100 this panel is CHROME,
    so it is DS Asp* + tokens; only the graph canvas is bespoke SVG. Type
    colours come from the vocabulary rows (A2 data), never frontend constants.

    Presentational only: the room shell owns the selection state and the B1/C1
    calls; this component renders the vocabulary and emits intents.

    #4806 ask 3 — "I'd like for the modal that requests you to select two
    players only appear when you click on a player." The panel used to render
    unconditionally, standing on the board with every button disabled and a
    "Select two players" hint nobody had asked for. It is now split by SCOPE,
    not by position:

      - the PAIR PICKER (hint + type buttons + Clear) is pair-scoped and mounts
        only while a selection is in progress (`open`);
      - the HISTORY arrows are board-scoped and stay mounted, because they are
        not part of the select-two-players gesture. Hiding them with the picker
        would put undo out of reach exactly when it is wanted — right after a
        mis-click that has already been committed and deselected.
  -->
  <div class="constellation-panel" data-testid="control-panel">
    <div v-if="open" class="constellation-panel-picker" data-testid="pair-picker">
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
        :title="t.label"
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

    <div class="constellation-panel-history">
      <AspButton
        variant="ghost"
        size="icon"
        :disabled="busy"
        title="Undo your last edit"
        aria-label="Undo your last edit"
        data-testid="undo-button"
        @click="$emit('undo')"
      >
        ‹
      </AspButton>
      <AspButton
        variant="ghost"
        size="icon"
        :disabled="busy"
        title="Redo your last undone edit"
        aria-label="Redo your last undone edit"
        data-testid="redo-button"
        @click="$emit('redo')"
      >
        ›
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

defineEmits(['set-type', 'clear', 'undo', 'redo', 'dismiss']);

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
.constellation-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid #1e293b;
  border-radius: 12px;
  background: #0e1428;
  min-width: 6.5rem;
}

.constellation-panel-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.constellation-panel-picker-head {
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
}

.constellation-panel-hint {
  margin: 0 0 0.25rem;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  max-width: 7rem;
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

/* History arrows at the panel's foot (wireframe: back/forward at the bottom
   of the right-edge panel). Board-scoped, so they outlive the picker — the
   separating rule is only drawn when there is a picker above to separate. */
.constellation-panel-history {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.constellation-panel-picker + .constellation-panel-history {
  margin-top: 0.5rem;
  border-top: 1px solid #1e293b;
  padding-top: 0.5rem;
}
</style>
