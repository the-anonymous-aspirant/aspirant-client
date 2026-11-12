<template>
  <section class="payments-panel" data-test="payments-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Transactions</h2>
      <!-- The four ways in, equal (§3.143 Decision 2, system_3 #10555): a
           payment by hand, an expense by hand (moved here from the Book, so
           a movement has one place to be recorded), then the PayPal and N26
           imports (#9760, #10534). All stay secondary; Create invoice holds
           the one primary slot. -->
      <div class="ways-in">
        <AspButton variant="secondary" class="block-on-phone" data-test="manual-new" @click="manualOpen = true">
          Enter payment by hand
        </AspButton>
        <AspButton variant="secondary" class="block-on-phone" data-test="expense-new" @click="openExpense">
          Enter expense by hand
        </AspButton>
      <div class="upload">
        <input
          ref="fileInput"
          class="upload__input"
          type="file"
          accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="PayPal activity CSV or Excel file"
          data-test="payments-file"
          :disabled="importing || n26Parsing"
          @change="onFileChosen"
        />
        <AspButton
          variant="secondary"
          :loading="importing"
          :disabled="n26Parsing"
          class="block-on-phone"
          data-test="payments-import"
          @click="$refs.fileInput.click()"
        >
          Import PayPal file
        </AspButton>
      </div>
      <div class="upload">
        <input
          ref="n26Input"
          class="upload__input"
          type="file"
          multiple
          accept=".csv,.pdf,text/csv,application/pdf"
          aria-label="N26 CSV export or PDFs"
          data-test="n26-file-input"
          :disabled="n26Parsing || importing"
          @change="onN26Chosen"
        />
        <AspButton
          variant="secondary"
          :loading="n26Parsing"
          :disabled="importing"
          class="block-on-phone"
          data-test="n26-import"
          @click="$refs.n26Input.click()"
        >
          Import N26 files
        </AspButton>
      </div>
      </div>
    </div>
    <!-- Said before upload, not only after a failure (security ruling c65222
         §5); wording ruled by design_agent in c65231 on system_3 #10536,
         built verbatim (c65576 on #10564). The 7 is a literal on purpose: it
         is aspirant-server's importFailureMaxWindowHours (168h), which an env
         value can only narrow, so "up to 7 days" holds at every setting.
         "May": a file over the size limit, or one arriving while the copies
         directory is at its cap, keeps no copy at all. -->
    <p class="ways-in__retention" data-test="import-retention-note">
      A file that fails to import may be kept for up to 7 days so the import can be fixed, then it is deleted. Only the administrator can open it.
    </p>

    <div v-if="needsDateOrder" class="date-order" role="group" aria-labelledby="date-order-label" data-test="date-order">
      <p id="date-order-label">
        Every date in this PayPal {{ paypalNoun }} reads both ways (for example 07/08/2026). Which order does the file use?
      </p>
      <div class="date-order__actions">
        <AspButton variant="secondary" data-test="date-order-dmy" @click="reimport('dmy')">Day/month (07/08 = 7 August)</AspButton>
        <AspButton variant="secondary" data-test="date-order-mdy" @click="reimport('mdy')">Month/day (07/08 = 8 July)</AspButton>
      </div>
    </div>

    <p v-if="importError" class="error" role="alert" data-test="import-error">{{ importError }}</p>

    <AspCard v-if="summary" class="summary" padding="sm" data-test="import-summary">
      <p class="summary__line">
        <!-- The clause hangs on "imported" with no line break between, so the
             comma follows directly (system_3 #10040: a break here rendered
             "3 imported , 0 already imported"). -->
        PayPal {{ paypalNoun }}: read {{ summary.rows_read }} rows: <strong>{{ summary.imported }}</strong> imported<template v-if="summary.withdrawals"> (including {{ summary.withdrawals }} bank withdrawals)</template>,
        <template v-if="summary.refunds">{{ summary.refunds }} set to Refund, </template>{{ summary.duplicates }} already imported, {{ summary.skipped }} skipped.<template v-if="paypalExpensesAdded">
          {{ ' ' }}<span data-test="paypal-summary-expenses">{{ paypalExpensesAdded }} expense{{ paypalExpensesAdded === 1 ? '' : 's' }} added to your book.</span></template><template v-if="paypalCopyKept">
          {{ ' ' }}<span data-test="paypal-summary-copy-kept">{{ paypalCopyKept }}</span></template><template v-if="payerCandidates.length">
          {{ ' ' }}<span data-test="payers-clause">{{ payersClause }}</span>{{ ' ' }}<AspButton variant="ghost" size="sm" class="summary__action" data-test="payers-open" @click="payersOpen = true">Add payers…</AspButton></template>
      </p>
      <ul v-if="skippedReasons.length" class="summary__reasons">
        <li v-for="r in skippedReasons" :key="r.key">{{ r.count }} × {{ r.label }}</li>
      </ul>
    </AspCard>

    <!-- One import-state region serves both imports, so each line names its
         source, and one summary shows at a time (design_agent c60358). -->
    <AspCard v-if="n26Summary" class="summary" padding="sm" data-test="n26-summary">
      <p class="summary__line">
        N26: read {{ n26Summary.rows_read }} row{{ n26Summary.rows_read === 1 ? '' : 's' }} from
        {{ n26Summary.files }} file{{ n26Summary.files === 1 ? '' : 's' }}:
        <strong>{{ n26Summary.imported }}</strong> imported, {{ n26Summary.duplicates }} already imported,
        {{ n26Summary.skipped }} skipped<template v-if="n26Summary.paypal_transfers">, <span data-test="n26-summary-paypal">{{ n26PayPalClause }}</span></template><template v-if="n26Summary.space_transfers">, <span data-test="n26-summary-space-transfer">{{ n26SpaceTransferClause }}</span></template>.<template v-if="n26Summary.failures.length">
          {{ ' ' }}<span data-test="n26-summary-failures">{{ n26FailureLine }}</span></template><template v-if="(n26Summary.unreadable || []).length">
          {{ ' ' }}<span data-test="n26-summary-unreadable">{{ n26UnreadableLine }}</span></template><template v-if="n26Summary.expenses_added">
          {{ ' ' }}<span data-test="n26-summary-expenses">{{ n26Summary.expenses_added }} expense{{ n26Summary.expenses_added === 1 ? '' : 's' }} added to your book.</span></template><template v-if="payerCandidates.length">
          {{ ' ' }}<span data-test="payers-clause">{{ payersClause }}</span>{{ ' ' }}<AspButton variant="ghost" size="sm" class="summary__action" data-test="payers-open" @click="payersOpen = true">Add payers…</AspButton></template>
      </p>
    </AspCard>

    <!-- §3.142 Decision 1: the import-state region's third line, one shows
         at a time with the other two. -->
    <AspCard v-if="manualSummary" class="summary" padding="sm" data-test="manual-summary">
      <!-- An expense lands in the Book, not in this list yet (§3.143
           Decision 3's one list is system_3 #10630), so the line says where
           it went, in the imports' own words for it. -->
      <p v-if="manualSummary.expense" class="summary__line" data-test="manual-summary-expense">
        By hand: 1 expense added to your book.
      </p>
      <p v-else class="summary__line">
        By hand: saved {{ formatMoney(manualSummary.gross_cents, manualSummary.currency) }}<template v-if="manualSummary.sender_name"> from {{ manualSummary.sender_name }}</template>.<template v-if="manualSummary.client_name">
          {{ ' ' }}<span data-test="manual-summary-client-added">Added {{ manualSummary.client_name }} to your client book.</span></template>
      </p>
    </AspCard>

    <!-- §3.142 Decision 5: the payers dialog's result, the region's fourth
         line; one shows at a time with the other three. -->
    <AspCard v-if="payersSummary" class="summary" padding="sm" data-test="payers-summary">
      <p class="summary__line">
        {{ payersSavedLine(payersSummary) }}
      </p>
    </AspCard>

    <!-- Nothing to filter or select before the first payment. -->
    <div v-if="incoming.length" class="toolbar">
      <div class="filter full-select">
        <AspSelect
          v-model="categoryFilter"
          :options="filterOptions"
          aria-label="Show payments of category"
          data-test="category-filter"
        />
      </div>
      <!-- One selection, two actions on it (design_agent c60951 on system_3
           #9873): Set category for any rows, Create invoice for Paid work
           only. Create invoice stays the panel's one primary, rightmost. -->
      <div class="create">
        <div class="create__actions">
          <div class="set-category full-select">
            <AspSelect
              :model-value="null"
              :options="categoryOptions"
              :placeholder="setCategoryPlaceholder"
              :disabled="selected.length === 0 || bulkSaving"
              data-test="bulk-category"
              @update:model-value="setCategory"
            />
          </div>
          <AspButton
            :disabled="!canCreate"
            :loading="creating"
            :aria-describedby="createCaption ? 'create-invoice-hint' : undefined"
            class="block-on-phone"
            data-test="create-invoice"
            @click="createInvoice"
          >
            Create invoice{{ selected.length ? ` from ${selected.length} payment${selected.length === 1 ? '' : 's'}` : '' }}
          </AspButton>
        </div>
        <!-- States why Create invoice cannot act, in terms the owner can fix
             here; the server is still the rule (only paid work is invoiced). -->
        <p v-if="createCaption" id="create-invoice-hint" class="create__hint" data-test="create-invoice-hint">
          {{ createCaption }}
        </p>
      </div>
    </div>
    <p v-if="bulkError" class="error" role="alert" data-test="bulk-error">{{ bulkError }}</p>
    <p v-if="createError" class="error" role="alert" data-test="create-error">{{ createError }}</p>

    <AspEmptyState
      v-if="incoming.length === 0"
      heading="No payments yet"
      message="Enter a payment by hand, or import a PayPal CSV or Excel file, or an N26 CSV export or PDFs."
      data-test="payments-empty"
    />
    <AspEmptyState
      v-else-if="shown.length === 0"
      variant="filtered"
      heading="No payments in this category"
      data-test="payments-filtered-empty"
    />
    <template v-else-if="narrow">
    <div class="select-all" data-test="select-all-shown">
      <AspCheckbox
        :model-value="allShownSelected"
        :indeterminate="someShownSelected"
        :label="`Select all ${selectableShown.length} shown`"
        @update:model-value="selectAllShown"
      />
    </div>
    <ul class="payment-cards" aria-label="Incoming payments">
      <li
        v-for="row in shown"
        :key="row.id"
        class="payment-card"
        data-test="payment-row"
        :data-txn="row.transaction_id"
      >
        <div class="payment-card__top">
          <span class="payment-card__when">
            <AspCheckbox
              v-if="!row.on_issued_invoice"
              :model-value="selected.includes(row.id)"
              :aria-label="`Select ${row.transaction_id}`"
              data-test="payment-select"
              @update:model-value="toggle(row.id, $event)"
            />
            <!-- An issued invoice's payment can be neither recategorised,
                 invoiced again nor deleted, so it has no checkbox (§3.129
                 Decision 6, design_agent c62100); an invisible copy keeps
                 the gutter, so every date starts on one edge. -->
            <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
            <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
          </span>
          <strong class="nowrap amount">{{ formatMoney(row.gross_cents, row.currency) }}</strong>
        </div>
        <span class="sender">{{ row.sender_name }}</span>
        <span v-if="row.sender_email" class="muted">{{ row.sender_email }}</span>
        <span v-if="row.note" class="note">{{ row.note }}</span>
        <span v-if="row.entry === 'manual'" class="muted manual-line" data-test="payment-manual">Entered by hand <span class="nowrap">· {{ methodLabel(row) }}</span><template v-if="row.reference">{{ ' ' }}<span class="nowrap">· {{ row.reference }}</span></template></span>
        <!-- Any payment can be deleted while no ISSUED invoice covers it,
             imported or entered by hand (operator c61868, system_3 #10009,
             #10010). Armed, the row says what a delete does. -->
        <template v-if="!row.on_issued_invoice">
          <AspButton
            :variant="confirmingDelete === row.id ? 'destructive' : 'ghost'"
            size="sm"
            class="manual-delete"
            :loading="deleting === row.id"
            data-test="payment-delete"
            @click="removePayment(row)"
          >
            {{ confirmingDelete === row.id ? 'Delete this payment' : 'Delete' }}
          </AspButton>
          <span v-if="confirmingDelete === row.id && deleteConsequence(row)" class="muted delete-reason" data-test="payment-delete-consequence">{{ deleteConsequence(row) }}</span>
        </template>
        <span v-else class="muted delete-reason" data-test="payment-no-delete-reason">On an issued invoice — cancel that invoice first</span>
        <div class="payment-card__fields full-select">
          <div class="payment-card__field">
            <span class="payment-card__caption" aria-hidden="true">Category</span>
            <AspSelect
              :model-value="row.category"
              :options="categoryOptionsFor(row)"
              :aria-label="`Category for ${row.transaction_id}`"
              :disabled="saving.has(row.id)"
              data-test="payment-category"
              @update:model-value="patch(row, { category: $event })"
            />
            <span v-if="isPayPalTransferIntoN26(row)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
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
        </div>
      </li>
    </ul>
    </template>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="shown"
      row-key="id"
      density="compact"
      caption="Incoming payments"
      :row-attrs="(row) => ({ 'data-test': 'payment-row', 'data-txn': row.transaction_id })"
    >
      <template #header-select>
        <AspCheckbox
          :model-value="allShownSelected"
          :indeterminate="someShownSelected"
          aria-label="Select all shown payments"
          data-test="select-all-shown"
          @update:model-value="selectAllShown"
        />
      </template>
      <template #cell-select="{ row }">
        <AspCheckbox
          v-if="!row.on_issued_invoice"
          :model-value="selected.includes(row.id)"
          :aria-label="`Select ${row.transaction_id}`"
          data-test="payment-select"
          @update:model-value="toggle(row.id, $event)"
        />
        <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
      </template>
      <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
      <!-- The payer's note reads under the sender, as on the phone cards: a
           column of its own left too little width for the three selects
           at 1280 with the sidebar open (#8407). -->
      <template #cell-sender="{ row }">
        <span class="sender">{{ row.sender_name }}</span>
        <span v-if="row.sender_email" class="muted">{{ row.sender_email }}</span>
        <span v-if="row.note" class="note note--cell">{{ row.note }}</span>
        <!-- A hand-entered payment says so; no extra column for Delete (the
             table fills 968px). -->
        <span v-if="row.entry === 'manual'" class="muted manual-line" data-test="payment-manual">Entered by hand <span class="nowrap">· {{ methodLabel(row) }}</span><template v-if="row.reference">{{ ' ' }}<span class="nowrap">· {{ row.reference }}</span></template></span>
        <!-- Any payment can be deleted while no ISSUED invoice covers it,
             imported or entered by hand (operator c61868, system_3 #10009,
             #10010). Armed, the row says what a delete does. -->
        <template v-if="!row.on_issued_invoice">
          <AspButton
            :variant="confirmingDelete === row.id ? 'destructive' : 'ghost'"
            size="sm"
            class="manual-delete"
            :loading="deleting === row.id"
            data-test="payment-delete"
            @click="removePayment(row)"
          >
            {{ confirmingDelete === row.id ? 'Delete this payment' : 'Delete' }}
          </AspButton>
          <span v-if="confirmingDelete === row.id && deleteConsequence(row)" class="muted delete-reason" data-test="payment-delete-consequence">{{ deleteConsequence(row) }}</span>
        </template>
        <span v-else class="muted delete-reason" data-test="payment-no-delete-reason">On an issued invoice — cancel that invoice first</span>
      </template>
      <template #cell-gross_cents="{ row }"><span class="nowrap">{{ formatMoney(row.gross_cents, row.currency) }}</span></template>
      <template #cell-category="{ row }">
        <div class="cell-select">
          <AspSelect
            :model-value="row.category"
            :options="categoryOptionsFor(row)"
            :aria-label="`Category for ${row.transaction_id}`"
            :disabled="saving.has(row.id)"
            data-test="payment-category"
            @update:model-value="patch(row, { category: $event })"
          />
          <span v-if="isPayPalTransferIntoN26(row)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
        </div>
      </template>
      <template #cell-client_id="{ row }">
        <div class="cell-select">
          <AspSelect
            :model-value="row.client_id ?? 0"
            :options="clientOptions"
            :aria-label="`Client for ${row.transaction_id}`"
            :title="optionLabel(clientOptions, row.client_id ?? 0)"
            :disabled="saving.has(row.id)"
            data-test="payment-client"
            @update:model-value="patch(row, { client_id: $event || null })"
          />
        </div>
      </template>
    </AspDataTable>
    <p v-if="rowError" class="error" role="alert" data-test="payment-error">{{ rowError }}</p>

    <ManualPaymentDialog
      v-model:open="manualOpen"
      :clients="clients"
      @changed="$emit('changed')"
      @saved="onManualSaved"
    />
    <ManualExpenseDialog
      v-model:open="expenseOpen"
      :categories="expenseCategories"
      @changed="onExpenseSaved"
      @category-added="expenseCategories = [...expenseCategories, $event]"
    />
    <N26ImportDialog v-model:open="n26Open" :files="n26Files" :payments="payments" @imported="onN26Imported" />
    <PayPalExpensesDialog v-model:open="paypalExpensesOpen" :candidates="paypalExpenseCandidates" @done="onPayPalExpensesDone" />
    <PayersDialog
      v-model:open="payersOpen"
      :candidates="payerCandidates"
      :left-out="payerLeftOut"
      :clients="clients"
      @saved="onPayersSaved"
    />
  </section>
</template>

<script>
  import { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSelect } from '@aspirant/design-system';
  import ManualExpenseDialog from './ManualExpenseDialog.vue';
  import ManualPaymentDialog from './ManualPaymentDialog.vue';
  import N26ImportDialog from './N26ImportDialog.vue';
  import PayPalExpensesDialog from './PayPalExpensesDialog.vue';
  import PayersDialog from './PayersDialog.vue';
  import {
    CATEGORY_LABELS,
    METHOD_LABELS,
    N26_MAX_FILES,
    deletePayment,
    SKIP_REASON_LABELS,
    copyKeptSentence,
    errorOf,
    formatDay,
    formatMoney,
    importPayPalCSV,
    listExpenseCategories,
    listPayerCandidates,
    payersSavedLine,
    parseN26PDFs,
    patchPayment,
    createDraft,
  } from './api.js';

  // "2 of 5 kept their category: 2026-08-12 €40.00, 2026-08-14 €25.00 (on an
  // issued invoice; cancel it first)." One shared reason closes the line;
  // mixed reasons follow each row.
  function bulkFailureLine(failed, total) {
    const k = failed.length;
    const head = `${k} of ${total} kept ${k === 1 ? 'its' : 'their'} category: `;
    const name = (f) => `${formatDay(f.row.paid_on)} ${formatMoney(f.row.gross_cents, f.row.currency)}`;
    const shared = failed.every((f) => f.reason === failed[0].reason);
    if (shared) return `${head}${failed.map(name).join(', ')} (${failed[0].reason}).`;
    return `${head}${failed.map((f) => `${name(f)} (${f.reason})`).join(', ')}.`;
  }

  const PAYPAL_WRONG_FILE =
    "PayPal file: choose the CSV or Excel export from PayPal's activity download. A PDF statement cannot be read.";

  // PayPal import and categorisation (spec §4.3–4.4). Every payment starts
  // uncategorised; only "Paid work" can later be invoiced, and that rule is
  // the server's. Sender names, emails and notes are written by outside
  // payers, so they are only ever rendered as text interpolation.
  export default {
    name: 'PaymentsPanel',
    components: { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSelect, ManualExpenseDialog, ManualPaymentDialog, N26ImportDialog, PayPalExpensesDialog, PayersDialog },
    props: {
      payments: { type: Array, required: true },
      clients: { type: Array, required: true },
    },
    emits: ['changed', 'open-invoice'],
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
        selected: [],
        bulkSaving: false,
        bulkError: '',
        creating: false,
        createError: '',
        manualOpen: false,
        expenseOpen: false,
        expenseCategories: [],
        manualSummary: null,
        n26Parsing: false,
        n26Open: false,
        n26Files: [],
        n26Summary: null,
        // §3.142 Decision 5: unlinked payers after an import, offered in the
        // payers dialog, and that dialog's result line.
        payerCandidates: [],
        payerLeftOut: {},
        payersOpen: false,
        payersSummary: null,
        // The last PayPal file's outgoing payments, offered as expenses
        // (system_3 #10438), and how many the owner added.
        paypalExpenseCandidates: [],
        paypalExpensesOpen: false,
        paypalExpensesAdded: 0,
        confirmingDelete: null,
        deleting: null,
        columns: [
          { key: 'select', label: '', sortable: false, width: '2.5rem' },
          { key: 'paid_on', label: 'Date' },
          { key: 'sender', label: 'From', sortable: false },
          { key: 'gross_cents', label: 'Amount', align: 'right' },
          // Width measured at 1280 with the sidebar open, where the table has
          // 968px (#8407): the cell pads 12px a side and a table-cell trigger
          // ~32px, so 10.25rem shows "Uncategorised" (106px of text) whole.
          // Longer values end in an ellipsis with the whole label as the
          // trigger's title.
          { key: 'category', label: 'Category', sortable: false, width: '10.25rem' },
          { key: 'client_id', label: 'Client', sortable: false, width: '10.25rem' },
        ],
      };
    },
    computed: {
      incoming() {
        return this.payments.filter((p) => p.kind === 'incoming');
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
      // A file that could not be read stays named after the dialog closes
      // (D2: a fold may hide detail, never a failure).
      // Transfers from PayPal the server left out of the N26 files (#9881).
      // "left out" is the rule; "skipped" stays her own unticking (c61091).
      n26PayPalClause() {
        const n = (this.n26Summary && this.n26Summary.paypal_transfers) || 0;
        return n === 1
          ? '1 transfer from PayPal left out (its payments come in through PayPal)'
          : `${n} transfers from PayPal left out (their payments come in through PayPal)`;
      },
      // Moves between her own account and a Space that the server left out
      // of a statement (system_3 #10541): the statement's analogue of the
      // PayPal clause above, kept short because the review dialog already
      // gave the full reason (design_agent c65358).
      n26SpaceTransferClause() {
        const n = (this.n26Summary && this.n26Summary.space_transfers) || 0;
        return n === 1
          ? '1 move between your account and a Space left out (your own money)'
          : `${n} moves between your account and your Spaces left out (your own money)`;
      },
      // A recognised file that read no transaction stays named after the
      // dialog closes, like a failure (design_agent c65358).
      // A file that read no rows is a recorded failure; the server says when
      // its kept copy goes, if one was kept (#10567).
      paypalCopyKept() {
        return copyKeptSentence(this.summary && this.summary.copy_expires_at);
      },
      n26UnreadableLine() {
        const files = (this.n26Summary && this.n26Summary.unreadable) || [];
        const n = files.length;
        return `${n} file${n === 1 ? '' : 's'} read no transaction: ${files.join(', ')}.`;
      },
      payersClause() {
        const n = this.payerCandidates.length;
        return n === 1 ? '1 payer is not in your client book.' : `${n} payers are not in your client book.`;
      },
      n26FailureLine() {
        const failures = (this.n26Summary && this.n26Summary.failures) || [];
        const n = failures.length;
        const list = failures.map((f) => `${f.filename} (${f.reason})`).join(', ');
        return `${n} file${n === 1 ? '' : 's'} could not be read: ${list}.`;
      },
      // The PayPal file type, named on every PayPal line (§3.127 D4): what the
      // server read once it answered, otherwise the file the owner chose.
      paypalNoun() {
        if (this.summary && this.summary.format) return this.summary.format === 'xlsx' ? 'Excel file' : 'CSV';
        const f = this.pendingFile;
        const xlsx = f && (/\.xlsx$/i.test(f.name || '') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return xlsx ? 'Excel file' : 'CSV';
      },
      selectedRows() {
        return this.incoming.filter((p) => this.selected.includes(p.id));
      },
      notPaidWork() {
        return this.selectedRows.filter((p) => p.category !== 'paid_work').length;
      },
      canCreate() {
        return this.selected.length > 0 && this.notPaidWork === 0;
      },
      // Why Create invoice cannot act, in terms the owner can fix from the
      // panel (§3.114); it never quietly invoices the Paid work subset (D13).
      createCaption() {
        const n = this.selected.length;
        if (n === 0) return 'Select payments to set their category, or Paid work payments to create an invoice.';
        const k = this.notPaidWork;
        if (k === 0) return '';
        return `${k} of the ${n} selected ${k === 1 ? 'is' : 'are'} not Paid work. Only Paid work can be invoiced.`;
      },
      // The count in the trigger is what makes a one-pick bulk write safe
      // without a confirm step (design_agent c60951 rule 4).
      setCategoryPlaceholder() {
        const n = this.selected.length;
        return n ? `Set category of ${n} selected` : 'Set category of selected payments';
      },
      // The shown rows a checkbox can act on: not on an issued invoice
      // (§3.129 Decisions 4 and 6, design_agent c62100 on #10010).
      selectableShown() {
        return this.shown.filter((p) => !p.on_issued_invoice);
      },
      allShownSelected() {
        return this.selectableShown.length > 0 && this.selectableShown.every((p) => this.selected.includes(p.id));
      },
      someShownSelected() {
        return !this.allShownSelected && this.selectableShown.some((p) => this.selected.includes(p.id));
      },
      skippedReasons() {
        const reasons = (this.summary && this.summary.skipped_reasons) || {};
        return Object.entries(reasons).map(([key, count]) => ({ key, count, label: SKIP_REASON_LABELS[key] || key }));
      },
    },
    watch: {
      // The selection never holds a row the owner cannot see (§3.25): a
      // filter change or a reload unselects rows that left the view.
      shown(rows) {
        const visible = new Set(rows.filter((p) => !p.on_issued_invoice).map((p) => p.id));
        const kept = this.selected.filter((id) => visible.has(id));
        if (kept.length !== this.selected.length) this.selected = kept;
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
      payersSavedLine,
      methodLabel(row) {
        return METHOD_LABELS[row.method] || row.method;
      },
      // What a delete does, said while it is armed (#10010): an imported
      // payment leaves a tombstone, so the same file will not bring it back
      // (#10009); one on a draft or cancelled invoice comes off that invoice.
      deleteConsequence(row) {
        const parts = [];
        if (row.entry !== 'manual') parts.push('Gone for good: importing the same file again will not bring it back.');
        if (row.on_invoice && !row.on_issued_invoice) parts.push('It also comes off the draft or cancelled invoice that lists it. A draft keeps its lines, so check its total.');
        return parts.join(' ');
      },
      // Mirrors the server's isPayPalTransferIntoN26 (invoicing_n26.go):
      // an N26 row whose payer is PayPal. The PayPal payments it sums are
      // the paid work, so the transfer itself can never be (#9940-A1,
      // operator c61402).
      isPayPalTransferIntoN26(row) {
        return row.source === 'n26' && (row.sender_name || '').toLowerCase().includes('paypal');
      },
      categoryOptionsFor(row) {
        if (!this.isPayPalTransferIntoN26(row)) return this.categoryOptions;
        return this.categoryOptions.map((o) => (o.value === 'paid_work' ? { ...o, disabled: true } : o));
      },
      // Two steps: the first press turns the button into "Delete this
      // payment"; the server still refuses one that an issued invoice covers.
      async removePayment(row) {
        if (this.confirmingDelete !== row.id) {
          this.confirmingDelete = row.id;
          return;
        }
        this.rowError = '';
        this.deleting = row.id;
        try {
          await deletePayment(row.id);
          this.selected = this.selected.filter((x) => x !== row.id);
        } catch (err) {
          this.rowError = errorOf(err).message;
        } finally {
          this.deleting = null;
          this.confirmingDelete = null;
          this.$emit('changed');
        }
      },
      // The whole label, as a tooltip on a table-cell select whose value may
      // end in an ellipsis.
      optionLabel(options, value) {
        const option = options.find((o) => o.value === value);
        return option ? option.label : '';
      },
      onFileChosen(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        // "Import PayPal file" is looser than the formats it reads, and the
        // owner may hold PayPal's PDF statement: refuse anything but a CSV or
        // an .xlsx before sending it, and say what to bring (design_agent
        // c60973 on system_3 #9873; §3.127 Decision 5).
        if (!/\.(csv|xlsx)$/i.test(file.name || '')) {
          this.summary = null;
          this.n26Summary = null;
          this.manualSummary = null;
          this.payersSummary = null;
          this.needsDateOrder = false;
          this.importError = PAYPAL_WRONG_FILE;
          if (this.$refs.fileInput) this.$refs.fileInput.value = '';
          return;
        }
        this.pendingFile = file;
        this.runImport('');
      },
      reimport(order) {
        this.runImport(order);
      },
      // N26 import, step one: the server reads the PDFs and stores nothing;
      // the dialog then lets the owner confirm or skip each row.
      async onN26Chosen(event) {
        const files = [...((event.target && event.target.files) || [])];
        if (this.$refs.n26Input) this.$refs.n26Input.value = '';
        if (!files.length) return;
        this.importError = '';
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = null;
        this.payerCandidates = [];
        if (files.length > N26_MAX_FILES) {
          // The server's per-request cap counts CSVs the same as PDFs
          // (aspirant-server invoicing_n26.go maxN26FilesPerRequest).
          this.importError = `N26: choose at most ${N26_MAX_FILES} files at a time.`;
          return;
        }
        this.n26Parsing = true;
        try {
          this.n26Files = await parseN26PDFs(files);
          this.n26Open = true;
        } catch (err) {
          this.importError = `N26: ${errorOf(err).message}`;
        } finally {
          this.n26Parsing = false;
        }
      },
      // The page refetches its lists, the Book's expenses among them, on
      // 'changed'. An expense added in either review must trigger it, or the
      // Book tab shows it only after a reload (system_3 #10432).
      onPayPalExpensesDone(result) {
        this.paypalExpensesAdded = (result && result.confirmed) || 0;
        if (this.paypalExpensesAdded) this.$emit('changed');
      },
      onN26Imported(summary) {
        this.n26Summary = summary;
        this.manualSummary = null;
        this.payersSummary = null;
        this.refreshPayerCandidates();
        if (summary.imported || summary.expenses_added) this.$emit('changed');
      },
      // The offer is optional: a failed read shows no clause and no button,
      // and the list itself is unaffected.
      async refreshPayerCandidates() {
        try {
          const { payers, leftOut } = await listPayerCandidates();
          this.payerCandidates = payers;
          this.payerLeftOut = leftOut;
        } catch (err) {
          this.payerCandidates = [];
          this.payerLeftOut = {};
        }
      },
      onPayersSaved(result) {
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = { clients_added: result.clients_added || 0, payments_linked: result.payments_linked || 0 };
        this.payerCandidates = [];
        this.$emit('changed');
      },
      // §3.142 Decision 1: one line in the shared import-state region, same
      // "one summary shows at a time" rule as the two imports (§3.127
      // Decision 4). `client` is only present when the save also added a
      // payer (Decision 3).
      // Categories load when the expense dialog opens, never with the panel:
      // an import must make no categories request (invoicing.spec,
      // invoicing-n26.spec), and most visits never open this dialog.
      async openExpense() {
        this.expenseOpen = true;
        try {
          this.expenseCategories = await listExpenseCategories();
        } catch {
          // The dialog's category select is empty; the server still refuses
          // a save with no category, so nothing wrong can be stored.
        }
      },
      onExpenseSaved() {
        this.summary = null;
        this.n26Summary = null;
        this.payersSummary = null;
        this.manualSummary = { expense: true };
        this.$emit('changed');
      },
      onManualSaved({ payment, client }) {
        this.summary = null;
        this.n26Summary = null;
        this.payersSummary = null;
        this.manualSummary = {
          gross_cents: payment.gross_cents,
          currency: payment.currency,
          sender_name: payment.sender_name,
          client_name: client ? client.name : '',
        };
      },
      async runImport(dateOrder) {
        this.importing = true;
        this.importError = '';
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = null;
        this.payerCandidates = [];
        this.paypalExpensesAdded = 0;
        try {
          const { summary, expenseCandidates } = await importPayPalCSV(this.pendingFile, dateOrder);
          this.summary = summary;
          this.needsDateOrder = false;
          this.refreshPayerCandidates();
          this.$emit('changed');
          // Offer the outgoing payments only when one is new to the book.
          this.paypalExpenseCandidates = expenseCandidates;
          this.paypalExpensesOpen = expenseCandidates.some((row) => !row.already_imported);
        } catch (err) {
          const failure = errorOf(err);
          if (failure.code === 'date_order_ambiguous') {
            this.needsDateOrder = true;
          } else {
            // The server's messages mostly end unpunctuated; the sentence
            // that follows needs its own full stop before it (#10567).
            const kept = copyKeptSentence(failure.copyExpiresAt);
            const line = `PayPal ${this.paypalNoun}: ${failure.message}`;
            this.importError = kept ? `${line}${/[.!?]$/.test(line) ? '' : '.'} ${kept}` : line;
          }
        } finally {
          this.importing = false;
          if (this.$refs.fileInput) this.$refs.fileInput.value = '';
        }
      },
      toggle(id, on) {
        this.selected = on ? [...new Set([...this.selected, id])] : this.selected.filter((x) => x !== id);
      },
      selectAllShown(on) {
        const ids = this.selectableShown.map((p) => p.id);
        this.selected = on ? [...new Set([...this.selected, ...ids])] : this.selected.filter((id) => !ids.includes(id));
      },
      // Set one category on every selected row: one PATCH per row, in list
      // order. Rows that succeed leave the selection; rows the server refuses
      // stay selected and are named in one alert that stays until the next
      // bulk action (design_agent c60951 rule 5, D2).
      async setCategory(category) {
        if (!category || this.selected.length === 0 || this.bulkSaving) return;
        const rows = this.shown.filter((p) => this.selected.includes(p.id));
        this.bulkSaving = true;
        this.bulkError = '';
        const failed = [];
        for (const row of rows) {
          this.saving = new Set([...this.saving, row.id]);
          try {
            await patchPayment(row.id, { category });
          } catch (err) {
            const failure = errorOf(err);
            const reason = failure.code === 'payment_on_issued_invoice' ? 'on an issued invoice; cancel it first' : failure.message;
            failed.push({ row, reason });
          } finally {
            const next = new Set(this.saving);
            next.delete(row.id);
            this.saving = next;
          }
        }
        this.selected = failed.map((f) => f.row.id);
        if (failed.length) this.bulkError = bulkFailureLine(failed, rows.length);
        this.bulkSaving = false;
        this.$emit('changed');
      },
      // Create invoice acts only when every selected row is Paid work; the
      // server is still the rule (it refuses any other category, and a
      // payment already invoiced).
      async createInvoice() {
        this.creating = true;
        this.createError = '';
        try {
          const detail = await createDraft(this.selected);
          this.selected = [];
          this.$emit('open-invoice', detail.invoice.id);
          this.$emit('changed');
        } catch (err) {
          this.createError = errorOf(err).message;
        } finally {
          this.creating = false;
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
  .ways-in__retention {
    margin: var(--space-2xs) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* Layout per the #8399 spec (§3.114): on a phone the panel reads actions →
     filters → list, every control full width at the page edge; wide, the
     actions sit right and the filter left on one row. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The head row is the container the ways in measure themselves against
     (design_agent c61923 on system_3 #9942): .ways-in is sized by its own
     buttons, so it cannot be its own container; the full-width head can. */
  .panel-head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-md);
    container: ways-in / inline-size;
  }

  .ways-in {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  /* One row or all stacked, never a partial row (§3.127, carried to four by
     system_3 #10627): when the four buttons cannot share a line, all four
     stack full width, as on a phone. 48.75rem is their widths plus the three
     gaps (202 + 202 + 178 + 162 + 3 × 12 = 780px at a 16px root, measured
     with "Enter expense by hand" added), so it moves with her text size; the
     spec sweeps the widths and fails if a label change outgrows it. */
  @container ways-in (width < 48.75rem) {
    .ways-in {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
    }

    .ways-in .block-on-phone {
      width: 100%;
    }
  }

  .manual-line {
    margin-top: var(--space-2xs);
  }

  .delete-reason {
    margin-top: var(--space-2xs);
    font-size: var(--text-sm);
  }

  /* The ghost button's own padding would indent its label; pull it back so
     "Delete" lines up with the text above it. */
  .manual-delete {
    align-self: flex-start;
    margin-top: var(--space-2xs);
    margin-left: calc(-1 * var(--space-sm));
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
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .date-order p {
    margin: 0;
  }

  .date-order__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  /* AspCard is dark in both themes; set the ink here (§3.18). */
  .summary {
    margin-bottom: var(--space-md);
    color: var(--text-on-dark);
  }

  .summary__line {
    margin: 0;
  }

  /* The card is dark in both themes, so its one action takes the card's ink
     (§3.18), not the page's ghost ink. */
  .summary .summary__action {
    color: var(--text-on-dark);
    vertical-align: baseline;
  }

  .summary__reasons {
    margin: var(--space-xs) 0 0;
    padding-left: var(--space-lg);
  }

  /* Filter left, actions right. If the actions cannot sit beside the
     filter, they wrap below it as one unit, right-aligned; the two controls
     never split (design_agent c60951, placement). */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .filter {
    width: 16rem;
  }

  /* AspSelect forwards a class to its trigger, not its root, so a wrapper
     makes it fill the row. */
  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  /* In a table cell the select fills the cell instead of its own 10rem
     minimum, which with the cell padding overflowed every select column by
     ~12px and pushed the last one out of the table's box (#8407). A value too
     long for the cell ends in an ellipsis; its title and the open panel show
     it whole. */
  .cell-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .cell-select :deep(.select__trigger) {
    min-width: 0;
    padding: 0 var(--space-xs);
    gap: var(--space-2xs);
  }

  .cell-select :deep(.select__value) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .paid-work-reason {
    display: block;
    margin-top: var(--space-2xs);
    font-size: var(--text-sm);
  }

  .create {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
  }

  .create__actions {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  /* Wide enough for its longest label on one line, "Set category of selected
     payments" (operator c61550: no wrapping in these buttons, system_3 #9968):
     281px measured at the desktop text size and 314px below 768px, where
     option text is --text-base. A fixed width in rem fits both, so picking
     rows does not shift the row and it grows with her text size. */
  .set-category {
    width: 20rem;
  }

  /* The invisible checkbox on an issued invoice's row: its box keeps the
     gutter; it is neither seen, focused nor announced. */
  .select-gutter {
    visibility: hidden;
  }

  .select-all {
    margin-bottom: var(--space-sm);
  }

  .create__hint {
    margin: var(--space-2xs) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: right;
  }

  /* Payer-written text may break anywhere, so a long PayPal email narrows its
     column instead of pushing the table past its box (#8407). */
  .sender {
    display: block;
    overflow-wrap: anywhere;
  }

  .muted {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .note {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .note--cell {
    display: block;
    margin-top: var(--space-2xs);
  }

  .error {
    color: var(--feedback-error);
    margin: 0 0 var(--space-sm);
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
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .payment-card__when {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .amount {
    font-variant-numeric: tabular-nums;
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

  @media (max-width: 640px) {
    .panel-head,
    .toolbar,
    .ways-in {
      flex-direction: column;
      align-items: stretch;
    }

    .filter,
    .create,
    .set-category {
      width: 100%;
    }

    .create {
      align-items: stretch;
      margin-left: 0;
    }

    .create__actions {
      flex-direction: column;
      align-items: stretch;
    }

    .create__hint {
      text-align: left;
    }

    .block-on-phone,
    .date-order__actions :deep(button) {
      width: 100%;
    }

    .date-order__actions {
      flex-direction: column;
    }
  }
</style>
