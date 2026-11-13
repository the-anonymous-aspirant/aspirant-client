<template>
  <section class="removed" data-test="removed-view" aria-labelledby="removed-heading">
    <div class="removed__head">
      <h3 id="removed-heading" class="removed__title">{{ title }}</h3>
      <AspButton variant="ghost" data-test="removed-back" @click="$emit('back')">Back to transactions</AspButton>
    </div>
    <p class="removed__lead">Removed rows count nowhere: not on this list, the Book or its report. Restore brings a row back as it was.</p>

    <div class="removed__actions">
      <AspCheckbox
        :model-value="allSelected"
        :indeterminate="someSelected"
        :label="`Select all ${rows.length} shown`"
        data-test="removed-select-all"
        @update:model-value="selectAll"
      />
      <div class="removed__buttons">
        <AspButton variant="secondary" :disabled="!selected.length || !!busy" :loading="busy === 'restore'" data-test="removed-restore" @click="restore">
          Restore{{ selected.length ? ` ${selected.length}` : '' }}
        </AspButton>
        <!-- Arms first (§3.143 Decision 6). The audit history keeps the row,
             so the copy never promises erasure (security c66065). -->
        <AspButton
          :variant="armed ? 'destructive' : 'ghost'"
          :disabled="!selected.length || (!!busy && busy !== 'purge')"
          :loading="busy === 'purge'"
          data-test="removed-purge"
          @click="purge"
        >
          {{ armed ? `Delete ${selected.length} row${selected.length === 1 ? '' : 's'} for good` : 'Delete for good' }}
        </AspButton>
      </div>
    </div>
    <p v-if="armed" class="removed__hint" data-test="removed-purge-note">Deleted from your book; the change is kept in its history.</p>
    <p v-if="error" class="removed__error" role="alert" data-test="removed-error">{{ error }}</p>

    <ul class="removed__list" aria-label="Removed rows">
      <li
        v-for="row in rows"
        :key="row.key"
        class="removed__row"
        :data-test="row.direction === 'in' ? 'removed-payment-row' : 'removed-expense-row'"
        :data-txn="row.transaction_id"
      >
        <AspCheckbox
          :model-value="selected.includes(row.key)"
          :aria-label="`Select ${row.transaction_id}`"
          data-test="removed-select"
          @update:model-value="toggle(row.key, $event)"
        />
        <div class="removed__body">
          <div class="removed__top">
            <span class="removed__who" data-test="row-who">{{ row.who || row.what || '—' }}</span>
            <strong class="amount" :class="row.direction === 'in' ? 'in-amount' : 'out-amount'" data-test="row-amount">{{ signedAmount(row) }}</strong>
          </div>
          <span class="muted"><span class="nowrap">{{ formatDay(row.paid_on) }}</span> · {{ row.source }} · {{ row.categoryLabel }}</span>
          <span v-if="row.who && row.what" class="muted">{{ row.what }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<script>
  import { AspButton, AspCheckbox } from '@aspirant/design-system';
  import { errorOf, formatDay, formatMoney, rowAction } from './api.js';
  import { transactionRows } from './ledgerRows.js';

  // The removed view of Transactions (§3.143 Decision 6, system_3 #10633): the
  // rows she removed, in the list's own row format, with Restore and an armed
  // Delete for good. The selection is keyed by row.key ("p<id>" / "e<id>"),
  // since payment and expense ids share one number space (security, c66333).
  export default {
    name: 'RemovedRows',
    components: { AspButton, AspCheckbox },
    props: {
      payments: { type: Array, default: () => [] },
      expenses: { type: Array, default: () => [] },
      // 'all', or 'out' when opened from an expense clause on an import line.
      direction: { type: String, default: 'all' },
    },
    emits: ['back', 'changed'],
    data() {
      return { selected: [], armed: false, busy: '', error: '' };
    },
    computed: {
      rows() {
        const rows = transactionRows(this.payments, this.expenses);
        return this.direction === 'all' ? rows : rows.filter((r) => r.direction === this.direction);
      },
      title() {
        return { in: 'Removed payments', out: 'Removed expenses' }[this.direction] || 'Removed rows';
      },
      allSelected() {
        return this.rows.length > 0 && this.rows.every((r) => this.selected.includes(r.key));
      },
      someSelected() {
        return !this.allSelected && this.rows.some((r) => this.selected.includes(r.key));
      },
    },
    watch: {
      // A row that left the view (restored, deleted, refetched) leaves the selection.
      rows(rows) {
        const keys = new Set(rows.map((r) => r.key));
        this.selected = this.selected.filter((k) => keys.has(k));
        if (!this.selected.length) this.armed = false;
      },
      selected() {
        this.armed = false;
      },
    },
    methods: {
      formatDay,
      signedAmount(row) {
        const amount = formatMoney(row.amount_cents, row.currency);
        return row.direction === 'out' ? `-${amount}` : amount;
      },
      toggle(key, on) {
        this.selected = on ? [...new Set([...this.selected, key])] : this.selected.filter((k) => k !== key);
      },
      selectAll(on) {
        this.selected = on ? this.rows.map((r) => r.key) : [];
      },
      // One call per direction, each all or nothing on the server.
      async act(action) {
        const pick = (dir) => this.rows.filter((r) => r.direction === dir && this.selected.includes(r.key)).map((r) => r.id);
        const calls = [['payments', pick('in')], ['expenses', pick('out')]].filter(([, ids]) => ids.length);
        this.busy = action;
        this.error = '';
        try {
          for (const [kind, ids] of calls) await rowAction(kind, action, ids);
          this.selected = [];
        } catch (err) {
          this.error = errorOf(err).message;
        } finally {
          this.busy = '';
          this.armed = false;
          this.$emit('changed');
        }
      },
      restore() {
        return this.act('restore');
      },
      purge() {
        if (!this.armed) {
          this.armed = true;
          return;
        }
        return this.act('purge');
      },
    },
  };
</script>

<style scoped>
  .removed {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .removed__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .removed__title {
    margin: 0;
    font-size: var(--text-lg, 1.125rem);
  }

  .removed__lead,
  .removed__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .removed__error {
    margin: 0;
    color: var(--feedback-error);
  }

  .removed__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .removed__buttons {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .removed__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .removed__row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
  }

  .removed__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .removed__top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .removed__who {
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .nowrap {
    white-space: nowrap;
  }

  .amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* §3.140 Decision 2: the Book's ink, as on the main list. */
  .in-amount {
    color: var(--text-body);
  }

  .out-amount {
    color: var(--feedback-error-text);
  }

  @media (max-width: 640px) {
    .removed__buttons,
    .removed__buttons :deep(button) {
      width: 100%;
    }

    .removed__buttons {
      flex-direction: column;
    }
  }
</style>
