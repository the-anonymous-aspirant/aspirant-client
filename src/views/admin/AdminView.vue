<template>
  <div class="admin-view">
    <h1>Admin</h1>
    <h2 class="page-subtitle">Admin stuff. Don't break anything.</h2>

    <div class="application-list">
      <application-card
        v-for="app in apps"
        :key="app.route"
        :image-url="appImages[app.icon] || ''"
        :title="app.title"
        :description="app.description"
        :route="app.route"
        @card-click="openApp(app)"
      />
    </div>

    <h2 class="section-title">Tools</h2>
    <div class="application-list">
      <application-card
        v-for="tool in tools"
        :key="tool.route"
        :image-url="appImages[tool.icon] || ''"
        :title="tool.title"
        :description="tool.description"
        :route="tool.route"
        @card-click="openApp(tool)"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  // The Admin roster (#4842) — the ONE definition of the admin landing tiles,
  // lifted from the former inline <application-card> list so the two grids
  // render with v-for, the way views/applications/Applications.vue and
  // views/MemberView.vue already do. Titles, descriptions, routes, icons and
  // order are unchanged from the markup this replaces.
  //
  // `route` is a full path (these are absolute, unlike the hub registries'
  // suffixes); `icon` is an asset-manager key, and several tiles deliberately
  // share `default` — there is no hand-drawn icon for them yet. `newTab: true`
  // marks a destination nginx serves OUTSIDE the SPA: Penpot's canvas, the
  // Histoire build, the system_3 console and the lake explorer are reverse-
  // proxied paths, not Vue routes, so they need a real browser tab rather than
  // a router push or an iframe embed.
  const ADMIN_APPS = [
    {
      title: 'Assets',
      description: 'Image files and stuff',
      route: '/admin/assets',
      icon: 'default',
    },
    {
      title: 'User Resources',
      description: 'User accounts and permissions',
      route: '/admin/users',
      icon: 'default_user',
    },
    {
      title: 'Voice Commander',
      description: 'Record voice commands and manage extracted tasks',
      route: '/admin/voice-commander',
      icon: 'default',
    },
    {
      title: 'System Health',
      description: 'Container metrics, disk usage, and database stats',
      route: '/admin/system-health',
      icon: 'system_health_icon',
    },
    {
      title: 'Advisor',
      description: 'Ask about contracts, insurance, and legal documents',
      route: '/admin/advisor',
      icon: 'default',
    },
    {
      title: 'Browser Flows',
      description: 'Server-rendered Selenium flow runner — proxy/geo/UA probes',
      route: '/admin/browser-flows',
      icon: 'default',
    },
    {
      title: 'Penpot Design',
      description:
        'Self-hosted design tool — mockups, tokens, component libraries. Opens in a new tab (full canvas, not an iframe embed)',
      route: '/admin/penpot/',
      icon: 'penpot_design_icon',
      newTab: true,
    },
    {
      // Static Histoire build of the design system's stories (system_3 #2218).
      title: 'Histoire — Design System',
      description:
        'Component workbench — stories and variants for @aspirant/design-system. Opens in a new tab',
      route: '/admin/histoire/',
      icon: 'histoire_icon',
      newTab: true,
    },
    {
      // The system_3 fleet's Vue frontend, reverse-proxied to the backend on
      // the cell host (system_3 #2867).
      title: 'System 3',
      description: 'Agent fleet console — tasks, agents, health, chat. Opens in a new tab',
      route: '/admin/apps/system_3/',
      icon: 'default',
      newTab: true,
    },
    {
      // Encrypted data lake explorer (explorer over Garage + catalog).
      title: 'Data Lake',
      description: 'Browse encrypted lake — explorer over Garage + catalog. Opens in a new tab',
      route: '/admin/explorer/',
      icon: 'default',
      newTab: true,
    },
  ];

  const ADMIN_TOOLS = [
    {
      title: 'Kvitto Maker',
      description: 'Generate 12-month rent receipt PDFs',
      route: '/admin/tools/kvitto',
      icon: 'default',
    },
  ];

  export default {
    components: {
      ApplicationCard,
    },

    data() {
      return {
        apps: ADMIN_APPS,
        tools: ADMIN_TOOLS,
        // Keyed by asset-manager key, not by route, because several tiles share
        // `default`. Empty until loadImages() resolves; the keys it loads are
        // the distinct `icon` values of the two registries, so a new tile needs
        // no second edit here.
        appImages: {},
      };
    },
    methods: {
      async loadImages() {
        const keys = [...new Set([...ADMIN_APPS, ...ADMIN_TOOLS].map((app) => app.icon))];
        await Promise.all(
          keys.map(async (key) => {
            try {
              this.appImages[key] = await AssetManager.getAsset(key);
            } catch (error) {
              console.error(`Failed to load ${key}:`, error);
            }
          })
        );
      },
      // One handler for both grids: an nginx-served destination gets a full
      // browser tab, an in-app route gets a router push.
      openApp(app) {
        if (app.newTab) {
          window.open(app.route, '_blank', 'noopener');
          return;
        }
        this.$router.push(app.route);
      },
    },
    mounted() {
      this.loadImages();
    },
  };
</script>

<style scoped>
  .admin-view {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .admin-view h2 {
    margin-bottom: var(--space-xl);
  }

  .section-title {
    margin-top: var(--space-xl);
  }

  .application-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 900px;
    justify-content: center;
    padding: var(--space-sm);
  }

  .application-list :deep(.application-card) {
    width: 100%;
    height: 160px;
  }

  .application-list :deep(.app-image) {
    height: 60px;
    padding: var(--space-xs);
    padding-top: var(--space-sm);
  }

  .application-list :deep(.card-content) {
    padding: var(--space-sm);
    gap: var(--space-2xs);
  }

  .application-list :deep(.card-content h2) {
    font-size: var(--text-sm);
    margin: 0 0 var(--space-2xs);
  }

  .application-list :deep(.card-content p) {
    font-size: var(--text-xs);
  }

  @media (max-width: 767px) {
    .admin-view {
      padding: var(--space-md) var(--space-sm);
    }

    .application-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

    .application-list :deep(.application-card) {
      max-width: none;
      height: 160px;
    }
  }
</style>
