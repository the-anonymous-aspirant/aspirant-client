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

    <!-- Board canvas: F1 avatars + F2 relationship lines (#4602/#4603) mount
         into the front face. The board is a two-sided card (#4806 ask 5): the
         rules live on the back and are reached by flipping in place, never by
         navigating away. -->
    <div class="constellations-room-board-stage">
      <section
        class="constellations-room-board"
        :class="{ 'is-flipped': showRules }"
        data-testid="board-canvas"
        aria-label="Relationship board"
      >
        <!-- `inert` rather than aria-hidden: the turned-away face is still in the
             layout, so without it the board's buttons stay tab-reachable and
             clickable through a face the viewer cannot see. -->
        <div class="constellations-room-face constellations-room-face-front" :inert="showRules">
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

          <!-- F2 (#4603): pinned right-edge relationship control panel. Its
               pair picker is scoped to a live selection (#4806 ask 3); the
               history arrows inside it stay mounted regardless. -->
          <div class="constellations-room-panel">
            <ConstellationControlPanel
              :types="relationshipTypes"
              :open="selectedIds.length > 0"
              :selected-count="selectedIds.length"
              :pair-selected="selectedIds.length === 2"
              :busy="editBusy"
              @set-type="setType"
              @clear="clearPair"
              @undo="undo"
              @redo="redo"
              @dismiss="dismissPicker"
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
        </div>

        <!-- Back face: the rulebook, embedded rather than duplicated. -->
        <div class="constellations-room-face constellations-room-face-back" :inert="!showRules">
          <iframe
            v-if="rulesEverOpened"
            class="constellations-room-rulebook"
            :src="RULEBOOK_URL"
            title="Constellations rulebook"
            data-testid="rules-face"
          ></iframe>
        </div>
      </section>
    </div>

    <div class="constellations-room-actions">
      <button
        type="button"
        class="constellations-room-rules"
        data-testid="read-rules"
        :aria-expanded="showRules"
        @click="toggleRules"
      >
        {{ showRules ? 'Back to the game' : 'Read the rules' }}
      </button>
      <button
        type="button"
        class="constellations-room-leave"
        data-testid="leave-room"
        @click="leave"
      >
        Leave room
      </button>
    </div>
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

const { state, loading, error, start, refresh } = useRoomSync(() => code.value);

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

// The rulebook, bundled as a public static page (#4587-H2 / #4772). The
// original epic body pointed at /api/uploads/… — but that is the system_3 admin
// upload store (behind X-System3-Auth); aspirant-server has no /uploads/:id
// route, so the link 404'd for every member (#4772 G1 re-walk finding). Serving
// the rulebook as a client static asset resolves 200 for any session.
//
// #4806 ask 5 supersedes how it is REACHED, not where it lives: "the 'Read the
// rules' should not bring you to an entirely new page, just do a flip of the
// game room". #4772 opened it in a new tab. The board is now a two-sided card
// and this URL is embedded on its back face, so the page stays put and the
// rulebook keeps exactly one source of truth — an iframe rather than fetching
// and re-injecting its markup, which would drag its document-level <style>
// (`body { … }`) into the app's own stylesheet.
const RULEBOOK_URL = '/constellations-rulebook.html';

const showRules = ref(false);
// The iframe is mounted lazily on the first flip and then kept, so opening the
// rules does not cost a fetch on every board load and flipping back and forth
// is instant (and does not lose the reader's scroll position).
const rulesEverOpened = ref(false);

function toggleRules() {
  if (!showRules.value) rulesEverOpened.value = true;
  showRules.value = !showRules.value;
}

// Leaving must tell the server (#4587-H1 / #4771). A bare router.push left
// membership open server-side: occupancy never dropped, the room never emptied
// (so it was never slated for deletion), and the one-game-per-user lock stayed
// held — trapping the player out of every future create/join. Call the leave
// endpoint, then navigate. Tolerate a 4xx/network error (stale or already-gone
// membership) so a blip can never trap a player in the room UI.
async function leave() {
  try {
    if (code.value) {
      await axios.post(
        `/api/constellations/rooms/${encodeURIComponent(code.value)}/leave`,
        {},
      );
    }
  } catch {
    // Best-effort: navigating away must not depend on the call succeeding.
  }
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

// Ask 3: the picker is a live gesture, so it needs a way out that is not an
// edit. Dropping the selection closes it and leaves the graph untouched.
function dismissPicker() {
  selectedIds.value = [];
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

/* The stage owns the size and the perspective; the board inside it is the
   card that turns (#4806 ask 5). Perspective has to live on an ANCESTOR of
   the rotating element — set on the element itself it applies to that
   element's children, not to its own rotation, and the flip reads flat. */
.constellations-room-board-stage {
  position: relative;
  width: 100%;
  max-width: 52rem;
  flex: 1 1 auto;
  margin-top: 1.5rem;
  min-height: 22rem;
  perspective: 1600px;
}

.constellations-room-board {
  position: relative;
  width: 100%;
  transform-style: preserve-3d;
  transition: transform 620ms cubic-bezier(0.2, 0.7, 0.25, 1);
}

.constellations-room-board.is-flipped {
  transform: rotateY(180deg);
}

.constellations-room-face {
  border: 1px solid #1e293b;
  border-radius: 16px;
  background: radial-gradient(circle at 50% 40%, #131a33 0%, #0b1020 70%);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* The FRONT face stays in normal flow and keeps the board's original layout
   contract verbatim — relative positioning for the dice/panel/summary that
   anchor to it, and the flex centering the graph relies on. It must keep
   sizing the card: the ring graph is `width:100%; max-width:30rem` at a 1:1
   viewBox, so it is taller than the 22rem floor and the board has always grown
   to fit it. Absolutely positioning this face took it out of flow, the card
   collapsed to 22rem, and the overflowing SVG then sat on top of the Read the
   rules / Leave buttons and swallowed their clicks. */
.constellations-room-face-front {
  position: relative;
  min-height: 22rem;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The BACK face is the one that is stacked, filling whatever box the front
   face established. */
.constellations-room-face-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  overflow: hidden; /* the iframe scrolls, the card does not grow */
}

.constellations-room-rulebook {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 16px;
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .constellations-room-board {
    transition: none;
  }
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

.constellations-room-actions {
  margin-top: 2rem;
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.constellations-room-rules,
.constellations-room-leave {
  background: transparent;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  line-height: 1.5;
}

.constellations-room-rules:hover,
.constellations-room-leave:hover {
  background: #1e293b;
}
</style>
