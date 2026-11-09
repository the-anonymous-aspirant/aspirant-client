<template>
  <!-- Outgoing rows a bank or PayPal file carried, offered as work expenses
       (system_3 #10432). The server stored none of them; the parent posts back
       the ones ticked here, each with the category picked beside it. -->
  <div class="exp" data-test="expense-section">
    <h4 class="exp__title">Expenses</h4>
    <p class="exp__lead">Money that went out. Tick only what was for your work, and pick its category.</p>
    <ul class="exp-rows">
      <!-- The payment card grammar of the import review (§3.114): checkbox
           first, payee top-left, amount top-right, date and note muted
           beneath, the category picker under that. -->
      <li
        v-for="item in items"
        :key="item.key"
        class="exp-row"
        data-test="expense-row"
        :data-txn="item.row.transaction_id"
      >
        <!-- An expense already in the book can never be added again: no
             checkbox at all, as for an already-imported payment (§3.22). -->
        <span v-if="item.row.already_imported" class="exp-row__nocheck" aria-hidden="true" />
        <AspCheckbox
          v-else
          :model-value="item.checked"
          :disabled="disabled"
          :aria-label="`Add expense of ${formatMoney(item.row.amount_cents, item.row.currency)} to ${payee(item.row)} on ${formatDay(item.row.paid_on)}`"
          data-test="expense-row-check"
          @update:model-value="$emit('update:checked', item.key, $event)"
        />
        <div class="exp-row__body">
          <div class="exp-row__top">
            <!-- Payee names and notes come from outside: text interpolation
                 only, never v-html. -->
            <span class="exp-row__payee">{{ payee(item.row) }}</span>
            <strong class="nowrap exp-row__amount">{{ formatMoney(item.row.amount_cents, item.row.currency) }}</strong>
          </div>
          <span class="exp-row__muted" data-test="expense-row-meta"><span class="nowrap">{{ formatDay(item.row.paid_on) }}</span><template v-if="item.row.note"> · <span class="exp-row__note">{{ item.row.note }}</span></template></span>
          <span v-if="item.row.already_imported" class="exp-row__muted" data-test="expense-row-imported">Already in your expenses</span>
          <template v-else>
            <span v-if="item.row.possible_duplicate_of" class="exp-row__muted" data-test="expense-row-duplicate">
              Same date and amount as an expense already in your book. Tick it only if it is a different expense.
            </span>
            <AspSelect
              :model-value="item.category"
              :options="categoryOptions"
              :disabled="disabled"
              :aria-label="`Category for the expense to ${payee(item.row)} on ${formatDay(item.row.paid_on)}`"
              class="exp-row__category"
              data-test="expense-row-category"
              @update:model-value="$emit('update:category', item.key, $event)"
            />
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
  import { AspCheckbox, AspSelect } from '@aspirant/design-system';
  import { formatDay, formatMoney } from './api.js';

  export default {
    name: 'ExpenseCandidatesSection',
    components: { AspCheckbox, AspSelect },
    props: {
      // [{ key, row, checked, category }]: row is the server's candidate
      // (transaction_id, paid_on, currency, amount_cents, payee_name, note,
      // already_imported, possible_duplicate_of).
      items: { type: Array, default: () => [] },
      // The owner's expense category names, in her book's order.
      categories: { type: Array, default: () => [] },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:checked', 'update:category'],
    computed: {
      categoryOptions() {
        return this.categories.map((name) => ({ value: name, label: name }));
      },
    },
    methods: {
      formatDay,
      formatMoney,
      // A PayPal row may name no payee (server PR 178).
      payee(row) {
        return row.payee_name || 'Unnamed payee';
      },
    },
  };
</script>

<style scoped>
  .exp {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
  }

  .exp__title {
    margin: 0;
    font-size: var(--text-sm);
  }

  .exp__lead {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .exp-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .exp-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  .exp-row__nocheck {
    flex: none;
    width: 1rem;
  }

  .exp-row__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .exp-row__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .exp-row__payee {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .exp-row__amount {
    font-variant-numeric: tabular-nums;
  }

  .exp-row__muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .exp-row__note {
    white-space: pre-line;
  }

  .exp-row__category {
    max-width: 100%;
  }

  .nowrap {
    white-space: nowrap;
  }
</style>
