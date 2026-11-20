<template>
  <!-- The one title shape for the Applications family (system_3 #11000, UX
       walk AG8): a link back to the index the visitor came from, then the
       item's one name, left in the page gutter, in the page's own ink. Every
       page under Applications uses it, so the set reads as one site. -->
  <header class="application-header" data-test="application-header">
    <RouterLink v-if="backTo" :to="backTo" class="application-header__back" data-test="application-back">
      <AspIcon name="back" size="sm" class="application-header__back-icon" />{{ backLabel }}
    </RouterLink>
    <h1 class="application-header__title" data-test="application-title">{{ title }}</h1>
    <slot />
  </header>
</template>

<script>
  import { AspIcon } from '@aspirant/design-system';

  export default {
    name: 'ApplicationHeader',
    components: { AspIcon },
    props: {
      title: { type: String, required: true },
      // Where "back" goes, and what it is called: the index this page is
      // listed on (Applications, Quiz Center or Game Center).
      backTo: { type: String, default: '' },
      backLabel: { type: String, default: '' },
    },
  };
</script>

<style scoped>
  .application-header {
    width: 100%;
    text-align: left;
  }

  /* The design system's back control's look (AspBackButton): muted ink, the
     registry's back glyph, a 44px touch target (§3.122 P8, standalone
     touch-first control). A RouterLink, not AspBackButton: it always lands on
     its index, even on a page opened by a direct link (design ack on #11000). */
  .application-header__back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: 44px;
    margin-bottom: var(--space-2xs);
    color: var(--text-muted);
    font-family: var(--font-family-base);
    font-size: var(--text-sm);
    text-decoration: none;
  }

  .application-header__back:hover {
    color: var(--text-on-light);
  }

  /* The global h1 (style.css): --text-xl, the page's ink. Restated here so a
     page's own centring or colour on its container cannot move it. */
  .application-header__title {
    font-size: var(--text-xl);
    line-height: 1.1;
    color: var(--text-on-light);
    text-align: left;
    margin: 0 0 var(--space-md);
  }
</style>
