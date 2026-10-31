<template>
  <div class="login-view page">
    <h1>{{ admin ? 'Admin sign-in' : 'Login' }}</h1>
    <AspCard class="login-view-card" padding="md">
      <p v-if="sessionExpired" class="session-expired-notice" role="status">
        Din session har gått ut. Logga in igen för att fortsätta.
      </p>
      <Login :loggedIn="false" :admin="admin" @login="onLogin" />
    </AspCard>
  </div>
</template>

<script>
  import { AspCard } from '@aspirant/design-system';
  import Login from '../components/sidebar/Login.vue';

  // A focused login page for visitors bounced off a gated surface (system_3
  // #2602 follow-up, #3342). Parity with the sidebar login is by construction:
  // this view renders the same Login.vue component — same fields, same
  // POST /api/login, same HttpOnly-cookie posture — never a second
  // implementation.
  export default {
    name: 'LoginView',
    components: { AspCard, Login },
    props: {
      // /admin/login (system_3 #9270): the same view and the same redirect
      // hardening, posting to the admin sign-in instead of /api/login.
      admin: {
        type: Boolean,
        default: false,
      },
    },
    computed: {
      // Where to land after login. Only same-origin paths are honoured, or a
      // crafted /login?redirect=<x> could hand a fresh credential holder's next
      // navigation to another origin. Resolve the candidate through the SAME
      // parser the navigation will use (`new URL` = the WHATWG parser behind
      // window.location) and honour it only when it stays on this origin.
      //
      // A string prefix test (startsWith('/') && !startsWith('//')) is NOT
      // enough: the browser treats a backslash as a slash in the authority, so
      // `/\evil.com` and `/\/evil.com` pass such a filter yet window.location
      // resolves them to https://evil.com (#5937). Origin comparison closes
      // every such backslash / tab / mixed-slash variant by construction,
      // because it asks the real parser instead of guessing its output.
      //
      // Validate the EXACT string handed to the sink, not just the resolved
      // reference. The sink is a full-page navigation that RE-PARSES the
      // returned value (`window.location.href = redirectTarget` /
      // `.assign(redirectTarget)` below), and a same-origin resolve can still
      // yield a protocol-relative PATHNAME: `/..//evil.com` resolves to our
      // origin (so the first check passes) but its pathname is `//evil.com`,
      // which window.location reads as https://evil.com. Returning that bare
      // pathname re-opened the redirect (§6.2 independent review of #5937, actor
      // 204; fix-forward for the #309 merge). Re-resolving `target` against our
      // origin and re-checking rejects any `//`-normalizing path to home,
      // because it asks the parser about the very string the sink will re-parse.
      redirectTarget() {
        const raw = this.$route.query.redirect;
        if (typeof raw !== 'string') {
          return '/';
        }
        try {
          const u = new URL(raw, window.location.origin);
          const target = u.pathname + u.search + u.hash;
          if (u.origin === window.location.origin &&
              new URL(target, window.location.origin).origin === window.location.origin) {
            return target;
          }
        } catch {
          // Not a parseable reference (e.g. `javascript:`); fall through.
        }
        return '/';
      },
      // The 401 interceptor sets ?expired=1 when it routes here from a dead
      // session (#5925), so the page can say the session ended rather than
      // looking like a plain visit. Absent for a first-time / anonymous visit.
      sessionExpired() {
        return this.$route.query.expired === '1';
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
      //
      // On the admin sign-in, only a cached Admin role moves along: while the
      // Cloudflare Access gate is on, /login gives an admin account Member, and
      // that session is exactly the one that needs this page (#9270).
      const cachedAdmin = localStorage.getItem('user_role') === 'Admin';
      if (localStorage.getItem('user_name') && !this.$route.query.redirect && (!this.admin || cachedAdmin)) {
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
  /* The form sits on the signature dark card (§1.2, §1.5; #9195). AspCard
     owns the surface, border, radius, inset and ink (--text-on-dark), so the
     fields resolve their card arm and links take `.card a`. The h1 stays the
     page's route title above it: --text-xl at the one title y every public
     route shares (#9193, #9192). */
  .login-view-card {
    width: 100%;
    max-width: 24rem;
  }

  /* A warning tint under the card's own ink. It used to read
     `--surface-caution, var(--surface-2)`, neither of which exists, so it
     painted nothing, and its `--text-body` ink would be #424242 on the light
     theme's #424242 card (#9195). */
  .session-expired-notice {
    margin: 0 0 var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    background: var(--feedback-warning-bg);
    font-size: var(--text-sm);
  }
</style>
