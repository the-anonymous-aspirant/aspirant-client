<template>
  <div class="admin-view page">
    <h1>Admin</h1>
    <h2 class="page-subtitle">Admin stuff. Don't break anything.</h2>

    <div class="application-list">
      <application-card
        v-for="app in apps"
        :key="app.route"
        :image-url="appImages[app.icon] || ''"
        :title="app.title"
        :description="app.description"
        :route="app.route"
        :new-tab="!!app.newTab"
        :status="app.statusKey ? statuses[app.statusKey] : null"
        @card-click="openApp(app)"
      />
    </div>

    <h2 class="section-title">Tools</h2>
    <div class="application-list">
      <application-card
        v-for="tool in tools"
        :key="tool.route"
        :image-url="appImages[tool.icon] || ''"
        :title="tool.title"
        :description="tool.description"
        :route="tool.route"
        @card-click="openApp(tool)"
      />
    </div>
  </div>
</template>

<script>
  import axios from 'axios';
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';
  import { serverVerdict } from './healthVerdict.js';

  // The Admin roster (#4842) — the ONE definition of the admin landing tiles,
  // lifted from the former inline <application-card> list so the two grids
  // render with v-for, the way views/applications/Applications.vue and
  // views/MemberView.vue already do. Titles, descriptions, routes, icons and
  // order are unchanged from the markup this replaces.
  //
  // `route` is a full path (these are absolute, unlike the hub registries'
  // suffixes); `icon` is an asset-manager key, and several tiles deliberately
  // share `default` — there is no hand-drawn icon for them yet. `newTab: true`
  // marks a destination nginx serves OUTSIDE the SPA: Penpot's canvas, the
  // Histoire build, the system_3 console and the lake explorer are reverse-
  // proxied paths, not Vue routes, so they need a real browser tab rather than
  // a router push or an iframe embed; the card marks it "↗ new tab" in its
  // unclamped title row.
  //
  // The two tiles that can report trouble come first and carry `statusKey`,
  // so "does anything need me?" is answered on the first row at every width
  // (UX walk AA7, system_3 #11009). Every description fits the card's 3-line
  // clamp (§3.107) at 390px and at 1440px; admin-tiles-glance.spec.ts guards
  // it, so a longer one fails a test rather than being cut on screen.
  const ADMIN_APPS = [
    {
      title: 'System Health',
      description: 'Container metrics, disk usage, and database stats',
      route: '/admin/system-health',
      icon: 'system_health_icon',
      statusKey: 'health',
    },
    {
      title: 'Failed imports',
      description: 'Uploads that could not be imported, kept for checking',
      route: '/admin/import-failures',
      icon: 'default',
      statusKey: 'importFailures',
    },
    {
      title: 'Assets',
      description: 'Image files and stuff',
      route: '/admin/assets',
      icon: 'default',
    },
    {
      title: 'User Resources',
      description: 'User accounts and permissions',
      route: '/admin/users',
      icon: 'default_user',
    },
    {
      title: 'Voice Commander',
      description: 'Record voice commands and manage extracted tasks',
      route: '/admin/voice-commander',
      icon: 'default',
    },
    {
      title: 'Advisor',
      description: 'Ask about contracts, insurance, and legal documents',
      route: '/admin/advisor',
      icon: 'default',
    },
    {
      title: 'Browser Flows',
      description: 'Selenium flow runs and their probes',
      route: '/admin/browser-flows',
      icon: 'default',
    },
    {
      // The Constellations card editor (system_3 #8634 / #8645): admin-only by
      // operator decision 1; the server gates every /cardgen/* route too.
      title: 'Card Editor',
      description: 'Constellations card layouts and print sheets',
      route: '/admin/cardgen',
      icon: 'default',
    },
    {
      // The Christmas cards (system_3 #12582): admin-only; the server gates
      // every /christmas route too.
      title: 'Christmas cards',
      description: 'Seven picture cards; each word opens the next',
      route: '/admin/christmas',
      icon: 'default',
    },
    {
      title: 'Penpot Design',
      description: 'Design tool: mockups, tokens and components',
      route: '/admin/penpot/',
      icon: 'penpot_design_icon',
      newTab: true,
    },
    {
      // Static Histoire build of the design system's stories (system_3 #2218).
      title: 'Histoire — Design System',
      description: 'Stories and variants of the design system',
      route: '/admin/histoire/',
      icon: 'histoire_icon',
      newTab: true,
    },
    {
      // The system_3 fleet's Vue frontend, reverse-proxied to the backend on
      // the cell host (system_3 #2867).
      title: 'System 3',
      description: 'Agent fleet: tasks, agents, health, chat',
      route: '/admin/apps/system_3/',
      icon: 'default',
      newTab: true,
    },
    {
      // Encrypted data lake explorer (explorer over Garage + catalog).
      title: 'Data Lake',
      description: 'Explorer over the encrypted lake',
      route: '/admin/explorer/',
      icon: 'default',
      newTab: true,
    },
  ];

  const ADMIN_TOOLS = [
    {
      title: 'Kvitto Maker',
      description: 'Generate 12-month rent receipt PDFs',
      route: '/admin/tools/kvitto',
      icon: 'default',
    },
  ];

  export default {
    components: {
      ApplicationCard,
    },

    data() {
      return {
        apps: ADMIN_APPS,
        tools: ADMIN_TOOLS,
        // Keyed by asset-manager key, not by route, because several tiles share
        // `default`. Empty until loadImages() resolves; the keys it loads are
        // the distinct `icon` values of the two registries, so a new tile needs
        // no second edit here.
        appImages: {},
        // Per statusKey: `{ text, tone }`, or null while the read is in flight
        // (the tile then shows nothing rather than a guess).
        statuses: { health: null, importFailures: null },
      };
    },
    methods: {
      // One read each, independent: one failing never blanks the other. A
      // failed read says "Not read" and never a zero or an OK, which would
      // read as a measurement (D2).
      async loadStatuses() {
        const [health, failures] = await Promise.allSettled([
          axios.get('/api/health'),
          axios.get('/api/admin/invoicing/import-failures'),
        ]);
        this.statuses.health =
          health.status === 'fulfilled' && health.value.data
            ? {
                text: serverVerdict(health.value.data),
                // Both spellings the server has sent; the page's own CSS
                // treats each as the good state (.status-banner.ok/.healthy).
                tone: ['ok', 'healthy'].includes(health.value.data.status) ? 'ok' : 'warn',
              }
            : { text: 'Not read', tone: 'unknown' };
        const rows = failures.status === 'fulfilled' && failures.value.data && failures.value.data.data
          ? failures.value.data.data.failures
          : null;
        this.statuses.importFailures = Array.isArray(rows)
          ? rows.length === 0
            ? { text: 'No failed uploads', tone: 'ok' }
            : { text: `${rows.length} failed upload${rows.length === 1 ? '' : 's'}`, tone: 'warn' }
          : { text: 'Not read', tone: 'unknown' };
      },
      async loadImages() {
        const keys = [...new Set([...ADMIN_APPS, ...ADMIN_TOOLS].map((app) => app.icon))];
        await Promise.all(
          keys.map(async (key) => {
            try {
              this.appImages[key] = await AssetManager.getAsset(key);
            } catch (error) {
              console.error(`Failed to load ${key}:`, error);
            }
          })
        );
      },
      // One handler for both grids: an nginx-served destination gets a full
      // browser tab, an in-app route gets a router push.
      openApp(app) {
        if (app.newTab) {
          window.open(app.route, '_blank', 'noopener');
          return;
        }
        this.$router.push(app.route);
      },
    },
    mounted() {
      this.loadImages();
      this.loadStatuses();
    },
  };
</script>

<style scoped>
  /* The shell's .app-main carries the one gutter and .page the one title y
     (system_3 #9192, #9286): no root padding, no 100vh box (it scrolled 64 px
     past the content), nothing centred at page level (§3.114). */

  .admin-view h2 {
    margin-bottom: var(--space-xl);
  }

  .section-title {
    margin-top: var(--space-xl);
  }

  .application-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) 0 0;
    width: 100%;
    max-width: 900px;
    padding: var(--space-sm);
  }

  @media (max-width: 767px) {
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
