<template>
  <!--
    #4603 / #4587-F2 — the relationship control panel. Pinned right-edge panel
    (operator default, epic #4587 c25764 Q4): one button per A2 relationship
    type, a Clear button, and the C1 history arrows at its foot. Per §3.100
    this panel is CHROME, so it is DS Asp* + tokens; only the graph canvas is
    bespoke SVG. Type colours come from the vocabulary rows (A2 data), never
    frontend constants.

    Presentational only: the room shell owns the selection state and the B1/C1
    calls; this component renders the vocabulary and emits intents.
  -->
  <div class="constellation-panel" data-testid="control-panel">
    <p class="constellation-panel-hint" data-testid="panel-hint">
      {{ pairSelected ? 'Set the pair’s connection' : 'Select two players' }}
    </p>

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
import { AspButton } from '@aspirant/design-system';

// types: normalized A2 vocabulary rows [{ id, code, label, colour }] in
// display order. pairSelected: exactly two avatars are selected in the graph.
defineProps({
  types: { type: Array, default: () => [] },
  pairSelected: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

defineEmits(['set-type', 'clear', 'undo', 'redo']);
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

.constellation-panel-hint {
  margin: 0 0 0.25rem;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  max-width: 7rem;
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
   of the right-edge panel). */
.constellation-panel-history {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  border-top: 1px solid #1e293b;
  padding-top: 0.5rem;
}
</style>
