<template>
  <div class="constellations-summary" data-testid="summary-text" aria-live="polite">
    <p
      v-if="current"
      :key="current.key"
      class="constellations-summary-item"
      :class="{ 'is-visible': visible }"
      data-testid="summary-item"
    >
      <span>{{ current.before }}</span>
      <strong :style="{ color: current.colour }">{{ current.term }}</strong>
      <span>{{ current.after }}</span>
    </p>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';

// The relationship-status line (#4587-F4 / #4605, re-shaped by #4812 / epic
// #4806 ask 6). members/relationships are the D1 aggregate's arrays verbatim
// (RoomStateMember / RoomStateRelationship, #4600) — a pure consumer of the
// existing poll, no new backend call.
//
// The vocabulary + colour are DB-resident (A2, #4594) and carried on every edge
// via the D1 payload's type_code/type_label/colour; the phrase templates below
// only supply the sentence grammar around that vocabulary (the operator gave
// these exact phrasings as worked examples in the epic body, e.g. "Diana is
// partnered with Victor"), never a colour or the type set itself. An
// unrecognised type_code (a future seventh connection type) falls back to a
// generic template built from the DB label rather than failing to render.
//
// #4806 ask 6 — "the text showing the status ... can we have that just fade in
// and then fade out shortly, a single item at a time, so we don't make a mess
// of text if multiple people are playing." This used to render EVERY current
// connection concatenated into one paragraph with " · " separators, so a busy
// room piled the whole graph into a wall of prose that never went away. It is
// now a transient status feed: a connection announces itself ONCE when it is
// made or re-typed, one item at a time, fade in -> dwell -> fade out, and the
// line is empty the rest of the time.
//
// Two consequences of reading the ask as a change feed rather than a rotating
// carousel of the whole graph, both deliberate:
//   - The edges already on the board when this mounts are seeded as known and
//     NOT announced. They are not news to the player who made them, and a
//     player opening a room mid-game would otherwise be met by the same wall of
//     text in slow motion.
//   - There is no permanent empty state. A line that always reads "No
//     connections yet." is exactly the always-on text the ask is about; the
//     board's own "Waiting for players to join…" note covers the empty room.
// The graph itself (F1) remains the persistent view of who is connected to
// whom — this line reports changes to it, it does not restate it.
const props = defineProps({
  members: { type: Array, default: () => [] },
  relationships: { type: Array, default: () => [] },
});

const FADE_MS = 260; // must match the CSS transition duration below
const DWELL_MS = 3200; // how long a settled item stays legible before leaving
// A burst of simultaneous edits must not queue minutes of playback. Keeping the
// NEWEST few is the right trade for a status feed: the player cares what just
// happened, not what happened nine edits ago.
const QUEUE_CAP = 5;

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

// An edge's identity for change detection: the unordered pair plus the type it
// currently carries. Re-typing a pair changes the key, so it announces again;
// a poll that repeats an unchanged edge does not.
function edgeKey(rel) {
  const [low, high] = [rel.from_user_id, rel.to_user_id].sort((a, b) => a - b);
  return `${low}-${high}-${rel.type_id}`;
}

function sentenceFor(rel) {
  const from = displayName(rel.from_user_id);
  const to = displayName(rel.to_user_id);
  const build = PHRASE_BUILDERS[rel.type_code];
  const phrase = build ? build(from, to) : fallbackPhrase(rel.type_label, from, to);
  return { key: edgeKey(rel), colour: rel.colour, ...phrase };
}

const prefersReducedMotion = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);

const queue = ref([]);
const current = ref(null);
const visible = ref(false);
let seeded = false;
let known = new Set();
let timer = null;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

// Play the head of the queue: fade in, dwell, fade out, then recurse. Under
// prefers-reduced-motion the item still dwells, it just does not animate — the
// point of the ask is one-at-a-time, and only the fade is the motion.
function playNext() {
  clearTimer();
  const next = queue.value.shift();
  if (!next) {
    current.value = null;
    visible.value = false;
    return;
  }
  current.value = next;
  visible.value = prefersReducedMotion.value;
  const fade = prefersReducedMotion.value ? 0 : FADE_MS;
  // Let the element mount hidden before flipping the class, so the enter
  // transition actually runs rather than being skipped as an initial value.
  timer = setTimeout(() => {
    visible.value = true;
    timer = setTimeout(() => {
      visible.value = false;
      timer = setTimeout(playNext, fade);
    }, DWELL_MS);
  }, fade ? 20 : 0);
}

function enqueue(items) {
  if (!items.length) return;
  queue.value = [...queue.value, ...items].slice(-QUEUE_CAP);
  if (!current.value) playNext();
}

watch(
  () => props.relationships,
  (rels) => {
    const list = rels || [];
    if (!seeded) {
      // Wait for the room state to actually land before seeding. The shell
      // renders this with `relationships: []` while the first poll is in
      // flight, and adopting THAT as the known set would make every existing
      // edge look brand new the moment the payload arrives — the wall of text
      // in slow motion this ask exists to remove. Members are non-empty exactly
      // when the state has arrived (the viewer is themselves in the room).
      if (!props.members.length) return;
      // First real payload: adopt the existing graph silently (header note).
      seeded = true;
      known = new Set(list.map(edgeKey));
      return;
    }
    const nextKnown = new Set(list.map(edgeKey));
    const fresh = list.filter((rel) => !known.has(edgeKey(rel)));
    known = nextKnown;
    enqueue(fresh.map(sentenceFor));
  },
  { immediate: true, deep: true },
);

onUnmounted(clearTimer);
</script>

<style scoped>
.constellations-summary {
  text-align: center;
  /* Reserve the line's height so the board does not reflow as items come and
     go — the fade must not shove the graph around. */
  min-height: 1.3rem;
}

.constellations-summary-item {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.85rem;
  line-height: 1.5;
  opacity: 0;
  transition: opacity 260ms ease;
}

.constellations-summary-item.is-visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .constellations-summary-item {
    transition: none;
  }
}
</style>
