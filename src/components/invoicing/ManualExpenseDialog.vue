<template>
  <AspModal :open="open" :title="title" size="md" @update:open="onOpenChange">
    <!-- While the footer asks before discarding (system_3 #11632), the form
         stays in view and cannot be changed. -->
    <form class="manual-form" data-test="expense-form" :inert="unsentAsking || undefined" @submit.prevent="save">
      <p v-if="!editing" class="manual-form__lead">Enter a work expense — money going out, for your own bookkeeping.</p>
      <!-- What the bank recorded, as text: nothing can make it editable
           (§3.143 Decision 5, §3.22). An import stores the bank's payee name
           as the reference (aspirant-server invoicing_n26.go and
           invoicing_payments.go), so it reads once, as who was paid. -->
      <template v-else-if="imported">
        <p class="manual-form__lead" data-test="edit-imported-lead">
          These details came from {{ sourceName }} and can't be changed. If they were read wrong, remove this expense and enter it by hand.
        </p>
        <dl class="facts" data-test="edit-facts">
          <div><dt>Date paid</dt><dd>{{ formatDay(expense.paid_on) }}</dd></div>
          <div><dt>Amount</dt><dd>{{ formatMoney(expense.amount_cents, expense.currency) }}</dd></div>
          <div v-if="bankPayee"><dt>Paid to (from the bank)</dt><dd>{{ bankPayee }}</dd></div>
          <div><dt>Source</dt><dd>{{ sourceName }}</dd></div>
        </dl>
      </template>

      <template v-if="!imported">
        <div class="manual-form__pair manual-form__pair--top">
          <label class="date-field">
            <span>Date paid</span>
            <input v-model="form.paid_on" type="date" :max="today" data-test="expense-date" />
          </label>
          <AspInput v-model="form.amount" label="Amount (€)" inputmode="decimal" placeholder="45,99" data-test="expense-amount" />
        </div>
        <!-- Who ze paid, the row's who (§3.143 Decision 3): stored as the
             expense's payee, next to when and how much. -->
        <AspInput v-model="form.payee" label="Paid to (optional)" data-test="expense-payee" />
      </template>

      <!-- A new category is typed in the list and saved with the expense;
           one ze added is removed or restored under the field (§3.161
           Decisions 1-4, system_3 #11580). Under the field, in this order:
           the action when it can act, one muted line, a refusal's reason. -->
      <div class="manual-form__full full-select category-field">
        <AspSelect
          v-model="form.category"
          searchable
          addable
          search-placeholder="Type to filter or add"
          :options="categoryOptions"
          label="Category"
          data-test="expense-category"
          @add="addCategory"
        />
        <AspButton
          v-if="categoryUnder.action"
          variant="ghost"
          size="sm"
          type="button"
          class="category-field__action"
          :loading="categoryBusy"
          :disabled="saving"
          :aria-label="categoryUnder.action.aria"
          :data-kind="categoryUnder.action.kind"
          data-test="expense-category-action"
          @click="runCategoryAction(categoryUnder.action)"
        >
          {{ categoryUnder.action.label }}
        </AspButton>
        <p class="manual-form__hint" data-test="expense-category-hint">{{ categoryUnder.line }}</p>
        <p v-if="categoryError" class="manual-form__error" role="alert" data-test="expense-category-error">{{ categoryError }}</p>
      </div>

      <AspInput v-if="!imported" v-model="form.reference" label="Reference (optional)" data-test="expense-reference" />
      <LineDescriptionInput v-model="form.note" label="What it was for (optional)" data-test="expense-note" />

      <!-- The receipt, from the start (system_3 #11510, operator c70883 on
           #10985; design ack on #11510). An upload needs the expense's id,
           so the picked file waits in the browser and goes up straight after
           Save has created the expense: the Receipt dialog's own call and
           limits, only sooner. A new entry only: an expense that exists keeps
           its receipt on its row (D5). No preview here; the Receipt dialog is
           where a receipt is looked at. -->
      <div v-if="!editing" class="receipt-pick" data-test="expense-receipt">
        <span id="expense-receipt-label" class="receipt-pick__label">Receipt (optional)</span>
        <input
          ref="receiptInput"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          class="receipt-pick__input"
          tabindex="-1"
          aria-hidden="true"
          data-test="expense-receipt-input"
          @change="onReceiptPicked"
        />
        <div class="receipt-pick__actions">
          <AspButton
            variant="secondary"
            size="sm"
            type="button"
            :disabled="saving"
            aria-describedby="expense-receipt-label"
            data-test="expense-receipt-attach"
            @click="$refs.receiptInput.click()"
          >
            {{ receiptFile ? 'Choose a different file' : 'Attach receipt' }}
          </AspButton>
          <AspButton v-if="receiptFile" variant="ghost" size="sm" type="button" :disabled="saving" data-test="expense-receipt-remove" @click="clearReceipt">
            Remove
          </AspButton>
        </div>
        <p v-if="receiptFile" class="receipt-pick__file" data-test="expense-receipt-file">{{ receiptFile.name }} · {{ receiptSize }}</p>
        <p v-else class="manual-form__hint" data-test="expense-receipt-hint">PDF, PNG or JPEG, up to 5 MB.</p>
        <p v-if="receiptError" class="manual-form__error" role="alert" data-test="expense-receipt-error">{{ receiptError }}</p>
      </div>

      <!-- §3.143 Decision 5: what changed before, one tap away. Events come
           newest first. -->
      <details v-if="editing" class="history" data-test="edit-history">
        <summary class="fold-summary" data-test="edit-history-summary">History</summary>
        <p v-if="historyError" class="manual-form__hint" data-test="edit-history-error">{{ historyError }}</p>
        <ul v-else-if="history.length" class="history__list">
          <li v-for="line in history" :key="line.id" data-test="edit-history-line">{{ line.text }}</li>
        </ul>
        <p v-else class="manual-form__hint">{{ historyLoaded ? 'No changes recorded yet.' : 'Loading…' }}</p>
      </details>

      <p v-if="error" class="manual-form__error" role="alert" data-test="expense-error">{{ error }}</p>
    </form>
    <template #footer>
      <UnsentAsk v-if="unsentAsking" @keep="keepEditing" @discard="discardUnsent" />
      <ModalActions v-else>
        <!-- Remove arms first (§3.143 Decision 6). An expense is never on an
             invoice, so removing it changes nothing else. -->
        <template v-if="editing" #destructive>
          <AspButton :variant="confirmingRemove ? 'destructive' : 'ghost'" :loading="removing" data-test="edit-remove" @click="remove">
            {{ confirmingRemove ? 'Remove this expense' : 'Remove' }}
          </AspButton>
        </template>
        <AspButton variant="secondary" :disabled="unsentBusy" data-test="expense-cancel" @click="onOpenChange(false)">Cancel</AspButton>
        <AspButton :loading="saving" data-test="expense-save" @click="save">{{ editing ? 'Save changes' : 'Save expense' }}</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import ModalActions from './ModalActions.vue';
  import UnsentAsk from './UnsentAsk.vue';
  import { unsentGuard } from './unsentGuard.js';
  import { historyLines } from './auditHistory.js';
  import { categoryState, findCategory, namesWithOwn } from './expenseCategories.js';
  import {
    SOURCE_LABELS,
    centsFromEuros,
    createManualExpense,
    decimalFromMinor,
    errorOf,
    formatDay,
    formatMoney,
    listAuditEvents,
    patchExpense,
    removeExpense,
    removeExpenseCategory,
    restoreExpenseCategory,
    uploadExpenseReceipt,
  } from './api.js';

  // A refusal about the category itself shows under the field; any other
  // under the form (§3.161 Decision 2). invalid_category: a typed name that
  // cannot be a category; removed_category: a category removed since the list
  // was loaded (aspirant-server invoicing_expense_categories.go).
  const CATEGORY_REFUSALS = ['invalid_category', 'removed_category'];

  // A receipt picked on a new entry is checked at the pick, from the file
  // itself, so a refusal comes before the expense is created (system_3
  // #11510). The limit and the three sentences are the server's
  // (aspirant-server invoicing_expense_receipt.go), and like the server this
  // goes by the first bytes, never by the name or the type the browser
  // reports. The server still has the last word at upload.
  const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
  const RECEIPT_SIGNATURES = [
    [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
    [0xff, 0xd8, 0xff], // JPEG
  ];
  async function receiptRefusal(file) {
    if (file.size > RECEIPT_MAX_BYTES) return 'The receipt is larger than 5 MB.';
    if (file.size === 0) return 'Receipt is empty.';
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const known = RECEIPT_SIGNATURES.some((sig) => sig.every((byte, i) => head[i] === byte));
    return known ? '' : 'Unsupported file type (allowed: PDF, JPEG, PNG).';
  }

  const blankForm = () => ({ paid_on: '', amount: '', payee: '', category: 'other', reference: '', note: '' });

  // The form as the expense stands, so Save can send only what changed.
  const formFrom = (e) => ({
    paid_on: String(e.paid_on || '').slice(0, 10),
    amount: decimalFromMinor(e.amount_cents, 2).replace('.', ','),
    payee: e.payee || '',
    category: e.category || 'other',
    reference: e.reference || '',
    note: e.note || '',
  });

  // A work expense entered by hand (system_3 #10414-A): stored directly, no
  // draft or invoice step — an expense is never invoiced. The category list
  // is the owner's own (seeded with ten starter types, extendable, #10424).
  // Given an `expense`, the same dialog edits it (§3.143 Decision 5, system_3
  // #10695): a hand-entered expense is zirs to change in full; an imported
  // one keeps what the bank recorded, and only its category and what it was
  // for change (aspirant-server invoicing_edit.go refuses the rest).
  export default {
    name: 'ManualExpenseDialog',
    components: { AspButton, AspInput, AspModal, AspSelect, LineDescriptionInput, ModalActions, UnsentAsk },
    mixins: [unsentGuard],
    props: {
      open: { type: Boolean, default: false },
      categories: { type: Array, default: () => [] },
      expense: { type: Object, default: null },
    },
    // category-updated: a category Remove or Restore changed, as the server
    // now has it, for the page's list. categories-changed: a Save added or
    // restored a category, so the page reloads its list.
    emits: ['update:open', 'changed', 'category-updated', 'categories-changed'],
    data() {
      return {
        form: blankForm(),
        saving: false,
        error: '',
        // A name chosen from the select's add row: in the field and in its
        // options until it is saved or dropped (§3.161 Decision 2).
        added: '',
        // A category removed here while the expense is not saved with it: the
        // field returned to `justRemovedField`, and until it changes the
        // action offers the removed one back (§3.161 Decision 4).
        justRemoved: '',
        justRemovedField: '',
        categoryBusy: false,
        categoryError: '',
        history: [],
        historyLoaded: false,
        historyError: '',
        confirmingRemove: false,
        removing: false,
        // A receipt picked for a new entry, held in the browser until Save.
        receiptFile: null,
        receiptError: '',
      };
    },
    computed: {
      editing() {
        return !!this.expense;
      },
      imported() {
        return this.editing && this.expense.entry !== 'manual';
      },
      title() {
        return this.editing ? 'Edit expense' : 'Enter expense by hand';
      },
      // In MB, the base the server's limit uses: bytes / 1,048,576.
      receiptSize() {
        if (!this.receiptFile) return '';
        const mb = this.receiptFile.size / (1024 * 1024);
        return mb < 0.05 ? 'under 0.1 MB' : `${mb.toFixed(1)} MB`;
      },
      // While a write runs, no exit closes and none asks (system_3 #11632,
      // §3.166 item 4). Before, only a create with a picked file held the
      // dialog: a close between the create and the upload would leave an
      // upload running that nobody sees fail.
      unsentBusy() {
        return this.saving || this.categoryBusy || this.removing;
      },
      sourceName() {
        if (!this.editing) return '';
        return SOURCE_LABELS[this.expense.source] || this.expense.source || 'the import';
      },
      // An import's payee is its reference, as the row's who reads it
      // (ledgerRows.js expenseParts; design_agent c66842 on system_3 #10695).
      bankPayee() {
        return this.imported ? this.expense.reference || '' : '';
      },
      // The category the expense is saved with; '' on a new expense.
      savedCategory() {
        return this.editing ? this.expense.category || 'other' : '';
      },
      // Zir live categories (§3.161 Decision 5), then the one the expense is
      // saved with when it is not among them (removed, or the list is still
      // loading), then the field's own value: a name just added, or one the
      // list does not hold yet. The select always shows what is stored.
      categoryOptions() {
        const names = namesWithOwn(this.categories, this.savedCategory);
        const current = this.form.category;
        if (current && !names.includes(current)) names.push(current);
        return names.map((n) => ({ value: n, label: n }));
      },
      // The action and the muted line under the field (expenseCategories.js).
      categoryUnder() {
        return categoryState({
          field: this.form.category,
          saved: this.savedCategory,
          categories: this.categories,
          added: this.added,
          justRemoved: this.form.category === this.justRemovedField ? this.justRemoved : '',
        });
      },
      // Save sends the name as a new category only while the field holds it.
      sendsNewCategory() {
        return !!this.added && this.form.category === this.added;
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    watch: {
      // Choosing another category drops a name added here, and ends the
      // offer to restore one just removed; a reason under the field was
      // about the value it held.
      'form.category'(value) {
        if (this.added && value !== this.added) this.added = '';
        if (this.justRemoved && value !== this.justRemovedField) this.justRemoved = '';
        this.categoryError = '';
      },
      open(isOpen) {
        if (isOpen) {
          this.form = this.expense ? formFrom(this.expense) : blankForm();
          this.error = '';
          this.added = '';
          this.justRemoved = '';
          this.justRemovedField = '';
          this.categoryError = '';
          this.confirmingRemove = false;
          this.clearReceipt();
          this.history = [];
          this.historyLoaded = false;
          this.historyError = '';
          if (this.expense) this.loadHistory(this.expense.id);
          this.takeUnsentBaseline();
        }
      },
    },
    methods: {
      formatDay,
      formatMoney,
      async loadHistory(id) {
        try {
          const events = await listAuditEvents('expense', id);
          if (!this.expense || this.expense.id !== id) return;
          this.history = historyLines(events, [], 'expense');
        } catch (err) {
          this.historyError = `The history could not be loaded: ${errorOf(err).message}`;
        } finally {
          this.historyLoaded = true;
        }
      },
      // The add row hands over the trimmed text; nothing is sent until Save.
      addCategory(name) {
        this.added = name;
        this.form.category = name;
      },
      // Remove and Restore act at once, with no confirmation, and Cancel does
      // not undo them; neither saves the expense or closes the dialog. A
      // failure says the server's reason under the field and changes nothing
      // (§3.161 Decision 4).
      async runCategoryAction(action) {
        const category = findCategory(this.categories, action.name);
        if (!category) return;
        this.categoryBusy = true;
        this.categoryError = '';
        try {
          if (action.kind === 'remove') {
            this.$emit('category-updated', await removeExpenseCategory(category.id));
            // Not saved with it: the field goes back to the saved category
            // (Other on a new expense), and the action offers the removed one
            // back until the field changes, so a second tap undoes the remove
            // and never removes a different category.
            if (category.name !== this.savedCategory) {
              this.justRemoved = category.name;
              this.justRemovedField = this.savedCategory || 'other';
              this.form.category = this.justRemovedField;
            }
          } else {
            this.$emit('category-updated', await restoreExpenseCategory(category.id));
            if (this.justRemoved === category.name) {
              this.justRemoved = '';
              this.form.category = category.name;
            }
          }
        } catch (err) {
          this.categoryError = errorOf(err).message;
        } finally {
          this.categoryBusy = false;
        }
      },
      // A refusal of the category goes under its field, the rest under the
      // form.
      showRefusal(err) {
        const { code, message } = errorOf(err);
        if (CATEGORY_REFUSALS.includes(code)) this.categoryError = message;
        else this.error = message;
      },
      check() {
        if (this.imported) return '';
        if (!this.form.paid_on) return 'Enter the date the expense was paid.';
        if (!centsFromEuros(this.form.amount)) return 'Enter the amount paid, for example 45,99.';
        return '';
      },
      // Only what changed: an imported expense may change its category and
      // what it was for, a hand-entered one every field ze typed.
      editPatch() {
        const was = formFrom(this.expense);
        const now = this.form;
        const patch = {};
        if (now.category !== was.category) patch.category = now.category;
        if (patch.category && this.sendsNewCategory) patch.create_category = true;
        if (now.note.trim() !== was.note) patch.note = now.note.trim();
        if (this.imported) return patch;
        if (now.paid_on !== was.paid_on) patch.paid_on = now.paid_on;
        const cents = centsFromEuros(now.amount);
        if (cents !== this.expense.amount_cents) patch.amount_cents = cents;
        if (now.payee.trim() !== was.payee) patch.payee = now.payee.trim();
        if (now.reference.trim() !== was.reference) patch.reference = now.reference.trim();
        return patch;
      },
      // Esc, the scrim, the corner ✕ and Cancel all come through here, and
      // Back through the guard; each asks first when something is unsent
      // (system_3 #11632).
      onOpenChange(value) {
        if (value) return;
        this.requestClose();
      },
      closeNow() {
        this.$emit('update:open', false);
      },
      // What Save would send that the server does not hold, normalised as
      // Save does it, so a field typed and put back is equal again. A new
      // expense compares with the blank form; an edit sends only its patch,
      // so an empty patch is nothing unsent. A picked receipt counts.
      unsentValue() {
        const receipt = this.receiptFile ? { name: this.receiptFile.name, size: this.receiptFile.size } : null;
        if (this.editing) return { patch: this.expense ? this.editPatch() : {}, receipt };
        const f = this.form;
        const cents = String(f.amount).trim() ? centsFromEuros(f.amount) : null;
        return {
          paid_on: f.paid_on,
          amount: cents === null ? String(f.amount).trim() : cents,
          category: f.category,
          payee: f.payee.trim(),
          reference: f.reference.trim(),
          note: f.note.trim(),
          receipt,
        };
      },
      // "Keep editing" after an armed Remove disarms it (§3.166).
      unsentKeptEditing() {
        this.confirmingRemove = false;
      },
      async onReceiptPicked(event) {
        const file = event.target.files[0];
        // Cleared so picking the same file again still fires `change`.
        event.target.value = '';
        if (!file) return;
        const refusal = await receiptRefusal(file);
        // A refused pick leaves the form as it was, an earlier pick included.
        if (refusal) {
          this.receiptError = refusal;
          return;
        }
        this.receiptError = '';
        this.receiptFile = file;
      },
      clearReceipt() {
        this.receiptFile = null;
        this.receiptError = '';
      },
      async save() {
        this.error = this.check();
        if (this.error) return;
        if (this.editing) return this.saveEdit();
        this.saving = true;
        this.categoryError = '';
        const newCategory = this.sendsNewCategory;
        try {
          let expense;
          try {
            expense = await createManualExpense({
              paid_on: this.form.paid_on,
              amount_cents: centsFromEuros(this.form.amount),
              category: this.form.category,
              ...(newCategory ? { create_category: true } : {}),
              payee: this.form.payee.trim(),
              reference: this.form.reference.trim(),
              note: this.form.note.trim(),
            });
          } catch (err) {
            // Nothing was created, the category neither (the server saves
            // both or neither); the picked file stays picked.
            this.showRefusal(err);
            return;
          }
          if (newCategory) this.$emit('categories-changed');
          // The expense exists now and is kept whatever its receipt does: the
          // form never removes it again, and a second Save would make a twin.
          // So the dialog closes either way and the tab says what happened;
          // a receipt that failed is added from the expense's row.
          const outcome = { receipt: 'none' };
          if (this.receiptFile) {
            try {
              await uploadExpenseReceipt(expense.id, this.receiptFile);
              outcome.receipt = 'attached';
            } catch (err) {
              outcome.receipt = 'failed';
              outcome.reason = errorOf(err).message;
            }
          }
          this.saving = false;
          this.$emit('update:open', false);
          this.$emit('changed', outcome);
        } finally {
          this.saving = false;
        }
      },
      async saveEdit() {
        const patch = this.editPatch();
        if (!Object.keys(patch).length) {
          this.$emit('update:open', false);
          return;
        }
        this.saving = true;
        this.categoryError = '';
        try {
          await patchExpense(this.expense.id, patch);
          if (patch.create_category) this.$emit('categories-changed');
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.showRefusal(err);
        } finally {
          this.saving = false;
        }
      },
      // Two steps: the first press arms, the second removes. A removed
      // expense waits under "Show removed rows" (§3.143 Decision 6).
      async remove() {
        if (!this.confirmingRemove) {
          this.confirmingRemove = true;
          return;
        }
        this.removing = true;
        this.error = '';
        try {
          await removeExpense(this.expense.id);
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.error = errorOf(err).message;
        } finally {
          this.removing = false;
          this.confirmingRemove = false;
        }
      },
    },
  };
</script>

<style scoped>
  .manual-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .receipt-pick {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  /* The same small label the date field has. */
  .receipt-pick__label {
    font-size: var(--text-sm);
  }

  /* Visually hidden, still in the DOM: the button opens it, as in the
     Receipt dialog. */
  .receipt-pick__input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
  }

  .receipt-pick__actions {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  /* The name wraps and is never cut. */
  .receipt-pick__file {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .manual-form__lead,
  .manual-form__hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .manual-form__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    align-items: start;
  }

  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--text-sm);
    min-width: 0;
  }

  .date-field input {
    font: inherit;
    font-size: var(--text-base);
    min-height: 34px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-control, var(--border-subtle));
    background: var(--surface-input, transparent);
    color: inherit;
    min-width: 0;
  }

  .manual-form__full {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  /* Left edge on the field's edge, like the action under "What it was
     for"; a long name wraps the label, never clips it (§3.161 Decision 3). */
  .category-field__action {
    align-self: flex-start;
    max-width: 100%;
    height: auto;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: left;
  }

  /* The line under the field wraps too; a long name never clips. */
  .category-field .manual-form__hint {
    overflow-wrap: anywhere;
  }

  /* What the bank recorded, as plain text in two columns (§3.22: nothing
     here can be edited, so nothing looks like an input). The same layout as
     the payment dialog's (system_3 #10694). */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-xs) var(--space-md);
    margin: 0;
  }

  .facts div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .facts dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .history__list {
    margin: 0;
    padding-left: var(--space-lg);
    font-size: var(--text-sm);
  }

  .manual-form__error {
    margin: 0;
    color: var(--feedback-error);
  }

  @media (max-width: 640px) {
    .manual-form__pair {
      grid-template-columns: 1fr;
    }
  }
</style>
