<template>
  <div class="constellations-view">
    <h1>Constellations</h1>
    <p class="page-subtitle">
      The shared Connections sheet for the card game. Pick a game name, then
      create a room or join one with its code.
    </p>

    <div v-if="loadError" class="constellations-error" role="alert">{{ loadError }}</div>

    <!-- Game identity (distinct from the aspirant login). The icon reuses the
         account avatar per #4595 — the same PUT /api/profile/avatar path the
         Profile page uses, not a bespoke uploader. -->
    <section class="constellations-card">
      <h2 class="constellations-card-title">Your game identity</h2>
      <div class="constellations-identity">
        <UserAvatar :avatar-url="avatarUrl" :name="gameUsername || 'You'" :size="72" />
        <div class="constellations-identity-fields">
          <AspInput
            v-model="gameUsername"
            label="Game username"
            maxlength="40"
            placeholder="e.g. Vega"
            aria-label="Game username"
            data-testid="game-username"
          />
          <div class="constellations-identity-actions">
            <AspButton
              type="button"
              variant="primary"
              :disabled="!usernameDirty || savingName"
              data-testid="save-username"
              @click="saveUsername"
            >
              {{ savingName ? 'Saving…' : 'Save name' }}
            </AspButton>
            <AspButton
              type="button"
              variant="ghost"
              :disabled="uploadingIcon"
              data-testid="upload-icon"
              @click="pickIcon"
            >
              {{ uploadingIcon ? 'Uploading…' : (avatarUrl ? 'Change icon' : 'Upload icon') }}
            </AspButton>
            <input
              ref="iconInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="constellations-file-hidden"
              @change="onIconSelected"
            />
          </div>
          <p v-if="identityNotice" class="constellations-notice">{{ identityNotice }}</p>
          <p v-if="identityError" class="constellations-error" role="alert">{{ identityError }}</p>
        </div>
      </div>
    </section>

    <!-- Create or join a room. Gated on a set game username so every seat in a
         room carries an identity. -->
    <section class="constellations-card">
      <AspSegmented
        :options="modeOptions"
        :model-value="mode"
        aria-label="Create or join a room"
        @update:model-value="mode = $event"
      />

      <div v-if="mode === 'create'" class="constellations-panel">
        <AspSelect
          v-model="playerCount"
          label="Players"
          :options="playerCountOptions"
          aria-label="Number of players"
          data-testid="player-count"
        />
        <AspButton
          type="button"
          variant="primary"
          :disabled="!hasUsername || busy"
          data-testid="create-room"
          @click="createRoom"
        >
          {{ busy ? 'Creating…' : 'Create room' }}
        </AspButton>
      </div>

      <div v-else class="constellations-panel">
        <AspInput
          v-model="joinCode"
          label="Room code"
          maxlength="5"
          placeholder="ABCDE"
          aria-label="Room code"
          data-testid="join-code"
        />
        <AspButton
          type="button"
          variant="primary"
          :disabled="!hasUsername || !joinCode.trim() || busy"
          data-testid="join-room"
          @click="joinRoom"
        >
          {{ busy ? 'Joining…' : 'Join room' }}
        </AspButton>
      </div>

      <p v-if="!hasUsername" class="constellations-hint">
        Set a game username above before creating or joining a room.
      </p>
      <!-- #4798: when the refusal is "you are already in a game", the server
           names the room (active_room_code) so the user can go there and leave
           it. Without the code the message is unactionable. -->
      <p v-if="actionError" class="constellations-error" role="alert" data-testid="action-error">
        {{ actionError }}
        <router-link
          v-if="activeRoomCode"
          :to="`/applications/constellations/room/${activeRoomCode}`"
          class="constellations-error-link"
          data-testid="go-to-active-room"
        >Go to room {{ activeRoomCode }}</router-link>
      </p>
    </section>
  </div>
</template>

<script>
import axios from 'axios';
import { AspInput, AspButton, AspSelect, AspSegmented } from '@aspirant/design-system';
import UserAvatar from '../../../components/UserAvatar.vue';
import { useProfile } from '../../../composables/useProfile.js';

// Constellations landing / lobby (#4598 / #4587-B3). The app's shared
// "Connections sheet": pick a game identity, then create or join a room. This
// view owns the entry flow and the room route; the in-room board is #4601 and
// mounts at /applications/constellations/room/:code.
//
// Options API + a bare `axios` with relative /api paths, matching the other
// shared member views (FilesManager, Scratchpad). The session HttpOnly cookie
// carries auth same-origin. The game icon reuses the account avatar per #4595,
// so it goes through useProfile().uploadAvatar rather than a new uploader.

// The constellations handlers return the DTO directly (no { status, data }
// envelope), while the avatar path uses the standard envelope; this unwraps
// both safely.
const unwrap = (res) => (res && res.data && typeof res.data === 'object' && 'data' in res.data ? res.data.data : res.data);

export default {
  name: 'Constellations',
  components: { AspInput, AspButton, AspSelect, AspSegmented, UserAvatar },
  data() {
    return {
      gameUsername: '',
      savedUsername: '',
      avatarUrl: '',
      savingName: false,
      uploadingIcon: false,
      identityNotice: '',
      identityError: '',
      loadError: '',
      mode: 'create',
      modeOptions: [
        { value: 'create', label: 'Create' },
        { value: 'join', label: 'Join' },
      ],
      playerCount: 4,
      playerCountOptions: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) })),
      joinCode: '',
      busy: false,
      actionError: '',
      activeRoomCode: '',
    };
  },
  computed: {
    hasUsername() {
      return !!this.savedUsername;
    },
    usernameDirty() {
      const v = this.gameUsername.trim();
      return v.length > 0 && v !== this.savedUsername;
    },
  },
  async mounted() {
    await this.loadProfile();
  },
  methods: {
    async loadProfile() {
      this.loadError = '';
      try {
        const p = unwrap(await axios.get('/api/constellations/profile'));
        this.gameUsername = (p && p.game_username) || '';
        this.savedUsername = this.gameUsername;
        this.avatarUrl = (p && p.avatar_url) || '';
      } catch (e) {
        this.loadError = 'Could not load your game profile. You can still set one below.';
      }
    },
    async saveUsername() {
      const name = this.gameUsername.trim();
      if (!name) {
        this.identityError = 'Game username cannot be empty.';
        return;
      }
      this.savingName = true;
      this.identityError = '';
      this.identityNotice = '';
      try {
        const p = unwrap(await axios.put('/api/constellations/profile', { game_username: name }));
        this.gameUsername = (p && p.game_username) || name;
        this.savedUsername = this.gameUsername;
        if (p && p.avatar_url) this.avatarUrl = p.avatar_url;
        this.identityNotice = 'Game username saved.';
      } catch (e) {
        this.identityError = e?.response?.data?.error?.message || 'Could not save your game username.';
      } finally {
        this.savingName = false;
      }
    },
    pickIcon() {
      if (this.$refs.iconInput) this.$refs.iconInput.click();
    },
    async onIconSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (this.$refs.iconInput) this.$refs.iconInput.value = '';
      if (!file) return;
      this.uploadingIcon = true;
      this.identityError = '';
      this.identityNotice = '';
      try {
        const { uploadAvatar } = useProfile();
        const res = await uploadAvatar(file);
        if (res && res.avatar_url) this.avatarUrl = res.avatar_url;
        this.identityNotice = 'Icon updated.';
      } catch (e) {
        this.identityError = e?.response?.data?.error?.message || 'Could not upload that image.';
      } finally {
        this.uploadingIcon = false;
      }
    },
    clearActionError() {
      this.actionError = '';
      this.activeRoomCode = '';
    },
    goToRoom(code) {
      this.$router.push({ path: `/applications/constellations/room/${code}` });
    },
    // Reads the { code, message, active_room_code } error detail an aspirant-server
    // refusal carries (server/handlers/common.go ErrorDetail, widened for the
    // already-in-game case by #4798). Falls back to `fallback` when the server
    // sent no message at all.
    setActionError(e, fallback) {
      const detail = e?.response?.data?.error;
      this.actionError = detail?.message || fallback;
      this.activeRoomCode = detail?.active_room_code || '';
    },
    async createRoom() {
      if (!this.hasUsername || this.busy) return;
      this.busy = true;
      this.clearActionError();
      try {
        const room = unwrap(await axios.post('/api/constellations/rooms', { player_count: this.playerCount }));
        if (room && room.code) this.goToRoom(room.code);
        else this.actionError = 'The room was created but returned no code.';
      } catch (e) {
        this.setActionError(e, 'Could not create a room.');
      } finally {
        this.busy = false;
      }
    },
    async joinRoom() {
      const code = this.joinCode.trim().toUpperCase();
      if (!this.hasUsername || !code || this.busy) return;
      this.busy = true;
      this.clearActionError();
      try {
        const room = unwrap(await axios.post(`/api/constellations/rooms/${encodeURIComponent(code)}/join`, {}));
        const landed = (room && room.code) || code;
        this.goToRoom(landed);
      } catch (e) {
        this.setActionError(e, 'Could not join that room. Check the code and try again.');
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<style scoped>
.constellations-view {
  max-width: 640px;
}

.page-subtitle {
  color: var(--text-muted, #6b7280);
  margin-top: 0.25rem;
  margin-bottom: 1.5rem;
}

.constellations-card {
  background: var(--surface-card, #fff);
  /* --surface-card is dark in BOTH themes, so pair it with the theme-absolute
     light ink (as AspCard does). Without this, text inherits --text-body, which
     flips to #424242 in light mode and vanishes on the dark card — the "gray
     button" whose create/join label was invisible in light mode only (#4779). */
  color: var(--text-on-dark);
  border: 1px solid var(--border-subtle, #e5e7eb);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}

.constellations-card-title {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  /* The global `h2` rule paints --text-on-light, which flips to #424242 in light
     and vanishes on the dark card. Re-pair it with the card's own ink (#4779). */
  color: var(--text-on-dark);
}

.constellations-identity {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.constellations-identity-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.constellations-identity-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.constellations-file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.constellations-panel {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.constellations-hint {
  margin: 0.75rem 0 0;
  color: var(--text-muted, #6b7280);
  font-size: 0.9rem;
}

.constellations-notice {
  margin: 0;
  color: var(--text-success, #15803d);
  font-size: 0.9rem;
}

.constellations-error {
  margin: 0.75rem 0 0;
  color: var(--text-danger, #b91c1c);
  font-size: 0.9rem;
}

.constellations-error-link {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  white-space: nowrap;
}
</style>
