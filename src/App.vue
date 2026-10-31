<template>
  <div id="myVapp">
    <div class="app-container">
        <!-- Mobile hamburger menu -->
        <div v-if="isMobile" class="mobile-menu-toggle" @click="toggleSidebar">
          <div class="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        
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
        
        <!-- Persistent Back Button -->
        <BackButton></BackButton>
      </div>
  </div>
</template>

<script>
  import Sidebar from './components/sidebar/Sidebar.vue';
  import BackButton from './components/BackButton.vue';
  import { sidebarWidth, collapsed, isMobile, sidebarHidden, toggleSidebar, checkMobile, authVersion } from './global_state_manager.js';
  import HomeView from './views/HomeView.vue';
  import { onMounted, onBeforeUnmount } from 'vue';

  export default {
    components: {
      HomeView,
      Sidebar,
      BackButton,
    },
    setup() {
      const handleResize = () => {
        checkMobile();
      };

      onMounted(() => {
        checkMobile();
        window.addEventListener('resize', handleResize);
      });

      onBeforeUnmount(() => {
        window.removeEventListener('resize', handleResize);
      });

      return {
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

  .mobile-menu-toggle {
    position: fixed;
    top: var(--space-lg);
    left: var(--space-lg);
    z-index: calc(var(--z-index-sticky) + 2);
    cursor: pointer;
    display: none;
  }

  .hamburger-icon {
    width: 30px;
    height: 24px;
    position: relative;
    cursor: pointer;
  }

  .hamburger-icon span {
    display: block;
    height: 3px;
    width: 100%;
    background-color: var(--brand-primary);
    margin: 6px 0;
    transition: var(--transition-moderate);
    border-radius: 2px;
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
