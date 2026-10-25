<template>
  <div class="card-editor" data-test="card-editor">
    <p v-if="loadError" class="load-error" data-test="card-editor-error">{{ loadError }}</p>
    <p v-else-if="!card" class="muted">Loading card…</p>
    <template v-else>
      <header class="editor-head">
        <AspButton variant="secondary" size="sm" type="button" data-test="card-back" @click="requestBack">← Cards</AspButton>
        <div class="head-field">
          <AspInput :model-value="nameDraft" label="Name" data-test="card-name" @update:model-value="nameDraft = $event" />
          <AspButton v-if="nameDraft.trim() !== card.name" variant="secondary" size="sm" type="button" data-test="card-rename" :loading="renaming" @click="rename">Rename</AspButton>
        </div>
        <div class="head-field">
          <AspSelect :options="templateOptions" :model-value="card.template_id || 0" label="Template" data-test="card-template" @update:model-value="setTemplate" />
        </div>
        <span class="muted" data-test="card-version">{{ typeName }} · {{ card.slug }} · v{{ card.current_version_no }}</span>
        <p v-if="metaError" class="load-error" data-test="card-meta-error">{{ metaError }}</p>
      </header>

      <div class="editor-body">
        <aside class="elements">
          <h3>Elements</h3>
          <ul class="element-list" data-test="card-element-list">
            <li v-for="el in front.elements" :key="el.name">
              <button type="button" class="element" :class="{ 'element--selected': el.name === selected, 'element--hidden': el.props.hidden }" :data-test="`card-element-${el.name}`" @click="selected = el.name">
                <span class="element-text">
                  <span class="element-name">{{ el.name }}</span>
                  <span class="muted element-kind">{{ el.props.kind }}{{ el.props.hidden ? ' · hidden' : '' }}</span>
                </span>
                <AspBadge :status="draft.values[el.name] ? 'positive' : 'neutral'" size="sm">{{ draft.values[el.name] ? 'overridden' : 'template' }}</AspBadge>
              </button>
            </li>
          </ul>
        </aside>

        <ElementInspector
          v-if="selectedEffective"
          :element-name="selected"
          :own="draft.values[selected] || {}"
          :effective="selectedEffective"
          slug="card"
          @set="setProp"
          @unset="unsetProp"
        />
        <AspEmptyState v-else heading="No element selected" message="Choose an element on the left." />

        <section class="preview-pane" data-test="card-preview-pane">
          <div class="preview-controls">
            <AspSegmented :options="zoomOptions" :model-value="zoom" aria-label="Preview zoom" @update:model-value="zoom = $event" />
            <AspBadge v-if="dirty" status="caution" size="sm" data-test="card-dirty-badge">unsaved</AspBadge>
          </div>
          <div class="card-scroll">
            <div class="faces">
              <CardFace :face="front" :zoom="zoom" :asset-urls="assets.assetUrls" :font-families="assets.fontFamilies" data-test="card-editor-preview" />
              <CardFace v-if="back" :face="back" :zoom="zoom * 0.5" :asset-urls="assets.assetUrls" :font-families="assets.fontFamilies" data-test="card-editor-back" />
            </div>
          </div>
          <div class="save-row">
            <AspInput :model-value="note" label="Note" placeholder="What changed" data-test="card-save-note" @update:model-value="note = $event" />
            <AspButton variant="primary" type="button" :disabled="!dirty" :loading="saving" data-test="card-save-version" @click="save">Save as v{{ card.current_version_no + 1 }}</AspButton>
          </div>
          <p v-if="saveError" class="load-error" data-test="card-save-error">{{ saveError }}</p>
          <VersionHistory
            :load="loadVersions"
            :restorer="restoreVersion"
            :current-version-no="card.current_version_no"
            :reload-key="historyKey"
            @restored="reload"
          />
        </section>
      </div>

      <!-- Destructive action last and apart (#8753 req 9, §3.114 footer rule). -->
      <footer class="editor-foot">
        <AspButton variant="destructive" size="sm" type="button" data-test="card-delete" @click="deleteOpen = true">Delete this card</AspButton>
      </footer>
    </template>

    <AspModal :open="deleteOpen" size="sm" title="Delete this card?" @update:open="deleteOpen = $event">
      <p>The card and its versions leave the deck. The templates and assets it used stay.</p>
      <p v-if="deleteError" class="load-error" data-test="card-delete-error">{{ deleteError }}</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="deleteOpen = false">Keep</AspButton>
        <AspButton variant="destructive" type="button" :loading="deleting" data-test="card-delete-confirm" @click="doDelete">Delete</AspButton>
      </template>
    </AspModal>

    <AspModal :open="leaveOpen" size="sm" title="Discard unsaved changes?" @update:open="leaveOpen = $event">
      <p>The draft has changes that were not saved as a version.</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="leaveOpen = false">Keep editing</AspButton>
        <AspButton variant="destructive" type="button" data-test="card-discard-confirm" @click="$emit('back')">Discard</AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
// system_3 #8634 / #8651: edit one card's values over its template. The server
// resolves the saved state (GET /cardgen/cards/:id/resolved); the unsaved
// draft is previewed by overlaying the values onto the server-resolved front
// template with provenance "card", the leaf step ResolveCard performs and
// nothing more (design, #8651). Every save is a new version; restore makes
// another.
import { AspBadge, AspButton, AspEmptyState, AspInput, AspModal, AspSegmented, AspSelect } from '@aspirant/design-system';
import CardFace from '@/components/cardgen/CardFace.vue';
import ElementInspector from '@/components/cardgen/ElementInspector.vue';
import VersionHistory from '@/components/cardgen/VersionHistory.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardFaceAssets } from '@/composables/useCardFaceAssets.js';
import { overlayDraft } from '@/lib/cardgen/specProps.js';

function cloneValues(data) {
  const out = { values: {} };
  for (const [name, props] of Object.entries(data?.values || {})) out.values[name] = { ...(props || {}) };
  return out;
}

function sortedValues(data) {
  const c = cloneValues(data);
  const values = {};
  for (const name of Object.keys(c.values).sort()) {
    const props = {};
    for (const k of Object.keys(c.values[name]).sort()) props[k] = c.values[name][k];
    values[name] = props;
  }
  return values;
}

export default {
  name: 'CardEditor',
  components: { AspBadge, AspButton, AspEmptyState, AspInput, AspModal, AspSegmented, AspSelect, CardFace, ElementInspector, VersionHistory },
  props: {
    cardId: { type: Number, required: true },
    types: { type: Array, default: () => [] },
    templates: { type: Array, default: () => [] },
  },
  emits: ['back', 'changed', 'deleted'],
  setup() {
    const api = useCardgen();
    const assets = useCardFaceAssets();
    return { api, assets };
  },
  data() {
    return {
      card: null,
      loadError: null,
      draft: { values: {} },
      resolved: null,
      templateResolved: null,
      selected: null,
      nameDraft: '',
      renaming: false,
      metaError: null,
      note: '',
      saving: false,
      saveError: null,
      historyKey: 0,
      zoom: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 0.5 : 1,
      zoomOptions: [
        { value: 1, label: '100 %' },
        { value: 0.5, label: '50 %' },
      ],
      deleteOpen: false,
      deleting: false,
      deleteError: null,
      leaveOpen: false,
    };
  },
  computed: {
    type() {
      return this.types.find((t) => t.id === this.card?.card_type_id) || null;
    },
    typeName() {
      return this.type?.name || '';
    },
    frontTemplateId() {
      return this.card?.template_id || this.type?.front_template_id || null;
    },
    templateOptions() {
      const front = this.templates.find((t) => t.id === this.type?.front_template_id);
      return [{ value: 0, label: front ? `the type's front (${front.slug})` : "the type's front" }, ...this.templates.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))];
    },
    dirty() {
      return !!this.card && JSON.stringify(sortedValues(this.draft)) !== JSON.stringify(sortedValues(this.card.data));
    },
    front() {
      if (!this.card) return null;
      if (!this.dirty && this.resolved?.front) return this.resolved.front;
      return overlayDraft(this.templateResolved, { elements: this.draft.values }, 'card');
    },
    back() {
      return this.resolved?.back || null;
    },
    selectedEffective() {
      if (!this.selected || !this.front) return null;
      return this.front.elements.find((e) => e.name === this.selected) || null;
    },
  },
  watch: {
    cardId: { immediate: true, handler: 'load' },
    front: {
      handler(face) {
        if (face) this.assets.ensure([face, this.back].filter(Boolean));
      },
      immediate: true,
    },
  },
  methods: {
    async load() {
      this.card = null;
      this.loadError = null;
      this.selected = null;
      await this.reload();
    },
    async reload() {
      const { card, error } = await this.api.getCard(this.cardId);
      if (error || !card) {
        this.loadError = error || 'Card not found';
        return;
      }
      this.card = card;
      this.nameDraft = card.name;
      this.draft = cloneValues(card.data);
      // The front template comes from the card's own type, read here rather
      // than from the panel's `types` prop: opened from its URL (#8753 req
      // 10) the editor mounts before the panel's list has loaded, and a
      // missing front would leave the draft preview without the template's
      // boxes.
      let type = this.types.find((t) => t.id === card.card_type_id);
      if (!type) {
        const { types } = await this.api.listTypes();
        type = (types || []).find((t) => t.id === card.card_type_id) || null;
      }
      const frontId = card.template_id || type?.front_template_id || null;
      const [{ resolved, error: rerr }, tmpl] = await Promise.all([
        this.api.resolveCard(card.id),
        frontId ? this.api.resolveTemplate(frontId) : Promise.resolve({ resolved: null, error: null }),
      ]);
      if (rerr) this.loadError = rerr;
      this.resolved = resolved;
      this.templateResolved = tmpl.resolved;
      if (!this.selected && this.front?.elements.length) this.selected = this.front.elements[0].name;
      this.$emit('changed');
    },
    setProp({ element, prop, value }) {
      const values = { ...this.draft.values, [element]: { ...(this.draft.values[element] || {}), [prop]: value } };
      this.draft = { values };
    },
    unsetProp({ element, prop }) {
      const own = { ...(this.draft.values[element] || {}) };
      delete own[prop];
      const values = { ...this.draft.values };
      if (Object.keys(own).length) values[element] = own;
      else delete values[element];
      this.draft = { values };
    },
    async save() {
      this.saving = true;
      this.saveError = null;
      const { error } = await this.api.saveCardVersion(this.card.id, this.draft, this.note.trim());
      this.saving = false;
      if (error) {
        this.saveError = error;
        return;
      }
      this.note = '';
      await this.reload();
      this.historyKey += 1;
    },
    loadVersions() {
      return this.api.listCardVersions(this.cardId);
    },
    restoreVersion(n) {
      return this.api.restoreCardVersion(this.cardId, n);
    },
    async rename() {
      this.renaming = true;
      this.metaError = null;
      const { card, error } = await this.api.updateCard(this.card.id, { name: this.nameDraft.trim() });
      this.renaming = false;
      if (error) {
        this.metaError = error;
        return;
      }
      this.card = { ...this.card, name: card.name };
      this.$emit('changed');
    },
    async setTemplate(value) {
      this.metaError = null;
      const body = value ? { template_id: value } : { clear_template: true };
      const { error } = await this.api.updateCard(this.card.id, body);
      if (error) {
        this.metaError = error;
        return;
      }
      await this.reload();
    },
    async doDelete() {
      this.deleting = true;
      this.deleteError = null;
      const { error } = await this.api.deleteCard(this.card.id);
      this.deleting = false;
      if (error) {
        this.deleteError = error;
        return;
      }
      this.deleteOpen = false;
      this.$emit('deleted', this.card.id);
    },
    requestBack() {
      if (this.dirty) this.leaveOpen = true;
      else this.$emit('back');
    },
  },
};
</script>

<style scoped>
.card-editor {
  display: grid;
  gap: var(--space-4, 16px);
}
.editor-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  align-items: flex-end;
}
.head-field {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: flex-end;
  min-width: 200px;
}
.editor-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 2fr);
  gap: var(--space-5, 20px);
  align-items: start;
}
@media (max-width: 1023px) {
  .editor-body {
    grid-template-columns: 1fr;
  }
}
.elements h3 {
  font-size: var(--text-md, 1rem);
  margin: var(--space-2, 8px) 0;
}
.element-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-1, 4px);
}
.element {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2, 8px);
  align-items: center;
  padding: var(--space-2, 8px);
  background: transparent;
  color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.element--selected {
  outline: 2px solid var(--accent, currentColor);
}
.element--hidden .element-name {
  text-decoration: line-through;
}
.element-text {
  display: grid;
  min-width: 0;
}
.element-name {
  font-family: var(--font-family-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.element-kind {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-pane {
  display: grid;
  gap: var(--space-3, 12px);
  min-width: 0;
}
.card-scroll {
  overflow-x: auto;
  max-width: 100%;
}
.editor-foot {
  margin-top: var(--space-6, 24px);
  padding-top: var(--space-4, 16px);
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
.preview-controls {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
}
.faces {
  display: flex;
  gap: var(--space-4, 16px);
  align-items: flex-start;
  flex-wrap: wrap;
}
.save-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: flex-end;
  flex-wrap: wrap;
}
.muted {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
