<template>
  <section class="invoices-panel" data-test="invoices-panel">
    <h2 class="visually-hidden">Invoices</h2>

    <!-- Every control carries a visible caption so the four line up; the
         aria-labels stay the accessible names. -->
    <div class="filters" role="group" aria-label="Filter invoices">
      <div class="filter-field filter-field--search">
        <span class="filter-field__caption" aria-hidden="true">Client</span>
        <AspInput v-model="search" type="search" placeholder="Search client" aria-label="Search by client name" data-test="filter-search" />
      </div>
      <div class="filter-field filter-field--status full-select">
        <span class="filter-field__caption" aria-hidden="true">Status</span>
        <AspSelect v-model="status" :options="statusOptions" aria-label="Status" data-test="filter-status" />
      </div>
      <label class="filter-field">
        <span class="filter-field__caption">Issued from</span>
        <input v-model="issuedFrom" type="date" data-test="filter-from" />
      </label>
      <label class="filter-field">
        <span class="filter-field__caption">Issued until</span>
        <input v-model="issuedTo" type="date" data-test="filter-to" />
      </label>
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
    <!-- Six columns do not fit a phone (§3.114 decision 6): below 640px each
         invoice is one whole-card button that opens it, like a row click. -->
    <ul v-else-if="narrow" class="invoice-cards" aria-label="Invoices">
      <li v-for="row in rows" :key="row.id">
        <button
          type="button"
          class="invoice-card"
          data-test="invoice-row"
          :data-status="row.status"
          @click="$emit('open', row.id)"
        >
          <span class="invoice-card__row">
            <strong class="nowrap">{{ row.invoice_number || 'Draft' }}</strong>
            <AspBadge :status="statusTone(row.status)">{{ statusLabel(row.status) }}</AspBadge>
          </span>
          <span class="invoice-card__client">{{ row.client_name || '—' }}</span>
          <span class="invoice-card__row">
            <span class="muted nowrap">{{ serviceLabel(row) }}</span>
            <span class="amount nowrap">{{ formatMoney(row.total_cents, row.currency) }}</span>
          </span>
        </button>
      </li>
    </ul>
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

    <InvoicesChart :refresh-key="refreshKey" />

    <!-- Occasional actions, so they follow the list instead of pushing it
         off the first screen. -->
    <section class="export-group" aria-labelledby="export-heading">
      <h3 id="export-heading">Export</h3>
      <div class="exports">
        <AspButton variant="secondary" data-test="export-all-csv" @click="startExport('csv')">Download all (CSV)</AspButton>
        <AspButton variant="secondary" data-test="export-workbook" @click="startExport('xlsx')">Excel workbook</AspButton>
        <AspButton variant="secondary" data-test="export-bundle" @click="startExport('bundle')">Jobcenter bundle (ZIP)</AspButton>
      </div>
    </section>

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
        narrow: false,
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
      // The same 640px switch as PaymentsPanel: cards below it, the table above.
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.narrow = this.narrowQuery.matches;
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
    },
    beforeUnmount() {
      clearTimeout(this.searchTimer);
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
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
  .invoices-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Wide: one captioned row, search widest (#8399 spec §3.2). */
  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: var(--space-sm);
    align-items: end;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .filter-field__caption {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .filter-field input[type='date'] {
    font: inherit;
    min-height: 34px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-control, var(--border-subtle));
    background: transparent;
    color: inherit;
    color-scheme: light dark;
    min-width: 0;
  }

  .filter-field--search :deep(input) {
    min-height: 34px;
  }

  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .full-select :deep(.select__trigger) {
    min-width: 0;
  }

  .invoice-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .invoice-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    width: 100%;
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
  }

  .invoice-card:hover {
    border-color: var(--brand-primary);
  }

  .invoice-card__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .invoice-card__row strong {
    font-weight: var(--font-weight-bold);
  }

  .invoice-card__client {
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--text-muted);
  }

  .amount {
    font-variant-numeric: tabular-nums;
  }

  .export-group h3 {
    margin: 0 0 var(--space-sm);
  }

  .exports {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .error {
    color: var(--feedback-error);
    margin: 0;
  }

  .nowrap {
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .filters {
      grid-template-columns: 1fr 1fr;
    }

    .filter-field--search,
    .filter-field--status {
      grid-column: 1 / -1;
    }

    .exports {
      flex-direction: column;
    }

    .exports :deep(button) {
      width: 100%;
    }
  }
</style>
