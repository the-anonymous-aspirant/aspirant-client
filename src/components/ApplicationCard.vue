<template>
  <div class="application-card" @click="$emit('card-click', route)">
    <img v-if="shownImageUrl" :src="shownImageUrl" :alt="title" class="app-image" />
    <div v-else class="app-image app-image-placeholder"></div>
    <div class="card-content">
      <h2>{{ title }}</h2>
      <p>
        <em>{{ description }}</em>
      </p>
    </div>
  </div>
</template>

<script>
  import AssetManager from '../asset_manager';

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
    data() {
      return {
        // The generic app image, resolved only when this card has no image of
        // its own. `null` until then, so a card with a working icon costs no
        // extra request.
        fallbackImageUrl: null,
      };
    },
    computed: {
      shownImageUrl() {
        return this.imageUrl || this.fallbackImageUrl;
      },
    },
    watch: {
      imageUrl: {
        immediate: true,
        handler(url) {
          if (url) return;
          this.loadFallback();
        },
      },
    },
    methods: {
      /**
       * A card whose icon could not be fetched showed an EMPTY BOX — the
       * `v-else` div below. That is what nine member cards and two admin tiles
       * rendered for ~41 hours after twelve asset hashes were registered whose
       * bytes were never uploaded (system_3 #4840): visibly worse than the
       * generic placeholder they replaced.
       *
       * Scoped to this component rather than to `AssetManager.getAsset` on
       * purpose. A fallback inside the asset layer also puts images into every
       * OTHER consumer — the sidebar most of all — which changes layout for
       * viewers whose assets are gated, and measurably destabilised the mobile
       * card grid (four app-registries specs went red on mobile-safari, green
       * again once the fallback moved here).
       */
      async loadFallback() {
        try {
          this.fallbackImageUrl = await AssetManager.getAsset('default');
        } catch (error) {
          // Even the generic image is unreachable — keep the empty box rather
          // than retry; the placeholder is the honest last resort.
          console.warn('Default application image could not be loaded:', error);
        }
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
    /* #5327 / §3.107: NO fixed height. A `height: 160px` here sat around
       unconstrained children (60px image + an unclamped title + the
       description's own 3-line clamp), so `overflow: hidden` cut whatever did
       not fit — at whatever pixel the box edge landed on, which is what got
       reported as "clips mid-word". Measured at 390x844 across all five hubs,
       34 cards overflowed.

       The fix is not a bigger number: 190px still clipped 15 of them (every
       2-line title by 3px, because this box is `border-box` with a 3px border,
       plus /admin's 3-line "Histoire — Design System" by 23px), and the value
       that cleared everything left the majority 1-line cards with a third of
       the card empty. The hub grids are CSS grid, whose default
       `align-items: stretch` already makes every card in a row match the
       tallest one — so letting content set the height keeps rows even, cannot
       clip by construction, and has no number to re-derive when a title grows.
       Ruling on #5327; §3.107 amended. */
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
    /* Declared explicitly rather than relying on the engine: an engaged
       `-webkit-line-clamp` already renders the ellipsis in current Chromium
       without this, but that is an undocumented default other engines have not
       always shared. Safety net for a description that still exceeds 3 lines
       now that the card grows to its content (#5327). */
    text-overflow: ellipsis;
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
