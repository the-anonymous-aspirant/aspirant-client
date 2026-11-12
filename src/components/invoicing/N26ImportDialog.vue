<template>
  <AspModal :open="open" title="Import N26 payments" size="md" @update:open="close">
    <div class="n26" data-test="n26-review">
      <p class="n26__lead">
        Only ticked payments are imported. They arrive without a category.
      </p>
      <section
        v-for="(file, f) in files"
        :key="f"
        class="n26-file"
        :aria-label="file.filename"
        data-test="n26-file"
      >
        <!-- The document kind is a fact about the file: shown once, here
             (design_agent c60358, D5). -->
        <h3 class="n26-file__name" data-test="n26-file-heading">
          <span class="n26-file__filename">{{ file.filename }}</span><template v-if="file.document_kind">
            <span class="n26-file__kind"> · {{ kindLabel(file.document_kind) }}</span></template>
        </h3>
        <p v-if="file.error" class="n26-file__error" role="alert" data-test="n26-file-error">
          This file could not be read: {{ fileErrorReason(file.error) }}.<template v-if="copyKept(file)">
            {{ ' ' }}<span data-test="n26-file-copy-kept">{{ copyKept(file) }}</span></template>
        </p>
        <!-- A transfer from PayPal is her own money; its payments come in through the
             PayPal import, so the server leaves it out (#9881, design_agent
             c61091). Say so, or the
             file reads as having lost a payment; when it was the file's only
             row, this line replaces the empty-file line. -->
        <template v-else>
          <!-- Each kind of left-out row is its own line, PayPal first, so a
               file with both kinds shows both (design_agent c65358, D2). -->
          <p v-if="paypalSkipped(file)" class="n26-file__none n26-file__paypal" data-test="n26-file-paypal">
            {{ paypalLine(paypalSkipped(file)) }}
          </p>
          <!-- A move between her own account and a Space (a Round-up, a
               Monthly Rule, a plain transfer to or from a Space) is her own
               money: the server leaves it out (system_3 #10541), and the
               dialog says so, so the counts add up to the statement. -->
          <p v-if="spaceTransferSkipped(file)" class="n26-file__none n26-file__space-transfer" data-test="n26-file-space-transfer">
            {{ spaceTransferLine(spaceTransferSkipped(file)) }}
          </p>
          <!-- A recognised statement that read no row at all. A month with
               no activity reads zero rows too, so this says what is known
               and what she can check, in the empty line's muted style, not
               as an error (design_agent c65358). The kind is already in the
               heading. -->
          <p v-if="unreadableStatement(file)" class="n26-file__none n26-file__unreadable" data-test="n26-file-unreadable">
            No transaction was found in this file. If the statement lists any, the importer does not know this layout yet: try N26's CSV export of the same month instead.<template v-if="copyKept(file)">
              {{ ' ' }}<span data-test="n26-file-copy-kept">{{ copyKept(file) }}</span></template>
          </p>
          <p
            v-else-if="!(file.candidates || []).length && !paypalSkipped(file) && !spaceTransferSkipped(file)"
            class="n26-file__none"
            data-test="n26-file-empty"
          >
            No incoming payments in this file.<template v-if="copyKept(file)">
              {{ ' ' }}<span data-test="n26-file-copy-kept">{{ copyKept(file) }}</span></template>
          </p>
        </template>
        <ul v-if="!file.error && (file.candidates || []).length" class="n26-rows">
          <!-- §3.114 card grammar at every width: checkbox first, payer
               top-left, amount top-right, date and reference muted beneath,
               any flag as plain muted text under that. -->
          <li
            v-for="(row, r) in file.candidates"
            :key="r"
            class="n26-row"
            data-test="n26-row"
            :data-txn="row.transaction_id"
          >
            <!-- Nothing can make an already-imported row importable, so it
                 has no checkbox at all: absent, not disabled (§3.22,
                 design_agent c60363). The spacer keeps its text in line. -->
            <span v-if="row.already_imported" class="n26-row__nocheck" aria-hidden="true" />
            <AspCheckbox
              v-else
              :model-value="isChecked(f, r)"
              :disabled="confirming"
              :aria-label="`Import ${formatMoney(row.gross_cents, row.currency)} from ${row.sender_name} on ${formatDay(row.paid_on)}`"
              data-test="n26-row-check"
              @update:model-value="setChecked(f, r, $event)"
            />
            <div class="n26-row__body">
              <div class="n26-row__top">
                <!-- Payer names and references are written by outside
                     payers: text interpolation only, never v-html. -->
                <span class="n26-row__payer">{{ row.sender_name }}</span>
                <strong class="nowrap n26-row__amount">{{ formatMoney(row.gross_cents, row.currency) }}</strong>
              </div>
              <span class="n26-row__muted" data-test="n26-row-meta"><span class="nowrap">{{ formatDay(row.paid_on) }}</span><template v-if="row.note"> · <span class="n26-row__note">{{ row.note }}</span></template></span>
              <!-- A match to a payment she removed, or deleted for good, is
                   not in her book, so it does not say "Already imported"
                   (§3.143 Decision 6). -->
              <span v-if="priorFlag(row)" class="n26-row__muted" data-test="n26-row-prior">{{ priorFlag(row) }}</span>
              <span v-else-if="row.already_imported" class="n26-row__muted" data-test="n26-row-imported">Already imported</span>
              <span v-else-if="row.possible_duplicate_of" class="n26-row__muted" data-test="n26-row-duplicate">{{ duplicateLine(row) }}</span>
            </div>
          </li>
        </ul>
        <!-- A statement's outgoing rows (system_3 #10417), offered as work
             expenses beside the payments, never mixed into them. -->
        <ExpenseCandidatesSection
          v-if="!file.error && (file.expense_candidates || []).length"
          :items="expenseItems(f)"
          :categories="categories"
          :disabled="confirming"
          @update:checked="setExpenseChecked"
          @update:category="setExpenseCategory"
        />
      </section>
      <p v-if="error" class="n26__error" role="alert" data-test="n26-error">{{ error }}</p>
    </div>
    <template #footer>
      <div class="n26-footer">
        <p v-if="!importable" class="n26-footer__note" data-test="n26-nothing">{{ nothingLine }}</p>
        <ModalActions>
          <template v-if="importable">
            <AspButton variant="secondary" :disabled="confirming" data-test="n26-cancel" @click="close(false)">Cancel</AspButton>
            <AspButton :loading="confirming" :disabled="nothingTicked" data-test="n26-confirm" @click="confirm">
              {{ confirmLabel }}
            </AspButton>
          </template>
          <AspButton v-else variant="secondary" data-test="n26-close" @click="close(false)">Close</AspButton>
        </ModalActions>
        <!-- States what enables the primary (§3.114, c60358 item 4). -->
        <p v-if="importable && nothingTicked" class="n26-footer__note n26-footer__note--end" data-test="n26-tick-hint">
          Tick at least one row to import.
        </p>
      </div>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspCheckbox, AspModal } from '@aspirant/design-system';
  import ExpenseCandidatesSection from './ExpenseCandidatesSection.vue';
  import ModalActions from './ModalActions.vue';
  import {
    N26_KIND_LABELS,
    confirmN26Expenses,
    confirmN26Rows,
    copyKeptSentence,
    countPrior,
    errorOf,
    formatDay,
    formatMoney,
    listExpenseCategories,
    n26FileErrorReason,
    priorFlag,
  } from './api.js';

  // Every book has this category (the server seeds it), so it is the
  // default and the fallback when the list cannot be read.
  const EXPENSE_CATEGORY_DEFAULT = 'other';

  // The confirm-each-row step of the N26 import (system_3 #9760-B1). The
  // server has parsed the files and stored nothing; this dialog posts back
  // only the rows the owner keeps ticked. A row already imported has no
  // checkbox, and one with the same date and amount as a stored payment (often
  // the same transfer, seen once on its confirmation and again on a
  // statement) starts unticked. The server re-validates and dedupes anyway.
  export default {
    name: 'N26ImportDialog',
    components: { AspButton, AspCheckbox, AspModal, ExpenseCandidatesSection, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      // The parse response: [{ filename, document_kind, candidates,
      // expense_candidates, skipped, error, copy_expires_at }].
      files: { type: Array, default: () => [] },
      // The stored payments, to name the one a look-alike row matches.
      payments: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'imported'],
    data() {
      return {
        checked: {},
        // Per outgoing row, keyed like `checked`: { checked, category }.
        expenseState: {},
        categories: [EXPENSE_CATEGORY_DEFAULT],
        // The payments half of a confirm that already went through, so a
        // retry after the expenses half failed does not post them again.
        paymentsResult: null,
        confirming: false,
        error: '',
      };
    },
    computed: {
      rows() {
        const out = [];
        this.files.forEach((file, f) => (file.candidates || []).forEach((row, r) => out.push({ f, r, row })));
        return out;
      },
      expenseRows() {
        const out = [];
        this.files.forEach((file, f) =>
          (file.error ? [] : file.expense_candidates || []).forEach((row, r) => out.push({ f, r, row })));
        return out;
      },
      importable() {
        return [...this.rows, ...this.expenseRows].some(({ row }) => !row.already_imported);
      },
      checkedRows() {
        return this.rows.filter(({ f, r }) => this.isChecked(f, r)).map(({ row }) => row);
      },
      // The ticked outgoing rows as the expense confirm takes them.
      checkedExpenses() {
        return this.expenseRows
          .filter(({ f, r, row }) => !row.already_imported && this.expenseOf(f, r).checked)
          .map(({ f, r, row }) => ({
            transaction_id: row.transaction_id,
            paid_on: row.paid_on,
            currency: row.currency,
            amount_cents: row.amount_cents,
            payee_name: row.payee_name,
            note: row.note,
            category: this.expenseOf(f, r).category,
          }));
      },
      nothingTicked() {
        return this.checkedRows.length === 0 && this.checkedExpenses.length === 0;
      },
      confirmLabel() {
        const n = this.checkedRows.length;
        const payments = `${n} payment${n === 1 ? '' : 's'}`;
        const e = this.checkedExpenses.length;
        if (!e) return `Import ${payments}`;
        const expenses = `${e} expense${e === 1 ? '' : 's'}`;
        return n ? `Import ${payments} and ${expenses}` : `Import ${expenses}`;
      },
      // Rows the server left out because their payer is PayPal (#9881).
      paypalTotal() {
        return this.files.reduce((n, file) => n + this.paypalSkipped(file), 0);
      },
      // Rows the server left out as moves between her own account and a
      // Space (system_3 #10541): her own money, not a payment or expense.
      spaceTransferTotal() {
        return this.files.reduce((n, file) => n + this.spaceTransferSkipped(file), 0);
      },
      nothingLine() {
        if (this.rows.length || this.expenseRows.length) return 'Nothing new to import: every row is already imported.';
        if (this.paypalTotal && this.spaceTransferTotal) {
          return 'Nothing to import: every row read is a transfer from PayPal or a move between your account and your Spaces.';
        }
        if (this.paypalTotal) return 'Nothing to import: every payment read is a transfer from PayPal.';
        if (this.spaceTransferTotal) return 'Nothing to import: every row read is a move between your account and your Spaces.';
        return 'Nothing to import: no payment could be read from these files.';
      },
    },
    watch: {
      // A new set of files starts from the defaults.
      files: {
        immediate: true,
        handler() {
          const checked = {};
          for (const { f, r, row } of this.rows) {
            checked[`${f}:${r}`] = !row.already_imported && !row.possible_duplicate_of;
          }
          this.checked = checked;
          // Outgoing rows start unticked: most of a statement's spending is
          // not work. Each starts in the catch-all category.
          const expenseState = {};
          for (const { f, r } of this.expenseRows) {
            expenseState[`${f}:${r}`] = { checked: false, category: EXPENSE_CATEGORY_DEFAULT };
          }
          this.expenseState = expenseState;
          this.paymentsResult = null;
          this.error = '';
          if (this.expenseRows.length) this.loadCategories();
        },
      },
    },
    methods: {
      formatDay,
      formatMoney,
      priorFlag,
      kindLabel(kind) {
        return N26_KIND_LABELS[kind] || kind;
      },
      fileErrorReason(fileError) {
        return n26FileErrorReason(fileError);
      },
      // Present only on a file the server failed and kept a copy of (#10567).
      copyKept(file) {
        return copyKeptSentence(file.copy_expires_at);
      },
      paypalSkipped(file) {
        return (file.skipped && file.skipped.paypal_transfer) || 0;
      },
      paypalLine(n) {
        // States the rule, not that her PayPal file is already in: she may
        // import N26 first (design_agent c61091, D2).
        return n === 1
          ? '1 transfer from PayPal left out: its payments come in through your PayPal import.'
          : `${n} transfers from PayPal left out: their payments come in through your PayPal import.`;
      },
      spaceTransferSkipped(file) {
        return (file.skipped && file.skipped.space_transfer) || 0;
      },
      spaceTransferLine(n) {
        return n === 1
          ? '1 move between your account and a Space left out: it is your own money, not a payment or an expense.'
          : `${n} moves between your account and your Spaces left out: they are your own money, not payments or expenses.`;
      },
      // A statement/Kontoaktivität file that read cleanly but found nothing
      // in either direction: distinct from a file that legitimately has
      // only outgoing rows (then "No incoming payments" already says so
      // accurately) or whose empty read is already explained by a skip.
      unreadableStatement(file) {
        return (
          file.document_kind === 'n26_account_statement' &&
          !(file.candidates || []).length &&
          !(file.expense_candidates || []).length &&
          !this.paypalSkipped(file) &&
          !this.spaceTransferSkipped(file)
        );
      },
      // Name the stored payment a look-alike row matches, when it is loaded.
      duplicateLine(row) {
        const match = this.payments.find((p) => p.id === row.possible_duplicate_of);
        if (match && match.sender_name) {
          return `Same date and amount as ${match.sender_name}'s payment on ${formatDay(match.paid_on)}. Tick it only if it is a different payment.`;
        }
        return 'Same date and amount as a payment already here. Tick it only if it is a different payment.';
      },
      isChecked(f, r) {
        return !!this.checked[`${f}:${r}`];
      },
      setChecked(f, r, on) {
        this.checked = { ...this.checked, [`${f}:${r}`]: on };
      },
      async loadCategories() {
        try {
          const names = (await listExpenseCategories()).map((c) => c.name).filter(Boolean);
          if (names.length) this.categories = names;
        } catch (err) {
          // The picker still offers the catch-all; the server checks the rest.
          this.categories = [EXPENSE_CATEGORY_DEFAULT];
        }
      },
      expenseOf(f, r) {
        return this.expenseState[`${f}:${r}`] || { checked: false, category: EXPENSE_CATEGORY_DEFAULT };
      },
      expenseItems(f) {
        return this.expenseRows
          .filter((e) => e.f === f)
          .map(({ r, row }) => ({ key: `${f}:${r}`, row, ...this.expenseOf(f, r) }));
      },
      setExpenseChecked(key, on) {
        this.expenseState = { ...this.expenseState, [key]: { ...this.expenseState[key], checked: on } };
      },
      setExpenseCategory(key, category) {
        this.expenseState = { ...this.expenseState, [key]: { ...this.expenseState[key], category } };
      },
      // However the dialog is dismissed, the summary is still emitted, so a
      // file that could not be read stays named after it closes (c60358
      // item 2, D2); every row left unticked counts as skipped.
      close(value) {
        if (this.confirming || value) return;
        this.finish(this.paymentsResult || { confirmed: 0, duplicates: 0 }, this.paymentsResult ? this.checkedRows : [], null);
      },
      finish(result, posted, expenses) {
        const alreadyImported = this.rows.filter(({ row }) => row.already_imported).length;
        // Rows matching a record she removed or deleted for good, in either
        // direction (§3.143 Decision 6, design_agent c66225). The review shows
        // them without a checkbox, so they are counted from their flags; a
        // confirm counts any the server met anyway. They are printed apart
        // from "already imported", so that count leaves them out.
        const payPrior = countPrior(this.rows.map(({ row }) => row));
        const expPrior = countPrior(this.expenseRows.map(({ row }) => row));
        const ex = expenses || {};
        const removedEarlier = payPrior.removed + expPrior.removed + (result.removed_earlier || 0) + (ex.removed_earlier || 0);
        const deletedEarlier = payPrior.deleted + expPrior.deleted + (result.deleted_earlier || 0) + (ex.deleted_earlier || 0);
        const paymentDuplicates = result.duplicates + alreadyImported
          - payPrior.removed - payPrior.deleted
          - (result.removed_earlier || 0) - (result.deleted_earlier || 0);
        this.$emit('imported', {
          files: this.files.length,
          failures: this.files
            .filter((file) => file.error)
            .map((file) => ({ filename: file.filename, reason: n26FileErrorReason(file.error) })),
          // A recognised file that read no transaction stays named after the
          // dialog closes, like a failure (design_agent c65358, §3.127
          // Decision 5).
          unreadable: this.files.filter((file) => !file.error && this.unreadableStatement(file)).map((file) => file.filename),
          // The PayPal transfers and the Space moves were read too,
          // so the line adds up.
          rows_read: this.rows.length + this.paypalTotal + this.spaceTransferTotal,
          paypal_transfers: this.paypalTotal,
          space_transfers: this.spaceTransferTotal,
          imported: result.confirmed,
          duplicates: Math.max(0, paymentDuplicates),
          removed_earlier: removedEarlier,
          deleted_earlier: deletedEarlier,
          skipped: this.rows.length - alreadyImported - posted.length,
          // Outgoing rows added to the expense book (system_3 #10432).
          expenses_added: expenses ? expenses.confirmed : 0,
        });
        this.$emit('update:open', false);
      },
      async confirm() {
        const rows = this.checkedRows;
        const expenses = this.checkedExpenses;
        if (!rows.length && !expenses.length) return;
        this.confirming = true;
        this.error = '';
        try {
          if (!this.paymentsResult) {
            this.paymentsResult = rows.length ? await confirmN26Rows(rows) : { confirmed: 0, duplicates: 0 };
          }
          const expenseResult = expenses.length ? await confirmN26Expenses(expenses) : { confirmed: 0, duplicates: 0 };
          this.confirming = false;
          this.finish(this.paymentsResult, rows, expenseResult);
        } catch (err) {
          // When the payments went through and the expenses did not, say so:
          // Import again posts only the expenses.
          const message = errorOf(err).message;
          this.error = this.paymentsResult && rows.length
            ? `The payments were imported, but the expenses were not: ${message}`
            : message;
          this.confirming = false;
        }
      },
    },
  };
</script>

<style scoped>
  .n26 {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .n26__lead {
    margin: 0;
  }

  .n26-file__name {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-base);
  }

  /* A bank's file name is one long token; let it break rather than widen
     the dialog past a phone's width. */
  .n26-file__filename {
    overflow-wrap: anywhere;
  }

  .n26-file__kind {
    color: var(--text-muted);
    font-weight: normal;
  }

  .n26-file__none {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .n26-file__paypal {
    margin-bottom: var(--space-xs);
  }

  .n26-file__error,
  .n26__error {
    margin: 0;
    color: var(--feedback-error);
  }

  .n26-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* The payment card grammar of the Payments tab on a phone (§3.114). */
  .n26-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  .n26-row__nocheck {
    flex: none;
    width: 1rem;
  }

  .n26-row__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .n26-row__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .n26-row__payer {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .n26-row__amount {
    font-variant-numeric: tabular-nums;
  }

  .n26-row__muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .n26-row__note {
    white-space: pre-line;
  }

  .nowrap {
    white-space: nowrap;
  }

  .n26-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .n26-footer__note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .n26-footer__note--end {
    text-align: right;
  }

  @media (max-width: 640px) {
    .n26-footer__note--end {
      text-align: left;
    }
  }
</style>
