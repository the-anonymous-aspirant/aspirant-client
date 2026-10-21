<template>
  <section class="payments-panel" data-test="payments-panel">
    <div class="panel-head">
      <h2>Payments</h2>
      <div class="upload">
        <input
          ref="fileInput"
          class="upload__input"
          type="file"
          accept=".csv,text/csv,text/plain"
          aria-label="PayPal activity CSV"
          data-test="payments-file"
          :disabled="importing"
          @change="onFileChosen"
        />
        <AspButton :loading="importing" data-test="payments-import" @click="$refs.fileInput.click()">
          Import PayPal CSV
        </AspButton>
      </div>
    </div>

    <div v-if="needsDateOrder" class="date-order" role="group" aria-labelledby="date-order-label" data-test="date-order">
      <p id="date-order-label">
        Every date in this file reads both ways (for example 07/08/2026). Which order does the file use?
      </p>
      <AspButton variant="secondary" data-test="date-order-dmy" @click="reimport('dmy')">Day/month (07/08 = 7 August)</AspButton>
      <AspButton variant="secondary" data-test="date-order-mdy" @click="reimport('mdy')">Month/day (07/08 = 8 July)</AspButton>
    </div>

    <p v-if="importError" class="error" role="alert" data-test="import-error">{{ importError }}</p>

    <AspCard v-if="summary" class="summary" padding="sm" data-test="import-summary">
      <p class="summary__line">
        Read {{ summary.rows_read }} rows: <strong>{{ summary.imported }}</strong> imported
        <template v-if="summary.withdrawals"> (including {{ summary.withdrawals }} bank withdrawals)</template>,
        {{ summary.duplicates }} already imported, {{ summary.skipped }} skipped.
      </p>
      <ul v-if="skippedReasons.length" class="summary__reasons">
        <li v-for="r in skippedReasons" :key="r.key">{{ r.count }} × {{ r.label }}</li>
      </ul>
    </AspCard>

    <div class="filter">
      <AspSelect
        v-model="categoryFilter"
        :options="filterOptions"
        aria-label="Show payments of category"
        data-test="category-filter"
      />
    </div>

    <AspEmptyState
      v-if="incoming.length === 0"
      heading="No payments yet"
      message="Import a PayPal activity CSV to list the payments here."
      data-test="payments-empty"
    />
    <AspEmptyState
      v-else-if="shown.length === 0"
      variant="filtered"
      heading="No payments in this category"
      data-test="payments-filtered-empty"
    />
    <ul v-else-if="narrow" class="payment-cards" aria-label="Incoming payments">
      <li
        v-for="row in shown"
        :key="row.id"
        class="payment-card"
        data-test="payment-row"
        :data-txn="row.transaction_id"
      >
        <div class="payment-card__top">
          <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
          <strong class="nowrap">{{ formatMoney(row.gross_cents, row.currency) }}</strong>
        </div>
        <span class="sender">{{ row.sender_name }}</span>
        <span class="muted">{{ row.sender_email }}</span>
        <span v-if="row.note" class="note">{{ row.note }}</span>
        <div class="payment-card__fields">
          <div class="payment-card__field">
            <span class="payment-card__caption" aria-hidden="true">Category</span>
            <AspSelect
              :model-value="row.category"
              :options="categoryOptions"
              :aria-label="`Category for ${row.transaction_id}`"
              :disabled="saving.has(row.id)"
              data-test="payment-category"
              @update:model-value="patch(row, { category: $event })"
            />
          </div>
          <div class="payment-card__field">
            <span class="payment-card__caption" aria-hidden="true">Client</span>
            <AspSelect
              :model-value="row.client_id ?? 0"
              :options="clientOptions"
              :aria-label="`Client for ${row.transaction_id}`"
              :disabled="saving.has(row.id)"
              data-test="payment-client"
              @update:model-value="patch(row, { client_id: $event || null })"
            />
          </div>
          <div class="payment-card__field">
            <span class="payment-card__caption" aria-hidden="true">Bank deposit</span>
            <AspSelect
              :model-value="row.bank_deposit_id ?? 0"
              :options="depositOptions"
              :aria-label="`Bank deposit for ${row.transaction_id}`"
              :disabled="saving.has(row.id) || depositOptions.length < 2"
              data-test="payment-deposit"
              @update:model-value="patch(row, { bank_deposit_id: $event || null })"
            />
          </div>
        </div>
      </li>
    </ul>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="shown"
      row-key="id"
      density="compact"
      caption="Incoming payments"
      :row-attrs="(row) => ({ 'data-test': 'payment-row', 'data-txn': row.transaction_id })"
    >
      <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
      <template #cell-sender="{ row }">
        <span class="sender">{{ row.sender_name }}</span>
        <span class="muted">{{ row.sender_email }}</span>
      </template>
      <template #cell-note="{ row }"><span class="note">{{ row.note }}</span></template>
      <template #cell-gross_cents="{ row }"><span class="nowrap">{{ formatMoney(row.gross_cents, row.currency) }}</span></template>
      <template #cell-category="{ row }">
        <AspSelect
          :model-value="row.category"
          :options="categoryOptions"
          :aria-label="`Category for ${row.transaction_id}`"
          :disabled="saving.has(row.id)"
          data-test="payment-category"
          @update:model-value="patch(row, { category: $event })"
        />
      </template>
      <template #cell-client_id="{ row }">
        <AspSelect
          :model-value="row.client_id ?? 0"
          :options="clientOptions"
          :aria-label="`Client for ${row.transaction_id}`"
          :disabled="saving.has(row.id)"
          data-test="payment-client"
          @update:model-value="patch(row, { client_id: $event || null })"
        />
      </template>
      <template #cell-bank_deposit_id="{ row }">
        <AspSelect
          :model-value="row.bank_deposit_id ?? 0"
          :options="depositOptions"
          :aria-label="`Bank deposit for ${row.transaction_id}`"
          :disabled="saving.has(row.id) || depositOptions.length < 2"
          data-test="payment-deposit"
          @update:model-value="patch(row, { bank_deposit_id: $event || null })"
        />
      </template>
    </AspDataTable>
    <p v-if="rowError" class="error" role="alert" data-test="payment-error">{{ rowError }}</p>

    <div v-if="withdrawals.length" class="deposits" data-test="deposits">
      <h3>Bank deposits (withdrawals to the bank)</h3>
      <AspDataTable :columns="depositColumns" :rows="withdrawals" row-key="id" density="compact" caption="Bank deposits">
        <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
        <template #cell-gross_cents="{ row }"><span class="nowrap">{{ formatMoney(row.gross_cents, row.currency) }}</span></template>
      </AspDataTable>
    </div>
  </section>
</template>

<script>
  import { AspButton, AspCard, AspDataTable, AspEmptyState, AspSelect } from '@aspirant/design-system';
  import {
    CATEGORY_LABELS,
    SKIP_REASON_LABELS,
    errorOf,
    formatDay,
    formatMoney,
    importPayPalCSV,
    patchPayment,
  } from './api.js';

  // PayPal import and categorisation (spec §4.3–4.4). Every payment starts
  // uncategorised; only "Paid work" can later be invoiced, and that rule is
  // the server's. Sender names, emails and notes are written by outside
  // payers, so they are only ever rendered as text interpolation.
  export default {
    name: 'PaymentsPanel',
    components: { AspButton, AspCard, AspDataTable, AspEmptyState, AspSelect },
    props: {
      payments: { type: Array, required: true },
      clients: { type: Array, required: true },
    },
    emits: ['changed'],
    data() {
      return {
        importing: false,
        importError: '',
        summary: null,
        pendingFile: null,
        needsDateOrder: false,
        categoryFilter: 'all',
        saving: new Set(),
        rowError: '',
        narrow: false,
        columns: [
          { key: 'paid_on', label: 'Date' },
          { key: 'sender', label: 'From', sortable: false },
          { key: 'note', label: 'Note', sortable: false },
          { key: 'gross_cents', label: 'Amount', align: 'right' },
          { key: 'category', label: 'Category', sortable: false, width: '10rem' },
          { key: 'client_id', label: 'Client', sortable: false, width: '10rem' },
          { key: 'bank_deposit_id', label: 'Bank deposit', sortable: false, width: '14rem' },
        ],
        depositColumns: [
          { key: 'paid_on', label: 'Date' },
          { key: 'gross_cents', label: 'Amount', align: 'right' },
          { key: 'transaction_id', label: 'Transaction ID' },
        ],
      };
    },
    computed: {
      incoming() {
        return this.payments.filter((p) => p.kind === 'incoming');
      },
      withdrawals() {
        return this.payments.filter((p) => p.kind === 'withdrawal');
      },
      shown() {
        if (this.categoryFilter === 'all') return this.incoming;
        return this.incoming.filter((p) => p.category === this.categoryFilter);
      },
      categoryOptions() {
        return Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
      },
      filterOptions() {
        return [{ value: 'all', label: 'All categories' }, ...this.categoryOptions];
      },
      clientOptions() {
        return [{ value: 0, label: 'No client' }, ...this.clients.map((c) => ({ value: c.id, label: c.name }))];
      },
      depositOptions() {
        return [
          { value: 0, label: 'Not grouped' },
          ...this.withdrawals.map((w) => ({ value: w.id, label: `${formatDay(w.paid_on)} ${formatMoney(w.gross_cents, w.currency)}` })),
        ];
      },
      skippedReasons() {
        const reasons = (this.summary && this.summary.skipped_reasons) || {};
        return Object.entries(reasons).map(([key, count]) => ({ key, count, label: SKIP_REASON_LABELS[key] || key }));
      },
    },
    mounted() {
      // Seven columns do not fit a phone: below 640px the same rows render
      // as stacked cards, so the selects stay on screen without a sideways
      // scroll.
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
    methods: {
      formatDay,
      formatMoney,
      onFileChosen(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        this.pendingFile = file;
        this.runImport('');
      },
      reimport(order) {
        this.runImport(order);
      },
      async runImport(dateOrder) {
        this.importing = true;
        this.importError = '';
        this.summary = null;
        try {
          this.summary = await importPayPalCSV(this.pendingFile, dateOrder);
          this.needsDateOrder = false;
          this.$emit('changed');
        } catch (err) {
          const failure = errorOf(err);
          if (failure.code === 'date_order_ambiguous') {
            this.needsDateOrder = true;
          } else {
            this.importError = failure.message;
          }
        } finally {
          this.importing = false;
          if (this.$refs.fileInput) this.$refs.fileInput.value = '';
        }
      },
      async patch(row, change) {
        this.rowError = '';
        this.saving = new Set([...this.saving, row.id]);
        try {
          await patchPayment(row.id, change);
          this.$emit('changed');
        } catch (err) {
          // The server refused (for example a payment already on an issued
          // invoice); the parent's reload puts the select back to the truth.
          this.rowError = errorOf(err).message;
          this.$emit('changed');
        } finally {
          const next = new Set(this.saving);
          next.delete(row.id);
          this.saving = next;
        }
      },
    },
  };
</script>

<style scoped>
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .panel-head h2 {
    margin: 0;
  }

  .upload__input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .nowrap {
    white-space: nowrap;
  }

  .date-order {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .date-order p {
    flex-basis: 100%;
    margin: 0;
  }

  /* AspCard is dark in both themes; set the ink here (§3.18). */
  .summary {
    margin-bottom: var(--space-md);
    color: var(--text-on-dark);
  }

  .summary__line {
    margin: 0;
  }

  .summary__reasons {
    margin: var(--space-xs) 0 0;
    padding-left: var(--space-lg);
  }

  .filter {
    max-width: 260px;
    margin-bottom: var(--space-sm);
  }

  .sender {
    display: block;
  }

  .muted {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .note {
    white-space: pre-line;
  }

  .error {
    color: var(--feedback-error);
  }

  .deposits {
    margin-top: var(--space-lg);
  }

  .payment-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .payment-card {
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .payment-card__top {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .payment-card__field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .payment-card__caption {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .payment-card__fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-xs);
  }
</style>
