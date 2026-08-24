<script>
  import { ref, computed, onMounted } from 'vue';
  import { useProfile } from '../composables/useProfile.js';
  import UserAvatar from '../components/UserAvatar.vue';
  import PixelAvatarDraw from '../components/PixelAvatarDraw.vue';

  // ProfileView — the logged-in user's own profile surface (#4170). A full page
  // (the app favours pages over modals), reached from the sidebar Profile entry.
  // Lets the user edit their display name and profile picture, and shows their
  // member-since date. The login username is shown read-only; the editable name
  // is the temporal display name (never the login credential).
  export default {
    name: 'ProfileView',
    components: { UserAvatar, PixelAvatarDraw },
    setup() {
      const { getProfile, updateDisplayName, uploadAvatar, clearAvatar } = useProfile();

      const loading = ref(true);
      const saving = ref(false);
      const error = ref('');
      const notice = ref('');
      const profile = ref({
        ID: null,
        username: '',
        display_name: '',
        email: '',
        avatar_url: '',
        CreatedAt: null,
      });
      const displayNameInput = ref('');
      const fileInput = ref(null);
      const drawing = ref(false);

      const memberSince = computed(() => {
        if (!profile.value.CreatedAt) return '';
        const d = new Date(profile.value.CreatedAt);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      });

      const nameDirty = computed(
        () => displayNameInput.value.trim() !== (profile.value.display_name || '')
      );

      const load = async () => {
        loading.value = true;
        error.value = '';
        try {
          const p = await getProfile();
          profile.value = p;
          displayNameInput.value = p.display_name || '';
        } catch (e) {
          error.value = 'Could not load your profile. Please try again.';
        } finally {
          loading.value = false;
        }
      };

      const saveName = async () => {
        const name = displayNameInput.value.trim();
        if (!name) {
          error.value = 'Display name cannot be empty.';
          return;
        }
        saving.value = true;
        error.value = '';
        notice.value = '';
        try {
          const p = await updateDisplayName(name);
          profile.value = p;
          displayNameInput.value = p.display_name || '';
          notice.value = 'Display name saved.';
        } catch (e) {
          error.value = e?.response?.data?.error?.message || 'Could not save your display name.';
        } finally {
          saving.value = false;
        }
      };

      const onPickAvatar = () => {
        if (fileInput.value) fileInput.value.click();
      };

      // Shared upload path for both the file picker and the pixel-draw surface —
      // whatever produces the image (a chosen file or a rasterized drawing), the
      // avatar round-trip and the success/error handling are identical.
      const doUpload = async (file) => {
        if (!file) return;
        saving.value = true;
        error.value = '';
        notice.value = '';
        try {
          const res = await uploadAvatar(file);
          profile.value = { ...profile.value, avatar_url: res.avatar_url };
          notice.value = 'Profile picture updated.';
          return true;
        } catch (e) {
          error.value = e?.response?.data?.error?.message || 'Could not upload that image.';
          return false;
        } finally {
          saving.value = false;
        }
      };

      const onAvatarSelected = async (event) => {
        const file = event.target.files && event.target.files[0];
        await doUpload(file);
        if (fileInput.value) fileInput.value.value = '';
      };

      const onDrawSaved = async (file) => {
        const ok = await doUpload(file);
        if (ok) drawing.value = false;
      };

      const removeAvatar = async () => {
        saving.value = true;
        error.value = '';
        notice.value = '';
        try {
          await clearAvatar();
          profile.value = { ...profile.value, avatar_url: '' };
          notice.value = 'Profile picture removed.';
        } catch (e) {
          error.value = 'Could not remove your picture.';
        } finally {
          saving.value = false;
        }
      };

      onMounted(load);

      return {
        loading,
        saving,
        error,
        notice,
        profile,
        displayNameInput,
        memberSince,
        nameDirty,
        saveName,
        onPickAvatar,
        onAvatarSelected,
        onDrawSaved,
        removeAvatar,
        fileInput,
        drawing,
      };
    },
  };
</script>

<template>
  <div class="profile-view">
    <div class="profile-card">
      <h1 class="profile-title">Your profile</h1>

      <div v-if="loading" class="profile-loading">Loading…</div>

      <template v-else>
        <div class="avatar-block">
          <UserAvatar
            :avatar-url="profile.avatar_url"
            :name="profile.display_name || profile.username"
            :size="96"
          />
          <div class="avatar-actions">
            <button type="button" class="btn" :disabled="saving" @click="onPickAvatar">
              {{ profile.avatar_url ? 'Change picture' : 'Upload picture' }}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :disabled="saving"
              :aria-expanded="drawing"
              @click="drawing = !drawing"
            >
              {{ drawing ? 'Close drawing' : 'Draw an icon' }}
            </button>
            <button
              v-if="profile.avatar_url"
              type="button"
              class="btn btn-ghost"
              :disabled="saving"
              @click="removeAvatar"
            >
              Remove
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="file-hidden"
              @change="onAvatarSelected"
            />
          </div>
        </div>

        <PixelAvatarDraw
          v-if="drawing"
          :busy="saving"
          @save="onDrawSaved"
          @cancel="drawing = false"
        />

        <form class="field" @submit.prevent="saveName">
          <label class="field-label" for="display-name">Display name</label>
          <div class="field-row">
            <input
              id="display-name"
              v-model="displayNameInput"
              type="text"
              maxlength="50"
              class="text-input"
              autocomplete="off"
            />
            <button type="submit" class="btn" :disabled="saving || !nameDirty">Save</button>
          </div>
        </form>

        <div class="field">
          <span class="field-label">Username</span>
          <div class="field-static">{{ profile.username }}</div>
        </div>

        <div v-if="memberSince" class="field">
          <span class="field-label">Member since</span>
          <div class="field-static">{{ memberSince }}</div>
        </div>

        <p v-if="notice" class="msg msg-ok">{{ notice }}</p>
        <p v-if="error" class="msg msg-error">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
  .profile-view {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: var(--space-lg);
    color: var(--text-on-light);
  }

  .profile-card {
    width: 100%;
    max-width: 520px;
    background-color: var(--surface-card);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .profile-title {
    margin: 0;
    color: var(--text-on-dark);
  }

  .profile-loading {
    color: var(--text-on-dark);
  }

  .avatar-block {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .avatar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .field-label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--brand-primary);
  }

  .field-row {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .field-static {
    color: var(--text-on-dark);
    font-size: var(--text-md);
  }

  .text-input {
    flex: 1;
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background-color: var(--surface-elevated);
    color: var(--text-on-dark);
    font-size: var(--text-md);
  }

  .btn {
    padding: var(--space-xs) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background-color: var(--brand-primary);
    color: var(--text-on-dark);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background-color var(--transition-moderate);
  }

  .btn:hover:not(:disabled) {
    background-color: var(--brand-accent);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--brand-primary);
    border: 1px solid var(--border-subtle);
  }

  .file-hidden {
    display: none;
  }

  .msg {
    margin: 0;
    font-size: var(--text-sm);
  }

  .msg-ok {
    color: var(--feedback-success, #2e7d32);
  }

  .msg-error {
    color: var(--feedback-error, #c62828);
  }
</style>
