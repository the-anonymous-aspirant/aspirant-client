<template>
  <div v-if="!loggedIn">
    <!-- One rendered state. The former `v-if="collapsed"` branch — a bespoke
         fixed-height sidebar-rail trigger — was unreachable: this component is
         mounted in exactly three places (`LoginView.vue:5`, `Sidebar.vue:226`,
         `Sidebar.vue:234`) and every one passed `:collapsed="false"`, with the
         prop itself defaulting to false. The `<transition>` went with it: with
         one always-present child it had nothing to cross-fade between. Removed
         in #4460 along with the prop and its three bindings. -->
    <div class="login-card">
      <form @submit.prevent="login">
        <!-- Both fields carry AspInput's own `label` prop rather than the
             hand-rolled <label for>: the component mints the id and wires
             `for` to the inner <input> itself, so the association cannot
             drift the way a hand-maintained pair can. That is also why
             neither field passes an `id` — an id arriving through $attrs
             lands on the inner input AFTER the component's own `:id`
             (mergeProps: later wins), which would leave `for` pointing at a
             node that no longer carries that id. The e2e selectors move to
             `input[name=...]` for the same reason.

             `name` + `autocomplete` are the caller's to set through the
             $attrs fallthrough seam (design ruling §3.85) — they are what
             makes a password manager offer to fill and to save this pair. -->
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
            v-model="password"
            type="password"
            label="Password"
            name="password"
            autocomplete="current-password"
            required
          />
        </div>
        <AspButton type="submit" class="login-button">Login</AspButton>
      </form>
      <p v-if="error" class="error-message">{{ error }}</p>
      <p v-if="success" class="success-message">{{ success }}</p>
    </div>
  </div>
  <div class="logout-card" v-else @click="toggleSidebar">
    <AspButton class="login-button" @click.stop="logout">Logout</AspButton>
  </div>
</template>

<script>
  import { AspInput, AspButton } from '@aspirant/design-system';

  import { toggleSidebar } from '../../global_state_manager.js';

  export default {
    components: { AspInput, AspButton },
    props: {
      loggedIn: {
        type: Boolean,
        required: true,
      },
    },
    data() {
      return {
        username: '',
        password: '',
        role: '',
        error: '',
        success: '',
      };
    },
    methods: {
      toggleSidebar() {
        toggleSidebar(); // Use the imported function
      },
      async logout() {
        // The session is the server's HttpOnly auth_token cookie, which this
        // script cannot touch — clearing localStorage alone left a valid Admin
        // credential in the browser for the token's full 24h while the UI
        // showed a logged-out state (system_3 #2589). Only the server can end
        // it, so ask it to.
        try {
          await fetch('/api/logout', { method: 'POST' });
        } catch {
          // Offline or the request failed: fall through and clear local state
          // anyway. Leaving the UI logged-in because a network call failed
          // strands the user in a state they cannot get out of, and the cookie
          // expires on its own regardless.
        }

        this.username = '';
        this.password = '';
        this.role = '';
        this.error = '';
        this.success = '';

        localStorage.removeItem('user_name');
        localStorage.removeItem('user_role');
        this.$emit('logout');
      },
      async login() {
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: this.username,
              password: this.password,
            }),
          });

          if (!response.ok) {
            throw new Error('Invalid username or password');
          }

          const data = await response.json();
          console.log('Login successful', data);
          this.success = 'Login successful!';
          this.error = '';
          this.role = data.data.role;
          this.username = data.data.username;

          localStorage.setItem('user_name', this.username);
          localStorage.setItem('user_role', this.role);
          this.$emit('login');
        } catch (err) {
          this.error = err.message;
          this.success = '';
        }
      },
    },
  };
</script>

<style scoped>
  .login-card {
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    max-width: 100%;
    width: 100%;
    text-align: center;
    margin: 0;
    transition: all var(--transition-moderate);
  }

  .login-card h1 {
    margin-bottom: var(--space-lg);
    font-size: var(--text-lg);
    color: var(--text-on-light);
  }

  /* AspInput owns both the control and its label now, so the three native-input
     rules that used to live here are gone: the box (border, radius, padding,
     full width) and the focus treatment are the component's, and its focus ring
     clears the WCAG 1.4.11 3:1 non-text floor that the old bare
     `border-color: var(--brand-primary)` swap did not.

     The label rule is deleted rather than retuned, and the `--brand-primary`
     ink it carried is deliberately NOT handed to the component. This form has
     two mounts — the sidebar strip and the dedicated /login page (#3342) — and
     the amber was only ever legible on one of them: measured on /login it
     rendered at 1.41:1 against the light page, under the 4.5:1 AA floor and
     barely visible. That predates this migration; the render walk is what
     surfaced it, because the suite reads colours and counts, never a ratio.

     AspInput's `.field__label` is `color: inherit` precisely for this case: it
     sets no background of its own, so the only ink that is correct on BOTH
     mounts is the one the surrounding surface already declared. Overriding it
     here would re-pin a single ink across two surfaces and reintroduce the
     defect on whichever one it does not suit. Measurements for both mounts are
     in the PR body. */
  .form-group {
    margin-bottom: var(--space-xs);
    text-align: left;
  }

  /* The Login (submit) and Logout buttons are the button-of-record family and
     are AspButtons now — DS owns their fill, ink, radius, focus and hover
     (#4295). The class falls through to the DS <button> root and is reduced to
     the one thing DS cannot know: this button spans its card's full width and
     keeps the small top gap from the field above it.

     They are now the ONLY buttons in this file. The collapsed-sidebar trigger
     this comment used to hold out as residue turned out to be unreachable —
     see the template — so #4460 deleted it rather than porting it. */
  .login-button {
    width: 100%;
    margin-top: var(--space-2xs);
  }

  .error-message {
    color: var(--feedback-error);
    margin-top: var(--space-xs);
    font-size: var(--text-sm);
  }

  .success-message {
    color: var(--feedback-success);
    margin-top: var(--space-xs);
    font-size: var(--text-sm);
  }

  .login-card,
  .logout-card {
    cursor: pointer;
  }

</style>
