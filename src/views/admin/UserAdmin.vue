<template>
  <div class="user-admin-view">
    <h1>User Management</h1>
    <h2 class="page-subtitle">User accounts and permissions</h2>

    <button @click="resetForm(); showUserForm = true;" class="btn btn-add">
      Add New User
    </button>

    <UserForm v-if="showUserForm" @save="handleSaveUser" @cancel="resetForm" :user="user" />

    <h2>Existing Users</h2>
    <div class="table-wrapper">
      <AspDataTable :columns="columns" :rows="users" row-key="ID">
        <template #cell-CreatedAt="{ row }">{{ formatDate(row.CreatedAt) }}</template>
        <template #cell-UpdatedAt="{ row }">{{ formatDate(row.UpdatedAt) }}</template>
        <template #cell-actions="{ row }">
          <div class="actions-cell">
            <button @click="editUser(row)" class="btn btn-edit">Edit</button>
            <button @click="deleteUser(row)" class="btn btn-delete">Delete</button>
          </div>
        </template>
        <template #empty>No users.</template>
      </AspDataTable>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspDataTable } from '@aspirant/design-system';
  import UserForm from '../../components/UserForm.vue';

  export default {
    components: {
      UserForm,
      AspDataTable,
    },

    data() {
      return {
        user: {
          username: '',
          email: '',
          password: '',
          access_role: '',
          comment: '',
        },
        users: [],
        showUserForm: false,
        // sortable:false throughout — the native table had no sort; preserve parity.
        columns: [
          { key: 'ID', label: 'ID', sortable: false },
          { key: 'username', label: 'Username', sortable: false },
          { key: 'email', label: 'Email', sortable: false },
          { key: 'access_role', label: 'Role', sortable: false },
          { key: 'comment', label: 'Comment', sortable: false },
          { key: 'CreatedAt', label: 'Created', sortable: false },
          { key: 'UpdatedAt', label: 'Updated', sortable: false },
          { key: 'actions', label: 'Actions', sortable: false },
        ],
      };
    },
    methods: {
      async fetchUsers() {
        try {
          const response = await axios.get('/api/data_models/users');
          this.users = response.data.items || response.data.data;
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      },
      async saveUser(user) {
        try {
          if (user.ID) {
            if (!user.password) user.password = '';
            await axios.put(`/api/data_models/users/${user.ID}`, user);
          } else {
            await axios.post(`/api/data_models/users`, user);
          }
          this.fetchUsers();
          this.resetForm();
        } catch (error) {
          console.error('Error saving user:', error);
        }
      },
      handleSaveUser(user) {
        this.saveUser(user);
      },
      editUser(user) {
        this.user = { ...user };
        this.showUserForm = true;
      },
      async deleteUser(user) {
        try {
          await axios.delete(`/api/data_models/users/${user.ID}`);
          this.fetchUsers();
        } catch (error) {
          console.error('Error deleting user:', error);
        }
      },
      resetForm() {
        this.user = {
          username: '',
          email: '',
          password: '',
          access_role: '',
          comment: '',
        };
        this.showUserForm = false;
      },
      formatDate(dateString) {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString();
      },
    },
    mounted() {
      this.fetchUsers();
    },
  };
</script>

<style scoped>
  .user-admin-view {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    width: 100%;
    max-width: 1000px;
    margin: 0 auto;
    color: var(--text-on-light);
  }

  .page-subtitle {
    color: var(--text-muted);
    font-weight: normal;
    margin-bottom: var(--space-xl);
  }

  h2 {
    margin-top: var(--space-xl);
    margin-bottom: var(--space-sm);
  }

  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  .actions-cell {
    white-space: nowrap;
  }

  .btn {
    padding: var(--space-2xs) var(--space-sm);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 600;
    font-size: var(--text-sm);
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .btn-add {
    background-color: var(--feedback-success);
    color: var(--text-on-dark);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
  }

  .btn-edit {
    background-color: var(--brand-accent);
    color: var(--text-on-dark);
    margin-right: var(--space-2xs);
  }

  .btn-delete {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
  }

  @media (max-width: 768px) {
    .user-admin-view {
      padding: var(--space-md);
    }
  }
</style>
