<template>
  <div class="timeline-filter">
    <div class="filter-group">
      <label class="filter-label">Period</label>
      <select v-model="localPeriod" class="filter-select">
        <option value="day">Day</option>
        <option value="week">ISO Week</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
        <option value="custom">Custom</option>
      </select>
    </div>

    <div v-if="localPeriod === 'custom'" class="filter-group filter-dates">
      <input type="date" v-model="localCustomStart" class="filter-date" />
      <span class="date-separator">&ndash;</span>
      <input type="date" v-model="localCustomEnd" class="filter-date" />
    </div>

    <div class="filter-group">
      <label class="filter-label">Mode</label>
      <div class="mode-toggle">
        <button
          :class="['mode-btn', { active: localMode === 'planned' }]"
          @click="localMode = 'planned'"
        >Planned</button>
        <button
          :class="['mode-btn', { active: localMode === 'achieved' }]"
          @click="localMode = 'achieved'"
        >Achieved</button>
        <button
          :class="['mode-btn', { active: localMode === 'combined' }]"
          @click="localMode = 'combined'"
        >Combined</button>
      </div>
    </div>

    <div class="filter-actions">
      <button class="btn-apply" @click="$emit('apply')" :disabled="localPeriod === 'custom' && (!localCustomStart || !localCustomEnd)">
        Apply
      </button>
      <button class="btn-clear" @click="$emit('clear')" :disabled="!active">
        Clear
      </button>
    </div>

    <span v-if="active" class="filter-active-badge">Filtering active</span>
  </div>
</template>

<script>
import { computed } from 'vue';

export default {
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

    return {
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

.filter-select {
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  cursor: pointer;
}

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

.mode-toggle {
  display: flex;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-card);
}

.mode-btn {
  padding: var(--space-2xs) var(--space-sm);
  border: none;
  border-radius: 0;
  background-color: var(--surface-card-inner);
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.mode-btn:not(:last-child) {
  border-right: 1px solid var(--border-card);
}

.mode-btn.active {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
}

.mode-btn:hover:not(.active) {
  color: var(--text-on-dark);
}

.filter-actions {
  display: flex;
  gap: var(--space-xs);
  margin-left: auto;
}

.btn-apply {
  padding: var(--space-2xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: none;
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--transition-fast);
}

.btn-apply:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn-apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  padding: var(--space-2xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background: none;
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.btn-clear:hover:not(:disabled) {
  color: var(--text-on-dark);
  border-color: var(--text-on-dark);
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-active-badge {
  font-size: var(--text-xs);
  color: var(--brand-primary);
  font-weight: 600;
  white-space: nowrap;
}
</style>
