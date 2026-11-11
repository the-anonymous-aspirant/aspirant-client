<template>
  <SuggestField
    :model-value="modelValue"
    :label="label"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :options="matches"
    test-id="line-desc"
    v-bind="$attrs"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <AspButton
      v-if="action"
      variant="ghost"
      size="sm"
      class="line-desc__action"
      :aria-label="action.aria"
      :data-test="action.test"
      @click="action.run"
    >
      {{ action.label }}
    </AspButton>
  </SuggestField>
</template>

<script>
  import { ref } from 'vue';
  import { AspButton } from '@aspirant/design-system';
  import SuggestField from './SuggestField.vue';
  import { allCategories, isDefault, isSaved, removeCategory, saveCategory, storageAvailable } from './lineCategories.js';

  // Bumped on every save or remove so every field on the page (several draft
  // lines, the Enter payment by hand dialog) re-reads the same list.
  const version = ref(0);

  export default {
    name: 'LineDescriptionInput',
    components: { AspButton, SuggestField },
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: '' },
      label: { type: String, default: '' },
      ariaLabel: { type: String, default: '' },
      // The field has no mark at rest that it offers choices, so the
      // placeholder says it (design_agent on #9928, D12).
      placeholder: { type: String, default: 'Choose or type, e.g. Tattoo' },
    },
    emits: ['update:modelValue'],
    data() {
      return { canStore: storageAvailable() };
    },
    computed: {
      categories() {
        void version.value;
        return allCategories();
      },
      // Every entry when the field is empty; otherwise the ones containing the
      // text, ignoring case. Nothing matching closes the list: free text is the
      // normal case, so there is no "no matches" row. The combobox behaviour
      // (open/close, keyboard nav, positioning) lives in SuggestField
      // (§3.47 extract, don't copy); this is only what the field suggests.
      matches() {
        const q = (this.modelValue || '').trim().toLowerCase();
        return q ? this.categories.filter((c) => c.toLowerCase().includes(q)) : this.categories;
      },
      // One small action under the field: save a new text as a category, or
      // remove one she saved. The defaults are never removable. Stays here,
      // not in SuggestField, because it is this field's own capability
      // (§3.142 Decision 2: "the category Save and Remove stay in
      // LineDescriptionInput.vue").
      action() {
        void version.value;
        const text = (this.modelValue || '').trim();
        if (!text || !this.canStore || isDefault(text)) return null;
        if (isSaved(text)) {
          return { label: 'Remove from this device’s categories', aria: `Remove “${text}” from this device’s categories`, test: 'line-desc-remove', run: () => this.change(removeCategory, text) };
        }
        return { label: 'Save as a category on this device', aria: `Save “${text}” as a category on this device`, test: 'line-desc-save', run: () => this.change(saveCategory, text) };
      },
    },
    methods: {
      change(fn, text) {
        fn(text);
        version.value += 1;
      },
    },
  };
</script>

<style scoped>
  .line-desc__action {
    align-self: flex-start;
  }
</style>
