<template>
  <div class="applications">
    <h1>Applications</h1>
    <h2 class="page-subtitle">Odds and ends. Some clever. Some stupid. Some just....weird</h2>
    <div class="application-list">
      <application-card
        :image-url="appImages.transparencymapper"
        title="Transperator"
        description="Quickly make parts of pngs transparent"
        route="transparencymapper"
        @card-click="goToApplication"
      />
      <application-card
        :image-url="appImages.quiz"
        title="Quiz Center"
        description="Quizzes and personality tests. Some educational, some just dumb."
        route="quizzes"
        @card-click="goToApplication"
      />
      <application-card
        :image-url="appImages.games"
        title="Game Center"
        description="Games. Some actually fun, others... well, they exist."
        route="games"
        @card-click="goToApplication"
      />
      <application-card
        :image-url="appImages.emotionalExcellence"
        title="Emotional Excellence"
        description="Track and analyze your emotions."
        route="emotional-excellence"
        @card-click="goToApplication"
      />
      <application-card
        :image-url="appImages.remarkablePdfs"
        title="Remarkable PDFs"
        description="Generate PDFs for your remarkable tablet. Planners and stuff."
        route="remarkable-pdfs"
        @card-click="goToApplication"
      />
      <application-card
        :image-url="appImages.qrGenerator"
        title="QR Generator"
        description="Generate QR codes from any text or URL."
        route="qr-generator"
        @card-click="goToApplication"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  export default {
    name: 'Applications',
    components: {
      ApplicationCard,
    },
    data() {
      return {
        appImages: {
          quiz: '',
          games: '',
          emotionalExcellence: '',
          transparencymapper: '',
          remarkablePdfs: '',
          qrGenerator: '',
          home_icon: '',
        },
      };
    },
    methods: {
      goToApplication(application) {
        this.$router.push({ path: `/applications/${application.toLowerCase()}` });
      },
      async loadImages() {
        try {
          this.appImages.quiz = await AssetManager.getAsset('quiz_center_icon');
          this.appImages.games = await AssetManager.getAsset('game_center_icon');
          this.appImages.emotionalExcellence = await AssetManager.getAsset('emotion_tracker_icon');
          this.appImages.transparencymapper = await AssetManager.getAsset('transparency_icon');
          this.appImages.remarkablePdfs = await AssetManager.getAsset('home_icon');
          this.appImages.qrGenerator = await AssetManager.getAsset('qr_code_icon');
          this.appImages.home_icon = await AssetManager.getAsset('home_icon');
        } catch (error) {
          console.error('Failed to load application images:', error);
        }
      },
    },
    mounted() {
      this.loadImages();
    },
  };
</script>

<style scoped>
  .applications {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .applications h2 {
    margin-bottom: var(--space-2xl);
  }

  .application-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-2xl);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 1400px;
    justify-content: center;
    padding: var(--space-sm);
  }

  @media (min-width: 1400px) {
    .application-list {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (max-width: 1399px) and (min-width: 992px) {
    .application-list {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 991px) and (min-width: 768px) {
    .applications {
      padding-top: var(--space-2xl);
    }

    .application-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-xl);
    }
  }

  @media (max-width: 767px) {
    .applications {
      padding: var(--space-md) var(--space-sm);
      padding-top: 70px;
    }

    .applications h1 {
      font-size: var(--text-2xl);
      margin-bottom: var(--space-sm);
    }

    .applications h2 {
      font-size: var(--text-base);
      margin-bottom: var(--space-lg);
      padding: 0 var(--space-sm);
    }

    .application-list {
      grid-template-columns: 1fr;
      gap: var(--space-lg);
      margin: var(--space-sm) auto;
      padding: 0 var(--space-2xs);
      max-width: 100%;
    }
  }
</style>
