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
      // HttpOnly cookie): a login page has nothing to offer, so a stray visit
      // to /login moves along home.
      //
      // But do NOT auto-forward to a `redirect` target (system_3 #4155). The
      // ONLY way to arrive at /login?redirect=<x> is nginx's auth_request
      // having just REJECTED this session for <x> and 302'd us here
      // (default.conf @browser_flows_login / @penpot_login). `user_name` is
      // cached display state that OUTLIVES the HttpOnly session cookie, so it
      // is routinely truthy on a dead session. Forwarding back to <x> on that
      // stale flag re-runs auth_request, gets the same 401/403, 302s to /login,
      // and re-fires this guard — an infinite full-page-reload loop the
      // operator sees as a flickering, shaking screen with an unclickable
      // sidebar. #4081's assumption that the re-GET would "land on the real
      // surface when the cookie is valid" does not hold: a cookie valid for <x>
      // never bounces to /login in the first place. So when bounced here, show
      // the login form and let onLogin() do the full-page forward once the
      // fresh credential is actually valid for the target.
      //
      // The forward itself stays a FULL-PAGE navigation, not
      // `this.$router.replace` (#4081, #4065): a `redirect` target is
      // frequently a proxied admin surface this SPA has no client route for,
      // and a full GET re-runs nginx's auth_request instead of falling through
      // to the SPA NotFound. This matches onLogin()'s precedent.
      if (localStorage.getItem('user_name') && !this.$route.query.redirect) {
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
    /* An explicit theme-aware ink, because what this card would otherwise
       inherit is Vuetify's `.v-application { color: rgba(0,0,0,.87) }` — a
       pinned near-black that does not flip with the theme. Measured on the
       rendered page: 16.52:1 in light and 1.21:1 in dark, i.e. the captions
       vanish in dark. That is a property of the global Vuetify mount (#4294 is
       retiring it), not of this view, but this view is where it lands, and the
       Login form's captions are `color: inherit` by design (AspInput's
       .field__label takes the ink of whatever surface it is dropped onto) so
       the surface has to declare one. --text-body is the token that resolves
       per theme. The sidebar mount of the same component needs no such line:
       the sidebar already declares --brand-primary, which measures 5.6:1 light
       / 8.0:1 dark there. */
    color: var(--text-body);
  }

  .login-view-card h1 {
    text-align: center;
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
  }
</style>
