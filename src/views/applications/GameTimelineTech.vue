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
