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
        <template v-if="summary.refunds">{{ summary.refunds }} set to Refund, </template>{{ paypalPrior.already }} already imported, {{ summary.skipped }} skipped<template v-if="paypalPrior.removed"> ·&nbsp;<span data-test="paypal-summary-removed">{{ paypalPrior.removed }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-in" @click="openRemoved('in')">restore it on Transactions</button></span></template><template v-if="paypalPrior.deleted"> ·&nbsp;<span data-test="paypal-summary-deleted">{{ deletedClause(paypalPrior.deleted) }}</span></template>.<template v-if="expenseParts(paypalExpenses).length">
          {{ ' ' }}<span data-test="paypal-summary-expenses"><template v-if="!paypalExpenses.added">Expenses: </template><template v-for="(part, i) in expenseParts(paypalExpenses)" :key="part.key"><template v-if="i"> ·&nbsp;</template><span :data-test="`paypal-summary-expenses-${part.key}`"><template v-if="part.key === 'removed'">{{ part.count }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-out" @click="openRemoved('out')">restore it on Transactions</button></template><template v-else>{{ part.text }}</template></span></template>.</span></template><template v-if="paypalCopyKept">
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
        {{ n26Summary.skipped }} skipped<template v-if="n26Summary.paypal_transfers">, <span data-test="n26-summary-paypal">{{ n26PayPalClause }}</span></template><template v-if="n26Summary.space_transfers">, <span data-test="n26-summary-space-transfer">{{ n26SpaceTransferClause }}</span></template><template v-if="n26Summary.removed_earlier"> ·&nbsp;<span data-test="n26-summary-removed">{{ n26Summary.removed_earlier }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-in" @click="openRemoved('in')">restore it on Transactions</button></span></template><template v-if="n26Summary.deleted_earlier"> ·&nbsp;<span data-test="n26-summary-deleted">{{ deletedClause(n26Summary.deleted_earlier) }}</span></template>.<template v-if="n26Summary.failures.length">
          {{ ' ' }}<span data-test="n26-summary-failures">{{ n26FailureLine }}</span></template><template v-if="(n26Summary.unreadable || []).length">
          {{ ' ' }}<span data-test="n26-summary-unreadable">{{ n26UnreadableLine }}</span></template><template v-if="expenseParts(n26Expenses).length">
          {{ ' ' }}<span data-test="n26-summary-expenses"><template v-if="!n26Expenses.added">Expenses: </template><template v-for="(part, i) in expenseParts(n26Expenses)" :key="part.key"><template v-if="i"> ·&nbsp;</template><span :data-test="`n26-summary-expenses-${part.key}`"><template v-if="part.key === 'removed'">{{ part.count }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-out" @click="openRemoved('out')">restore it on Transactions</button></template><template v-else>{{ part.text }}</template></span></template>.</span></template><template v-if="payerCandidates.length">
          {{ ' ' }}<span data-test="payers-clause">{{ payersClause }}</span>{{ ' ' }}<AspButton variant="ghost" size="sm" class="summary__action" data-test="payers-open" @click="payersOpen = true">Add payers…</AspButton></template>
      </p>
    </AspCard>

    <!-- §3.142 Decision 1: the import-state region's third line, one shows
         at a time with the other two. -->
    <AspCard v-if="manualSummary" class="summary" padding="sm" data-test="manual-summary">
      <!-- The expense is in this list now (§3.143 Decision 3, system_3
           #10630); the line keeps the imports' own words for it. -->
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

    <!-- §3.143 Decision 6: the removed rows open in place of the list, with
         "Back to transactions" (system_3 #10633). -->
    <RemovedRows
      v-if="removedOpen"
      :payments="removedPayments"
      :expenses="removedExpenses"
      :direction="removedDirection"
      @back="removedOpen = false"
      @changed="$emit('changed')"
    />
    <template v-else>
    <!-- Nothing to filter or select before the first movement of money. -->
    <div v-if="rows.length" class="toolbar">
      <!-- §3.143 Decision 3: the direction, then a category select whose
           options follow it. -->
      <div class="filters">
        <AspSegmented
          v-model="direction"
          :options="directionOptions"
          aria-label="Show money in, out or both"
          class="direction"
          data-test="direction-filter"
        />
        <div class="filter full-select">
          <AspSelect
            v-model="categoryFilter"
            :searchable="direction !== 'in'"
            :options="filterOptions"
            aria-label="Show transactions of category"
            data-test="category-filter"
          />
        </div>
      </div>
      <!-- One selection feeds every action, each enabled by its own
           condition (§3.143 Decision 4, §3.129): Set category for rows of
           one direction, Remove for any selected row, Create invoice for
           Paid work only. Create invoice stays the panel's one primary,
           rightmost. -->
      <div class="create">
        <div class="create__actions">
          <div class="set-category full-select">
            <AspSelect
              :model-value="null"
              :searchable="selectedExpenses.length > 0"
              :options="setCategoryOptions"
              :placeholder="setCategoryPlaceholder"
              :disabled="!canSetCategory || bulkSaving || removing"
              :aria-describedby="mixedSelection ? 'set-category-hint' : undefined"
              data-test="bulk-category"
              @update:model-value="setCategory"
            />
          </div>
          <!-- Arms first, like the row delete: "Remove (N)" becomes
               "Remove N rows", and only that second press removes. -->
          <AspButton
            :variant="confirmingRemove ? 'destructive' : 'secondary'"
            :disabled="selected.length === 0 || bulkSaving || creating"
            :loading="removing"
            :aria-describedby="confirmingRemove && removeConsequence ? 'bulk-remove-hint' : undefined"
            class="block-on-phone"
            data-test="bulk-remove"
            @click="removeSelected"
          >
            {{ removeLabel }}
          </AspButton>
          <AspButton
            :disabled="!canCreate || removing"
            :loading="creating"
            :aria-describedby="createCaption ? 'create-invoice-hint' : undefined"
            class="block-on-phone"
            data-test="create-invoice"
            @click="createInvoice"
          >
            Create invoice{{ selected.length && !selectedExpenses.length ? ` from ${selected.length} payment${selected.length === 1 ? '' : 's'}` : '' }}
          </AspButton>
        </div>
        <!-- Why Set category cannot act on this selection, in terms the
             owner can fix here (§3.114). -->
        <p v-if="mixedSelection" id="set-category-hint" class="create__hint" data-test="set-category-hint">
          Choose only money in or only money out to set a category
        </p>
        <!-- What else an armed Remove does, said before it acts. -->
        <p v-if="confirmingRemove && removeConsequence" id="bulk-remove-hint" class="create__hint" data-test="bulk-remove-consequence">
          {{ removeConsequence }}
        </p>
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
      v-if="rows.length === 0"
      heading="Nothing recorded yet"
      message="Enter a payment or an expense by hand, or import a PayPal CSV or Excel file, or an N26 CSV export or PDFs."
      data-test="payments-empty"
    />
    <AspEmptyState
      v-else-if="shown.length === 0"
      variant="filtered"
      heading="Nothing matches this filter"
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
    <!-- §3.114 card in §3.143 Decision 3's order: the checkbox, who top-left,
         the amount top-right, then the date and source muted, then what it
         was for, then the controls. -->
    <ul class="payment-cards" aria-label="Money in and out">
      <li
        v-for="row in shown"
        :key="row.key"
        class="payment-card"
        :class="{ 'payment-card--tap': !!(row.payment || row.expense) }"
        :data-test="row.direction === 'in' ? 'payment-row' : 'expense-row'"
        :data-txn="row.transaction_id"
        :data-direction="row.direction"
        @click="onCardTap(row, $event)"
      >
        <div class="payment-card__top">
          <span class="payment-card__who">
            <AspCheckbox
              v-if="selectable(row)"
              :model-value="selected.includes(row.key)"
              :aria-label="`Select ${row.transaction_id}`"
              data-test="payment-select"
              @update:model-value="toggle(row.key, $event)"
            />
            <!-- A row no checkbox can act on keeps an invisible copy, so every
                 name starts on one edge: an issued invoice's payment
                 (§3.129 Decision 6, design_agent c62100). -->
            <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
            <span class="sender" data-test="row-who">{{ row.who || row.what || '—' }}</span>
          </span>
          <strong class="nowrap amount" :class="row.direction === 'in' ? 'in-amount' : 'out-amount'" data-test="row-amount">{{ signedAmount(row) }}</strong>
        </div>
        <span class="muted" data-test="row-date-line"><span class="nowrap">{{ formatDay(row.paid_on) }}</span> · <span data-test="row-source">{{ row.source }}</span></span>
        <span v-if="row.payment && row.payment.sender_email" class="muted">{{ row.payment.sender_email }}</span>
        <span v-if="row.who && row.what" class="note" data-test="row-what">{{ row.what }}</span>
        <template v-if="row.payment">
          <span v-if="row.payment.entry === 'manual'" class="muted manual-line" data-test="payment-manual">{{ manualLine(row.payment) }}</span>
          <div class="payment-card__fields full-select">
            <div class="payment-card__field">
              <span class="payment-card__caption" aria-hidden="true">Category</span>
              <AspSelect
                :model-value="row.payment.category"
                :options="categoryOptionsFor(row.payment)"
                :aria-label="`Category for ${row.transaction_id}`"
                :disabled="saving.has(row.key)"
                data-test="payment-category"
                @update:model-value="patch(row.payment, { category: $event })"
              />
              <span v-if="isPayPalTransferIntoN26(row.payment)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
            </div>
            <div class="payment-card__field">
              <span class="payment-card__caption" aria-hidden="true">Client</span>
              <AspSelect
                :model-value="row.payment.client_id ?? 0"
                searchable
                :options="clientOptions"
                :aria-label="`Client for ${row.transaction_id}`"
                :disabled="saving.has(row.key)"
                data-test="payment-client"
                @update:model-value="patch(row.payment, { client_id: $event || null })"
              />
              <span v-if="row.invoice" class="muted invoice-line" data-test="row-invoice">{{ row.invoice }}</span>
            </div>
          </div>
        </template>
        <!-- An expense's category reads as text here; it is set from the
             selection and the edit dialog (system_3 #10631, #10632). -->
        <span v-else class="muted" data-test="row-category">{{ row.categoryLabel }}</span>
      </li>
    </ul>
    </template>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="shown"
      row-key="key"
      density="compact"
      caption="Money in and out"
      :row-attrs="(row) => ({ 'data-test': row.direction === 'in' ? 'payment-row' : 'expense-row', 'data-txn': row.transaction_id, 'data-direction': row.direction })"
    >
      <template #header-select>
        <AspCheckbox
          :model-value="allShownSelected"
          :indeterminate="someShownSelected"
          aria-label="Select all shown rows"
          data-test="select-all-shown"
          @update:model-value="selectAllShown"
        />
      </template>
      <template #cell-select="{ row }">
        <AspCheckbox
          v-if="selectable(row)"
          :model-value="selected.includes(row.key)"
          :aria-label="`Select ${row.transaction_id}`"
          data-test="payment-select"
          @update:model-value="toggle(row.key, $event)"
        />
        <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
      </template>
      <!-- The source is a fact about the row, on its muted date line
           (§3.143 Decision 3). -->
      <template #cell-paid_on="{ row }">
        <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
        <span class="muted" data-test="row-source">{{ row.source }}</span>
      </template>
      <!-- Who, then what it was for under it, as on the phone card: a column
           of its own left too little width for the selects at 1280 with the
           sidebar open (#8407). -->
      <template #cell-who="{ row }">
        <span class="sender" data-test="row-who">{{ row.who || row.what || '—' }}</span>
        <span v-if="row.payment && row.payment.sender_email" class="muted">{{ row.payment.sender_email }}</span>
        <span v-if="row.who && row.what" class="note note--cell" data-test="row-what">{{ row.what }}</span>
        <template v-if="row.payment">
          <!-- A hand-entered payment's method and reference; no extra column
               for Delete (the table fills 968px). -->
          <span v-if="row.payment.entry === 'manual'" class="muted manual-line" data-test="payment-manual">{{ manualLine(row.payment) }}</span>
          <!-- §3.143 Decision 5 (D12): the row's Edit replaces its Delete;
               removing moves into the dialog. An issued invoice's payment
               opens read-only. An expense row's Edit, below, opens the
               expense dialog the same way (system_3 #10695). -->
          <AspButton variant="ghost" size="sm" class="manual-delete" data-test="payment-edit" @click="openEdit(row.payment)">Edit</AspButton>
        </template>
        <AspButton v-else-if="row.expense" variant="ghost" size="sm" class="manual-delete" data-test="expense-edit" @click="openExpenseEdit(row.expense)">Edit</AspButton>
      </template>
      <template #cell-category="{ row }">
        <div v-if="row.payment" class="cell-select">
          <AspSelect
            :model-value="row.payment.category"
            :options="categoryOptionsFor(row.payment)"
            :aria-label="`Category for ${row.transaction_id}`"
            :disabled="saving.has(row.key)"
            data-test="payment-category"
            @update:model-value="patch(row.payment, { category: $event })"
          />
          <span v-if="isPayPalTransferIntoN26(row.payment)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
        </div>
        <span v-else data-test="row-category">{{ row.categoryLabel }}</span>
      </template>
      <template #cell-client_id="{ row }">
        <div v-if="row.payment" class="cell-select">
          <AspSelect
            :model-value="row.payment.client_id ?? 0"
            searchable
            :options="clientOptions"
            :aria-label="`Client for ${row.transaction_id}`"
            :title="optionLabel(clientOptions, row.payment.client_id ?? 0)"
            :disabled="saving.has(row.key)"
            data-test="payment-client"
            @update:model-value="patch(row.payment, { client_id: $event || null })"
          />
          <span v-if="row.invoice" class="muted invoice-line" data-test="row-invoice">{{ row.invoice }}</span>
        </div>
      </template>
      <!-- §3.140 Decision 2: money in in body ink, money out in red with a
           minus sign, so colour is never the only signal. -->
      <template #cell-amount="{ row }">
        <span class="nowrap amount" :class="row.direction === 'in' ? 'in-amount' : 'out-amount'" data-test="row-amount">{{ signedAmount(row) }}</span>
      </template>
    </AspDataTable>
    <!-- Absent at zero (§3.133 Decision 5). -->
    <AspButton v-if="removedCount" variant="ghost" class="removed-show" data-test="removed-show" @click="openRemoved('all')">
      Show {{ removedCount }} removed row{{ removedCount === 1 ? '' : 's' }}
    </AspButton>
    </template>
    <p v-if="rowError" class="error" role="alert" data-test="payment-error">{{ rowError }}</p>

    <ManualPaymentDialog
      v-model:open="manualOpen"
      :clients="clients"
      @changed="$emit('changed')"
      @saved="onManualSaved"
    />
    <!-- The same dialog edits a payment (§3.143 Decision 5, system_3 #10694). -->
    <ManualPaymentDialog v-model:open="editOpen" :payment="editPayment" :clients="clients" @changed="$emit('changed')" />
    <ManualExpenseDialog
      v-model:open="expenseOpen"
      :categories="expenseCategories"
      @changed="onExpenseSaved"
      @category-added="expenseCategories = [...expenseCategories, $event]"
    />
    <!-- The same dialog edits an expense (§3.143 Decision 5, system_3 #10695). -->
    <ManualExpenseDialog
      v-model:open="expenseEditOpen"
      :expense="editExpense"
      :categories="expenseCategories"
      @changed="$emit('changed')"
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
  import { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSegmented, AspSelect } from '@aspirant/design-system';
  import ManualExpenseDialog from './ManualExpenseDialog.vue';
  import ManualPaymentDialog from './ManualPaymentDialog.vue';
  import N26ImportDialog from './N26ImportDialog.vue';
  import RemovedRows from './RemovedRows.vue';
  import PayPalExpensesDialog from './PayPalExpensesDialog.vue';
  import PayersDialog from './PayersDialog.vue';
  import {
    CATEGORY_LABELS,
    METHOD_LABELS,
    N26_MAX_FILES,
    SKIP_REASON_LABELS,
    copyKeptSentence,
    countPrior,
    errorOf,
    formatDay,
    formatMoney,
    importPayPalCSV,
    listExpenseCategories,
    listPayerCandidates,
    payersSavedLine,
    parseN26PDFs,
    patchExpense,
    patchPayment,
    listRemovedExpenses,
    listRemovedPayments,
    removeExpenses,
    removePayments,
    createDraft,
  } from './api.js';
  import { transactionRows } from './ledgerRows.js';

  // "2 of 5 kept their category: 2026-08-12 €40.00, 2026-08-14 €25.00 (on an
  // issued invoice; cancel it first)." One shared reason closes the line;
  // mixed reasons follow each row.
  // `row` is a Transactions row (ledgerRows.js), of either direction.
  function bulkFailureLine(failed, total) {
    const k = failed.length;
    const head = `${k} of ${total} kept ${k === 1 ? 'its' : 'their'} category: `;
    const name = (f) => `${formatDay(f.row.paid_on)} ${formatMoney(f.row.amount_cents, f.row.currency)}`;
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
    components: { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSegmented, AspSelect, ManualExpenseDialog, ManualPaymentDialog, N26ImportDialog, PayPalExpensesDialog, PayersDialog, RemovedRows },
    props: {
      payments: { type: Array, required: true },
      // Money out, in the same list (§3.143 Decision 3, system_3 #10630).
      expenses: { type: Array, default: () => [] },
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
        direction: 'all',
        directionOptions: [
          { value: 'all', label: 'All' },
          { value: 'in', label: 'In' },
          { value: 'out', label: 'Out' },
        ],
        categoryFilter: 'all',
        saving: new Set(),
        rowError: '',
        narrow: false,
        // Row keys (`p<id>` / `e<id>`, ledgerRows.js), never bare ids:
        // payment and expense ids share one number space (security c66333
        // on system_3 #10630, carried to #10631 in c66336).
        selected: [],
        confirmingRemove: false,
        removing: false,
        expenseCategoriesRequested: false,
        bulkSaving: false,
        bulkError: '',
        creating: false,
        createError: '',
        manualOpen: false,
        editOpen: false,
        editPayment: null,
        expenseEditOpen: false,
        editExpense: null,
        expenseOpen: false,
        expenseCategories: [],
        manualSummary: null,
        n26Parsing: false,
        n26Open: false,
        // The removed view (§3.143 Decision 6, system_3 #10633).
        removedPayments: [],
        removedExpenses: [],
        removedOpen: false,
        removedDirection: 'all',
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
        // What the PayPal expense confirm counted as removed or deleted
        // earlier: { removed, deleted } (server PR 196).
        paypalExpensePrior: { removed: 0, deleted: 0 },
        columns: [
          { key: 'select', label: '', sortable: false, width: '2.5rem' },
          { key: 'paid_on', label: 'Date' },
          { key: 'who', label: 'Who and what for', sortable: false },
          // Width measured at 1280 with the sidebar open, where the table has
          // 968px (#8407): the cell pads 12px a side and a table-cell trigger
          // ~32px, so 10.25rem shows "Uncategorised" (106px of text) whole.
          // Longer values end in an ellipsis with the whole label as the
          // trigger's title.
          { key: 'category', label: 'Category', sortable: false, width: '10.25rem' },
          { key: 'client_id', label: 'Client', sortable: false, width: '10.25rem' },
          // Last, as the row reads (§3.143 Decision 3).
          { key: 'amount', label: 'Amount', align: 'right', sortable: false },
        ],
      };
    },
    computed: {
      // Only rows the server marks removed: a list read without the removed
      // flag counts zero, whatever answered it.
      removedCount() {
        return this.removedPayments.length + this.removedExpenses.length;
      },
      // The PayPal line's counts of payments matching a record ze removed or
      // deleted for good (§3.143 Decision 6, design_agent c66225). Server
      // `duplicates` includes them, so "already imported" leaves them out.
      // Payments only: the file's outgoing rows are already counted as
      // skipped, so counting them here too would break the line's sum
      // (§3.130; #10634 dogfood, c66307). They are counted on the expense
      // sentence instead (paypalExpenses).
      paypalPrior() {
        const s = this.summary || {};
        return {
          already: Math.max(0, (s.duplicates || 0) - (s.removed_earlier || 0) - (s.deleted_earlier || 0)),
          removed: s.removed_earlier || 0,
          deleted: s.deleted_earlier || 0,
        };
      },
      // The expense sentence's counts: expenses added, and outgoing rows
      // matching an expense ze removed or deleted for good, from the
      // review's flags plus any its confirm met (c66307).
      paypalExpenses() {
        const exp = countPrior(this.paypalExpenseCandidates);
        return {
          added: this.paypalExpensesAdded,
          removed: exp.removed + this.paypalExpensePrior.removed,
          deleted: exp.deleted + this.paypalExpensePrior.deleted,
        };
      },
      n26Expenses() {
        const s = this.n26Summary || {};
        return {
          added: s.expenses_added || 0,
          removed: s.expenses_removed_earlier || 0,
          deleted: s.expenses_deleted_earlier || 0,
        };
      },
      incoming() {
        return this.payments.filter((p) => p.kind === 'incoming');
      },
      // Both directions in one list, newest first (§3.143 Decision 3).
      rows() {
        return transactionRows(this.incoming, this.expenses);
      },
      shown() {
        return this.rows.filter(
          (r) =>
            (this.direction === 'all' || r.direction === this.direction) &&
            (this.categoryFilter === 'all' || r.category === this.categoryFilter),
        );
      },
      categoryOptions() {
        return Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
      },
      // The category select's options follow the direction: income
      // categories, expense categories, or both (§3.143 Decision 3). Under
      // All they sit in two AspSelect groups, In then Out, with bare labels:
      // "Other" is both an income and an expense category, and the group
      // names its side (design_agent c66290 on system_3 #10630). "All
      // categories" stays a plain option above both groups, so ze always has
      // a way back to every row (c66693 on #10702). Under In or Out the list
      // is flat. Expense categories are the ones zir rows carry: the panel
      // makes no categories request until the expense dialog opens
      // (invoicing.spec, invoicing-n26.spec). Values carry the direction too,
      // so a filter never matches the other side.
      filterOptions() {
        const income = this.categoryOptions.map((o) => ({ value: `in:${o.value}`, label: o.label }));
        const names = [...new Set(this.expenses.map((e) => e.category))].sort((x, y) => x.localeCompare(y));
        const expense = names.map((n) => ({ value: `out:${n}`, label: n }));
        const all = { value: 'all', label: 'All categories' };
        if (this.direction === 'in') return [all, ...income];
        if (this.direction === 'out') return [all, ...expense];
        const groups = [{ group: 'In', options: income }];
        if (expense.length) groups.push({ group: 'Out', options: expense });
        return [all, ...groups];
      },
      clientOptions() {
        return [{ value: 0, label: 'No client' }, ...this.clients.map((c) => ({ value: c.id, label: c.name }))];
      },
      // A file that could not be read stays named after the dialog closes
      // (D2: a fold may hide detail, never a failure).
      // Transfers from PayPal the server left out of the N26 files (#9881).
      // "left out" is the rule; "skipped" stays zir own unticking (c61091).
      n26PayPalClause() {
        const n = (this.n26Summary && this.n26Summary.paypal_transfers) || 0;
        return n === 1
          ? '1 transfer from PayPal left out (its payments come in through PayPal)'
          : `${n} transfers from PayPal left out (their payments come in through PayPal)`;
      },
      // Moves between zir own account and a Space that the server left out
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
      // The selected Transactions rows, in list order, by key.
      selectedRows() {
        return this.rows.filter((r) => this.selected.includes(r.key));
      },
      selectedPayments() {
        return this.selectedRows.filter((r) => r.direction === 'in');
      },
      selectedExpenses() {
        return this.selectedRows.filter((r) => r.direction === 'out');
      },
      // Money in and money out at once: Set category acts on one direction
      // at a time, because the two have different categories (§3.143
      // Decision 4).
      mixedSelection() {
        return this.selectedPayments.length > 0 && this.selectedExpenses.length > 0;
      },
      canSetCategory() {
        return this.selected.length > 0 && !this.mixedSelection;
      },
      // Money out offers zir expense categories: the server's list once
      // loaded, plus any zir rows carry, so a select opened before the list
      // arrives still offers the categories in view.
      setCategoryOptions() {
        if (!this.selectedExpenses.length) return this.categoryOptions;
        const names = new Set([...this.expenseCategories.map((c) => c.name), ...this.expenses.map((e) => e.category)]);
        return [...names].filter(Boolean).sort((x, y) => x.localeCompare(y)).map((n) => ({ value: n, label: n }));
      },
      // Not invoiceable: money out, or money in not marked Paid work.
      notPaidWork() {
        return this.selectedRows.filter((r) => r.direction === 'out' || r.payment.category !== 'paid_work').length;
      },
      canCreate() {
        return this.selected.length > 0 && this.notPaidWork === 0;
      },
      // Why Create invoice cannot act, in terms the owner can fix from the
      // panel (§3.114); it never quietly invoices the Paid work subset (D13).
      createCaption() {
        const n = this.selected.length;
        if (n === 0) return 'Select rows to set their category or remove them, or Paid work payments to create an invoice.';
        const k = this.notPaidWork;
        if (k === 0) return '';
        return `${k} of the ${n} selected ${k === 1 ? 'is' : 'are'} not Paid work. Only Paid work can be invoiced.`;
      },
      // The count in the trigger is what makes a one-pick bulk write safe
      // without a confirm step (design_agent c60951 rule 4).
      setCategoryPlaceholder() {
        const n = this.selected.length;
        return n ? `Set category of ${n} selected` : 'Set category of selected rows';
      },
      // "Remove (N)", armed "Remove N rows" (§3.143 Decision 4).
      removeLabel() {
        const n = this.selected.length;
        if (this.confirmingRemove) return `Remove ${n} row${n === 1 ? '' : 's'}`;
        return n ? `Remove (${n})` : 'Remove';
      },
      // What else an armed Remove does: a payment on a draft comes off it,
      // as the server does on remove (aspirant-server invoicing_remove.go).
      removeConsequence() {
        const k = this.selectedPayments.filter((r) => r.payment.invoice && r.payment.invoice.status === 'draft').length;
        if (!k) return '';
        if (this.selected.length === 1) return 'It is also taken off its draft invoice.';
        if (k === this.selected.length) return 'They are also taken off their draft invoices.';
        return `${k} of them ${k === 1 ? 'is' : 'are'} also taken off ${k === 1 ? 'its draft invoice' : 'their draft invoices'}.`;
      },
      // The shown rows a checkbox can act on: not on an issued invoice
      // (§3.129 Decisions 4 and 6, design_agent c62100 on #10010).
      selectableShown() {
        return this.shown.filter((r) => this.selectable(r));
      },
      allShownSelected() {
        return this.selectableShown.length > 0 && this.selectableShown.every((r) => this.selected.includes(r.key));
      },
      someShownSelected() {
        return !this.allShownSelected && this.selectableShown.some((r) => this.selected.includes(r.key));
      },
      skippedReasons() {
        const reasons = (this.summary && this.summary.skipped_reasons) || {};
        return Object.entries(reasons).map(([key, count]) => ({ key, count, label: SKIP_REASON_LABELS[key] || key }));
      },
    },
    watch: {
      // Every refetch of the lists (a save, an import, a restore) re-reads
      // the removed rows too, so the count and the view stay true.
      payments() {
        this.loadRemoved();
      },
      expenses() {
        this.loadRemoved();
      },
      // The selection never holds a row the owner cannot see (§3.25): a
      // filter change or a reload unselects rows that left the view.
      shown(rows) {
        const visible = new Set(rows.filter((r) => this.selectable(r)).map((r) => r.key));
        const kept = this.selected.filter((key) => visible.has(key));
        if (kept.length !== this.selected.length) this.selected = kept;
      },
      // An armed Remove names a count; any change to the selection disarms
      // it, so the second press always removes what the label said.
      selected() {
        this.confirmingRemove = false;
      },
      // Set category's money-out options: zir full expense category list,
      // asked for once, the first time the selection holds money out. Never
      // with the panel, so an import makes no categories request
      // (invoicing.spec, invoicing-n26.spec).
      selectedExpenses(rows) {
        if (rows.length && !this.expenseCategoriesRequested) {
          this.expenseCategoriesRequested = true;
          this.loadExpenseCategories();
        }
      },
      // A category the new direction does not offer falls back to all.
      filterOptions(options) {
        const flat = options.flatMap((o) => o.options || [o]);
        if (!flat.some((o) => o.value === this.categoryFilter && !o.disabled)) this.categoryFilter = 'all';
      },
    },
    mounted() {
      this.loadRemoved();
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
      // The removed rows for the count, the ghost and the view. A failed read
      // shows no ghost and leaves the list as it is.
      async loadRemoved() {
        const [p, e] = await Promise.allSettled([listRemovedPayments(), listRemovedExpenses()]);
        this.removedPayments = p.status === 'fulfilled' ? p.value.filter((r) => r.removed_at) : [];
        this.removedExpenses = e.status === 'fulfilled' ? e.value.filter((r) => r.removed_at) : [];
        if (this.removedOpen && !this.removedCount) this.removedOpen = false;
      },
      // From the ghost ('all'), a payment clause on an import line ('in') or
      // an expense clause ('out'; c66316 on system_3 #10633).
      openRemoved(direction) {
        this.removedDirection = direction;
        this.removedOpen = true;
      },
      formatDay,
      formatMoney,
      payersSavedLine,
      // The import line's clauses for rows matching a removed or a deleted
      // record (design_agent c66225). Printed only when non-zero. "restore it
      // on Transactions" becomes the link to the removed view when that view
      // ships (system_3 #10633); a deleted row can never come back, so its
      // clause has nothing to link to.
      removedClause(n) {
        return `${n} removed earlier: restore it on Transactions`;
      },
      deletedClause(n) {
        return `${n} deleted earlier`;
      },
      // The expense sentence, zero parts left out: "1 expense added to your
      // book · 1 removed earlier: restore it on Transactions · 1 deleted
      // earlier". With none added it opens "Expenses:" instead, so no zero
      // is printed (c66307).
      expenseParts({ added, removed, deleted }) {
        const parts = [];
        if (added) parts.push({ key: 'added', text: `${added} expense${added === 1 ? '' : 's'} added to your book` });
        if (removed) parts.push({ key: 'removed', count: removed, text: this.removedClause(removed) });
        if (deleted) parts.push({ key: 'deleted', text: this.deletedClause(deleted) });
        return parts;
      },
      methodLabel(row) {
        return METHOD_LABELS[row.method] || row.method;
      },
      // "By hand" is on the date line; this line adds how and the reference.
      manualLine(p) {
        return p.reference ? `${this.methodLabel(p)} · ${p.reference}` : this.methodLabel(p);
      },
      // §3.140 Decision 2: money out carries a minus sign as well as its ink.
      signedAmount(row) {
        const amount = formatMoney(row.amount_cents, row.currency);
        return row.direction === 'out' ? `-${amount}` : amount;
      },
      // A checkbox acts on any expense, and on a payment no issued invoice
      // covers (§3.129 Decisions 4 and 6, §3.143 Decision 4): every action
      // on the selection would be refused for an issued invoice's payment.
      selectable(row) {
        return row.direction === 'out' || !row.payment.on_issued_invoice;
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
      openEdit(payment) {
        this.editPayment = payment;
        this.editOpen = true;
      },
      async openExpenseEdit(expense) {
        this.editExpense = expense;
        this.expenseEditOpen = true;
        await this.loadExpenseCategories();
      },
      // A phone card's body opens its row's dialog (§3.143 Decision 5); its
      // own controls (checkbox, selects, buttons) keep their own job.
      onCardTap(row, event) {
        if (!row.payment && !row.expense) return;
        if (event.target.closest('button, input, select, label, a, [role="combobox"], [role="listbox"], [role="option"], .select')) return;
        if (row.payment) this.openEdit(row.payment);
        else this.openExpenseEdit(row.expense);
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
        this.paypalExpensePrior = {
          removed: (result && result.removed_earlier) || 0,
          deleted: (result && result.deleted_earlier) || 0,
        };
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
        await this.loadExpenseCategories();
      },
      async loadExpenseCategories() {
        try {
          this.expenseCategories = await listExpenseCategories();
        } catch {
          // The dialog's category select is empty, and Set category offers
          // the categories zir rows carry; the server still refuses an
          // unknown category, so nothing wrong can be stored.
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
        this.paypalExpensePrior = { removed: 0, deleted: 0 };
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
      toggle(key, on) {
        this.selected = on ? [...new Set([...this.selected, key])] : this.selected.filter((x) => x !== key);
      },
      selectAllShown(on) {
        const keys = this.selectableShown.map((r) => r.key);
        this.selected = on ? [...new Set([...this.selected, ...keys])] : this.selected.filter((key) => !keys.includes(key));
      },
      // Set one category on every selected row, all of one direction: one
      // PATCH per row, in list order, to the payment or the expense the row
      // is. Rows that succeed leave the selection; rows the server refuses
      // stay selected and are named in one alert that stays until the next
      // bulk action (design_agent c60951 rule 5, D2).
      async setCategory(category) {
        if (!category || !this.canSetCategory || this.bulkSaving) return;
        const rows = this.selectableShown.filter((r) => this.selected.includes(r.key));
        this.bulkSaving = true;
        this.bulkError = '';
        const failed = [];
        for (const row of rows) {
          this.saving = new Set([...this.saving, row.key]);
          try {
            if (row.direction === 'out') await patchExpense(row.id, { category });
            else await patchPayment(row.id, { category });
          } catch (err) {
            const failure = errorOf(err);
            const reason = failure.code === 'payment_on_issued_invoice' ? 'on an issued invoice; cancel it first' : failure.message;
            failed.push({ row, reason });
          } finally {
            const next = new Set(this.saving);
            next.delete(row.key);
            this.saving = next;
          }
        }
        this.selected = failed.map((f) => f.row.key);
        if (failed.length) this.bulkError = bulkFailureLine(failed, rows.length);
        this.bulkSaving = false;
        this.$emit('changed');
      },
      // Remove the selection, a mistaken upload taken out in one go (§3.143
      // Decision 4). The first press arms; the second sends one
      // all-or-nothing request per table, payments first. A refused payment
      // request removes nothing, and the expenses are not sent. If the
      // expenses are refused after the payments went, the alert says which
      // part was removed, and the expenses stay selected.
      async removeSelected() {
        if (this.selected.length === 0 || this.removing) return;
        if (!this.confirmingRemove) {
          this.confirmingRemove = true;
          return;
        }
        const paymentIds = this.selectedPayments.map((r) => r.id);
        const expenseIds = this.selectedExpenses.map((r) => r.id);
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        this.removing = true;
        this.bulkError = '';
        let paymentsRemoved = false;
        try {
          if (paymentIds.length) {
            await removePayments(paymentIds);
            paymentsRemoved = true;
          }
          if (expenseIds.length) await removeExpenses(expenseIds);
          this.selected = [];
        } catch (err) {
          const reason = errorOf(err).message;
          if (paymentsRemoved) {
            this.selected = this.selectedExpenses.map((r) => r.key);
            this.bulkError = `${plural(paymentIds.length, 'payment')} removed; ${plural(expenseIds.length, 'expense')} kept: ${reason}`;
          } else {
            this.bulkError = `Nothing was removed: ${reason}`;
          }
        } finally {
          this.removing = false;
          this.confirmingRemove = false;
          this.$emit('changed');
        }
      },
      // Create invoice acts only when every selected row is Paid work money
      // in; the server is still the rule (it refuses any other category, and
      // a payment already invoiced).
      async createInvoice() {
        this.creating = true;
        this.createError = '';
        try {
          // In the order ze selected them: the draft's lines follow it.
          const ids = this.selected.filter((key) => key.startsWith('p')).map((key) => Number(key.slice(1)));
          const detail = await createDraft(ids);
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
        this.saving = new Set([...this.saving, `p${row.id}`]);
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
          next.delete(`p${row.id}`);
          this.saving = next;
        }
      },
    },
  };
</script>

<style scoped>
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

  /* The one-row state never wraps: the container query below guarantees its
     780px, and WebKit's subpixel sum wraps the fourth button at exactly
     780px if wrapping is allowed (measured on system_3 #10627). */
  .ways-in {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  /* Three states, keyed on the head row's width, never the viewport (design_agent
     c66159 on system_3 #10627, refining c61923 for four buttons; §3.135
     Decisions 1 and 2). One row when the four fit: 202 + 202 + 178 + 162 +
     3 × 12 = 780px = 48.75rem. Below that, a 2×2 of equal columns, the pairs
     by hand then from a file, in DOM order: two columns as wide as the widest
     button plus the gap, 202 + 12 + 202 = 416px = 26rem. Below 26rem all four
     stack full width, as on a phone. In rem, so it moves with zir text size;
     the spec sweeps it and fails on any partial row. */
  @container ways-in (width < 48.75rem) {
    .ways-in {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
    }

    .ways-in .block-on-phone {
      width: 100%;
    }
  }

  @container ways-in (width < 26rem) {
    .ways-in {
      grid-template-columns: 1fr;
      /* The stacked state alone takes an 8px gap, so the first payment card
         stays on a 390×844 phone's first screen with four ways in
         (design_agent c66182 on system_3 #10627). One row and the 2×2 keep
         12px. */
      gap: var(--space-xs);
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

  .removed-show {
    align-self: flex-start;
    margin-top: var(--space-sm);
  }

  /* The import line's "restore it on Transactions": a link in the dark
     card's own ink (§3.18, §3.121), opening the removed view (D14). */
  .summary__link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-on-dark);
    text-decoration: underline;
    cursor: pointer;
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

  /* The direction strip, then the category select (§3.143 Decision 3). */
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .filter {
    width: 16rem;
  }

  /* A long category ("Out · materials and supplies") ends in an ellipsis in
     the trigger; the open panel shows it whole. */
  .filter :deep(.select__trigger) {
    min-width: 0;
  }

  .filter :deep(.select__value) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* Wide enough for its longest label on one line (operator c61550: no
     wrapping in these buttons, system_3 #9968): "Set category of selected
     payments" measured 281px at the desktop text size and 314px below 768px,
     where option text is --text-base, and today's "… selected rows" is
     shorter. A fixed width in rem fits both, so picking rows does not shift
     the row and it grows with zir text size. */
  .set-category {
    width: 20rem;
  }

  /* Keyed on the toolbar's width, never the viewport, like the ways in: the
     sidebar at 768 leaves the panel 504px (system_3 #10631). One row while
     the widest state fits: Set category 320 + the armed "Remove 12 rows" ~130
     + "Create invoice from 12 payments" ~230 + 2 × 12 = 704px = 44rem.
     Below that, Set category takes its own full-width row and Remove and
     Create invoice sit under it on the right, so the row never scrolls
     sideways and the primary stays rightmost. */
  .toolbar {
    container: selection-bar / inline-size;
  }

  @container selection-bar (width < 44rem) {
    .create {
      width: 100%;
    }

    .create__actions {
      flex-wrap: wrap;
      justify-content: flex-end;
      width: 100%;
    }

    .set-category {
      width: 100%;
    }
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

  /* A payment card's body opens its edit dialog (§3.143 Decision 5). */
  .payment-card--tap {
    cursor: pointer;
  }

  .payment-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .payment-card__who {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }

  .amount {
    font-variant-numeric: tabular-nums;
  }

  /* §3.140 Decision 2: money in in body ink, money out in the error text red
     with a minus sign, the bookkeeping convention, not an alarm. */
  .in-amount {
    color: var(--text-body);
  }

  .out-amount {
    color: var(--feedback-error-text);
  }

  .invoice-line {
    margin-top: var(--space-2xs);
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

    /* On a phone the direction strip and the category select share one row,
       so the first card stays on a 390×844 first screen (design_agent c66182
       on system_3 #10627). */
    .filters {
      flex-wrap: nowrap;
    }

    .filters .filter {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
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
