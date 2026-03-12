<template>
  <div class="admin-view">
    <h1>Admin</h1>
    <h2 class="page-subtitle">Admin stuff. Don't break anything.</h2>

    <div class="application-cards">
      <application-card
        :image-url="appImages.default"
        title="S3 Assets"
        description="Image files and stuff"
        route="/admin/s3_assets"
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
        try {
          for (const key of Object.keys(this.appImages)) {
            this.appImages[key] = await AssetManager.getAsset(key);
          }
        } catch (error) {
          console.error('Failed to load application images:', error);
        }
      },
      navigateTo(route) {
        this.$router.push(route);
      },
    },
    mounted() {
      this.loadImages();
    },
  };
</script>

<style scoped>
  .admin-view {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    color: var(--text-on-light);
  }

  .page-subtitle {
    color: var(--text-muted);
    font-weight: normal;
    margin-bottom: var(--space-xl);
  }

  .application-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    width: 100%;
    justify-content: center;
    padding: var(--space-sm);
  }

  .application-cards :deep(.application-card) {
    width: 100%;
    height: 160px;
  }

  .application-cards :deep(.app-image) {
    height: 60px;
    padding: var(--space-xs);
    padding-top: var(--space-sm);
  }

  .application-cards :deep(.card-content) {
    padding: var(--space-sm);
    gap: var(--space-2xs);
  }

  .application-cards :deep(.card-content h2) {
    font-size: var(--text-sm);
    margin: 0 0 var(--space-2xs);
  }

  .application-cards :deep(.card-content p) {
    font-size: var(--text-xs);
  }

  /* Mobile */
  @media (max-width: 767px) {
    .admin-view {
      padding: var(--space-md) var(--space-sm);
    }

    .application-cards {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

    .application-cards :deep(.application-card) {
      max-width: none;
      height: 160px;
    }
  }
</style>
