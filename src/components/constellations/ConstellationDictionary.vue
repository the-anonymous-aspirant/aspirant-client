<template>
  <!-- #4807-B1: the relationship + goal-card dictionary. Read-only reference
       the operator asked to sit next to "Read the rules": the six connection
       types (the vocabulary the goals are written in) and the 16 goal cards,
       each with the victory condition needed to achieve it. Selecting a goal is
       B2 (#4828); this face only explains. -->
  <div class="constellation-dictionary" data-testid="dictionary-face">
    <h2 class="constellation-dictionary-title">Relationships &amp; goals</h2>

    <section class="constellation-dictionary-section" aria-labelledby="dict-legend-heading">
      <h3 id="dict-legend-heading" class="constellation-dictionary-heading">Connection types</h3>
      <p class="constellation-dictionary-note">The lines you draw between players. Every goal below is written in these.</p>
      <ul class="constellation-dictionary-legend" data-testid="dictionary-legend">
        <!-- #4883 item 7: the type names read ALL CAPS wherever a name is
             rendered. Uppercased in the template rather than by CSS so the
             accessible name a screen reader announces matches the visible one
             and an assertion can read the text. -->
        <li v-for="t in relationshipTypes" :key="t.id" class="constellation-dictionary-legend-item" :data-type-code="t.code">
          <span class="constellation-dictionary-swatch" :style="{ background: t.colour }" aria-hidden="true" />
          <span class="constellation-dictionary-code" :style="{ color: t.colour }">{{ t.code }}</span>
          <span class="constellation-dictionary-label">{{ t.label.toUpperCase() }}</span>
        </li>
      </ul>
    </section>

    <section class="constellation-dictionary-section" aria-labelledby="dict-goals-heading">
      <h3 id="dict-goals-heading" class="constellation-dictionary-heading">Goal cards</h3>
      <p class="constellation-dictionary-note">Pick the relationship you are playing for; achieve its victory condition to win.</p>
      <ul class="constellation-dictionary-cards" data-testid="dictionary-cards">
        <!-- #4945 item 6: the viewer's own picked goal sorts to the top of the
             deck (see `sortedCards`) so it never has to be scrolled to, and gets
             a distinct filled highlight — a border alone did not read as
             "this is the one I chose". #4945 item 4: goal names read ALL CAPS,
             like every other relationship/goal name surface (uppercased in the
             template, not by CSS, so the accessible name matches the visible one). -->
        <li
          v-for="card in sortedCards"
          :key="card.id"
          class="constellation-dictionary-card"
          :class="{
            'is-selected': card.id === selectedCardId,
            'is-achieved': card.id === selectedCardId && achieved,
          }"
          :data-goal-code="card.code"
        >
          <div class="constellation-dictionary-card-head">
            <span class="constellation-dictionary-card-name" data-testid="goal-card-name">{{ card.name.toUpperCase() }}</span>
            <span
              v-if="card.id === selectedCardId && achieved"
              class="constellation-dictionary-card-badge"
              data-testid="goal-achieved-badge"
            >Achieved ★</span>
            <span
              v-else-if="card.minPlayers"
              class="constellation-dictionary-card-floor"
              :title="`Not playable with fewer than ${card.minPlayers} players`"
            >{{ card.minPlayers }}+ players</span>
          </div>
          <!-- #4945 item 5a: a consistent card template — every card reads
               NAME / "To win" label / condition / floor / action — so the
               victory condition is always introduced the same way and the
               freeform server text is easier to parse. -->
          <p class="constellation-dictionary-card-towin">To win</p>
          <p class="constellation-dictionary-card-condition" data-testid="goal-card-condition">{{ card.victoryCondition }}</p>
          <div class="constellation-dictionary-card-actions">
            <template v-if="card.id === selectedCardId">
              <span class="constellation-dictionary-card-mine" data-testid="goal-card-mine">
                {{ achieved ? 'Your goal — achieved' : 'Your goal' }}
              </span>
              <AspButton
                variant="ghost"
                size="sm"
                data-testid="goal-card-clear"
                @click="$emit('clear')"
              >Clear</AspButton>
            </template>
            <AspButton
              v-else
              variant="secondary"
              size="sm"
              :disabled="busy"
              data-testid="goal-card-select"
              @click="$emit('select', card.id)"
            >Make this my goal</AspButton>
          </div>
        </li>
      </ul>
      <p v-if="goalCards.length === 0" class="constellation-dictionary-empty" data-testid="dictionary-empty">
        The goal deck could not be loaded.
      </p>
    </section>
  </div>
</template>

<script setup>
// Presentational, prop-driven — the room shell owns the fetch and the set/clear
// calls (mirrors ConstellationControlPanel / ConstellationsSummary).
// relationshipTypes are the normalized A2 rows `[{ id, code, label, colour }]`;
// goalCards are the A1 deck normalized to
// `[{ id, code, name, victoryCondition, minPlayers }]`. selectedCardId is the
// viewer's own chosen goal (private, from /state); achieved reflects A2's
// server-side detection. Selecting/clearing is emitted up to the room shell.
import { computed } from 'vue';
import { AspButton } from '@aspirant/design-system';

const props = defineProps({
  relationshipTypes: { type: Array, default: () => [] },
  goalCards: { type: Array, default: () => [] },
  selectedCardId: { type: Number, default: null },
  achieved: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});

defineEmits(['select', 'clear']);

// #4945 item 6: the viewer's own chosen goal moves to the front of the deck so
// it is never behind a scroll. Stable otherwise — the server's deck order is
// preserved for every other card (a non-mutating copy; the selected card is
// lifted out and unshifted, the rest keep their relative order).
const sortedCards = computed(() => {
  const id = props.selectedCardId;
  if (id == null) return props.goalCards;
  const rest = props.goalCards.filter((c) => c.id !== id);
  const mine = props.goalCards.find((c) => c.id === id);
  return mine ? [mine, ...rest] : props.goalCards;
});
</script>

<style scoped>
/* Dark board palette, matching the rest of the constellations room chrome. */
.constellation-dictionary {
  height: 100%;
  overflow-y: auto;
  padding: 20px 22px 28px;
  color: #f8fafc;
  background: #0b1020;
  box-sizing: border-box;
}

.constellation-dictionary-title {
  margin: 0 0 16px;
  font-size: 1.25rem;
  font-weight: 700;
}

.constellation-dictionary-section {
  margin-bottom: 24px;
}

.constellation-dictionary-heading {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 600;
  color: #f8fafc;
}

.constellation-dictionary-note {
  margin: 0 0 12px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.constellation-dictionary-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px 16px;
}

.constellation-dictionary-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.constellation-dictionary-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex: 0 0 auto;
}

.constellation-dictionary-code {
  font-weight: 700;
  min-width: 1.75rem;
}

.constellation-dictionary-label {
  color: #f8fafc;
  font-size: 0.85rem;
}

.constellation-dictionary-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.constellation-dictionary-card {
  background: #131a33;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 12px 14px;
}

.constellation-dictionary-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.constellation-dictionary-card-name {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.04em;
}

.constellation-dictionary-card-floor {
  flex: 0 0 auto;
  font-size: 0.7rem;
  color: #94a3b8;
  border: 1px solid #1e293b;
  border-radius: 999px;
  padding: 1px 8px;
}

/* #4945 item 5a: the "To win" eyebrow gives every card the same read order —
   a small muted label above the condition, so the freeform victory text is
   always introduced consistently. */
.constellation-dictionary-card-towin {
  margin: 0 0 2px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7c86a0;
}

.constellation-dictionary-card-condition {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  /* #4945 item 5a: the condition is the card's payload — lift it off the muted
     grey it shared with secondary chrome so it is fully readable. */
  color: #e2e8f0;
}

/* The selecting player's own goal is lifted; achieving it turns the accent
   gold. Selection state is driven by the private /state goal, so it only ever
   reflects the viewer's own choice. #4945 item 6: a border alone did not read
   as "chosen" — the selected card now carries a distinct tinted fill and a
   left accent bar as well, so it is unmistakable and (with the sort-to-top)
   sits first in the deck. */
.constellation-dictionary-card.is-selected {
  border-color: #818cf8;
  background: #1b1f45;
  box-shadow: inset 3px 0 0 0 #818cf8, 0 0 0 1px #818cf8;
}

.constellation-dictionary-card.is-achieved {
  border-color: #f5c518;
  background: #2a2410;
  box-shadow: inset 3px 0 0 0 #f5c518, 0 0 0 1px #f5c518;
}

.constellation-dictionary-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.constellation-dictionary-card-mine {
  font-size: 0.75rem;
  font-weight: 600;
  color: #a5b4fc;
}

.is-achieved .constellation-dictionary-card-mine {
  color: #f5c518;
}

.constellation-dictionary-card-badge {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 700;
  color: #0b1020;
  background: #f5c518;
  border-radius: 999px;
  padding: 1px 8px;
}

.constellation-dictionary-empty {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}
</style>
