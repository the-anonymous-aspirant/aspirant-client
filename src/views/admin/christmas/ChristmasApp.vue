<template>
  <div class="christmas-app page" data-test="christmas-app">
    <header class="christmas-head">
      <h1>Christmas cards</h1>
    </header>

    <div class="tabs-row">
      <AspSegmented
        :options="tabOptions"
        :model-value="activeTab"
        as="tabs"
        aria-label="Christmas cards sections"
        @update:model-value="selectTab"
      />
    </div>

    <section v-if="activeTab === 'play'" id="christmas-panel-play" role="tabpanel" data-test="christmas-panel-play">
      <ChristmasPlay />
    </section>
    <section v-else id="christmas-panel-control" role="tabpanel" data-test="christmas-panel-control">
      <ChristmasControl />
    </section>
  </div>
</template>

<script>
// system_3 #12582: the Christmas cards, an admin-only picture puzzle. The
// route carries meta ADMIN and the server gates every /christmas route to
// Admin; this shell only picks the section. Play is the puzzle; Control holds
// the words, the pictures, the closing sentence and "go back to card".
import { AspSegmented } from '@aspirant/design-system';
import ChristmasControl from './ChristmasControl.vue';
import ChristmasPlay from './ChristmasPlay.vue';

const TABS = [
  { value: 'play', label: 'Play', controls: 'christmas-panel-play', attrs: { 'data-test': 'christmas-tab-play' } },
  { value: 'control', label: 'Control', controls: 'christmas-panel-control', attrs: { 'data-test': 'christmas-tab-control' } },
];

export default {
  name: 'ChristmasApp',
  components: { AspSegmented, ChristmasControl, ChristmasPlay },
  data() {
    return { tabOptions: TABS };
  },
  computed: {
    activeTab() {
      return this.$route.params.tab === 'control' ? 'control' : 'play';
    },
  },
  methods: {
    selectTab(value) {
      if (value === this.activeTab) return;
      this.$router.push(value === 'control' ? '/admin/christmas/control' : '/admin/christmas');
    },
  },
};
</script>

<style scoped>
.christmas-app {
  max-width: 960px;
  margin: 0;
}
.christmas-head h1 {
  margin: 0 0 var(--space-2, 8px);
}
.tabs-row {
  display: flex;
  justify-content: flex-start;
  margin-bottom: var(--space-4, 16px);
  overflow-x: auto;
}
</style>
