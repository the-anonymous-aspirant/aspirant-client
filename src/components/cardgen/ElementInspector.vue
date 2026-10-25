<template>
  <section class="inspector" data-test="element-inspector">
    <h3 class="inspector-title">{{ elementName }}</h3>
    <template v-for="group in groups" :key="group.name">
      <h4 class="group-title">{{ group.name }}</h4>
      <div v-for="prop in group.props" :key="prop.name" class="prop-row" :data-test="`prop-${prop.name}`" :data-provenance="provenanceOf(prop.name)">
        <div class="prop-head">
          <span class="prop-name">{{ prop.name }}</span>
          <AspBadge v-if="isUnset(prop.name)" variant="chip" size="sm" :data-test="`prop-${prop.name}-badge`">unset</AspBadge>
          <AspBadge v-else :status="isOwn(prop.name) ? 'positive' : 'neutral'" size="sm" :data-test="`prop-${prop.name}-badge`">{{ badgeText(prop.name) }}</AspBadge>
          <AspButton
            v-if="isOwn(prop.name)"
            variant="link"
            size="sm"
            type="button"
            :data-test="`prop-${prop.name}-reset`"
            @click="reset(prop.name)"
          >
            Reset
          </AspButton>
        </div>
        <div class="prop-control">
          <template v-if="prop.control === 'number'">
            <AspInput
              type="number"
              :min="String(prop.min)"
              :max="String(prop.max)"
              :step="String(prop.step)"
              :model-value="displayValue(prop)"
              :aria-label="prop.name"
              @update:model-value="setNumber(prop, $event)"
            />
          </template>
          <template v-else-if="prop.control === 'enum'">
            <AspSelect
              :options="prop.options.map((o) => ({ value: o, label: o }))"
              :model-value="displayValue(prop)"
              :aria-label="prop.name"
              placeholder="unset"
              @update:model-value="set(prop.name, $event)"
            />
          </template>
          <template v-else-if="prop.control === 'bool'">
            <AspCheckbox
              :model-value="displayValue(prop) === true"
              :aria-label="prop.name"
              :label="displayValue(prop) === true ? 'yes' : 'no'"
              @update:model-value="set(prop.name, $event)"
            />
          </template>
          <template v-else-if="prop.control === 'text'">
            <AspTextarea
              :hint="emphasisHint"
              :model-value="displayValue(prop) ?? ''"
              :aria-label="prop.name"
              :rows="2"
              @update:model-value="set(prop.name, $event)"
            />
          </template>
          <template v-else-if="prop.control === 'colour'">
            <span class="swatch" :style="{ background: colourOk(displayValue(prop)) ? displayValue(prop) : 'transparent' }"></span>
            <AspInput
              :model-value="displayValue(prop) ?? ''"
              :aria-label="prop.name"
              placeholder="#rrggbb"
              :error="displayValue(prop) && !colourOk(displayValue(prop)) ? 'Use #rrggbb' : ''"
              @update:model-value="set(prop.name, $event)"
            />
          </template>
          <template v-else-if="prop.control === 'asset'">
            <span class="asset-value" :data-test="`prop-${prop.name}-value`">{{ displayValue(prop) ? `asset ${displayValue(prop)}` : 'none' }}</span>
            <AspButton variant="secondary" size="sm" type="button" :data-test="`prop-${prop.name}-pick`" @click="openPicker(prop)">Choose…</AspButton>
          </template>
        </div>
      </div>
    </template>

    <AssetPicker
      v-if="picker"
      :open="!!picker"
      :kinds="picker.assetKinds"
      :model-value="displayValue(picker)"
      :title="`Choose ${picker.name === 'font_asset_id' ? 'a font' : 'an image'}`"
      @update:open="$event || (picker = null)"
      @update:model-value="setAsset(picker, $event)"
    />
  </section>
</template>

<script>
// system_3 #8634 / #8650: one element's props, each with its effective value,
// where it comes from, and the matching affordance
// (#8753 req 4, §3.116): every control is live and shows the effective value;
// editing it writes this template's (or card's) own layer and the badge flips,
// Reset removes an own value so the parent's shows through. The control set is the client's mirror of the
// server's closed prop table (src/lib/cardgen/specProps.js); the server
// validates on save.
import { AspBadge, AspButton, AspCheckbox, AspInput, AspSelect, AspTextarea } from '@aspirant/design-system';
import AssetPicker from './AssetPicker.vue';
import { HEX_COLOUR_PATTERN, propsForKind } from '@/lib/cardgen/specProps.js';
import { EMPHASIS_HINT } from '@/lib/cardgen/emphasis.js';

export default {
  name: 'ElementInspector',
  components: { AspBadge, AspButton, AspCheckbox, AspInput, AspSelect, AspTextarea, AssetPicker },
  props: {
    elementName: { type: String, required: true },
    /** This template's own props for the element (the draft layer). */
    own: { type: Object, default: () => ({}) },
    /** The effective (resolved + draft) element: { props, provenance }. */
    effective: { type: Object, default: () => ({ props: {}, provenance: {} }) },
    /** This template's slug, as the server names it in provenance. */
    slug: { type: String, required: true },
  },
  emits: ['set', 'unset'],
  data() {
    return { picker: null, emphasisHint: EMPHASIS_HINT };
  },
  computed: {
    kind() {
      return this.effective?.props?.kind || this.own?.kind || 'text';
    },
    groups() {
      const out = [];
      for (const p of propsForKind(this.kind)) {
        let g = out.find((x) => x.name === p.group);
        if (!g) {
          g = { name: p.group, props: [] };
          out.push(g);
        }
        g.props.push(p);
      }
      return out;
    },
  },
  methods: {
    isOwn(name) {
      return this.own && Object.prototype.hasOwnProperty.call(this.own, name);
    },
    displayValue(prop) {
      if (this.isOwn(prop.name)) return this.own[prop.name];
      const v = this.effective?.props?.[prop.name];
      return v === undefined ? null : v;
    },
    provenanceOf(name) {
      if (this.isOwn(name)) return 'own';
      const from = this.effective?.provenance?.[name];
      return from ? `inherited:${from}` : 'unset';
    },
    isUnset(name) {
      return !this.isOwn(name) && !this.effective?.provenance?.[name];
    },
    badgeText(name) {
      if (this.isOwn(name)) return this.slug === 'card' ? 'this card' : 'this template';
      const from = this.effective?.provenance?.[name];
      return from ? `from ${from}` : 'unset';
    },
    colourOk(v) {
      return typeof v === 'string' && HEX_COLOUR_PATTERN.test(v);
    },
    set(name, value) {
      this.$emit('set', { element: this.elementName, prop: name, value });
    },
    setNumber(prop, raw) {
      if (raw === '' || raw == null) return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      this.set(prop.name, n);
    },
    setAsset(prop, id) {
      if (id == null) this.$emit('unset', { element: this.elementName, prop: prop.name });
      else this.set(prop.name, id);
      this.picker = null;
    },
    reset(name) {
      this.$emit('unset', { element: this.elementName, prop: name });
    },
    openPicker(prop) {
      this.picker = prop;
    },
  },
};
</script>

<style scoped>
.inspector {
  display: grid;
  gap: var(--space-2, 8px);
  align-content: start;
}
.inspector-title {
  font-size: var(--text-md, 1rem);
  margin: 0;
  font-family: var(--font-family-mono, monospace);
}
.group-title {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: var(--space-3, 12px) 0 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.prop-row {
  display: grid;
  gap: var(--space-1, 4px);
  padding-bottom: var(--space-2, 8px);
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}
.prop-head {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
}
.prop-name {
  font-family: var(--font-family-mono, monospace);
  font-size: var(--text-sm);
}
.prop-control {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
}
.prop-control > * {
  flex: 1 1 auto;
}
.swatch {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}
.asset-value {
  font-size: var(--text-sm);
}
</style>
