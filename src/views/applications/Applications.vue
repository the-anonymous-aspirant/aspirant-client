<template>
  <div class="applications">
    <h1>Applications</h1>
    <h2 class="page-subtitle">Odds and ends. Some clever. Some stupid. Some just....weird</h2>
    <div class="application-list">
      <!--
        Dogfood spike (#1979): ApplicationCard replaced with the design-system
        AspCard. Title -> #header slot, image + description -> body, an "Open"
        hint -> #footer slot; interactive+@click preserves the original
        card-click-to-route behaviour.
      -->
      <AspCard
        v-for="app in apps"
        :key="app.route"
        class="app-card"
        variant="default"
        padding="lg"
        interactive
        @click="goToApplication(app.route)"
      >
        <template #header>{{ app.title }}</template>
        <img
          v-if="appImages[app.imageKey]"
          :src="appImages[app.imageKey]"
          :alt="app.title"
          class="app-card__image"
        />
        <div v-else class="app-card__image app-card__image--placeholder"></div>
        <p class="app-card__desc">
          <em>{{ app.description }}</em>
        </p>
        <template #footer>Open →</template>
      </AspCard>
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import { AspCard } from '@aspirant/design-system';

  export default {
    name: 'Applications',
    components: {
      AspCard,
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
        // App tiles, lifted from the former inline card list so the AspCard
        // grid can render them with v-for. Order and values are unchanged.
        apps: [
          {
            title: 'Transperator',
            description: 'Quickly make parts of pngs transparent',
            route: 'transparencymapper',
            imageKey: 'transparencymapper',
          },
          {
            title: 'Quiz Center',
            description: 'Quizzes and personality tests galore',
            route: 'quizzes',
            imageKey: 'quiz',
          },
          {
            title: 'Game Center',
            description: 'Fun and engaging games to pass the time',
            route: 'games',
            imageKey: 'games',
          },
          {
            title: 'Emotional Excellence',
            description: 'Track and analyze your emotions.',
            route: 'emotional-excellence',
            imageKey: 'emotionalExcellence',
          },
          {
            title: 'Remarkable PDFs',
            description: 'Generate PDFs for your Remarkable tablet',
            route: 'remarkable-pdfs',
            imageKey: 'remarkablePdfs',
          },
          {
            title: 'QR Generator',
            description: 'Generate QR codes from any text or URL.',
            route: 'qr-generator',
            imageKey: 'qrGenerator',
          },
        ],
      };
    },
    methods: {
      goToApplication(application) {
        this.$router.push({ path: `/applications/${application.toLowerCase()}` });
      },
      async loadImages() {
        const assets = {
          quiz: 'quiz_center_icon',
          games: 'game_center_icon',
          emotionalExcellence: 'emotion_tracker_icon',
          transparencymapper: 'transparency_icon',
          remarkablePdfs: 'home_icon',
          qrGenerator: 'qr_code_icon',
          home_icon: 'home_icon',
        };
        await Promise.all(
          Object.entries(assets).map(async ([key, assetName]) => {
            try {
              this.appImages[key] = await AssetManager.getAsset(assetName);
            } catch (error) {
              console.error(`Failed to load ${assetName}:`, error);
            }
          })
        );
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
    margin-bottom: var(--space-xl);
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

  .application-list .app-card {
    width: 100%;
    height: 100%;
  }

  /* Tighten the DS card's default padding="lg" spacing for this dense tile
     grid. AspCard exposes header/body/footer sub-parts via :deep. */
  .application-list :deep(.card__header) {
    font-size: var(--text-sm);
    padding: var(--space-sm) var(--space-md);
  }

  .application-list :deep(.card__body) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
  }

  .application-list :deep(.card__footer) {
    padding: var(--space-2xs) var(--space-md);
    text-align: right;
  }

  .app-card__image {
    width: 100%;
    height: 48px;
    object-fit: contain;
    filter: invert(1);
  }

  .app-card__image--placeholder {
    height: 48px;
    width: 100%;
    background: var(--surface-card-inner);
    border-radius: var(--radius-sm);
  }

  .app-card__desc {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-on-dark);
    text-align: center;
  }

  @media (max-width: 767px) {
    .applications {
      padding: var(--space-md) var(--space-sm);
    }

    .application-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

    .application-list .app-card {
      max-width: none;
      height: 100%;
    }
  }
</style>
