<template>
  <section class="clients-panel" data-test="clients-panel">
    <div class="panel-head">
      <h2>Clients</h2>
      <AspButton data-test="client-add" @click="startAdd">Add client</AspButton>
    </div>

    <AspEmptyState
      v-if="clients.length === 0"
      heading="No clients yet"
      message="An invoice needs a client with a name and a postal address."
      data-test="clients-empty"
    />
    <AspDataTable
      v-else
      :columns="columns"
      :rows="rows"
      row-key="id"
      density="compact"
      caption="Clients"
      :row-attrs="(row) => ({ 'data-test': 'client-row' })"
    >
      <template #cell-address="{ value }">
        <span class="multiline">{{ value }}</span>
      </template>
      <template #cell-actions="{ row }">
        <AspButton variant="ghost" size="sm" :data-test="`client-edit-${row.id}`" @click="startEdit(row)">Edit</AspButton>
      </template>
    </AspDataTable>

    <AspModal v-model:open="editorOpen" :title="editing ? 'Edit client' : 'Add client'" size="md">
      <form class="client-form" data-test="client-form" @submit.prevent="save">
        <AspInput v-model="form.name" label="Name" required />
        <AspTextarea v-model="form.address" label="Postal address" :rows="3" required />
        <AspInput v-model="form.email" type="email" label="Email" />
        <AspInput v-model="form.paypal_email" type="email" label="PayPal email" hint="Imported payments from this address are linked to the client." />
        <p v-if="error" class="client-form__error" role="alert" data-test="client-error">{{ error }}</p>
      </form>
      <template #footer>
        <AspButton variant="secondary" @click="editorOpen = false">Cancel</AspButton>
        <AspButton :loading="saving" data-test="client-save" @click="save">Save</AspButton>
      </template>
    </AspModal>
  </section>
</template>

<script>
  import { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import { createClient, errorOf, updateClient } from './api.js';

  // The people Flower invoices (spec §4.2). Name and address are required
  // here because the server requires them; the server is still the gate.
  export default {
    name: 'ClientsPanel',
    components: { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea },
    props: {
      clients: { type: Array, required: true },
    },
    emits: ['changed'],
    data() {
      return {
        editorOpen: false,
        editing: null,
        form: { name: '', address: '', email: '', paypal_email: '' },
        saving: false,
        error: '',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'address', label: 'Address', sortable: false },
          { key: 'email', label: 'Email' },
          { key: 'paypal_email', label: 'PayPal email' },
          { key: 'actions', label: '', sortable: false, align: 'right' },
        ],
      };
    },
    computed: {
      rows() {
        return this.clients.map((c) => ({ ...c, actions: '' }));
      },
    },
    methods: {
      startAdd() {
        this.editing = null;
        this.form = { name: '', address: '', email: '', paypal_email: '' };
        this.error = '';
        this.editorOpen = true;
      },
      startEdit(row) {
        this.editing = row;
        this.form = { name: row.name, address: row.address, email: row.email, paypal_email: row.paypal_email };
        this.error = '';
        this.editorOpen = true;
      },
      async save() {
        if (!this.form.name.trim() || !this.form.address.trim()) {
          this.error = 'A client needs a name and a postal address.';
          return;
        }
        this.saving = true;
        this.error = '';
        try {
          if (this.editing) await updateClient(this.editing.id, this.form);
          else await createClient(this.form);
          this.editorOpen = false;
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
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .panel-head h2 {
    margin: 0;
  }

  .multiline {
    white-space: pre-line;
  }

  .client-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .client-form__error {
    color: var(--feedback-error);
    margin: 0;
  }
</style>
