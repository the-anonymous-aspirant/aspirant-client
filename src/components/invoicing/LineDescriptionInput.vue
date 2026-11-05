<template>
  <div class="line-desc" data-test="line-desc">
    <!-- One field that both suggests and accepts free text (operator c61358:
         "a combination of a dropdown and a freetext"): AspInput forwards
         `list` to its <input>, and the browser draws the suggestions. -->
    <AspInput
      :model-value="modelValue"
      :label="label"
      :aria-label="ariaLabel || undefined"
      :placeholder="placeholder"
      :list="listId"
      autocomplete="off"
      v-bind="$attrs"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <datalist :id="listId" data-test="line-desc-options">
      <option v-for="c in categories" :key="c" :value="c" />
    </datalist>
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
  </div>
</template>

<script>
  import { ref } from 'vue';
  import { AspButton, AspInput } from '@aspirant/design-system';
  import { allCategories, isDefault, isSaved, removeCategory, saveCategory, storageAvailable } from './lineCategories.js';

  // Bumped on every save or remove so every field on the page (several draft
  // lines, the New invoice dialog) re-reads the same list.
  const version = ref(0);
  let uid = 0;

  export default {
    name: 'LineDescriptionInput',
    components: { AspButton, AspInput },
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: '' },
      label: { type: String, default: '' },
      ariaLabel: { type: String, default: '' },
      // A datalist has no mark at rest, so the placeholder says the field offers
      // choices (design_agent on #9928, D12).
      placeholder: { type: String, default: 'Choose or type, e.g. Tattoo' },
    },
    emits: ['update:modelValue'],
    data() {
      uid += 1;
      return { listId: `line-desc-options-${uid}`, canStore: storageAvailable() };
    },
    computed: {
      categories() {
        void version.value;
        return allCategories();
      },
      // One small action under the field: save a new text as a category, or
      // remove one she saved. The defaults are never removable.
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
  .line-desc {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .line-desc > :first-child {
    align-self: stretch;
  }
</style>
