<template>
  <div class="cards-panel" data-test="cards-panel">
    <CardEditor v-if="editingId" :card-id="editingId" :types="types" :templates="templates" @back="closeEditor" @changed="reviewKey += 1" @deleted="closeEditor" />
    <template v-else>
      <div class="panel-head">
        <AspButton variant="primary" size="sm" type="button" data-test="new-card" @click="openCreate">New card</AspButton>
      </div>
      <ReviewPanel :key="reviewKey" @edit="editingId = $event" />
    </template>

    <AspModal :open="createOpen" size="sm" title="New card" @update:open="createOpen = $event">
      <AspSelect :options="typeOptions" :model-value="form.card_type_id" label="Type" data-test="create-card-type" @update:model-value="form.card_type_id = $event" />
      <AspInput :model-value="form.name" label="Name" data-test="create-card-name" @update:model-value="form.name = $event" />
      <AspInput :model-value="form.slug" label="Slug" hint="lowercase letters, digits and underscores, starting with a letter" data-test="create-card-slug" @update:model-value="form.slug = $event" />
      <AspSelect :options="templateOptions" :model-value="form.template_id" label="Template" data-test="create-card-template" @update:model-value="form.template_id = $event" />
      <p v-if="createError" class="load-error" data-test="create-card-error">{{ createError }}</p>
      <template #footer>
        <AspButton variant="secondary" type="button" @click="createOpen = false">Cancel</AspButton>
        <AspButton variant="primary" type="button" :loading="creating" data-test="create-card-confirm" @click="create">Create</AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
// system_3 #8634 / #8651: the Cards section. The print-scale review (B4) with
// a New card action and, on Edit, the card editor in place.
import { AspButton, AspInput, AspModal, AspSelect } from '@aspirant/design-system';
import CardEditor from './CardEditor.vue';
import ReviewPanel from './ReviewPanel.vue';
import { useCardgen } from '@/composables/useCardgen.js';
import { ELEMENT_NAME_PATTERN } from '@/lib/cardgen/specProps.js';

export default {
  name: 'CardsPanel',
  components: { AspButton, AspInput, AspModal, AspSelect, CardEditor, ReviewPanel },
  setup() {
    return { api: useCardgen() };
  },
  data() {
    return {
      types: [],
      templates: [],
      editingId: null,
      reviewKey: 0,
      createOpen: false,
      creating: false,
      createError: null,
      form: { card_type_id: 0, name: '', slug: '', template_id: 0 },
    };
  },
  computed: {
    typeOptions() {
      return this.types.map((t) => ({ value: t.id, label: t.name }));
    },
    templateOptions() {
      return [{ value: 0, label: "the type's front" }, ...this.templates.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))];
    },
  },
  mounted() {
    this.loadMeta();
  },
  methods: {
    async loadMeta() {
      const [{ types }, { templates }] = await Promise.all([this.api.listTypes(), this.api.listTemplates()]);
      this.types = types;
      this.templates = templates;
    },
    openCreate() {
      this.createError = null;
      this.form = { card_type_id: this.types[0]?.id || 0, name: '', slug: '', template_id: 0 };
      this.createOpen = true;
    },
    async create() {
      const name = this.form.name.trim();
      const slug = this.form.slug.trim();
      if (!this.form.card_type_id) {
        this.createError = 'Choose a type';
        return;
      }
      if (!name) {
        this.createError = 'Give the card a name';
        return;
      }
      if (!ELEMENT_NAME_PATTERN.test(slug)) {
        this.createError = 'The slug must be lowercase letters, digits and underscores, starting with a letter';
        return;
      }
      this.creating = true;
      this.createError = null;
      const body = { name, slug, card_type_id: this.form.card_type_id, data: { values: {} }, note: 'created' };
      if (this.form.template_id) body.template_id = this.form.template_id;
      const { card, error } = await this.api.createCard(body);
      this.creating = false;
      if (error) {
        this.createError = error;
        return;
      }
      this.createOpen = false;
      this.editingId = card.id;
    },
    closeEditor() {
      this.editingId = null;
      this.reviewKey += 1;
    },
  },
};
</script>

<style scoped>
.panel-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-3, 12px);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
