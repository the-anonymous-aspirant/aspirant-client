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
    justify-content: center;
    height: 100vh;
    color: var(--text-on-light);
    width: 100%;
  }

  .trusted-content {
    text-align: center;
  }

  .trusted-content h2 {
    margin-bottom: var(--space-xl);
  }

  .application-list {
    display: flex;
    justify-content: flex-start;
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding: var(--space-lg) var(--space-sm);
    width: 100%;
    scrollbar-width: thin;
    scrollbar-color: var(--brand-accent) var(--surface-card);
    -webkit-overflow-scrolling: touch;
  }

  .application-list::-webkit-scrollbar {
    height: 8px;
  }

  .application-list::-webkit-scrollbar-track {
    background: var(--surface-card);
    border-radius: var(--radius-sm);
  }

  .application-list::-webkit-scrollbar-thumb {
    background-color: var(--brand-accent);
    border-radius: var(--radius-sm);
  }

</style>
