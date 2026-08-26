<script>
  import { AspInput, AspButton } from '@aspirant/design-system';
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
    components: { AspInput, AspButton, UserAvatar, PixelAvatarDraw },
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
            <AspButton type="button" variant="primary" :disabled="saving" @click="onPickAvatar">
              {{ profile.avatar_url ? 'Change picture' : 'Upload picture' }}
            </AspButton>
            <AspButton
              type="button"
              variant="ghost"
              :disabled="saving"
              :aria-expanded="drawing"
              @click="drawing = !drawing"
            >
              {{ drawing ? 'Close drawing' : 'Draw an icon' }}
            </AspButton>
            <AspButton
              v-if="profile.avatar_url"
              type="button"
              variant="ghost"
              :disabled="saving"
              @click="removeAvatar"
            >
              Remove
            </AspButton>
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
            <!-- Unlike the credential forms in this cluster, this field keeps
                 its hand-rolled <label for> instead of taking AspInput's `label`
                 prop: the caption sits OUTSIDE .field-row, above the
                 input-and-Save pair, and moving it into the component would put
                 it inside the row, stacking label-over-control as one flex item
                 beside a vertically-centred Save button. The discriminator is
                 positional — the DS label prop where the caption belongs to the
                 control's own box, the external label where the surrounding
                 layout positions it. Keeping the caption external is also why
                 `id` is passed here: `for="display-name"` has to resolve, and an
                 id arriving through $attrs lands on the inner <input> after the
                 component's own `:id` (mergeProps: later wins), so `for` finds
                 the real control. -->
            <AspInput
              id="display-name"
              v-model="displayNameInput"
              maxlength="50"
              autocomplete="off"
            />
            <AspButton type="submit" variant="primary" :disabled="saving || !nameDirty">Save</AspButton>
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

  /* The box, the fill and the ink that used to live in `.text-input` are
     AspInput's now — including the #4201 fix (the value was --text-on-dark on
     the light --surface-elevated, white-over-white and invisible): the
     component resolves --text-body against its own --surface-elevated control,
     which is the same pairing by construction rather than by a comment asking
     the next editor to remember. profile.spec.ts still measures the outcome
     (>= AA on the effective background), not the token, so the regression stays
     caught however it is reintroduced.

     What is left is the one thing the component cannot know: that this control
     is a flex item that must take the row's leftover width next to Save. It is
     set on the component's ROOT rather than through a `class`, because AspInput
     is inheritAttrs:false — a class on the tag would fall through to the inner
     <input> and put a second box inside the DS control box. A child component's
     root element carries this file's scope attribute, so a plain scoped
     selector reaches it without :deep(). */
  .field-row > .field {
    /* The AspInput default is 34px (the §3.10 filter canon) and the Save button
       beside it is now an AspButton (size="md"), which also measures 34px
       (0.5rem × 2 padding + 1rem line at line-height:1 + 1px × 2 border, both
       verified by rendering the DS build). The pair reads as one row at the
       shared 34px default, so the old --asp-input-height override that matched
       the native 36px button is dropped. This selector now only makes the input
       take the row's leftover width beside Save. */
    flex: 1;
  }

  /* The avatar actions (Change/Upload = primary, Draw/Remove = ghost) and the
     display-name Save (submit = primary) are AspButtons now — DS owns their
     fill, ink, radius, focus, hover and disabled state (#4295 button-of-record
     family), so the old .btn / .btn-ghost visual blocks are gone. .avatar-actions
     above still lays the cluster out; .field-row below still positions Save. */
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
