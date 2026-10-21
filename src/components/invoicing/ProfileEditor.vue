<template>
  <AspModal :open="open" title="Issuer profile" size="md" @update:open="$emit('update:open', $event)">
    <form class="profile-form" data-test="profile-form" @submit.prevent="save">
      <AspInput v-model="form.full_name" label="Full name" required />
      <AspTextarea v-model="form.address" label="Address" hint="One line per address line." :rows="3" required />
      <AspInput v-model="form.steuernummer" label="Steuernummer" hint="Invoices cannot be issued while this is empty." />
      <AspInput v-model="form.email" type="email" label="Email" />
      <AspCheckbox v-model="form.is_kleinunternehmer" label="Kleinunternehmerin under § 19 UStG (no VAT charged)" />
      <div class="profile-form__numbers">
        <AspInput v-model="form.invoice_number_prefix" label="Invoice number prefix" hint="For example 2026." required />
        <AspInput
          v-model="form.next_invoice_number"
          type="number"
          label="Next invoice number"
          hint="Fixed by the server once an invoice has been issued under this prefix."
          required
        />
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
  import { errorOf, saveProfile } from './api.js';

  // Edits the issuer header printed on every invoice (spec §4.1). The admin
  // seeds it and the owner edits it; issued invoices keep the snapshot taken
  // when they were issued, so nothing here changes an issued invoice.
  export default {
    name: 'ProfileEditor',
    components: { AspButton, AspCheckbox, AspInput, AspModal, AspTextarea, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      profile: { type: Object, required: true },
    },
    emits: ['update:open', 'saved'],
    data() {
      return { form: this.copy(this.profile), saving: false, error: '' };
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = this.copy(this.profile);
          this.error = '';
        }
      },
    },
    methods: {
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
      async save() {
        this.saving = true;
        this.error = '';
        try {
          const body = { ...this.form, next_invoice_number: Number(this.form.next_invoice_number) };
          const res = await saveProfile(body);
          this.$emit('saved', res.profile);
          this.$emit('update:open', false);
        } catch (err) {
          this.error = errorOf(err).message;
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
</style>
