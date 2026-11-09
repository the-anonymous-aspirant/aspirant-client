<template>
  <section class="book-panel" data-test="book-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Book</h2>
      <AspButton variant="secondary" class="block-on-phone" data-test="expense-new" @click="expenseOpen = true">
        Enter expense by hand
      </AspButton>
    </div>

    <p v-if="rowError" class="error" role="alert" data-test="book-error">{{ rowError }}</p>

    <AspEmptyState
      v-if="rows.length === 0"
      heading="Nothing in the book yet"
      message="Payments and hand-entered expenses will appear here together, grouped by month."
      data-test="book-empty"
    />

    <template v-else>
      <section v-for="month in months" :key="month.key" class="month" data-test="book-month">
        <header class="month__head" data-test="month-head">
          <h3 class="month__label">{{ month.label }}</h3>
          <p class="month__totals">
            <span class="in-amount">In {{ formatMoney(month.inCents) }}</span>
            <span class="out-amount">Out {{ formatMoney(month.outCents) }}</span>
            <span class="result" :class="{ negative: month.resultCents < 0 }">Result {{ formatSignedMoney(month.resultCents) }}</span>
          </p>
        </header>

        <template v-if="narrow">
          <ul class="book-cards" aria-label="Book entries">
            <li v-for="row in month.rows" :key="row.key" class="book-card" data-test="book-row">
              <div class="book-card__top">
                <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
                <strong class="nowrap amount" :class="row.type === 'in' ? 'in-amount' : 'out-amount'">
                  {{ row.type === 'in' ? formatMoney(row.amount_cents) : formatSignedMoney(-row.amount_cents) }}
                </strong>
              </div>
              <span class="description">{{ row.description }}</span>
              <span class="muted">{{ row.categoryLabel }}</span>
              <AspButton
                v-if="row.type === 'out'"
                :variant="confirmingDelete === row.id ? 'destructive' : 'ghost'"
                size="sm"
                class="manual-delete"
                :loading="deleting === row.id"
                data-test="book-expense-delete"
                @click="removeExpense(row)"
              >
                {{ confirmingDelete === row.id ? 'Delete this expense' : 'Delete' }}
              </AspButton>
            </li>
          </ul>
        </template>
        <AspDataTable
          v-else
          :columns="columns"
          :rows="month.rows"
          row-key="key"
          density="compact"
          :caption="`Book entries for ${month.label}`"
          :row-attrs="() => ({ 'data-test': 'book-row' })"
        >
          <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
          <template #cell-description="{ row }"><span class="description">{{ row.description }}</span></template>
          <template #cell-category="{ row }"><span class="muted">{{ row.categoryLabel }}</span></template>
          <template #cell-in="{ row }">
            <span v-if="row.type === 'in'" class="nowrap in-amount">{{ formatMoney(row.amount_cents) }}</span>
          </template>
          <template #cell-out="{ row }">
            <span v-if="row.type === 'out'" class="nowrap out-amount">{{ formatSignedMoney(-row.amount_cents) }}</span>
            <AspButton
              v-if="row.type === 'out'"
              :variant="confirmingDelete === row.id ? 'destructive' : 'ghost'"
              size="sm"
              class="manual-delete"
              :loading="deleting === row.id"
              data-test="book-expense-delete"
              @click="removeExpense(row)"
            >
              {{ confirmingDelete === row.id ? 'Delete this expense' : 'Delete' }}
            </AspButton>
          </template>
        </AspDataTable>
      </section>
    </template>

    <ManualExpenseDialog
      v-model:open="expenseOpen"
      :categories="categories"
      @changed="onExpenseChanged"
      @category-added="onCategoryAdded"
    />
  </section>
</template>

<script>
  import { AspButton, AspDataTable, AspEmptyState } from '@aspirant/design-system';
  import ManualExpenseDialog from './ManualExpenseDialog.vue';
  import { CATEGORY_LABELS, deleteExpense, errorOf, formatDay, formatMoney, listExpenseCategories } from './api.js';

  // The income-and-expenses book (system_3 #10414-C): payments and
  // hand-entered expenses merged into one dated list, grouped by month, with
  // a per-month In/Out/Result head line (design_agent ruling, report 886 §2,
  // c63777 on #10415 — no running total). "What it was for" is the note, the
  // same field the operator already reads that way on the Payments tab
  // (#9656 c63755); income in the default ink, expenses in red with a minus
  // sign, so colour is never the only signal (c63777).
  export default {
    name: 'BookPanel',
    components: { AspButton, AspDataTable, AspEmptyState, ManualExpenseDialog },
    props: {
      payments: { type: Array, required: true },
      expenses: { type: Array, required: true },
    },
    emits: ['changed'],
    data() {
      return {
        narrow: false,
        expenseOpen: false,
        categories: [],
        rowError: '',
        confirmingDelete: null,
        deleting: null,
        columns: [
          { key: 'paid_on', label: 'Date paid' },
          { key: 'description', label: 'What it was for', sortable: false },
          { key: 'category', label: 'Category', sortable: false },
          { key: 'in', label: 'In', align: 'right', sortable: false },
          { key: 'out', label: 'Out', align: 'right', sortable: false },
        ],
      };
    },
    computed: {
      rows() {
        const income = this.payments
          .filter((p) => p.kind === 'incoming')
          .map((p) => ({
            key: `p${p.id}`,
            id: p.id,
            type: 'in',
            paid_on: p.paid_on,
            description: p.note || p.sender_name || '—',
            categoryLabel: CATEGORY_LABELS[p.category] || p.category,
            amount_cents: p.gross_cents,
          }));
        const outgoing = this.expenses.map((e) => ({
          key: `e${e.id}`,
          id: e.id,
          type: 'out',
          paid_on: e.paid_on,
          description: e.note || e.reference || '—',
          categoryLabel: e.category,
          amount_cents: e.amount_cents,
        }));
        return [...income, ...outgoing].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : a.key.localeCompare(b.key)));
      },
      months() {
        const groups = new Map();
        for (const row of this.rows) {
          const key = String(row.paid_on).slice(0, 7); // YYYY-MM
          if (!groups.has(key)) groups.set(key, { key, label: monthLabel(key), rows: [], inCents: 0, outCents: 0 });
          const g = groups.get(key);
          g.rows.push(row);
          if (row.type === 'in') g.inCents += row.amount_cents;
          else g.outCents += row.amount_cents;
        }
        return [...groups.values()]
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((g) => ({ ...g, resultCents: g.inCents - g.outCents }));
      },
    },
    mounted() {
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.narrow = this.narrowQuery.matches;
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
      this.fetchCategories();
    },
    beforeUnmount() {
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
    },
    methods: {
      formatDay,
      formatMoney,
      formatSignedMoney(cents) {
        const sign = cents < 0 ? '-' : '';
        return `${sign}${formatMoney(Math.abs(cents))}`;
      },
      async fetchCategories() {
        try {
          this.categories = await listExpenseCategories();
        } catch {
          // The dialog's own AspSelect is simply empty; saving still refuses
          // server-side if she somehow submits with no category chosen.
        }
      },
      onCategoryAdded(category) {
        this.categories = [...this.categories, category];
      },
      onExpenseChanged() {
        this.$emit('changed');
      },
      async removeExpense(row) {
        if (this.confirmingDelete !== row.id) {
          this.confirmingDelete = row.id;
          return;
        }
        this.rowError = '';
        this.deleting = row.id;
        try {
          await deleteExpense(row.id);
          this.$emit('changed');
        } catch (err) {
          this.rowError = errorOf(err).message;
        } finally {
          this.deleting = null;
          this.confirmingDelete = null;
        }
      },
    },
  };

  // "2026-07" -> "July 2026". Built from Date's own month names rather than a
  // hand-written list, so it follows the browser's locale like every other
  // date on this page.
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
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

  .error {
    color: var(--feedback-error);
    margin: 0 0 var(--space-sm);
  }

  .month {
    margin-bottom: var(--space-lg);
  }

  .month__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    padding-bottom: var(--space-2xs);
    border-bottom: 1px solid var(--border-subtle, currentColor);
  }

  .month__label {
    margin: 0;
  }

  .month__totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  /* Income in the default ink (black is the operator's own choice, "in the
     black" — no override needed, it is simply the page's own text colour);
     expenses in the design system's error red, never the only signal since
     the amount also carries a minus sign (design_agent c63777/c63825). */
  .in-amount {
    color: var(--text-body);
  }

  .out-amount {
    color: var(--feedback-error-text);
  }

  .result.negative {
    color: var(--feedback-error-text);
  }

  .description {
    display: block;
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--text-muted);
  }

  .nowrap {
    white-space: nowrap;
  }

  .amount {
    font-variant-numeric: tabular-nums;
  }

  .manual-delete {
    margin-left: var(--space-xs);
  }

  .book-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .book-card {
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .book-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  @media (max-width: 640px) {
    .panel-head {
      justify-content: stretch;
    }

    .block-on-phone {
      width: 100%;
    }
  }
</style>
