<template>
  <div class="member">
    <h1>Member</h1>

    <div class="member-content">
      <!-- Shared: logged-in tools used by more than one person, or general
           utilities. -->
      <section class="member-section">
        <h2 class="page-subtitle">Shared</h2>
        <div class="application-list">
          <application-card
            v-for="app in sharedApps"
            :key="app.route"
            :image-url="appImages[app.route] || ''"
            :title="app.title"
            :description="app.description"
            :route="app.route"
            @card-click="() => goTo('shared', app.route)"
          />
        </div>
      </section>

      <!-- Personal: apps built for one specific person, and since #4331 only
           the ones this identity owns (an admin sees all, mirroring the
           server's ValidateUserOrAdmin). The owner map lives in
           member/apps.js, next to the routes.go constants it is derived from;
           the intended-user annotation is still NOT surfaced on the card
           (#4198). A member who owns none gets no section at all rather than an
           empty heading. -->
      <section v-if="personalApps.length" class="member-section" data-test="member-personal-section">
        <h2 class="page-subtitle">Personal</h2>
        <div class="application-list">
          <application-card
            v-for="app in personalApps"
            :key="app.route"
            :image-url="appImages[app.route] || ''"
            :title="app.title"
            :description="app.description"
            :route="app.route"
            @card-click="() => goTo('personal', app.route)"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script>
  import AssetManager from '../asset_manager';
  import ApplicationCard from '../components/ApplicationCard.vue';
  import { SHARED_APPS, visiblePersonalApps } from './member/apps.js';

  export default {
    components: {
      ApplicationCard,
    },
    data() {
      return {
        sharedApps: SHARED_APPS,
        // #4331: the personal roster narrowed to this identity. Read once at
        // construction from the same localStorage keys Login.vue writes — the
        // page remounts on login/logout (authVersion), so there is nothing to
        // keep reactive here.
        personalApps: visiblePersonalApps(
          localStorage.getItem('user_name'),
          localStorage.getItem('user_role')
        ),
        // Keyed by route so the template can look each icon up regardless of
        // which section the card is in.
        appImages: {},
      };
    },
    methods: {
      goTo(section, route) {
        this.$router.push({ path: `/member/${section}/${route}` });
      },
      async loadImages() {
        const all = [...SHARED_APPS, ...this.personalApps];
        await Promise.all(
          all.map(async (app) => {
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
    // #5324: an asset-release hook spelled `beforeDestroy` stood here. Vue 3
    // never calls that name, so it had never run — deleting it is a runtime
    // no-op. It was deleted rather than renamed because AssetManager's cache is
    // a flat, un-refcounted, process-wide hash -> objectURL map, and several of
    // these names share a hash with assets other mounted components hold — so a
    // working release here would have revoked URLs out from under the
    // permanently-mounted sidebar. #5330 then measured exactly that happening
    // via HomeView, whose equivalent hook WAS spelled correctly, and removed
    // the release API entirely.
    //
    // The icons stay cached for the session, which is the behaviour that has
    // always shipped.
  };
</script>

<style scoped>
  .member {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .member-section {
    width: 100%;
    max-width: 900px;
  }

  .member-section + .member-section {
    margin-top: var(--space-2xl);
  }

  .member-content h2 {
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
    .member {
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
