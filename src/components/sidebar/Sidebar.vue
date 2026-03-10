<script>
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import {
    debugMode,
    toggleDebugMode,
    collapsed,
    toggleSidebar,
    sidebarWidth,
    isMobile,
    sidebarHidden,
  } from '../../global_state_manager.js';
  import SidebarLink from './SidebarLink.vue';
  import Login from './Login.vue';
  import assetManager from '../../asset_manager';

  export default {
    name: 'Sidebar',
    components: { SidebarLink, Login },
    props: {},
    setup() {
      const username = ref(localStorage.getItem('user_name'));
      const userRole = ref(localStorage.getItem('user_role'));
      const userToken = ref(localStorage.getItem('user_token'));
      const aspiringHandImageUrl = ref('');

      // Add refs for sidebar icons - initialize as null instead of empty string
      const homeIconUrl = ref(null);
      const applicationsIconUrl = ref(null);
      const trustedIconUrl = ref(null);
      const adminIconUrl = ref(null);
      const supportIconUrl = ref(null);
      const defaultUserIconUrl = ref(null);

      // Add loading state ref
      const imagesLoaded = ref(false);

      const refreshUserData = () => {
        console.log('Refreshing user data');
        username.value = localStorage.getItem('user_name');
        userRole.value = localStorage.getItem('user_role');
        userToken.value = localStorage.getItem('user_token');
      };

      // Pre-load assets before mounting to ensure they're ready
      const preloadAssets = async () => {
        try {
          await assetManager.preloadAssets([
            'aspiring_hand',
            'home_icon',
            'applications',
            'family',
            'admin',
            'default',
            'default_user',
            'coffemug',
          ]);
          console.log('Successfully preloaded all assets');
        } catch (error) {
          console.error('Error preloading assets:', error);
        }
      };

      // Load all the required images using the asset manager
      onMounted(async () => {
        console.log('Sidebar component mounted, loading assets...');
        await preloadAssets();

        try {
          // Load assets sequentially and log each one
          aspiringHandImageUrl.value = await assetManager.getAsset('aspiring_hand');

          homeIconUrl.value = await assetManager.getAsset('home_icon');

          applicationsIconUrl.value = await assetManager.getAsset('applications');

          trustedIconUrl.value = await assetManager.getAsset('family');

          adminIconUrl.value = await assetManager.getAsset('admin');

          defaultUserIconUrl.value = await assetManager.getAsset('default_user');

          supportIconUrl.value = await assetManager.getAsset('coffemug');

          imagesLoaded.value = true;
        } catch (error) {
          console.error('Error loading images:', error);
        }
      });

      // Clean up when component is destroyed
      onBeforeUnmount(() => {
        assetManager.releaseAsset('aspiring_hand');
        assetManager.releaseAsset('home_icon');
        assetManager.releaseAsset('applications');
        assetManager.releaseAsset('family');
        assetManager.releaseAsset('admin');
        assetManager.releaseAsset('default_user');
        assetManager.releaseAsset('coffemug');
      });

      return {
        collapsed,
        toggleSidebar,
        sidebarWidth,
        debugMode,
        toggleDebugMode,
        username,
        userRole,
        userToken,
        refreshUserData,
        aspiringHandImageUrl,
        homeIconUrl,
        applicationsIconUrl,
        trustedIconUrl,
        adminIconUrl,
        supportIconUrl,
        defaultUserIconUrl,
        imagesLoaded,
        isMobile,
        sidebarHidden,
      };
    },
  };
</script>

<template>
  <div class="sidebar" :class="{ 'show': isMobile && !sidebarHidden }" :style="{ width: sidebarWidth }">
    <div class="logo-container">
      <img
        v-if="aspiringHandImageUrl"
        :src="aspiringHandImageUrl"
        alt="The Aspirant"
        class="aspiring-hand-logo"
        :class="{ collapsed: collapsed, 'rotate-180': collapsed }"
        @click="toggleSidebar"
      />
    </div>

    <div class="nav-links">
      <SidebarLink :key="'home' + imagesLoaded" :image="homeIconUrl" to="/">Home</SidebarLink>
      <SidebarLink :key="'apps' + imagesLoaded" :image="applicationsIconUrl" to="/applications"
        >Applications</SidebarLink
      >
      <SidebarLink
        v-if="userRole === 'Trusted' || userRole === 'Admin'"
        :key="'trusted' + imagesLoaded"
        :image="trustedIconUrl"
        to="/trusted"
        >Trusted</SidebarLink
      >
      <SidebarLink
        v-if="userRole === 'Admin'"
        :key="'admin' + imagesLoaded"
        :image="adminIconUrl"
        to="/admin"
        >Admin</SidebarLink
      >
      <SidebarLink
        :key="'support' + imagesLoaded"
        :image="supportIconUrl"
        to="/support"
        >Support</SidebarLink
      >
    </div>

    <div class="login-container">
      <div v-if="!userToken">
        <transition name="sidebar-login-transition" mode="out-in">
          <div v-if="!collapsed" key="expanded">
            <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="false" :collapsed="false"></Login>
          </div>
          <div v-else key="collapsed" class="collapsed-login-container">
            <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="false" :collapsed="true"></Login>
          </div>
        </transition>
      </div>
      <div v-else>
        <transition name="sidebar-login-transition" mode="out-in">
          <div v-if="!collapsed" key="expanded">
            <p>User: {{ username }}</p>
            <p>Access: {{ userRole }}</p>
            <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="true" :collapsed="false"></Login>
          </div>
          <div v-else key="collapsed" class="collapsed-logout-container">
            <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="true" :collapsed="true"></Login>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .collapse-icon {
    font-size: var(--text-lg);
    position: absolute;
    top: 0;
    right: 0;
    padding: var(--space-xs);
    cursor: pointer;
    color: var(--text-on-dark);
    transition: var(--transition-layout);
  }

  .rotate-180 {
    transform: rotate(90deg);
  }

  .sidebar-header {
    padding: var(--space-xl);
  }

  .debug-button {
    position: absolute;
    bottom: 60px;
    left: var(--space-sm);
    padding: var(--space-2xs) var(--space-sm);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-moderate);
  }

  .debug-button:hover {
    background-color: var(--border-subtle);
  }

  .login-container {
    position: absolute;
    bottom: var(--space-sm);
    left: var(--space-sm);
    right: var(--space-sm);
    text-align: center;
    background-color: var(--surface-card);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    border: 1px solid var(--brand-primary);
    transition: all var(--transition-moderate);
  }

  .collapsed-login-container,
  .collapsed-logout-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: var(--space-2xs);
    transition: all var(--transition-moderate);
  }

  .nav-links {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex-grow: 1;
    overflow-y: auto;
    padding-bottom: 120px;
    scrollbar-width: thin;
    scrollbar-color: var(--brand-accent) var(--surface-card);
  }

  .nav-links::-webkit-scrollbar {
    width: 6px;
  }

  .nav-links::-webkit-scrollbar-track {
    background: var(--surface-card);
    border-radius: 3px;
  }

  .nav-links::-webkit-scrollbar-thumb {
    background-color: var(--brand-accent);
    border-radius: 3px;
  }

  .nav-links::-webkit-scrollbar-thumb:hover {
    background-color: var(--brand-primary);
  }

  .logo-container {
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all var(--transition-layout);
    padding-top: 30px;
    padding-bottom: 25px;
  }

  .aspiring-hand-logo {
    height: auto;
    display: block;
    margin: 0 auto;
    background-color: var(--brand-primary);
    border-radius: 10%;
    transition: all var(--transition-layout);
    width: 75px;
  }

  .aspiring-hand-logo.collapsed {
    width: 40px;
    height: auto;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity var(--transition-layout);
  }
  .fade-enter, .fade-leave-to {
    opacity: 0;
  }

  .sidebar-login-transition-enter-active,
  .sidebar-login-transition-leave-active {
    transition: all var(--transition-moderate);
  }

  .sidebar-login-transition-enter-from,
  .sidebar-login-transition-leave-to {
    opacity: 0;
    transform: scale(0.9);
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
      transition: transform var(--transition-moderate);
    }

    .sidebar.show {
      transform: translateX(0);
    }
  }
</style>
