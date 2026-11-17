<template>
  <div class="token-view page">
    <h1>Get a new confirmation link</h1>
    <AspCard class="token-view-card" padding="md">
      <template v-if="state === 'done'">
        <!-- The server's own words, verbatim. See the note in `submit`. -->
        <p class="message message--success" data-test="resend-done">{{ doneMessage }}</p>
        <!-- Design ack c71363: the same sentence VerifyEmailView's dead-link
             branch uses. It is the same for every address, so it tells
             nothing — but it is the one line that helps the one person the
             constant answer does not: an already-confirmed owner, sent
             nothing (c70050 point 2). -->
        <p class="message" data-test="resend-try-sign-in">
          If you confirmed your address already, <RouterLink to="/login">sign in</RouterLink>.
        </p>
      </template>

      <form v-else @submit.prevent="submit">
        <p class="hint">
          Enter the address you signed up with and we will send a new link for confirming it.
        </p>
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
        <AspButton type="submit" class="action" :disabled="busy" data-test="resend-submit">
          {{ busy ? 'Sending…' : 'Send me a new link' }}
        </AspButton>
        <p v-if="error" class="message message--error" data-test="resend-error">{{ error }}</p>
      </form>
    </AspCard>
  </div>
</template>

<script>
  import { AspCard, AspInput, AspButton } from '@aspirant/design-system';

  // #11143-A2: the other half of #10979's dead-link sentence. Someone whose
  // confirmation link is spent, expired or cut short had no way to ask for a
  // new one; VerifyEmailView now links here from both its dead-link and
  // missing-code branches.
  //
  // Built like ForgotPasswordView, which answers the same shape of question
  // for the same reason: one constant message for any address, so the client
  // never rebuilds the account-existence oracle the server (ResendVerification
  // Handler, aspirant-server #11391) deliberately does not have. Words per
  // design ack c71363.
  export default {
    name: 'ResendVerificationView',
    components: { AspCard, AspInput, AspButton },
    data() {
      return {
        email: '',
        state: 'ready',
        doneMessage: '',
        busy: false,
        error: '',
      };
    },
    methods: {
      async submit() {
        if (this.busy) return;
        this.busy = true;
        this.error = '';
        try {
          const response = await fetch('/api/verify-email/resend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email }),
          });

          if (response.status === 429) {
            // One message for every limit, so it says nothing about the
            // address (design ack c71363): the rate-limit middleware's own
            // body is `{ error: "<string>" }`, not the `{ error: { message
            // } }` shape every other refusal here uses.
            const limited = await response.json().catch(() => null);
            this.error = limited?.error || 'Too many attempts, please try again later';
            return;
          }

          const body = await response.json().catch(() => null);

          if (response.status === 403) {
            // Sign-up closed refuses first and for everyone, same as
            // /signup and /password/forgot: the server's own sentence names
            // it, and it does not depend on the address either.
            this.error = body?.error?.message || 'Sign-up is currently closed.';
            return;
          }

          if (!response.ok) {
            // A 400 here means the field was empty or malformed — a shape
            // complaint, not a statement about whether the account exists.
            this.error = body?.error?.message || 'Could not send the link. Try again.';
            return;
          }

          // THE MESSAGE IS THE SERVER'S AND IS RENDERED VERBATIM (as
          // ForgotPasswordView's is): resendResponseMessage answers in the
          // same bytes for no such address, already confirmed, waiting for
          // confirmation, and a lookup that failed, so the client must never
          // tell those apart or add a kinder branch of its own.
          this.doneMessage =
            body?.message || 'If that address has an account waiting for confirmation, a new link is on its way.';
          this.state = 'done';
          this.email = '';
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
  /* Same shell as ForgotPasswordView / SignupView / ResetPasswordView /
     VerifyEmailView — one flow seen at five moments. Feedback ink uses the
     design system's on-dark feedback tokens, because the form sits on the
     dark card in both themes (#9195). */
  .token-view-card {
    width: 100%;
    max-width: 24rem;
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
    color: var(--feedback-error-text-on-dark);
  }

  .message--success {
    color: var(--feedback-success-on-dark);
  }
</style>
