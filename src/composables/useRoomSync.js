import { ref, onUnmounted } from 'vue';
import axios from 'axios';

// useRoomSync — short-poll the D1 room-state aggregate (#4587-D1, #4600) and
// expose it as reactive state for the in-room board shell (#4587-E1) and the
// F1–F4 children (#4602–4606) that mount into it.
//
// Design decision (per D1): the board syncs by a dumb ~1–2s short-poll of one
// aggregate GET, not push. This copies Scratchpad.vue's setInterval/cleanup
// discipline: swallow 401 (main.js's global interceptor owns auth redirects),
// never let a blip null out already-rendered state, and clear the timer on
// unmount.
//
// The constellations handlers return the DTO directly (no { status, data }
// envelope), while some shared paths use the standard envelope; unwrap handles
// both, matching Constellations.vue.
const unwrap = (res) =>
  res && res.data && typeof res.data === 'object' && 'data' in res.data ? res.data.data : res.data;

const POLL_INTERVAL_MS = 1500; // ~1–2s short-poll cadence

// getRoomState fetches the D1 aggregate for one room code. Returns the room
// state DTO: { code, player_count, status, occupancy, members, relationships,
// dice, history_cursor }.
export async function getRoomState(code) {
  const res = await axios.get(`/api/constellations/rooms/${encodeURIComponent(code)}/state`);
  return unwrap(res);
}

// useRoomSync(code) returns reactive handles the shell renders from. `code` may
// be a plain string or a ref/getter; it is resolved on each poll so a route
// change is picked up without re-instantiating.
export function useRoomSync(code) {
  const state = ref(null);
  const loading = ref(true);
  const error = ref(null);

  let timer = null;
  let inFlight = false;

  const resolveCode = () => {
    const c = typeof code === 'function' ? code() : code && code.value !== undefined ? code.value : code;
    return c || '';
  };

  async function refresh() {
    // Don't stack requests: a slow poll must not pile up behind itself.
    if (inFlight) return;
    const c = resolveCode();
    if (!c) {
      loading.value = false;
      return;
    }
    inFlight = true;
    try {
      state.value = await getRoomState(c);
      error.value = null;
    } catch (err) {
      // A 401 is handled globally (main.js interceptor); swallow transient poll
      // errors so a blip doesn't wipe an already-rendered board.
      if (err.response?.status !== 401) {
        error.value = err.response?.data?.error?.message || 'Lost sync with the room';
      }
    } finally {
      loading.value = false;
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    refresh(); // prime immediately so the shell doesn't wait a full interval
    timer = setInterval(refresh, POLL_INTERVAL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  onUnmounted(stop);

  return { state, loading, error, refresh, start, stop };
}
