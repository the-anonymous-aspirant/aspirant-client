<template>
  <div class="cardgen-app" data-test="cardgen-app">
    <h1>Card Editor</h1>
    <p class="meta">
      Templated cards for the Constellations game: assets, templates with inheritance,
      cards with version history, and print export.
    </p>

    <div class="tabs-row">
      <AspSegmented
        :options="tabOptions"
        :model-value="activeTab"
        as="tabs"
        aria-label="Card editor sections"
        @update:model-value="selectTab"
      />
    </div>

    <section v-if="activeTab === 'assets'" id="cardgen-panel-assets" role="tabpanel" data-test="cardgen-panel-assets">
      <AspEmptyState title="Assets" description="Backgrounds, icons, artwork and fonts for the templates. The uploader and viewer land in the next change." />
    </section>
    <section v-else-if="activeTab === 'templates'" id="cardgen-panel-templates" role="tabpanel" data-test="cardgen-panel-templates">
      <AspEmptyState title="Templates" description="Card layouts with inheritance and version history. The editor lands in a later change." />
    </section>
    <section v-else-if="activeTab === 'cards'" id="cardgen-panel-cards" role="tabpanel" data-test="cardgen-panel-cards">
      <AspEmptyState title="Cards" description="The deck: relationship, action, life and connection cards, each with its own history. The editor and the review page land in later changes." />
    </section>
    <section v-else id="cardgen-panel-export" role="tabpanel" data-test="cardgen-panel-export">
      <AspEmptyState title="Export" description="Print sheets with bleed, crop marks and a grid, from a saved export profile. The PDF export lands in a later change." />
    </section>
  </div>
</template>

<script>
// system_3 #8634 / #8645: the admin-only card editor's shell. Operator decision
// 1 makes the whole app admin-only: the route carries meta ADMIN and the
// server gates every /cardgen/* route to Admin; what this view renders is
// visibility, not access. The four tabs are the app's sections; each panel is
// filled by its own subtask (B3 assets, C1 templates, C2 cards and B4 review,
// C3 export). The active tab is the optional :tab route param, so a section
// has a URL.
import { AspEmptyState, AspSegmented } from '@aspirant/design-system';

export const CARDGEN_TABS = [
  { value: 'assets', label: 'Assets', controls: 'cardgen-panel-assets', attrs: { 'data-test': 'cardgen-tab-assets' } },
  { value: 'templates', label: 'Templates', controls: 'cardgen-panel-templates', attrs: { 'data-test': 'cardgen-tab-templates' } },
  { value: 'cards', label: 'Cards', controls: 'cardgen-panel-cards', attrs: { 'data-test': 'cardgen-tab-cards' } },
  { value: 'export', label: 'Export', controls: 'cardgen-panel-export', attrs: { 'data-test': 'cardgen-tab-export' } },
];

const TAB_VALUES = new Set(CARDGEN_TABS.map((t) => t.value));

export default {
  name: 'CardgenApp',
  components: { AspEmptyState, AspSegmented },
  data() {
    return { tabOptions: CARDGEN_TABS };
  },
  computed: {
    activeTab() {
      const tab = this.$route.params.tab;
      return TAB_VALUES.has(tab) ? tab : 'assets';
    },
  },
  methods: {
    selectTab(value) {
      if (!TAB_VALUES.has(value) || value === this.activeTab) return;
      this.$router.push(`/admin/cardgen/${value}`);
    },
  },
};
</script>

<style scoped>
.cardgen-app {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-6, 24px) var(--space-4, 16px);
}
.meta {
  color: var(--text-muted);
  max-width: 70ch;
}
.tabs-row {
  margin: var(--space-4, 16px) 0;
}
</style>
