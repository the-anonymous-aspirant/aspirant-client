<script>
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
  import { useRoute } from 'vue-router';
  import {
    debugMode,
    toggleDebugMode,
    collapsed,
    toggleSidebar,
    sidebarWidth,
    isMobile,
    sidebarHidden,
    bumpAuthVersion,
  } from '../../global_state_manager.js';
  import axios from 'axios';
  import SidebarLink from './SidebarLink.vue';
  import Login from './Login.vue';
  import UserAvatar from '../UserAvatar.vue';
  import assetManager from '../../asset_manager';

  export default {
    name: 'Sidebar',
    components: { SidebarLink, Login, UserAvatar },
    props: {},
    setup() {
      const route = useRoute();
      // The /login page (system_3 #3342) renders its own copy of this same
      // Login form as the page's focus. Leaving the sidebar's copy visible
      // too would put two forms with the same input ids on screen at once —
      // confusing, and invalid HTML besides. Only the anonymous-state form
      // is suppressed; a logged-in visitor who navigates to /login is
      // bounced elsewhere by LoginView's own guard before this matters.
      // `route` is reactive (vue-router), so this stays correct across SPA
      // navigation into and out of /login, not just on a fresh mount.
      const onLoginPage = computed(() => route.path === '/login');
      const username = ref(localStorage.getItem('user_name'));
      const userRole = ref(localStorage.getItem('user_role'));
      // Display label for the who-am-I strip. The role IDENTIFIER stays
      // 'Trusted' in code and on the wire — renaming it is a breaking change
      // (see router.js MEMBER_ROLES) — but the area is surfaced to the user as
      // "Member" (#4184), so the trusted tier reads "Member" under their name
      // rather than the internal identifier (#4223 item 1, operator ask #1544).
      // Admin/Guest keep their own labels.
      const roleLabel = computed(() =>
        userRole.value === 'Trusted' ? 'Member' : userRole.value
      );
      const aspiringHandImageUrl = ref('');
      // The logged-in user's own avatar URL (#4170), used both as the Profile
      // sidebar entry's icon and in the who-am-I strip. '' ⇒ the default_user
      // glyph / initials fallback.
      const profileAvatarUrl = ref('');

      // Add refs for sidebar icons - initialize as null instead of empty string
      const homeIconUrl = ref(null);
      const applicationsIconUrl = ref(null);
      const memberIconUrl = ref(null);
      const adminIconUrl = ref(null);
      const supportIconUrl = ref(null);
      const defaultUserIconUrl = ref(null);

      // Add loading state ref
      const imagesLoaded = ref(false);

      // Fetch the logged-in user's own avatar for the sidebar. Best-effort: a
      // 401 (not logged in) or any error just leaves the placeholder in place.
      const fetchProfileAvatar = async () => {
        if (!localStorage.getItem('user_name')) {
          profileAvatarUrl.value = '';
          return;
        }
        try {
          const res = await axios.get('/api/profile');
          const data = res.data && 'data' in res.data ? res.data.data : res.data;
          profileAvatarUrl.value = (data && data.avatar_url) || '';
        } catch (error) {
          profileAvatarUrl.value = '';
        }
      };

      const refreshUserData = () => {
        console.log('Refreshing user data');
        username.value = localStorage.getItem('user_name');
        userRole.value = localStorage.getItem('user_role');
        bumpAuthVersion();
        fetchProfileAvatar();
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

          memberIconUrl.value = await assetManager.getAsset('family');

          adminIconUrl.value = await assetManager.getAsset('admin');

          defaultUserIconUrl.value = await assetManager.getAsset('default_user');

          supportIconUrl.value = await assetManager.getAsset('coffemug');

          imagesLoaded.value = true;

          // Load the logged-in user's avatar (if any) for the Profile entry.
          await fetchProfileAvatar();
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
        roleLabel,
        refreshUserData,
        aspiringHandImageUrl,
        homeIconUrl,
        applicationsIconUrl,
        memberIconUrl,
        adminIconUrl,
        supportIconUrl,
        defaultUserIconUrl,
        profileAvatarUrl,
        imagesLoaded,
        isMobile,
        sidebarHidden,
        onLoginPage,
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
        :class="{ collapsed: collapsed, 'rotate-side': !collapsed }"
        @click="toggleSidebar"
      />
    </div>

    <div class="nav-links">
      <SidebarLink :key="'home' + imagesLoaded" :image="homeIconUrl" to="/">Home</SidebarLink>
      <SidebarLink :key="'apps' + imagesLoaded" :image="applicationsIconUrl" to="/applications"
        >Applications</SidebarLink
      >
      <!-- Member area (#4184): renamed from "Trusted"; the same role gate. A
           single top-level link to the member index, like Applications — the
           app catalog lives on the main-page card grid, not a per-app sidebar
           tree (#4198: the earlier Shared/Personal sub-nav duplicated the cards
           and swamped the nav). -->
      <template v-if="userRole === 'Trusted' || userRole === 'Admin'">
        <SidebarLink
          :key="'member' + imagesLoaded"
          :image="memberIconUrl"
          to="/member"
          >Member</SidebarLink
        >
      </template>
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
      <!-- The Profile entry was removed (#4201): the same avatar already
           appears in the who-am-I strip below, so a second copy here was
           redundant. That bottom avatar is now the single, clickable surface. -->
    </div>

    <transition name="sidebar-login-transition" mode="out-in">
      <div v-if="!collapsed" class="auth-section">
        <div v-if="!username && !onLoginPage">
          <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="false"></Login>
        </div>
        <div v-else-if="username" class="user-info">
          <router-link to="/profile" class="user-avatar-link" aria-label="Your profile">
            <UserAvatar :avatar-url="profileAvatarUrl" :name="username" :size="48" />
          </router-link>
          <p class="user-detail">{{ username }}</p>
          <p class="user-role">{{ roleLabel }}</p>
          <Login @login="refreshUserData" @logout="refreshUserData" :loggedIn="true"></Login>
        </div>
      </div>
    </transition>
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

  .rotate-side {
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

  .auth-section {
    text-align: center;
    padding: var(--space-sm) var(--space-sm) 0;
    border-top: 1px solid var(--border-subtle);
    margin-top: var(--space-2xl);
  }

  .user-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
  }

  /* The who-am-I avatar is the single Profile entry point (#4201) — clickable,
     keyboard-focusable, with a hover/focus affordance so it reads as a link. */
  .user-avatar-link {
    display: inline-flex;
    border-radius: 50%;
    cursor: pointer;
    transition: opacity var(--transition-moderate);
  }

  .user-avatar-link:hover {
    opacity: 0.85;
  }

  .user-avatar-link:focus-visible {
    outline: 2px solid var(--brand-primary);
    outline-offset: 2px;
  }

  .user-detail {
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    font-weight: 600;
    margin: 0;
  }

  .user-role {
    color: var(--brand-primary);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-xs);
  }

  .nav-links {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex-grow: 1;
    overflow-y: auto;
    padding-top: var(--space-md);
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
    padding-bottom: var(--space-md);
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
    width: 45px;
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
