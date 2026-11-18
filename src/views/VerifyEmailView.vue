<template>
  <div class="token-view page">
    <h1>Confirm your address</h1>
    <AspCard class="token-view-card" padding="md">
      <!-- A link cut short before its code lands here, not in the linkDead
           branch below (design ack c71363, system_3 #11143): the code never
           reached the server, so this is a client-side shape check, not a
           server refusal. The resend now covers this case too, for whoever
           no longer has the email to copy the link from again. -->
      <template v-if="!token">
        <p class="message message--error" data-test="verify-no-code">
          This link is missing its confirmation code. Open the link from your email again: the
          code is part of the link, so a link copied in part loses it.
        </p>
        <RouterLink class="next" to="/resend-verification">Get a new confirmation link</RouterLink>
      </template>

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

      <!-- A spent, expired or never-existed link (system_3 #11143): the
           dead-link sentence is a door, not plain text (UX walk AP3, #10979;
           design ack c71363). A used link usually means the address is
           confirmed already, so sign-in comes before the resend door. -->
      <template v-else-if="linkDead">
        <p class="message message--error" data-test="verify-link-dead">
          That confirmation link is invalid, already used or expired.
        </p>
        <p class="message" data-test="verify-try-sign-in">
          If you confirmed your address already, <RouterLink to="/login">sign in</RouterLink>.
        </p>
        <RouterLink class="next" to="/resend-verification">Get a new confirmation link</RouterLink>
      </template>

      <template v-else>
        <p class="message message--error" data-test="verify-failed">{{ error }}</p>
      </template>
    </AspCard>
  </div>
</template>

<script>
  import { AspCard, AspButton } from '@aspirant/design-system';

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
    components: { AspCard, AspButton },
    data() {
      return {
        state: 'ready',
        busy: false,
        error: '',
        // The API refused the link itself (400).
        linkDead: false,
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
            if (response.status === 400) {
              this.linkDead = true;
              this.error = '';
            } else {
              const body = await response.json().catch(() => null);
              this.error = body?.error?.message || 'That did not work. Try again.';
            }
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
  /* The form sits on the signature dark card (§1.2, §1.5; #9195). AspCard
     owns the surface, border, radius, inset and ink (--text-on-dark), so the
     fields resolve their card arm and links take `.card a`. The h1 stays the
     page's route title above it: --text-xl at the one title y every public
     route shares (#9193, #9192). */
  .token-view-card {
    width: 100%;
    max-width: 24rem;
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
