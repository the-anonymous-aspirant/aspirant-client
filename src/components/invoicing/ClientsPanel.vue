<template>
  <section class="clients-panel" data-test="clients-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Clients</h2>
      <AspButton class="block-on-phone" data-test="client-add" @click="startAdd">Add client</AspButton>
    </div>

    <AspEmptyState
      v-if="clients.length === 0"
      heading="No clients yet"
      message="An invoice needs a client with a name. Above 250 € gross it also needs their postal address."
      data-test="clients-empty"
    />
    <!-- Below 640px each client is a card (§3.114 decision 6): name and Edit
         on one row, then the address and emails at the card's edge. -->
    <ul v-else-if="narrow" class="client-cards" aria-label="Clients">
      <li v-for="row in rows" :key="row.id" class="client-card" data-test="client-row">
        <div class="client-card__top">
          <strong>{{ row.name }}</strong>
          <AspButton variant="ghost" size="sm" :data-test="`client-edit-${row.id}`" @click="startEdit(row)">Edit</AspButton>
        </div>
        <span v-if="row.address" class="multiline">{{ row.address }}</span>
        <span v-else class="muted" data-test="client-no-address">No postal address</span>
        <span v-if="row.email" class="muted">{{ row.email }}</span>
        <a v-if="row.phone" class="client-contact" :href="`tel:${row.phone.replace(/[^0-9+]/g, '')}`" data-test="client-phone">{{ row.phone }}</a>
        <span v-if="row.instagram_url || row.telegram_url" class="client-social" data-test="client-social">
          <a
            v-if="row.instagram_url"
            :href="row.instagram_url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Instagram: ${socialHandle(row.instagram_url)} (opens in a new tab)`"
            data-test="client-instagram"
            >Instagram {{ socialHandle(row.instagram_url) }}</a
          ><span v-if="row.instagram_url && row.telegram_url" aria-hidden="true"> · </span
          ><a
            v-if="row.telegram_url"
            :href="row.telegram_url"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Telegram: ${socialHandle(row.telegram_url)} (opens in a new tab)`"
            data-test="client-telegram"
            >Telegram {{ socialHandle(row.telegram_url) }}</a
          >
        </span>
        <span v-if="row.paypal_email" class="muted">{{ row.paypal_email }}</span>
        <span v-if="row.notes" class="client-notes" :title="row.notes" data-test="client-notes">{{ row.notes }}</span>
      </li>
    </ul>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="rows"
      row-key="id"
      density="compact"
      caption="Clients"
      :row-attrs="(row) => ({ 'data-test': 'client-row' })"
    >
      <!-- Her notes read as one muted line under the name, cut with an
           ellipsis so a cut shows (design ack c61704 on system_3 #9987); the
           full text is in the editor. A client with no notes shows nothing. -->
      <template #cell-name="{ row }">
        <span class="client-name">{{ row.name }}</span>
        <span v-if="row.notes" class="client-notes" :title="row.notes" data-test="client-notes">{{ row.notes }}</span>
      </template>
      <template #cell-address="{ value }">
        <span v-if="value" class="multiline">{{ value }}</span>
        <span v-else class="muted" data-test="client-no-address">No postal address</span>
      </template>
      <!-- Contact: email, phone, then her social links (system_3 #10003). A
           link's href is the URL as stored, never rebuilt from a handle
           (security, c61900 on #10002); it opens in a new tab. -->
      <template #cell-email="{ row }">
        <span class="contact-stack">
          <span v-if="row.email" class="muted">{{ row.email }}</span>
          <a v-if="row.phone" class="client-contact" :href="`tel:${row.phone.replace(/[^0-9+]/g, '')}`" data-test="client-phone">{{ row.phone }}</a>
          <span v-if="row.instagram_url || row.telegram_url" class="client-social" data-test="client-social">
            <a
              v-if="row.instagram_url"
              :href="row.instagram_url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Instagram: ${socialHandle(row.instagram_url)} (opens in a new tab)`"
              data-test="client-instagram"
              >Instagram {{ socialHandle(row.instagram_url) }}</a
            ><span v-if="row.instagram_url && row.telegram_url" aria-hidden="true"> · </span
            ><a
              v-if="row.telegram_url"
              :href="row.telegram_url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Telegram: ${socialHandle(row.telegram_url)} (opens in a new tab)`"
              data-test="client-telegram"
              >Telegram {{ socialHandle(row.telegram_url) }}</a
            >
          </span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <AspButton variant="ghost" size="sm" :data-test="`client-edit-${row.id}`" @click="startEdit(row)">Edit</AspButton>
      </template>
    </AspDataTable>

    <AspModal v-model:open="editorOpen" :title="editing ? 'Edit client' : 'Add client'" size="md">
      <form class="client-form" data-test="client-form" @submit.prevent="save">
        <!-- When she added the client and when it was updated, as days in her
             calendar (operator c61587, design_agent c62046). -->
        <p v-if="editing && editingStamp" class="client-form__stamp muted" data-test="client-stamp">{{ editingStamp }}</p>
        <AspInput v-model="form.name" label="Name" required />
        <AspTextarea
          v-model="form.address"
          label="Postal address"
          :rows="3"
          hint="Needed for invoices over 250 € gross."
        />
        <AspInput v-model="form.email" type="email" label="Email" />
        <AspInput v-model="form.paypal_email" type="email" label="PayPal email" hint="Imported payments from this address are linked to the client." />
        <!-- Phone and her social links are hers, not the invoice's (operator
             c61586): never printed. A refusal shows on its own field, in
             place of its hint, with her text kept (as #9993). -->
        <AspInput ref="phone" v-model="form.phone" type="tel" label="Phone" hint="Not printed on invoices." :error="fieldErrors.phone" data-test="client-phone-input" />
        <fieldset class="social" data-test="client-social-group">
          <legend class="social__legend">Social media</legend>
          <AspInput
            ref="instagram_url"
            v-model="form.instagram_url"
            label="Instagram"
            placeholder="@name or a link"
            :error="fieldErrors.instagram_url"
            data-test="client-instagram-input"
          />
          <AspInput
            ref="telegram_url"
            v-model="form.telegram_url"
            label="Telegram"
            placeholder="@name or a link"
            hint="Not printed on invoices."
            :error="fieldErrors.telegram_url"
            data-test="client-telegram-input"
          />
        </fieldset>
        <!-- No maxlength: it would cut a paste silently. The server refuses
             more than 5000 characters with a message shown below, and the
             text stays here to shorten (design ack c61704, system_3 #9987). -->
        <AspTextarea
          v-model="form.notes"
          label="Notes"
          :rows="4"
          hint="Never printed on an invoice or included in an export."
          data-test="client-notes-input"
        />
        <p v-if="error" class="client-form__error" role="alert" data-test="client-error">{{ error }}</p>
      </form>
      <template #footer>
        <ModalActions>
          <AspButton variant="secondary" @click="editorOpen = false">Cancel</AspButton>
          <AspButton :loading="saving" data-test="client-save" @click="save">Save</AspButton>
        </ModalActions>
      </template>
    </AspModal>
  </section>
</template>

<script>
  import { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import { FIELD_REFUSALS, createClient, errorOf, formatBerlinDay, socialHandle, updateClient } from './api.js';

  const blank = () => ({ name: '', address: '', email: '', paypal_email: '', phone: '', instagram_url: '', telegram_url: '', notes: '' });
  const noErrors = () => ({ phone: '', instagram_url: '', telegram_url: '' });

  // The people Flower invoices (spec §4.2). The name is required here
  // because the server requires it. The address is optional: an invoice up
  // to 250 EUR gross needs none (§33 UStDV), and issuing refuses one above
  // that without it (system_3 #9835). The server is still the gate.
  export default {
    name: 'ClientsPanel',
    components: { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea, ModalActions },
    props: {
      clients: { type: Array, required: true },
    },
    emits: ['changed'],
    data() {
      return {
        narrow: false,
        editorOpen: false,
        editing: null,
        form: blank(),
        saving: false,
        error: '',
        fieldErrors: noErrors(),
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'address', label: 'Address', sortable: false },
          { key: 'email', label: 'Contact' },
          { key: 'paypal_email', label: 'PayPal email' },
          { key: 'actions', label: '', sortable: false, align: 'right' },
        ],
      };
    },
    computed: {
      rows() {
        return this.clients.map((c) => ({ ...c, actions: '' }));
      },
      editingStamp() {
        const c = this.editing;
        if (!c) return '';
        // Days in her calendar; "updated" is the operator's word, and true of
        // any write to the row (design_agent c62046).
        const added = formatBerlinDay(c.created_at);
        const updated = formatBerlinDay(c.updated_at);
        if (!added) return '';
        return updated && updated !== added ? `Added ${added} · updated ${updated}` : `Added ${added}`;
      },
    },
    mounted() {
      // The same 640px switch as the other panels: cards below it.
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.narrow = this.narrowQuery.matches;
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
    },
    beforeUnmount() {
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
    },
    watch: {
      // Editing a refused field clears its refusal.
      'form.phone'() {
        this.fieldErrors.phone = '';
      },
      'form.instagram_url'() {
        this.fieldErrors.instagram_url = '';
      },
      'form.telegram_url'() {
        this.fieldErrors.telegram_url = '';
      },
    },
    methods: {
      socialHandle,
      startAdd() {
        this.editing = null;
        this.form = blank();
        this.error = '';
        this.fieldErrors = noErrors();
        this.editorOpen = true;
      },
      startEdit(row) {
        this.editing = row;
        // A copy, so Cancel discards an edit to any field, the notes included.
        this.form = {
          name: row.name,
          address: row.address,
          email: row.email,
          paypal_email: row.paypal_email,
          phone: row.phone || '',
          instagram_url: row.instagram_url || '',
          telegram_url: row.telegram_url || '',
          notes: row.notes || '',
        };
        this.error = '';
        this.fieldErrors = noErrors();
        this.editorOpen = true;
      },
      async save() {
        if (!this.form.name.trim()) {
          this.error = 'A client needs a name.';
          return;
        }
        this.saving = true;
        this.error = '';
        try {
          if (this.editing) await updateClient(this.editing.id, this.form);
          else await createClient(this.form);
          this.editorOpen = false;
          this.$emit('changed');
        } catch (err) {
          const { code, message } = errorOf(err);
          const refusal = FIELD_REFUSALS[code];
          if (refusal) {
            this.fieldErrors[refusal.field] = refusal.text;
            this.$nextTick(() => this.$refs[refusal.field] && this.$refs[refusal.field].focus());
            return;
          }
          this.error = message;
        } finally {
          this.saving = false;
        }
      },
    },
  };
</script>

<style scoped>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .panel-head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-md);
  }

  .multiline {
    white-space: pre-line;
  }

  .client-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .client-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    overflow-wrap: anywhere;
  }

  .client-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .client-name {
    display: block;
  }

  /* One line, cut with an ellipsis so a cut is visible (§3.23): line breaks
     in the note fold into spaces here, and the editor holds the full text.
     The max-width keeps a long note from widening the Name column. */
  /* Contact: one item per line (system_3 #10003). */
  .contact-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs, 2px);
  }

  .client-social {
    font-size: var(--text-sm);
  }

  /* Wrap only between whole items: "Instagram @name" never splits from its
     handle (§3.122 P3). */
  .client-social a,
  .client-contact {
    white-space: nowrap;
  }

  /* Her social links as one titled group in the client dialog. */
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

  .client-form__stamp {
    margin: 0;
    font-size: var(--text-sm);
  }

  .client-notes {
    display: block;
    max-width: 24rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .client-card .client-notes {
    max-width: 100%;
  }

  .client-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .client-form__error {
    color: var(--feedback-error);
    margin: 0;
  }

  @media (max-width: 640px) {
    .block-on-phone {
      width: 100%;
    }
  }
</style>
