<template>
  <!-- Minimal room shell (#4598 / #4587-B3). Its only job in this row is to be
       the route the landing lobby lands on after create/join, showing the room
       code. #4587-B1..F4 (board, live poll, graph, dice, summary) mount here;
       #4601 (E1) replaces this placeholder with the real board shell. Kept
       deliberately small so it does not pre-empt that work. -->
  <div class="constellations-room">
    <header class="constellations-room-header">
      <h1 class="constellations-room-title">Constellations</h1>
      <p class="constellations-room-code">
        Room <span class="constellations-room-code-value" data-testid="room-code">{{ code }}</span>
      </p>
    </header>
    <p class="constellations-room-note">
      The board is on its way. Share the room code above so others can join.
    </p>
    <button type="button" class="constellations-room-leave" data-testid="leave-room" @click="leave">
      Leave room
    </button>
  </div>
</template>

<script>
// Placeholder in-room view. The board (#4601 + F1–F4) replaces the body; the
// route contract (`:code` param, /member/shared/constellations/room/:code) is
// what #4598 establishes and later rows build on.
export default {
  name: 'ConstellationsRoom',
  computed: {
    code() {
      return this.$route.params.code || '';
    },
  },
  methods: {
    leave() {
      this.$router.push({ path: '/member/shared/constellations' });
    },
  },
};
</script>

<style scoped>
.constellations-room {
  min-height: calc(100vh - 4rem);
  margin: -1rem;
  padding: 3rem 1.5rem;
  background: #0b1020;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-align: center;
}

.constellations-room-header {
  margin-bottom: 1.5rem;
}

.constellations-room-title {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.04em;
}

.constellations-room-code {
  margin: 0.75rem 0 0;
  color: #94a3b8;
  font-size: 1rem;
}

.constellations-room-code-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.5rem;
  letter-spacing: 0.25em;
  color: #f8fafc;
}

.constellations-room-note {
  color: #94a3b8;
  max-width: 30rem;
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
