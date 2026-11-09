<template>
  <!-- After a PayPal import (system_3 #10438): the payments are already in;
       the file's outgoing payments were not stored, and are offered here as
       work expenses. Only the ticked ones are added, each with its category. -->
  <AspModal :open="open" title="Add PayPal expenses" size="md" @update:open="close">
    <div class="ppx" data-test="paypal-expenses-review">
      <p class="ppx__lead">
        Your PayPal payments are imported. The file also lists payments you made: add the ones that were for your work. To add them later, import this file again.
      </p>
      <ExpenseCandidatesSection
        :items="items"
        :categories="categories"
        :disabled="confirming"
        @update:checked="setChecked"
        @update:category="setCategory"
      />
      <p v-if="error" class="ppx__error" role="alert" data-test="paypal-expenses-error">{{ error }}</p>
    </div>
    <template #footer>
      <div class="ppx-footer">
        <ModalActions>
          <AspButton variant="secondary" :disabled="confirming" data-test="paypal-expenses-cancel" @click="close(false)">Not now</AspButton>
          <AspButton :loading="confirming" :disabled="ticked.length === 0" data-test="paypal-expenses-confirm" @click="confirm">
            {{ confirmLabel }}
          </AspButton>
        </ModalActions>
        <p v-if="ticked.length === 0" class="ppx-footer__note" data-test="paypal-expenses-tick-hint">
          Tick at least one payment to add it as an expense.
        </p>
      </div>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspModal } from '@aspirant/design-system';
  import ExpenseCandidatesSection from './ExpenseCandidatesSection.vue';
  import ModalActions from './ModalActions.vue';
  import { confirmPayPalExpenses, errorOf, listExpenseCategories } from './api.js';

  // Every book has this category (the server seeds it): the default, and the
  // fallback when the list cannot be read.
  const EXPENSE_CATEGORY_DEFAULT = 'other';

  export default {
    name: 'PayPalExpensesDialog',
    components: { AspButton, AspModal, ExpenseCandidatesSection, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      // The import response's expense_candidates (server PR 178).
      candidates: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'done'],
    data() {
      return { state: {}, categories: [EXPENSE_CATEGORY_DEFAULT], confirming: false, error: '' };
    },
    computed: {
      items() {
        return this.candidates.map((row, i) => ({ key: String(i), row, ...this.stateOf(i) }));
      },
      ticked() {
        return this.candidates
          .map((row, i) => ({ row, ...this.stateOf(i) }))
          .filter(({ row, checked }) => checked && !row.already_imported)
          .map(({ row, category }) => ({
            transaction_id: row.transaction_id,
            paid_on: row.paid_on,
            currency: row.currency,
            amount_cents: row.amount_cents,
            payee_name: row.payee_name,
            note: row.note,
            category,
          }));
      },
      confirmLabel() {
        const n = this.ticked.length;
        return `Add ${n} expense${n === 1 ? '' : 's'}`;
      },
    },
    watch: {
      // A new import starts from the defaults: every payment unticked (most
      // PayPal spending is not work), in the catch-all category.
      candidates: {
        immediate: true,
        handler() {
          const state = {};
          this.candidates.forEach((_, i) => {
            state[String(i)] = { checked: false, category: EXPENSE_CATEGORY_DEFAULT };
          });
          this.state = state;
          this.error = '';
        },
      },
      // The category list is read when the review opens, not for an import
      // that offers nothing new.
      open(isOpen) {
        if (isOpen) this.loadCategories();
      },
    },
    methods: {
      async loadCategories() {
        try {
          const names = (await listExpenseCategories()).map((c) => c.name).filter(Boolean);
          if (names.length) this.categories = names;
        } catch (err) {
          this.categories = [EXPENSE_CATEGORY_DEFAULT];
        }
      },
      stateOf(i) {
        return this.state[String(i)] || { checked: false, category: EXPENSE_CATEGORY_DEFAULT };
      },
      setChecked(key, on) {
        this.state = { ...this.state, [key]: { ...this.state[key], checked: on } };
      },
      setCategory(key, category) {
        this.state = { ...this.state, [key]: { ...this.state[key], category } };
      },
      // Dismissing adds nothing; the payments are in either way. Nothing on
      // the page reopens the review: importing the same file again offers
      // the rows not yet in the book (the lead says so).
      close(value) {
        if (this.confirming || value) return;
        this.$emit('done', { confirmed: 0, duplicates: 0 });
        this.$emit('update:open', false);
      },
      async confirm() {
        const rows = this.ticked;
        if (!rows.length) return;
        this.confirming = true;
        this.error = '';
        try {
          const result = await confirmPayPalExpenses(rows);
          this.confirming = false;
          this.$emit('done', result);
          this.$emit('update:open', false);
        } catch (err) {
          this.error = errorOf(err).message;
          this.confirming = false;
        }
      },
    },
  };
</script>

<style scoped>
  .ppx {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .ppx__lead {
    margin: 0;
  }

  /* AspModal's panel is --surface-card, a dark setter in both themes:
     --feedback-error measures under 4.5:1 on it (system_3 #10438 design ack
     c64136, §3 P20). */
  .ppx__error {
    margin: 0;
    color: var(--feedback-error-text-on-dark);
  }

  .ppx-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .ppx-footer__note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: right;
  }

  @media (max-width: 640px) {
    .ppx-footer__note {
      text-align: left;
    }
  }
</style>
