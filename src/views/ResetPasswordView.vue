<template>
  <div class="token-view">
    <div class="token-view-card">
      <h1>Choose a new password</h1>

      <p v-if="!token" class="message message--error">
        This link is missing its reset code. Open the link from your email again, or request a
        new one.
      </p>

      <template v-else-if="state === 'done'">
        <p class="message message--success">
          Your password has been changed. You can sign in now.
        </p>
        <RouterLink class="next" to="/login">Go to sign in</RouterLink>
      </template>

      <form v-else @submit.prevent="submit">
        <div class="form-group">
          <AspInput
            v-model="password"
            type="password"
            label="New password"
            name="new-password"
            autocomplete="new-password"
            required
          />
        </div>
        <div class="form-group">
          <AspInput
            v-model="confirmation"
            type="password"
            label="New password again"
            name="confirm-password"
            autocomplete="new-password"
            required
          />
        </div>
        <p class="hint">Between {{ MIN_LENGTH }} and {{ MAX_LENGTH }} characters.</p>
        <AspButton type="submit" class="action" :disabled="busy">
          {{ busy ? 'Saving…' : 'Change my password' }}
        </AspButton>
        <p v-if="error" class="message message--error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script>
  import { AspInput, AspButton } from '@aspirant/design-system';

  // The landing page for the reset link in a password-recovery email
  // (system_3 #5228, under #5119).
  //
  // Why a page rather than the mail linking at a GET endpoint: mail scanners
  // and link-preview fetchers follow links inside messages, and the reset token
  // is single-use — one prefetch would spend it and leave the person holding a
  // link that reports itself invalid. Here the page is unavoidable anyway,
  // since a new password has to be collected; on the confirmation side
  // (VerifyEmailView) it is a deliberate choice for the same reason.

  // Mirrors the server (server/handlers/signup.go). MAX_LENGTH is bcrypt's
  // limit and not a style preference: bcrypt ignores everything past 72 bytes,
  // so the server refuses a longer password rather than silently authenticating
  // someone by its first 72. Stating both bounds up front beats failing a
  // submission that has already cost a round trip.
  const MIN_LENGTH = 10;
  const MAX_LENGTH = 72;

  export default {
    name: 'ResetPasswordView',
    components: { AspInput, AspButton },
    data() {
      return {
        password: '',
        confirmation: '',
        state: 'ready',
        busy: false,
        error: '',
        MIN_LENGTH,
        MAX_LENGTH,
      };
    },
    computed: {
      // Never echoed into the page: it is a live credential until it is spent.
      token() {
        const raw = this.$route.query.token;
        return typeof raw === 'string' && raw !== '' ? raw : '';
      },
    },
    methods: {
      async submit() {
        if (this.busy) return;

        // Checked here as well as on the server, and the order matters: the
        // token is single-use, so a mistyped password that reached the server
        // would burn the link and send the person back to their inbox for
        // another one. The server validates before consuming for the same
        // reason; this just saves the round trip.
        if (this.password !== this.confirmation) {
          this.error = 'The two passwords do not match.';
          return;
        }
        // Length in BYTES, matching bcrypt and the server's own check — a
        // password of emoji is longer than its character count suggests, and
        // `.length` would let it past here and fail there.
        const bytes = new TextEncoder().encode(this.password).length;
        if (bytes < MIN_LENGTH) {
          this.error = `Password must be at least ${MIN_LENGTH} characters.`;
          return;
        }
        if (bytes > MAX_LENGTH) {
          this.error = `Password must be at most ${MAX_LENGTH} characters.`;
          return;
        }

        this.busy = true;
        this.error = '';
        try {
          const response = await fetch('/api/password/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: this.token, password: this.password }),
          });
          if (!response.ok) {
            // One message for every bad-token case, as the API sends it —
            // expired, already used, never existed, minted for verification.
            // Telling them apart tells a guesser which attempts were
            // structurally right.
            const body = await response.json().catch(() => null);
            this.error =
              body?.error?.message || 'That link is invalid or has expired. Request a new one.';
            return;
          }
          this.state = 'done';
          this.password = '';
          this.confirmation = '';
        } catch {
          this.error = 'Could not reach the server. Check your connection and try again.';
        } finally {
          this.busy = false;
        }
      },
    },
  };
</script>

<style scoped>
  .token-view {
    display: flex;
    justify-content: center;
    padding: var(--space-2xl) var(--space-sm);
  }

  .token-view-card {
    width: 100%;
    max-width: 24rem;
    /* Explicit theme-aware ink, for the reason LoginView.vue documents. */
    color: var(--text-body);
  }

  .token-view-card h1 {
    text-align: center;
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
  }

  .hint {
    margin: var(--space-2xs) 0 var(--space-sm);
    font-size: var(--text-sm);
    color: var(--text-muted, inherit);
  }

  .action {
    width: 100%;
  }

  .message {
    margin-top: var(--space-sm);
  }

  .message--error {
    color: var(--text-danger, #b3261e);
  }

  .message--success {
    color: var(--text-success, #1b5e20);
  }

  .next {
    display: inline-block;
    margin-top: var(--space-sm);
    color: var(--text-body);
  }
</style>
