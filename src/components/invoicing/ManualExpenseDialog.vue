<template>
  <AspModal :open="open" :title="title" size="md" @update:open="$emit('update:open', $event)">
    <form class="manual-form" data-test="expense-form" @submit.prevent="save">
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

      <div v-if="!addingCategory" class="manual-form__full full-select">
        <AspSelect v-model="form.category" searchable :options="categoryOptions" label="Category" data-test="expense-category" />
        <button type="button" class="add-category-link" data-test="expense-add-category-link" @click="startAddingCategory">
          + Add a category
        </button>
      </div>
      <div v-else class="manual-form__full add-category">
        <AspInput v-model="newCategoryName" label="New category name" data-test="expense-new-category-name" />
        <div class="add-category__actions">
          <AspButton size="sm" variant="secondary" type="button" data-test="expense-add-category-cancel" @click="addingCategory = false">
            Cancel
          </AspButton>
          <AspButton size="sm" :loading="savingCategory" type="button" data-test="expense-add-category-save" @click="saveCategory">
            Save category
          </AspButton>
        </div>
        <p v-if="categoryError" class="manual-form__error" role="alert" data-test="expense-category-error">{{ categoryError }}</p>
      </div>

      <AspInput v-if="!imported" v-model="form.reference" label="Reference (optional)" data-test="expense-reference" />
      <LineDescriptionInput v-model="form.note" label="What it was for (optional)" data-test="expense-note" />

      <!-- §3.143 Decision 5: what changed before, one tap away. Events come
           newest first. -->
      <details v-if="editing" class="history" data-test="edit-history">
        <summary>History</summary>
        <p v-if="historyError" class="manual-form__hint" data-test="edit-history-error">{{ historyError }}</p>
        <ul v-else-if="history.length" class="history__list">
          <li v-for="line in history" :key="line.id" data-test="edit-history-line">{{ line.text }}</li>
        </ul>
        <p v-else class="manual-form__hint">{{ historyLoaded ? 'No changes recorded yet.' : 'Loading…' }}</p>
      </details>

      <p v-if="error" class="manual-form__error" role="alert" data-test="expense-error">{{ error }}</p>
    </form>
    <template #footer>
      <ModalActions>
        <!-- Remove arms first (§3.143 Decision 6). An expense is never on an
             invoice, so removing it changes nothing else. -->
        <template v-if="editing" #destructive>
          <AspButton :variant="confirmingRemove ? 'destructive' : 'ghost'" :loading="removing" data-test="edit-remove" @click="remove">
            {{ confirmingRemove ? 'Remove this expense' : 'Remove' }}
          </AspButton>
        </template>
        <AspButton variant="secondary" @click="$emit('update:open', false)">Cancel</AspButton>
        <AspButton :loading="saving" data-test="expense-save" @click="save">{{ editing ? 'Save changes' : 'Save expense' }}</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import ModalActions from './ModalActions.vue';
  import { historyLines } from './auditHistory.js';
  import {
    SOURCE_LABELS,
    centsFromEuros,
    createExpenseCategory,
    createManualExpense,
    decimalFromMinor,
    errorOf,
    formatDay,
    formatMoney,
    listAuditEvents,
    patchExpense,
    removeExpense,
  } from './api.js';

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
    components: { AspButton, AspInput, AspModal, AspSelect, LineDescriptionInput, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      categories: { type: Array, default: () => [] },
      expense: { type: Object, default: null },
    },
    emits: ['update:open', 'changed', 'category-added'],
    data() {
      return {
        form: blankForm(),
        saving: false,
        error: '',
        addingCategory: false,
        newCategoryName: '',
        savingCategory: false,
        categoryError: '',
        history: [],
        historyLoaded: false,
        historyError: '',
        confirmingRemove: false,
        removing: false,
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
      sourceName() {
        if (!this.editing) return '';
        return SOURCE_LABELS[this.expense.source] || this.expense.source || 'the import';
      },
      // An import's payee is its reference, as the row's who reads it
      // (ledgerRows.js expenseParts; design_agent c66842 on system_3 #10695).
      bankPayee() {
        return this.imported ? this.expense.reference || '' : '';
      },
      // Zir categories, plus the row's own while the list is still loading
      // or no longer holds it, so the select always shows what is stored.
      categoryOptions() {
        const options = this.categories.map((c) => ({ value: c.name, label: c.name }));
        const current = this.form.category;
        if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
        return options;
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = this.expense ? formFrom(this.expense) : blankForm();
          this.error = '';
          this.addingCategory = false;
          this.newCategoryName = '';
          this.categoryError = '';
          this.confirmingRemove = false;
          this.history = [];
          this.historyLoaded = false;
          this.historyError = '';
          if (this.expense) this.loadHistory(this.expense.id);
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
      startAddingCategory() {
        this.addingCategory = true;
        this.newCategoryName = '';
        this.categoryError = '';
      },
      async saveCategory() {
        const name = this.newCategoryName.trim();
        if (!name) {
          this.categoryError = 'Enter a name for the category.';
          return;
        }
        this.savingCategory = true;
        this.categoryError = '';
        try {
          const category = await createExpenseCategory({ name });
          this.$emit('category-added', category);
          this.form.category = category.name;
          this.addingCategory = false;
        } catch (err) {
          this.categoryError = errorOf(err).message;
        } finally {
          this.savingCategory = false;
        }
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
        if (now.note.trim() !== was.note) patch.note = now.note.trim();
        if (this.imported) return patch;
        if (now.paid_on !== was.paid_on) patch.paid_on = now.paid_on;
        const cents = centsFromEuros(now.amount);
        if (cents !== this.expense.amount_cents) patch.amount_cents = cents;
        if (now.payee.trim() !== was.payee) patch.payee = now.payee.trim();
        if (now.reference.trim() !== was.reference) patch.reference = now.reference.trim();
        return patch;
      },
      async save() {
        this.error = this.check();
        if (this.error) return;
        if (this.editing) return this.saveEdit();
        this.saving = true;
        try {
          await createManualExpense({
            paid_on: this.form.paid_on,
            amount_cents: centsFromEuros(this.form.amount),
            category: this.form.category,
            payee: this.form.payee.trim(),
            reference: this.form.reference.trim(),
            note: this.form.note.trim(),
          });
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.error = errorOf(err).message;
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
        try {
          await patchExpense(this.expense.id, patch);
          this.$emit('update:open', false);
          this.$emit('changed');
        } catch (err) {
          this.error = errorOf(err).message;
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
    color-scheme: light dark;
    min-width: 0;
  }

  .manual-form__full {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .add-category-link {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: var(--text-sm);
    color: var(--text-link, var(--brand-accent));
    cursor: pointer;
    text-decoration: underline;
  }

  .add-category {
    gap: var(--space-sm);
  }

  .add-category__actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
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

  .history summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
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
