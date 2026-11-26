<template>
  <!-- Every exit asks first when something is unsent (system_3 #11632). -->
  <AspModal :open="open" :title="title" size="md" @update:open="onOpenChange">
    <form class="manual-form" data-test="manual-form" :inert="unsentAsking || undefined" @submit.prevent="save">
      <template v-if="!editing">
        <p class="manual-form__lead">
          Enter a payment you received. It is saved as paid work. To invoice it, select it in the list and use Create invoice.
        </p>
      </template>
      <template v-else>
        <!-- §3.143 Decision 5: an issued invoice never changes, so neither may
             its payment; a draft keeps what it was made with. -->
        <p v-if="issued" class="manual-form__lock" data-test="edit-issued-line">
          On issued invoice {{ invoiceNumber }}. Cancel that invoice to change or remove this payment.
        </p>
        <p v-else-if="draft" class="manual-form__lead" data-test="edit-draft-line">
          On draft invoice {{ draftLabel }}. The draft keeps the amount and description it was made with: change them there too.
        </p>
        <!-- What the bank recorded, as text: nothing can make it editable
             (§3.22). A hand-entered payment on an issued invoice reads the
             same way, because nothing on it can change either. -->
        <template v-if="imported || issued">
          <p v-if="imported && !issued" class="manual-form__lead" data-test="edit-imported-lead">
            These details came from {{ sourceName }} and can't be changed. If they were read wrong, remove this payment and enter it by hand.
          </p>
          <dl class="facts" data-test="edit-facts">
            <div><dt>Date received</dt><dd>{{ formatDay(payment.paid_on) }}</dd></div>
            <div><dt>Amount</dt><dd>{{ formatMoney(payment.gross_cents, payment.currency) }}</dd></div>
            <div v-if="payment.fee_cents"><dt>Fee</dt><dd>{{ formatMoney(payment.fee_cents, payment.currency) }}</dd></div>
            <div v-if="payment.sender_name"><dt>{{ imported ? 'Paid by (from the bank)' : 'Paid by' }}</dt><dd>{{ payment.sender_name }}</dd></div>
            <div v-if="payment.sender_email"><dt>Email</dt><dd>{{ payment.sender_email }}</dd></div>
            <div v-if="!imported"><dt>Method</dt><dd>{{ methodLabel }}</dd></div>
            <div v-if="payment.reference"><dt>Reference</dt><dd>{{ payment.reference }}</dd></div>
            <div><dt>Source</dt><dd>{{ sourceName }}</dd></div>
            <div v-if="issued"><dt>Category</dt><dd>{{ categoryLabel }}</dd></div>
            <div v-if="issued && clientName"><dt>Client</dt><dd>{{ clientName }}</dd></div>
            <div v-if="issued && payment.note"><dt>What it was for</dt><dd>{{ payment.note }}</dd></div>
          </dl>
        </template>
      </template>

      <template v-if="!editing || (!imported && !issued)">
        <div class="manual-form__pair manual-form__pair--top">
          <!-- Its refusal sits under the input, outside the label, so it is
               not read as part of the field's name (system_3 #12298). -->
          <div class="date-field">
            <label for="manual-date-input">Date received</label>
            <input
              id="manual-date-input"
              ref="paid_on"
              v-model="form.paid_on"
              type="date"
              :max="today"
              :aria-invalid="fieldErrors.paid_on ? 'true' : undefined"
              :aria-describedby="fieldErrors.paid_on ? 'manual-date-error' : undefined"
              data-test="manual-date"
            />
            <span v-if="fieldErrors.paid_on" id="manual-date-error" class="manual-form__error" role="alert" data-test="manual-date-error">{{ fieldErrors.paid_on }}</span>
          </div>
          <AspInput ref="amount" v-model="form.amount" label="Amount (€)" inputmode="decimal" placeholder="350,00" :error="fieldErrors.amount" data-test="manual-amount" />
        </div>
        <div class="manual-form__pair manual-form__pair--method">
          <div class="full-select">
            <AspSelect v-model="form.method" :options="methodOptions" label="Method" data-test="manual-method" />
          </div>
          <AspInput v-model="form.reference" label="Reference (optional)" :label-hint="hints.reference" data-test="manual-reference" />
        </div>
        <!-- §3.142 Decision 2: one "Paid by" field replaces the Client select
             and the "Payer (optional)" field, both naming the person who paid.
             Optional: left empty, the payment is saved with no client, like an
             imported one. -->
        <SuggestField
          ref="sender_name"
          :model-value="form.sender_name"
          label="Paid by"
          placeholder="Choose or type a name"
          :options="payerOptions"
          maxlength="200"
          data-test="manual-payer"
          @update:model-value="onPayerInput"
        >
          <!-- Decision 3: before Save, the field says what Save will do, in
               both modes (§3.143 Decision 5; design_agent c66539 on system_3
               #10694): the PATCH takes new_client_name as create does
               (server #10696). A refusal is said above the choice line,
               whose buttons are what it asks for (system_3 #12298 review
               point 1). -->
          <p v-if="fieldErrors.sender_name" class="manual-form__error" role="alert" data-test="manual-payer-error">{{ fieldErrors.sender_name }}</p>
          <PayerBookLine
            :match="payerMatch"
            :name="form.sender_name"
            test-prefix="manual-payer"
            :as-new="resolvedAsNew"
            @use="useClient"
            @add-new="resolveAsNew"
          />
        </SuggestField>
        <!-- A new name is added to zir client book with this payment, so
             what ze knows about that client can be typed here once (system_3
             #11507, Design ack c71154). Shown only while Save will add a
             client; both are optional. No maxlength: the server's refusal is
             the limit and the typed text stays in the field (D13). -->
        <template v-if="addsNewClient">
          <AspTextarea v-model="newClient.address" label="Address (optional)" :rows="2" data-test="manual-new-client-address" />
          <AspInput v-model="newClient.email" type="email" label="Email (optional)" data-test="manual-new-client-email" />
        </template>
      </template>

      <template v-if="editing && !issued">
        <div class="full-select">
          <AspSelect
            v-model="form.category"
            :options="categoryOptions"
            label="Category"
            :disabled="draft"
            :aria-describedby="draft ? 'edit-category-locked' : undefined"
            data-test="edit-category"
          />
          <p v-if="draft" id="edit-category-locked" class="manual-form__hint" data-test="edit-category-locked">
            On draft invoice {{ draftLabel }}: take it off the draft first.
          </p>
        </div>
        <!-- An imported payment's payer is a bank fact; what ze can change is
             the client it belongs to. -->
        <div v-if="imported" class="full-select">
          <AspSelect v-model="form.client_id" searchable :options="clientOptions" label="Client" data-test="edit-client" />
        </div>
      </template>

      <!-- The invoice line's description: issuing refuses an empty one, but
           this dialog makes no draft, so leaving it blank loses nothing here
           (§3.142 Decision 1, D13). -->
      <LineDescriptionInput
        v-if="!issued"
        v-model="form.note"
        label="What it was for (optional)"
        :label-hint="hints.whatFor"
        data-test="manual-note"
      />

      <!-- §3.143 Decision 5: the correction is one tap away and never in the
           way (S4). Events come newest first. -->
      <details v-if="editing" class="history" data-test="edit-history">
        <summary class="fold-summary" data-test="edit-history-summary">History</summary>
        <p v-if="historyError" class="manual-form__hint" data-test="edit-history-error">{{ historyError }}</p>
        <ul v-else-if="history.length" class="history__list">
          <li v-for="line in history" :key="line.id" data-test="edit-history-line">{{ line.text }}</li>
        </ul>
        <p v-else class="manual-form__hint">{{ historyLoaded ? 'No changes recorded yet.' : 'Loading…' }}</p>
      </details>

    </form>
    <template #footer>
      <UnsentAsk v-if="unsentAsking" @keep="keepEditing" @discard="discardUnsent" />
      <!-- A refusal that names no field is said above the buttons
           (system_3 #12298 ruling 2). -->
      <ModalActions v-else :refusal="error" refusal-test="manual-error">
        <!-- Remove arms first and says what else happens (§3.143 Decision 6).
             A payment on an issued invoice cannot be removed. -->
        <template v-if="editing && !issued" #destructive>
          <AspButton
            ref="removeButton"
            :variant="confirmingRemove ? 'destructive' : 'ghost'"
            :loading="removing"
            data-test="edit-remove"
            @click="remove"
          >
            {{ confirmingRemove ? 'Remove this payment' : 'Remove' }}
          </AspButton>
          <span v-if="confirmingRemove && draft" class="manual-form__hint remove-effect" data-test="edit-remove-effect">
            It is also taken off draft {{ draftLabel }}.
          </span>
        </template>
        <template v-if="issued">
          <AspButton variant="secondary" data-test="edit-close" @click="onOpenChange(false)">Close</AspButton>
        </template>
        <template v-else>
          <AspButton variant="secondary" :disabled="unsentBusy" data-test="manual-cancel" @click="onOpenChange(false)">Cancel</AspButton>
          <AspButton ref="saveButton" :loading="saving" data-test="manual-save" @click="save">
            {{ editing ? 'Save changes' : 'Save payment' }}
          </AspButton>
        </template>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect, AspTextarea } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import PayerBookLine from './PayerBookLine.vue';
  import SuggestField from './SuggestField.vue';
  import ModalActions from './ModalActions.vue';
  import UnsentAsk from './UnsentAsk.vue';
  import { unsentGuard } from './unsentGuard.js';
  import { FIELD_HINTS } from './fieldHints.js';
  import { matchPayer, normalizeName, tidyName } from './payerMatch.js';
  import { historyLines } from './auditHistory.js';
  import {
    CATEGORY_LABELS,
    METHOD_LABELS,
    SOURCE_LABELS,
    centsFromEuros,
    createManualPayment,
    decimalFromMinor,
    errorOf,
    formatDay,
    formatMoney,
    listAuditEvents,
    patchPayment,
    removePayment,
  } from './api.js';
  import { focusAfterRefusal } from './refusalFocus.js';

  const noFieldErrors = () => ({ paid_on: '', amount: '', sender_name: '' });

  const blankForm = () => ({ paid_on: '', amount: '', method: 'bank_transfer', reference: '', sender_name: '', note: '', category: 'paid_work', client_id: 0 });

  // The form as the payment stands, so Save can send only what changed.
  const formFrom = (p) => ({
    paid_on: String(p.paid_on || '').slice(0, 10),
    amount: decimalFromMinor(p.gross_cents, 2).replace('.', ','),
    method: p.method || 'bank_transfer',
    reference: p.reference || '',
    sender_name: p.sender_name || '',
    note: p.note || '',
    category: p.category || 'uncategorised',
    client_id: p.client_id ?? 0,
  });

  // A second way into an invoice (system_3 #8409): no PayPal import needed.
  // The payment is stored first (incoming paid work, audited); an invoice is
  // made later from the list, as for an imported payment (§3.142 Decision 1,
  // #10539 — this dialog used to make a draft itself; it no longer does).
  // Given a `payment`, the same dialog edits it (§3.143 Decision 5, system_3
  // #10694): a hand-entered payment is zirs to change in full; an imported
  // one keeps what the bank recorded; one on an issued invoice only reads.
  export default {
    name: 'ManualPaymentDialog',
    components: { AspButton, AspInput, AspModal, AspSelect, AspTextarea, LineDescriptionInput, PayerBookLine, SuggestField, ModalActions, UnsentAsk },
    mixins: [unsentGuard],
    props: {
      open: { type: Boolean, default: false },
      clients: { type: Array, default: () => [] },
      payment: { type: Object, default: null },
    },
    emits: ['update:open', 'saved', 'changed'],
    data() {
      return {
        form: blankForm(),
        saving: false,
        error: '',
        // A refusal about one field, said at that field (system_3 #12298).
        fieldErrors: noFieldErrors(),
        hints: FIELD_HINTS,
        resolvedAsNew: false,
        // The address and email typed for a client this save will add.
        newClient: { address: '', email: '' },
        history: [],
        historyLoaded: false,
        historyError: '',
        confirmingRemove: false,
        removing: false,
      };
    },
    computed: {
      // While a write runs, no exit closes and none asks (system_3 #11632).
      unsentBusy() {
        return this.saving || this.removing;
      },
      editing() {
        return !!this.payment;
      },
      imported() {
        return this.editing && this.payment.entry !== 'manual';
      },
      // The live invoice the server names (system_3 #10666); a list read
      // before that field reads as on_issued_invoice alone.
      issued() {
        if (!this.editing) return false;
        const inv = this.payment.invoice;
        return (inv && inv.status === 'issued') || (!inv && !!this.payment.on_issued_invoice);
      },
      draft() {
        return this.editing && !this.issued && !!this.payment.invoice && this.payment.invoice.status === 'draft';
      },
      draftLabel() {
        return this.draft ? `D-${this.payment.invoice.id}` : '';
      },
      invoiceNumber() {
        const inv = this.payment && this.payment.invoice;
        return (inv && inv.invoice_number) || 'this invoice';
      },
      title() {
        return this.editing ? 'Edit payment' : 'Enter payment by hand';
      },
      sourceName() {
        if (!this.editing) return '';
        if (this.payment.entry === 'manual') return 'your hand entry';
        return SOURCE_LABELS[this.payment.source] || this.payment.source || 'the import';
      },
      methodLabel() {
        return this.editing ? METHOD_LABELS[this.payment.method] || this.payment.method || '—' : '';
      },
      categoryLabel() {
        return this.editing ? CATEGORY_LABELS[this.payment.category] || this.payment.category : '';
      },
      clientName() {
        if (!this.editing || !this.payment.client_id) return '';
        const c = this.clients.find((x) => x.id === this.payment.client_id);
        return c ? c.name : '';
      },
      methodOptions() {
        return Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));
      },
      categoryOptions() {
        return Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
      },
      clientOptions() {
        return [{ value: 0, label: 'No client' }, ...this.clients.map((c) => ({ value: c.id, label: c.name }))];
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
      // Narrowed as ze types by Decision 4's normalised "contains" (§3.142
      // Decision 2), not a plain substring match: accents, case and the
      // dropped punctuation marks never keep a real match out of the list.
      payerOptions() {
        const q = normalizeName(this.form.sender_name);
        const names = this.clients.map((c) => c.name);
        return q ? names.filter((n) => normalizeName(n).includes(q)) : names;
      },
      // §3.142 Decision 4, against the client book as loaded.
      payerMatch() {
        return matchPayer(this.form.sender_name, this.clients);
      },
      // True while Save will add "Paid by" to the client book: a new name,
      // or a close one ze chose to add as new. In edit mode only when the
      // name was changed, as `editPatch` sends it only then.
      addsNewClient() {
        const name = this.form.sender_name.trim();
        if (!name) return false;
        if (this.editing && name === this.payment.sender_name) return false;
        const m = this.payerMatch;
        return m.state === 'new' || (m.state === 'close' && this.resolvedAsNew);
      },
    },
    watch: {
      // A line goes when what it speaks about changes (system_3 #12298
      // ruling 4): a field's at that field's change, the footer's at any.
      'form.paid_on'() {
        this.fieldErrors.paid_on = '';
      },
      'form.amount'() {
        this.fieldErrors.amount = '';
      },
      'form.sender_name'() {
        this.fieldErrors.sender_name = '';
      },
      resolvedAsNew() {
        this.fieldErrors.sender_name = '';
      },
      form: {
        deep: true,
        handler() {
          this.error = '';
        },
      },
      open(isOpen) {
        if (!isOpen) return;
        this.form = this.payment ? formFrom(this.payment) : blankForm();
        this.error = '';
        this.fieldErrors = noFieldErrors();
        this.resolvedAsNew = false;
        this.newClient = { address: '', email: '' };
        this.confirmingRemove = false;
        this.history = [];
        this.historyLoaded = false;
        this.historyError = '';
        if (this.payment) this.loadHistory(this.payment.id);
        this.takeUnsentBaseline();
      },
    },
    methods: {
      // Esc, the scrim, the corner ✕, Cancel or Close, and Back (system_3
      // #11632): each asks first when something is unsent.
      onOpenChange(value) {
        if (value) return;
        this.requestClose();
      },
      closeNow() {
        this.$emit('update:open', false);
      },
      // What Save would send that the server does not hold, normalised as
      // Save does it. A new payment compares with the blank form, the new
      // client's details included; an edit sends only its patch.
      unsentValue() {
        if (this.editing) return { patch: this.issued || !this.payment ? {} : this.editPatch() };
        const f = this.form;
        const cents = String(f.amount).trim() ? centsFromEuros(f.amount) : null;
        return {
          paid_on: f.paid_on,
          amount: cents === null ? String(f.amount).trim() : cents,
          method: f.method,
          reference: f.reference.trim(),
          sender_name: f.sender_name.trim(),
          note: f.note.trim(),
          resolvedAsNew: this.resolvedAsNew,
          newClient: { address: (this.newClient.address || '').trim(), email: (this.newClient.email || '').trim() },
        };
      },
      // "Keep editing" after an armed Remove disarms it (§3.166).
      unsentKeptEditing() {
        this.confirmingRemove = false;
      },
      formatDay,
      formatMoney,
      async loadHistory(id) {
        try {
          const events = await listAuditEvents('payment', id);
          if (!this.payment || this.payment.id !== id) return;
          this.history = historyLines(events, this.clients);
        } catch (err) {
          this.historyError = `The history could not be loaded: ${errorOf(err).message}`;
        } finally {
          this.historyLoaded = true;
        }
      },
      // Picking a close match or typing again both re-run Decision 4 from
      // scratch; only an explicit "Add as new" click resolves a close state
      // (Decision 3: nothing is saved while that choice stands open).
      onPayerInput(value) {
        this.form.sender_name = value;
        this.resolvedAsNew = false;
      },
      useClient(client) {
        this.form.sender_name = client.name;
        this.resolvedAsNew = false;
      },
      resolveAsNew() {
        this.resolvedAsNew = true;
      },
      // What was typed for the new client, as the request's fields; a blank
      // one is left out.
      newClientDetails() {
        const out = {};
        const address = this.newClient.address.trim();
        const email = this.newClient.email.trim();
        if (address) out.new_client_address = address;
        if (email) out.new_client_email = email;
        return out;
      },
      // The client's own checks, each about one field: { field, text }, or
      // null when Save may go ahead.
      check() {
        if (this.editing && this.imported) return null;
        if (!this.form.paid_on) return { field: 'paid_on', text: 'Enter the date the money was received.' };
        const cents = centsFromEuros(this.form.amount);
        if (!cents) return { field: 'amount', text: 'Enter the amount received, for example 350,00.' };
        if (this.payerMatch.state === 'close' && !this.resolvedAsNew && (!this.editing || this.form.sender_name.trim() !== this.payment.sender_name)) {
          const typed = this.form.sender_name.trim();
          return { field: 'sender_name', text: `Choose a client from your book, or add “${typed}” as a new client.` };
        }
        return null;
      },
      // A refused Save: at its field, focused, or above the buttons with
      // focus back on the button pressed (system_3 #12298 rulings 1-3).
      refuse(refusal, button = 'saveButton') {
        if (refusal.field) {
          this.fieldErrors[refusal.field] = refusal.text;
          focusAfterRefusal(this, refusal.field);
        } else {
          this.error = refusal.text;
          focusAfterRefusal(this, button);
        }
      },
      // Only the fields ze changed, and only those the server lets this row
      // change (aspirant-server invoicing_edit.go's editable sets).
      editPatch() {
        const was = formFrom(this.payment);
        const now = this.form;
        const patch = {};
        if (now.note.trim() !== was.note) patch.note = now.note.trim();
        if (!this.draft && now.category !== was.category) patch.category = now.category;
        if (this.imported) {
          if (now.client_id !== was.client_id) patch.client_id = now.client_id || null;
          return patch;
        }
        if (now.paid_on !== was.paid_on) patch.paid_on = now.paid_on;
        const cents = centsFromEuros(now.amount);
        if (cents !== this.payment.gross_cents) patch.gross_cents = cents;
        if (now.method !== was.method) patch.method = now.method;
        if (now.reference.trim() !== was.reference) patch.reference = now.reference.trim();
        const name = now.sender_name.trim();
        if (name !== was.sender_name) {
          patch.sender_name = name;
          // §3.142 Decisions 2-4, as on create: the same client links it; a
          // new name (or a close one ze chose to add as new) adds it to zir
          // book with the payment; an empty field leaves no client.
          const m = this.payerMatch;
          if (m.state === 'same') {
            if (m.client.id !== was.client_id) patch.client_id = m.client.id;
          } else if (name && (m.state === 'new' || (m.state === 'close' && this.resolvedAsNew))) {
            patch.new_client_name = tidyName(name);
            Object.assign(patch, this.newClientDetails());
          } else if (!name && was.client_id) {
            patch.client_id = null;
          }
        }
        return patch;
      },
      async save() {
        this.error = '';
        this.fieldErrors = noFieldErrors();
        const refused = this.check();
        if (refused) {
          this.refuse(refused);
          return;
        }
        if (this.editing) return this.saveEdit();
        this.saving = true;
        const payload = {
          paid_on: this.form.paid_on,
          gross_cents: centsFromEuros(this.form.amount),
          method: this.form.method,
          reference: this.form.reference.trim(),
          sender_name: this.form.sender_name.trim(),
          note: this.form.note.trim(),
        };
        if (this.payerMatch.state === 'same') {
          payload.client_id = this.payerMatch.client.id;
        } else if (this.payerMatch.state === 'new' || (this.payerMatch.state === 'close' && this.resolvedAsNew)) {
          if (payload.sender_name) {
            payload.new_client_name = tidyName(payload.sender_name);
            Object.assign(payload, this.newClientDetails());
          }
        }
        try {
          const { payment, client } = await createManualPayment(payload);
          this.$emit('update:open', false);
          this.$emit('saved', { payment, client: client || null });
          this.$emit('changed');
        } catch (err) {
          this.refuse({ text: errorOf(err).message });
        } finally {
          this.saving = false;
        }
      },
      async saveEdit() {
        const patch = this.editPatch();
        if (!Object.keys(patch).length) {
          this.$emit('update:open', false);
          return;
        }
        this.saving = true;
        try {
          await patchPayment(this.payment.id, patch);
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.refuse({ text: errorOf(err).message });
        } finally {
          this.saving = false;
        }
      },
      // Two steps, like the row's Delete it replaces: the first press arms.
      async remove() {
        if (!this.confirmingRemove) {
          this.confirmingRemove = true;
          return;
        }
        this.removing = true;
        this.error = '';
        try {
          await removePayment(this.payment.id);
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.refuse({ text: errorOf(err).message }, 'removeButton');
        } finally {
          this.removing = false;
          this.confirmingRemove = false;
        }
      },
    },
  };
</script>

<style scoped>
  .manual-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .manual-form__lead,
  .manual-form__hint,
  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .manual-form__lock {
    margin: 0;
  }

  /* What the bank recorded, as plain text in two columns (§3.22: nothing
     here can be edited, so nothing looks like an input). */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-xs) var(--space-md);
    margin: 0;
  }

  .facts div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .facts dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .history__list {
    margin: 0;
    padding-left: var(--space-lg);
    font-size: var(--text-sm);
  }

  .remove-effect {
    margin-left: var(--space-xs);
  }

  /* Wide: date + amount, method + reference side by side (design_agent's
     sign-off on #8409); one column on a phone. */
  .manual-form__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    align-items: end;
  }

  .manual-form__pair--top {
    align-items: start;
  }

  /* Method keeps its one-line width ("Banküberweisung (Bank transfer)" wrapped
     in a half column: operator c61550, system_3 #9965/#9968); Reference takes
     the rest of the row. Still side by side, as signed off on #8409. */
  .manual-form__pair--method {
    grid-template-columns: minmax(max-content, 3fr) 2fr;
  }

  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--text-sm);
    min-width: 0;
  }

  .date-field input[aria-invalid='true'] {
    border-color: var(--feedback-error);
  }

  .date-field input {
    font: inherit;
    font-size: var(--text-base);
    min-height: 34px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-control, var(--border-subtle));
    background: var(--surface-input, transparent);
    color: inherit;
    min-width: 0;
  }

  .manual-form__error {
    margin: 0;
    color: var(--feedback-error);
  }

  @media (max-width: 640px) {
    .manual-form__pair {
      grid-template-columns: 1fr;
    }
  }
</style>
