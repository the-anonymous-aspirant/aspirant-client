<script>
import GameTimeline from './GameTimeline.vue';
import { technologicalInnovations, shuffleInnovations, getInnovationSubset } from '@/resources/games/technological_innovations.js';

export default {
  components: { GameTimeline },
  data() {
    return {
      items: technologicalInnovations,
      getRandomSet: getInnovationSubset,
      shuffleItems: shuffleInnovations,
    };
  },
};
</script>

<template>
  <GameTimeline
    page-title="Innovation Quiz"
    page-subtitle="Put inventions in order, or guess the year each was made."
    title="Innovations"
    :items="items"
    :getRandomSet="getRandomSet"
    :shuffleItems="shuffleItems"
    yearLabel="was invented"
    :sliderMin="-10000"
    :defaultYear="1500"
    storageKey="timeline-tech"
    :totalItems="20"
  />
</template>
