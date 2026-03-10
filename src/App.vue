<template>
  <v-app id="myVapp">
    <v-content>
      <div class="app-container">
        <!-- Mobile hamburger menu -->
        <div v-if="isMobile" class="mobile-menu-toggle" @click="toggleSidebar">
          <div class="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        
        <!-- Mobile overlay -->
        <div 
          v-if="isMobile && !sidebarHidden" 
          class="mobile-overlay" 
          @click="toggleSidebar"
        ></div>
        
        <Sidebar></Sidebar>
        <div :style="{ 'margin-left': isMobile ? '0px' : sidebarWidth }">
          <router-view :key="$route.path" class="fade-in"> </router-view>
        </div>
        
        <!-- Persistent Back Button -->
        <BackButton></BackButton>
      </div>
    </v-content>
  </v-app>
</template>

<script>
  import Sidebar from './components/sidebar/Sidebar.vue';
  import BackButton from './components/BackButton.vue';
  import { sidebarWidth, collapsed, isMobile, sidebarHidden, toggleSidebar, checkMobile } from './global_state_manager.js';
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
      };
    },
  };
</script>

<style>
  :root {
    /* === Surfaces (60% — dominant neutral) === */
    --surface-page: #e4e4e4;
    --surface-card: #424242;
    --surface-card-inner: rgba(0, 0, 0, 0.3);
    --surface-elevated: #f9f9f9;

    /* === Brand (30%) === */
    --brand-primary: #ffb300;
    --brand-primary-alpha: #ffb30082;
    --brand-primary-hover: #e07800;
    --brand-accent: #82b1ff;

    /* === Text === */
    --text-on-light: #424242;
    --text-on-dark: #ffffff;
    --text-heading-card: #ffb300;
    --text-muted: #6c757d;
    --text-hint: #82b1ff;

    /* === Feedback === */
    --feedback-error: #ff3739;
    --feedback-success: #00b74a;
    --feedback-info: #00d3ee;

    /* === Borders === */
    --border-card: #ffb300;
    --border-subtle: #cccccc;

    /* === Typography === */
    --font-family-base: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;

    /* === Spacing scale (rem-based) === */
    --space-2xs: 0.25rem;
    --space-xs: 0.5rem;
    --space-sm: 0.75rem;
    --space-md: 1rem;
    --space-lg: 1.5rem;
    --space-xl: 2rem;
    --space-2xl: 3rem;
    --space-3xl: 4rem;

    /* === Typography scale === */
    --text-xs: 0.75rem;
    --text-sm: 0.85rem;
    --text-base: 1rem;
    --text-md: 1.05rem;
    --text-lg: 1.2rem;
    --text-xl: 1.4rem;
    --text-2xl: 1.8rem;
    --text-3xl: 2.5rem;

    /* === Border radius === */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-2xl: 20px;
    --radius-pill: 40px;
    --radius-full: 50%;

    /* === Transitions === */
    --transition-fast: 0.15s ease;
    --transition-base: 0.2s ease;
    --transition-moderate: 0.3s ease;
    --transition-layout: 0.5s ease;

    /* === Shadows === */
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
    --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.12);
    --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.15);
  }

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
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 999;
    display: none;
  }

  #myVapp {
    background-color: var(--surface-page);
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
