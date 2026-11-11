<template>
  <div ref="root" class="suggest-field" :data-test="testId">
    <!-- One field that both suggests and accepts free text (operator c61358:
         "a combination of a dropdown and a freetext"). The suggestion list is
         drawn by the page, not the browser, so it reads and behaves the same in
         every engine and the specs can open it (design_agent on #9928).
         Extracted from LineDescriptionInput.vue (§3.47 extract, don't copy;
         design_agent c65348 on #10539, §3.142 Decision 2) so the "Paid by"
         field shares this behaviour instead of copying it; which strings it
         offers, and what sits below the field, are the caller's own. -->
    <AspInput
      :model-value="modelValue"
      :label="label"
      :aria-label="ariaLabel || undefined"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="shown ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="shown && active >= 0 ? optionId(active) : undefined"
      autocomplete="off"
      v-bind="$attrs"
      @update:model-value="onType"
      @focus="openList"
      @click="openList"
      @blur="closeList"
      @keydown="onKeydown"
    />
    <ul v-show="shown" :id="listId" ref="panel" class="suggest-field__panel" role="listbox" aria-label="Suggestions" :data-test="`${testId}-options`">
      <!-- mousedown.prevent keeps focus in the field, so the blur that closes
           the list never races the pick. -->
      <li
        v-for="(opt, i) in options"
        :id="optionId(i)"
        :key="opt"
        role="option"
        :aria-selected="i === active ? 'true' : 'false'"
        class="suggest-field__option"
        :class="{ 'suggest-field__option--active': i === active }"
        @mousedown.prevent
        @click="pick(opt)"
      >
        {{ opt }}
      </li>
    </ul>
    <slot />
  </div>
</template>

<script>
  import { AspInput } from '@aspirant/design-system';

  // A transform, filter or containment on an ancestor (AspModal's sheet slides
  // in with a transform) makes it the containing block of a fixed element, so
  // viewport coordinates are taken relative to it. Copied from AspSelect.
  const fixedContainingBlock = (el) => {
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (
        cs.transform !== 'none' ||
        cs.perspective !== 'none' ||
        cs.filter !== 'none' ||
        (cs.backdropFilter && cs.backdropFilter !== 'none') ||
        /paint|layout|strict|content/.test(cs.contain) ||
        /transform|perspective|filter/.test(cs.willChange)
      ) {
        return node;
      }
    }
    return null;
  };

  const EDGE = 8;
  let uid = 0;

  export default {
    name: 'SuggestField',
    components: { AspInput },
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: '' },
      label: { type: String, default: '' },
      ariaLabel: { type: String, default: '' },
      placeholder: { type: String, default: '' },
      // Already filtered/ordered by the caller (LineDescriptionInput's own
      // categories match, or the Paid-by field's Decision 4 "contains"):
      // this component owns the combobox behaviour, not what it suggests.
      options: { type: Array, default: () => [] },
      // Each caller's own prefix, so its tests keep selecting by name
      // ("line-desc", "manual-payer") rather than this component's own.
      testId: { type: String, default: 'suggest-field' },
    },
    emits: ['update:modelValue'],
    data() {
      uid += 1;
      return { listId: `suggest-field-options-${uid}`, open: false, active: -1, frame: 0 };
    },
    computed: {
      // Open only when it offers something: a list whose every entry is the
      // text already in the field adds nothing, and would cover the slot.
      shown() {
        const t = (this.modelValue || '').trim().toLowerCase();
        return this.open && this.options.some((o) => o.toLowerCase() !== t);
      },
    },
    watch: {
      shown(on) {
        if (on) {
          this.$nextTick(this.place);
          window.addEventListener('scroll', this.onViewportChange, true);
          window.addEventListener('resize', this.onViewportChange);
        } else {
          this.stopListening();
        }
      },
      options() {
        if (this.active >= this.options.length) this.active = -1;
        if (this.shown) this.$nextTick(this.place);
      },
    },
    beforeUnmount() {
      this.stopListening();
    },
    methods: {
      optionId(i) {
        return `${this.listId}-${i}`;
      },
      openList() {
        this.open = true;
      },
      closeList() {
        this.open = false;
        this.active = -1;
      },
      onType(value) {
        this.$emit('update:modelValue', value);
        this.open = true;
        this.active = -1;
      },
      pick(opt) {
        this.$emit('update:modelValue', opt);
        this.closeList();
      },
      onKeydown(event) {
        const n = this.options.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!n) return;
          event.preventDefault();
          if (!this.shown) {
            this.open = true;
            this.active = event.key === 'ArrowDown' ? 0 : n - 1;
          } else {
            const step = event.key === 'ArrowDown' ? 1 : -1;
            this.active = this.active < 0 ? (step > 0 ? 0 : n - 1) : (this.active + step + n) % n;
          }
          this.$nextTick(this.scrollActiveIntoView);
        } else if (event.key === 'Enter') {
          // While the list is open, Enter belongs to it: it picks the active
          // entry, and with none active it does nothing, never submitting the
          // dialog's form behind it.
          if (!this.shown) return;
          event.preventDefault();
          if (this.active >= 0) this.pick(this.options[this.active]);
        } else if (event.key === 'Escape') {
          // Closes the list and keeps the typed text (D13); the dialog stays.
          if (!this.shown) return;
          event.preventDefault();
          event.stopPropagation();
          this.closeList();
        } else if (event.key === 'Tab') {
          this.closeList();
        }
      },
      scrollActiveIntoView() {
        const el = this.active >= 0 && document.getElementById(this.optionId(this.active));
        if (el) el.scrollIntoView({ block: 'nearest' });
      },
      onViewportChange() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          if (this.shown) this.place();
        });
      },
      stopListening() {
        window.removeEventListener('scroll', this.onViewportChange, true);
        window.removeEventListener('resize', this.onViewportChange);
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
      },
      // Fixed, measured against the field, so neither the dialog's scroll box
      // nor the line grid clips it: below the field unless there is more room
      // above, its height capped to the room on that side (AspSelect's rule).
      place() {
        const el = this.$refs.panel;
        // The visible field is AspInput's bordered box, not the inner <input>.
        const field = this.$refs.root && (this.$refs.root.querySelector('.field__control') || this.$refs.root.querySelector('input'));
        if (!el || !field) return;
        // Anchored under the whole block (the field and whatever the slot
        // adds), not the field alone, so the list never covers it.
        const f = field.getBoundingClientRect();
        const r = this.$refs.root.getBoundingClientRect();
        const t = { top: f.top, bottom: r.bottom, left: f.left, width: f.width };
        if (t.bottom < 0 || t.top > window.innerHeight) {
          this.closeList();
          return;
        }
        const gap = parseFloat(getComputedStyle(el).marginTop) || 0;
        const spaceBelow = window.innerHeight - t.bottom - gap - EDGE;
        const spaceAbove = t.top - gap - EDGE;
        el.style.width = `${t.width}px`;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const natural = Math.min(el.scrollHeight, 15 * rem);
        const up = natural > spaceBelow && spaceAbove > spaceBelow;
        const space = Math.max(up ? spaceAbove : spaceBelow, 0);
        el.style.setProperty('--suggest-field-panel-space', `${Math.floor(space)}px`);
        const height = Math.min(natural, space);
        const cb = fixedContainingBlock(el);
        const cbRect = cb && cb.getBoundingClientRect();
        const origin = cb ? { left: cbRect.left + cb.clientLeft, top: cbRect.top + cb.clientTop } : { left: 0, top: 0 };
        const left = Math.min(t.left, window.innerWidth - t.width - EDGE);
        el.style.left = `${Math.max(left, EDGE) - origin.left}px`;
        el.style.top = `${(up ? t.top - height - gap * 2 : t.bottom) - origin.top}px`;
      },
    },
  };
</script>

<style scoped>
  .suggest-field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .suggest-field > :first-child {
    align-self: stretch;
  }

  /* AspSelect's panel, copied (aspirant-design-system 8feb885, .select__panel):
     the panel is a surface-setter, so it sets its ink with its background. */
  .suggest-field__panel {
    position: fixed;
    z-index: 20;
    margin: var(--space-2xs) 0 0;
    max-height: min(15rem, var(--suggest-field-panel-space, 15rem));
    overflow-y: auto;
    padding: var(--space-2xs) 0;
    list-style: none;
    text-align: left;
    background: var(--surface-card);
    color: var(--text-on-dark);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  .suggest-field__option {
    display: flex;
    align-items: center;
    /* A phone row is at least 44px tall: a missed row picks the wrong text
       (§3.122 P8). */
    min-height: 44px;
    padding: var(--space-2xs) var(--space-sm);
    font-size: var(--text-base);
    color: inherit;
    cursor: pointer;
  }

  .suggest-field__option--active,
  .suggest-field__option:hover {
    background: var(--surface-card-inner);
    box-shadow: inset 2px 0 0 var(--brand-primary);
  }

  @media (min-width: 768px) {
    .suggest-field__option {
      min-height: 0;
      font-size: var(--text-sm);
    }
  }
</style>
