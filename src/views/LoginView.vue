<template>
  <div class="login-view page">
    <h1>{{ admin ? 'Admin sign-in' : 'Login' }}</h1>
    <AspCard class="login-view-card" padding="md">
      <!-- State 3 of design_agent's ack on #8798-B2 (c63362, amended c63391
           after security's c63381): while the live /api/profile check is in
           flight, the card stays but the form does not — swapping the form
           in only once there's an answer avoids showing, then yanking, a
           field the operator may already be typing into (D13). -->
      <p v-if="adminRedirectState === 'checking'" class="session-checking-notice" role="status">
        Checking your session…
      </p>
      <!-- State 4, amended: a click, not an auto-forward. The zero-click
           version let any cross-site link that could get a cached-Admin
           browser to LOAD this page also get it to FORWARD — the live
           /api/profile check is same-site and passes, and the forward
           itself is then a same-site navigation that carries the
           SameSite=Strict cookie, so Strict behaved like Lax for every
           gated same-origin GET (security c63381). A user-initiated click
           is what Strict was buying back; nothing here can synthesize one
           (`frame-ancestors 'self'` in default.conf blocks framing this
           page to script-click it). -->
      <template v-else-if="adminRedirectState === 'continue'">
        <p class="session-active-notice" role="status">Your session is still active.</p>
        <p class="continue-target-label">Continue to</p>
        <p class="continue-target-path">{{ redirectTarget }}</p>
        <div ref="continueWrap" :data-continue-armed="continueArmed">
          <AspButton
            :href="redirectTarget"
            class="continue-button"
            @click="onContinueClick"
            @keydown="onContinueKeydown"
          >Continue</AspButton>
        </div>
      </template>
      <template v-else>
        <p v-if="sessionExpired" class="session-expired-notice" role="status">
          Din session har gått ut. Logga in igen för att fortsätta.
        </p>
        <Login :loggedIn="false" :admin="admin" @login="onLogin" />
      </template>
    </AspCard>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspCard, AspButton } from '@aspirant/design-system';
  import Login from '../components/sidebar/Login.vue';

  // A focused login page for visitors bounced off a gated surface (system_3
  // #2602 follow-up, #3342). Parity with the sidebar login is by construction:
  // this view renders the same Login.vue component — same fields, same
  // POST /api/login, same HttpOnly-cookie posture — never a second
  // implementation.
  export default {
    name: 'LoginView',
    components: { AspCard, AspButton, Login },
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
    data() {
      return {
        // 'form' | 'checking' | 'continue'. Drives which of the three states
        // in the admin+redirect flow below the card shows (system_3
        // #8798-B2, design_agent ack c63391). Default 'form' is also every
        // non-admin-redirect case's resting state.
        adminRedirectState: 'form',
        // Security hardening on the Continue control (c63400): false until
        // the page has been visible AND focused, CONTINUOUSLY, for ~500ms.
        // Blocks a "held key" / DoubleClickjacking gesture carried over from
        // an attacker's own page onto the freshly-focused Continue control —
        // neither needs framing, so `frame-ancestors 'self'` doesn't cover
        // them. See resetArmTimer() and onContinueClick()/onContinueKeydown().
        continueArmed: false,
      };
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
        return;
      }

      // The one case the guard above deliberately excludes: admin + a
      // `redirect` target (system_3 #8798-B2). Cloudflare Access's PIN hop
      // comes back as a CROSS-SITE top-level navigation, so the
      // SameSite=Strict auth_token cookie (login.go:238) never rides it and
      // nginx's auth_request 401s before the SPA even loads — landing here
      // with a session that is, in fact, still good (operator report
      // c62661). The states below follow design_agent's ack on this task,
      // AS AMENDED (c63391, after security's c63381 found the first version
      // zero-click-forwarded on ANY same-site arrival — an attacker's own
      // link to `/admin/login?redirect=<gated-path>` triggered the identical
      // flow, because the browser cannot tell that from the real PIN hop.
      // The fix is a click: see state 4 below, in the template).
      //
      // State 3/"checking": this does NOT trust the cached flag alone the
      // way the guard above does for the no-redirect case — a stale
      // cachedAdmin surviving a truly dead cookie would recreate the exact
      // infinite-redirect risk #4155 fixed. It spends one live check
      // instead: GET /api/profile, fired from this already-loaded
      // same-origin page, is a SAME-SITE request and carries the cookie
      // fine (unlike the cross-site PIN-hop navigation that lost it).
      if (this.admin && this.$route.query.redirect && cachedAdmin) {
        const target = this.redirectTarget;

        // State 6/"loop breaker", amended: the mark is now written on the
        // CONTINUE CLICK (onContinueClick below), not on an automatic
        // forward — there is no automatic forward to loop on any more. If
        // this page loads again for the SAME target within ~10s of that
        // click, the server refused it for this cookie (`/api/profile` and
        // nginx's auth_request disagree, or the target needs more than
        // Admin): offering the identical click again would be a dead end,
        // so this goes straight to state 5 (the form) instead.
        const LOOP_KEY = 'admin_login_last_continue_click';
        const LOOP_WINDOW_MS = 10_000;
        let lastClick = null;
        try {
          lastClick = JSON.parse(sessionStorage.getItem(LOOP_KEY) || 'null');
        } catch {
          lastClick = null;
        }
        if (lastClick && lastClick.target === target && Date.now() - lastClick.at < LOOP_WINDOW_MS) {
          return; // state 5: show the form, unchanged
        }

        this.adminRedirectState = 'checking';
        // State 3's ~2s cap: a profile check that neither answers nor fails
        // inside it falls to state 5, same as a 401 would, rather than
        // leaving "Checking your session…" up indefinitely.
        let settled = false;
        const fallBackToForm = () => {
          if (settled) return;
          settled = true;
          this.adminRedirectState = 'form';
        };
        const timer = setTimeout(fallBackToForm, 2_000);

        axios.get('/api/profile').then(() => {
          clearTimeout(timer);
          // State 5's "ignore a late answer": the 2s cap already put the
          // form up (and the operator may be typing into it, D13) — do not
          // pull it away for an answer that arrives after the fact.
          if (settled) return;
          settled = true;
          // State 4, amended: offer the click, don't take it automatically.
          this.adminRedirectState = 'continue';
          this.resetArmTimer();
          this.$nextTick(() => {
            this.$refs.continueWrap?.querySelector('a')?.focus();
          });
        }).catch(() => {
          clearTimeout(timer);
          fallBackToForm(); // state 5
        });
      }
    },
    mounted() {
      // The arm timer resets on any visibility/focus change while the
      // Continue control is up (security c63400) — a held-key or
      // DoubleClickjacking gesture typically arrives with the page having
      // just gained focus/visibility, so restarting here (not just once)
      // is what makes the window continuous rather than one-shot.
      this._onFocusOrVisibilityChange = () => {
        if (this.adminRedirectState === 'continue') this.resetArmTimer();
      };
      document.addEventListener('visibilitychange', this._onFocusOrVisibilityChange);
      window.addEventListener('blur', this._onFocusOrVisibilityChange);
      window.addEventListener('focus', this._onFocusOrVisibilityChange);
    },
    beforeUnmount() {
      document.removeEventListener('visibilitychange', this._onFocusOrVisibilityChange);
      window.removeEventListener('blur', this._onFocusOrVisibilityChange);
      window.removeEventListener('focus', this._onFocusOrVisibilityChange);
      this.clearArmTimer();
    },
    methods: {
      // Security c63400: the Continue control ignores activation until the
      // page has been visible AND focused, continuously, for ~500ms.
      // Neither a clickjacking frame nor the DoubleClickjacking /
      // held-Enter techniques need that — they ride a gesture the operator
      // made on the ATTACKER's page onto our freshly-loaded, freshly-focused
      // control (`frame-ancestors 'self'` only blocks the framed variant).
      resetArmTimer() {
        this.continueArmed = false;
        this.clearArmTimer();
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          this._armTimer = setTimeout(() => {
            this.continueArmed = true;
          }, 500);
        }
      },
      clearArmTimer() {
        if (this._armTimer) {
          clearTimeout(this._armTimer);
          this._armTimer = null;
        }
      },
      onContinueClick(event) {
        // Unarmed: the control renders visibly enabled the whole time (no
        // flicker), but an activation inside the arm window is swallowed
        // silently — no error text, since a legitimate click a beat later
        // works fine and nothing was actually wrong with the page.
        if (!this.continueArmed) {
          event.preventDefault();
          return;
        }
        // Written on the click itself (not before): this is the state-6
        // loop-breaker mark, and the click is also what state 4 exists to
        // require — marking earlier would record a courtesy no click had
        // actually happened yet. No preventDefault past this point: the
        // AspButton `href` still navigates natively (middle-click,
        // Ctrl/Cmd-click, open-in-new-tab all keep working — those are
        // deliberate separate user acts, not what either attack rides).
        try {
          sessionStorage.setItem(
            'admin_login_last_continue_click',
            JSON.stringify({ target: this.redirectTarget, at: Date.now() }),
          );
        } catch {
          // Private mode / quota: the click still navigates via href; the
          // loop-breaker courtesy is lost, not a loop — there is no
          // auto-navigation left to loop on without a click.
        }
      },
      onContinueKeydown(event) {
        // A held key auto-repeats as separate keydowns with repeat:true; the
        // arm-delay alone doesn't cover it, because the repeats can keep
        // arriving well past the 500ms window with no fresh (non-repeat)
        // keydown in between to re-check. Swallow every repeat unconditionally.
        if (event.repeat) {
          event.preventDefault();
        }
      },
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

  /* State 3 of design_agent's ack (c63362, #8798-B2): stands in for the form
     while the live /api/profile check is in flight. Plain text on the card's
     own ink (--text-on-dark, same as the h1) — this is a brief, neutral
     in-between state, not a warning, so it carries none of
     .session-expired-notice's tint. */
  .session-checking-notice {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* State 4 of design_agent's ack, amended (c63391, #8798-B2): the
     one-click Continue confirmation. */
  .session-active-notice {
    margin: 0 0 var(--space-sm);
    font-size: var(--text-sm);
  }

  .continue-target-label {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* The target path itself, in its own mono line so the operator can read
     exactly where the click goes before taking it (D2) — never truncated,
     and never allowed to overflow the card at narrow widths. */
  .continue-target-path {
    margin: 0 0 var(--space-sm);
    font-family: var(--font-family-mono);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .continue-button {
    width: 100%;
  }
</style>
