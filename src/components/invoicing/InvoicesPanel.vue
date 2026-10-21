<template>
  <section class="invoices-panel" data-test="invoices-panel">
    <div class="panel-head">
      <h2>Invoices</h2>
      <p class="muted">Start an invoice from paid-work payments on the Payments tab.</p>
    </div>

    <AspEmptyState
      v-if="invoices.length === 0"
      heading="No invoices yet"
      message="Mark payments as Paid work, select them on the Payments tab and choose Create invoice."
      data-test="invoices-empty"
    />
    <AspDataTable
      v-else
      :columns="columns"
      :rows="rows"
      row-key="id"
      density="compact"
      caption="Invoices"
      interactive
      :row-attrs="(row) => ({ 'data-test': 'invoice-row', 'data-status': row.status })"
      @row-click="(row) => $emit('open', row.id)"
    >
      <template #cell-invoice_number="{ row }">
        <span class="nowrap">{{ row.invoice_number || 'Draft' }}</span>
      </template>
      <template #cell-status="{ row }">
        <AspBadge :status="statusTone(row.status)">{{ statusLabel(row.status) }}</AspBadge>
      </template>
      <template #cell-issue_date="{ row }"><span class="nowrap">{{ formatDay(row.issue_date) || '—' }}</span></template>
      <template #cell-total_cents="{ row }"><span class="nowrap">{{ formatMoney(row.total_cents, row.currency) }}</span></template>
    </AspDataTable>
  </section>
</template>

<script>
  import { AspBadge, AspDataTable, AspEmptyState } from '@aspirant/design-system';
  import { STATUS_LABELS, formatDay, formatMoney } from './api.js';

  // The invoices so far (spec §4.7). D1 lists them so a draft can be reopened;
  // filters, search and the detail view are D2 (#8376).
  export default {
    name: 'InvoicesPanel',
    components: { AspBadge, AspDataTable, AspEmptyState },
    props: {
      invoices: { type: Array, required: true },
    },
    emits: ['open'],
    data() {
      return {
        columns: [
          { key: 'invoice_number', label: 'Number' },
          { key: 'status', label: 'Status' },
          { key: 'client_name', label: 'Client' },
          { key: 'issue_date', label: 'Issued' },
          { key: 'total_cents', label: 'Total', align: 'right' },
        ],
      };
    },
    computed: {
      rows() {
        return this.invoices;
      },
    },
    methods: {
      formatDay,
      formatMoney,
      statusLabel(s) {
        return STATUS_LABELS[s] || s;
      },
      statusTone(s) {
        return { draft: 'neutral', issued: 'positive', cancelled: 'negative' }[s] || 'neutral';
      },
    },
  };
</script>

<style scoped>
  .panel-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
  }

  .panel-head h2,
  .panel-head p {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
  }

  .nowrap {
    white-space: nowrap;
  }
</style>
