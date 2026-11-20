<template>
  <div id="myVapp">
    <div class="app-container">
        <!-- The bar behind the phone menu button (system_3 #11664; design
             ruling on #11663, a dated note on §3.121). Below 768px a list
             scrolled under the fixed button showed through it. The bar is
             the page's own surface, the button's box and the 14px above it,
             with a 1px line at its foot only once something has scrolled
             under it, so the first screen is as before. It is the one fixed
             top bar §3.122 P6 allows. It sits on the sticky layer before the
             drawer's scrim, so the scrim, the drawer and every modal cover it
             and the button stays on top. Decorative, so hidden from assistive
             technology. -->
        <div
          v-if="isMobile"
          class="mobile-topbar"
          :class="{ 'mobile-topbar--scrolled': scrolled }"
          aria-hidden="true"
          data-test="mobile-topbar"
        ></div>

        <!-- Mobile menu button. A real button with a name and a 44px target,
             whose ink follows the surface under it (UX walk AP2, system_3
             #10978): amber on the light page measured 1.41:1. Closed, it sits
             on the page and takes body ink; open, it sits on the dark drawer
             and takes the on-dark ink. -->
        <button
          v-if="isMobile"
          type="button"
          class="mobile-menu-toggle"
          :class="{ 'mobile-menu-toggle--over-drawer': !sidebarHidden }"
          :aria-label="sidebarHidden ? 'Open menu' : 'Close menu'"
          :aria-expanded="String(!sidebarHidden)"
          @click="toggleSidebar"
        >
          <span class="hamburger-icon" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
        
        <!-- Mobile overlay. Not wired to v-overlay-history (#4172). The nav
             drawer starts CLOSED on a phone and opens only from the toggle
             (#9190), so the load-open case that made a mount-time history push
             unworkable is gone; the nav-drawer's back ergonomics remain a
             separate design question (see task #4172 notes). Back-gesture
             handling here targets user-opened content overlays (dialogs,
             modals, side panels, popups). -->
        <div
          v-if="isMobile && !sidebarHidden"
          class="mobile-overlay"
          @click="toggleSidebar"
        ></div>
        
        <Sidebar></Sidebar>
        <div class="app-main" :style="{ 'margin-left': isMobile ? '0px' : sidebarWidth }">
          <router-view :key="$route.path + '-' + authVersion" class="fade-in"> </router-view>
        </div>
      </div>
  </div>
</template>

<script>
  import Sidebar from './components/sidebar/Sidebar.vue';
  import { sidebarWidth, collapsed, isMobile, sidebarHidden, toggleSidebar, checkMobile, authVersion } from './global_state_manager.js';
  import HomeView from './views/HomeView.vue';
  import { onMounted, onBeforeUnmount, ref } from 'vue';

  export default {
    components: {
      HomeView,
      Sidebar,
    },
    setup() {
      const handleResize = () => {
        checkMobile();
      };

      // Whether the page has scrolled at all: the phone top bar's line shows
      // only then (system_3 #11664).
      const scrolled = ref(false);
      const handleScroll = () => {
        scrolled.value = window.scrollY > 0;
      };

      onMounted(() => {
        checkMobile();
        handleScroll();
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleScroll, { passive: true });
      });

      onBeforeUnmount(() => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll);
      });

      return {
        scrolled,
        sidebarWidth,
        collapsed,
        isMobile,
        sidebarHidden,
        toggleSidebar,
        authVersion,
      };
    },
  };
</script>

<style>

  .app-container {
    display: flex;
  }
</style>

<style scoped>
  .sidebar {
    background-color: var(--surface-card);
    color: var(--brand-primary);
    float: left;
    position: fixed;
    /* The shell is sticky page chrome: it sits on the DS sticky layer, below
       --z-index-modal, so a modal's scrim covers all of it. As literals
       (999/1000/1001) the toggle painted over every AspModal sheet (#8407). */
    z-index: calc(var(--z-index-sticky) + 1);
    top: 0;
    left: 0;
    bottom: 0;
    padding: var(--space-xs);
    display: flex;
    flex-direction: column;
    transition: var(--transition-layout);
    overflow-y: auto;
  }

  /* A 44px target around the 30x24 bars, offset so the bars sit exactly where
     they always did (top and left --space-lg) and the content inset below is
     unchanged. The bars are currentColor, so the button's ink is theirs. */
  .mobile-menu-toggle {
    position: fixed;
    top: calc(var(--space-lg) - 10px);
    left: calc(var(--space-lg) - 7px);
    z-index: calc(var(--z-index-sticky) + 2);
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: var(--text-body);
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
  }

  .mobile-menu-toggle--over-drawer {
    color: var(--text-on-dark);
  }

  .mobile-menu-toggle:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .hamburger-icon {
    display: block;
    width: 30px;
    height: 24px;
    position: relative;
  }

  .hamburger-icon span {
    display: block;
    height: 3px;
    width: 100%;
    background-color: currentColor;
    margin: 6px 0;
    transition: var(--transition-moderate);
    border-radius: 2px;
  }

  /* The phone top bar (system_3 #11664): fixed, full width, 58px (the
     toggle's 44px box and the 14px above it), on the page's own surface.
     Shown below 768px only (the rule further down). On the sticky layer, and
     before the scrim in the DOM, so the scrim (same layer, later) and the
     drawer and toggle (above) cover it. */
  .mobile-topbar {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: var(--z-index-sticky);
    height: calc(var(--space-lg) - 10px + 44px);
    background-color: var(--surface-page);
    border-bottom: 1px solid transparent;
    box-sizing: border-box;
    display: none;
  }

  .mobile-topbar--scrolled {
    border-bottom-color: var(--border-subtle);
  }

  .mobile-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--surface-scrim);
    z-index: var(--z-index-sticky);
    display: none;
  }

  #myVapp {
    background-color: var(--surface-page);
    /* v-app used to provide the full-viewport min-height that let the page
       background fill the screen; it is retired (#4294), so set it here. No
       padding sits outside it (#9192), so a page that fits does not scroll. */
    min-height: 100vh;
  }

  /* The one page gutter (#9192, §3.121): every route's content starts here,
     and no view adds an inset of its own. */
  .app-main {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-xl);
  }

  /* Mobile styles */
  @media (max-width: 767.98px) {
    .mobile-menu-toggle {
      display: flex;
    }

    .mobile-topbar {
      display: block;
    }

    /* The top inset clears the fixed drawer toggle: its --space-lg offset,
       its 30px box, then --space-md. Without it a title at the side inset
       sits under the toggle (/support's did, at y 48 against its 54). */
    .app-main {
      padding: calc(var(--space-lg) + 30px + var(--space-md)) var(--space-md) var(--space-md);
    }

    .mobile-overlay {
      display: block;
    }
  }
</style>
