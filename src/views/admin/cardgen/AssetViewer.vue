<template>
  <AspModal :open="open" size="lg" :title="asset ? asset.original_filename : 'Asset'" @update:open="$emit('update:open', $event)">
    <div class="viewer" data-test="asset-viewer">
      <p v-if="loadError" class="load-error" data-test="viewer-error">{{ loadError }}</p>
      <p v-else-if="!asset" class="loading">Loading…</p>
      <template v-else>
        <section class="preview" data-test="viewer-preview">
          <template v-if="asset.kind === 'image' || asset.kind === 'svg'">
            <div v-if="asset.kind === 'image'" class="preview-controls">
              <AspSegmented :options="sizeOptions" :model-value="sizeMode" aria-label="Preview size" @update:model-value="sizeMode = $event" />
              <span v-if="asset.pixel_width" class="muted" data-test="viewer-pixels">
                {{ asset.pixel_width }}×{{ asset.pixel_height }} px, {{ mmAtDpi(asset.pixel_width) }}×{{ mmAtDpi(asset.pixel_height) }} mm at 300 DPI
              </span>
            </div>
            <div class="image-box" :class="{ 'image-box--real': sizeMode === 'real' }">
              <!-- SVG is only ever an <img>: a blob: URL carries the app's origin and
                   an SVG opened in a document context would run as the admin. -->
              <img v-if="blobUrl" :src="blobUrl" :alt="asset.original_filename" data-test="viewer-image" :class="{ real: sizeMode === 'real' }" />
              <p v-else-if="blobError" class="load-error">{{ blobError }}</p>
            </div>
          </template>
          <template v-else-if="asset.kind === 'pdf'">
            <iframe v-if="blobUrl" :src="blobUrl" class="pdf-frame" :title="asset.original_filename" data-test="viewer-pdf"></iframe>
            <p v-else-if="blobError" class="load-error" data-test="viewer-blob-error">{{ blobError }}</p>
          </template>
          <template v-else-if="asset.kind === 'font'">
            <p class="font-sample" :style="{ fontFamily: fontFamily ? `'${fontFamily}', serif` : undefined }" data-test="viewer-font-sample">
              The quick brown fox jumps over the lazy dog. 0123456789 — CONSTELLATIONS
            </p>
            <p v-if="fontError" class="load-error">{{ fontError }}</p>
          </template>
        </section>

        <div class="facts">
        <dl class="meta" data-test="viewer-meta">
          <dt>Kind</dt><dd>{{ asset.kind }} ({{ asset.media_type }})</dd>
          <dt>Size</dt><dd>{{ formatBytes(asset.byte_size) }}</dd>
          <dt>SHA-256</dt><dd class="mono" :title="asset.sha256" data-test="viewer-sha">{{ shortSha(asset.sha256) }}…</dd>
          <dt>Uploaded</dt><dd><time :datetime="asset.created_at" :title="asset.created_at" data-test="viewer-uploaded">{{ relativeTime(asset.created_at) }}</time> by {{ actorLabel(asset.uploaded_by_user_id, undefined, asset.uploaded_by_name) }}</dd>
        </dl>

        <section class="usage" data-test="viewer-usage">
          <h3>Used by</h3>
          <p v-if="usageError" class="load-error">{{ usageError }}</p>
          <p v-else-if="!usage" class="muted">Reading usage…</p>
          <p v-else-if="!inUse" class="muted" data-test="usage-none">Nothing references this asset yet.</p>
          <ul v-else class="usage-list">
            <li v-for="t in usage.templates" :key="`t-${t.id}`" data-test="usage-template">
              Template <router-link :to="`/admin/cardgen/templates/${t.id}`">{{ t.name }}</router-link> (v{{ t.version_no }}): {{ t.elements.join(', ') }}
            </li>
            <li v-for="c in usage.cards" :key="`c-${c.id}`" data-test="usage-card">
              Card <router-link :to="`/admin/cardgen/cards/${c.id}`">{{ c.name }}</router-link> (v{{ c.version_no }}): {{ c.elements.join(', ') }}
            </li>
          </ul>
        </section>
        </div>
      </template>
    </div>
    <template #footer>
      <AspTooltip :content="inUse ? 'Remove the references first' : 'Delete this asset'">
        <AspButton variant="destructive" type="button" :disabled="!asset || inUse || !usage" data-test="viewer-delete" @click="confirmOpen = true">
          Delete
        </AspButton>
      </AspTooltip>
      <AspButton variant="secondary" type="button" data-test="viewer-close" @click="$emit('update:open', false)">Close</AspButton>
    </template>
  </AspModal>

  <AspModal :open="confirmOpen" size="sm" title="Delete this asset?" @update:open="confirmOpen = $event">
    <p>The bytes stay in the store (uploading the same file again restores it), but the asset leaves the list.</p>
    <p v-if="deleteError" class="load-error" data-test="delete-error">{{ deleteError }}</p>
    <template #footer>
      <AspButton variant="secondary" type="button" @click="confirmOpen = false">Keep</AspButton>
      <AspButton variant="destructive" type="button" :loading="deleting" data-test="viewer-delete-confirm" @click="doDelete">Delete</AspButton>
    </template>
  </AspModal>
</template>

<script>
// system_3 #8634 / #8648: one asset, previewed by kind (raster and SVG through
// <img>, PDF through the browser's viewer in an <iframe>, fonts through a
// FontFace sample), its metadata, what references it (#8647), and delete.
// From the md breakpoint the facts (metadata, "Used by") sit in a column
// beside the preview, so the usage an admin opens the viewer for before a
// delete is in view without a scroll (#8818, #8804 O4).
import { AspButton, AspModal, AspSegmented, AspTooltip } from '@aspirant/design-system';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardgenBlobs, formatBytes, mmAtDpi } from '@/composables/useCardgenBlobs.js';
import { actorLabel, relativeTime, shortSha } from '@/lib/cardgen/format.js';

export default {
  name: 'AssetViewer',
  components: { AspButton, AspModal, AspSegmented, AspTooltip },
  props: {
    assetId: { type: Number, required: true },
    open: { type: Boolean, default: false },
  },
  emits: ['update:open', 'deleted'],
  setup() {
    const api = useCardgen();
    const blobs = useCardgenBlobs();
    return { api, blobs };
  },
  data() {
    return {
      asset: null,
      loadError: null,
      blobUrl: null,
      blobError: null,
      fontFamily: null,
      fontError: null,
      usage: null,
      usageError: null,
      sizeMode: 'fit',
      sizeOptions: [
        { value: 'fit', label: 'Fit' },
        { value: 'real', label: 'Real size' },
      ],
      confirmOpen: false,
      deleting: false,
      deleteError: null,
    };
  },
  computed: {
    inUse() {
      return !!this.usage && (this.usage.templates.length > 0 || this.usage.cards.length > 0);
    },
  },
  watch: {
    assetId: { immediate: true, handler: 'load' },
  },
  methods: {
    formatBytes,
    mmAtDpi,
    actorLabel,
    relativeTime,
    shortSha,
    async load() {
      this.asset = null;
      this.loadError = null;
      this.blobUrl = null;
      this.blobError = null;
      this.fontFamily = null;
      this.fontError = null;
      this.usage = null;
      this.usageError = null;
      const { asset, error } = await this.api.getAsset(this.assetId);
      if (error || !asset) {
        this.loadError = error || 'Asset not found';
        return;
      }
      this.asset = asset;
      if (asset.kind === 'font') {
        const { family, error: ferr } = await this.blobs.fontFor(asset.id);
        this.fontFamily = family;
        this.fontError = ferr;
      } else {
        const { url, error: berr } = await this.blobs.urlFor(asset.id, asset.kind === 'pdf' ? ['application/pdf'] : ['image/']);
        this.blobUrl = url;
        this.blobError = berr;
      }
      const { usage, error: uerr } = await this.api.getAssetUsage(asset.id);
      if (uerr) this.usageError = uerr;
      else this.usage = usage || { templates: [], cards: [] };
    },
    async doDelete() {
      this.deleting = true;
      this.deleteError = null;
      const { error } = await this.api.deleteAsset(this.assetId);
      this.deleting = false;
      if (error) {
        this.deleteError = error;
        return;
      }
      this.confirmOpen = false;
      this.$emit('deleted', this.assetId);
    },
  },
};
</script>

<style scoped>
.viewer {
  display: grid;
  gap: var(--space-4, 16px);
}
/* The modal's sized panel starts at 768 px (AspModal); below it the sheet
   keeps the single column. */
@media (min-width: 768px) {
  .viewer {
    grid-template-columns: minmax(0, 1fr) minmax(14rem, 18rem);
    align-items: start;
  }
  .viewer > .load-error,
  .viewer > .loading {
    grid-column: 1 / -1;
  }
}
.facts {
  display: grid;
  gap: var(--space-4, 16px);
  align-content: start;
  min-width: 0;
}
.preview {
  min-width: 0;
}
.preview-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  align-items: center;
  margin-bottom: var(--space-2, 8px);
}
.image-box {
  max-height: 60vh;
  overflow: auto;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, currentColor 6%, transparent);
  border-radius: var(--radius-sm, 4px);
}
.image-box img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
.image-box--real {
  place-items: start;
}
.image-box img.real {
  max-width: none;
  max-height: none;
}
.pdf-frame {
  width: 100%;
  height: 60vh;
  border: 0;
}
.font-sample {
  font-size: 1.6rem;
  line-height: 1.4;
  margin: 0;
}
.meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1, 4px) var(--space-3, 12px);
  margin: 0;
}
.meta dt {
  color: var(--text-muted);
}
.meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.mono {
  font-family: var(--font-family-mono, monospace);
  font-size: var(--text-sm);
}
.usage h3 {
  font-size: var(--text-md, 1rem);
  margin: 0 0 var(--space-2, 8px);
}
.usage-list {
  margin: 0;
  padding-left: 1.2em;
}
.muted {
  color: var(--text-muted);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
