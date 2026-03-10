<template>
  <div class="game-hub">
    <h1>Game Center</h1>
    <h2>Challenge yourself with our collection of fun and engaging games!</h2>
    <div class="game-list">
      <application-card
        :image-url="gameImages.wordweaver"
        title="WordWeaver"
        description="Challenging both your language and tetris skills! Weave words while blocks fall!"
        route="wordweaver"
        @card-click="goToGame"
      />
      <application-card
        :image-url="gameImages.flappyduo"
        title="Flappy Duo"
        description="Teamwork makes the dreamwork! Control two birds in this cooperative challenge!"
        route="flappyduo"
        @card-click="goToGame"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  export default {
    name: 'GameHub',
    components: {
      ApplicationCard,
    },
    data() {
      return {
        gameImages: {
          wordweaver: '',
          flappyduo: '',
        },
      };
    },
    methods: {
      goToGame(game) {
        this.$router.push({ path: `/games/${game.toLowerCase()}` });
      },
      async loadImages() {
        try {
          this.gameImages.wordweaver = await AssetManager.getAsset('wordweaver_icon');
          this.gameImages.flappyduo = await AssetManager.getAsset('flappyduo_icon');
        } catch (error) {
          console.error('Failed to load game images:', error);
        }
      },
    },
    mounted() {
      this.loadImages();
    },
  };
</script>

<style scoped>
  .game-hub {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .game-hub h2 {
    margin-bottom: var(--space-xl);
  }

  .game-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 900px;
    justify-content: center;
    padding: var(--space-sm);
  }

  .game-list :deep(.application-card) {
    width: 100%;
    height: 160px;
  }

  .game-list :deep(.app-image) {
    height: 60px;
    padding: var(--space-xs);
    padding-top: var(--space-sm);
  }

  .game-list :deep(.card-content) {
    padding: var(--space-sm);
    gap: var(--space-2xs);
  }

  .game-list :deep(.card-content h2) {
    font-size: var(--text-sm);
    margin: 0 0 var(--space-2xs);
  }

  .game-list :deep(.card-content p) {
    font-size: var(--text-xs);
  }

  @media (max-width: 767px) {
    .game-hub {
      padding: var(--space-md) var(--space-sm);
    }

    .game-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

    .game-list :deep(.application-card) {
      max-width: none;
      height: 160px;
    }
  }
</style>
