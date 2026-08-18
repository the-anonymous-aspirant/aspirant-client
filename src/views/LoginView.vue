<template>
  <div class="login-view">
    <div class="login-view-card">
      <h1>Login</h1>
      <Login :loggedIn="false" :collapsed="false" @login="onLogin" />
    </div>
  </div>
</template>

<script>
  import Login from '../components/sidebar/Login.vue';

  // A focused login page for visitors bounced off a gated surface (system_3
  // #2602 follow-up, #3342). Parity with the sidebar login is by construction:
  // this view renders the same Login.vue component — same fields, same
  // POST /api/login, same HttpOnly-cookie posture — never a second
  // implementation.
  export default {
    name: 'LoginView',
    components: { Login },
    computed: {
      // Where to land after login. Only same-origin paths are honoured: a
      // value that does not start with exactly one '/' (or starts with '//',
      // which the URL parser reads as protocol-relative) could send a fresh
      // credential holder to another origin.
      redirectTarget() {
        const raw = this.$route.query.redirect;
        if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
          return raw;
        }
        return '/';
      },
    },
    created() {
      // Already logged in (display state; the credential itself is the
      // HttpOnly cookie): a login page has nothing to offer, move along.
      //
      // A FULL-PAGE navigation, not `this.$router.replace` (#4081, #4065): the
      // redirect target is frequently a proxied admin surface (e.g.
      // /admin/apps/system_3/) that this SPA's router has no route for, so a
      // client-side route falls through to the NotFound catch-all and
      // manufactures the very 404 the operator saw while logged in. A full GET
      // re-runs nginx's auth_request — landing on the real proxied surface when
      // the cookie is valid, or cleanly re-bouncing to /login when it is not —
      // and never the SPA 404. This matches onLogin()'s existing precedent.
      if (localStorage.getItem('user_name')) {
        window.location.assign(this.redirectTarget);
      }
    },
    methods: {
      onLogin() {
        // Sidebar.vue's username/userRole refs are local state, only
        // refreshed by its OWN embedded Login instance's @login handler
        // (refreshUserData) — this view's separate Login instance firing
        // the event does not reach it, and there is no shared reactive auth
        // state to bump. A full navigation (not router.replace) forces
        // Sidebar's setup() to re-run and re-read localStorage fresh, so the
        // sidebar shows the logged-in state immediately rather than only
        // after a manual reload.
        window.location.href = this.redirectTarget;
      },
    },
  };
</script>

<style scoped>
  .login-view {
    display: flex;
    justify-content: center;
    padding: var(--space-2xl) var(--space-sm);
  }

  .login-view-card {
    width: 100%;
    max-width: 24rem;
  }

  .login-view-card h1 {
    text-align: center;
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
  }
</style>
