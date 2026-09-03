<template>
  <!-- #4848: the relationship-event history — the operator asked for "the
       sequence of relationship forming messages as a scrollable element similar
       to the rulebook". Reads A1's append-only log (#4847), which the room shell
       fetches and resolves to display rows (names from room state, type label +
       colour from the A2 vocabulary). Privacy is inherited from A1: the server
       scopes events to edges the viewer is party to (arbiter ruling #4847
       c27504), so this face only ever lists events the caller may see — it does
       not re-filter. Read-only; chronological, oldest first, like the rulebook. -->
  <div class="constellation-history" data-testid="history-face">
    <h2 class="constellation-history-title">Relationship history</h2>
    <p class="constellation-history-note">
      The connections drawn in this room, in order — only the ones you're part of.
    </p>

    <p v-if="loading && !entries.length" class="constellation-history-status" data-testid="history-loading">
      Loading history…
    </p>
    <p v-else-if="error" class="constellation-history-status" data-testid="history-error">{{ error }}</p>
    <p v-else-if="!entries.length" class="constellation-history-status" data-testid="history-empty">
      No connections yet. When you set or clear a relationship, it shows up here.
    </p>

    <ol v-else class="constellation-history-list" data-testid="history-list">
      <li v-for="e in entries" :key="e.id" class="constellation-history-item" :data-kind="e.kind">
        <span class="constellation-history-dot" :style="{ background: e.kind === 'set' ? e.colour : '#475569' }" aria-hidden="true" />
        <!-- #4945 item 8: the two participants' profile icons flank the status
             change for readability. Avatars are resolved upstream from room
             state (the already-visible members), so a missing one falls back to
             a neutral placeholder rather than a broken image. Decorative — the
             names carry the accessible meaning — so the icons are aria-hidden. -->
        <img
          v-if="e.fromAvatar"
          class="constellation-history-avatar"
          :src="e.fromAvatar"
          alt=""
          aria-hidden="true"
          width="24"
          height="24"
          data-testid="history-avatar-from"
        />
        <span v-else class="constellation-history-avatar constellation-history-avatar-empty" aria-hidden="true" data-testid="history-avatar-from" />
        <span class="constellation-history-body">
          <span class="constellation-history-pair">{{ e.fromName }} <span class="constellation-history-arrow">{{ e.kind === 'set' ? '→' : '—' }}</span> {{ e.toName }}</span>
          <!-- #4883 item 7: ALL CAPS type name, same as the dictionary legend
               and the selected-relationship box. -->
          <span v-if="e.kind === 'set'" class="constellation-history-type" :style="{ color: e.colour }">{{ e.typeLabel.toUpperCase() }}</span>
          <span v-else class="constellation-history-type constellation-history-type-cleared">connection cleared</span>
        </span>
        <img
          v-if="e.toAvatar"
          class="constellation-history-avatar"
          :src="e.toAvatar"
          alt=""
          aria-hidden="true"
          width="24"
          height="24"
          data-testid="history-avatar-to"
        />
        <span v-else class="constellation-history-avatar constellation-history-avatar-empty" aria-hidden="true" data-testid="history-avatar-to" />
        <time v-if="e.time" class="constellation-history-time" :datetime="e.iso">{{ e.time }}</time>
      </li>
    </ol>
  </div>
</template>

<script setup>
// Presentational, prop-driven — the room shell owns the fetch and the name/type
// resolution (mirrors ConstellationDictionary). `entries` is oldest-first,
// already resolved to:
//   { id, kind: 'set'|'clear', fromName, toName, typeLabel, colour, time, iso }
defineProps({
  entries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
});
</script>

<style scoped>
.constellation-history {
  height: 100%;
  overflow-y: auto;
  padding: 20px 22px 28px;
  color: #f8fafc;
  background: #0b1020;
  box-sizing: border-box;
}

.constellation-history-title {
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 700;
}

.constellation-history-note {
  margin: 0 0 16px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.constellation-history-status {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.constellation-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.constellation-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-bottom: 1px solid #1e293b;
}

.constellation-history-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}

/* #4945 item 8: the participant profile icons flanking each row. Fixed round
   chips so a tall or wide avatar cannot distort the row; the empty variant is a
   neutral filled circle for a participant with no avatar or one no longer in
   the room. */
.constellation-history-avatar {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  object-fit: cover;
  flex: 0 0 auto;
  background: #131a33;
  border: 1px solid #334155;
}

.constellation-history-avatar-empty {
  display: block;
}

.constellation-history-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}

.constellation-history-pair {
  font-size: 0.9rem;
  font-weight: 600;
}

.constellation-history-arrow {
  color: #94a3b8;
  padding: 0 2px;
}

.constellation-history-type {
  font-size: 0.75rem;
  font-weight: 600;
}

.constellation-history-type-cleared {
  color: #94a3b8;
  font-weight: 500;
  font-style: italic;
}

.constellation-history-time {
  flex: 0 0 auto;
  font-size: 0.7rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
</style>
