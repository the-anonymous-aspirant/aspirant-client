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
    beforeDestroy() {
      AssetManager.releaseAsset('ludde_meal_tracker_icon');
      AssetManager.releaseAsset('home_icon');
      AssetManager.releaseAsset('message_board_icon');
      AssetManager.releaseAsset('30year_gift_icon');
    },
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
    .member {
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
