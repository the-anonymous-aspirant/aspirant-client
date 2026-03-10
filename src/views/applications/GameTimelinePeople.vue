<script>
import GameTimeline from './GameTimeline.vue';
import { historicalPeople, shufflePeople, getRandomPeopleSet } from '@/resources/games/historical_people.js';

export default {
  components: { GameTimeline },
  data() {
    return {
      items: historicalPeople,
      getRandomSet: getRandomPeopleSet,
      shuffleItems: shufflePeople,
    };
  },
};
</script>

<template>
  <GameTimeline
    title="Historical Figures"
    :items="items"
    :getRandomSet="getRandomSet"
    :shuffleItems="shuffleItems"
    yearLabel="was born"
    :sliderMin="-3000"
    :defaultYear="100"
    storageKey="timeline-people"
    :totalItems="20"
  />
</template>
