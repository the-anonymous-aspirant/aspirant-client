<template>
  <!--
    In-room board shell (#4587-E1 / #4601). Dark canvas, the word Constellations,
    a header cluster (room code · join QR · live occupancy), and labelled mount
    regions the F1–F4 children (#4602–4606: avatar board, relationship lines,
    dice, summary) render into. Live state comes from useRoomSync, which
    short-polls the D1 aggregate (#4600) — the occupancy and code below update
    from the poll, no reload.
  -->
  <div class="constellations-room">
    <header class="constellations-room-header">
      <div class="constellations-room-heading">
        <h1 class="constellations-room-title">Constellations</h1>
        <p class="constellations-room-code">
          Room
          <span class="constellations-room-code-value" data-testid="room-code">{{ code }}</span>
        </p>
      </div>

      <div class="constellations-room-meta">
        <div class="constellations-room-occupancy" data-testid="occupancy" :title="occupancyTitle">
          <span class="constellations-room-occupancy-count">{{ occupancyLabel }}</span>
          <span class="constellations-room-occupancy-label">in the room</span>
        </div>
        <figure class="constellations-room-qr">
          <img
            v-if="qrUrl"
            :src="qrUrl"
            :alt="`Join QR for room ${code}`"
            width="112"
            height="112"
            data-testid="join-qr"
          />
          <figcaption>Scan to join</figcaption>
        </figure>
      </div>
    </header>

    <p v-if="error" class="constellations-room-error" data-testid="room-error">{{ error }}</p>

    <!-- Board canvas: F1 avatars + F2 relationship lines (#4602/#4603) mount here. -->
    <section class="constellations-room-board" data-testid="board-canvas" aria-label="Relationship board">
      <!-- Dice cluster (#4587-F3 / #4604). Faces come from the D1 poll's
           `dice` field so every viewer converges on the same server-resolved
           roll; rolling.vue talks to the roll endpoint directly. -->
      <div class="constellations-room-dice" data-testid="dice-mount">
        <ConstellationsDice v-if="code" :code="code" :dice="state?.dice ?? null" />
      </div>

      <p v-if="loading && !state" class="constellations-room-board-note">Connecting to the room…</p>
      <!-- F1 (#4602): the relationship graph — ring-laid avatars + typed coloured edges. -->
      <ConstellationGraph
        v-else-if="memberCount"
        :members="state.members"
        :relationships="state.relationships || []"
        :selected-ids="selectedIds"
        @select="toggleSelect"
      />
      <p v-else class="constellations-room-board-note">Waiting for players to join…</p>

      <!-- F2 (#4603): pinned right-edge relationship control panel. -->
      <div class="constellations-room-panel">
        <ConstellationControlPanel
          :types="relationshipTypes"
          :pair-selected="selectedIds.length === 2"
          :busy="editBusy"
          @set-type="setType"
          @clear="clearPair"
          @undo="undo"
          @redo="redo"
        />
        <p v-if="editError" class="constellations-room-error" data-testid="edit-error">{{ editError }}</p>
      </div>

      <!-- Relationship summary: F4 (#4605). Mounted bottom-centre, matching
           the wireframe's POLYAMORY box (gate resolved in #4605's design
           comment — the earlier bottom-left placeholder here predated that
           resolution). -->
      <div class="constellations-room-summary" data-testid="summary-mount">
        <ConstellationsSummary :members="state?.members || []" :relationships="state?.relationships || []" />
      </div>
    </section>

    <button
      type="button"
      class="constellations-room-leave"
      data-testid="leave-room"
      @click="leave"
    >
      Leave room
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { useRoomSync } from '../../../composables/useRoomSync.js';
import ConstellationsDice from '../../../components/constellations/ConstellationsDice.vue';
import ConstellationGraph from '../../../components/constellations/ConstellationGraph.vue';
import ConstellationsSummary from '../../../components/constellations/ConstellationsSummary.vue';
import ConstellationControlPanel from '../../../components/constellations/ConstellationControlPanel.vue';

const route = useRoute();
const router = useRouter();

const code = computed(() => route.params.code || '');

const { state, loading, error, start } = useRoomSync(() => code.value);

// Live occupancy: current people in the room over the room's player slots.
// player_count is the room size chosen at create; occupancy is how many are
// currently present (D1 #4600 contract).
const occupancyLabel = computed(() => {
  const s = state.value;
  const here = s?.occupancy ?? 0;
  const size = s?.player_count;
  return size ? `${here} / ${size}` : String(here);
});
const occupancyTitle = computed(() => {
  const size = state.value?.player_count;
  return size ? `${state.value?.occupancy ?? 0} of ${size} players present` : 'players present';
});

const memberCount = computed(() => state.value?.members?.length ?? 0);

// Encode the room's deep-link so a scan lands a member on this room. Uses the
// shared external QR service already used by QrGenerator.vue.
const qrUrl = computed(() => {
  if (!code.value) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = `${origin}/member/shared/constellations/room/${encodeURIComponent(code.value)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=112x112&margin=0&data=${encodeURIComponent(joinUrl)}`;
});

function leave() {
  router.push({ path: '/member/shared/constellations' });
}

// ---- F2 (#4603): selection + B1/C1 edit calls -----------------------------

// A2 vocabulary rows, normalized ({ id, code, label, colour } — the server
// serializes the gorm.Model id as "ID", the tagged fields lowercase).
const relationshipTypes = ref([]);
const selectedIds = ref([]);
const editBusy = ref(false);
const editError = ref(null);

async function loadRelationshipTypes() {
  try {
    const res = await axios.get('/api/constellations/relationship-types');
    const rows = res.data?.relationship_types || [];
    relationshipTypes.value = rows.map((t) => ({
      id: t.ID ?? t.id,
      code: t.code,
      label: t.label,
      colour: t.colour,
    }));
  } catch {
    // The panel renders empty; the next explicit action will surface an error.
  }
}

function toggleSelect(userId) {
  const current = selectedIds.value;
  if (current.includes(userId)) {
    selectedIds.value = current.filter((id) => id !== userId);
  } else {
    // Keep at most two: the oldest pick drops when a third player is chosen.
    selectedIds.value = [...current, userId].slice(-2);
  }
}

// Runs one B1/C1 edit call, then refreshes the room state so the caller's own
// board converges immediately (other viewers converge on the ~1.5s poll).
async function runEdit(call) {
  if (editBusy.value) return;
  editBusy.value = true;
  editError.value = null;
  try {
    await call();
    await refresh();
  } catch (err) {
    editError.value = err.response?.data?.error?.message || 'Edit failed — try again';
  } finally {
    editBusy.value = false;
  }
}

function setType(typeId) {
  const [from, to] = selectedIds.value;
  if (!from || !to) return;
  runEdit(async () => {
    await axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/relationships/set`, {
      from_user_id: from,
      to_user_id: to,
      type_id: typeId,
    });
    selectedIds.value = [];
  });
}

function clearPair() {
  const [from, to] = selectedIds.value;
  if (!from || !to) return;
  runEdit(async () => {
    await axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/relationships/clear`, {
      from_user_id: from,
      to_user_id: to,
    });
    selectedIds.value = [];
  });
}

function undo() {
  runEdit(() =>
    axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/relationships/undo`),
  );
}

function redo() {
  runEdit(() =>
    axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/relationships/redo`),
  );
}

onMounted(() => {
  start();
  loadRelationshipTypes();
});
</script>

<style scoped>
.constellations-room {
  min-height: calc(100vh - 4rem);
  margin: -1rem;
  padding: 2rem 1.5rem 3rem;
  background: #0b1020;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.constellations-room-header {
  width: 100%;
  max-width: 52rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.constellations-room-heading {
  text-align: left;
}

.constellations-room-title {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.04em;
}

.constellations-room-code {
  margin: 0.5rem 0 0;
  color: #94a3b8;
  font-size: 1rem;
}

.constellations-room-code-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.5rem;
  letter-spacing: 0.25em;
  color: #f8fafc;
}

.constellations-room-meta {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.constellations-room-occupancy {
  text-align: right;
  display: flex;
  flex-direction: column;
}

.constellations-room-occupancy-count {
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.constellations-room-occupancy-label {
  color: #94a3b8;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.constellations-room-qr {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.constellations-room-qr img {
  border-radius: 8px;
  background: #f8fafc;
  padding: 4px;
}

.constellations-room-qr figcaption {
  color: #94a3b8;
  font-size: 0.7rem;
}

.constellations-room-error {
  margin: 1rem 0 0;
  color: #fca5a5;
  font-size: 0.85rem;
}

.constellations-room-board {
  position: relative;
  width: 100%;
  max-width: 52rem;
  flex: 1 1 auto;
  margin-top: 1.5rem;
  min-height: 22rem;
  border: 1px solid #1e293b;
  border-radius: 16px;
  background: radial-gradient(circle at 50% 40%, #131a33 0%, #0b1020 70%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.constellations-room-dice {
  position: absolute;
  top: 1rem;
  left: 1rem;
}

.constellations-room-summary {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 26rem;
  padding: 0 1rem;
}

/* F2: the control panel pins to the board's right edge (wireframe). On
   narrow screens the overlay would cover the graph and swallow avatar taps,
   so the panel drops into flow beneath the board instead. */
.constellations-room-panel {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: 9rem;
}

@media (max-width: 48rem) {
  .constellations-room-board {
    flex-direction: column;
    padding-bottom: 1rem;
  }

  .constellations-room-panel {
    position: static;
    transform: none;
    margin-top: 1rem;
    max-width: none;
  }
}

.constellations-room-board-note {
  color: #94a3b8;
  text-align: center;
  max-width: 26rem;
}

.constellations-room-leave {
  margin-top: 2rem;
  background: transparent;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  cursor: pointer;
}

.constellations-room-leave:hover {
  background: #1e293b;
}
</style>
