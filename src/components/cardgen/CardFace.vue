<template>
  <div
    class="card-face"
    :class="{ 'card-face--empty': !face }"
    :style="faceStyle"
    :data-test="dataTest"
    :data-w-mm="size.w_mm"
    :data-h-mm="size.h_mm"
  >
    <template v-for="el in visibleElements" :key="el.name">
      <div
        v-if="el.props.kind === 'text'"
        class="el el--text"
        :class="{ 'el--hidden': el.props.hidden }"
        :style="textStyle(el)"
        :data-el="el.name"
      >
        <span class="el-text">{{ el.props.text || '' }}</span>
      </div>
      <div
        v-else-if="el.props.kind === 'image'"
        class="el el--image"
        :class="{ 'el--hidden': el.props.hidden }"
        :style="boxStyle(el)"
        :data-el="el.name"
      >
        <img v-if="imageUrl(el)" :src="imageUrl(el)" alt="" :style="{ objectFit: fitOf(el) }" />
        <span v-else class="el-placeholder">{{ el.props.asset_id ? 'asset ' + el.props.asset_id : 'no image' }}</span>
      </div>
      <div
        v-else
        class="el el--rect"
        :class="{ 'el--hidden': el.props.hidden }"
        :style="rectStyle(el)"
        :data-el="el.name"
      ></div>
    </template>
  </div>
</template>

<script>
// system_3 #8634 / #8649: draws one RESOLVED card face at true physical size.
// The server resolves the template chain and the card's values
// (GET /api/cardgen/cards/:id/resolved); this component only maps the flat,
// validated element list to boxes. Every value is data: text goes through
// {{ }} (never v-html), sizes are mm and pt converted to px, colours are the
// server-validated #rrggbb strings, images are blob URLs the caller resolved
// from server-issued ids, fonts are the FontFace families the caller loaded.
// 1 mm = 96 / 25.4 CSS px at zoom 1, so a 105 x 74.25 mm card is
// 396.85 x 280.63 px on screen at 100 %.
export const PX_PER_MM = 96 / 25.4;
export const PX_PER_PT = 96 / 72;

export default {
  name: 'CardFace',
  props: {
    /** The server's resolved face: { size: {w_mm, h_mm, radius_mm}, elements: [...] }. */
    face: { type: Object, default: null },
    zoom: { type: Number, default: 1 },
    /** asset id -> blob URL */
    assetUrls: { type: Object, default: () => ({}) },
    /** font asset id -> FontFace family name */
    fontFamilies: { type: Object, default: () => ({}) },
    /** Draw hidden elements with a dashed outline (the editors), or skip them (review, export). */
    showHidden: { type: Boolean, default: false },
    dataTest: { type: String, default: 'card-face' },
  },
  computed: {
    size() {
      const s = this.face?.size || {};
      return { w_mm: s.w_mm || 105, h_mm: s.h_mm || 74.25, radius_mm: s.radius_mm || 0 };
    },
    k() {
      return PX_PER_MM * this.zoom;
    },
    faceStyle() {
      return {
        width: `${this.size.w_mm * this.k}px`,
        height: `${this.size.h_mm * this.k}px`,
        borderRadius: `${this.size.radius_mm * this.k}px`,
      };
    },
    visibleElements() {
      const els = this.face?.elements || [];
      return this.showHidden ? els : els.filter((el) => !el.props?.hidden);
    },
  },
  methods: {
    boxStyle(el) {
      const p = el.props || {};
      const style = {
        left: `${(p.x_mm || 0) * this.k}px`,
        top: `${(p.y_mm || 0) * this.k}px`,
        width: `${(p.w_mm || 0) * this.k}px`,
        height: `${(p.h_mm || 0) * this.k}px`,
        zIndex: Number.isFinite(p.z) ? p.z : 0,
        opacity: p.opacity == null ? 1 : p.opacity,
      };
      if (p.rotate_deg) style.transform = `rotate(${p.rotate_deg}deg)`;
      return style;
    },
    textStyle(el) {
      const p = el.props || {};
      const style = this.boxStyle(el);
      style.fontSize = `${(p.size_pt || 10) * PX_PER_PT * this.zoom}px`;
      style.lineHeight = p.line_height || 1.2;
      style.textAlign = p.align || 'left';
      style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[p.align || 'left'];
      style.alignItems = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[p.valign || 'top'];
      style.fontWeight = p.weight === 'bold' ? 700 : 400;
      style.fontStyle = p.italic ? 'italic' : 'normal';
      style.textTransform = p.transform === 'uppercase' ? 'uppercase' : 'none';
      style.color = p.color || '#111111';
      if (p.letter_spacing) style.letterSpacing = `${p.letter_spacing * PX_PER_PT * this.zoom}px`;
      const family = p.font_asset_id ? this.fontFamilies[p.font_asset_id] : null;
      style.fontFamily = family ? `'${family}', sans-serif` : 'sans-serif';
      return style;
    },
    rectStyle(el) {
      const p = el.props || {};
      const style = this.boxStyle(el);
      style.background = p.fill || 'transparent';
      if (p.stroke) style.border = `${(p.stroke_mm || 0.3) * this.k}px solid ${p.stroke}`;
      return style;
    },
    imageUrl(el) {
      const id = el.props?.asset_id;
      return id ? this.assetUrls[id] || null : null;
    },
    fitOf(el) {
      const fit = el.props?.fit || 'cover';
      return fit === 'stretch' ? 'fill' : fit;
    },
  },
};
</script>

<style scoped>
.card-face {
  position: relative;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
  flex: none;
}
.card-face--empty {
  background: repeating-linear-gradient(45deg, #eee 0 6px, #f8f8f8 6px 12px);
}
.el {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
}
.el--text {
  display: flex;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.el--image img {
  width: 100%;
  height: 100%;
  display: block;
}
.el-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: #888;
  border: 1px dashed #bbb;
}
.el--hidden {
  outline: 1px dashed #c33;
  opacity: 0.35;
}
</style>
