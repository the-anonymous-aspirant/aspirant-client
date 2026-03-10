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
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-lg);
    width: 100%;
    margin: var(--space-xl) 0;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .admin-view {
      padding: var(--space-md);
    }
  }
</style>
