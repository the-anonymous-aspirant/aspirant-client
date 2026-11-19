<script>
import GameTimeline from './GameTimeline.vue';
import { historicalConflicts, shuffleConflicts, getRandomConflictsSet } from '@/resources/games/historical_conflicts.js';

export default {
  components: { GameTimeline },
  data() {
    return {
      items: historicalConflicts,
      getRandomSet: getRandomConflictsSet,
      shuffleItems: shuffleConflicts,
    };
  },
};
</script>

<template>
  <GameTimeline
    page-title="Conflict Quiz"
    page-subtitle="Put historical conflicts in order, or guess the year each one began."
    title="Historical Conflicts"
    :items="items"
    :getRandomSet="getRandomSet"
    :shuffleItems="shuffleItems"
    yearLabel="began"
    :sliderMin="-3200"
    :defaultYear="100"
    storageKey="timeline-conflicts"
    :totalItems="20"
  />
</template>
