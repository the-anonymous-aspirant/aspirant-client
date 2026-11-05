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

    <!-- Only issued rows can be ticked for "Invoice list (single PDF)" below
         (#9960, design ack c61576); this says why the others have no checkbox,
         and shows only when one of them is on screen. -->
    <p v-if="!loadError && hasUnselectable" class="caption" data-test="merge-left-out">
      Drafts and cancelled invoices are left out: a draft has no PDF yet, and a cancelled invoice's PDF does not show it was cancelled.
    </p>

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
         invoice is a card button that opens it, like a row click. An issued
         card has its checkbox beside the button, not inside it (a checkbox in
         a button is invalid and the two clicks would collide); other cards keep
         a blank gutter of the same width, so the numbers line up. -->
    <template v-else-if="narrow">
    <div v-if="shownIssued.length" class="select-all" data-test="select-all-shown">
      <AspCheckbox
        :model-value="allShownSelected"
        :indeterminate="someShownSelected"
        :label="`Select all ${shownIssued.length} issued shown`"
        :disabled="mergeDownloading"
        @update:model-value="selectAllShown"
      />
    </div>
    <ul class="invoice-cards" aria-label="Invoices">
      <li v-for="row in rows" :key="row.id" class="invoice-cards__item">
        <span class="invoice-card__select">
          <AspCheckbox
            v-if="row.status === 'issued'"
            :model-value="selected.includes(row.id)"
            :aria-label="`Select invoice ${row.invoice_number}`"
            :disabled="mergeDownloading"
            data-test="invoice-select"
            @update:model-value="toggle(row.id, $event)"
          />
        </span>
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
    </template>
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
      <template #header-select>
        <AspCheckbox
          v-if="shownIssued.length"
          :model-value="allShownSelected"
          :indeterminate="someShownSelected"
          :disabled="mergeDownloading"
          aria-label="Select all shown issued invoices"
          data-test="select-all-shown"
          @update:model-value="selectAllShown"
        />
      </template>
      <!-- The checkbox swallows its own click and key, so a tick never opens
           the invoice; the rest of the row still does. -->
      <template #cell-select="{ row }">
        <span v-if="row.status === 'issued'" class="select-cell" @click.stop @keydown.stop>
          <AspCheckbox
            :model-value="selected.includes(row.id)"
            :aria-label="`Select invoice ${row.invoice_number}`"
            :disabled="mergeDownloading"
            data-test="invoice-select"
            @update:model-value="toggle(row.id, $event)"
          />
        </span>
      </template>
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
        <AspButton variant="secondary" data-test="export-all-csv" @click="startExport('csv')">Invoice list (CSV)</AspButton>
        <AspButton variant="secondary" data-test="export-zip" @click="startExport('zip')">Issued invoices (PDF, ZIP)</AspButton>
        <!-- The ticked issued invoices as one PDF, in number order (#9960,
             design ack c61576: the operator's own name for it, c61550 on
             #9656). Button and caption are one unit, as #9948's are. -->
        <div class="export">
          <AspButton
            variant="secondary"
            :disabled="selected.length === 0"
            :loading="mergeDownloading"
            aria-describedby="export-merged-scope"
            data-test="download-merged"
            @click="startMerge"
          >
            Invoice list (single PDF)
          </AspButton>
          <p id="export-merged-scope" class="export__scope muted" data-test="export-merged-scope">{{ mergeScope }}</p>
        </div>
      </div>
      <p v-if="mergeError" class="error" role="alert" data-test="merge-error">{{ mergeError }}</p>
    </section>

    <ValidationScreen
      v-model:open="exportOpen"
      :url="exportTarget.url"
      :filename="exportTarget.filename"
      @downloading="onDownloading"
      @download-failed="onDownloadFailed"
    />
  </section>
</template>

<script>
  import { AspBadge, AspButton, AspCheckbox, AspDataTable, AspEmptyState, AspInput, AspSelect } from '@aspirant/design-system';
  import ValidationScreen from './ValidationScreen.vue';
  import InvoicesChart from './InvoicesChart.vue';
  import {
    STATUS_LABELS,
    allInvoicesCsvUrl,
    invoicesZipUrl,
    invoicesMergedPdfUrl,
    errorOf,
    formatDay,
    formatMoney,
    listInvoices,
  } from './api.js';

  // Every export goes through the validation screen first (spec §5).
  const EXPORTS = {
    csv: { url: allInvoicesCsvUrl(), filename: 'Rechnungen.csv' },
    zip: { url: invoicesZipUrl(), filename: 'Rechnungen.zip' },
  };

  // The review list (spec §4.7): every invoice with number, status, client,
  // service date, issue date and total; filtered by status and issue date and
  // searched by client on the server.
  export default {
    name: 'InvoicesPanel',
    components: { AspBadge, AspButton, AspCheckbox, AspDataTable, AspEmptyState, AspInput, AspSelect, InvoicesChart, ValidationScreen },
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
        // Ids of ticked issued rows; only rows on screen (see the rows watch).
        selected: [],
        mergeDownloading: false,
        mergeError: '',
        statusOptions: [
          { value: '', label: 'All statuses' },
          ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        ],
        columns: [
          { key: 'select', label: '', sortable: false, width: '2.5rem' },
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
      // Only an issued invoice has a stored PDF the merge accepts: a draft has
      // none yet, and a cancelled one's PDF carries no cancellation mark.
      shownIssued() {
        return this.rows.filter((r) => r.status === 'issued');
      },
      hasUnselectable() {
        return this.rows.some((r) => r.status !== 'issued');
      },
      allShownSelected() {
        return this.shownIssued.length > 0 && this.shownIssued.every((r) => this.selected.includes(r.id));
      },
      someShownSelected() {
        return !this.allShownSelected && this.shownIssued.some((r) => this.selected.includes(r.id));
      },
      // What the file will hold, where she clicks (§3.114); the ticks are up
      // in the list, so the count is restated here.
      mergeScope() {
        const n = this.selected.length;
        if (n === 0) return 'Tick issued invoices in the list to get them in one PDF.';
        if (n === 1) return '1 ticked invoice in one PDF.';
        return `${n} ticked invoices in one PDF, in number order.`;
      },
    },
    watch: {
      // The selection never holds a row the owner cannot see (§3.25): a
      // filter change or a reload unselects rows that left the view, so the
      // count on the button only ever counts rows on screen.
      shownIssued(rows) {
        const visible = new Set(rows.map((r) => r.id));
        const kept = this.selected.filter((id) => visible.has(id));
        if (kept.length !== this.selected.length) this.selected = kept;
      },
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
      // Through the validation screen like the other exports: the merge route
      // runs the same §5 check. The selection is kept afterwards, since a
      // download changes no row.
      startMerge() {
        if (this.selected.length === 0 || this.mergeDownloading) return;
        this.mergeError = '';
        const ids = [...this.selected].sort((a, b) => a - b);
        this.exportTarget = { url: invoicesMergedPdfUrl(ids), filename: 'Rechnungen.pdf', merge: true };
        this.exportOpen = true;
      },
      onDownloading(on) {
        if (this.exportTarget.merge) this.mergeDownloading = on;
      },
      onDownloadFailed(message) {
        if (this.exportTarget.merge) this.mergeError = message;
      },
      toggle(id, on) {
        if (this.mergeDownloading) return;
        this.selected = on ? [...new Set([...this.selected, id])] : this.selected.filter((x) => x !== id);
      },
      selectAllShown(on) {
        if (this.mergeDownloading) return;
        const ids = this.shownIssued.map((r) => r.id);
        this.selected = on ? [...new Set([...this.selected, ...ids])] : this.selected.filter((id) => !ids.includes(id));
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

  .caption {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .select-cell {
    display: inline-flex;
    align-items: center;
  }

  .select-all {
    margin: 0;
  }

  .invoice-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .invoice-cards__item {
    display: flex;
    align-items: stretch;
    gap: var(--space-2xs);
  }

  /* A 44px gutter on every card: the checkbox's hit area on an issued card,
     blank on a draft or cancelled one, so every number starts on one edge. */
  .invoice-card__select {
    flex: 0 0 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .invoice-card__select :deep(.checkbox) {
    width: 44px;
    min-height: 44px;
    justify-content: center;
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

  .invoice-cards__item .invoice-card {
    flex: 1 1 auto;
    min-width: 0;
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

  /* A button and its caption as one column (the same rules as #9948's). */
  .export {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
    max-width: 22rem;
  }

  .export__scope {
    margin: 0;
    font-size: var(--text-sm);
  }

  .export-group > .error {
    margin-top: var(--space-sm);
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

    .export {
      align-items: stretch;
      max-width: none;
    }

    .exports :deep(button) {
      width: 100%;
    }
  }
</style>
