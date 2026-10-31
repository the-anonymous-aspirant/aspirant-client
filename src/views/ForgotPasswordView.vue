<template>
  <div class="token-view page">
    <AspCard class="token-view-card" padding="md">
      <h1>Reset your password</h1>

      <template v-if="state === 'done'">
        <!-- The server's own words, verbatim. See the note in `submit`. -->
        <p class="message message--success" data-testid="forgot-done">{{ doneMessage }}</p>
        <RouterLink class="next" to="/login">Go to sign in</RouterLink>
      </template>

      <form v-else @submit.prevent="submit">
        <p class="hint">
          Enter the address you signed up with and we will send a link for choosing a new password.
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
        <AspButton type="submit" class="action" :disabled="busy" data-testid="forgot-submit">
          {{ busy ? 'Sending…' : 'Send me a reset link' }}
        </AspButton>
        <p v-if="error" class="message message--error" data-testid="forgot-error">{{ error }}</p>
      </form>
    </AspCard>
  </div>
</template>

<script>
  import { AspCard, AspInput, AspButton } from '@aspirant/design-system';

  // The START of password recovery (system_3 #5339, under #5296).
  //
  // `ResetPasswordView` has landed the emailed link since #5228 and calls
  // `POST /api/password/reset`. Nothing called `POST /api/password/forgot`, so
  // the half that SENDS that email did not exist: a person who still had the
  // link could finish, and a person who did not had no way to ask for one.

  export default {
    name: 'ForgotPasswordView',
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
          const response = await fetch('/api/password/forgot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email }),
          });
          const body = await response.json().catch(() => null);

          if (!response.ok) {
            // A 400 here means the field was empty or malformed — a shape
            // complaint, not a statement about whether the account exists.
            this.error = body?.error?.message || 'Could not send the link. Try again.';
            return;
          }

          // THE MESSAGE IS THE SERVER'S AND IS RENDERED VERBATIM.
          //
          // `POST /password/forgot` returns one identical sentence for an
          // address it knows and one it does not — `password_recovery.go`
          // keeps it in a constant precisely so "the two call sites cannot
          // drift apart; one differing word would be the oracle."
          //
          // So do NOT add a kinder "we couldn't find that account" branch, and
          // do not validate the address against any lookup before sending.
          // Either would rebuild an account-existence oracle in the client
          // that the server deliberately does not have.
          this.doneMessage =
            body?.message || 'If that address has an account, a reset link is on its way.';
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
  /* Same shell as SignupView / ResetPasswordView / VerifyEmailView — one flow
     seen at four moments. Feedback ink uses the design system's on-dark
     feedback tokens, because the form sits on the dark card in both themes
     (#9195), not the `--text-danger` / `--text-success` that two of those
     siblings once reached for and that do not exist in the design system
     (#5340). */
  /* The form sits on the signature dark card (§1.2, §1.5; #9195). AspCard
     owns the surface, border, radius, inset and ink (--text-on-dark), so the
     fields resolve their card arm and links take `.card a`. */
  .token-view-card {
    width: 100%;
    max-width: 24rem;
  }

  /* The card heading step comes from the global `.card` rule (#9193); a card
     heading is amber (§1.2). */
  .token-view-card h1 {
    margin: 0 0 var(--space-sm);
    color: var(--text-heading-card);
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

  /* Link ink from the global rule (#9191); a 24px standalone target (§3.99). */
  .next {
    display: inline-block;
    margin-top: var(--space-sm);
    min-height: 24px;
    line-height: 24px;
  }
</style>
