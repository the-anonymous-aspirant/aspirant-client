<template>
  <div class="export-panel" data-test="export-panel">
    <div class="export-form">
      <AspSelect :options="profileOptions" :model-value="profileId" label="Export profile" data-test="export-profile" @update:model-value="profileId = $event" />
      <AspSegmented :options="typeOptions" :model-value="typeFilter" aria-label="Cards to export" @update:model-value="typeFilter = $event" />
      <AspButton variant="primary" type="button" :disabled="!profile" :loading="building" data-test="export-build" @click="build">Build PDF</AspButton>
    </div>
    <dl v-if="profile" class="profile-facts" data-test="export-profile-facts">
      <dt>Card</dt><dd>{{ profile.spec.card_w_mm }}×{{ profile.spec.card_h_mm }} mm, radius {{ profile.spec.radius_mm || 0 }} mm, bleed {{ profile.spec.bleed_mm || 0 }} mm</dd>
      <dt>Sheet</dt><dd>{{ sheetText }}</dd>
      <dt>Print</dt><dd>{{ profile.spec.dpi || 300 }} DPI, crop marks {{ profile.spec.crop_marks ? 'on' : 'off' }}, backs {{ profile.spec.backs === 'mirror' ? 'mirrored for duplex' : 'none' }}</dd>
    </dl>
    <p class="muted">Text is drawn as vectors in the store's fonts; raster artwork is placed at the profile's size and checked against its DPI. Text boxes wrap at their width but are not clipped at their height.</p>

    <p v-if="error" class="load-error" data-test="export-error">{{ error }}</p>

    <section v-if="result" class="result" data-test="export-result">
      <p>
        <strong data-test="export-pages">{{ result.pages }} {{ result.pages === 1 ? 'page' : 'pages' }}</strong>
        for {{ result.cards }} {{ result.cards === 1 ? 'card' : 'cards' }}, {{ result.perPage }} per sheet<span v-if="result.bytes">, {{ formatBytes(result.bytes) }}</span>.
      </p>
      <p v-if="!result.warnings.length" class="muted" data-test="export-no-warnings">No warnings.</p>
      <ul v-else class="warnings" data-test="export-warnings">
        <li v-for="(w, i) in result.warnings" :key="i" :data-test="`export-warning-${w.kind}`">{{ w.message }}</li>
      </ul>
      <AspButton variant="primary" type="button" data-test="export-download" @click="download">Download PDF</AspButton>
    </section>
  </div>
</template>

<script>
// system_3 #8634 / #8652: the print export. Picks a profile and a selection,
// resolves every card through the server, fetches the assets once, registers
// the store's fonts with pdfmake, builds the sheets with pdfExport.js and
// downloads the file. Nothing is sent to the server.
import { AspButton, AspSegmented, AspSelect } from '@aspirant/design-system';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCardgen } from '@/composables/useCardgen.js';
import { formatBytes } from '@/composables/useCardgenBlobs.js';
import { buildExportDocument } from '@/lib/cardgen/pdfExport.js';

pdfMake.addVirtualFileSystem(pdfFonts);

const registeredFonts = new Set();

/** A failure with prose of our own; anything else renders as a fixed sentence. */
class ExportFailure extends Error {
  constructor(text) {
    super(text);
    this.text = text;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the asset'));
    r.readAsDataURL(blob);
  });
}

function blobToBase64(blob) {
  return blobToDataUrl(blob).then((u) => String(u).split(',')[1]);
}

/** JPEG passes through (pdfkit reads it natively); every other image the
 *  browser can decode (PNG, SVG, WebP, GIF) is re-encoded as PNG through a
 *  canvas, capped at `targetPx` on its longer side, so pdfkit only ever sees a
 *  clean PNG. The SVG goes through an <img>, the same no-document-context path
 *  the viewer uses. */
async function imageForPdf(blob, mediaType, targetPx) {
  const img = await loadImage(blob);
  const nw = img.naturalWidth || targetPx;
  const nh = img.naturalHeight || targetPx;
  // The decoded pixels are kept on a canvas: an <img> may drop its decode and
  // re-fetch from a URL that is gone by the time a crop is drawn.
  if (mediaType === 'image/jpeg') {
    const source = document.createElement('canvas');
    source.width = nw;
    source.height = nh;
    source.getContext('2d').drawImage(img, 0, 0);
    return { dataUrl: await blobToDataUrl(blob), pixelWidth: nw, pixelHeight: nh, source, crops: new Map() };
  }
  let w = nw;
  let h = nh;
  if (mediaType === 'image/svg+xml' || Math.max(nw, nh) > targetPx) {
    const scale = targetPx / Math.max(nw, nh);
    w = Math.max(1, Math.round(nw * scale));
    h = Math.max(1, Math.round(nh * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/png'), pixelWidth: nw, pixelHeight: nh, source: canvas, crops: new Map() };
}

/** The centre crop of a decoded asset at aspect w/h, as a PNG data URL,
 *  cached per asset and aspect (fit: cover, which pdfmake cannot clip). */
function cropToAspect(asset, aspect) {
  if (!asset || !asset.source || !Number.isFinite(aspect) || aspect <= 0) return asset ? asset.dataUrl : null;
  const key = Math.round(aspect * 1000);
  if (asset.crops.has(key)) return asset.crops.get(key);
  const img = asset.source;
  const pw = img.width;
  const ph = img.height;
  let sw = pw;
  let sh = ph;
  if (pw / ph > aspect) sw = Math.max(1, Math.round(ph * aspect));
  else sh = Math.max(1, Math.round(pw / aspect));
  const sx = Math.round((pw - sw) / 2);
  const sy = Math.round((ph - sh) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const url = canvas.toDataURL('image/png');
  asset.crops.set(key, url);
  return url;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be decoded')); };
    img.src = url;
  });
}

export default {
  name: 'ExportPanel',
  components: { AspButton, AspSegmented, AspSelect },
  setup() {
    return { api: useCardgen() };
  },
  data() {
    return {
      profiles: [],
      types: [],
      profileId: 0,
      typeFilter: 0,
      building: false,
      error: null,
      result: null,
      pdf: null,
    };
  },
  computed: {
    profile() {
      return this.profiles.find((p) => p.id === this.profileId) || null;
    },
    profileOptions() {
      return this.profiles.map((p) => ({ value: p.id, label: p.name }));
    },
    typeOptions() {
      return [{ value: 0, label: 'All cards' }, ...this.types.map((t) => ({ value: t.id, label: t.name }))];
    },
    sheetText() {
      const s = this.profile?.spec?.sheet || {};
      const page = s.page === 'custom' ? `${s.page_w_mm}×${s.page_h_mm} mm` : s.page || 'A4';
      return `${page} ${s.orientation || 'portrait'}, ${s.cols || 1}×${s.rows || 1}, gap ${s.gap_mm || 0} mm, margin ${s.margin_mm || 0} mm`;
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    formatBytes,
    async load() {
      const [{ profiles, error }, { types }] = await Promise.all([this.api.listExportProfiles(), this.api.listTypes()]);
      if (error) this.error = error;
      this.profiles = profiles;
      this.types = types;
      if (!this.profileId && profiles.length) this.profileId = profiles[0].id;
    },
    async build() {
      if (!this.profile) return;
      this.building = true;
      this.error = null;
      this.result = null;
      this.pdf = null;
      try {
        const { cards, error } = await this.api.listCards(this.typeFilter || undefined);
        if (error) throw new ExportFailure(error);
        const resolvedAll = await Promise.all(cards.map((c) => this.api.resolveCard(c.id)));
        const items = [];
        resolvedAll.forEach((r, i) => {
          if (r.error) throw new ExportFailure(`${cards[i].name}: ${r.error}`);
          items.push({ name: cards[i].name, resolved: r.resolved });
        });
        const spec = this.profile.spec;
        const { assets, fonts } = await this.collectAssets(items, spec);
        const built = buildExportDocument(items, spec, assets, fonts, (id, aspect) => cropToAspect(assets.get(id), aspect));
        const pdf = pdfMake.createPdf(built.doc);
        // pdfmake's getBuffer never settles when the underlying stream errors
        // (a font or image pdfkit cannot read); race it against the error.
        const stream = await pdf.getStream();
        const failed = new Promise((_, reject) => stream.on('error', () => reject(new ExportFailure('The PDF could not be built: a font or an image could not be read by the PDF writer'))));
        const buffer = await Promise.race([pdf.getBuffer(), failed]);
        this.pdf = pdf;
        this.result = { pages: built.pages, perPage: built.perPage, cards: items.length, warnings: built.warnings, bytes: buffer.length };
      } catch (e) {
        this.error = e instanceof ExportFailure ? e.text : 'The PDF could not be built';
      } finally {
        this.building = false;
      }
    },
    async collectAssets(items, spec) {
      const imageIds = new Set();
      const fontIds = new Set();
      const faces = [];
      for (const it of items) faces.push(it.resolved.front, it.resolved.back);
      for (const face of faces) {
        for (const el of face?.elements || []) {
          if (el.props?.hidden) continue;
          if (Number.isInteger(el.props?.asset_id)) imageIds.add(el.props.asset_id);
          if (Number.isInteger(el.props?.font_asset_id)) fontIds.add(el.props.font_asset_id);
        }
      }
      const assets = new Map();
      const targetPx = Math.min(4000, Math.round((Math.max(spec.card_w_mm, spec.card_h_mm) / 25.4) * (spec.dpi || 300)));
      await Promise.all([...imageIds].map(async (id) => {
        const { blob } = await this.api.fetchAssetBlob(id);
        if (!blob || !blob.type.startsWith('image/')) return;
        try {
          assets.set(id, await imageForPdf(blob, blob.type, targetPx));
        } catch {
          // left out: pdfExport reports the missing asset
        }
      }));
      const fonts = new Set();
      await Promise.all([...fontIds].map(async (id) => {
        if (registeredFonts.has(id)) {
          fonts.add(id);
          return;
        }
        const { blob } = await this.api.fetchAssetBlob(id);
        if (!blob || !/^(font\/|application\/(x-)?font)/.test(blob.type)) return;
        const file = `cardgen-font-${id}.ttf`;
        pdfMake.addVirtualFileSystem({ [file]: await blobToBase64(blob) });
        pdfMake.addFonts({ [`cardgen-font-${id}`]: { normal: file, bold: file, italics: file, bolditalics: file } });
        registeredFonts.add(id);
        fonts.add(id);
      }));
      return { assets, fonts };
    },
    download() {
      if (!this.pdf) return;
      const name = `constellations-cards-${this.profile ? this.profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'export'}.pdf`;
      this.pdf.download(name);
    },
  },
};
</script>

<style scoped>
.export-panel {
  display: grid;
  gap: var(--space-3, 12px);
}
.export-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  align-items: flex-end;
}
.profile-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1, 4px) var(--space-3, 12px);
  margin: 0;
}
.profile-facts dt {
  color: var(--text-muted);
}
.profile-facts dd {
  margin: 0;
}
.result {
  display: grid;
  gap: var(--space-2, 8px);
  justify-items: start;
}
.warnings {
  margin: 0;
  padding-left: 1.2em;
  color: var(--status-caution, currentColor);
}
.muted {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
