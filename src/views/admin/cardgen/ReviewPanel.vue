<template>
  <div class="review-panel" data-test="review-panel">
    <div class="review-head">
      <!-- Below 640 px the five-option type strip (469 px) collapses to a select
           (#8753 req 1, §3.114); the two short strips wrap in the row. -->
      <AspSelect v-if="narrow" :options="typeOptions" :model-value="typeFilter" aria-label="Show cards of type" data-test="review-type-select" @update:model-value="setType" />
      <AspSegmented v-else :options="typeOptions" :model-value="typeFilter" aria-label="Show cards of type" @update:model-value="setType" />
      <AspSegmented :options="sideOptions" :model-value="side" aria-label="Card side" @update:model-value="side = $event" />
      <AspSegmented :options="zoomOptions" :model-value="zoom" aria-label="Zoom" @update:model-value="zoom = $event" />
      <span class="count" data-test="review-count">{{ cards.length }} {{ cards.length === 1 ? 'card' : 'cards' }}</span>
    </div>

    <p v-if="loadError" class="load-error" data-test="review-error">{{ loadError }}</p>
    <p v-else-if="loading" class="loading" data-test="review-loading">Loading cards…</p>
    <AspEmptyState v-else-if="!cards.length" heading="No cards" message="Create a card in the Cards editor, or pick another type." />
    <ul v-else class="review-grid" data-test="review-grid">
      <li v-for="c in cards" :key="c.id" class="review-item" :style="itemStyle(c)" :data-test="`review-card-${c.id}`">
        <CardFace
          :face="faceOf(c)"
          :zoom="zoom"
          :asset-urls="assets.assetUrls"
          :font-families="assets.fontFamilies"
          :data-test="`card-face-${c.id}`"
        />
        <div class="review-caption">
          <span class="review-name">{{ c.name }}</span>
          <span class="muted">{{ typeName(c.card_type_id) }} · v{{ c.current_version_no }}</span>
          <AspButton variant="link" size="sm" type="button" :data-test="`review-edit-${c.id}`" @click="$emit('edit', c.id)">Edit</AspButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
// system_3 #8634 / #8649: the print-scale card review (c53319). Every card of
// the deck (or of one type) drawn front or back at 100 %, 50 % or 25 % of its
// physical size, from the server's resolved faces.
import { AspButton, AspEmptyState, AspSegmented, AspSelect } from '@aspirant/design-system';
import { useViewport } from '@/composables/useViewport.js';
import CardFace, { PX_PER_MM } from '@/components/cardgen/CardFace.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardFaceAssets } from '@/composables/useCardFaceAssets.js';

export default {
  name: 'ReviewPanel',
  components: { AspButton, AspEmptyState, AspSegmented, AspSelect, CardFace },
  emits: ['edit'],
  setup() {
    const api = useCardgen();
    const assets = useCardFaceAssets();
    // Top-level refs, so the template reads booleans (a ref inside a returned
    // object is not unwrapped and would be truthy at every width).
    const { narrow } = useViewport();
    return { api, assets, narrow };
  },
  data() {
    return {
      types: [],
      cards: [],
      resolved: {},
      typeFilter: 0,
      side: 'front',
      // 50 % below md (#8753 req 1): a 105 mm card at 100 % is wider than a phone.
      zoom: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 0.5 : 1,
      sideOptions: [
        { value: 'front', label: 'Front' },
        { value: 'back', label: 'Back' },
      ],
      zoomOptions: [
        { value: 1, label: '100 %' },
        { value: 0.5, label: '50 %' },
        { value: 0.25, label: '25 %' },
      ],
      loading: true,
      loadError: null,
    };
  },
  computed: {
    typeOptions() {
      return [{ value: 0, label: 'All types' }, ...this.types.map((t) => ({ value: t.id, label: t.name }))];
    },
  },
  methods: {
    typeName(id) {
      return this.types.find((t) => t.id === id)?.name || '';
    },
    faceOf(card) {
      const r = this.resolved[card.id];
      if (!r) return null;
      return this.side === 'back' ? r.back : r.front;
    },
    // O5 (#8804 report 622): fix the grid cell to the card's own width, same
    // formula as CardFace's faceStyle, so a long caption wraps under the card
    // instead of widening the cell and breaking the row's wrap count.
    itemStyle(card) {
      const wMm = this.faceOf(card)?.size?.w_mm ?? 105;
      return { width: `${wMm * PX_PER_MM * this.zoom}px` };
    },
    setType(value) {
      this.typeFilter = value;
      this.load();
    },
    async load() {
      this.loading = true;
      this.loadError = null;
      if (!this.types.length) {
        const { types, error } = await this.api.listTypes();
        if (error) {
          this.loading = false;
          this.loadError = error;
          return;
        }
        this.types = types;
      }
      const { cards, error } = await this.api.listCards(this.typeFilter || undefined);
      if (error) {
        this.loading = false;
        this.loadError = error;
        return;
      }
      this.cards = cards;
      const results = await Promise.all(cards.map((c) => this.api.resolveCard(c.id)));
      const resolved = {};
      const faces = [];
      results.forEach((r, i) => {
        if (r.resolved) {
          resolved[cards[i].id] = r.resolved;
          faces.push(r.resolved.front, r.resolved.back);
        }
      });
      this.resolved = resolved;
      this.loading = false;
      await this.assets.ensure(faces.filter(Boolean));
    },
  },
  mounted() {
    this.load();
  },
};
</script>

<style scoped>
.review-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  align-items: center;
  margin-bottom: var(--space-4, 16px);
}
.count,
.muted {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.review-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5, 20px);
  align-items: flex-start;
  /* A card wider than the viewport (100 % on a phone) scrolls inside the grid
     rather than widening the page (#8753 req 1). */
  max-width: 100%;
  overflow-x: auto;
}
.review-item {
  display: grid;
  gap: var(--space-2, 8px);
  /* width is set inline per card (itemStyle) -- min-width: 0 lets this grid
     item, and the flex children below, shrink below their content's
     min-content size instead of the caption forcing the item wider than the
     card (#8804 O5). flex: none keeps the item at that width when the row is
     narrower than one card (a phone at 100 %), where the face itself does not
     shrink either; the row scrolls sideways as it did before. */
  min-width: 0;
  flex: none;
}
.review-caption {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: baseline;
  flex-wrap: wrap;
  min-width: 0;
}
.review-name {
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
