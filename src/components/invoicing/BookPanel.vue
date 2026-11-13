<template>
  <section class="book-panel" data-test="book-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Book</h2>
      <!-- "Enter expense by hand" moved to Transactions (§3.143 Decision 2,
           system_3 #10555): a movement has one place to be recorded. -->
      <!-- §3.143 Decision 7: the head row keeps only the CSV, captioned with
           the selection it counts by (the server names the file after it). -->
      <div class="report block-on-phone">
        <AspButton
          variant="secondary"
          class="block-on-phone"
          :loading="reportDownloading"
          data-test="book-report-csv"
          @click="downloadBookReport"
        >
          Bookkeeping report (CSV)
        </AspButton>
        <span v-if="book" class="muted report__caption" data-test="book-report-caption">Uses {{ name }}</span>
      </div>
    </div>

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
        <summary>Change what counts</summary>
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
            <!-- Shown for her own preset; there is nothing to update until a tick changes. -->
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
      <section v-for="month in months" :key="month.key" class="month" data-test="book-month">
        <header class="month__head" data-test="month-head">
          <h3 class="month__label">{{ month.label }}</h3>
          <p class="month__totals">
            <span class="in-amount">In {{ formatMoney(month.inCents) }}</span>
            <span class="out-amount">Out {{ formatMoney(month.outCents) }}</span>
            <span class="result" :class="{ negative: month.resultCents < 0 }">Result {{ formatSignedMoney(month.resultCents) }}</span>
          </p>
        </header>

        <template v-if="narrow">
          <ul class="book-cards" aria-label="Book entries">
            <li
              v-for="row in month.rows"
              :key="row.key"
              class="book-card book-card--tap"
              data-test="book-row"
              :data-type="row.type"
              @click="onCardTap(row, $event)"
            >
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
              <span class="muted">{{ row.categoryLabel }}</span>
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
          :row-attrs="(row) => ({ 'data-test': 'book-row', 'data-type': row.type })"
        >
          <template #cell-paid_on="{ row }"><span class="nowrap">{{ formatDay(row.paid_on) }}</span></template>
          <template #cell-description="{ row }">
            <span class="description" data-test="book-row-description">
              <template v-if="row.who">{{ row.who }}</template>
              <template v-if="row.who && row.what"> · </template>
              <span v-if="row.what" :class="{ muted: !!row.who }">{{ row.what }}</span>
              <template v-if="!row.who && !row.what">—</template>
            </span>
            <!-- §3.143 Decision 7: a Book row opens the same edit dialog as on
                 Transactions (system_3 #10729); removing lives in the dialog. -->
            <AspButton variant="ghost" size="sm" class="manual-delete" data-test="book-row-edit" @click="openEdit(row)">Edit</AspButton>
          </template>
          <template #cell-category="{ row }"><span class="muted">{{ row.categoryLabel }}</span></template>
          <template #cell-in="{ row }">
            <span v-if="row.type === 'in'" class="nowrap in-amount">{{ formatMoney(row.amount_cents) }}</span>
          </template>
          <template #cell-out="{ row }">
            <span v-if="row.type === 'out'" class="nowrap out-amount">{{ formatSignedMoney(-row.amount_cents) }}</span>
            <template v-if="row.type === 'out'">
              <AspButton variant="ghost" size="sm" class="manual-delete" data-test="book-expense-receipt" @click="openReceipt(row)">
                Receipt
              </AspButton>
            </template>
          </template>
        </AspDataTable>
      </section>

      <BookChart :payments="countedPayments" :expenses="countedExpenses" />
    </template>

    <AspModal :open="presetDialogOpen" size="sm" title="Save as preset" @update:open="presetDialogOpen = $event">
      <AspInput v-model="presetName" label="Name" maxlength="60" data-test="book-preset-name" @keydown.enter.prevent="savePreset" />
      <p v-if="presetError" class="error" role="alert" data-test="book-preset-error">{{ presetError }}</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="presetDialogOpen = false">Cancel</AspButton>
        <AspButton variant="primary" type="button" :loading="saving" :disabled="!presetName.trim()" data-test="book-preset-confirm" @click="savePreset">Save</AspButton>
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
    <ManualPaymentDialog v-model:open="paymentEditOpen" :payment="editPayment" :clients="clients" @changed="$emit('changed')" />
    <ManualExpenseDialog
      v-model:open="expenseEditOpen"
      :expense="editExpense"
      :categories="expenseCategories"
      @changed="$emit('changed')"
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
  import {
    CATEGORY_LABELS,
    bookReportCsvUrl,
    createBookPreset,
    deleteBookPreset,
    downloadBlob,
    errorOf,
    formatDay,
    formatMoney,
    listExpenseCategories,
    putBookSelection,
    updateBookPreset,
  } from './api.js';
  import { expenseParts, paymentParts } from './ledgerRows.js';
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
  export default {
    name: 'BookPanel',
    components: { AspButton, AspCheckbox, AspDataTable, AspEmptyState, AspInput, AspModal, AspSelect, BookChart, ExpenseReceiptDialog, ManualExpenseDialog, ManualPaymentDialog },
    props: {
      payments: { type: Array, required: true },
      expenses: { type: Array, required: true },
      // The client book, for a hand payment's "Paid by" in its edit dialog.
      clients: { type: Array, default: () => [] },
      // What counts and her presets, `{ selection, presets }` (§3.143
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
        receiptOpen: false,
        receiptExpenseId: null,
        receiptExpenseLabel: '',
        // "Change what counts": her expense categories are read the first
        // time it opens, never with the panel.
        categoriesLoaded: false,
        categoriesError: '',
        saving: false,
        selectionError: '',
        confirmingDelete: false,
        presetDialogOpen: false,
        presetName: '',
        presetError: '',
        columns: [
          { key: 'paid_on', label: 'Date paid' },
          { key: 'description', label: 'What it was for', sortable: false },
          { key: 'category', label: 'Category', sortable: false },
          { key: 'in', label: 'In', align: 'right', sortable: false },
          { key: 'out', label: 'Out', align: 'right', sortable: false },
        ],
      };
    },
    computed: {
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
        const n = this.uncountedUncategorised;
        return n === 1 ? '1 payment is still Uncategorised and not counted.' : `${n} payments are still Uncategorised and not counted.`;
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
      // A tick before her categories are read would turn "every expense" into
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
      // Her expense categories, without Private (never offered). Any category
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
            paid_on: p.paid_on,
            ...paymentParts(p),
            categoryLabel: CATEGORY_LABELS[p.category] || p.category,
            amount_cents: p.gross_cents,
            payment: p,
          }));
        const outgoing = this.countedExpenses.map((e) => ({
          key: `e${e.id}`,
          id: e.id,
          type: 'out',
          paid_on: e.paid_on,
          // Who and what, named as on Transactions (ledgerRows.js).
          ...expenseParts(e),
          categoryLabel: e.category,
          amount_cents: e.amount_cents,
          expense: e,
        }));
        return [...income, ...outgoing].sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : a.key.localeCompare(b.key)));
      },
      months() {
        const groups = new Map();
        for (const row of this.rows) {
          const key = String(row.paid_on).slice(0, 7); // YYYY-MM
          if (!groups.has(key)) groups.set(key, { key, label: monthLabel(key), rows: [], inCents: 0, outCents: 0 });
          const g = groups.get(key);
          g.rows.push(row);
          if (row.type === 'in') g.inCents += row.amount_cents;
          else g.outCents += row.amount_cents;
        }
        return [...groups.values()]
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((g) => ({ ...g, resultCents: g.inCents - g.outCents }));
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
      formatSignedMoney(cents) {
        const sign = cents < 0 ? '-' : '';
        return `${sign}${formatMoney(Math.abs(cents))}`;
      },
      async downloadBookReport() {
        if (this.reportDownloading) return;
        this.reportDownloading = true;
        this.rowError = '';
        try {
          await downloadBlob(bookReportCsvUrl(), 'Buchhaltung.csv');
        } catch (err) {
          this.rowError = errorOf(err).message;
        } finally {
          this.reportDownloading = false;
        }
      },
      onExpenseChanged() {
        this.$emit('changed');
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
      },
      // Save the ticks under her name, then count by that preset.
      async savePreset() {
        const name = this.presetName.trim();
        if (!name || this.saving) return;
        const counting = { income: [...this.selection.income], expense_all: false, expense: this.expenseList(this.selection) };
        this.saving = true;
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

  // "2026-07" -> "July 2026". Built from Date's own month names rather than a
  // hand-written list, so it follows the browser's locale like every other
  // date on this page.
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
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

  .panel-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .error {
    color: var(--feedback-error);
    margin: 0 0 var(--space-sm);
  }

  .report {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2xs);
  }

  .report__caption {
    font-size: var(--text-sm);
  }

  .counting {
    margin-bottom: var(--space-md);
  }

  .counting__line {
    margin: 0 0 var(--space-xs);
  }

  .change > summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
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

  .month {
    margin-bottom: var(--space-lg);
  }

  .month__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    padding-bottom: var(--space-2xs);
    border-bottom: 1px solid var(--border-subtle, currentColor);
  }

  .month__label {
    margin: 0;
  }

  .month__totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
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

  .manual-delete {
    margin-left: var(--space-xs);
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

  .book-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  @media (max-width: 640px) {
    .panel-head {
      flex-direction: column;
      justify-content: stretch;
    }

    .block-on-phone {
      width: 100%;
    }

    .report {
      align-items: stretch;
    }
  }
</style>
