<template>
  <div class="not-found page">
    <div class="not-found-content">
      <h1 class="not-found-title">Page not found</h1>
      <p class="not-found-message">
        There is nothing at <code>{{ attemptedPath }}</code>.
      </p>
      <AspButton variant="primary" to="/" class="not-found-home">
        Back to the home page
      </AspButton>
    </div>
  </div>
</template>

<script setup lang="js">
  import { computed } from 'vue';
  import { useRoute } from 'vue-router';
  import { AspButton } from '@aspirant/design-system';

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
</style>
