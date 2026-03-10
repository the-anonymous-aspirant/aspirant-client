<template>
  <div class="application-card" @click="$emit('card-click', route)">
    <img :src="imageUrl" :alt="title" class="app-image" />
    <div class="card-content">
      <h2>{{ title }}</h2>
      <p>
        <em>{{ description }}</em>
      </p>
    </div>
  </div>
</template>

<script>
  export default {
    name: 'ApplicationCard',
    props: {
      imageUrl: {
        type: String,
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
      route: {
        type: String,
        required: true,
      },
    },
  };
</script>

<style scoped>
  .application-card {
    border: 3px solid var(--border-card);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: all var(--transition-base);
    width: 100%;
    height: 160px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--surface-card);
    box-shadow: var(--shadow-sm);
    flex-shrink: 0;
  }

  .application-card:hover {
    transform: scale(1.05);
    border-color: var(--brand-accent);
    box-shadow: var(--shadow-lg);
  }

  .app-image {
    width: 100%;
    height: 60px;
    object-fit: contain;
    object-position: bottom;
    border-bottom: none;
    display: block;
    padding: var(--space-xs);
    padding-top: var(--space-sm);
    filter: invert(1);
  }

  .card-content {
    padding: var(--space-sm);
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: var(--space-2xs);
    background-color: var(--surface-card);
  }

  .card-content h2 {
    margin: 0 0 var(--space-2xs);
    font-size: var(--text-sm);
    color: var(--text-heading-card);
  }

  .card-content p {
    margin: 0;
    color: var(--text-on-dark);
    font-size: var(--text-xs);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  /* Touch device improvements */
  @media (hover: none) and (pointer: coarse) {
    .application-card:hover {
      transform: none;
    }

    .application-card:active {
      transform: scale(0.98);
      border-color: var(--brand-accent);
    }
  }
</style>
