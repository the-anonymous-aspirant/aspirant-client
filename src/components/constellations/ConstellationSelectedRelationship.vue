<template>
  <!-- #4883 item 8 — "underneath the screen with the cards, can we have a box
       for the selected relationship?". The board itself shows every connection
       at once as coloured edges; nothing said what the pair you are currently
       holding is connected BY, so the answer lived only in the edge's SVG
       <title> tooltip. This box is that answer, always on screen, directly
       under the board and above the controls that change it — read the state,
       then act on it.

       Presentational: the room shell owns the selection and the room state, so
       this component never fetches and never guesses. `pair` is null until two
       players are picked; `relationship` is null when the picked pair carries
       no edge, which is a different thing from no pair at all and reads
       differently. Type names are ALL CAPS here (item 7) — this is the surface
       whose whole job is to name the type. -->
  <div class="constellation-selected" data-testid="selected-relationship">
    <p class="constellation-selected-label">Selected relationship</p>

    <p v-if="!pair" class="constellation-selected-idle" data-testid="selected-idle">
      <template v-if="pendingName">
        <span class="constellation-selected-name">{{ pendingName }}</span> — select one more player
      </template>
      <template v-else>Select two players</template>
    </p>

    <p v-else class="constellation-selected-pair" data-testid="selected-pair">
      <span class="constellation-selected-name">{{ pair.from }}</span>
      <span
        v-if="relationship"
        class="constellation-selected-type"
        :style="{ color: relationship.colour }"
        data-testid="selected-type"
      >
        <span
          class="constellation-selected-swatch"
          :style="{ background: relationship.colour }"
          aria-hidden="true"
        />
        {{ relationship.label.toUpperCase() }}
      </span>
      <span v-else class="constellation-selected-none" data-testid="selected-none">
        no connection yet
      </span>
      <span class="constellation-selected-name">{{ pair.to }}</span>
    </p>
  </div>
</template>

<script setup>
defineProps({
  // { from, to } display names once two players are picked; null otherwise.
  pair: { type: Object, default: null },
  // { label, colour } for the edge the pair currently carries; null when they
  // carry none. Only meaningful while `pair` is set.
  relationship: { type: Object, default: null },
  // The one player already held while the second is outstanding. Naming them
  // here is what keeps this box from repeating the picker's own hint verbatim
  // a few pixels below it — the name is the part the player cannot otherwise
  // read back off the board.
  pendingName: { type: String, default: '' },
});
</script>

<style scoped>
.constellation-selected {
  width: 100%;
  max-width: 26rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.65rem 1rem;
  border: 1px solid #1e293b;
  border-radius: 12px;
  background: #0e1428;
  text-align: center;
}

.constellation-selected-label {
  margin: 0;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.constellation-selected-idle {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.constellation-selected-pair {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.6rem;
  font-size: 0.95rem;
}

.constellation-selected-name {
  color: #f8fafc;
  font-weight: 600;
}

/* The name is uppercased in the template, not here: a CSS-only transform
   leaves the DOM text (and the accessible name) in the vocabulary's own case,
   so the surface and what a screen reader or an assertion reads would differ. */
.constellation-selected-type {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
}

.constellation-selected-swatch {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  flex: none;
}

.constellation-selected-none {
  color: #64748b;
  font-size: 0.8rem;
  font-style: italic;
}
</style>
