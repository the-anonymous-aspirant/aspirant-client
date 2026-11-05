<template>
  <AspModal :open="open" title="Issuer profile" size="md" @update:open="$emit('update:open', $event)">
    <form class="profile-form" data-test="profile-form" @submit.prevent="save">
      <AspInput v-model="form.full_name" label="Full name" required />
      <AspTextarea v-model="form.address" label="Address" hint="One line per address line." :rows="3" required />
      <AspInput v-model="form.steuernummer" label="Steuernummer (Tax number)" hint="Invoices cannot be issued while this is empty." />
      <AspInput v-model="form.email" type="email" label="Email" />
      <AspCheckbox v-model="form.is_kleinunternehmer" label="Kleinunternehmerin under § 19 UStG (no VAT charged)" />
      <div class="profile-form__numbers">
        <AspInput v-model="form.invoice_number_prefix" label="Invoice number prefix" hint="For example 2026." required />
        <AspInput
          v-model="form.next_invoice_number"
          type="number"
          label="Next invoice number"
          hint="Locked once an invoice uses this prefix."
          required
        />
      </div>
      <!-- The logo is staged like every other field and sent by Save: Cancel
           discards a chosen file or a Remove (system_3 #9858, design ack
           c60880). -->
      <div class="profile-logo" data-test="profile-logo">
        <span id="profile-logo-label" class="profile-logo__label">Logo</span>
        <div class="profile-logo__row">
          <div class="profile-logo__paper" aria-labelledby="profile-logo-label">
            <img v-if="logoSrc" :src="logoSrc" alt="Invoice logo" data-test="profile-logo-preview" />
            <span v-else class="profile-logo__none" data-test="profile-logo-none">No logo</span>
          </div>
          <div class="profile-logo__actions">
            <input
              ref="logoInput"
              type="file"
              accept="image/png,image/jpeg"
              class="profile-logo__input"
              tabindex="-1"
              aria-hidden="true"
              data-test="profile-logo-input"
              @change="onLogoSelected"
            />
            <AspButton
              variant="secondary"
              size="sm"
              type="button"
              :disabled="saving"
              data-test="profile-logo-upload"
              @click="$refs.logoInput.click()"
            >
              {{ logoShown ? 'Replace logo' : 'Upload logo' }}
            </AspButton>
            <AspButton
              v-if="logoShown"
              variant="ghost"
              size="sm"
              type="button"
              :disabled="saving"
              data-test="profile-logo-remove"
              @click="removeLogo"
            >
              Remove
            </AspButton>
          </div>
        </div>
        <p class="profile-logo__hint">
          PNG or JPEG, up to 5 MB. Used on invoices issued after you save.
        </p>
        <p v-if="logoError" class="profile-form__error" role="alert" data-test="profile-logo-error">{{ logoError }}</p>
      </div>
      <p v-if="error" class="profile-form__error" role="alert" data-test="profile-error">{{ error }}</p>
    </form>
    <template #footer>
      <ModalActions>
        <AspButton variant="secondary" @click="$emit('update:open', false)">Cancel</AspButton>
        <AspButton :loading="saving" data-test="profile-save" @click="save">Save</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspCheckbox, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import { deleteLogo, errorOf, getLogoBlob, saveProfile, uploadLogo } from './api.js';

  // Edits the issuer header printed on every invoice (spec §4.1). The admin
  // seeds it and the owner edits it; issued invoices keep the snapshot taken
  // when they were issued, so nothing here changes an issued invoice.
  export default {
    name: 'ProfileEditor',
    components: { AspButton, AspCheckbox, AspInput, AspModal, AspTextarea, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      profile: { type: Object, required: true },
      hasLogo: { type: Boolean, default: false },
    },
    emits: ['update:open', 'saved', 'logo-changed'],
    data() {
      return {
        form: this.copy(this.profile),
        saving: false,
        error: '',
        // logoSet is what the server holds; logoStaged is the unsaved change,
        // null, { action: 'upload', file } or { action: 'delete' }.
        logoSet: this.hasLogo,
        logoStaged: null,
        logoSrc: '',
        logoError: '',
      };
    },
    computed: {
      logoShown() {
        if (this.logoStaged) return this.logoStaged.action === 'upload';
        return this.logoSet;
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = this.copy(this.profile);
          this.error = '';
          this.logoSet = this.hasLogo;
          this.logoStaged = null;
          this.logoError = '';
          this.loadLogo();
        } else {
          this.logoStaged = null;
          this.setLogoSrc('');
        }
      },
    },
    beforeUnmount() {
      this.setLogoSrc('');
    },
    methods: {
      // The logo route is behind the invoicing gate, so the saved logo is
      // fetched with the session (not a bare <img src>). Saved or staged, the
      // tile shows an object URL, released whenever it is replaced or the
      // dialog closes.
      setLogoSrc(src) {
        if (this.logoSrc) URL.revokeObjectURL(this.logoSrc);
        this.logoSrc = src;
      },
      async loadLogo() {
        if (!this.logoSet) {
          this.setLogoSrc('');
          return;
        }
        try {
          const blob = await getLogoBlob();
          if (!this.logoStaged) this.setLogoSrc(URL.createObjectURL(blob));
        } catch (err) {
          if (errorOf(err).status === 404) {
            this.setLogoState(false);
          } else {
            this.logoError = 'The current logo could not be loaded.';
          }
          if (!this.logoStaged) this.setLogoSrc('');
        }
      },
      setLogoState(set) {
        this.logoSet = set;
        this.$emit('logo-changed', set);
      },
      onLogoSelected(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        this.logoError = '';
        this.logoStaged = { action: 'upload', file };
        this.setLogoSrc(URL.createObjectURL(file));
      },
      removeLogo() {
        this.logoError = '';
        this.logoStaged = this.logoSet ? { action: 'delete' } : null;
        this.setLogoSrc('');
      },
      // Sends the staged logo change, if any. Returns false when the server
      // refused it, with the refusal shown under the hint.
      async saveLogo() {
        const staged = this.logoStaged;
        if (!staged) return true;
        try {
          if (staged.action === 'upload') {
            await uploadLogo(staged.file);
            this.setLogoState(true);
          } else {
            await deleteLogo();
            this.setLogoState(false);
          }
          this.logoStaged = null;
          return true;
        } catch (err) {
          this.logoError = errorOf(err).message;
          return false;
        }
      },
      copy(p) {
        return {
          full_name: p.full_name || '',
          address: p.address || '',
          steuernummer: p.steuernummer || '',
          email: p.email || '',
          is_kleinunternehmer: p.is_kleinunternehmer !== false,
          invoice_number_prefix: p.invoice_number_prefix || '',
          next_invoice_number: p.next_invoice_number || 1,
        };
      },
      // The logo goes first: if it is refused, nothing is saved and the
      // dialog stays as the user left it. If the logo is saved and the
      // profile then fails, the error says so; a partial save never reads as
      // a full one.
      async save() {
        this.saving = true;
        this.error = '';
        this.logoError = '';
        const logoChanged = !!this.logoStaged;
        try {
          if (!(await this.saveLogo())) return;
          const body = { ...this.form, next_invoice_number: Number(this.form.next_invoice_number) };
          const res = await saveProfile(body);
          this.$emit('saved', res.profile);
          this.$emit('update:open', false);
        } catch (err) {
          const message = errorOf(err).message;
          this.error = logoChanged ? `The logo was saved; the profile was not: ${message}` : message;
        } finally {
          this.saving = false;
        }
      },
    },
  };
</script>

<style scoped>
  .profile-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .profile-form__numbers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
  }

  .profile-form__error {
    color: var(--feedback-error);
    margin: 0;
  }

  /* Laid out like a design-system field (AspInput): label, control, hint. */
  .profile-logo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .profile-logo__label {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.3;
  }

  .profile-logo__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-md);
  }

  /* The tile stands for the printed logo box: the renderer fits the logo
     into 140×72 pt, so the tile has those proportions and a wide logo
     previews width-bound, as it prints (§3.116). Its paper is white in every
     theme, as the printed page is, so the mark is seen as it will print; a
     black logo would vanish on the dark theme's surface. Deliberately a
     local property, not a theme token (design ack c60880, D9). */
  .profile-logo__paper {
    --invoice-paper: #fff;
    --invoice-paper-ink-muted: #6b6b6b;

    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: content-box;
    width: 140px;
    height: 72px;
    padding: var(--space-2xs);
    background: var(--invoice-paper);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .profile-logo__paper img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .profile-logo__none {
    color: var(--invoice-paper-ink-muted);
    font-size: var(--text-xs);
  }

  .profile-logo__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .profile-logo__input {
    display: none;
  }

  .profile-logo__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }
</style>
