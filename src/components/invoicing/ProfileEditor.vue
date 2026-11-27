<template>
  <!-- Every exit asks first when something is unsent, the staged logo
       included (system_3 #11669, §3.166). -->
  <AspModal :open="open" title="Issuer profile" size="md" @update:open="onOpenChange">
    <form class="profile-form" data-test="profile-form" :inert="unsentAsking || undefined" @submit.prevent="save">
      <AspInput ref="full_name" v-model="form.full_name" label="Full name" required :error="fieldErrors.full_name" data-test="profile-full-name" />
      <AspTextarea ref="address" v-model="form.address" label="Address" hint="One line per address line." :rows="3" required :error="fieldErrors.address" data-test="profile-address" />
      <AspInput
        ref="steuernummer"
        v-model="form.steuernummer"
        label="Steuernummer (Tax number)"
        :label-hint="hints.steuernummer"
        hint="Invoices cannot be issued while this is empty."
        :error="fieldErrors.steuernummer"
      />
      <AspInput ref="email" v-model="form.email" type="email" label="Email" :error="fieldErrors.email" />
      <!-- Optional; printed under the email on new invoices only when set
           (operator c61727, system_3 #9967). The server is the only gate on
           its characters. A refusal shows on this field, in place of its
           hint, with zir text kept (design_agent on #9993). -->
      <AspInput
        ref="phone"
        v-model="form.phone"
        type="tel"
        label="Phone"
        hint="Printed under your email on new invoices. Leave it empty to leave it off."
        :error="fieldErrors.phone"
        data-test="profile-phone"
      />
      <!-- Zir own social links (operator c61586, system_3 #10003): stored,
           never printed. Refusals show on their own field, as the phone's. -->
      <fieldset class="social" data-test="profile-social-group">
        <legend class="social__legend">Social media</legend>
        <AspInput
          ref="instagram_url"
          v-model="form.instagram_url"
          label="Instagram"
          placeholder="@name or a link"
          :error="fieldErrors.instagram_url"
          data-test="profile-instagram"
        />
        <AspInput
          ref="telegram_url"
          v-model="form.telegram_url"
          label="Telegram"
          placeholder="@name or a link"
          hint="Not printed on invoices."
          :error="fieldErrors.telegram_url"
          data-test="profile-telegram"
        />
      </fieldset>
      <div class="profile-vat">
        <AspCheckbox v-model="form.is_kleinunternehmer" label="Kleinunternehmerin under § 19 UStG (no VAT charged)" />
        <!-- Every draft follows the setting (system_3 #12261, ruling 3): said
             only while the box differs from the saved setting, when Save
             changes what the drafts read. -->
        <p v-if="vatDraftsLine" class="profile-vat__drafts" aria-live="polite" data-test="profile-vat-drafts">{{ vatDraftsLine }}</p>
      </div>
      <div class="profile-form__numbers">
        <AspInput
          ref="invoice_number_prefix"
          v-model="form.invoice_number_prefix"
          label="Invoice number prefix"
          :label-hint="hints.prefix"
          hint="For example 2026."
          :error="fieldErrors.invoice_number_prefix"
          required
          data-test="profile-prefix"
        />
        <AspInput
          ref="next_invoice_number"
          v-model="form.next_invoice_number"
          :error="fieldErrors.next_invoice_number"
          type="number"
          label="Next invoice number"
          :label-hint="hints.nextNumber"
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
    </form>
    <template #footer>
      <UnsentAsk v-if="unsentAsking" @keep="keepEditing" @discard="discardUnsent" />
      <!-- A refusal that names no field is said above the buttons
           (system_3 #12298 ruling 2). -->
      <ModalActions v-else :refusal="footerLine" refusal-test="profile-error">
        <AspButton variant="secondary" :disabled="saving" data-test="profile-cancel" @click="onOpenChange(false)">Cancel</AspButton>
        <AspButton ref="saveButton" :loading="saving" data-test="profile-save" @click="save">Save</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspCheckbox, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import UnsentAsk from './UnsentAsk.vue';
  import { unsentGuard } from './unsentGuard.js';
  import { FIELD_HINTS } from './fieldHints.js';
  import { deleteLogo, errorOf, getLogoBlob, getProfile, saveProfile, uploadLogo } from './api.js';
  import { focusAfterRefusal } from './refusalFocus.js';
  import { refusalOf } from './refusals.js';

  const PARTIAL_SAVE = 'The logo was saved; the profile was not.';
  // The two fields every invoice prints, checked before anything is sent.
  const REQUIRED = [
    { field: 'full_name', text: 'Enter your full name. It is printed on every invoice.' },
    { field: 'address', text: 'Enter your address. It is printed on every invoice.' },
  ];

  // Edits the issuer header printed on every invoice (spec §4.1). The admin
  // seeds it and the owner edits it; issued invoices keep the snapshot taken
  // when they were issued, so nothing here changes an issued invoice.
  // aspirant-server answers each refusal with its own code and field
  // (system_3 #9967, #10002, #12300); refusals.js says it in zir words.
  const noErrors = () => ({
    full_name: '',
    address: '',
    steuernummer: '',
    email: '',
    phone: '',
    instagram_url: '',
    telegram_url: '',
    invoice_number_prefix: '',
    next_invoice_number: '',
  });

  export default {
    name: 'ProfileEditor',
    components: { AspButton, AspCheckbox, AspInput, AspModal, AspTextarea, ModalActions, UnsentAsk },
    mixins: [unsentGuard],
    props: {
      open: { type: Boolean, default: false },
      profile: { type: Object, required: true },
      hasLogo: { type: Boolean, default: false },
    },
    emits: ['update:open', 'saved', 'logo-changed'],
    data() {
      return {
        hints: FIELD_HINTS,
        form: this.copy(this.profile),
        saving: false,
        error: '',
        // "The logo was saved; the profile was not.": the only word that half
        // of the Save went through, so it stays until the next Save, where
        // `error` goes with the next change (system_3 #12298 review point 3).
        partialSave: '',
        // The server's refusal of the phone or a link, shown on that field.
        fieldErrors: noErrors(),
        // logoSet is what the server holds; logoStaged is the unsaved change,
        // null, { action: 'upload', file } or { action: 'delete' }.
        logoSet: this.hasLogo,
        logoStaged: null,
        logoSrc: '',
        logoError: '',
        // The drafts the VAT setting prices, read when the editor opens.
        draftCount: 0,
      };
    },
    computed: {
      // While a save runs, no exit closes and none asks.
      unsentBusy() {
        return this.saving;
      },
      vatDraftsLine() {
        const saved = this.profile.is_kleinunternehmer !== false;
        if (this.form.is_kleinunternehmer === saved || this.draftCount < 1) return '';
        const n = this.draftCount;
        return `${n} ${n === 1 ? 'draft' : 'drafts'} will be worked out again with this setting.`;
      },
      // With a reason after it, the partial-save line leads into it, as it
      // did before it moved (system_3 #12298).
      footerLine() {
        if (this.partialSave && this.error) return `${this.partialSave.replace(/\.$/, '')}: ${this.error}`;
        return this.partialSave || this.error;
      },
      logoShown() {
        if (this.logoStaged) return this.logoStaged.action === 'upload';
        return this.logoSet;
      },
    },
    watch: {
      // Editing a refused field clears its refusal; any change clears the
      // footer's line (system_3 #12298 ruling 4).
      'form.full_name'() {
        this.fieldErrors.full_name = '';
      },
      'form.address'() {
        this.fieldErrors.address = '';
      },
      form: {
        deep: true,
        handler() {
          this.error = '';
        },
      },
      'form.phone'() {
        this.fieldErrors.phone = '';
      },
      'form.steuernummer'() {
        this.fieldErrors.steuernummer = '';
      },
      'form.email'() {
        this.fieldErrors.email = '';
      },
      'form.invoice_number_prefix'() {
        this.fieldErrors.invoice_number_prefix = '';
      },
      'form.next_invoice_number'() {
        this.fieldErrors.next_invoice_number = '';
      },
      'form.instagram_url'() {
        this.fieldErrors.instagram_url = '';
      },
      'form.telegram_url'() {
        this.fieldErrors.telegram_url = '';
      },
      open(isOpen) {
        if (isOpen) {
          this.form = this.copy(this.profile);
          this.error = '';
          this.partialSave = '';
          this.fieldErrors = noErrors();
          this.logoSet = this.hasLogo;
          this.logoStaged = null;
          this.logoError = '';
          this.takeUnsentBaseline();
          this.loadLogo();
          this.loadDraftCount();
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
      // Read fresh on every open: drafts are made and deleted on other tabs
      // of the page. Unread, no line is drawn.
      async loadDraftCount() {
        this.draftCount = 0;
        try {
          const res = await getProfile();
          this.draftCount = Number(res.draft_count) || 0;
        } catch {
          this.draftCount = 0;
        }
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
          this.logoError = refusalOf(errorOf(err), { form: 'logo' }).text;
          return false;
        }
      },
      // Esc, the scrim, the corner ✕, Cancel and Back: each asks first when
      // something is unsent (§3.166).
      onOpenChange(value) {
        if (value) return;
        this.requestClose();
      },
      closeNow() {
        this.$emit('update:open', false);
      },
      // What Save would send, normalised as Save does it, and the staged logo:
      // a picked or removed logo is unsent until Save (system_3 #11669).
      unsentValue() {
        const f = this.form;
        const fields = Object.fromEntries(Object.keys(f).map((k) => [k, typeof f[k] === 'string' ? f[k].trim() : f[k]]));
        fields.next_invoice_number = Number(f.next_invoice_number);
        const staged = this.logoStaged;
        return { fields, logo: staged ? (staged.action === 'upload' ? `upload:${staged.file.name}:${staged.file.size}` : 'delete') : null };
      },
      copy(p) {
        return {
          full_name: p.full_name || '',
          address: p.address || '',
          steuernummer: p.steuernummer || '',
          email: p.email || '',
          phone: p.phone || '',
          // Listed, so a save sends them back: the PUT replaces the profile,
          // and a field left out here would be cleared (system_3 #10003).
          instagram_url: p.instagram_url || '',
          telegram_url: p.telegram_url || '',
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
        this.error = '';
        this.partialSave = '';
        this.fieldErrors = noErrors();
        // What every invoice prints is checked here first, at its field
        // (system_3 #12298 ruling 1; the lines are #12300's).
        const missing = REQUIRED.filter((f) => !String(this.form[f.field] || '').trim());
        if (missing.length) {
          for (const f of missing) this.fieldErrors[f.field] = f.text;
          focusAfterRefusal(this, missing[0].field);
          return;
        }
        this.saving = true;
        this.logoError = '';
        const logoChanged = !!this.logoStaged;
        try {
          if (!(await this.saveLogo())) return;
          const body = { ...this.form, next_invoice_number: Number(this.form.next_invoice_number) };
          const res = await saveProfile(body);
          this.$emit('saved', res.profile);
          this.$emit('update:open', false);
        } catch (err) {
          // On the field, in zir words (system_3 #12300); the rule stays
          // the server's.
          const { field, text } = refusalOf(errorOf(err), { form: 'profile' });
          if (logoChanged) this.partialSave = PARTIAL_SAVE;
          if (Object.hasOwn(this.fieldErrors, field)) {
            this.fieldErrors[field] = text;
            focusAfterRefusal(this, field);
            return;
          }
          this.error = text;
          focusAfterRefusal(this, 'saveButton');
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

  /* Zir social links as one titled group (system_3 #10003). */
  .social {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .social__legend {
    padding: 0;
    margin-bottom: var(--space-2xs);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium, 500);
  }

  .profile-form__numbers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
  }

  .profile-vat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .profile-vat__drafts {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
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
