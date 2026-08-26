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
        
        <!-- Mobile overlay. Deliberately NOT wired to v-overlay-history (#4172):
             the nav drawer is app chrome that is OPEN BY DEFAULT on a fresh
             mobile load (checkMobile only auto-hides on a width transition, not
             a fresh mount), so a mount-time history push would fire on every
             page load, and there is no clean way to make a tap-opened drawer and
             a load-open drawer behave the same under Back. Back-gesture handling
             here targets user-opened content overlays (dialogs, modals, side
             panels, popups); the nav-drawer's back ergonomics are a separate
             design question (see task #4172 notes). -->
        <div
          v-if="isMobile && !sidebarHidden"
          class="mobile-overlay"
          @click="toggleSidebar"
        ></div>
        
        <Sidebar></Sidebar>
        <div :style="{ 'margin-left': isMobile ? '0px' : sidebarWidth, flex: '1', 'min-width': '0' }">
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
    z-index: 1000;
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
    z-index: 1001;
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
    z-index: 999;
    display: none;
  }

  #myVapp {
    background-color: var(--surface-page);
    /* v-app used to provide the full-viewport min-height that let the page
       background fill the screen; it is retired (#4294), so set it here. */
    min-height: 100vh;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .mobile-menu-toggle {
      display: block;
    }

    .mobile-overlay {
      display: block;
    }
  }
</style>
