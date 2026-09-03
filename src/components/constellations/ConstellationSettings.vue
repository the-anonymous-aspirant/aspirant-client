<template>
  <!-- #4848: the settings face. The operator asked that the board be "much
       clearer", so the room chrome that used to sit on the board — the room id,
       the live x/y occupancy, and the Scan-to-join QR — plus the Leave action
       move here, off the board. It also shows the SIGNED-IN player's own avatar
       and game name (operator comment 27361): the confusion behind #4383 was a
       player acting while signed in as a different account than they thought, and
       a visible identity is what prevents it. Read the caller's own identity, not
       a room slot. Scrollable, same back-face treatment as the rulebook. -->
  <div class="constellation-settings" data-testid="settings-face">
    <h2 class="constellation-settings-title">Settings</h2>

    <section class="constellation-settings-identity" data-testid="settings-identity">
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="gameUsername ? `${gameUsername} avatar` : 'Your avatar'"
        class="constellation-settings-avatar"
        width="48"
        height="48"
      />
      <div v-else class="constellation-settings-avatar constellation-settings-avatar-empty" aria-hidden="true"></div>
      <div class="constellation-settings-identity-text">
        <span class="constellation-settings-identity-label">Signed in as</span>
        <span class="constellation-settings-identity-name" data-testid="settings-username">
          {{ gameUsername || 'no game name set' }}
        </span>
      </div>
    </section>

    <dl class="constellation-settings-facts">
      <div class="constellation-settings-fact">
        <dt>Room</dt>
        <dd class="constellation-settings-code" data-testid="room-code">{{ code }}</dd>
      </div>
      <div class="constellation-settings-fact">
        <dt>In the room</dt>
        <dd data-testid="occupancy" :title="occupancyTitle">{{ occupancyLabel }}</dd>
      </div>
    </dl>

    <section class="constellation-settings-join">
      <figure class="constellation-settings-qr">
        <img
          v-if="qrUrl"
          :src="qrUrl"
          :alt="`Join QR for room ${code}`"
          width="132"
          height="132"
          data-testid="join-qr"
        />
        <figcaption>Scan to join</figcaption>
      </figure>
    </section>

    <button
      type="button"
      class="constellation-settings-leave"
      data-testid="leave-room"
      @click="$emit('leave')"
    >
      Leave room
    </button>
  </div>
</template>

<script setup>
// Presentational, prop-driven — the room shell owns the QR encoding, the leave
// call and the caller's identity lookup (mirrors the other faces).
defineProps({
  code: { type: String, default: '' },
  occupancyLabel: { type: String, default: '' },
  occupancyTitle: { type: String, default: '' },
  qrUrl: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  gameUsername: { type: String, default: '' },
});
defineEmits(['leave']);
</script>

<style scoped>
.constellation-settings {
  height: 100%;
  overflow-y: auto;
  padding: 20px 22px 28px;
  color: #f8fafc;
  background: #0b1020;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.constellation-settings-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.constellation-settings-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.constellation-settings-avatar {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  object-fit: cover;
  background: #131a33;
  border: 1px solid #334155;
  flex: 0 0 auto;
}

.constellation-settings-avatar-empty {
  display: block;
}

.constellation-settings-identity-text {
  display: flex;
  flex-direction: column;
}

.constellation-settings-identity-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.constellation-settings-identity-name {
  font-size: 1.05rem;
  font-weight: 600;
}

.constellation-settings-facts {
  margin: 0;
  display: flex;
  gap: 28px;
}

.constellation-settings-fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.constellation-settings-fact dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.constellation-settings-fact dd {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.constellation-settings-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.2em;
}

.constellation-settings-join {
  display: flex;
}

.constellation-settings-qr {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.constellation-settings-qr img {
  border-radius: 8px;
  background: #f8fafc;
  padding: 6px;
}

.constellation-settings-qr figcaption {
  color: #94a3b8;
  font-size: 0.75rem;
}

.constellation-settings-leave {
  align-self: flex-start;
  background: transparent;
  border: 1px solid #7f1d1d;
  color: #fca5a5;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  line-height: 1.5;
}

.constellation-settings-leave:hover {
  background: #7f1d1d;
  color: #fef2f2;
}
</style>
