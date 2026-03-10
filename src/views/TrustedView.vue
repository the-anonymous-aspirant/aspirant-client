<template>
  <div class="trusted">
    <h1>Trusted</h1>

    <div class="trusted-content">
      <h2 class="page-subtitle">Applications</h2>
      <div class="application-list">
        <application-card
          :image-url="appImages.ludde"
          title="Ludde Meal Tracker"
          description="Track Ludde's meals. Bonus analytics included."
          route="ludde-analytics"
          @card-click="goToApplication"
        />
        <application-card
          :image-url="appImages.files"
          title="Files"
          description="Upload, download, and share files."
          route="files"
          @card-click="goToApplication"
        />
        <application-card
          :image-url="appImages.messageBoard"
          title="Message Board"
          description="Leave messages for the crew."
          route="message-board"
          @card-click="goToApplication"
        />
        <application-card
          :image-url="appImages.gift"
          title="Den Stökiga Väggen"
          description="Om bara någon kunde bringa ordning i kaoset..."
          route="30-year-gift"
          @card-click="goToApplication"
        />
        <application-card
          :image-url="appImages.translator"
          title="Translator"
          description="Translate text between languages"
          route="translator"
          @card-click="goToApplication"
        />
        <application-card
          :image-url="appImages.wikipedia"
          title="Wikipedia"
          description="Browse the English Wikipedia offline"
          route="wikipedia"
          @card-click="goToApplication"
        />
      </div>
    </div>
  </div>
</template>

<script>
  import AssetManager from '../asset_manager';
  import ApplicationCard from '../components/ApplicationCard.vue';

  export default {
    components: {
      ApplicationCard,
    },
    data() {
      return {
        appImages: {
          ludde: '',
          files: '',
          messageBoard: '',
          gift: '',
          translator: '',
          wikipedia: '',
        },
      };
    },
    methods: {
      goToApplication(application) {
        this.$router.push({ path: `/trusted/${application}` });
      },
      async loadImages() {
        try {
          this.appImages.ludde = await AssetManager.getAsset('ludde_meal_tracker_icon');
          this.appImages.files = await AssetManager.getAsset('home_icon');
          this.appImages.messageBoard = await AssetManager.getAsset('message_board_icon');
          this.appImages.gift = await AssetManager.getAsset('30year_gift_icon');
          this.appImages.translator = await AssetManager.getAsset('home_icon');
          this.appImages.wikipedia = await AssetManager.getAsset('home_icon');
        } catch (error) {
          console.error('Failed to load trusted application images:', error);
        }
      },
    },
    mounted() {
      this.loadImages();
    },
    beforeDestroy() {
      AssetManager.releaseAsset('ludde_meal_tracker_icon');
      AssetManager.releaseAsset('home_icon');
      AssetManager.releaseAsset('message_board_icon');
      AssetManager.releaseAsset('30year_gift_icon');
    },
  };
</script>

<style scoped>
  .trusted {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
    color: var(--text-on-light);
    width: 100%;
    padding: var(--space-lg);
  }

  .trusted-content {
    text-align: center;
    width: 100%;
    max-width: 900px;
  }

  .trusted-content h2 {
    margin-bottom: var(--space-xl);
  }

  .application-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    width: 100%;
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
    .trusted {
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
