<template>
  <div class="about page">
    <h1>This is an About page</h1>
    <div class="swatches">
      <!-- --brand-primary is amber in BOTH themes, so its ink must not flip:
           --text-on-fixed-light, not the deprecated --text-on-light, which
           resolves to #e0e0e0 under [data-theme='dark'] and lands at ~1.34:1
           on amber (DS token comment, Task-#2417). The "Surface Page" swatch
           below keeps --text-on-light on purpose — that surface DOES flip, so
           surface and ink flip together.
           Classes, not style="" (system_3 #9132): this block is static, so
           Vue inserts it as an HTML string, and a style attribute in it is
           parser-inserted, which a style-src without 'unsafe-inline' refuses. -->
      <p class="swatch--brand-primary">Brand Primary</p>
      <p class="swatch--brand-primary-alpha">Brand Primary Alpha</p>
      <p class="swatch--brand-accent">Brand Accent</p>
      <p class="swatch--surface-card">Surface Card</p>
      <p class="swatch--surface-page">Surface Page</p>
      <p class="swatch--feedback-error">Feedback Error</p>
      <p class="swatch--feedback-success">Feedback Success</p>
      <p class="swatch--feedback-info">Feedback Info</p>
    </div>
    <h2>It's a page about the app</h2>
  </div>
</template>

<style scoped>
  .about {
    color: var(--text-on-light);
  }

  .swatches p {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xs);
    font-weight: 500;
  }

  .swatch--brand-primary { background-color: var(--brand-primary); color: var(--text-on-fixed-light); }
  .swatch--brand-primary-alpha { background-color: var(--brand-primary-alpha); color: var(--text-on-dark); }
  .swatch--brand-accent { background-color: var(--brand-accent); color: var(--text-on-dark); }
  .swatch--surface-card { background-color: var(--surface-card); color: var(--text-on-dark); }
  .swatch--surface-page { background-color: var(--surface-page); color: var(--text-on-light); }
  .swatch--feedback-error { background-color: var(--feedback-error); color: var(--text-on-dark); }
  .swatch--feedback-success { background-color: var(--feedback-success); color: var(--text-on-dark); }
  .swatch--feedback-info { background-color: var(--feedback-info); color: var(--text-on-dark); }
</style>
