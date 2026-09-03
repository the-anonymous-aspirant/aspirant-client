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
    <!-- #4848: the header is now just the title. The room code, live occupancy
         and the Scan-to-join QR that used to sit here as board furniture moved
         into the settings face — the operator asked to make the board "much
         clearer", so chrome that is not the board comes off it. -->
    <header class="constellations-room-header">
      <div class="constellations-room-heading">
        <h1 class="constellations-room-title">Constellations</h1>
      </div>
    </header>

    <p v-if="error && !blocked" class="constellations-room-error" data-testid="room-error">{{ error }}</p>

    <!-- #4822: a scanned link (#4810) seats a player before they ever meet the
         lobby's game-username gate, so a first-time scanner is on the board
         as "Player N" with no affordance to name themselves — leaving would
         free their seat. This banner is the in-room affordance: it shows only
         for the caller's own member row, only while that row's game_username
         is empty, and clears itself the moment the poll reflects a save. -->
    <div v-if="needsGameName" class="constellations-room-name-prompt" data-testid="name-prompt">
      <p class="constellations-room-name-prompt-text">
        You're on the board as “{{ myMemberFallbackName }}” — set a game name so it shows instead.
      </p>
      <form class="constellations-room-name-prompt-form" @submit.prevent="saveGameUsername">
        <input
          v-model="gameUsernameDraft"
          type="text"
          maxlength="40"
          placeholder="e.g. Vega"
          aria-label="Game username"
          class="constellations-room-name-prompt-input"
          data-testid="name-prompt-input"
        />
        <button
          type="submit"
          class="constellations-room-rules"
          data-testid="name-prompt-save"
          :disabled="!gameUsernameDraft.trim() || savingGameName"
        >
          {{ savingGameName ? 'Saving…' : 'Save name' }}
        </button>
      </form>
      <p v-if="nameError" class="constellations-room-error" data-testid="name-prompt-error">{{ nameError }}</p>
    </div>

    <!-- Entry (#4806 ask 1). A scanned link now JOINS you before it tries to
         read the board, so the player never meets the D1 poll's 403. While the
         join is in flight the shell shows nothing but this line; if the join is
         refused, the refusal replaces the board rather than sitting under a
         board that cannot render. -->
    <p v-if="entering" class="constellations-room-board-note" data-testid="joining-room">
      Joining the room…
    </p>

    <section v-else-if="blocked" class="constellations-room-blocked" data-testid="blocked-state">
      <h2 class="constellations-room-blocked-title" data-testid="blocked-title">{{ blockedTitle }}</h2>
      <!-- The code stays on the blocked view — it names which room turned you
           away. On the board it now lives in settings, but settings is
           unreachable while blocked, so the code is shown here directly. -->
      <p class="constellations-room-blocked-code">Room <span data-testid="room-code">{{ code }}</span></p>
      <p class="constellations-room-blocked-message" data-testid="blocked-message">{{ blocked.message }}</p>
      <p v-if="blockedGuidance" class="constellations-room-blocked-guidance" data-testid="blocked-guidance">
        {{ blockedGuidance }}
      </p>
      <div class="constellations-room-blocked-actions">
        <router-link
          v-if="blocked.activeRoomCode"
          :to="`/member/shared/constellations/room/${blocked.activeRoomCode}`"
          class="constellations-room-rules"
          data-testid="go-to-active-room"
        >Go to room {{ blocked.activeRoomCode }}</router-link>
        <button
          type="button"
          class="constellations-room-leave"
          data-testid="back-to-lobby"
          @click="backToLobby"
        >
          Back to Constellations
        </button>
      </div>
    </section>

    <!-- Board canvas: F1 avatars + F2 relationship lines (#4602/#4603) mount
         into the front face. The board is a two-sided card (#4806 ask 5): the
         rules live on the back and are reached by flipping in place, never by
         navigating away. -->
    <div v-else class="constellations-room-board-stage">
      <section
        class="constellations-room-board"
        :class="{ 'is-flipped': isFlipped }"
        data-testid="board-canvas"
        aria-label="Relationship board"
      >
        <!-- `inert` rather than aria-hidden: the turned-away face is still in the
             layout, so without it the board's buttons stay tab-reachable and
             clickable through a face the viewer cannot see. -->
        <div class="constellations-room-face constellations-room-face-front" :inert="isFlipped">
          <!-- Dice cluster (#4587-F3 / #4604). Faces come from the D1 poll's
               `dice` field so every viewer converges on the same server-resolved
               roll; rolling.vue talks to the roll endpoint directly. -->
          <div class="constellations-room-dice" data-testid="dice-mount">
            <ConstellationsDice v-if="code" :code="code" :dice="state?.dice ?? null" :loading="loading" />
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

        <!-- Back face: one of two references — the rulebook (#4811) or the
             relationship/goal dictionary (#4807-B1). Which is shown follows
             boardFace; the flip itself is shared. -->
        <div class="constellations-room-face constellations-room-face-back" :inert="!isFlipped">
          <iframe
            v-if="showRules && rulesEverOpened"
            class="constellations-room-rulebook"
            :src="RULEBOOK_URL"
            title="Constellations rulebook"
            data-testid="rules-face"
          ></iframe>
          <ConstellationDictionary
            v-else-if="showDictionary && dictionaryEverOpened"
            :relationship-types="relationshipTypes"
            :goal-cards="goalCards"
            :selected-card-id="myGoalCardId"
            :achieved="myGoalAchieved"
            :busy="goalBusy"
            @select="selectGoal"
            @clear="clearGoal"
          />
          <ConstellationHistory
            v-else-if="showHistory && historyEverOpened"
            :entries="historyEntries"
            :loading="historyLoading"
            :error="historyError"
          />
          <ConstellationSettings
            v-else-if="showSettings && settingsEverOpened"
            :code="code"
            :occupancy-label="occupancyLabel"
            :occupancy-title="occupancyTitle"
            :qr-url="qrUrl"
            :avatar-url="myAvatarUrl"
            :game-username="myGameUsername"
            @leave="leave"
          />
        </div>
      </section>
    </div>

    <!-- #4848: the bottom bar is now a compact set of icon controls selecting
         which face the spinning card shows (game / rules / cards / history /
         settings). Leave moved into settings. Hidden while entry is in flight or
         refused (#4806 ask 1): there is no board to flip and no room to leave. -->
    <ConstellationRoomNav
      v-if="!entering && !blocked"
      :active-face="boardFace"
      @select="selectFace"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { useRoomSync, unwrap } from '../../../composables/useRoomSync.js';
import ConstellationsDice from '../../../components/constellations/ConstellationsDice.vue';
import ConstellationGraph from '../../../components/constellations/ConstellationGraph.vue';
import ConstellationsSummary from '../../../components/constellations/ConstellationsSummary.vue';
import ConstellationControlPanel from '../../../components/constellations/ConstellationControlPanel.vue';
import ConstellationDictionary from '../../../components/constellations/ConstellationDictionary.vue';
import ConstellationHistory from '../../../components/constellations/ConstellationHistory.vue';
import ConstellationSettings from '../../../components/constellations/ConstellationSettings.vue';
import ConstellationRoomNav from '../../../components/constellations/ConstellationRoomNav.vue';

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

// ---- #4822: in-room game-name affordance -----------------------------
//
// The D1 room-state aggregate (RoomStateMember) carries no self-flag, so the
// caller's own row is found by matching user_id against GET /api/profile's
// ID — the same envelope Sidebar.vue's avatar fetch and useProfile.js use.
// Best-effort: if this fails the banner just never renders, which is no
// worse than the pre-#4822 hole this task fixes.
const myUserId = ref(null);
async function loadMyUserId() {
  try {
    const profile = unwrap(await axios.get('/api/profile'));
    myUserId.value = profile?.ID ?? null;
  } catch {
    // Board still renders; the caller keeps their "Player N" seat.
  }
}

const myMember = computed(() => {
  const id = myUserId.value;
  if (id == null) return null;
  return (state.value?.members || []).find((m) => m.user_id === id) || null;
});
const needsGameName = computed(() => !!myMember.value && !myMember.value.game_username);
const myMemberFallbackName = computed(() => `Player ${myMember.value?.slot ?? ''}`.trim());

const gameUsernameDraft = ref('');
const savingGameName = ref(false);
const nameError = ref(null);

async function saveGameUsername() {
  const name = gameUsernameDraft.value.trim();
  if (!name || savingGameName.value) return;
  savingGameName.value = true;
  nameError.value = null;
  try {
    await axios.put('/api/constellations/profile', { game_username: name });
    gameUsernameDraft.value = '';
    await refresh();
  } catch (err) {
    nameError.value = err.response?.data?.error?.message || 'Could not save your game username.';
  } finally {
    savingGameName.value = false;
  }
}

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

// The board's back face carries one of two references — the rulebook (#4811) or
// the relationship/goal dictionary (#4807-B1). A single `boardFace` drives the
// flip so both reuse the same in-place rotation the operator asked for; the
// front is the game.
// #4848: the back face now carries one of four references — rules, the goal-card
// dictionary, the relationship history, or settings — selected by the bottom
// nav. The spinning card (#4806 ask 5) is unchanged; only WHAT it flips between
// grew. The front is always the game.
const boardFace = ref('game'); // 'game' | 'rules' | 'dictionary' | 'history' | 'settings'
const isFlipped = computed(() => boardFace.value !== 'game');
const showRules = computed(() => boardFace.value === 'rules');
const showDictionary = computed(() => boardFace.value === 'dictionary');
const showHistory = computed(() => boardFace.value === 'history');
const showSettings = computed(() => boardFace.value === 'settings');
// Each back-face reference is mounted lazily on its first flip and then kept, so
// opening it does not cost a fetch on every board load and flipping is instant.
const rulesEverOpened = ref(false);
const dictionaryEverOpened = ref(false);
const historyEverOpened = ref(false);
const settingsEverOpened = ref(false);

// One entry point for the nav: tapping the active face (or Game) flips back to
// the board; tapping another flips to it, mounting it on first open. History
// re-fetches on each open — the log is append-only, so a re-open should show
// anything drawn since.
function selectFace(face) {
  if (face === 'game' || boardFace.value === face) {
    boardFace.value = 'game';
    return;
  }
  if (face === 'rules') rulesEverOpened.value = true;
  else if (face === 'dictionary') dictionaryEverOpened.value = true;
  else if (face === 'history') {
    historyEverOpened.value = true;
    loadHistory();
  } else if (face === 'settings') settingsEverOpened.value = true;
  boardFace.value = face;
}

// ---- #4848: relationship-event history (reads A1 / #4847) ------------------
//
// A1's endpoint is oldest-first cursor pagination whose has_more/next_after_id
// describe the SCANNED page, not the visible one (the privacy filter runs in the
// serializer), so a page can return fewer visible events than it scanned while
// has_more is still true. The client keeps paging until has_more is false. The
// raw events are kept and resolved to display rows reactively, so names still
// fill in if the room-state poll lands members after the history fetch.
const historyEvents = ref([]);
const historyLoading = ref(false);
const historyError = ref(null);

async function loadHistory() {
  if (!code.value) return;
  historyLoading.value = true;
  historyError.value = null;
  try {
    const all = [];
    let afterId = 0;
    // Safety cap: a room's log is small, but never loop unbounded on a server
    // that keeps answering has_more.
    for (let page = 0; page < 100; page += 1) {
      const res = await axios.get(
        `/api/constellations/rooms/${encodeURIComponent(code.value)}/history`,
        { params: { after_id: afterId, limit: 200 } },
      );
      const events = res.data?.events || [];
      all.push(...events);
      if (!res.data?.has_more) break;
      const next = res.data?.next_after_id;
      if (!next || next === afterId) break;
      afterId = next;
    }
    historyEvents.value = all;
  } catch (err) {
    historyError.value = err.response?.data?.error?.message || 'Could not load the history.';
  } finally {
    historyLoading.value = false;
  }
}

function memberName(userId) {
  const m = (state.value?.members || []).find((x) => x.user_id === userId);
  if (!m) return 'Someone';
  return m.game_username || `Player ${m.slot ?? '?'}`;
}

function historyTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Resolved display rows, oldest-first. `set` carries a direction (from/to); a
// `clear` normalizes from/to to 0 and only the pair columns are meaningful, so
// name a clear from pair_low/pair_high.
const historyEntries = computed(() =>
  historyEvents.value.map((e) => {
    const t = relationshipTypes.value.find((rt) => rt.id === e.type_id);
    const isSet = e.kind === 'set';
    return {
      id: e.id,
      kind: e.kind,
      fromName: memberName(isSet ? e.from_user_id : e.pair_low),
      toName: memberName(isSet ? e.to_user_id : e.pair_high),
      typeLabel: t?.label || 'connection',
      colour: t?.colour || '#6366f1',
      time: historyTime(e.created_at),
      iso: e.created_at,
    };
  }),
);

// The caller's own identity for the settings face (#4848 / operator c27361).
// myMember is already the calling user's row (matched on the profile id), so the
// avatar and game name are the SIGNED-IN player's, not a room slot's.
const myAvatarUrl = computed(() => myMember.value?.avatar_url || '');
const myGameUsername = computed(() => myMember.value?.game_username || '');

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
const goalCards = ref([]);
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

// #4807-B1: the goal-card deck for the dictionary face. Server-sourced (A1's
// GET /goal-cards) so re-wording a card never means editing the client; the
// dictionary renders whatever the endpoint returns.
async function loadGoalCards() {
  try {
    const res = await axios.get('/api/constellations/goal-cards');
    const rows = res.data?.goal_cards || [];
    goalCards.value = rows.map((c) => ({
      id: c.ID ?? c.id,
      code: c.code,
      name: c.name,
      victoryCondition: c.victory_condition,
      minPlayers: c.min_players ?? null,
    }));
  } catch {
    // The dictionary shows its "could not be loaded" empty state.
  }
}

// #4807-B2: the caller's own selected goal + whether the server has detected it
// achieved. The /state `goal` is private to the viewer (A1 scopes it in the
// serializer), so this only ever reflects this player's own choice — a second
// player's goal is never in the payload to read.
const myGoalCardId = computed(() => state.value?.goal?.card_id ?? null);
const myGoalAchieved = computed(() => state.value?.goal?.achieved === true);
const goalBusy = ref(false);

async function selectGoal(cardId) {
  if (goalBusy.value) return;
  goalBusy.value = true;
  try {
    await axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/goal/set`, { goal_card_id: cardId });
    await refresh();
  } catch (err) {
    editError.value = err.response?.data?.error?.message || 'Could not select that goal.';
  } finally {
    goalBusy.value = false;
  }
}

async function clearGoal() {
  if (goalBusy.value) return;
  goalBusy.value = true;
  try {
    await axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/goal/clear`, {});
    await refresh();
  } catch (err) {
    editError.value = err.response?.data?.error?.message || 'Could not clear your goal.';
  } finally {
    goalBusy.value = false;
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

// ---- #4806 ask 1: entry -----------------------------------------------
//
// "When I've created a room, and I scan the code on another device, I get to a
// page that says that only a player in the room can see the board - but I'd
// like for that link to automatically add them to the game, if there is still
// space in the room. If not a message should be shown with elucidating
// details, of course."
//
// So the room route JOINS before it reads. Previously it went straight to the
// D1 poll, which answers 403 "Only a member of the room may view its state" to
// a non-member, and useRoomSync rendered that server prose verbatim — the exact
// sentence the operator objected to.
//
// The join is fired unconditionally, for members and non-members alike, because
// #4808 made it idempotent: a caller already seated in THIS room gets a 200
// with their existing slot, not a 409. That is what lets the creator re-open
// their own room link (the operator's own scenario) without a special case, and
// it is why the "existing member" path must never flash the blocked state.
const entering = ref(true);
// { reason, message, activeRoomCode, playerCount } | null. `reason` is #4808's
// machine-readable discriminator; `message` is the server's human sentence,
// which is always rendered so a reason this client does not recognise still
// says something true.
const blocked = ref(null);

const BLOCKED_TITLES = {
  room_full: 'This game is full',
  room_ended: 'This game has ended',
  room_not_found: 'No room with that code',
  already_in_game: 'You’re already in another game',
};

const blockedTitle = computed(
  () => BLOCKED_TITLES[blocked.value?.reason] || 'You could not join this room',
);

// The server message says WHAT blocked; this says what to do about it. Kept
// client-side because it is navigation advice about this app, not a fact the
// server holds.
const blockedGuidance = computed(() => {
  const b = blocked.value;
  if (!b) return '';
  switch (b.reason) {
    case 'room_full':
      // The seat count is already in the server's message; repeating it here
      // just makes the panel say the same thing twice. Guidance is advice.
      return 'Ask someone in the room to leave, or start a game of your own.';
    case 'room_ended':
      return 'Everyone left, so the room closed. Its code can be handed to a new game later, so a fresh scan may work another time.';
    case 'room_not_found':
      return 'Check the code and scan again — room codes are five characters.';
    case 'already_in_game':
      return 'A player can only be in one game at a time. Leave that one, then scan this code again.';
    default:
      return '';
  }
});

function backToLobby() {
  router.push({ path: '/member/shared/constellations' });
}

async function enterRoom() {
  if (!code.value) {
    entering.value = false;
    return;
  }
  try {
    await axios.post(`/api/constellations/rooms/${encodeURIComponent(code.value)}/join`, {});
    blocked.value = null;
    start();
    loadRelationshipTypes();
    loadGoalCards();
  } catch (err) {
    // 401 is the global interceptor's (main.js) — it owns the auth redirect, and
    // rendering a refusal underneath it would flash a wrong explanation on the
    // way out.
    if (err.response?.status === 401) return;
    const detail = err.response?.data?.error;
    blocked.value = {
      reason: detail?.reason || '',
      message: detail?.message || 'You could not be added to this room.',
      activeRoomCode: detail?.active_room_code || '',
      playerCount: detail?.room_player_count || 0,
    };
  } finally {
    entering.value = false;
  }
}

onMounted(() => {
  enterRoom();
  loadMyUserId();
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

/* Room code, occupancy and the join QR that used to sit in the header moved
   into the settings face (#4848); their styles live in ConstellationSettings. */

.constellations-room-error {
  margin: 1rem 0 0;
  color: #fca5a5;
  font-size: 0.85rem;
}

/* #4822: the in-room name affordance. A card rather than a bare line so it
   reads as an action, not another status sentence next to room-error. */
.constellations-room-name-prompt {
  width: 100%;
  max-width: 52rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #131a33;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.constellations-room-name-prompt-text {
  margin: 0;
  color: #f8fafc;
  font-size: 0.9rem;
}

.constellations-room-name-prompt-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.constellations-room-name-prompt-input {
  flex: 1 1 12rem;
  min-width: 0;
  background: #0b1020;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f8fafc;
  padding: 0.5rem 0.75rem;
  font: inherit;
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

/* #4806 ask 1: the blocked panel replaces the board when entry is refused. It
   deliberately reuses the action row's button shapes rather than inventing a
   second visual language for a state the player meets once. */
.constellations-room-blocked {
  width: 100%;
  max-width: 34rem;
  margin-top: 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  padding: 2rem 1.5rem;
  border: 1px solid #1e293b;
  border-radius: 16px;
  background: radial-gradient(circle at 50% 40%, #131a33 0%, #0b1020 70%);
}

.constellations-room-blocked-title {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.02em;
}

.constellations-room-blocked-code {
  margin: 0;
  color: #94a3b8;
  font-size: 0.85rem;
}

.constellations-room-blocked-code span {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.2em;
  color: #f8fafc;
}

.constellations-room-blocked-message {
  margin: 0;
  color: #f8fafc;
}

.constellations-room-blocked-guidance {
  margin: 0;
  color: #94a3b8;
  font-size: 0.9rem;
  max-width: 28rem;
}

.constellations-room-blocked-actions {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.constellations-room-board-note {
  color: #94a3b8;
  text-align: center;
  max-width: 26rem;
}

/* The bottom action row was replaced by ConstellationRoomNav (#4848). The
   .constellations-room-rules / -leave button shapes below are still used by the
   blocked state and the in-room name prompt. */
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
