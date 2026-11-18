<template>
  <section class="invoices-panel" data-test="invoices-panel">
    <h2 class="visually-hidden">Invoices</h2>

    <!-- What the last generation or review did, above the toolbar (§3.159
         Decision 1: ways in, status, toolbar). -->
    <p v-if="generateError" class="error" role="alert" data-test="generate-error">{{ generateError }}</p>
    <p v-else-if="reviewSummary" class="status-line" role="status" data-test="review-summary">{{ reviewSummary }}</p>

    <!-- §3.159 Decision 5: the period comes first in the filters, and what it
         governs, "Generate invoices for {month}", sits on the toolbar's right
         (system_3 #11505, operator c70806 on #10985). -->
    <!-- Two rows, in keyboard order. First the month and what it governs:
         the picker on the left, Generate on the right (stacked on a phone, so
         Generate stays on the first screen). Then the other filters, in the
         row they had before, so its wrapping rule (#9968) is untouched
         (design ack c70970). -->
    <div class="toolbar">
    <div class="period">
    <!-- "Work done in", not "Month": the two date fields below filter by
         issue date, and this one does not. -->
    <div class="filter-field filter-field--month full-select">
      <span class="filter-field__caption" aria-hidden="true">Work done in</span>
      <AspSelect v-model="month" :options="monthOptions" aria-label="Work done in" data-test="filter-month" />
    </div>
    <!-- The tab's one primary, always in this place (§3.159 Decision 1), so
         ze learns where it lives. Its line says what the press will do before
         the press, and when it cannot act, why. -->
    <div class="generate">
      <AspButton
        :disabled="!month || generateCount === 0"
        :loading="generating"
        aria-describedby="generate-scope"
        data-test="generate-invoices"
        @click="$emit('generate', month)"
      >
        {{ generateLabel }}
      </AspButton>
      <p id="generate-scope" class="generate__scope muted" data-test="generate-scope">{{ generateScope }}</p>
    </div>
    </div>
    <!-- Every control carries a visible caption so they line up; the
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
      <!-- The two dates wrap as one unit, so a date is never alone on a row
           (design_agent on #9968, §3.53 applied to a toolbar). -->
      <div class="filter-dates">
        <label class="filter-field">
          <span class="filter-field__caption">Issued from</span>
          <input v-model="issuedFrom" type="date" data-test="filter-from" />
        </label>
        <label class="filter-field">
          <span class="filter-field__caption">Issued until</span>
          <input v-model="issuedTo" type="date" data-test="filter-to" />
        </label>
      </div>
    </div>
    </div>

    <p v-if="loadError" class="error" role="alert" data-test="invoices-error">{{ loadError }}</p>
    <AspEmptyState
      v-else-if="monthRows.length === 0 && !filtered"
      heading="No invoices yet"
      message="Mark payments as Paid work, select them on the Payments tab and choose Create invoice."
      data-test="invoices-empty"
    />
    <!-- A month with nothing in it yet is the usual state before the first
         generation, so it names the month, not "these filters". -->
    <AspEmptyState
      v-else-if="monthRows.length === 0 && onlyMonthFilter"
      :heading="`No invoices for ${monthName} yet`"
      :message="generateCount ? 'Generate drafts one for each paid-work payment of the month.' : ''"
      data-test="invoices-month-empty"
    />
    <AspEmptyState
      v-else-if="monthRows.length === 0"
      variant="filtered"
      heading="No invoices match these filters"
      data-test="invoices-filtered-empty"
    />
    <!-- Six columns do not fit a phone (§3.114 decision 6): below 640px each
         invoice is a card button that opens it, like a row click. An issued
         card has its checkbox beside the button, not inside it (a checkbox in
         a button is invalid and the two clicks would collide); other cards keep
         a blank gutter of the same width, so the numbers line up. -->
    <!-- §3.145: the list folds into a Drafts group and one group per issue
         month, newest first. The one "select all" sits above the groups on both
         layouts, and counts issued rows in open groups only (Decision 5). -->
    <template v-else>
    <div v-if="shownIssued.length" class="select-all" data-test="select-all-shown">
      <AspCheckbox
        :model-value="allShownSelected"
        :indeterminate="someShownSelected"
        :label="`Select all ${shownIssued.length} issued shown`"
        :disabled="mergeDownloading"
        @update:model-value="selectAllShown"
      />
    </div>
    <!-- Says what the tick governs, where the ticking happens, rather than a
         statement about the list above it that the first rows contradict
         (UX walk AM4, system_3 #11021): only issued rows can be ticked for
         "Invoice list (single PDF)" below (#9960, design ack c61576). Shows
         only when one of the other kinds is on screen. -->
    <p v-if="!loadError && hasUnselectable" class="caption" data-test="merge-left-out">
      Only issued invoices can be ticked for the PDF: a draft has no PDF yet, and a cancelled invoice's PDF does not show it was cancelled.
    </p>
    <details
      v-for="group in groups"
      :key="group.key"
      class="invoice-group"
      :open="openKeys.has(group.key)"
      data-test="invoice-group"
      :data-group="group.key"
      @toggle="onToggle(group.key, $event)"
    >
    <summary class="fold-summary invoice-group__summary" data-test="invoice-group-summary">{{ summaryOf(group) }}</summary>
    <ul v-if="narrow" class="invoice-cards" :aria-label="`Invoices: ${group.label}`">
      <li v-for="row in group.rows" :key="row.id" class="invoice-cards__item">
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
          :data-invoice-id="row.id"
          @click="$emit('open', row.id)"
        >
          <!-- The card says at rest that it opens (system_3 #11022, UX walk AM5;
               design ack c72063): the tab's own door word, muted, at the end
               of a line the card already has, so no card grows. It is part of
               the card's one tap, not a second door (§3.159 Decision 3); a
               screen reader and a keyboard are #11661's. -->
          <span class="invoice-card__row">
            <strong class="invoice-identity">{{ identityOf(row) }}</strong>
            <span class="invoice-card__end">
              <AspBadge :status="statusTone(row.status)">{{ statusLabel(row.status) }}</AspBadge>
              <span class="muted card-door" aria-hidden="true" data-test="card-door">Open</span>
            </span>
          </span>
          <!-- A draft has no number yet, so its identity above is already its
               client (identityOf): this line would only repeat it. -->
          <span v-if="row.invoice_number" class="invoice-card__client">{{ row.client_name || '—' }}</span>
          <span class="invoice-card__row">
            <span class="invoice-card__dates muted">{{ dateLineOf(row) }}</span>
            <span class="amount nowrap">{{ formatMoney(row.total_cents, row.currency) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="group.rows"
      row-key="id"
      density="compact"
      :caption="`Invoices: ${group.label}`"
      interactive
      :row-attrs="(row) => ({ 'data-test': 'invoice-row', 'data-status': row.status, 'data-invoice-id': row.id })"
      @row-click="(row) => $emit('open', row.id)"
    >
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
        <span class="invoice-identity">{{ identityOf(row) }}</span>
      </template>
      <template #cell-status="{ row }">
        <AspBadge :status="statusTone(row.status)">{{ statusLabel(row.status) }}</AspBadge>
      </template>
      <template #cell-service="{ row }"><span class="nowrap">{{ serviceLabel(row) }}</span></template>
      <template #cell-issue_date="{ row }"><span class="nowrap">{{ formatDay(row.issue_date) || '—' }}</span></template>
      <template #cell-total_cents="{ row }"><span class="nowrap">{{ formatMoney(row.total_cents, row.currency) }}</span></template>
      <!-- The row's door, in the last column on every tab (§3.159 Decision
           3, system_3 #11501). "Open", not "Edit": an issued invoice opens
           read-only. The whole row still opens it too, so the button stops
           its own click and key, as the checkbox does, and the row opens
           once. -->
      <template #cell-actions="{ row }">
        <span class="row-actions" @click.stop @keydown.stop>
          <AspButton variant="secondary" size="sm" :aria-label="`Open ${identityOf(row)}`" data-test="invoice-open" @click="$emit('open', row.id)">Open</AspButton>
        </span>
      </template>
    </AspDataTable>
    </details>
    </template>

    <InvoicesChart :refresh-key="refreshKey" />

    <!-- Occasional actions, so they follow the list instead of pushing it
         off the first screen. -->
    <section class="export-group" aria-labelledby="export-heading">
      <h3 id="export-heading">Export</h3>
      <!-- Each file says what it holds and how many, before the click
           (operator c61373: "I seem to only get one item?"). The counts mirror
           the server's own predicates and ignore the list filters above,
           because the files do too (system_3 #9948). -->
      <div class="exports">
        <div class="export">
          <AspButton variant="secondary" data-test="export-all-csv" aria-describedby="export-csv-scope" :disabled="csvCount === 0" @click="startExport('csv')">Invoice list (CSV)</AspButton>
          <p id="export-csv-scope" class="export__scope muted" data-test="export-csv-scope">{{ csvScope }}</p>
        </div>
        <div class="export">
          <AspButton variant="secondary" data-test="export-zip" aria-describedby="export-zip-scope" :disabled="zipCount === 0" @click="startExport('zip')">Invoice list (PDF)</AspButton>
          <p id="export-zip-scope" class="export__scope muted" data-test="export-zip-scope">{{ zipScope }}</p>
        </div>
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
  import { DRAFTS_GROUP, candidateMonths, groupInvoicesByMonth, invoiceCandidates, monthLabel, workMonth } from './listGroups.js';

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
      // The book's payments, already on the page: they say which months have
      // paid work, and how many of a month's payments still have no invoice.
      payments: { type: Array, default: () => [] },
      // The page runs the generation and the review; these are its state.
      generating: { type: Boolean, default: false },
      generateError: { type: String, default: '' },
      reviewSummary: { type: String, default: '' },
    },
    emits: ['open', 'generate', 'status-seen'],
    data() {
      return {
        rows: [],
        // Every invoice, unfiltered, for the export captions (null until read).
        allRows: null,
        loadError: '',
        // "YYYY-MM", or '' for every month. Set in created().
        month: '',
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
        // Groups ze opened or closed this visit, by key; a group not in here
        // takes the default. Kept through a refetch, never stored (§3.145
        // Decision 3).
        openGroups: {},
        // The same while a filter is active, when every group starts open
        // (§3.17 R2). Dropped whenever the filter changes or clears, so
        // clearing it brings back zir state from before.
        filterOpen: {},
        statusOptions: [
          { value: '', label: 'All statuses' },
          ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        ],
        // A fixed width on every column, the same in every group's table, so
        // the columns line up from month to month (§3.145 Decision 6).
        columns: [
          { key: 'select', label: '', sortable: false, width: '2.5rem' },
          { key: 'invoice_number', label: 'Number', width: '14%' },
          { key: 'status', label: 'Status', width: '13%' },
          { key: 'client_name', label: 'Client', width: '27%' },
          { key: 'service', label: 'Work done', sortable: false, width: '19%' },
          { key: 'issue_date', label: 'Issued', width: '13%' },
          { key: 'total_cents', label: 'Total', align: 'right', width: '14%' },
          // The row's door (§3.159 Decision 3, system_3 #11501).
          { key: 'actions', label: '', sortable: false, align: 'right', width: '5.5rem' },
        ],
      };
    },
    computed: {
      filtered() {
        return !!(this.month || this.status || this.issuedFrom || this.issuedTo || this.search.trim());
      },
      onlyMonthFilter() {
        return !!this.month && !(this.status || this.issuedFrom || this.issuedTo || this.search.trim());
      },
      // A month holds the invoices whose WORK was done in it, not the ones
      // issued in it: an October payment invoiced in November is October's,
      // and its draft has no issue date at all. Filtered here, on the rows
      // the server sent, since the work date is on every row.
      monthRows() {
        if (!this.month) return this.rows;
        return this.rows.filter((r) => workMonth(r) === this.month);
      },
      // "All months", then every month with paid work or an invoice, newest
      // first. The chosen month stays listed even if its last row went.
      monthOptions() {
        const months = new Set(candidateMonths(this.payments));
        for (const r of this.allRows || this.rows) {
          const key = workMonth(r);
          if (key) months.add(key);
        }
        if (this.month) months.add(this.month);
        const sorted = [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
        return [{ value: '', label: 'All months' }, ...sorted.map((key) => ({ value: key, label: monthLabel(key) }))];
      },
      monthName() {
        return this.month ? monthLabel(this.month) : '';
      },
      monthCandidates() {
        return this.month ? invoiceCandidates(this.payments, this.month) : [];
      },
      // What the press will do, counted before it (design ack c70970,
      // change 1): payments it will draft, and the month's drafts already
      // waiting, which it brings back for review. The server decides what is
      // really drafted; these two only feed the button's line.
      toDraft() {
        return this.monthCandidates.filter((p) => !p.invoice).length;
      },
      draftsWaiting() {
        if (!this.month) return 0;
        // The month's drafts, from the invoice list once it is read; until
        // then, the drafts its payments are on (one over two payments counts
        // once).
        if (this.allRows) return this.allRows.filter((r) => r.status === 'draft' && workMonth(r) === this.month).length;
        return new Set(this.monthCandidates.filter((p) => p.invoice && p.invoice.status === 'draft').map((p) => p.invoice.id)).size;
      },
      generateCount() {
        return this.toDraft + this.draftsWaiting;
      },
      generateLabel() {
        if (!this.month) return 'Generate invoices';
        const d = this.draftsWaiting;
        if (this.toDraft === 0 && d > 0) return `Review ${d} draft${d === 1 ? '' : 's'} for ${this.monthName}`;
        return `Generate invoices for ${this.monthName}`;
      },
      generateScope() {
        if (!this.month) return 'Choose a month to generate its invoices.';
        const n = this.toDraft;
        const d = this.draftsWaiting;
        if (n === 0 && d === 0) {
          // A month with no paid work at all is not "every payment invoiced".
          return this.monthCandidates.length
            ? `Every paid-work payment in ${this.monthName} has an invoice.`
            : `No paid-work payments in ${this.monthName}.`;
        }
        const parts = [];
        if (n) parts.push(`${n} payment${n === 1 ? '' : 's'} to draft`);
        if (d) parts.push(`${d} draft${d === 1 ? '' : 's'} waiting`);
        return parts.join(' · ');
      },
      groups() {
        return groupInvoicesByMonth(this.monthRows);
      },
      // The groups that are open now. Filtered: every group, unless ze closed
      // one (§3.17 R2). Otherwise zir own choice, or the default: Drafts, the
      // newest month, and a lone group (§3.145 Decision 3, §3.17 R3).
      openKeys() {
        const newestMonth = (this.groups.find((g) => g.key !== DRAFTS_GROUP) || {}).key;
        const open = new Set();
        for (const g of this.groups) {
          let on;
          if (this.filtered) on = g.key in this.filterOpen ? this.filterOpen[g.key] : true;
          else if (g.key in this.openGroups) on = this.openGroups[g.key];
          else on = this.groups.length === 1 || g.key === DRAFTS_GROUP || g.key === newestMonth;
          if (on) open.add(g.key);
        }
        return open;
      },
      // The rows ze can see: a folded group's rows are not shown (§3.129).
      shownRows() {
        return this.groups.filter((g) => this.openKeys.has(g.key)).flatMap((g) => g.rows);
      },
      // Only an issued invoice has a stored PDF the merge accepts: a draft has
      // none yet, and a cancelled one's PDF carries no cancellation mark.
      shownIssued() {
        return this.shownRows.filter((r) => r.status === 'issued');
      },
      hasUnselectable() {
        return this.shownRows.some((r) => r.status !== 'issued');
      },
      allShownSelected() {
        return this.shownIssued.length > 0 && this.shownIssued.every((r) => this.selected.includes(r.id));
      },
      someShownSelected() {
        return !this.allShownSelected && this.shownIssued.some((r) => this.selected.includes(r.id));
      },
      // What the file will hold, where ze clicks (§3.114); the ticks are up
      // in the list, so the count is restated here.
      mergeScope() {
        const n = this.selected.length;
        if (n === 0) return 'Tick issued invoices in the list to get them in one PDF.';
        if (n === 1) return '1 ticked invoice in one PDF.';
        return `${n} ticked invoices in one PDF, in number order.`;
      },
      // The CSV holds every numbered invoice (server: `number IS NOT NULL`;
      // invoice_number is set with number at issue and never cleared), the
      // ZIP every issued one (server: `status = 'issued'`).
      csvCount() {
        return this.allRows ? this.allRows.filter((r) => r.invoice_number != null && r.invoice_number !== '').length : null;
      },
      zipCount() {
        return this.allRows ? this.allRows.filter((r) => r.status === 'issued').length : null;
      },
      csvScope() {
        const n = this.csvCount;
        if (n === null) return 'Issued and cancelled invoices, one row each. Drafts are left out.';
        // At 0 the button is disabled and this line is the reason (design_agent
        // on #9948, §3.114): issuing an invoice is what enables it.
        if (n === 0) return 'No issued or cancelled invoices yet.';
        return `${n === 1 ? '1 invoice, one row' : `${n} invoices, one row each`}: issued and cancelled. Drafts are left out.`;
      },
      zipScope() {
        const n = this.zipCount;
        if (n === null) return 'Issued invoices only, one PDF each, in a ZIP. Cancelled ones and drafts are left out.';
        if (n === 0) return 'No issued invoices yet.';
        return `${n === 1 ? '1 PDF' : `${n} PDFs`} in a ZIP: issued invoices only. Cancelled ones and drafts are left out.`;
      },
    },
    watch: {
      // The selection never holds a row the owner cannot see (§3.25): a
      // filter change, a reload or a folded group unselects rows that left the
      // view, so the count on the button only ever counts rows on screen
      // (§3.145 Decision 5).
      shownIssued(rows) {
        const visible = new Set(rows.map((r) => r.id));
        const kept = this.selected.filter((id) => visible.has(id));
        if (kept.length !== this.selected.length) this.selected = kept;
      },
      // The month filters rows already here, so nothing is fetched; the folds
      // start over as for any other filter (§3.17 R2).
      month() {
        this.filterOpen = {};
        this.$emit('status-seen');
      },
      status: 'onFilterChange',
      issuedFrom: 'onFilterChange',
      issuedTo: 'onFilterChange',
      // After a save, a group that gained a row opens and the row is brought
      // into view (§3.145 Decision 2): an issued draft lands in its month.
      async refreshKey() {
        const before = this.groupOfRow();
        await this.load();
        this.reveal(before);
        this.loadCounts();
      },
      search() {
        clearTimeout(this.searchTimer);
        this.filterOpen = {};
        this.$emit('status-seen');
        this.searchTimer = setTimeout(() => this.load(), 250);
      },
    },
    // Opens on the newest month that still has paid work without an invoice,
    // which is the question the page is asked ("is this month done?"); with
    // nothing waiting it opens on every month, as it always did.
    // Only when the tab loads: what ze picks afterwards holds until ze leaves
    // the tab, and is never stored (design ack c70970). A draft waiting counts
    // as work still to do.
    created() {
      const waiting = (p) => !p.invoice || p.invoice.status === 'draft';
      this.month = candidateMonths(this.payments).find((m) => invoiceCandidates(this.payments, m).some(waiting)) || '';
    },
    mounted() {
      this.load();
      this.loadCounts();
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
      // "November 2026 · 4 invoices", "Drafts · 2": the count is the rows the
      // group renders (§3.145 Decision 4).
      summaryOf(group) {
        const n = group.rows.length;
        if (group.key === DRAFTS_GROUP) return `${group.label} · ${n}`;
        return `${group.label} · ${n} ${n === 1 ? 'invoice' : 'invoices'}`;
      },
      // Records only zir own toggles: a change the page made itself (a
      // filter, a default) already matches what `openKeys` says.
      onToggle(key, event) {
        const open = event.target.open;
        if (open === this.openKeys.has(key)) return;
        if (this.filtered) this.filterOpen = { ...this.filterOpen, [key]: open };
        else this.openGroups = { ...this.openGroups, [key]: open };
      },
      // Any change of filter starts every group open again (§3.17 R2), and
      // clearing the last one brings back zir state from before.
      onFilterChange() {
        this.filterOpen = {};
        this.$emit('status-seen');
        this.load();
      },
      groupOfRow() {
        const map = new Map();
        for (const g of this.groups) for (const r of g.rows) map.set(r.id, g.key);
        return map;
      },
      reveal(before) {
        const moved = [];
        for (const g of this.groups) for (const r of g.rows) if (before.get(r.id) !== g.key) moved.push({ id: r.id, key: g.key });
        if (!moved.length) return;
        const open = { ...this.openGroups };
        for (const m of moved) open[m.key] = true;
        this.openGroups = open;
        this.$nextTick(() => {
          const el = this.$el.querySelector(`[data-invoice-id="${moved[0].id}"]`);
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
      },
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
      // The captions fall back to their count-free wording if this read
      // fails; the list's own error line already reports a broken server.
      async loadCounts() {
        try {
          this.allRows = await listInvoices({});
        } catch {
          this.allRows = null;
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
      // A draft has no number yet; naming it by its client (UX walk AM4,
      // system_3 #11021) replaces one "Draft" of the two the row used to
      // read (the other is the status badge), with a client the rare one
      // missing both falls back to.
      identityOf(row) {
        return row.invoice_number || row.client_name || 'Draft';
      },
      // The phone card's only date used to be the work date, unlabelled, with
      // no issue date even though the filters above work on it (UX walk AM4).
      // A draft has no issue date yet, so it reads as just the work date.
      dateLineOf(row) {
        const work = `Work done ${this.serviceLabel(row)}`;
        return row.issue_date ? `${work} · Issued ${this.formatDay(row.issue_date)}` : work;
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
  /* A tick box's target was the box itself, 16px square, standing alone with
     no label: small in both dimensions, so it takes the 44px house target
     (§3.99 tier 2; UX walk AM9, system_3 #11027). The label that wraps the
     input takes the size, so a tap anywhere in it toggles; the box draws as
     before. */
  .invoice-card__select :deep(.checkbox),
  .select-cell :deep(.checkbox) {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

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

  /* Wide: one captioned row, search widest (#8399 spec §3.2). The row wraps
     by its own content, not at a breakpoint (design_agent on #9968, §3.122
     P2): where four do not fit, Client | Status sit above the date pair.
     Status keeps the width its longest option needs on one line ("All
     statuses": 134px measured at the desktop text size, 146px below 768px
     where it is --text-base; it wrapped at 94px in the old grid, operator
     c61550). */
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: end;
  }

  /* Phone first (§3.122 P1): the month at full width, then Generate at full
     width with its line under it, then the other filters (design ack c70970).
     From 640px the month keeps the left of its row and Generate takes the
     right (§3.159 Decisions 4 and 5). The filter row below is as it was. */
  .toolbar,
  .period {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .generate {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .generate__scope,
  .status-line {
    margin: 0;
    font-size: var(--text-sm);
  }

  @media (min-width: 640px) {
    .period {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
    }

    /* Stands in for the picker's caption, so the button sits on the picker's
       line and its scope hangs under it. */
    .generate::before {
      content: '\00a0';
      font-size: var(--text-sm);
    }

    .filter-field--month {
      flex: 0 0 auto;
      width: 11rem;
    }

    .generate {
      align-items: flex-end;
      text-align: right;
    }
  }

  .filter-field--search {
    flex: 2 1 14rem;
  }

  .filter-field--status {
    flex: 0 0 auto;
    width: 9.5rem;
  }

  .filter-dates {
    flex: 2 1 18rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
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

  /* The row's last column: the door, flush with the row's right edge
     (§3.159 Decision 3). */
  .row-actions {
    display: flex;
    justify-content: flex-end;
  }

  /* A button keeps its label whole: in a column too narrow for it, it would
     otherwise shrink and cut its own text. */
  .row-actions :deep(.btn) {
    flex: none;
  }

  /* §3.145: one fold per group. The layout is fixed and every column has a
     width, so the columns line up from one month's table to the next. */
  .invoice-group__summary {
    font-weight: 600;
  }

  .invoice-group > :deep(*:not(summary)) {
    margin-top: var(--space-xs);
  }

  .invoice-group :deep(table) {
    table-layout: fixed;
    width: 100%;
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

  .invoice-card__end {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-sm);
  }

  .card-door {
    white-space: nowrap;
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

  /* An issued or cancelled number is always short; a draft's identity is
     its client name instead (identityOf, UX walk AM4) and can be long. */
  .invoice-identity {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .invoice-card__client {
    overflow-wrap: anywhere;
  }

  /* Work done + issue date (UX walk AM4): longer than the old unlabelled
     work date alone, so it wraps rather than pushing the amount off the
     card; the amount (a flex sibling, not in flow with it) stays put. */
  .invoice-card__dates {
    flex: 1 1 auto;
    min-width: 0;
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

  /* flex-start: a button with a caption under it is taller than a bare one,
     and must not stretch its neighbours to match. */
  .exports {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
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
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .filter-field--search,
    .filter-field--status,
    .filter-dates {
      grid-column: 1 / -1;
    }

    .filter-field--status {
      width: auto;
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
