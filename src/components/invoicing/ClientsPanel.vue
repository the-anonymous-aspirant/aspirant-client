<template>
  <section class="clients-panel" data-test="clients-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Clients</h2>
      <!-- §3.142 Decision 5: the payers dialog's second way in, present only
           while a payment's payer is not yet in the book (§3.133 Decision 5).
           The primary stays rightmost. -->
      <AspButton
        v-if="payerCandidates.length"
        variant="secondary"
        class="block-on-phone"
        data-test="clients-add-from-payments"
        @click="openPayers"
      >
        Add from payments
      </AspButton>
      <AspButton class="block-on-phone" data-test="client-add" @click="startAdd">Add client</AspButton>
    </div>
    <!-- A payers save confirmed here too: the linked payments are not on
         this tab, so the line says what happened (design_agent c65575). It
         clears on the tab's next action. -->
    <p v-if="payersSummary" class="payers-status" role="status" data-test="clients-payers-summary">{{ payersSavedLine(payersSummary) }}</p>

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
        <span v-if="safeSocialUrl('instagram', row.instagram_url) || safeSocialUrl('telegram', row.telegram_url)" class="client-social" data-test="client-social">
          <a
            v-if="safeSocialUrl('instagram', row.instagram_url)"
            :href="safeSocialUrl('instagram', row.instagram_url)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Instagram: ${socialHandle(safeSocialUrl('instagram', row.instagram_url))} (opens in a new tab)`"
            data-test="client-instagram"
            >Instagram {{ socialHandle(safeSocialUrl('instagram', row.instagram_url)) }}</a
          ><span v-if="safeSocialUrl('instagram', row.instagram_url) && safeSocialUrl('telegram', row.telegram_url)" aria-hidden="true"> · </span
          ><a
            v-if="safeSocialUrl('telegram', row.telegram_url)"
            :href="safeSocialUrl('telegram', row.telegram_url)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Telegram: ${socialHandle(safeSocialUrl('telegram', row.telegram_url))} (opens in a new tab)`"
            data-test="client-telegram"
            >Telegram {{ socialHandle(safeSocialUrl('telegram', row.telegram_url)) }}</a
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
      <!-- Zir notes read as one muted line under the name, cut with an
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
      <!-- Contact: email, phone, then zir social links (system_3 #10003). A
           link's href is the URL as stored, never rebuilt from a handle
           (security, c61900 on #10002); it opens in a new tab. -->
      <template #cell-email="{ row }">
        <span class="contact-stack">
          <span v-if="row.email" class="muted">{{ row.email }}</span>
          <a v-if="row.phone" class="client-contact" :href="`tel:${row.phone.replace(/[^0-9+]/g, '')}`" data-test="client-phone">{{ row.phone }}</a>
          <span v-if="safeSocialUrl('instagram', row.instagram_url) || safeSocialUrl('telegram', row.telegram_url)" class="client-social" data-test="client-social">
            <a
              v-if="safeSocialUrl('instagram', row.instagram_url)"
              :href="safeSocialUrl('instagram', row.instagram_url)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Instagram: ${socialHandle(safeSocialUrl('instagram', row.instagram_url))} (opens in a new tab)`"
              data-test="client-instagram"
              >Instagram {{ socialHandle(safeSocialUrl('instagram', row.instagram_url)) }}</a
            ><span v-if="safeSocialUrl('instagram', row.instagram_url) && safeSocialUrl('telegram', row.telegram_url)" aria-hidden="true"> · </span
            ><a
              v-if="safeSocialUrl('telegram', row.telegram_url)"
              :href="safeSocialUrl('telegram', row.telegram_url)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Telegram: ${socialHandle(safeSocialUrl('telegram', row.telegram_url))} (opens in a new tab)`"
              data-test="client-telegram"
              >Telegram {{ socialHandle(safeSocialUrl('telegram', row.telegram_url)) }}</a
            >
          </span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <AspButton variant="ghost" size="sm" :data-test="`client-edit-${row.id}`" @click="startEdit(row)">Edit</AspButton>
      </template>
    </AspDataTable>

    <!-- Zir client list as a spreadsheet (operator c61628, system_3 #10013;
         server #10012). An occasional action, so it follows the list, the
         same place and shape as the Invoices tab's Export group: button and
         caption are one unit (#9948, #9960). No check screen: a client list
         has no integrity rules. -->
    <section class="export-group" aria-labelledby="clients-export-heading" data-test="clients-export">
      <h3 id="clients-export-heading">Export</h3>
      <div class="export">
        <AspButton
          variant="secondary"
          :disabled="clients.length === 0"
          :loading="csvDownloading"
          aria-describedby="clients-csv-scope"
          data-test="export-clients-csv"
          @click="downloadClientsCsv"
        >
          Client list (CSV)
        </AspButton>
        <p id="clients-csv-scope" class="export__scope muted" data-test="export-clients-csv-scope">{{ csvScope }}</p>
      </div>
      <p v-if="csvError" class="error" role="alert" data-test="export-clients-csv-error">{{ csvError }}</p>
    </section>

    <AspModal v-model:open="editorOpen" :title="editing ? 'Edit client' : 'Add client'" size="md">
      <form class="client-form" data-test="client-form" @submit.prevent="save">
        <!-- When ze added the client and when it was updated, as days in zir
             calendar (operator c61587, design_agent c62046). -->
        <p v-if="editing && editingStamp" class="client-form__stamp muted" data-test="client-stamp">{{ editingStamp }}</p>
        <!-- What ze has done for this client (operator c61586, system_3
             #10006): issued invoices only, as the Statistics charts count
             them. The block's box is the same in every state (loading, the
             figures, none, failed), so the fields below never move once the
             dialog is open (design_agent c62125, D15): the <dl> always lays
             out, and a one-line state sits over it when there are no figures. -->
        <div v-if="editing" class="client-stats-slot" :aria-busy="statsState === 'loading' ? 'true' : 'false'">
          <dl
            class="client-stats"
            :class="{ 'client-stats--hidden': statsState === 'none' || statsState === 'failed' }"
            :aria-hidden="statsState === 'none' || statsState === 'failed' ? 'true' : undefined"
            :data-test="statsState === 'ready' ? 'client-stats' : undefined"
          >
            <div><dt>Issued invoices</dt><dd data-test="client-stats-count">{{ statsState === 'ready' ? stats.count : '…' }}</dd></div>
            <div><dt>Invoiced</dt><dd data-test="client-stats-total">{{ statsState === 'ready' ? stats.totalLabel : '…' }}</dd></div>
            <div><dt>Last invoice</dt><dd data-test="client-stats-last">{{ statsState === 'ready' ? stats.last : '…' }}</dd></div>
          </dl>
          <p v-if="statsState === 'none'" class="client-stats__state muted" data-test="client-stats-none">No issued invoices.</p>
          <p v-if="statsState === 'failed'" class="client-stats__state muted" data-test="client-stats-failed">Invoice figures could not be loaded.</p>
        </div>
        <AspInput v-model="form.name" label="Name" required />
        <AspTextarea
          v-model="form.address"
          label="Postal address"
          :rows="3"
          hint="Needed for invoices over 250 € gross."
        />
        <AspInput v-model="form.email" type="email" label="Email" />
        <AspInput v-model="form.paypal_email" type="email" label="PayPal email" hint="Imported payments from this address are linked to the client." />
        <!-- Phone and zir social links are zirs, not the invoice's (operator
             c61586): never printed. A refusal shows on its own field, in
             place of its hint, with zir text kept (as #9993). -->
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
    <PayersDialog
      v-model:open="payersOpen"
      :candidates="payerCandidates"
      :left-out="payerLeftOut"
      :clients="clients"
      @saved="onPayersSaved"
    />
  </section>
</template>

<script>
  import { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import PayersDialog from './PayersDialog.vue';
  import { FIELD_REFUSALS, clientsCsvUrl, createClient, downloadBlob, errorOf, formatBerlinDay, formatDay, formatMoney, listInvoices, listPayerCandidates, payersSavedLine, safeSocialUrl, socialHandle, updateClient } from './api.js';

  const blank = () => ({ name: '', address: '', email: '', paypal_email: '', phone: '', instagram_url: '', telegram_url: '', notes: '' });
  const noErrors = () => ({ phone: '', instagram_url: '', telegram_url: '' });

  // The people Flower invoices (spec §4.2). The name is required here
  // because the server requires it. The address is optional: an invoice up
  // to 250 EUR gross needs none (§33 UStDV), and issuing refuses one above
  // that without it (system_3 #9835). The server is still the gate.
  export default {
    name: 'ClientsPanel',
    components: { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea, ModalActions, PayersDialog },
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
        stats: null,
        // loading | ready | none | failed (#10006)
        statsState: 'loading',
        csvDownloading: false,
        csvError: '',
        payerCandidates: [],
        payerLeftOut: {},
        payersOpen: false,
        payersSummary: null,
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
      // What the CSV holds and how many, said before the click (#9948's unit).
      csvScope() {
        const n = this.clients.length;
        if (n === 0) return 'No clients yet.';
        return n === 1 ? '1 client, one row. Notes are left out.' : `${n} clients, one row each. Notes are left out.`;
      },
      editingStamp() {
        const c = this.editing;
        if (!c) return '';
        // Days in zir calendar; "updated" is the operator's word, and true of
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
      this.refreshPayerCandidates();
    },
    beforeUnmount() {
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
    },
    watch: {
      // A client added here or elsewhere can take payers off the list.
      clients() {
        this.refreshPayerCandidates();
      },
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
      // The offer is optional: a failed read shows no button.
      async refreshPayerCandidates() {
        try {
          const { payers, leftOut } = await listPayerCandidates();
          this.payerCandidates = payers;
          this.payerLeftOut = leftOut;
        } catch (err) {
          this.payerCandidates = [];
          this.payerLeftOut = {};
        }
      },
      payersSavedLine,
      openPayers() {
        this.payersSummary = null;
        this.payersOpen = true;
      },
      // The new clients appear in the list on the parent's refetch.
      onPayersSaved(result) {
        this.payersSummary = result;
        this.$emit('changed');
      },
      safeSocialUrl,
      socialHandle,
      // The file holds every client, one row each, notes never (#10012).
      async downloadClientsCsv() {
        this.payersSummary = null;
        if (this.csvDownloading || this.clients.length === 0) return;
        this.csvDownloading = true;
        this.csvError = '';
        try {
          await downloadBlob(clientsCsvUrl(), 'Kunden.csv');
        } catch (err) {
          this.csvError = errorOf(err).message;
        } finally {
          this.csvDownloading = false;
        }
      },
      startAdd() {
        this.payersSummary = null;
        this.editing = null;
        this.form = blank();
        this.error = '';
        this.fieldErrors = noErrors();
        this.editorOpen = true;
      },
      // A client's figures (#10006): issued invoices only (a Storno's
      // replacement is counted, the cancelled one is not, as in #9972's
      // charts); the gross total per currency, EUR first; the latest issue
      // date. A late answer for a client no longer open is dropped.
      async loadStats(clientId) {
        this.stats = null;
        this.statsState = 'loading';
        try {
          const all = await listInvoices({});
          if (!this.editing || this.editing.id !== clientId) return;
          const issued = all.filter((i) => i.status === 'issued' && i.client_id === clientId);
          const sums = {};
          for (const i of issued) sums[i.currency || 'EUR'] = (sums[i.currency || 'EUR'] || 0) + (Number(i.total_cents) || 0);
          const currencies = Object.keys(sums).sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)));
          const last = issued.map((i) => formatDay(i.issue_date)).filter(Boolean).sort().pop() || '';
          this.stats = { count: issued.length, totalLabel: currencies.map((c) => formatMoney(sums[c], c)).join(' + '), last };
          this.statsState = issued.length ? 'ready' : 'none';
        } catch {
          if (this.editing && this.editing.id === clientId) this.statsState = 'failed';
        }
      },
      startEdit(row) {
        this.payersSummary = null;
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
        this.loadStats(row.id);
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
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .payers-status {
    margin: 0 0 var(--space-md);
    color: var(--text-muted);
    font-size: var(--text-sm);
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

  /* Zir social links as one titled group in the client dialog. */
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

  /* One box for every state of the figures (#10006): the <dl> always lays
     out; with no figures it is hidden and its one-line state sits over it. */
  .client-stats-slot {
    position: relative;
  }

  .client-stats--hidden {
    visibility: hidden;
  }

  .client-stats__state {
    position: absolute;
    top: 0;
    left: 0;
    margin: 0;
    font-size: var(--text-sm);
  }

  /* Three figures read across; stacked label over value on a phone. */
  .client-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-sm);
    margin: 0;
  }

  .client-stats dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .client-stats dd {
    margin: 0;
    font-weight: var(--font-weight-medium, 500);
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .client-stats {
      grid-template-columns: 1fr;
    }
  }

  /* The Export group, as on the Invoices tab (#10013). */
  .export-group {
    margin-top: var(--space-lg);
  }

  .export-group h3 {
    margin: 0 0 var(--space-sm);
  }

  .export {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
    max-width: 22rem;
  }

  .export__scope {
    margin: 0;
    font-size: var(--text-sm);
  }

  .export-group > .error {
    margin: var(--space-sm) 0 0;
    color: var(--feedback-error);
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
    .export {
      align-items: stretch;
      max-width: none;
    }

    .export :deep(button) {
      width: 100%;
    }

    .block-on-phone {
      width: 100%;
    }
  }
</style>
