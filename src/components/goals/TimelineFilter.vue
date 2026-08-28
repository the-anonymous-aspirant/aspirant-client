<template>
  <div class="timeline-filter">
    <div class="filter-group">
      <!-- The caption stays consumer-authored rather than moving to AspSelect's
           `label` prop: .select__label is --text-xs with no weight where the
           .field__label AspInput and AspTextarea render is --text-sm at
           --font-weight-medium (DS defect #4484), and this caption has to match
           the "Mode" one beside it. The name therefore rides aria-label; the
           <label> keeps no `for`, because an id passed to AspSelect lands on its
           wrapper <div>, which is not a labelable element. -->
      <label class="filter-label">Period</label>
      <AspSelect
        :model-value="localPeriod"
        :options="periodOptions"
        aria-label="Period"
        @update:model-value="v => { localPeriod = v }"
      />
    </div>

    <div v-if="localPeriod === 'custom'" class="filter-group filter-dates">
      <input type="date" v-model="localCustomStart" class="filter-date" />
      <span class="date-separator">&ndash;</span>
      <input type="date" v-model="localCustomEnd" class="filter-date" />
    </div>

    <div class="filter-group">
      <label class="filter-label">Mode</label>
      <AspSegmented
        v-model="localMode"
        :options="modeOptions"
        as="radiogroup"
        size="sm"
        aria-label="Timeline mode"
      />
    </div>

    <div class="filter-actions">
      <AspButton variant="primary" @click="$emit('apply')" :disabled="localPeriod === 'custom' && (!localCustomStart || !localCustomEnd)">
        Apply
      </AspButton>
      <AspButton variant="secondary" @click="$emit('clear')" :disabled="!active">
        Clear
      </AspButton>
    </div>

    <span v-if="active" class="filter-active-badge">Filtering active</span>
  </div>
</template>

<script>
import { computed } from 'vue';
import { AspButton, AspSegmented, AspSelect } from '@aspirant/design-system';

export default {
  components: {
    AspButton,
    AspSegmented,
    AspSelect,
  },
  props: {
    period: { type: String, required: true },
    customStart: { type: String, default: '' },
    customEnd: { type: String, default: '' },
    mode: { type: String, required: true },
    active: { type: Boolean, default: false },
  },
  emits: ['update:period', 'update:customStart', 'update:customEnd', 'update:mode', 'apply', 'clear'],
  setup(props, { emit }) {
    const localPeriod = computed({
      get: () => props.period,
      set: (v) => emit('update:period', v),
    });
    const localCustomStart = computed({
      get: () => props.customStart,
      set: (v) => emit('update:customStart', v),
    });
    const localCustomEnd = computed({
      get: () => props.customEnd,
      set: (v) => emit('update:customEnd', v),
    });
    const localMode = computed({
      get: () => props.mode,
      set: (v) => emit('update:mode', v),
    });

    // Same shape as the strip below: AspSelect renders its members from
    // `options` where the native took <option> markup. Every value here is
    // meaningful (there is no "all" entry), so nothing becomes a placeholder.
    const periodOptions = [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'ISO Week' },
      { value: 'month', label: 'Month' },
      { value: 'quarter', label: 'Quarter' },
      { value: 'year', label: 'Year' },
      { value: 'custom', label: 'Custom' },
    ];

    // The strip's members are data, not markup: AspSegmented renders them from
    // `options` and owns the roving tabindex + arrow-key selection.
    const modeOptions = [
      { value: 'planned', label: 'Planned' },
      { value: 'achieved', label: 'Achieved' },
      { value: 'combined', label: 'Combined' },
    ];

    return {
      periodOptions,
      modeOptions,
      localPeriod,
      localCustomStart,
      localCustomEnd,
      localMode,
    };
  },
};
</script>

<style scoped>
.timeline-filter {
  /* This card paints the dark --surface-card on a light page, so it must also
     DECLARE its ink polarity. The DS's currentColor-relative components
     (AspSegmented's labels, AspButton variant="ghost") inherit `color` from
     their host by design (§3.18) — that is the seam through which a consumer
     tells them which surface they landed on. Without this line they inherit the
     light page's dark ink and paint dark-on-dark: measured at 1.99:1 for the
     unselected strip members and 1.85:1 for the selected one. #4443. */
  color: var(--text-on-dark);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.filter-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* .filter-select is gone with the native it painted. AspSelect's trigger sets
   its own fill, ink and --border-control boundary, and this file's data-v
   attribute does not reach inside the component anyway, so the rule could no
   longer match. The two `date` inputs below keep .filter-date — `date` is
   outside AspInput's §3.85 allowlist and no DS component covers it. */

.filter-dates {
  gap: var(--space-xs);
}

.filter-date {
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.date-separator {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* The Planned/Achieved/Combined strip is AspSegmented (as="radiogroup"): three
   modes that re-filter one timeline in place, with no second panel to name in
   aria-controls, so it is a radiogroup and not tabs.

   Note what the old .mode-btn.active rule was doing: it painted the selected
   member with the full brand amber (background: var(--brand-primary)). That
   spends the accent budget on a choice, which is the specific thing §3.89 built
   this primitive to stop — AspSegmented marks selection with a currentColor mix
   and a thin brand underline instead. Dropping the rule is the fix, not a
   side effect of the port. */

.filter-actions {
  display: flex;
  gap: var(--space-xs);
  margin-left: auto;
}

/* Apply/Clear are AspButtons (primary/secondary) and the mode strip is
   AspSegmented; the DS owns all three, including the disabled state.
   .filter-actions above lays the two buttons out. The mode-strip hold this
   comment used to record — "held pending the #4295 design ruling" — is
   released: the ruling landed as §3.89 and shipped as AspSegmented (#4329). */

.filter-active-badge {
  font-size: var(--text-xs);
  color: var(--brand-primary);
  font-weight: 600;
  white-space: nowrap;
}
</style>
