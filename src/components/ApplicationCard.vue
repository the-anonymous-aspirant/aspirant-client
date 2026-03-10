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
    width: 240px;
    height: 280px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--surface-card);
    box-shadow: var(--shadow-sm);
    flex-shrink: 0;
  }

  .application-card:hover {
    transform: scale(1.1);
    border-color: var(--brand-accent);
    box-shadow: var(--shadow-lg);
  }

  .app-image {
    width: 100%;
    height: 120px;
    object-fit: contain;
    object-position: bottom;
    border-bottom: none;
    display: block;
    padding: var(--space-sm);
    padding-top: var(--space-lg);
    filter: invert(1);
  }

  .card-content {
    padding: var(--space-md);
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: var(--space-xs);
    background-color: var(--surface-card);
  }

  .card-content h2 {
    margin: 0 0 var(--space-sm);
    font-size: var(--text-lg);
    color: var(--text-heading-card);
  }

  .card-content p {
    margin: 0;
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  /* Mobile optimizations */
  @media (max-width: 767px) {
    .application-card {
      width: 100%;
      max-width: 350px;
      height: 320px;
      margin: 0 auto;
      border-radius: var(--radius-2xl);
    }

    .application-card:hover {
      transform: scale(1.02);
    }

    .app-image {
      height: 140px;
      padding: var(--space-md);
    }

    .card-content {
      padding: var(--space-lg);
    }

    .card-content h2 {
      font-size: var(--text-xl);
      margin-bottom: var(--space-sm);
    }

    .card-content p {
      font-size: var(--text-base);
      line-height: 1.4;
    }
  }

  /* Tablet portrait optimizations */
  @media (max-width: 991px) and (min-width: 768px) {
    .application-card {
      width: 100%;
      max-width: 280px;
      height: 300px;
    }

    .application-card:hover {
      transform: scale(1.05);
    }

    .app-image {
      height: 130px;
    }

    .card-content {
      padding: var(--space-md);
    }
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
