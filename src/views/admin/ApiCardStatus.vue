<template>
  <div class="api-status-view">
    <h1>API Resources</h1>
    <h2 class="page-subtitle">Endpoint status and record counts</h2>
    <div class="api-cards">
      <ApiCard title="Users" endpoint="/api/data_models/users" />
      <ApiCard title="Roles" endpoint="/api/data_models/roles" />
      <ApiCard title="Messages" endpoint="/api/data_models/message" />
      <ApiCard title="Feeding Times" endpoint="/api/data_models/ludde_feeding_times" />
      <ApiCard title="Word Weaver" endpoint="/api/data_models/word_weaver_scores" />
      <ApiCard title="Game Scores" endpoint="/api/games/scores?game=_ping&limit=1" />
      <ApiCard title="Transcriber" endpoint="/api/transcriber/health" />
      <ApiCard title="Commander" endpoint="/api/commander/health" />
    </div>
  </div>
</template>

<script>
  import ApiCard from '../../components/ApiCard.vue';

  export default {
    components: {
      ApiCard,
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
