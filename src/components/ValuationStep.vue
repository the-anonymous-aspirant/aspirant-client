<template>
  <section class="valuation-step" :class="{ 'valuation-step--wide': wide }">
    <h3 v-if="title" class="valuation-step__title">{{ title }}</h3>
    <slot />
  </section>
</template>

<script>
export default {
  name: 'ValuationStep',
  props: {
    title: { type: String, default: '' },
    wide: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.valuation-step {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.valuation-step--wide {
  display: block;
  text-align: left;
}

.valuation-step__title {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}
</style>
