<template>
  <div class="applications">
    <h1>Applications</h1>
    <h2 class="page-subtitle">Odds and ends. Some clever. Some stupid. Some just....weird</h2>
    <div class="application-list">
      <!--
        #5284 (§3.106 R6b): this grid rendered AspCard tiles — title in a
        #header slot, a centered glyph in the body, a trailing "Open →" in a
        #footer — while /member, /admin, /quizzes and /games all rendered
        ApplicationCard: drawn icon on top, then title and description, with
        the WHOLE CARD as the affordance. One question ("launch an app"), two
        grammars. The ruling picks the icon-led whole-card one, so this hub
        adopts the component the other four already use rather than restyling
        an AspCard to resemble it — which is also what makes "the hubs render
        one grammar" checkable by a selector instead of by eye.

        The dogfood spike that introduced the AspCard here (#1979) is therefore
        reverted on this surface, deliberately and by ruling.
      -->
      <application-card
        v-for="app in apps"
        :key="app.route"
        :image-url="appImages[app.route] || ''"
        :title="app.title"
        :description="app.description"
        :route="app.route"
        @card-click="goToApplication(app.route)"
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
        // Keyed by route, the way MemberView.vue keys it, so one lookup serves
        // the template regardless of how the registry is ordered or grouped.
        appImages: {},
        // App tiles. `icon` is an asset-manager key; it replaced the former
        // `imageKey` indirection — a second name for the same thing, kept in
        // step by hand across three places (the row, the appImages seed, the
        // loadImages map) and already out of step: the Constellations row had
        // no seed entry while loadImages fetched its icon. Harmless under Vue
        // 3's reactivity, which is why it went unnoticed. Order, titles,
        // descriptions and routes are unchanged.
        apps: [
          {
            title: 'Transperator',
            description: 'Quickly make parts of pngs transparent',
            route: 'transparencymapper',
            icon: 'transparency_icon',
          },
          {
            title: 'Quiz Center',
            description: 'Quizzes and personality tests galore',
            route: 'quizzes',
            icon: 'quiz_center_icon',
          },
          {
            title: 'Game Center',
            description: 'Fun and engaging games to pass the time',
            route: 'games',
            icon: 'game_center_icon',
          },
          {
            title: 'Emotional Excellence',
            description: 'Track and analyze your emotions.',
            route: 'emotional-excellence',
            icon: 'emotion_tracker_icon',
          },
          {
            title: 'QR Generator',
            description: 'Generate QR codes from any text or URL.',
            route: 'qr-generator',
            icon: 'qr_code_icon',
          },
          {
            title: 'Constellations',
            description: 'A shared relationship-graph board for the card game',
            route: 'constellations',
            icon: 'constellations_icon',
          },
        ],
      };
    },
    methods: {
      goToApplication(application) {
        this.$router.push({ path: `/applications/${application.toLowerCase()}` });
      },
      async loadImages() {
        // Iterates the registry rather than a hand-kept parallel map. The old
        // map also fetched `home_icon`, which no card on this page reads;
        // Sidebar.vue acquires and releases that asset independently, so
        // dropping the fetch here cannot blank the sidebar icon.
        await Promise.all(
          this.apps.map(async (app) => {
            try {
              this.appImages[app.route] = await AssetManager.getAsset(app.icon);
            } catch (error) {
              console.error(`Failed to load ${app.icon}:`, error);
            }
          })
        );
      },
    },
    mounted() {
      this.loadImages();
    },
    // No release hook, deliberately. AssetManager's cache is a flat,
    // un-refcounted, process-wide hash -> objectURL map, so a per-view release
    // revoked URLs other mounted components still held. #5324 removed the dead
    // `beforeDestroy` release hooks; #5330 removed the two live ones and the
    // release API with them. Icons stay cached for the page session.
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

  @media (max-width: 767px) {
    .applications {
      padding: var(--space-md) var(--space-sm);
    }

    .application-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

  }
  /* #5327: the per-hub `.application-list :deep(...)` restatement of ApplicationCard's own
     defaults was deleted here. Every declaration in it (card height, image
     height/padding, card-content padding/gap, h2 font-size/margin, p
     font-size) was byte-identical to the component's own scoped style, in all
     five hubs — so it was restatement, not customisation, and five copies of
     one number is what #5323's acceptance names as the thing not to do. The
     component governs; a hub that genuinely needs to differ should say so and
     say why. */
</style>
