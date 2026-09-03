<template>
  <div class="api-status-view">
    <h1>API Resources</h1>
    <h2 class="page-subtitle">Endpoint status and record counts</h2>
    <div class="api-cards">
      <ApiCard
        v-for="card in cards"
        :key="card.endpoint"
        :title="card.title"
        :endpoint="card.endpoint"
      />
    </div>
  </div>
</template>

<script>
  import ApiCard from '../../components/ApiCard.vue';

  // The API-status roster (#4842) — the ONE definition of which endpoints this
  // page probes, lifted from the former inline <ApiCard> literals so the grid
  // renders with v-for. Titles and endpoints are unchanged.
  //
  // Each row is a {title, endpoint} pair; ApiCard GETs the endpoint on mount
  // and renders the status code plus, for a list response, the row count.
  // The first five are `data_models` tables and the list is NOT derived from
  // the backend's `data_models` set — it can fall behind a table added or
  // renamed server-side, which is why the pairs are worth having in one place
  // rather than spread across the template.
  const API_CARDS = [
    { title: 'Users', endpoint: '/api/data_models/users' },
    { title: 'Roles', endpoint: '/api/data_models/roles' },
    { title: 'Messages', endpoint: '/api/data_models/message' },
    { title: 'Feeding Times', endpoint: '/api/data_models/ludde_feeding_times' },
    { title: 'Word Weaver', endpoint: '/api/data_models/word_weaver_scores' },
    { title: 'Game Scores', endpoint: '/api/games/scores?game=_ping&limit=1' },
    { title: 'Transcriber', endpoint: '/api/transcriber/health' },
    { title: 'Commander', endpoint: '/api/commander/health' },
  ];

  export default {
    components: {
      ApiCard,
    },
    data() {
      return {
        cards: API_CARDS,
      };
    },
  };
</script>

<style scoped>
  .api-status-view {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    color: var(--text-on-light);
  }

  .page-subtitle {
    color: var(--text-muted);
    font-weight: normal;
    margin-bottom: var(--space-xl);
  }

  .api-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-lg);
    width: 100%;
  }

  @media (max-width: 768px) {
    .api-cards {
      grid-template-columns: 1fr;
    }

    .api-status-view {
      padding: var(--space-md);
    }
  }
</style>
