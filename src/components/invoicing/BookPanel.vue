<template>
  <section class="book-panel" data-test="book-panel">
    <!-- No head row: the Book has no ways in ("Enter expense by hand" sits
         on Transactions, §3.143 Decision 2), and its one export is the last
         part of the tab (§3.159 Decisions 1 and 2, system_3 #11500). -->
    <h2 class="visually-hidden">Book</h2>

    <p v-if="rowError" class="error" role="alert" data-test="book-error">{{ rowError }}</p>
    <p v-if="bookError" class="error" role="alert" data-test="book-selection-error">{{ bookError }}</p>

    <!-- §3.143 Decision 8: what counts, said first, then where to change it. -->
    <section v-if="book" class="counting" aria-label="What the Book counts" data-test="book-counting">
      <p class="muted counting__line">
        <span data-test="book-counting-line">{{ sentence }}</span>
        <template v-if="uncountedUncategorised">
          {{ ' ' }}<span data-test="book-uncategorised">{{ uncategorisedSentence }}</span>
          {{ ' ' }}<AspButton variant="ghost" size="sm" data-test="book-review-uncategorised" @click="$emit('review-uncategorised')">Review them</AspButton>
        </template>
      </p>
      <details class="change" data-test="book-change" @toggle="onChangeToggle">
        <summary class="fold-summary" data-test="book-change-summary">Change what counts</summary>
        <div class="change__body">
          <div class="change__preset full-select">
            <AspSelect
              :model-value="selection.preset"
              :options="presetOptions"
              label="Preset"
              :disabled="saving"
              data-test="book-preset"
              @update:model-value="choosePreset"
            />
          </div>
          <fieldset class="ticks" data-test="book-ticks-in">
            <legend>Money in</legend>
            <AspCheckbox
              v-for="c in incomeChoices"
              :key="c.value"
              :label="c.label"
              :model-value="selection.income.includes(c.value)"
              :disabled="ticksLocked"
              :data-test="`book-tick-in-${c.value}`"
              @update:model-value="tickIncome(c.value, $event)"
            />
          </fieldset>
          <fieldset class="ticks" data-test="book-ticks-out">
            <legend>Money out</legend>
            <AspCheckbox
              v-for="n in expenseChoices"
              :key="n"
              :label="n"
              :model-value="selection.expense_all || selection.expense.includes(n)"
              :disabled="ticksLocked"
              data-test="book-tick-out"
              :data-category="n"
              @update:model-value="tickExpense(n, $event)"
            />
            <p v-if="categoriesError" class="error" role="alert">{{ categoriesError }}</p>
            <p class="muted ticks__note">Private expenses never count.</p>
          </fieldset>
          <div class="change__actions">
            <AspButton variant="secondary" size="sm" :disabled="ticksLocked" data-test="book-save-preset" @click="openSavePreset">Save as preset…</AspButton>
            <!-- Shown for zir own preset; there is nothing to update until a tick changes. -->
            <AspButton
              v-if="ownPreset"
              variant="secondary"
              size="sm"
              :disabled="ticksLocked || !selection.changed"
              data-test="book-update-preset"
              @click="updatePreset"
            >
              Update “{{ ownPreset.name }}”
            </AspButton>
            <!-- Arms first, as Remove does (§3.143 Decision 8). Work only has none. -->
            <AspButton v-if="ownPreset" variant="ghost" size="sm" :disabled="saving" data-test="book-delete-preset" @click="deletePreset">
              {{ confirmingDelete ? `Delete “${ownPreset.name}”` : 'Delete preset' }}
            </AspButton>
          </div>
          <p v-if="selectionError" class="error" role="alert" data-test="book-selection-write-error">{{ selectionError }}</p>
        </div>
      </details>
    </section>

    <AspEmptyState
      v-if="book && rows.length === 0"
      heading="Nothing counted yet"
      message="Payments and expenses in the categories you count appear here, by month."
      data-test="book-empty"
    />

    <template v-else-if="book">
      <!-- The period line heads the months (UX walk AM6, system_3 #11023):
           "what did I earn this quarter, and this year?" was three month sums
           added by hand, or the CSV. Same counted rows, same sum, same inks
           as a month head. A period sum, not the running total report 886 §2
           rules out. -->
      <section class="period" aria-label="This quarter and the year so far" data-test="book-period">
        <p v-for="p in periods" :key="p.key" class="period__line" :data-test="`book-period-${p.key}`">
          <span class="period__label">{{ p.label }}</span>
          <span class="month__totals">
            <span class="in-amount">In {{ formatMoney(p.inCents) }}</span>
            <span class="out-amount">Out {{ formatMoney(p.outCents) }}</span>
            <span class="result" :class="{ negative: p.resultCents < 0 }">Result {{ formatSignedMoney(p.resultCents) }}</span>
          </span>
        </p>
      </section>

      <!-- §3.145: months newest first, each a fold. The summary is the month
           line, so a folded month still shows its In, Out and Result
           (Decision 4: the month's totals are its glance, and never fold).
           A month with no entries is its head alone, saying so, with no fold
           to open (#11023). -->
      <template v-for="month in months" :key="month.key">
      <div v-if="month.empty" class="month month--empty" data-test="book-month-empty" :data-group="month.key">
        <div class="month__head month__head--empty">
          <h3 class="month__label">{{ month.label }}</h3>
          <span class="muted">No entries</span>
        </div>
      </div>
      <details
        v-else
        class="month"
        :open="openKeys.has(month.key)"
        data-test="book-month"
        :data-group="month.key"
        @toggle="onMonthToggle(month.key, $event)"
      >
        <summary class="fold-summary month__head" data-test="month-head">
          <h3 class="month__label">{{ month.label }}</h3>
          <span class="month__totals">
            <span class="in-amount">In {{ formatMoney(month.inCents) }}</span>
            <span class="out-amount">Out {{ formatMoney(month.outCents) }}</span>
            <span class="result" :class="{ negative: month.resultCents < 0 }">Result {{ formatSignedMoney(month.resultCents) }}</span>
          </span>
        </summary>

        <template v-if="narrow">
          <ul class="book-cards" aria-label="Book entries">
            <li
              v-for="row in month.rows"
              :key="row.key"
              class="book-card book-card--tap"
              data-test="book-row"
              :data-type="row.type"
              :data-row-key="row.key"
              @click="onCardTap(row, $event)"
            >
              <!-- The card's body is its button: its text, named for what it
                   opens, reachable by keyboard and announced by a screen
                   reader (system_3 #11661, design ruling c72063 on #11022).
                   Receipt follows it. -->
              <button type="button" class="card-body" :aria-label="cardBodyName(row)" data-test="card-body" @click="openEdit(row)">
              <div class="book-card__top">
                <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
                <strong class="nowrap amount" :class="row.type === 'in' ? 'in-amount' : 'out-amount'">
                  {{ row.type === 'in' ? formatMoney(row.amount_cents) : formatSignedMoney(-row.amount_cents) }}
                </strong>
              </div>
              <span class="description" data-test="book-row-description">
                <template v-if="row.who">{{ row.who }}</template>
                <template v-if="row.who && row.what"> · </template>
                <span v-if="row.what" :class="{ muted: !!row.who }">{{ row.what }}</span>
                <template v-if="!row.who && !row.what">—</template>
              </span>
              <!-- The card says at rest that it opens (system_3 #11022, UX walk AM5;
                 design ack c72063): the tab's own door word, muted, at the end
                 of a line the card already has, so no card grows. It is part of
                 the card's one tap, not a second door (§3.159 Decision 3); a
                 screen reader and a keyboard are #11661's. -->
              <span class="card-line">
                <span class="muted">{{ row.categoryLabel }}</span>
                <span class="muted card-door" aria-hidden="true" data-test="card-door">Edit</span>
              </span>
              </button>
              <div v-if="row.type === 'out'" class="book-card__expense-actions">
                <AspButton variant="ghost" size="sm" data-test="book-expense-receipt" @click="openReceipt(row)">
                  Receipt
                </AspButton>
              </div>
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
          :row-attrs="(row) => ({ 'data-test': 'book-row', 'data-type': row.type, 'data-row-key': row.key })"
        >
          <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
          <template #cell-description="{ row }">
            <span class="description" data-test="book-row-description">
              <template v-if="row.who">{{ row.who }}</template>
              <template v-if="row.who && row.what"> · </template>
              <span v-if="row.what" :class="{ muted: !!row.who }">{{ row.what }}</span>
              <template v-if="!row.who && !row.what">—</template>
            </span>
          </template>
          <template #cell-category="{ row }"><span class="muted">{{ row.categoryLabel }}</span></template>
          <template #cell-in="{ row }">
            <span v-if="row.type === 'in'" class="nowrap in-amount">{{ formatMoney(row.amount_cents) }}</span>
          </template>
          <template #cell-out="{ row }">
            <span v-if="row.type === 'out'" class="nowrap out-amount">{{ formatSignedMoney(-row.amount_cents) }}</span>
          </template>
          <!-- The row's door, in the last column on every tab (§3.159
               Decision 3, system_3 #11501; #11497 item 7, operator c70806 on
               #10985: "all the way to the right"). It opens the same edit
               dialog as on Transactions (§3.143 Decision 7, system_3 #10729);
               removing lives in the dialog. An expense's Receipt sits left
               of it, so the Out column holds the amount alone. -->
          <template #cell-actions="{ row }">
            <span class="row-actions">
              <AspButton v-if="row.type === 'out'" variant="secondary" size="sm" data-test="book-expense-receipt" @click="openReceipt(row)">Receipt</AspButton>
              <AspButton variant="secondary" size="sm" data-test="book-row-edit" @click="openEdit(row)">Edit</AspButton>
            </span>
          </template>
        </AspDataTable>
      </details>
      </template>

      <BookChart :payments="countedPayments" :expenses="countedExpenses" />
    </template>

    <!-- Export is the last part of every tab that exports, below the list and
         the chart, built like Invoices' and Clients' groups (§3.159 Decision
         2, system_3 #11500; operator c70816 on #10985: "the export
         functionality should consistently be found in the same place").
         Outside the branches above, so it renders with no book loaded and
         with nothing counted yet. The caption names the selection because the
         file's totals depend on it (§3.143 Decision 7). -->
    <section class="export-group" aria-labelledby="book-export-heading" data-test="book-export">
      <h3 id="book-export-heading">Export</h3>
      <div class="export">
        <!-- One month or the whole book (system_3 #11635, #11497 item 12;
             operator c70883 on #10985; design ack on #11635). It scopes the
             file and filters nothing on the page, so it sits with the file.
             "Paid in": the Book's one calendar is the day the money moved
             (§3.140 Decision 1). It scopes both files below it. -->
        <div class="export__month" :style="{ '--export-month-ch': `${exportMonthChars}ch` }">
          <AspSelect v-model="exportMonth" :options="exportMonthOptions" label="Paid in" data-test="book-report-month" />
        </div>
        <AspButton
          variant="secondary"
          class="export__button"
          :loading="reportDownloading"
          :aria-describedby="book ? 'book-report-caption' : undefined"
          data-test="book-report-csv"
          @click="downloadBookReport"
        >
          Bookkeeping report (CSV)
        </AspButton>
        <p v-if="book" id="book-report-caption" class="export__scope muted" data-test="book-report-caption">{{ reportCaption }}</p>
        <!-- The Book's entries as a PDF (system_3 #11512, #11497 item 13;
             operator c70883 on #10985; design ack on #11512). A second file
             with its own name, because it holds something else: the CSV is
             sums by category and month, this is the entries. It is made in
             the browser from what the tab holds, so it needs the Book to
             have loaded; until then the button is disabled and the caption
             is the reason (§3.114). -->
        <AspButton
          variant="secondary"
          class="export__button export__button--next"
          :loading="pdfDownloading"
          :disabled="!book"
          aria-describedby="book-pdf-caption"
          data-test="book-pdf"
          @click="downloadBookPdf"
        >
          {{ pdfButton }}
        </AspButton>
        <p id="book-pdf-caption" class="export__scope muted" data-test="book-pdf-caption">{{ pdfCaption }}</p>
      </div>
      <p v-if="reportError" class="error" role="alert" data-test="book-report-error">{{ reportError }}</p>
      <p v-if="pdfError" class="error" role="alert" data-test="book-pdf-error">{{ pdfError }}</p>
    </section>

    <!-- Every exit asks first when a name is typed (system_3 #11669,
         §3.166; A1's guard, unsentGuard.js). -->
    <AspModal :open="presetDialogOpen" size="sm" title="Save as preset" @update:open="onPresetOpenChange">
      <div :inert="unsentAsking || undefined">
        <AspInput v-model="presetName" label="Name" maxlength="60" data-test="book-preset-name" @keydown.enter.prevent="savePreset" />
        <p v-if="presetError" class="error" role="alert" data-test="book-preset-error">{{ presetError }}</p>
      </div>
      <template #footer>
        <UnsentAsk v-if="unsentAsking" @keep="keepEditing" @discard="discardUnsent" />
        <template v-else>
          <AspButton variant="secondary" type="button" :disabled="presetSaving" data-test="book-preset-cancel" @click="onPresetOpenChange(false)">Cancel</AspButton>
          <AspButton variant="primary" type="button" :loading="presetSaving" :disabled="!presetName.trim()" data-test="book-preset-confirm" @click="savePreset">Save</AspButton>
        </template>
      </template>
    </AspModal>

    <ExpenseReceiptDialog
      v-model:open="receiptOpen"
      :expense-id="receiptExpenseId"
      :expense-label="receiptExpenseLabel"
      @changed="onExpenseChanged"
    />
    <!-- The rows' edit dialogs, the same as Transactions' (§3.143 Decisions 5
         and 7, system_3 #10729). Save or Remove refetches the Book. -->
    <ManualPaymentDialog v-model:open="paymentEditOpen" :payment="editPayment" :clients="clients" @changed="changed" />
    <ManualExpenseDialog
      v-model:open="expenseEditOpen"
      :expense="editExpense"
      :categories="expenseCategories"
      @changed="changed"
      @category-added="expenseCategories = [...expenseCategories, $event]"
    />
  </section>
</template>

<script>
  import { AspButton, AspCheckbox, AspDataTable, AspEmptyState, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import BookChart from './BookChart.vue';
  import ExpenseReceiptDialog from './ExpenseReceiptDialog.vue';
  import ManualExpenseDialog from './ManualExpenseDialog.vue';
  import ManualPaymentDialog from './ManualPaymentDialog.vue';
  import UnsentAsk from './UnsentAsk.vue';
  import { unsentGuard } from './unsentGuard.js';
  import {
    CATEGORY_LABELS,
    bookReportCsvUrl,
    createBookPreset,
    deleteBookPreset,
    downloadBlob,
    errorOf,
    formatBerlinDay,
    formatDay,
    formatMoney,
    listExpenseCategories,
    putBookSelection,
    updateBookPreset,
  } from './api.js';
  import { expenseParts, newestFirst, paymentParts } from './ledgerRows.js';
  import { fillEmptyMonths, groupByMonth, landedRows, monthKey, monthLabel, openGroupKeys } from './listGroups.js';
  // Imported as KvittoMaker and the card generator import it. The app's
  // router loads those two with the first page, so the library is already
  // in the browser when the Book opens; importing it on the press would
  // save nothing.
  import pdfMake from 'pdfmake/build/pdfmake';
  import pdfFonts from 'pdfmake/build/vfs_fonts';
  import { BOOK_PDF_BUTTON, bookPdfCaption, bookPdfDoc, bookPdfFileName } from './bookPdf.js';
  import { INCOME_ORDER, WORK_ONLY, countableExpenseNames, countingSentence, countsInBook, selectionName } from './bookSelection.js';

  // The income-and-expenses book (system_3 #10414-C): payments and
  // hand-entered expenses merged into one dated list, grouped by month, with
  // a per-month In/Out/Result head line (design_agent ruling, report 886 §2,
  // c63777 on #10415 — no running total). "What it was for" is the note, the
  // same field the operator already reads that way on the Payments tab
  // (#9656 c63755), led by the counterparty where one is known (system_3
  // #10459): an imported row's note is the bank's booking text ("Pagamento
  // con carta"), which says nothing about who was paid. Income in the default
  // ink, expenses in red with a minus sign, so colour is never the only
  // signal (c63777).
  // In, Out and Result over a set of rows: one sum for a month head and for
  // the period line, so the two cannot add up differently.
  pdfMake.addVirtualFileSystem(pdfFonts);

  const uncategorisedText = (n) => (n === 1 ? '1 payment is still Uncategorised and not counted.' : `${n} payments are still Uncategorised and not counted.`);

  function totalsOf(rows) {
    let inCents = 0;
    let outCents = 0;
    for (const row of rows) {
      if (row.type === 'in') inCents += row.amount_cents;
      else outCents += row.amount_cents;
    }
    return { inCents, outCents, resultCents: inCents - outCents };
  }

  export default {
    name: 'BookPanel',
    components: { AspButton, AspCheckbox, AspDataTable, AspEmptyState, AspInput, AspModal, AspSelect, BookChart, ExpenseReceiptDialog, ManualExpenseDialog, ManualPaymentDialog, UnsentAsk },
    mixins: [unsentGuard],
    props: {
      payments: { type: Array, required: true },
      expenses: { type: Array, required: true },
      // The client book, for a hand payment's "Paid by" in its edit dialog.
      clients: { type: Array, default: () => [] },
      // What counts and zir presets, `{ selection, presets }` (§3.143
      // Decision 8); null while unread or when the read failed, and then the
      // Book counts nothing rather than guess.
      book: { type: Object, default: null },
      bookError: { type: String, default: '' },
    },
    emits: ['changed', 'book-changed', 'review-uncategorised'],
    data() {
      return {
        narrow: false,
        rowError: '',
        paymentEditOpen: false,
        editPayment: null,
        expenseEditOpen: false,
        editExpense: null,
        expenseCategories: [],
        reportDownloading: false,
        reportError: '',
        pdfDownloading: false,
        pdfError: '',
        pdfButton: BOOK_PDF_BUTTON,
        // The month the export is scoped to, "YYYY-MM", or '' for the whole
        // book. Not remembered between visits: an export scoped by a
        // forgotten choice would be a wrong file that looks right. It stays
        // after a download, so the same month can be exported again.
        exportMonth: '',
        receiptOpen: false,
        receiptExpenseId: null,
        receiptExpenseLabel: '',
        // "Change what counts": zir expense categories are read the first
        // time it opens, never with the panel.
        categoriesLoaded: false,
        categoriesError: '',
        saving: false,
        selectionError: '',
        confirmingDelete: false,
        presetDialogOpen: false,
        // Save as preset's own write. The panel's `saving` is shared with its
        // selection writes, so the dialog's busy test needs its own flag
        // (system_3 #11669).
        presetSaving: false,
        presetName: '',
        presetError: '',
        // Every column but the description has a width and the layout is
        // fixed, so the columns line up from one month's table to the next
        // (§3.145 Decision 6). "Out" is wider: it carries the Receipt button.
        columns: [
          { key: 'paid_on', label: 'Date paid', width: '7.5rem' },
          // The header Transactions uses for the same "{who} · {what}" cell
          // (§3.159 Decision 6, system_3 #11502). It read "What it was for"
          // while the cell led with who paid, which the operator took for the
          // wrong value in the column (c70806 on #10985).
          { key: 'description', label: 'Who and what for', sortable: false },
          { key: 'category', label: 'Category', sortable: false, width: '11rem' },
          { key: 'in', label: 'In', align: 'right', sortable: false, width: '7.5rem' },
          { key: 'out', label: 'Out', align: 'right', sortable: false, width: '7.5rem' },
          // The row's door and, for an expense, Receipt left of it (§3.159
          // Decision 3): the width Transactions gives the same column.
          { key: 'actions', label: '', sortable: false, align: 'right', width: '10rem' },
        ],
        // Months ze opened or closed this visit, by key; a month not in here
        // takes the default. Kept through a refetch, never stored (§3.145
        // Decision 3).
        openGroups: {},
        // Where each row was (key -> month) when the Book last reported a
        // change of its own; the reload that follows is compared against
        // it. Null until then.
        revealFrom: null,
        revealCount: 0,
      };
    },
    computed: {
      // The guard follows `open` (unsentGuard.js); here that is Save as
      // preset's, the panel's one guarded dialog (system_3 #11669).
      open() {
        return this.presetDialogOpen;
      },
      unsentBusy() {
        return this.presetSaving;
      },
      selection() {
        return this.book ? this.book.selection : null;
      },
      presets() {
        return this.book ? this.book.presets : [];
      },
      name() {
        return selectionName(this.selection, this.presets);
      },
      sentence() {
        return countingSentence(this.selection, this.presets, CATEGORY_LABELS);
      },
      // §3.143 Decision 7: only what the selection counts. Removed rows never
      // reach these lists (the server leaves them out).
      countedPayments() {
        if (!this.selection) return [];
        return this.payments.filter((p) => countsInBook(this.selection, { direction: 'in', category: p.category, kind: p.kind }));
      },
      countedExpenses() {
        if (!this.selection) return [];
        return this.expenses.filter((e) => countsInBook(this.selection, { direction: 'out', category: e.category }));
      },
      uncountedUncategorised() {
        if (!this.selection || this.selection.income.includes('uncategorised')) return 0;
        return this.payments.filter((p) => p.kind === 'incoming' && p.category === 'uncategorised').length;
      },
      uncategorisedSentence() {
        return uncategorisedText(this.uncountedUncategorised);
      },
      // The active preset reads "(changed)" once a tick differs from it; a
      // selection whose preset was deleted reads "Custom".
      presetOptions() {
        const options = this.presets.map((p) => ({
          value: p.id,
          label: p.id === this.selection.preset && this.selection.changed ? `${p.name} (changed)` : p.name,
        }));
        if (!this.presets.some((p) => p.id === this.selection.preset)) options.unshift({ value: this.selection.preset, label: 'Custom', disabled: true });
        return options;
      },
      // A tick before zir categories are read would turn "every expense" into
      // none, so the ticks wait for them.
      ticksLocked() {
        return this.saving || !this.categoriesLoaded;
      },
      ownPreset() {
        const p = this.presets.find((x) => x.id === this.selection.preset);
        return p && !p.builtin ? p : null;
      },
      incomeChoices() {
        return INCOME_ORDER.map((value) => ({ value, label: CATEGORY_LABELS[value] || value }));
      },
      // Zir expense categories, without Private (never offered). Any category
      // the selection already names is listed too, so no tick is hidden.
      expenseChoices() {
        const names = new Set(countableExpenseNames(this.expenseCategories));
        if (this.selection) for (const n of this.selection.expense) names.add(n);
        return [...names].sort((a, b) => a.localeCompare(b));
      },
      rows() {
        const income = this.countedPayments
          .filter((p) => p.kind === 'incoming')
          .map((p) => ({
            key: `p${p.id}`,
            id: p.id,
            type: 'in',
            direction: 'in',
            paid_on: p.paid_on,
            created_at: p.created_at,
            ...paymentParts(p),
            categoryLabel: CATEGORY_LABELS[p.category] || p.category,
            amount_cents: p.gross_cents,
            payment: p,
          }));
        const outgoing = this.countedExpenses.map((e) => ({
          key: `e${e.id}`,
          id: e.id,
          type: 'out',
          direction: 'out',
          paid_on: e.paid_on,
          created_at: e.created_at,
          // Who and what, named as on Transactions (ledgerRows.js).
          ...expenseParts(e),
          categoryLabel: e.category,
          amount_cents: e.amount_cents,
          expense: e,
        }));
        // Newest day first, and on one day the row entered last first: the
        // order Transactions uses (§3.145 Decision 1).
        return [...income, ...outgoing].sort(newestFirst);
      },
      // By the month the money moved (§3.140 Decision 1), newest month first
      // (§3.145 Decision 1), each with its totals.
      // A month with no entries, from the oldest month with any through this
      // month, is a group of its own saying so (UX walk AM6, system_3
      // #11023): a missing month reads as no data, an empty one is a zero.
      months() {
        const grouped = groupByMonth(this.rows, (r) => r.paid_on);
        return fillEmptyMonths(grouped, this.today.slice(0, 7)).map((g) => {
          const t = totalsOf(g.rows);
          return { ...g, ...t };
        });
      },
      // "All months", then every month the Book shows, newest first, named as
      // its month heads are. A month the Book marks "No entries" says so. A
      // chosen month the Book has stopped showing (what counts changed) stays
      // in the list, as the Invoices tab keeps its chosen month.
      exportMonthOptions() {
        const shown = this.months.map((m) => ({ key: m.key, label: m.label, empty: !!m.empty }));
        if (this.exportMonth && !shown.some((m) => m.key === this.exportMonth)) {
          shown.push({ key: this.exportMonth, label: monthLabel(this.exportMonth), empty: true });
          shown.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
        }
        return [{ value: '', label: 'All months' }, ...shown.map((m) => ({ value: m.key, label: m.empty ? `${m.label} · no entries` : m.label }))];
      },
      // The longest option's length, so the select is as wide as its longest
      // option and does not change width with the choice (the house face is
      // monospaced, so `ch` is exact).
      exportMonthChars() {
        return Math.max(...this.exportMonthOptions.map((o) => o.label.length));
      },
      // What the file will hold, said before the click (§3.132 Decision 7).
      // No count: the file is a grid of sums, not a list of entries.
      reportCaption() {
        if (!this.exportMonth) return `The entries counted with ${this.name}, by month and category`;
        const month = this.months.find((m) => m.key === this.exportMonth);
        const label = monthLabel(this.exportMonth);
        if (month && !month.empty) return `The entries counted with ${this.name} that were paid in ${label}, by category`;
        return `Nothing counted with ${this.name} was paid in ${label}. Every amount in the file is zero.`;
      },
      // The months the PDF holds: every month the Book shows, or the chosen
      // one. A chosen month the Book does not show is an empty month.
      pdfMonths() {
        if (!this.exportMonth) return this.months;
        const shown = this.months.find((m) => m.key === this.exportMonth);
        return [shown || { key: this.exportMonth, label: monthLabel(this.exportMonth), rows: [], empty: true, inCents: 0, outCents: 0, resultCents: 0 }];
      },
      pdfEntries() {
        return this.pdfMonths.reduce((n, m) => n + m.rows.length, 0);
      },
      pdfCaption() {
        return bookPdfCaption({
          loaded: !!this.book,
          entries: this.pdfEntries,
          selectionName: this.name,
          monthKey: this.exportMonth,
          monthLabel: this.exportMonth ? monthLabel(this.exportMonth) : '',
        });
      },
      // Open now: zir own choice, else the newest month WITH entries; a lone
      // month is open (§3.145 Decision 3, §3.17 R3). The Book has no filter.
      // An empty month does not fold (there is nothing in it), so it is left
      // out here; otherwise an empty current month would take the default
      // and fold the newest month that has something to show.
      openKeys() {
        const folding = this.months.filter((m) => !m.empty);
        const newest = folding.length ? folding[0].key : '';
        return openGroupKeys(folding, { chosen: this.openGroups, defaultOpen: (g) => g.key === newest });
      },
      // Today in zir calendar, "YYYY-MM-DD" (Berlin, as every day on the
      // page is read).
      today() {
        return formatBerlinDay(new Date().toISOString());
      },
      // The period line (UX walk AM6, system_3 #11023): this quarter and the
      // year, each so far, over the same counted rows as the months below.
      periods() {
        const year = this.today.slice(0, 4);
        const quarter = Math.floor((Number(this.today.slice(5, 7)) - 1) / 3);
        const sofar = this.rows.filter((r) => String(r.paid_on || '').slice(0, 10) <= this.today);
        const inYear = sofar.filter((r) => monthKey(r.paid_on).slice(0, 4) === year);
        const inQuarter = inYear.filter((r) => Math.floor((Number(monthKey(r.paid_on).slice(5, 7)) - 1) / 3) === quarter);
        return [
          { key: 'quarter', label: `This quarter, Q${quarter + 1} ${year}`, ...totalsOf(inQuarter) },
          { key: 'year', label: `Year to date, ${year}`, ...totalsOf(inYear) },
        ];
      },
    },
    watch: {
      // After a save from the Book's own dialogs, the month the row is in
      // now opens and the row is brought into view (§3.145 Decision 2).
      // Compared against the snapshot `changed()` took, so a change of what
      // counts, or the page's own first loads, open nothing.
      rows(now) {
        if (!this.revealFrom) return;
        const landed = landedRows(this.revealFrom, groupByMonth(now, (r) => r.paid_on), (r) => r.key);
        if (!landed.length) return;
        const open = { ...this.openGroups };
        for (const l of landed) open[l.group] = true;
        this.openGroups = open;
        if (landed.length <= this.revealCount) return;
        this.revealCount = landed.length;
        this.$nextTick(() => {
          const el = this.$el.querySelector(`[data-row-key="${landed[0].key}"]`);
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
      },
    },
    mounted() {
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
      // Records only zir own toggles: a default already matches `openKeys`.
      // Zir toggle also ends the reveal, so a late reload cannot reopen what
      // ze closed.
      onMonthToggle(key, event) {
        const open = event.target.open;
        if (open === this.openKeys.has(key)) return;
        this.revealFrom = null;
        this.openGroups = { ...this.openGroups, [key]: open };
      },
      // Every change the Book reports goes through here: it notes where each
      // row is now, so the reload can open the month a row lands in.
      changed() {
        this.revealFrom = new Map(this.rows.map((r) => [r.key, monthKey(r.paid_on)]));
        this.revealCount = 0;
        this.$emit('changed');
      },
      formatSignedMoney(cents) {
        const sign = cents < 0 ? '-' : '';
        return `${sign}${formatMoney(Math.abs(cents))}`;
      },
      async downloadBookReport() {
        if (this.reportDownloading) return;
        this.reportDownloading = true;
        this.reportError = '';
        try {
          await downloadBlob(bookReportCsvUrl(this.exportMonth), 'Buchhaltung.csv');
        } catch (err) {
          // Said beside the button: the tab's shared error line is at its
          // top, a screen or more above the Export group (system_3 #11500).
          this.reportError = errorOf(err).message;
          // The line renders under the button. When the button already sits at
          // the foot of a phone screen, that is below it, and a failed export
          // looked like nothing happened (system_3 #11623).
          this.$nextTick(() => {
            const el = this.$el.querySelector('[data-test="book-report-error"]');
            if (el) el.scrollIntoView({ block: 'nearest' });
          });
        } finally {
          this.reportDownloading = false;
        }
      },
      // The PDF's document and name, from what the tab shows now. The file
      // says what it counts and what it leaves out, as the tab does (§3.143
      // Decision 7); for one month the Uncategorised count is that month's.
      bookPdfParts() {
        const month = this.exportMonth;
        const uncounted = month
          ? this.payments.filter((p) => p.kind === 'incoming' && p.category === 'uncategorised' && monthKey(p.paid_on) === month).length
          : this.uncountedUncategorised;
        const doc = bookPdfDoc({
          months: this.pdfMonths,
          selectionName: this.name,
          scope: month ? `paid in ${monthLabel(month)}` : 'all months',
          madeOn: this.today,
          countingSentence: this.sentence,
          uncategorisedSentence: this.uncountedUncategorised && uncounted ? uncategorisedText(uncounted) : '',
          fmt: { day: formatDay, money: formatMoney, signedMoney: this.formatSignedMoney },
        });
        return { doc, fileName: bookPdfFileName({ selection: this.selection, presets: this.presets, monthKey: month, now: new Date() }) };
      },
      async downloadBookPdf() {
        if (this.pdfDownloading || !this.book) return;
        this.pdfDownloading = true;
        this.pdfError = '';
        try {
          const { doc, fileName } = this.bookPdfParts();
          // What is about to be drawn, for anything that wants to read the
          // document and not the drawn pages (the Book spec does).
          this.$el.dispatchEvent(new CustomEvent('book-pdf', { bubbles: true, detail: { fileName, doc } }));
          await pdfMake.createPdf(doc).download(fileName);
        } catch {
          this.pdfError = 'The PDF could not be made. Try again.';
          this.$nextTick(() => {
            const el = this.$el.querySelector('[data-test="book-pdf-error"]');
            if (el) el.scrollIntoView({ block: 'nearest' });
          });
        } finally {
          this.pdfDownloading = false;
        }
      },
      onExpenseChanged() {
        this.changed();
      },
      async onChangeToggle(event) {
        if (!event.target.open || this.categoriesLoaded) return;
        try {
          this.expenseCategories = await listExpenseCategories();
          this.categoriesLoaded = true;
          this.categoriesError = '';
        } catch (err) {
          this.categoriesError = `Your expense categories could not be loaded: ${errorOf(err).message}`;
        }
      },
      // The expense categories that count, as a list: the server takes
      // `expense_all` only for Work only unchanged (aspirant-server
      // `workOnlyRule`), so a changed selection and every preset name theirs.
      expenseList(selection) {
        return selection.expense_all ? countableExpenseNames(this.expenseCategories) : [...selection.expense];
      },
      // A tick applies at once. Back on exactly Work only, it says so again,
      // so the select stops reading "(changed)".
      countingFor(income, expense) {
        const all = countableExpenseNames(this.expenseCategories);
        const isWorkOnly =
          this.selection.preset === WORK_ONLY &&
          income.length === 1 &&
          income[0] === 'paid_work' &&
          all.every((n) => expense.includes(n));
        return isWorkOnly ? { income, expense_all: true, expense: [] } : { income, expense_all: false, expense };
      },
      tickIncome(category, on) {
        const income = on ? [...this.selection.income, category] : this.selection.income.filter((c) => c !== category);
        this.writeSelection({ ...this.countingFor(income, this.expenseList(this.selection)), preset: this.selection.preset });
      },
      tickExpense(name, on) {
        const current = this.expenseList(this.selection);
        const expense = on ? [...current, name] : current.filter((n) => n !== name);
        this.writeSelection({ ...this.countingFor([...this.selection.income], expense), preset: this.selection.preset });
      },
      choosePreset(id) {
        const p = this.presets.find((x) => x.id === id);
        if (!p) return;
        this.writeSelection({ income: [...p.income], expense_all: p.expense_all, expense: [...p.expense], preset: p.id });
      },
      async write(call) {
        if (this.saving) return false;
        this.saving = true;
        this.selectionError = '';
        try {
          const book = await call();
          this.$emit('book-changed', { selection: book.selection, presets: book.presets });
          return true;
        } catch (err) {
          this.selectionError = errorOf(err).message;
          return false;
        } finally {
          this.saving = false;
        }
      },
      writeSelection(body) {
        this.confirmingDelete = false;
        return this.write(() => putBookSelection(body));
      },
      openSavePreset() {
        this.presetName = '';
        this.presetError = '';
        this.presetDialogOpen = true;
        this.takeUnsentBaseline();
      },
      // Esc, the scrim, the corner ✕, Cancel and Back: each asks first when a
      // name is typed (§3.166).
      onPresetOpenChange(value) {
        if (value) return;
        this.requestClose();
      },
      closeNow() {
        this.presetDialogOpen = false;
      },
      unsentValue() {
        return { name: this.presetName.trim() };
      },
      // Save the ticks under zir name, then count by that preset.
      async savePreset() {
        const name = this.presetName.trim();
        if (!name || this.saving) return;
        const counting = { income: [...this.selection.income], expense_all: false, expense: this.expenseList(this.selection) };
        this.saving = true;
        this.presetSaving = true;
        this.presetError = '';
        try {
          const created = await createBookPreset({ name, ...counting });
          const book = await putBookSelection({ ...counting, preset: created.preset.id });
          this.$emit('book-changed', { selection: book.selection, presets: book.presets });
          this.presetDialogOpen = false;
        } catch (err) {
          this.presetError = errorOf(err).message;
        } finally {
          this.saving = false;
          this.presetSaving = false;
        }
      },
      updatePreset() {
        const p = this.ownPreset;
        const counting = { income: [...this.selection.income], expense_all: false, expense: this.expenseList(this.selection) };
        this.confirmingDelete = false;
        return this.write(() => updateBookPreset(p.id, counting));
      },
      deletePreset() {
        if (!this.confirmingDelete) {
          this.confirmingDelete = true;
          return;
        }
        this.confirmingDelete = false;
        const p = this.ownPreset;
        return this.write(() => deleteBookPreset(p.id));
      },
      openReceipt(row) {
        this.receiptExpenseId = row.id;
        this.receiptExpenseLabel = `${this.formatDay(row.paid_on)} · ${this.formatMoney(row.amount_cents)}${row.who ? ` · ${row.who}` : ''}`;
        this.receiptOpen = true;
      },
      // The card's body button's name (system_3 #11661): what it opens, and
      // the row, named as Transactions names it (#11567): the transaction id,
      // or a hand-entered row's date and "who · what".
      cardBodyName(row) {
        const record = row.payment || row.expense;
        const what = record && record.entry === 'manual'
          ? `${this.formatDay(row.paid_on)} · ${[row.who, row.what].filter(Boolean).join(' · ') || '—'}`
          : (record && record.transaction_id) || this.formatDay(row.paid_on);
        return `${row.type === 'in' ? 'Edit payment' : 'Edit expense'} for ${what}`;
      },
      // §3.143 Decision 7: the row opens the dialog it opens on Transactions.
      async openEdit(row) {
        if (row.type === 'in') {
          this.editPayment = row.payment;
          this.paymentEditOpen = true;
          return;
        }
        this.editExpense = row.expense;
        this.expenseEditOpen = true;
        try {
          this.expenseCategories = await listExpenseCategories();
        } catch {
          // The select still shows the row's own category; the server refuses
          // an unknown one, so nothing wrong can be stored.
        }
      },
      // A phone card's body opens its row's dialog; its Receipt button keeps
      // its own job.
      onCardTap(row, event) {
        if (event.target.closest('button, input, select, label, a, [role="combobox"], [role="listbox"], [role="option"]')) return;
        this.openEdit(row);
      },
    },
  };
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

  .error {
    color: var(--feedback-error);
    margin: 0 0 var(--space-sm);
  }

  /* The Export group, with the same rules as InvoicesPanel's: a heading,
     then the button and its caption as one column. */
  .export-group {
    margin-top: var(--space-lg);
  }

  .export-group h3 {
    margin: 0 0 var(--space-sm);
  }

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

  /* A second file's button sits clear of the first file's caption. */
  .export__button--next {
    margin-top: var(--space-sm);
  }

  /* The month select sits above the button with a little more room than
     the button has to its caption. */
  .export__month {
    margin-bottom: var(--space-xs);
  }

  /* As wide as its longest option, whatever is chosen: the option's text
     plus the trigger's own padding and caret. */
  .export__month :deep(.select__trigger) {
    min-width: calc(var(--export-month-ch, 10ch) + 3.5rem);
  }

  .export-group > .error {
    margin-top: var(--space-sm);
  }

  .counting {
    margin-bottom: var(--space-md);
  }

  .counting__line {
    margin: 0 0 var(--space-xs);
  }

  .change__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    max-width: 40rem;
  }

  .ticks {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
  }

  .ticks > legend {
    font-weight: 600;
    margin-bottom: var(--space-2xs);
  }

  .ticks__note {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--text-sm);
  }

  .change__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  /* §3.145: each month is a fold and the month line is its summary, on the
     shared `.fold-summary` (caret on the left, 44px row). The totals sit at
     the far end and wrap under the month name when the row is too narrow. */
  .month {
    margin-bottom: var(--space-sm);
  }

  .month[open] {
    margin-bottom: var(--space-lg);
  }

  .month__head {
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-sm);
    row-gap: 0;
    padding-block: var(--space-2xs);
    border-bottom: 1px solid var(--border-subtle, currentColor);
  }

  .month[open] > .month__head {
    margin-bottom: var(--space-sm);
  }

  /* The layout is fixed and the columns have widths, so they line up from
     one month's table to the next (§3.145 Decision 6). */
  .month :deep(table) {
    table-layout: fixed;
    width: 100%;
  }

  .month__label {
    margin: 0;
  }

  /* A month with no entries (#11023): its head alone, no caret and nothing to
     open. Its name starts where a folding month's name starts, past the
     caret, so the column of month names stays straight. */
  .month__head--empty {
    display: flex;
    padding-inline-start: calc(1em + var(--space-xs));
  }

  /* The period line (#11023): this quarter and the year so far, above the
     months, in the month heads' own totals and inks. */
  .period {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin: var(--space-sm) 0 var(--space-md);
  }

  .period__line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-sm);
    margin: 0;
  }

  .period__label {
    font-weight: var(--font-weight-bold);
  }

  .month__totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0 0 0 auto;
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

  /* The row's last column: its actions on one line, the door last and flush
     with the row's right edge (§3.159 Decision 3). */
  .row-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xs);
  }

  /* A button keeps its label whole: in a column too narrow for it, it would
     otherwise shrink and cut its own text. */
  .row-actions :deep(.btn) {
    flex: none;
  }

  .book-card__expense-actions {
    display: flex;
    gap: var(--space-xs);
    align-self: flex-start;
  }

  .book-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  /* A card line with the door word at its end (system_3 #11022). */
  .card-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .card-door {
    flex: none;
    white-space: nowrap;
  }

  .book-card {
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* The card's body opens its row's edit dialog (system_3 #10729). */
  .book-card--tap {
    cursor: pointer;
  }

  /* The card's body button (system_3 #11661): no box of its own, the card's
     column inside it, so every line sits where it did. */
  .book-card .card-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: inherit;
  }

  .book-card .card-body:focus-visible {
    outline: none;
  }

  .book-card:has(> .card-body:focus-visible) {
    box-shadow: var(--shadow-focus);
    border-color: var(--text-body);
  }

  .book-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  @media (max-width: 640px) {
    /* On a phone the month select and the button each take the full width,
       the select first (§3.122 P5; design ack on system_3 #11635). */
    .export {
      max-width: none;
      align-items: stretch;
    }

    .export__month :deep(.select) {
      display: flex;
      width: 100%;
    }

    .export__month :deep(.select__trigger) {
      min-width: 0;
    }

    .export__button {
      width: 100%;
    }

    /* The totals take their own line under the month name, starting where
       the name starts (past the caret). */
    .month__totals {
      flex-basis: 100%;
      margin-left: calc(1em + var(--space-xs));
      padding-bottom: var(--space-2xs);
    }

    /* The period line has no caret to start past. */
    .period .month__totals {
      margin-left: 0;
    }

  }
</style>
