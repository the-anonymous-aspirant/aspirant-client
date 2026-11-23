<template>
  <div class="user-admin-view page">
    <h1>Users</h1>
    <h2 class="page-subtitle">User accounts and permissions</h2>

    <!-- Sign-up kill-switch (system_3 #5291, server half #5289). A labelled
         action button rather than a toggle: a switch's position has to be
         learned, a button that says "Close sign-up" does not. Quiet at rest:
         red belongs to the confirmation, not to the page's first control
         (system_3 #11004, UX walk AA2). -->
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
        :variant="signup.enabled ? 'secondary' : 'primary'"
        :disabled="signup.saving"
        data-testid="signup-action"
        @click="signup.enabled ? (confirmingClose = true) : setSignup(true)"
      >
        {{ signup.enabled ? 'Close sign-up' : 'Open sign-up' }}
      </AspButton>
      <!-- A refused WRITE, reported separately from a failed READ and without
           taking the button away (system_3 #7042). The server's own sentence is
           shown because it is the only thing that says what to do about it: a
           409 from aspirant-server#123 names the four SMTP variables this
           deployment is missing, and that reason reaches the operator nowhere
           else. -->
      <p v-if="signup.writeError" class="signup-switch__note" data-testid="signup-write-error">
        {{ signup.writeError }}
      </p>
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
      <template v-else>
      <!-- A refused row action, said on the page (#11004): a failed delete
           used to reach the console only. -->
      <p v-if="actionError" class="action-error" role="alert" data-test="row-action-error">{{ actionError }}</p>
      <AspDataTable :columns="columns" :rows="users" row-key="ID">
        <template #cell-verified="{ row }">
          <AspBadge v-if="row.email_verified_at" status="positive" size="sm" data-testid="verified-badge">
            {{ formatDate(row.email_verified_at) }}
          </AspBadge>
          <AspBadge v-else status="caution" size="sm" data-testid="unverified-badge">Never verified</AspBadge>
        </template>
        <template #cell-CreatedAt="{ row }">{{ formatDate(row.CreatedAt) }}</template>
        <template #cell-UpdatedAt="{ row }">{{ formatDate(row.UpdatedAt) }}</template>
        <template #cell-actions="{ row }">
          <!-- Quiet at rest, Delete set apart and last (§3.122 P5); red is the
               confirmation's. Block and Delete are not offered on the account
               signed in here: one slip there locks out, or removes, the
               person using the page (#11004). The server refuses deleting
               your own account too; this is the screen saying so first. -->
          <div class="actions-cell">
            <AspButton variant="secondary" size="sm" @click="editUser(row)">Edit</AspButton>
            <span v-if="isSelf(row)" class="actions-self" data-test="self-row-note">Your account</span>
            <AspButton
              v-else-if="row.access_role === 'Blocked'"
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
            <AspButton
              v-if="!isSelf(row)"
              variant="secondary"
              size="sm"
              class="actions-delete"
              data-test="delete-user"
              @click="deleting = row"
            >
              Delete
            </AspButton>
          </div>
        </template>
        <template #empty>No users.</template>
      </AspDataTable>
      </template>
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

    <!-- Delete names the account and what goes, in Block's grammar, and points
         at Block for the case that only wants access stopped (#11004). The
         server soft-deletes the user row (gorm.Model): the account cannot sign
         in and leaves this list; nothing on this screen brings it back. -->
    <AspModal
      :open="deleting !== null"
      title="Delete this account?"
      size="sm"
      @update:open="(open) => (open ? null : (deleting = null))"
    >
      <p v-if="deleting" data-test="delete-consequence">
        <strong>{{ deleting.username }}</strong> can no longer sign in, and the account leaves this
        list. There is no undo on this screen. To stop access and keep the account, block it
        instead.
      </p>
      <template #footer>
        <AspButton variant="secondary" @click="deleting = null">Cancel</AspButton>
        <AspButton variant="destructive" data-test="confirm-delete-user" @click="deleteUser">
          Delete account
        </AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspBadge, AspButton, AspDataTable, AspModal } from '@aspirant/design-system';
  import UserForm from '../../components/UserForm.vue';
  import { utcStamp } from '../../utils/utcStamp.js';

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
        // `state` is the READ's state; `writeError` is the last write's
        // refusal, held separately on purpose. They used to be one field, so a
        // refused PUT rendered the read's copy ("Could not read the sign-up
        // status") and replaced the button with a Try-again that re-ran the
        // read — naming the wrong operation and removing the only control that
        // could retry the right one (#7042).
        signup: { state: 'loading', enabled: true, saving: false, writeError: null },
        confirmingClose: false,
        // The row awaiting a block confirmation, or null.
        blocking: null,
        // The row awaiting a delete confirmation, or null (#11004).
        deleting: null,
        // The last refused row action, in words, or null (#11004).
        actionError: null,
        // The account signed in here, as the shell and route guard read it. A
        // client hint, used only to not offer Block and Delete on it; the
        // server decides (it refuses deleting your own account).
        selfName: localStorage.getItem('user_name') || '',
        // user id → the tier it held when this screen blocked it, so unblock
        // restores rather than guesses.
        priorRole: {},
        // sortable:false throughout — the native table had no sort; preserve parity.
        columns: [
          { key: 'ID', label: 'ID', sortable: false },
          // On a phone card the username heads it and the role, which is
          // also where Blocked shows, sits at the right (§3.122 P5; system_3
          // #11010, UX walk AA8). It was a bare ID number.
          { key: 'username', label: 'Username', sortable: false, role: 'identity' },
          { key: 'email', label: 'Email', sortable: false },
          { key: 'access_role', label: 'Role', sortable: false, role: 'figure' },
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
          // writeError clears here and only here: a read that comes back after
          // a successful write is the evidence the refusal no longer holds.
          this.signup = {
            state: 'ready',
            enabled: !!response.data.signup_enabled,
            saving: false,
            writeError: null,
          };
        } catch (error) {
          // A 404 is not a failure to report as one: it means the running
          // server predates the kill-switch. The page stays usable and says so,
          // rather than showing a control that cannot work.
          if (error.response && error.response.status === 404) {
            this.signup = { state: 'unavailable', enabled: true, saving: false, writeError: null };
            return;
          }
          console.error('Error reading sign-up status:', error);
          this.signup = { state: 'failed', enabled: true, saving: false, writeError: null };
        }
      },

      async setSignup(enabled) {
        this.confirmingClose = false;
        this.signup = { ...this.signup, saving: true, writeError: null };
        try {
          await axios.put('/api/settings/signup', { enabled });
          // Re-read rather than trust the local flip: the server is the
          // authority on this and a write that half-succeeded must not leave
          // the screen claiming otherwise.
          await this.fetchSignupStatus();
        } catch (error) {
          console.error('Error updating sign-up status:', error);
          // `state` is deliberately untouched: the read is still good, so the
          // badge keeps telling the truth and the button stays on screen to be
          // pressed again once the reason below is dealt with.
          //
          // The fallback is reached only when there is no server sentence at
          // all — an unreachable server, or a proxy answering with no body.
          // `error.message` is deliberately NOT consulted before it: axios
          // always has one, so putting it first makes the product copy
          // unreachable (the #5304 lesson in useBrowserFlows.js).
          this.signup = {
            ...this.signup,
            saving: false,
            writeError:
              error.response?.data?.error?.message ||
              'Could not change the sign-up status, and the server did not say why. It may be unreachable — try again.',
          };
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
        this.actionError = null;
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
          // A refused write, not a failed read: the list is still right, so it
          // stays, and the sentence names the change that did not happen.
          const why = this.refusal(error, 'the server did not say why. It may be unreachable — try again.');
          this.actionError = `Could not change ${user.username}'s access: ${why}`;
        }
      },

      isSelf(row) {
        return !!this.selfName && row.username === this.selfName;
      },
      // The server's own sentence when it sent one ("Cannot delete your own
      // account", "User not found"), else ours; never axios's message.
      refusal(error, fallback) {
        return error.response?.data?.error?.message || fallback;
      },
      async deleteUser() {
        const target = this.deleting;
        this.deleting = null;
        if (!target) return;
        this.actionError = null;
        try {
          await axios.delete(`/api/data_models/users/${target.ID}`);
          this.fetchUsers();
        } catch (error) {
          console.error('Error deleting user:', error);
          const why = this.refusal(error, 'the server did not say why. It may be unreachable — try again.');
          this.actionError = `Could not delete ${target.username}: ${why}`;
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
        return utcStamp(dateString);
      },
    },
    mounted() {
      this.fetchUsers();
      this.fetchSignupStatus();
    },
  };
</script>

<style scoped>
  /* The shell's .app-main carries the one gutter and .page the one title y
     (system_3 #9192, #9501): no root padding, no 100vh box (it scrolled 64 px
     past the content), nothing centred at page level (§3.114). */
  .user-admin-view {
    width: 100%;
    /* Nine columns wide: with a long email address the roster measures ~1250px,
       so a 1000px cap put the Actions column past the right edge of the DS
       scroller on screens with room to spare (system_3 #5355). The cap is here
       to bound the prose above the table, not the table — it now sits above the
       roster's natural width, and narrow viewports still scroll, cued by the
       scroller's own edge fade. */
    max-width: 1400px;
    margin: 0;
    color: var(--text-on-light);
  }

  /* Starts at the gutter like the rest of the page: centring this section was
     the root's page-level centring repeated one level down (#9596, §3.114). */
  .signup-switch {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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
  }

  /* The roster note sits in the table area, centred like the table's own
     "No users." row; the sign-up note above is page text and stays left. */
  .roster-note {
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

  /* 8px between targets, and Delete set apart from the rest (§3.99,
     §3.122 P5; #11004). They were 4px apart at 390. */
  .actions-cell {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    white-space: nowrap;
  }

  .actions-delete {
    margin-left: var(--space-lg);
  }

  .actions-self {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* A refusal looks like one: the design system's error ink, as the site's
     other failed lines are drawn (design c68794 on #11004). */
  .action-error {
    color: var(--feedback-error-text);
    margin: 0 0 var(--space-sm);
  }

  @media (max-width: 768px) {
  }
</style>
