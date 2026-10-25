<template>
  <div class="templates-panel" data-test="templates-panel">
    <TemplateEditor v-if="editingId" :template-id="editingId" :templates="templates" @back="editingId = null" @changed="load" />
    <template v-else>
      <div class="list-head">
        <span class="muted" data-test="template-count">{{ templates.length }} {{ templates.length === 1 ? 'template' : 'templates' }}</span>
        <AspButton variant="primary" size="sm" type="button" data-test="new-template" @click="openCreate">New template</AspButton>
      </div>
      <p v-if="loadError" class="load-error" data-test="templates-error">{{ loadError }}</p>
      <p v-else-if="loading" class="muted">Loading templates…</p>
      <AspEmptyState v-else-if="!templates.length" heading="No templates" message="Create one to start laying out a card." />
      <ul v-else class="template-list" data-test="template-list">
        <li v-for="t in templates" :key="t.id">
          <button type="button" class="template-row" :data-test="`template-${t.id}`" @click="editingId = t.id">
            <span class="template-name">{{ t.name }}</span>
            <span class="muted mono">{{ t.slug }}</span>
            <span class="muted">extends {{ t.parent_slug || 'none' }}</span>
            <span class="muted">v{{ t.current_version_no }}</span>
          </button>
        </li>
      </ul>
    </template>

    <AspModal :open="createOpen" size="sm" title="New template" @update:open="createOpen = $event">
      <AspInput :model-value="form.name" label="Name" data-test="create-name" @update:model-value="form.name = $event" />
      <AspInput :model-value="form.slug" label="Slug" hint="lowercase letters, digits and underscores, starting with a letter" data-test="create-slug" @update:model-value="form.slug = $event" />
      <AspSelect :options="parentOptions" :model-value="form.parent" label="Extends" data-test="create-extends" @update:model-value="form.parent = $event" />
      <p v-if="createError" class="load-error" data-test="create-error">{{ createError }}</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="createOpen = false">Cancel</AspButton>
        <AspButton variant="primary" type="button" :loading="creating" data-test="create-confirm" @click="create">Create</AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
// system_3 #8634 / #8650: the Templates section. The list with each template's
// parent and version, a create form, and the editor for the chosen one.
import { AspButton, AspEmptyState, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
import TemplateEditor from './TemplateEditor.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { ELEMENT_NAME_PATTERN } from '@/lib/cardgen/specProps.js';

export default {
  name: 'TemplatesPanel',
  components: { AspButton, AspEmptyState, AspInput, AspModal, AspSelect, TemplateEditor },
  setup() {
    return { api: useCardgen() };
  },
  data() {
    return {
      templates: [],
      loading: true,
      loadError: null,
      editingId: null,
      createOpen: false,
      creating: false,
      createError: null,
      form: { name: '', slug: '', parent: 0 },
    };
  },
  computed: {
    parentOptions() {
      return [{ value: 0, label: 'none' }, ...this.templates.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))];
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const { templates, error } = await this.api.listTemplates();
      this.loading = false;
      this.loadError = error;
      if (!error) this.templates = templates;
    },
    openCreate() {
      this.createError = null;
      const base = this.templates.find((t) => t.slug === 'base');
      this.form = { name: '', slug: '', parent: base ? base.id : 0 };
      this.createOpen = true;
    },
    async create() {
      const name = this.form.name.trim();
      const slug = this.form.slug.trim();
      if (!name) {
        this.createError = 'Give the template a name';
        return;
      }
      if (!ELEMENT_NAME_PATTERN.test(slug)) {
        this.createError = 'The slug must be lowercase letters, digits and underscores, starting with a letter';
        return;
      }
      this.creating = true;
      this.createError = null;
      const body = { name, slug, spec: { elements: {} }, note: 'created' };
      if (this.form.parent) body.parent_template_id = this.form.parent;
      const { template, error } = await this.api.createTemplate(body);
      this.creating = false;
      if (error) {
        this.createError = error;
        return;
      }
      this.createOpen = false;
      await this.load();
      this.editingId = template.id;
    },
  },
};
</script>

<style scoped>
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3, 12px);
}
.template-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2, 8px);
}
.template-row {
  width: 100%;
  display: flex;
  gap: var(--space-3, 12px);
  align-items: baseline;
  flex-wrap: wrap;
  padding: var(--space-3, 12px);
  background: transparent;
  color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.template-name {
  font-weight: 600;
  flex: 1 1 160px;
}
.mono {
  font-family: var(--font-family-mono, monospace);
}
.muted {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
