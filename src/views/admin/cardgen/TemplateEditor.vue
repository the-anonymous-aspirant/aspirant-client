<template>
  <div class="editor" data-test="template-editor">
    <p v-if="loadError" class="load-error" data-test="editor-error">{{ loadError }}</p>
    <p v-else-if="!template" class="muted">Loading template…</p>
    <template v-else>
      <header class="editor-head">
        <AspButton variant="secondary" size="sm" type="button" data-test="editor-back" @click="requestBack">← Templates</AspButton>
        <div class="head-field">
          <AspInput :model-value="nameDraft" label="Name" aria-label="Template name" data-test="template-name" @update:model-value="nameDraft = $event" />
          <AspButton v-if="nameDraft.trim() !== template.name" variant="secondary" size="sm" type="button" data-test="template-rename" :loading="renaming" @click="rename">Rename</AspButton>
        </div>
        <div class="head-field">
          <AspSelect
            :options="parentOptions"
            :model-value="template.parent_template_id || 0"
            label="Extends"
            data-test="template-extends"
            @update:model-value="setParent"
          />
        </div>
        <span class="muted" data-test="template-version">{{ template.slug }} · v{{ template.current_version_no }}</span>
        <p v-if="metaError" class="load-error" data-test="meta-error">{{ metaError }}</p>
      </header>

      <div class="editor-body">
        <aside class="elements">
          <h3>Size</h3>
          <div class="size-row" v-for="k in ['w_mm', 'h_mm', 'radius_mm']" :key="k" :data-test="`size-${k}`">
            <AspInput
              type="number"
              min="0"
              max="1000"
              step="0.25"
              :label="k"
              :model-value="sizeValue(k)"
              :disabled="!sizeOwn(k)"
              @update:model-value="setSize(k, $event)"
            />
            <AspBadge :status="sizeOwn(k) ? 'positive' : preview.size_provenance[k] ? 'neutral' : 'caution'" size="sm">{{ sizeOwn(k) ? 'this template' : preview.size_provenance[k] ? `from ${preview.size_provenance[k]}` : 'unset' }}</AspBadge>
            <AspButton v-if="sizeOwn(k)" variant="link" size="sm" type="button" :data-test="`size-${k}-reset`" @click="unsetSize(k)">Reset</AspButton>
            <AspButton v-else variant="link" size="sm" type="button" :data-test="`size-${k}-override`" @click="setSize(k, preview.size[k])">Override</AspButton>
          </div>

          <h3>Elements</h3>
          <ul class="element-list" data-test="element-list">
            <li v-for="el in preview.elements" :key="el.name">
              <button type="button" class="element" :class="{ 'element--selected': el.name === selected, 'element--hidden': el.props.hidden }" :data-test="`element-${el.name}`" @click="selected = el.name">
                <span class="element-name">{{ el.name }}</span>
                <span class="muted">{{ el.props.kind }}{{ el.props.hidden ? ' · hidden' : '' }}</span>
                <AspBadge :status="isOwnElement(el.name) ? 'positive' : 'neutral'" size="sm">{{ isOwnElement(el.name) ? 'own' : 'inherited' }}</AspBadge>
              </button>
            </li>
          </ul>
          <div class="element-actions">
            <AspButton variant="secondary" size="sm" type="button" data-test="add-element" @click="addOpen = true">Add element</AspButton>
            <AspButton v-if="selected && onlyOwnElement(selected)" variant="destructive" size="sm" type="button" data-test="remove-element" @click="removeElement(selected)">Remove {{ selected }}</AspButton>
          </div>
        </aside>

        <ElementInspector
          v-if="selectedEffective"
          :element-name="selected"
          :own="draft.elements[selected] || {}"
          :effective="selectedEffective"
          :slug="template.slug"
          @set="setProp"
          @unset="unsetProp"
        />
        <AspEmptyState v-else heading="No element selected" message="Choose an element on the left, or add one." />

        <section class="preview-pane" data-test="preview-pane">
          <div class="preview-controls">
            <AspSegmented :options="zoomOptions" :model-value="zoom" aria-label="Preview zoom" @update:model-value="zoom = $event" />
            <AspBadge v-if="dirty" status="caution" size="sm" data-test="dirty-badge">unsaved</AspBadge>
          </div>
          <CardFace :face="preview" :zoom="zoom" :asset-urls="assets.assetUrls" :font-families="assets.fontFamilies" show-hidden data-test="editor-preview" />
          <div class="save-row">
            <AspInput :model-value="note" label="Note" placeholder="What changed" data-test="save-note" @update:model-value="note = $event" />
            <AspButton variant="primary" type="button" :disabled="!dirty" :loading="saving" data-test="save-version" @click="save">Save as v{{ template.current_version_no + 1 }}</AspButton>
          </div>
          <p v-if="saveError" class="load-error" data-test="save-error">{{ saveError }}</p>
          <VersionHistory
            :load="loadVersions"
            :restorer="restoreVersion"
            :current-version-no="template.current_version_no"
            :reload-key="historyKey"
            @restored="afterRestore"
          />
        </section>
      </div>
    </template>

    <AspModal :open="addOpen" size="sm" title="Add element" @update:open="addOpen = $event">
      <AspInput :model-value="addName" label="Name" hint="lowercase letters, digits and underscores, starting with a letter" :error="addError" data-test="add-element-name" @update:model-value="addName = $event" />
      <AspSelect :options="kindOptions" :model-value="addKind" label="Kind" data-test="add-element-kind" @update:model-value="addKind = $event" />
      <template #footer>
        <AspButton variant="secondary" type="button" @click="addOpen = false">Cancel</AspButton>
        <AspButton variant="primary" type="button" data-test="add-element-confirm" @click="addElement">Add</AspButton>
      </template>
    </AspModal>

    <AspModal :open="leaveOpen" size="sm" title="Discard unsaved changes?" @update:open="leaveOpen = $event">
      <p>The draft has changes that were not saved as a version.</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="leaveOpen = false">Keep editing</AspButton>
        <AspButton variant="destructive" type="button" data-test="discard-confirm" @click="$emit('back')">Discard</AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
// system_3 #8634 / #8650: edit one template's own layer with the parent chain
// showing through. The server resolves the saved state
// (GET /cardgen/templates/:id/resolved); the unsaved draft is previewed by
// overlaying the draft onto the server-resolved parent, the leaf step of the
// server's own merge and nothing more (design, #8650 c53613). Every
// save is a new version; restore makes another.
import { AspBadge, AspButton, AspEmptyState, AspInput, AspModal, AspSegmented, AspSelect } from '@aspirant/design-system';
import CardFace from '@/components/cardgen/CardFace.vue';
import ElementInspector from '@/components/cardgen/ElementInspector.vue';
import VersionHistory from '@/components/cardgen/VersionHistory.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { useCardFaceAssets } from '@/composables/useCardFaceAssets.js';
import { ELEMENT_KINDS, ELEMENT_NAME_PATTERN, cloneSpec, overlayDraft, specsEqual } from '@/lib/cardgen/specProps.js';

export default {
  name: 'TemplateEditor',
  components: { AspBadge, AspButton, AspEmptyState, AspInput, AspModal, AspSegmented, AspSelect, CardFace, ElementInspector, VersionHistory },
  props: {
    templateId: { type: Number, required: true },
    /** The templates list, for the extends select. */
    templates: { type: Array, default: () => [] },
  },
  emits: ['back', 'changed'],
  setup() {
    const api = useCardgen();
    const assets = useCardFaceAssets();
    return { api, assets };
  },
  data() {
    return {
      template: null,
      loadError: null,
      draft: { elements: {} },
      resolved: null,
      parentResolved: null,
      selected: null,
      nameDraft: '',
      renaming: false,
      metaError: null,
      note: '',
      saving: false,
      saveError: null,
      historyKey: 0,
      zoom: 1,
      zoomOptions: [
        { value: 1, label: '100 %' },
        { value: 0.5, label: '50 %' },
      ],
      addOpen: false,
      addName: '',
      addKind: 'text',
      addError: '',
      leaveOpen: false,
      kindOptions: ELEMENT_KINDS.map((k) => ({ value: k, label: k })),
    };
  },
  computed: {
    dirty() {
      return !!this.template && !specsEqual(this.draft, this.template.spec || { elements: {} });
    },
    preview() {
      if (!this.template) return null;
      if (!this.dirty && this.resolved) return this.resolved;
      return overlayDraft(this.parentResolved, this.draft, this.template.slug);
    },
    selectedEffective() {
      if (!this.selected || !this.preview) return null;
      return this.preview.elements.find((e) => e.name === this.selected) || null;
    },
    parentOptions() {
      return [{ value: 0, label: 'none' }, ...this.templates.filter((t) => t.id !== this.templateId).map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))];
    },
  },
  watch: {
    templateId: { immediate: true, handler: 'load' },
    preview: {
      handler(face) {
        if (face) this.assets.ensure([face]);
      },
      immediate: true,
    },
  },
  methods: {
    async load() {
      this.template = null;
      this.loadError = null;
      this.selected = null;
      const { template, error } = await this.api.getTemplate(this.templateId);
      if (error || !template) {
        this.loadError = error || 'Template not found';
        return;
      }
      await this.applyTemplate(template);
    },
    async applyTemplate(template) {
      this.template = template;
      this.nameDraft = template.name;
      this.draft = cloneSpec(template.spec);
      const [{ resolved, error }, parent] = await Promise.all([
        this.api.resolveTemplate(template.id),
        template.parent_template_id ? this.api.resolveTemplate(template.parent_template_id) : Promise.resolve({ resolved: null, error: null }),
      ]);
      if (error) this.loadError = error;
      this.resolved = resolved;
      this.parentResolved = parent.resolved;
      if (!this.selected && this.preview?.elements.length) this.selected = this.preview.elements[0].name;
    },
    async reload() {
      const { template, error } = await this.api.getTemplate(this.templateId);
      if (error || !template) {
        this.loadError = error || 'Template not found';
        return;
      }
      await this.applyTemplate(template);
      this.$emit('changed');
    },
    isOwnElement(name) {
      return !!this.draft.elements[name];
    },
    onlyOwnElement(name) {
      return this.isOwnElement(name) && !(this.parentResolved?.elements || []).some((e) => e.name === name);
    },
    setProp({ element, prop, value }) {
      const elements = { ...this.draft.elements, [element]: { ...(this.draft.elements[element] || {}), [prop]: value } };
      this.draft = { ...this.draft, elements };
    },
    unsetProp({ element, prop }) {
      const own = { ...(this.draft.elements[element] || {}) };
      delete own[prop];
      const elements = { ...this.draft.elements };
      if (Object.keys(own).length || !this.onlyOwnElement(element)) elements[element] = own;
      if (!Object.keys(own).length) delete elements[element];
      this.draft = { ...this.draft, elements };
    },
    sizeOwn(k) {
      return !!this.draft.size && this.draft.size[k] != null;
    },
    sizeValue(k) {
      return this.sizeOwn(k) ? this.draft.size[k] : this.preview?.size?.[k] ?? '';
    },
    setSize(k, raw) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      this.draft = { ...this.draft, size: { ...(this.draft.size || {}), [k]: n } };
    },
    unsetSize(k) {
      const size = { ...(this.draft.size || {}) };
      delete size[k];
      const next = { ...this.draft };
      if (Object.keys(size).length) next.size = size;
      else delete next.size;
      this.draft = next;
    },
    addElement() {
      const name = this.addName.trim();
      if (!ELEMENT_NAME_PATTERN.test(name)) {
        this.addError = 'Use lowercase letters, digits and underscores, starting with a letter';
        return;
      }
      if (this.preview.elements.some((e) => e.name === name)) {
        this.addError = 'An element with that name already exists';
        return;
      }
      this.addError = '';
      this.setProp({ element: name, prop: 'kind', value: this.addKind });
      this.setProp({ element: name, prop: 'x_mm', value: 0 });
      this.setProp({ element: name, prop: 'y_mm', value: 0 });
      this.setProp({ element: name, prop: 'w_mm', value: 20 });
      this.setProp({ element: name, prop: 'h_mm', value: 10 });
      this.selected = name;
      this.addOpen = false;
      this.addName = '';
    },
    removeElement(name) {
      const elements = { ...this.draft.elements };
      delete elements[name];
      this.draft = { ...this.draft, elements };
      this.selected = this.preview?.elements[0]?.name || null;
    },
    async save() {
      this.saving = true;
      this.saveError = null;
      const { error } = await this.api.saveTemplateVersion(this.template.id, this.draft, this.note.trim());
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
      return this.api.listTemplateVersions(this.templateId);
    },
    restoreVersion(n) {
      return this.api.restoreTemplateVersion(this.templateId, n);
    },
    async afterRestore() {
      await this.reload();
    },
    async rename() {
      this.renaming = true;
      this.metaError = null;
      const { template, error } = await this.api.updateTemplate(this.template.id, { name: this.nameDraft.trim() });
      this.renaming = false;
      if (error) {
        this.metaError = error;
        return;
      }
      this.template = { ...this.template, name: template.name };
      this.$emit('changed');
    },
    async setParent(value) {
      this.metaError = null;
      const body = value ? { parent_template_id: value } : { clear_parent: true };
      const { error } = await this.api.updateTemplate(this.template.id, body);
      if (error) {
        this.metaError = error;
        return;
      }
      await this.reload();
    },
    requestBack() {
      if (this.dirty) this.leaveOpen = true;
      else this.$emit('back');
    },
  },
};
</script>

<style scoped>
.editor {
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
  grid-template-columns: minmax(200px, 1fr) minmax(260px, 1.2fr) minmax(300px, 2fr);
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
.size-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: var(--space-2, 8px);
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
  display: flex;
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
.element-name {
  font-family: var(--font-family-mono, monospace);
  flex: 1;
}
.element-actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin-top: var(--space-2, 8px);
  flex-wrap: wrap;
}
.preview-pane {
  display: grid;
  gap: var(--space-3, 12px);
  overflow-x: auto;
}
.preview-controls {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
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
