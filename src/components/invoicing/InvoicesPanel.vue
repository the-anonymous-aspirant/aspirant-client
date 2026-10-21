<template>
  <section class="invoices-panel" data-test="invoices-panel">
    <div class="panel-head">
      <h2>Invoices</h2>
      <div class="exports">
        <AspButton variant="secondary" data-test="export-all-csv" @click="startExport('csv')">Download all (CSV)</AspButton>
        <AspButton variant="secondary" data-test="export-workbook" @click="startExport('xlsx')">Excel workbook</AspButton>
        <AspButton variant="secondary" data-test="export-bundle" @click="startExport('bundle')">Jobcenter bundle (ZIP)</AspButton>
      </div>
    </div>

    <InvoicesChart :refresh-key="refreshKey" />

    <div class="filters" role="group" aria-label="Filter invoices">
      <AspSelect v-model="status" :options="statusOptions" aria-label="Status" data-test="filter-status" />
      <label class="date-field">
        <span>Issued from</span>
        <input v-model="issuedFrom" type="date" data-test="filter-from" />
      </label>
      <label class="date-field">
        <span>Issued until</span>
        <input v-model="issuedTo" type="date" data-test="filter-to" />
      </label>
      <AspInput v-model="search" type="search" placeholder="Search client" aria-label="Search by client name" data-test="filter-search" />
    </div>

    <p v-if="loadError" class="error" role="alert" data-test="invoices-error">{{ loadError }}</p>
    <AspEmptyState
      v-else-if="rows.length === 0 && !filtered"
      heading="No invoices yet"
      message="Mark payments as Paid work, select them on the Payments tab and choose Create invoice."
      data-test="invoices-empty"
    />
    <AspEmptyState
      v-else-if="rows.length === 0"
      variant="filtered"
      heading="No invoices match these filters"
      data-test="invoices-filtered-empty"
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
      <template #cell-service="{ row }"><span class="nowrap">{{ serviceLabel(row) }}</span></template>
      <template #cell-issue_date="{ row }"><span class="nowrap">{{ formatDay(row.issue_date) || '—' }}</span></template>
      <template #cell-total_cents="{ row }"><span class="nowrap">{{ formatMoney(row.total_cents, row.currency) }}</span></template>
    </AspDataTable>

    <ValidationScreen v-model:open="exportOpen" :url="exportTarget.url" :filename="exportTarget.filename" />
  </section>
</template>

<script>
  import { AspBadge, AspButton, AspDataTable, AspEmptyState, AspInput, AspSelect } from '@aspirant/design-system';
  import ValidationScreen from './ValidationScreen.vue';
  import InvoicesChart from './InvoicesChart.vue';
  import {
    STATUS_LABELS,
    allInvoicesCsvUrl,
    bundleUrl,
    errorOf,
    formatDay,
    formatMoney,
    listInvoices,
    workbookUrl,
  } from './api.js';

  // Every export goes through the validation screen first (spec §5).
  const EXPORTS = {
    csv: { url: allInvoicesCsvUrl(), filename: 'Rechnungen.csv' },
    xlsx: { url: workbookUrl(), filename: 'Rechnungen.xlsx' },
    bundle: { url: bundleUrl(), filename: 'Jobcenter-Nachweise.zip' },
  };

  // The review list (spec §4.7): every invoice with number, status, client,
  // service date, issue date and total; filtered by status and issue date and
  // searched by client on the server.
  export default {
    name: 'InvoicesPanel',
    components: { AspBadge, AspButton, AspDataTable, AspEmptyState, AspInput, AspSelect, InvoicesChart, ValidationScreen },
    props: {
      // Bumped by the page after any change, so the list reloads.
      refreshKey: { type: Number, default: 0 },
    },
    emits: ['open'],
    data() {
      return {
        rows: [],
        loadError: '',
        status: '',
        issuedFrom: '',
        issuedTo: '',
        search: '',
        searchTimer: null,
        exportOpen: false,
        exportTarget: EXPORTS.csv,
        statusOptions: [
          { value: '', label: 'All statuses' },
          ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        ],
        columns: [
          { key: 'invoice_number', label: 'Number' },
          { key: 'status', label: 'Status' },
          { key: 'client_name', label: 'Client' },
          { key: 'service', label: 'Service', sortable: false },
          { key: 'issue_date', label: 'Issued' },
          { key: 'total_cents', label: 'Total', align: 'right' },
        ],
      };
    },
    computed: {
      filtered() {
        return !!(this.status || this.issuedFrom || this.issuedTo || this.search.trim());
      },
    },
    watch: {
      status: 'load',
      issuedFrom: 'load',
      issuedTo: 'load',
      refreshKey: 'load',
      search() {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.load(), 250);
      },
    },
    mounted() {
      this.load();
    },
    beforeUnmount() {
      clearTimeout(this.searchTimer);
    },
    methods: {
      formatDay,
      formatMoney,
      async load() {
        const params = {};
        if (this.status) params.status = this.status;
        if (this.issuedFrom) params.issued_from = this.issuedFrom;
        if (this.issuedTo) params.issued_to = this.issuedTo;
        if (this.search.trim()) params.q = this.search.trim();
        try {
          this.rows = await listInvoices(params);
          this.loadError = '';
        } catch (err) {
          this.loadError = errorOf(err).message;
        }
      },
      startExport(kind) {
        this.exportTarget = EXPORTS[kind];
        this.exportOpen = true;
      },
      serviceLabel(row) {
        const from = formatDay(row.service_date_from);
        const to = formatDay(row.service_date_to);
        return to && to !== from ? `${from} – ${to}` : from || '—';
      },
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
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
  }

  .panel-head h2 {
    margin: 0;
  }

  .exports {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-sm);
    align-items: end;
    margin-bottom: var(--space-md);
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: var(--text-sm);
  }

  .date-field input {
    font: inherit;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-subtle);
    background: transparent;
    color: inherit;
    color-scheme: light dark;
  }

  .error {
    color: var(--feedback-error);
  }

  .nowrap {
    white-space: nowrap;
  }
</style>
