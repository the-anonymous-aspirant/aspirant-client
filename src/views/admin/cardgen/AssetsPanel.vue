<template>
  <div class="assets-panel" data-test="assets-panel">
    <div
      class="dropzone"
      :class="{ dragging: isDragging }"
      data-test="asset-dropzone"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <p class="dropzone-text">
        Drop backgrounds, icons, artwork, fonts or PDFs here. PNG, JPEG, WebP, GIF, SVG, PDF, TTF, OTF, WOFF and WOFF2,
        up to 25 MB each. The same file twice is stored once.
      </p>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="visually-hidden"
        data-test="asset-file-input"
        accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.ttf,.otf,.woff,.woff2"
        @change="onFilesPicked"
      />
      <AspButton variant="primary" type="button" data-test="asset-pick" @click="$refs.fileInput.click()">
        Choose files
      </AspButton>
    </div>

    <ul v-if="uploads.length" class="upload-rows" data-test="upload-rows">
      <li v-for="u in uploads" :key="u.key" class="upload-row" :data-test="`upload-row-${u.state}`">
        <span class="upload-name">{{ u.name }}</span>
        <span class="upload-size">{{ formatBytes(u.size) }}</span>
        <progress v-if="u.state === 'uploading'" class="upload-progress" :value="u.progress" max="100" :aria-label="`Uploading ${u.name}`"></progress>
        <span class="upload-status" :class="`upload-status--${u.state}`">{{ u.message }}</span>
      </li>
    </ul>

    <div class="grid-head">
      <AspSegmented
        :options="kindOptions"
        :model-value="kindFilter"
        aria-label="Show assets of kind"
        @update:model-value="setKind"
      />
      <span class="count" data-test="asset-count">{{ assets.length }} {{ assets.length === 1 ? 'asset' : 'assets' }}</span>
    </div>

    <p v-if="loadError" class="load-error" data-test="assets-error">{{ loadError }}</p>
    <p v-else-if="loading" class="loading" data-test="assets-loading">Loading assets…</p>
    <AspEmptyState
      v-else-if="!assets.length"
      heading="No assets yet"
      message="Upload the artwork, icons and fonts the card templates will use."
    />
    <ul v-else class="asset-grid" data-test="asset-grid">
      <li v-for="a in assets" :key="a.id">
        <button type="button" class="asset-card" :data-test="`asset-card-${a.id}`" @click="open(a)">
          <span class="asset-thumb">
            <img v-if="a.kind === 'image' && thumbs[a.id]" :src="thumbs[a.id]" :alt="a.original_filename" />
            <AspBadge v-else variant="chip">{{ kindLabel(a.kind) }}</AspBadge>
          </span>
          <span class="asset-name">{{ a.original_filename }}</span>
          <span class="asset-meta">
            {{ formatBytes(a.byte_size) }}<template v-if="a.pixel_width"> · {{ a.pixel_width }}×{{ a.pixel_height }} px</template>
          </span>
        </button>
      </li>
    </ul>

    <AssetViewer
      v-if="viewerId"
      :asset-id="viewerId"
      :open="viewerOpen"
      @update:open="onViewerOpen"
      @deleted="onDeleted"
    />
  </div>
</template>

<script>
// system_3 #8634 / #8648: the card editor's asset store, client side. Every
// byte goes through the server's sniffing upload (#8642); this panel only
// shows what the server stored and what references it (#8647).
import { AspBadge, AspButton, AspEmptyState, AspSegmented } from '@aspirant/design-system';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardgenBlobs, formatBytes } from '@/composables/useCardgenBlobs.js';
import AssetViewer from './AssetViewer.vue';

const KINDS = [
  { value: '', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'svg', label: 'SVG' },
  { value: 'pdf', label: 'PDF' },
  { value: 'font', label: 'Fonts' },
];

const KIND_LABELS = { image: 'Image', svg: 'SVG', pdf: 'PDF', font: 'Font' };

export default {
  name: 'AssetsPanel',
  components: { AspBadge, AspButton, AspEmptyState, AspSegmented, AssetViewer },
  setup() {
    const api = useCardgen();
    const blobs = useCardgenBlobs();
    return { api, blobs };
  },
  data() {
    return {
      assets: [],
      thumbs: {},
      loading: true,
      loadError: null,
      kindFilter: '',
      kindOptions: KINDS,
      uploads: [],
      isDragging: false,
      viewerId: null,
      viewerOpen: false,
    };
  },
  methods: {
    formatBytes,
    kindLabel(kind) {
      return KIND_LABELS[kind] || kind;
    },
    async load() {
      this.loading = true;
      this.loadError = null;
      const { assets, error } = await this.api.listAssets(this.kindFilter || undefined);
      this.loading = false;
      if (error) {
        this.loadError = error;
        return;
      }
      this.assets = assets;
      for (const a of assets) {
        if (a.kind === 'image' && !this.thumbs[a.id]) {
          this.blobs.urlFor(a.id).then(({ url }) => {
            if (url) this.thumbs = { ...this.thumbs, [a.id]: url };
          });
        }
      }
    },
    setKind(value) {
      this.kindFilter = value;
      this.load();
    },
    onFilesPicked(e) {
      this.queueFiles(Array.from(e.target.files || []));
      e.target.value = '';
    },
    onDrop(e) {
      this.isDragging = false;
      this.queueFiles(Array.from(e.dataTransfer.files || []));
    },
    async queueFiles(files) {
      // One at a time: the progress bar then means one file, and the server
      // sees the files in the order they were picked.
      for (const file of files) {
        const row = { key: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, size: file.size, progress: 0, state: 'uploading', message: 'Uploading…' };
        this.uploads = [row, ...this.uploads];
        const { asset, deduplicated, error } = await this.api.uploadAsset(file, (pct) => {
          row.progress = pct;
        });
        if (error) {
          row.state = 'failed';
          row.message = error;
          continue;
        }
        row.state = 'stored';
        row.message = deduplicated ? 'Already stored, same content' : 'Stored';
        row.asset = asset;
      }
      await this.load();
    },
    open(asset) {
      this.viewerId = asset.id;
      this.viewerOpen = true;
    },
    onViewerOpen(v) {
      this.viewerOpen = v;
      if (!v) this.viewerId = null;
    },
    onDeleted() {
      this.viewerOpen = false;
      this.viewerId = null;
      this.load();
    },
  },
  mounted() {
    this.load();
  },
};
</script>

<style scoped>
.dropzone {
  border: 2px dashed var(--border-control, currentColor);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-5, 20px);
  display: grid;
  gap: var(--space-3, 12px);
  justify-items: center;
  text-align: center;
}
.dropzone.dragging {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, currentColor 6%, transparent);
}
.dropzone-text {
  margin: 0;
  max-width: 60ch;
  color: var(--text-muted);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.upload-rows {
  list-style: none;
  margin: var(--space-4, 16px) 0 0;
  padding: 0;
  display: grid;
  gap: var(--space-2, 8px);
}
.upload-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-3, 12px);
  align-items: center;
}
.upload-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-size,
.upload-status {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.upload-status--failed {
  color: var(--status-negative, currentColor);
}
.upload-progress {
  width: 120px;
}
.grid-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  margin: var(--space-5, 20px) 0 var(--space-3, 12px);
}
.count {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.asset-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-3, 12px);
}
.asset-card {
  width: 100%;
  display: grid;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px);
  border: 1px solid var(--border-control, currentColor);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.asset-card:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}
.asset-thumb {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  background: color-mix(in srgb, currentColor 6%, transparent);
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}
.asset-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-meta {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
