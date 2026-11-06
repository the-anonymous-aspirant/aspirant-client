<template>
  <AspModal :open="open" title="Enter payment by hand" size="md" @update:open="$emit('update:open', $event)">
    <form class="manual-form" data-test="manual-form" @submit.prevent="save">
      <p class="manual-form__lead">
        Enter a payment you received. It is saved as paid work and a draft invoice is made from it.
      </p>
      <div class="manual-form__full full-select">
        <AspSelect v-model="form.client_id" :options="clientOptions" label="Client" data-test="manual-client" />
        <p v-if="!clients.length" id="manual-no-clients-hint" class="hint" data-test="manual-no-clients">Add the client on the Clients tab first.</p>
      </div>
      <div class="manual-form__pair manual-form__pair--top">
        <label class="date-field">
          <span>Date received</span>
          <input v-model="form.paid_on" type="date" :max="today" data-test="manual-date" />
        </label>
        <AspInput v-model="form.amount" label="Amount (€)" inputmode="decimal" placeholder="350,00" :hint="addressHint" data-test="manual-amount" />
      </div>
      <div class="manual-form__pair manual-form__pair--method">
        <div class="full-select">
          <AspSelect v-model="form.method" :options="methodOptions" label="Method" data-test="manual-method" />
        </div>
        <AspInput v-model="form.reference" label="Reference (optional)" data-test="manual-reference" />
      </div>
      <AspInput v-model="form.sender_name" label="Payer (optional)" data-test="manual-payer" />
      <!-- The invoice line's description: issuing refuses an empty one, so it
           is asked for here rather than left to fail later. -->
      <LineDescriptionInput v-model="form.note" label="What it was for" data-test="manual-note" />
      <p v-if="error" class="manual-form__error" role="alert" data-test="manual-error">{{ error }}</p>
    </form>
    <template #footer>
      <ModalActions>
        <AspButton variant="secondary" @click="$emit('update:open', false)">Cancel</AspButton>
        <div class="save-group">
          <AspButton
            :loading="saving"
            :disabled="!clients.length"
            :aria-describedby="!clients.length ? 'manual-save-hint' : undefined"
            data-test="manual-save"
            @click="save"
          >
            Create draft
          </AspButton>
          <!-- Same "why is this grey" treatment as PaymentsPanel's Create
               invoice button (operator ask, #9926-A4): the reason is already
               on screen next to the field it names, but a disabled button
               cannot itself say why, so it says it again right where the eye
               lands on the greyed-out control. -->
          <p v-if="!clients.length" id="manual-save-hint" class="hint save-group__hint" data-test="manual-save-hint">
            Add a client first.
          </p>
        </div>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import ModalActions from './ModalActions.vue';
  import { KLEINBETRAG_LIMIT_CENTS, METHOD_LABELS, centsFromEuros, createDraft, createManualPayment, errorOf, formatMoney } from './api.js';

  const blankForm = () => ({ client_id: 0, paid_on: '', amount: '', method: 'bank_transfer', reference: '', sender_name: '', note: '' });

  // A second way into an invoice (system_3 #8409): no PayPal import needed.
  // The payment is stored first (incoming paid work, audited), then a draft
  // is made from it exactly as from an imported payment, so every §10 rule
  // applies unchanged. The server checks everything again.
  export default {
    name: 'ManualPaymentDialog',
    components: { AspButton, AspInput, AspModal, AspSelect, LineDescriptionInput, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      clients: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'created', 'changed'],
    data() {
      return { form: blankForm(), saving: false, error: '' };
    },
    computed: {
      // §33 UStDV, said where the draft is made (system_3 #9949, design_agent
      // c61924): a muted hint, not a block. Issuing is what the server refuses.
      addressHint() {
        const c = this.clients.find((x) => x.id === this.form.client_id);
        if (!c || (c.address || '').trim()) return null;
        const cents = centsFromEuros(this.form.amount);
        if (!cents || cents <= KLEINBETRAG_LIMIT_CENTS) return null;
        return `${c.name} has no address: an invoice above ${formatMoney(KLEINBETRAG_LIMIT_CENTS)} needs one before it can be issued.`;
      },
      clientOptions() {
        return [{ value: 0, label: 'Choose a client' }, ...this.clients.map((c) => ({ value: c.id, label: c.name }))];
      },
      methodOptions() {
        return Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = blankForm();
          this.error = '';
        }
      },
    },
    methods: {
      check() {
        if (!this.form.client_id) return 'Choose the client who paid.';
        if (!this.form.paid_on) return 'Enter the date the money was received.';
        const cents = centsFromEuros(this.form.amount);
        if (!cents) return 'Enter the amount received, for example 350,00.';
        if (!this.form.note.trim()) return 'Say what the payment was for; it becomes the invoice line.';
        return '';
      },
      async save() {
        this.error = this.check();
        if (this.error) return;
        this.saving = true;
        let payment = null;
        try {
          payment = await createManualPayment({
            client_id: this.form.client_id,
            paid_on: this.form.paid_on,
            gross_cents: centsFromEuros(this.form.amount),
            method: this.form.method,
            reference: this.form.reference.trim(),
            sender_name: this.form.sender_name.trim(),
            note: this.form.note.trim(),
          });
          const draft = await createDraft([payment.id]);
          this.$emit('update:open', false);
          this.$emit('created', draft.invoice.id);
        } catch (err) {
          const message = errorOf(err).message;
          // The payment may be stored even though the draft was refused; it
          // then waits in the list like any paid-work payment.
          this.error = payment ? `The payment was saved, but no draft was made: ${message}` : message;
        } finally {
          this.saving = false;
          if (payment) this.$emit('changed');
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

  .hint {
    margin-top: var(--space-2xs);
  }

  .save-group {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2xs);
  }

  .save-group__hint {
    margin-top: 0;
    text-align: right;
  }

  @media (max-width: 640px) {
    .save-group {
      align-items: stretch;
      width: 100%;
    }

    .save-group__hint {
      text-align: left;
    }
  }

  /* Wide: date + amount, method + reference side by side (design_agent's
     sign-off on #8409); one column on a phone. */
  .manual-form__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    align-items: end;
  }

  /* Date and amount line up by their tops: the amount's §33 hint (system_3
     #9949) hangs below its field without pushing the date down. */
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
