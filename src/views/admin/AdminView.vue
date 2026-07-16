<template>
  <div class="admin-view">
    <h1>Admin</h1>
    <h2 class="page-subtitle">Admin stuff. Don't break anything.</h2>

    <div class="application-list">
      <application-card
        :image-url="appImages.default"
        title="Assets"
        description="Image files and stuff"
        route="/admin/assets"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default_user"
        title="User Resources"
        description="User accounts and permissions"
        route="/admin/users"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="Voice Commander"
        description="Record voice commands and manage extracted tasks"
        route="/admin/voice-commander"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="System Health"
        description="Container metrics, disk usage, and database stats"
        route="/admin/system-health"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="reMarkable Notebooks"
        description="Browse, render, and sync notebooks"
        route="/admin/remarkable"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="Finance"
        description="Track spending, upload bank CSVs, view reports"
        route="/admin/finance"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="Advisor"
        description="Ask about contracts, insurance, and legal documents"
        route="/admin/advisor"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="Browser Flows"
        description="Server-rendered Selenium flow runner — proxy/geo/UA probes"
        route="/admin/browser-flows"
        @card-click="navigateTo"
      />
      <!-- Opens in a new tab: Penpot's canvas needs a full browser tab, not
           an iframe embed. The path is served by nginx (auth_request-gated
           reverse proxy to penpot-frontend), not a Vue route. -->
      <application-card
        :image-url="appImages.default"
        title="Penpot Design"
        description="Self-hosted design tool — mockups, tokens, component libraries. Opens in a new tab (full canvas, not an iframe embed)"
        route="/admin/penpot/"
        @card-click="openInNewTab"
      />
    </div>

    <h2 class="section-title">Tools</h2>
    <div class="application-list">
      <application-card
        :image-url="appImages.default"
        title="Kvitto Maker"
        description="Generate 12-month rent receipt PDFs"
        route="/admin/tools/kvitto"
        @card-click="navigateTo"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  export default {
    components: {
      ApplicationCard,
    },

    data() {
      return {
        appImages: {
          default_user: '',
          default: '',
        },
      };
    },
    methods: {
      async loadImages() {
        await Promise.all(
          Object.keys(this.appImages).map(async (key) => {
            try {
              this.appImages[key] = await AssetManager.getAsset(key);
            } catch (error) {
              console.error(`Failed to load ${key}:`, error);
            }
          })
        );
      },
      navigateTo(route) {
        this.$router.push(route);
      },
      // For nginx-served (non-SPA) destinations like Penpot, which need a
      // full browser tab rather than an in-app route or iframe.
      openInNewTab(route) {
        window.open(route, '_blank', 'noopener');
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
