<template>
  <div class="token-view">
    <div class="token-view-card">
      <h1>Confirm your address</h1>

      <p v-if="!token" class="message message--error">
        This link is missing its confirmation code. Open the link from your email again, or
        request a new one.
      </p>

      <template v-else-if="state === 'ready'">
        <p class="lede">
          Confirm your email address to finish creating your account. The address itself is not
          shown here — this link does not carry it, and putting it on screen would tell anyone
          who found the link whose account it opens.
        </p>
        <AspButton class="action" :disabled="busy" @click="confirm">
          {{ busy ? 'Confirming…' : 'Confirm my address' }}
        </AspButton>
      </template>

      <template v-else-if="state === 'done'">
        <p class="message message--success">
          Your address is confirmed. You can sign in now.
        </p>
        <RouterLink class="next" to="/login">Go to sign in</RouterLink>
      </template>

      <template v-else>
        <p class="message message--error">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<script>
  import { AspButton } from '@aspirant/design-system';

  // The landing page for the confirmation link in a sign-up email
  // (system_3 #5228, under #5119).
  //
  // Why this page exists at all, rather than the mail linking straight at a GET
  // endpoint on the API: mail scanners and link-preview fetchers follow links
  // inside messages, and the confirmation token is single-use. One prefetch by
  // a security appliance would consume it and leave the person holding a link
  // that reports itself invalid — a failure they cannot diagnose and support
  // cannot reproduce. A page turns the click into a POST that a fetcher will
  // not make.
  //
  // That reasoning is also why confirming needs a button press rather than
  // firing on mount. Auto-submitting would still be safe against the fetchers
  // that do not run scripts, which is most of them — but it would spend the
  // token on any renderer that does, giving back exactly the failure this page
  // was built to avoid. One click is the whole cost of closing that gap.
  export default {
    name: 'VerifyEmailView',
    components: { AspButton },
    data() {
      return {
        state: 'ready',
        busy: false,
        error: '',
      };
    },
    computed: {
      // Read straight from the query string. Never echoed into the page: it is
      // a live credential until it is spent, and rendering it would put it in
      // screenshots, bug reports and shoulder-view.
      token() {
        const raw = this.$route.query.token;
        return typeof raw === 'string' && raw !== '' ? raw : '';
      },
    },
    methods: {
      async confirm() {
        if (this.busy) return;
        this.busy = true;
        try {
          const response = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: this.token }),
          });
          if (!response.ok) {
            // The API answers every bad-token case with one message —
            // expired, already used, never existed, minted for password
            // recovery — because telling them apart tells someone submitting
            // guesses which ones were structurally right. Show what it said
            // and do not try to be more specific.
            const body = await response.json().catch(() => null);
            this.error =
              body?.error?.message || 'That link is invalid or has expired. Request a new one.';
            this.state = 'failed';
            return;
          }
          this.state = 'done';
        } catch {
          // A network failure is not a bad token, and saying so would send
          // someone off to request a new link they do not need.
          this.error = 'Could not reach the server. Check your connection and try again.';
          this.state = 'failed';
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
    /* An explicit theme-aware ink, for the reason LoginView.vue documents:
       neither :root nor body declares `color`, so text that inherits falls
       through to the UA default, which does not flip with the theme. */
    color: var(--text-body);
  }

  .token-view-card h1 {
    text-align: center;
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
  }

  .lede {
    margin-bottom: var(--space-md);
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
