<template>
  <div class="token-view">
    <div class="token-view-card">
      <h1>Create an account</h1>

      <!-- Reading the kill-switch. Deliberately NOT rendered as "closed": not
           knowing and being closed are different states, and only one of them
           is a claim we can make. -->
      <p v-if="state === 'loading'" class="message" data-testid="signup-loading">
        Checking whether sign-up is open…
      </p>

      <template v-else-if="state === 'closed'">
        <!-- Deliberately NOT `message--error`. A closed sign-up is a state the
             operator chose, not a failure — painting it in error red would say
             "something went wrong" and force the copy to argue otherwise. The
             first draft did exactly that, with a sentence explaining that the
             red did not mean what red means. -->
        <p class="message message--notice" data-testid="signup-closed">
          Sign-up is closed at the moment. It can be reopened, so it is worth trying again another
          day.
        </p>
        <RouterLink class="next" to="/login">Go to sign in</RouterLink>
      </template>

      <template v-else-if="state === 'done'">
        <!-- The server's own words, verbatim. See the note in `submit`. -->
        <p class="message message--success" data-testid="signup-done">{{ doneMessage }}</p>
        <RouterLink class="next" to="/login">Go to sign in</RouterLink>
      </template>

      <form v-else @submit.prevent="submit">
        <!-- Shown when the status read failed. The form still renders, because
             the server is the enforcement point and answers 403 with its own
             message if sign-up is in fact closed; claiming "closed" off a
             failed read would be inventing a state we did not observe. -->
        <p v-if="statusUnknown" class="hint" data-testid="signup-status-unknown">
          Could not check whether sign-up is open. You can still try — if it is closed, the form
          will say so.
        </p>

        <div class="form-group">
          <AspInput
            v-model="username"
            label="Username"
            name="username"
            autocomplete="username"
            required
          />
        </div>
        <div class="form-group">
          <AspInput
            v-model="email"
            type="email"
            label="Email address"
            name="email"
            autocomplete="email"
            required
          />
        </div>
        <div class="form-group">
          <AspInput
            v-model="password"
            type="password"
            label="Password"
            name="new-password"
            autocomplete="new-password"
            required
          />
        </div>
        <p class="hint">Between {{ MIN_LENGTH }} and {{ MAX_LENGTH }} characters.</p>
        <AspButton type="submit" class="action" :disabled="busy" data-testid="signup-submit">
          {{ busy ? 'Creating…' : 'Create my account' }}
        </AspButton>
        <p v-if="error" class="message message--error" data-testid="signup-error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script>
  import { AspInput, AspButton } from '@aspirant/design-system';

  // The public sign-up entry (system_3 #5338, under #5296).
  //
  // `POST /signup` shipped in #5220 and nothing in this client called it, so
  // the server's self-service flow had a working second half — VerifyEmailView
  // lands the confirmation link, ResetPasswordView lands the reset link — and
  // no first half. This is the first half for sign-up.

  // Mirrors the server (server/handlers/signup.go). MAX_LENGTH is bcrypt's
  // limit rather than a style preference: bcrypt ignores everything past 72
  // bytes, so the server refuses a longer password rather than silently
  // authenticating someone by its first 72.
  const MIN_LENGTH = 10;
  const MAX_LENGTH = 72;

  export default {
    name: 'SignupView',
    components: { AspInput, AspButton },
    data() {
      return {
        username: '',
        email: '',
        password: '',
        // loading -> ready | closed | done. `statusUnknown` rides alongside
        // `ready` rather than being a fourth state, because the form it shows
        // is the same form.
        state: 'loading',
        statusUnknown: false,
        doneMessage: '',
        busy: false,
        error: '',
        MIN_LENGTH,
        MAX_LENGTH,
      };
    },
    async created() {
      await this.readSignupStatus();
    },
    methods: {
      async readSignupStatus() {
        try {
          const response = await fetch('/api/signup/status');
          if (response.status === 404) {
            // The running server predates the kill-switch (#5289). That is not
            // a failure and not a closed door — sign-up simply cannot be
            // closed. Same reading UserAdmin.vue takes of the same 404.
            this.state = 'ready';
            return;
          }
          if (!response.ok) throw new Error(`status ${response.status}`);
          const body = await response.json();
          this.state = body.signup_enabled ? 'ready' : 'closed';
        } catch (error) {
          console.error('Could not read sign-up status:', error);
          this.state = 'ready';
          this.statusUnknown = true;
        }
      },

      async submit() {
        if (this.busy) return;

        // Checked here as well as on the server, purely to save a round trip.
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
          const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: this.username,
              email: this.email,
              password: this.password,
            }),
          });
          const body = await response.json().catch(() => null);

          if (!response.ok) {
            this.error = body?.error?.message || 'Could not create the account. Try again.';
            return;
          }

          // THE MESSAGE IS THE SERVER'S AND IS RENDERED VERBATIM.
          //
          // `POST /signup` answers a created account, a taken username and a
          // taken email with one identical sentence, and its tests assert that
          // byte-for-byte. The whole point is that an unauthenticated caller
          // cannot learn whether an account exists. Substituting a friendlier
          // "welcome!" here — or branching on anything to say "that username is
          // taken" — would rebuild that oracle in the client and undo the
          // server's care. Do not add such a branch.
          this.doneMessage =
            body?.message ||
            'If that username and address are available, a verification link has been sent. Check your inbox.';
          this.state = 'done';
          this.username = '';
          this.email = '';
          this.password = '';
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
  /* Copied from ResetPasswordView.vue rather than approximated: these three
     views (verify, reset, sign up) are one flow seen at three moments, and a
     visitor should not be able to tell they were built months apart. The
     ink tokens are NOT copied: that file uses `var(--text-danger, #b3261e)`
     and `var(--text-success, #1b5e20)`, and neither token exists in the design
     system — both always fall through to a fixed literal that does not change
     with the theme. The real, theme-aware tokens are `--feedback-error-text`
     and `--feedback-success-text` (light #8b0f10/#005d26, dark #ff7a7c/#4de292),
     used below. The siblings' dead tokens are filed separately rather than
     copied for the sake of looking consistent. */
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

  .form-group {
    margin-bottom: var(--space-sm);
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
    color: var(--feedback-error-text);
  }

  /* A chosen state, not a fault: the informational ink, not the error one. */
  .message--notice {
    color: var(--feedback-info-text);
  }

  .message--success {
    color: var(--feedback-success-text);
  }

  .next {
    display: inline-block;
    margin-top: var(--space-sm);
    color: var(--text-body);
  }
</style>
