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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-xl);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 800px;
    justify-content: center;
    padding: var(--space-sm);
  }

  @media (min-width: 768px) {
    .game-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 767px) {
    .game-hub {
      padding: var(--space-md) var(--space-sm);
      padding-top: 70px;
    }

    .game-hub h1 {
      font-size: var(--text-2xl);
      margin-bottom: var(--space-sm);
    }

    .game-hub h2 {
      font-size: var(--text-base);
      margin-bottom: var(--space-lg);
      padding: 0 var(--space-sm);
    }

    .game-list {
      grid-template-columns: 1fr;
      gap: var(--space-lg);
      margin: var(--space-sm) auto;
      padding: 0 var(--space-2xs);
      max-width: 100%;
    }

    .application-card {
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
      width: 100%;
    }
  }
</style>
