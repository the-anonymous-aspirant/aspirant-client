<template>
  <AspModal :open="open" size="lg" :title="title" @update:open="$emit('update:open', $event)">
    <div class="picker" data-test="asset-picker">
      <p v-if="error" class="load-error">{{ error }}</p>
      <p v-else-if="!assets" class="muted">Reading assets…</p>
      <AspEmptyState v-else-if="!assets.length" heading="No matching assets" message="Upload one in the Assets section first." />
      <ul v-else class="picker-grid">
        <li v-for="a in assets" :key="a.id">
          <button type="button" class="pick" :class="{ 'pick--current': a.id === modelValue }" :data-test="`pick-asset-${a.id}`" @click="choose(a.id)">
            <span class="thumb">
              <img v-if="urls[a.id]" :src="urls[a.id]" alt="" />
              <span v-else-if="a.kind === 'font'" class="font-sample" :style="{ fontFamily: families[a.id] ? `'${families[a.id]}', serif` : undefined }">Aa</span>
              <span v-else class="kind">{{ a.kind }}</span>
            </span>
            <span class="pick-name">{{ a.original_filename }}</span>
          </button>
        </li>
      </ul>
    </div>
    <template #footer>
      <AspButton variant="secondary" type="button" data-test="pick-clear" @click="choose(null)">Clear</AspButton>
      <AspButton variant="secondary" type="button" data-test="pick-close" @click="$emit('update:open', false)">Close</AspButton>
    </template>
  </AspModal>
</template>

<script>
// system_3 #8634 / #8650: choose a stored asset for an element prop. Only the
// server's rows are offered, so a spec can only ever carry a server id.
import { AspButton, AspEmptyState, AspModal } from '@aspirant/design-system';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardgenBlobs } from '@/composables/useCardgenBlobs.js';

export default {
  name: 'AssetPicker',
  components: { AspButton, AspEmptyState, AspModal },
  props: {
    open: { type: Boolean, default: false },
    /** Asset kinds offered, e.g. ['image', 'svg'] or ['font']. */
    kinds: { type: Array, default: () => ['image', 'svg'] },
    modelValue: { type: Number, default: null },
    title: { type: String, default: 'Choose an asset' },
  },
  emits: ['update:open', 'update:modelValue'],
  setup() {
    const api = useCardgen();
    const blobs = useCardgenBlobs();
    return { api, blobs };
  },
  data() {
    return { assets: null, error: null, urls: {}, families: {} };
  },
  watch: {
    open: {
      immediate: true,
      handler(v) {
        if (v) this.load();
      },
    },
  },
  methods: {
    async load() {
      this.assets = null;
      this.error = null;
      const { assets, error } = await this.api.listAssets();
      if (error) {
        this.error = error;
        return;
      }
      this.assets = assets.filter((a) => this.kinds.includes(a.kind));
      for (const a of this.assets) {
        if (a.kind === 'font') {
          this.blobs.fontFor(a.id).then(({ family }) => { this.families = { ...this.families, [a.id]: family }; });
        } else {
          this.blobs.urlFor(a.id, ['image/']).then(({ url }) => { if (url) this.urls = { ...this.urls, [a.id]: url }; });
        }
      }
    },
    choose(id) {
      this.$emit('update:modelValue', id);
      this.$emit('update:open', false);
    },
  },
};
</script>

<style scoped>
.picker-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-3, 12px);
}
.pick {
  width: 100%;
  display: grid;
  gap: var(--space-1, 4px);
  padding: var(--space-2, 8px);
  background: transparent;
  color: inherit;
  border: 1px solid var(--border-subtle, currentColor);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.pick--current {
  outline: 2px solid var(--accent, currentColor);
}
.thumb {
  display: grid;
  place-items: center;
  height: 72px;
  background: color-mix(in srgb, currentColor 6%, transparent);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.font-sample {
  font-size: 2rem;
}
.kind {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.pick-name {
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.muted {
  color: var(--text-muted);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
