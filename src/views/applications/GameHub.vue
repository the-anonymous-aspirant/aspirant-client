<template>
  <div class="game-hub">
    <h1>Game Center</h1>
    <h2>Challenge yourself with our collection of fun and engaging games!</h2>
    <div class="game-list">
      <application-card
        v-for="game in games"
        :key="game.route"
        :image-url="gameImages[game.route] || ''"
        :title="game.title"
        :description="game.description"
        :route="game.route"
        @card-click="goToGame"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  // The Game Center roster (#4842) — the ONE definition of this hub's tiles,
  // lifted from the former inline <application-card> list so the grid renders
  // with v-for, the way views/applications/Applications.vue and
  // views/MemberView.vue already do. Titles, descriptions, routes and icon
  // keys are unchanged from the markup this replaces.
  //
  // `route` is the path suffix under `/games/`; `icon` is an asset-manager
  // key; `roles` (optional) mirrors the route's own `meta.roles` in
  // src/router/router.js and is present only on gated games.
  //
  // The route strings are still typed twice: here, and in the `// Game routes`
  // block of src/router/router.js, which also needs the per-route component
  // import. Unifying the two was left out of scope by #4842; if a route moves,
  // both places move together — and `roles` here must move with the router's
  // `meta.roles`, which is the discrepancy below.
  const GAMES = [
    {
      title: 'WordWeaver',
      description: 'Weave words as tetris blocks fall',
      route: 'wordweaver',
      icon: 'wordweaver_icon',
    },
    {
      title: 'Flappy Duo',
      description: 'Control two birds in a cooperative challenge',
      route: 'flappyduo',
      icon: 'flappyduo_icon',
    },
    {
      // Gated in the router since it was added: router.js's /games/easter-hunt
      // entry carries meta:{roles:['Trusted','Admin']}. The tile used to render
      // for everyone, so a signed-out visitor was offered a card the guard then
      // bounced to '/' (#4841 audit, site 3). The `roles` field below is what
      // stops the hub advertising it.
      title: 'Easter Egg Hunt',
      description: 'Reveal squares to find hidden eggs',
      route: 'easter-hunt',
      icon: 'easter_hunt_icon',
      roles: ['Trusted', 'Admin'],
    },
  ];

  // The games one identity may be OFFERED. This is not access control — the
  // boundary is the router guard and, behind it, the server; `user_role` comes
  // from localStorage, which the user can edit. What it removes is the
  // visibility mismatch: a tile whose route would immediately bounce. Same
  // shape and same caveat as visiblePersonalApps() in views/member/apps.js.
  //
  // The predicate is the router guard's, character for character
  // (`!role || !requiredRoles.includes(role)` at router.js:178) — an
  // exact, case-sensitive match — so the tile is offered exactly when the
  // guard would let the click through. A looser check here would put the
  // mismatch back, just quieter.
  function visibleGames(role) {
    return GAMES.filter((game) => !game.roles || (!!role && game.roles.includes(role)));
  }

  export default {
    name: 'GameHub',
    components: {
      ApplicationCard,
    },
    data() {
      // Read once at construction from the same localStorage key Login.vue
      // writes; the page remounts on login/logout (authVersion), so there is
      // nothing to keep reactive here — the same reasoning as MemberView.
      const games = visibleGames(localStorage.getItem('user_role'));
      return {
        games,
        // Keyed by route so the template looks an icon up by the same field
        // the card is keyed on; empty until loadImages() resolves.
        gameImages: {},
      };
    },
    methods: {
      goToGame(game) {
        this.$router.push({ path: `/games/${game.toLowerCase()}` });
      },
      async loadImages() {
        await Promise.all(
          this.games.map(async (game) => {
            try {
              this.gameImages[game.route] = await AssetManager.getAsset(game.icon);
            } catch (error) {
              console.error(`Failed to load ${game.icon}:`, error);
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
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
