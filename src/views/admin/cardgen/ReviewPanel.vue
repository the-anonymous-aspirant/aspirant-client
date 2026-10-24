<template>
  <div class="review-panel" data-test="review-panel">
    <div class="review-head">
      <AspSegmented :options="typeOptions" :model-value="typeFilter" aria-label="Show cards of type" @update:model-value="setType" />
      <AspSegmented :options="sideOptions" :model-value="side" aria-label="Card side" @update:model-value="side = $event" />
      <AspSegmented :options="zoomOptions" :model-value="zoom" aria-label="Zoom" @update:model-value="zoom = $event" />
      <span class="count" data-test="review-count">{{ cards.length }} {{ cards.length === 1 ? 'card' : 'cards' }}</span>
    </div>

    <p v-if="loadError" class="load-error" data-test="review-error">{{ loadError }}</p>
    <p v-else-if="loading" class="loading" data-test="review-loading">Loading cards…</p>
    <AspEmptyState v-else-if="!cards.length" heading="No cards" message="Create a card in the Cards editor, or pick another type." />
    <ul v-else class="review-grid" data-test="review-grid">
      <li v-for="c in cards" :key="c.id" class="review-item" :data-test="`review-card-${c.id}`">
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
import { AspButton, AspEmptyState, AspSegmented } from '@aspirant/design-system';
import CardFace from '@/components/cardgen/CardFace.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardFaceAssets } from '@/composables/useCardFaceAssets.js';

export default {
  name: 'ReviewPanel',
  components: { AspButton, AspEmptyState, AspSegmented, CardFace },
  emits: ['edit'],
  setup() {
    const api = useCardgen();
    const assets = useCardFaceAssets();
    return { api, assets };
  },
  data() {
    return {
      types: [],
      cards: [],
      resolved: {},
      typeFilter: 0,
      side: 'front',
      zoom: 1,
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
}
.review-item {
  display: grid;
  gap: var(--space-2, 8px);
}
.review-caption {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: baseline;
  flex-wrap: wrap;
}
.review-name {
  font-weight: 600;
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
