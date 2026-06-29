<template>
  <div class="not-found">
    <div class="not-found-content">
      <h1 class="not-found-title">404</h1>
      <p class="not-found-message">Sidan kunde inte hittas.</p>
      <p class="not-found-attempted">
        <code>{{ attemptedPath }}</code>
      </p>
      <router-link to="/" class="not-found-home">
        Tillbaka till startsidan
      </router-link>
    </div>
  </div>
</template>

<script setup lang="js">
  import { computed } from 'vue';
  import { useRoute } from 'vue-router';

  const route = useRoute();
  const attemptedPath = computed(() => route.fullPath);
</script>

<style scoped>
  .not-found {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--space-lg) var(--space-md);
  }

  .not-found-content {
    text-align: center;
    max-width: 480px;
  }

  .not-found-title {
    font-size: 4rem;
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-on-light);
  }

  .not-found-message {
    font-size: var(--text-lg);
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-on-light);
  }

  .not-found-attempted {
    margin: 0 0 var(--space-lg) 0;
    color: var(--text-on-light);
    opacity: 0.7;
    word-break: break-all;
  }

  .not-found-attempted code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--text-base);
  }

  .not-found-home {
    display: inline-block;
    padding: var(--space-sm) var(--space-md);
    color: var(--text-on-dark);
    background-color: var(--bg-accent, #1976d2);
    text-decoration: none;
    border-radius: 4px;
  }

  .not-found-home:hover {
    opacity: 0.9;
  }
</style>
