<template>
  <AspModal :open="open" title="Enter expense by hand" size="md" @update:open="$emit('update:open', $event)">
    <form class="manual-form" data-test="expense-form" @submit.prevent="save">
      <p class="manual-form__lead">Enter a work expense — money going out, for your own bookkeeping.</p>
      <div class="manual-form__pair manual-form__pair--top">
        <label class="date-field">
          <span>Date paid</span>
          <input v-model="form.paid_on" type="date" :max="today" data-test="expense-date" />
        </label>
        <AspInput v-model="form.amount" label="Amount (€)" inputmode="decimal" placeholder="45,99" data-test="expense-amount" />
      </div>

      <div v-if="!addingCategory" class="manual-form__full full-select">
        <AspSelect v-model="form.category" :options="categoryOptions" label="Category" data-test="expense-category" />
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

      <AspInput v-model="form.reference" label="Reference (optional)" data-test="expense-reference" />
      <LineDescriptionInput v-model="form.note" label="What it was for (optional)" data-test="expense-note" />
      <p v-if="error" class="manual-form__error" role="alert" data-test="expense-error">{{ error }}</p>
    </form>
    <template #footer>
      <ModalActions>
        <AspButton variant="secondary" @click="$emit('update:open', false)">Cancel</AspButton>
        <AspButton :loading="saving" data-test="expense-save" @click="save">Save expense</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
  import LineDescriptionInput from './LineDescriptionInput.vue';
  import ModalActions from './ModalActions.vue';
  import { centsFromEuros, createExpenseCategory, createManualExpense, errorOf } from './api.js';

  const blankForm = () => ({ paid_on: '', amount: '', category: 'other', reference: '', note: '' });

  // A work expense entered by hand (system_3 #10414-A): stored directly, no
  // draft or invoice step — an expense is never invoiced. The category list
  // is the owner's own (seeded with ten starter types, extendable, #10424).
  export default {
    name: 'ManualExpenseDialog',
    components: { AspButton, AspInput, AspModal, AspSelect, LineDescriptionInput, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      categories: { type: Array, default: () => [] },
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
      };
    },
    computed: {
      categoryOptions() {
        return this.categories.map((c) => ({ value: c.name, label: c.name }));
      },
      today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) {
          this.form = blankForm();
          this.error = '';
          this.addingCategory = false;
          this.newCategoryName = '';
          this.categoryError = '';
        }
      },
    },
    methods: {
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
        if (!this.form.paid_on) return 'Enter the date the expense was paid.';
        if (!centsFromEuros(this.form.amount)) return 'Enter the amount paid, for example 45,99.';
        return '';
      },
      async save() {
        this.error = this.check();
        if (this.error) return;
        this.saving = true;
        try {
          await createManualExpense({
            paid_on: this.form.paid_on,
            amount_cents: centsFromEuros(this.form.amount),
            category: this.form.category,
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
    },
  };
</script>

<style scoped>
  .manual-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .manual-form__lead {
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
