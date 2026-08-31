<template>
  <div class="constellations-summary" data-testid="summary-text">
    <p v-if="!sentences.length" class="constellations-summary-empty">No connections yet.</p>
    <p v-else class="constellations-summary-prose">
      <template v-for="(sentence, i) in sentences" :key="sentence.key">
        <span v-if="i > 0" class="constellations-summary-sep"> · </span>
        <span>{{ sentence.before }}</span>
        <strong :style="{ color: sentence.colour }">{{ sentence.term }}</strong>
        <span>{{ sentence.after }}</span>
      </template>
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

// The relationship-summary prose (#4587-F4 / #4605). members/relationships are
// the D1 aggregate's arrays verbatim (RoomStateMember / RoomStateRelationship,
// #4600) — a pure consumer of the existing poll, no new backend call.
//
// The vocabulary + colour are DB-resident (A2, #4594) and carried on every
// edge via the D1 payload's type_code/type_label/colour; the phrase templates
// below only supply the sentence grammar around that vocabulary (the operator
// gave these exact phrasings as worked examples in the epic body, e.g. "Diana
// is partnered with Victor"), never a colour or the type set itself. An
// unrecognised type_code (a future seventh connection type) falls back to a
// generic template built from the DB label rather than failing to render.
const props = defineProps({
  members: { type: Array, default: () => [] },
  relationships: { type: Array, default: () => [] },
});

function displayName(userId) {
  const member = props.members.find((m) => m.user_id === userId);
  if (!member) return 'Someone';
  return member.game_username || `Player ${member.slot}`;
}

// Each entry returns { before, term, after } — `term` is the bold+coloured
// vocabulary word/phrase, `before`/`after` the surrounding plain-text prose.
const PHRASE_BUILDERS = {
  P: (from, to) => ({ before: `${from} is `, term: 'partnered', after: ` with ${to}` }),
  D: (from, to) => ({ before: `${from} is `, term: 'dating', after: ` ${to}` }),
  F: (from, to) => ({ before: `${from} is `, term: 'Friends', after: ` with ${to}` }),
  'F+': (from, to) => ({ before: `${from} and ${to} are `, term: 'Friends With Benefits', after: '' }),
  A: (from, to) => ({ before: `${from} is having an `, term: 'Affair', after: ` with ${to}` }),
  R: (from, to) => ({ before: `${from} has `, term: 'rejected', after: ` ${to}` }),
};

function fallbackPhrase(label, from, to) {
  return { before: `${from} is `, term: label, after: ` with ${to}` };
}

const sentences = computed(() =>
  props.relationships.map((rel, i) => {
    const from = displayName(rel.from_user_id);
    const to = displayName(rel.to_user_id);
    const build = PHRASE_BUILDERS[rel.type_code];
    const phrase = build ? build(from, to) : fallbackPhrase(rel.type_label, from, to);
    return {
      key: `${rel.from_user_id}-${rel.to_user_id}-${rel.type_id}-${i}`,
      colour: rel.colour,
      ...phrase,
    };
  }),
);
</script>

<style scoped>
.constellations-summary {
  text-align: center;
}

.constellations-summary-empty {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.constellations-summary-prose {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.85rem;
  line-height: 1.5;
}

.constellations-summary-sep {
  color: #475569;
}
</style>
