<template>
  <div class="about">
    <h1>This is an About page</h1>
    <div class="swatches">
      <!-- --brand-primary is amber in BOTH themes, so its ink must not flip:
           --text-on-fixed-light, not the deprecated --text-on-light, which
           resolves to #e0e0e0 under [data-theme='dark'] and lands at ~1.34:1
           on amber (DS token comment, Task-#2417). The "Surface Page" swatch
           below keeps --text-on-light on purpose — that surface DOES flip, so
           surface and ink flip together. -->
      <p style="background-color: var(--brand-primary); color: var(--text-on-fixed-light);">Brand Primary</p>
      <p style="background-color: var(--brand-primary-alpha); color: var(--text-on-dark);">Brand Primary Alpha</p>
      <p style="background-color: var(--brand-accent); color: var(--text-on-dark);">Brand Accent</p>
      <p style="background-color: var(--surface-card); color: var(--text-on-dark);">Surface Card</p>
      <p style="background-color: var(--surface-page); color: var(--text-on-light);">Surface Page</p>
      <p style="background-color: var(--feedback-error); color: var(--text-on-dark);">Feedback Error</p>
      <p style="background-color: var(--feedback-success); color: var(--text-on-dark);">Feedback Success</p>
      <p style="background-color: var(--feedback-info); color: var(--text-on-dark);">Feedback Info</p>
    </div>
    <h2>It's a page about the app</h2>
  </div>
</template>

<style scoped>
  .about {
    padding: var(--space-xl);
    color: var(--text-on-light);
  }

  .swatches p {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xs);
    font-weight: 500;
  }

  @media (min-width: 1024px) {
    .about {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
  }
</style>
