<template>
  <AspModal :open="open" title="Enter payment by hand" size="md" @update:open="$emit('update:open', $event)">
    <form class="manual-form" data-test="manual-form" @submit.prevent="save">
      <p class="manual-form__lead">
        Enter a payment you received. It is saved as paid work. To invoice it, select it in the list and use Create invoice.
      </p>
      <div class="manual-form__pair manual-form__pair--top">
        <label class="date-field">
          <span>Date received</span>
          <input v-model="form.paid_on" type="date" :max="today" data-test="manual-date" />
        </label>
        <AspInput v-model="form.amount" label="Amount (€)" inputmode="decimal" placeholder="350,00" data-test="manual-amount" />
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
        :model-value="form.sender_name"
        label="Paid by"
        placeholder="Choose or type a name"
        :options="payerOptions"
        maxlength="200"
        data-test="manual-payer"
        @update:model-value="onPayerInput"
      >
        <!-- Decision 3: before Save, the field says what Save will do. -->
        <p v-if="payerLine" class="hint payer-line" data-test="manual-payer-line">{{ payerLine }}</p>
        <div v-if="payerMatch.state === 'close'" class="payer-choices" data-test="manual-payer-choices">
          <AspButton
            v-for="c in payerMatch.candidates"
            :key="c.id"
            variant="ghost"
            size="sm"
            :data-test="`manual-payer-use-${c.id}`"
            @click="useClient(c)"
          >
            Use {{ c.name }}
          </AspButton>
          <AspButton variant="ghost" size="sm" data-test="manual-payer-add-new" @click="resolveAsNew">
            Add “{{ form.sender_name.trim() }}” as a new client
          </AspButton>
        </div>
      </SuggestField>
      <!-- The invoice line's description: issuing refuses an empty one, but
           this dialog makes no draft, so leaving it blank loses nothing here
           (§3.142 Decision 1, D13). -->
      <LineDescriptionInput v-model="form.note" label="What it was for (optional)" :label-hint="hints.whatFor" data-test="manual-note" />
      <p v-if="error" class="manual-form__error" role="alert" data-test="manual-error">{{ error }}</p>
    </form>
    <template #footer>
      <ModalActions>
        <AspButton variant="secondary" @click="$emit('update:open', false)">Cancel</AspButton>
        <AspButton :loading="saving" data-test="manual-save" @click="save">
          Save payment
        </AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import SuggestField from './SuggestField.vue';
  import ModalActions from './ModalActions.vue';
  import { FIELD_HINTS } from './fieldHints.js';
  import { matchPayer, normalizeName, tidyName } from './payerMatch.js';
  import { METHOD_LABELS, centsFromEuros, createManualPayment, errorOf } from './api.js';

  const blankForm = () => ({ paid_on: '', amount: '', method: 'bank_transfer', reference: '', sender_name: '', note: '' });

  // A second way into an invoice (system_3 #8409): no PayPal import needed.
  // The payment is stored first (incoming paid work, audited); an invoice is
  // made later from the list, as for an imported payment (§3.142 Decision 1,
  // #10539 — this dialog used to make a draft itself; it no longer does).
  export default {
    name: 'ManualPaymentDialog',
    components: { AspButton, AspInput, AspModal, AspSelect, LineDescriptionInput, SuggestField, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      clients: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'saved', 'changed'],
    data() {
      return { form: blankForm(), saving: false, error: '', hints: FIELD_HINTS, resolvedAsNew: false };
    },
    computed: {
      methodOptions() {
        return Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
      // Narrowed as she types by Decision 4's normalised "contains" (§3.142
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
      // §3.142 Decision 3: one muted line under the field, by state.
      payerLine() {
        switch (this.payerMatch.state) {
          case 'same':
            return 'In your client book.';
          case 'new':
            return 'Not in your client book yet: Save adds it.';
          case 'close':
            return 'Close to a client in your book:';
          default:
            return '';
        }
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = blankForm();
          this.error = '';
          this.resolvedAsNew = false;
        }
      },
    },
    methods: {
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
      check() {
        if (!this.form.paid_on) return 'Enter the date the money was received.';
        const cents = centsFromEuros(this.form.amount);
        if (!cents) return 'Enter the amount received, for example 350,00.';
        if (this.payerMatch.state === 'close' && !this.resolvedAsNew) {
          const typed = this.form.sender_name.trim();
          return `Choose a client from your book, or add “${typed}” as a new client.`;
        }
        return '';
      },
      async save() {
        this.error = this.check();
        if (this.error) return;
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
          if (payload.sender_name) payload.new_client_name = tidyName(payload.sender_name);
        }
        try {
          const { payment, client } = await createManualPayment(payload);
          this.$emit('update:open', false);
          this.$emit('saved', { payment, client: client || null });
          this.$emit('changed');
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
  .manual-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .manual-form__lead,
  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .payer-line {
    margin-top: var(--space-2xs);
  }

  .payer-choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
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

  .date-field input {
    font: inherit;
    font-size: var(--text-base);
    min-height: 34px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-control, var(--border-subtle));
    background: var(--surface-input, transparent);
    color: inherit;
    color-scheme: light dark;
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
