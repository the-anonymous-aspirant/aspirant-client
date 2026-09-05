<template>
  <div class="user-admin-view">
    <h1>User Management</h1>
    <h2 class="page-subtitle">User accounts and permissions</h2>

    <!-- Sign-up kill-switch (system_3 #5291, server half #5289). A labelled
         action button rather than a toggle: a switch's position has to be
         learned, a button that says "Close sign-up" does not. -->
    <section class="signup-switch" data-testid="signup-switch">
      <div class="signup-switch__state">
        <span class="signup-switch__label">Public sign-up</span>
        <AspBadge v-if="signup.state === 'loading'" status="neutral" data-testid="signup-state">Checking…</AspBadge>
        <AspBadge v-else-if="signup.state === 'unavailable'" status="caution" data-testid="signup-state">
          Unknown — this server does not report it
        </AspBadge>
        <AspBadge v-else-if="signup.enabled" status="positive" data-testid="signup-state">Open</AspBadge>
        <AspBadge v-else status="negative" data-testid="signup-state">Closed</AspBadge>
      </div>
      <p v-if="signup.state === 'unavailable'" class="signup-switch__note">
        The sign-up status endpoint is not available on the running server. Nothing is broken — the
        switch simply cannot be read or set until the server is up to date.
      </p>
      <p v-else-if="signup.state === 'failed'" class="signup-switch__note" data-testid="signup-error">
        Could not read the sign-up status.
        <AspButton variant="secondary" size="sm" @click="fetchSignupStatus">Try again</AspButton>
      </p>
      <AspButton
        v-else-if="signup.state === 'ready'"
        :variant="signup.enabled ? 'destructive' : 'primary'"
        :disabled="signup.saving"
        data-testid="signup-action"
        @click="signup.enabled ? (confirmingClose = true) : setSignup(true)"
      >
        {{ signup.enabled ? 'Close sign-up' : 'Open sign-up' }}
      </AspButton>
    </section>

    <AspButton variant="primary" @click="resetForm(); showUserForm = true;">
      Add New User
    </AspButton>

    <UserForm v-if="showUserForm" @save="handleSaveUser" @cancel="resetForm" :user="user" />

    <h2>Existing Users</h2>
    <div class="table-wrapper">
      <p v-if="roster.state === 'loading'" class="roster-note" data-testid="roster-loading">Loading users…</p>
      <p v-else-if="roster.state === 'failed'" class="roster-note" data-testid="roster-error">
        Could not load the user list.
        <AspButton variant="secondary" size="sm" @click="fetchUsers">Try again</AspButton>
      </p>
      <AspDataTable v-else :columns="columns" :rows="users" row-key="ID">
        <template #cell-verified="{ row }">
          <AspBadge v-if="row.email_verified_at" status="positive" size="sm" data-testid="verified-badge">
            {{ formatDate(row.email_verified_at) }}
          </AspBadge>
          <AspBadge v-else status="caution" size="sm" data-testid="unverified-badge">Never verified</AspBadge>
        </template>
        <template #cell-CreatedAt="{ row }">{{ formatDate(row.CreatedAt) }}</template>
        <template #cell-UpdatedAt="{ row }">{{ formatDate(row.UpdatedAt) }}</template>
        <template #cell-actions="{ row }">
          <div class="actions-cell">
            <AspButton variant="secondary" size="sm" @click="editUser(row)">Edit</AspButton>
            <AspButton
              v-if="row.access_role === 'Blocked'"
              variant="secondary"
              size="sm"
              data-testid="unblock-user"
              @click="unblockUser(row)"
            >
              Unblock
            </AspButton>
            <AspButton v-else variant="secondary" size="sm" data-testid="block-user" @click="blocking = row">
              Block
            </AspButton>
            <AspButton variant="destructive" size="sm" @click="deleteUser(row)">Delete</AspButton>
          </div>
        </template>
        <template #empty>No users.</template>
      </AspDataTable>
    </div>

    <!-- Closing sign-up is the direction worth a confirmation. Opening it is
         not: it restores the default, and a dialog in front of every recovery
         is a dialog people learn to click through. -->
    <AspModal
      :open="confirmingClose"
      title="Close sign-up?"
      size="sm"
      @update:open="(open) => (open ? null : (confirmingClose = false))"
    >
      <p>
        Nobody will be able to create a new account until you open it again. People who have already
        signed up can still confirm their address and recover a password.
      </p>
      <template #footer>
        <AspButton variant="secondary" @click="confirmingClose = false">Cancel</AspButton>
        <AspButton variant="destructive" data-testid="confirm-close-signup" @click="setSignup(false)">
          Close sign-up
        </AspButton>
      </template>
    </AspModal>

    <AspModal
      :open="blocking !== null"
      title="Block this account?"
      size="sm"
      @update:open="(open) => (open ? null : (blocking = null))"
    >
      <p v-if="blocking">
        <strong>{{ blocking.username }}</strong> loses access to everything and is
        <strong>signed out immediately</strong> — any session it currently has stops working on its
        next request. The account and its data are kept; unblock restores the tier it has now
        ({{ blocking.access_role }}).
      </p>
      <template #footer>
        <AspButton variant="secondary" @click="blocking = null">Cancel</AspButton>
        <AspButton variant="destructive" data-testid="confirm-block-user" @click="blockUser">
          Block account
        </AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspBadge, AspButton, AspDataTable, AspModal } from '@aspirant/design-system';
  import UserForm from '../../components/UserForm.vue';

  // The tier an account is restored to when it is unblocked, if nothing else is
  // known. Blocking records the account's previous tier so unblock puts it back
  // where it was; this is only the floor for an account that was already blocked
  // before this screen existed, and it is the lowest authenticated tier on
  // purpose — guessing upward would hand out access nobody granted.
  const DEFAULT_RESTORE_ROLE = 'Viewer';

  export default {
    components: {
      UserForm,
      AspBadge,
      AspButton,
      AspDataTable,
      AspModal,
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
        // Read state, explicit. This view used to swallow every failure into
        // console.error and render an empty table, so a backend that was down
        // and a site with no users looked identical.
        roster: { state: 'loading' },
        signup: { state: 'loading', enabled: true, saving: false },
        confirmingClose: false,
        // The row awaiting a block confirmation, or null.
        blocking: null,
        // user id → the tier it held when this screen blocked it, so unblock
        // restores rather than guesses.
        priorRole: {},
        // sortable:false throughout — the native table had no sort; preserve parity.
        columns: [
          { key: 'ID', label: 'ID', sortable: false },
          { key: 'username', label: 'Username', sortable: false },
          { key: 'email', label: 'Email', sortable: false },
          { key: 'access_role', label: 'Role', sortable: false },
          // The column moderation actually turns on: an account that never
          // followed its verification link is what a bot sign-up looks like
          // from here (server half: #5290).
          { key: 'verified', label: 'Verified', sortable: false },
          { key: 'comment', label: 'Comment', sortable: false },
          { key: 'CreatedAt', label: 'Created', sortable: false },
          { key: 'UpdatedAt', label: 'Updated', sortable: false },
          { key: 'actions', label: 'Actions', sortable: false },
        ],
      };
    },
    methods: {
      async fetchUsers() {
        this.roster = { state: 'loading' };
        try {
          const response = await axios.get('/api/data_models/users');
          this.users = response.data.items || response.data.data || [];
          this.roster = { state: 'ready' };
        } catch (error) {
          console.error('Error fetching users:', error);
          this.roster = { state: 'failed' };
        }
      },

      async fetchSignupStatus() {
        this.signup = { ...this.signup, state: 'loading' };
        try {
          const response = await axios.get('/api/signup/status');
          this.signup = { state: 'ready', enabled: !!response.data.signup_enabled, saving: false };
        } catch (error) {
          // A 404 is not a failure to report as one: it means the running
          // server predates the kill-switch. The page stays usable and says so,
          // rather than showing a control that cannot work.
          if (error.response && error.response.status === 404) {
            this.signup = { state: 'unavailable', enabled: true, saving: false };
            return;
          }
          console.error('Error reading sign-up status:', error);
          this.signup = { state: 'failed', enabled: true, saving: false };
        }
      },

      async setSignup(enabled) {
        this.confirmingClose = false;
        this.signup = { ...this.signup, saving: true };
        try {
          await axios.put('/api/settings/signup', { enabled });
          // Re-read rather than trust the local flip: the server is the
          // authority on this and a write that half-succeeded must not leave
          // the screen claiming otherwise.
          await this.fetchSignupStatus();
        } catch (error) {
          console.error('Error updating sign-up status:', error);
          this.signup = { ...this.signup, state: 'failed', saving: false };
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

      // Block / unblock are a tier change through the existing user PUT, not a
      // second endpoint: "Blocked" is one of the four tiers (#5113-A2) and the
      // route already resolves it. Since #5290 the change also ends the
      // account's live sessions, which is what the confirmation copy promises.
      async blockUser() {
        const target = this.blocking;
        this.blocking = null;
        if (!target) return;
        this.priorRole = { ...this.priorRole, [target.ID]: target.access_role };
        await this.setUserRole(target, 'Blocked');
      },
      async unblockUser(user) {
        await this.setUserRole(user, this.priorRole[user.ID] || DEFAULT_RESTORE_ROLE);
      },
      async setUserRole(user, accessRole) {
        try {
          await axios.put(`/api/data_models/users/${user.ID}`, {
            username: user.username,
            email: user.email,
            comment: user.comment,
            access_role: accessRole,
          });
          this.fetchUsers();
        } catch (error) {
          console.error('Error changing user tier:', error);
          this.roster = { state: 'failed' };
        }
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
      this.fetchSignupStatus();
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

  .signup-switch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .signup-switch__state {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .signup-switch__label {
    font-weight: 600;
  }

  .signup-switch__note,
  .roster-note {
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    text-align: center;
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
    display: inline-flex;
    gap: var(--space-2xs);
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .user-admin-view {
      padding: var(--space-md);
    }
  }
</style>
