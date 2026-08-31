<template>
  <div class="constellations-dice">
    <button
      type="button"
      class="constellations-dice-die"
      :class="{ 'is-rolling': rolling }"
      :disabled="rolling"
      data-testid="dice-roll"
      :aria-label="dieLabel"
      @click="roll"
    >
      <svg class="constellations-dice-face" viewBox="0 0 100 100" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="16" />
        <circle
          v-for="(pip, i) in pipPositions"
          :key="i"
          :cx="pip[0]"
          :cy="pip[1]"
          r="9"
          class="constellations-dice-pip"
        />
      </svg>
    </button>
    <p class="constellations-dice-status" aria-live="polite" data-testid="dice-status">
      {{ statusText }}
    </p>
    <p v-if="error" class="constellations-dice-error" role="alert" data-testid="dice-error">
      {{ error }}
    </p>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import axios from 'axios';
import { unwrap } from '../../composables/useRoomSync.js';

// Iconised die for the shared board (#4587-F3 / #4604). The server resolves
// the roll (B2, #4597 — one die per the operator's Q2 answer, c25747); this
// component only spins locally and settles on whatever the server returned.
// Every viewer, roller or not, converges through the same code path: the
// parent's D1 poll (#4600) is the only source of truth for `dice`, so a nonce
// change — whether it came from this viewer's own click or another player's —
// drives the same settle animation. That is what makes "a second viewer sees
// the same settled value" true without this component polling anything itself.

const props = defineProps({
  code: { type: String, required: true },
  dice: { type: Object, default: null }, // { faces, nonce, rolled_at } | null, from the D1 snapshot
});

const SPIN_MS = 2000;
const SPIN_TICK_MS = 90;

// Classic six-sided pip layouts, drawn as an SVG rather than relying on the
// Unicode die glyphs (U+2680–2685) — those render as missing-glyph tofu on
// several system fonts, which would make the resolved face illegible.
const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

const rolling = ref(false);
const error = ref(null);
const displayFace = ref(0); // 0 = never rolled yet
const knownNonce = ref(0);
let spinTimer = null;
let settleTimer = null;

const pipPositions = computed(() => PIP_LAYOUTS[displayFace.value] || []);
const dieLabel = computed(() => {
  if (rolling.value) return 'Rolling the die';
  return displayFace.value ? `Roll the die — currently showing ${displayFace.value}` : 'Roll the die';
});
const statusText = computed(() => {
  if (rolling.value) return 'Rolling…';
  return displayFace.value ? `Rolled ${displayFace.value}` : 'Not rolled yet';
});

function clearTimers() {
  if (spinTimer) {
    clearInterval(spinTimer);
    spinTimer = null;
  }
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

function startSpin() {
  rolling.value = true;
  spinTimer = setInterval(() => {
    displayFace.value = 1 + Math.floor(Math.random() * 6);
  }, SPIN_TICK_MS);
}

function landOn(face) {
  clearTimers();
  rolling.value = false;
  displayFace.value = face;
}

// Animate toward a server-resolved roll over the shared ~2s spin, then land.
// Guards on nonce so a poll tick that repeats the roll we already settled
// (ours or someone else's) does not re-trigger the animation.
function settleTo(dice, elapsedMs = 0) {
  if (!dice || dice.nonce === knownNonce.value) return;
  knownNonce.value = dice.nonce;
  const finalFace = dice.faces?.[0] ?? 1;
  startSpin();
  settleTimer = setTimeout(() => landOn(finalFace), Math.max(0, SPIN_MS - elapsedMs));
}

watch(
  () => props.dice,
  (next) => {
    if (rolling.value) return; // this viewer's own click already owns the animation
    settleTo(next);
  },
  { immediate: true },
);

async function roll() {
  if (rolling.value) return;
  error.value = null;
  startSpin();
  const startedAt = Date.now();
  try {
    const res = await axios.post(`/api/constellations/rooms/${encodeURIComponent(props.code)}/dice/roll`);
    const dice = unwrap(res);
    knownNonce.value = dice.nonce;
    const finalFace = dice.faces?.[0] ?? 1;
    settleTimer = setTimeout(() => landOn(finalFace), Math.max(0, SPIN_MS - (Date.now() - startedAt)));
  } catch (err) {
    clearTimers();
    rolling.value = false;
    error.value = err.response?.data?.error?.message || 'Could not roll the die';
  }
}

onUnmounted(clearTimers);
</script>

<style scoped>
.constellations-dice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.constellations-dice-die {
  width: 3.5rem;
  height: 3.5rem;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.constellations-dice-die:disabled {
  cursor: default;
}

.constellations-dice-face {
  width: 100%;
  height: 100%;
}

.constellations-dice-face rect {
  fill: #f8fafc;
  stroke: #334155;
  stroke-width: 3;
}

.constellations-dice-die:hover:not(:disabled) .constellations-dice-face rect {
  fill: #e2e8f0;
}

.constellations-dice-pip {
  fill: #0b1020;
}

.constellations-dice-die.is-rolling {
  animation: constellations-dice-spin 0.35s linear infinite;
}

@keyframes constellations-dice-spin {
  from {
    transform: rotate(0deg) scale(1.05);
  }
  to {
    transform: rotate(360deg) scale(1.05);
  }
}

.constellations-dice-status {
  margin: 0;
  color: #94a3b8;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.constellations-dice-error {
  margin: 0;
  color: #fca5a5;
  font-size: 0.75rem;
  max-width: 8rem;
  text-align: center;
}
</style>
