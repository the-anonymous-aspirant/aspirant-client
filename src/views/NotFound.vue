<template>
  <div class="not-found page">
    <div class="not-found-content">
      <h1 class="not-found-title">Page not found</h1>
      <p class="not-found-message">
        There is nothing at <code>{{ attemptedPath }}</code>.
      </p>
      <router-link to="/" class="not-found-home">
        Back to the home page
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
  /* At the shell's gutter, left-aligned (#9192, §3.114). The 60vh box that
     centred the message vertically is gone, so its title starts at the one
     title y; 480px is the content block's reading cap. */
  .not-found-content {
    max-width: 480px;
  }

  /* The route title on the one title step (#9193, §3.120): no size of its own. */
  .not-found-title {
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-on-light);
  }

  .not-found-message {
    margin: 0 0 var(--space-lg) 0;
    color: var(--text-on-light);
    word-break: break-word;
  }

  .not-found-message code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }

  /* AspButton renders only a <button>, which cannot navigate; this stays a
     real <a> (via router-link) styled as AspButton primary md, matching its
     fill, radius, height and hover (#9944). */
  .not-found-home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    font-family: var(--font-family-base);
    font-size: var(--text-base);
    font-weight: var(--font-weight-medium);
    line-height: 1;
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--brand-primary);
    color: var(--text-on-fixed-light);
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .not-found-home:hover {
    background: var(--brand-primary-hover);
    color: var(--text-on-dark);
  }

  .not-found-home:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
