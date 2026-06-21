<template>
  <!-- Inline range visualisation for one comparable-sales metric. The bar
       spans min↔max of the comparable rows; a median tick marks the centre
       of mass; the subject's dot lands at its position on that range.
       When the subject is below min or above max the dot clamps to the
       end and the chart flags an outlier callout so the operator does the
       cross-check before submitting. -->
  <div class="range-chart" :class="outlierSide ? `outlier outlier-${outlierSide}` : ''">
    <div class="range-chart__head">
      <span class="range-chart__label">{{ label }}</span>
      <span v-if="subjectLabel" class="range-chart__subject-label">
        Subjekt: {{ subjectLabel }}
      </span>
    </div>
    <div class="range-chart__axis" :class="{ 'no-subject': !hasSubject }">
      <div class="range-chart__bar"></div>
      <div
        v-if="hasMedianTick"
        class="range-chart__median"
        :style="{ left: medianPct + '%' }"
        :title="`Median: ${formattedMedian}`"
      ></div>
      <div
        v-if="hasSubject"
        class="range-chart__dot"
        :style="{ left: subjectPct + '%' }"
        :title="`Subjekt: ${formattedSubject}`"
      ></div>
    </div>
    <div class="range-chart__ends">
      <span class="range-chart__end">{{ formattedMin }}</span>
      <span class="range-chart__end range-chart__end--right">{{ formattedMax }}</span>
    </div>
    <p v-if="callout" class="range-chart__callout">{{ callout }}</p>
  </div>
</template>

<script>
export default {
  name: 'RangeChart',
  props: {
    label: { type: String, required: true },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    median: { type: Number, default: null },
    subject: { type: Number, default: null },
    format: { type: Function, default: (v) => String(v) },
  },
  computed: {
    hasRange() {
      return this.min != null && this.max != null && this.max > this.min;
    },
    hasMedianTick() {
      return this.hasRange && this.median != null;
    },
    hasSubject() {
      return this.subject != null && this.hasRange;
    },
    outlierSide() {
      if (!this.hasSubject) return null;
      if (this.subject < this.min) return 'below';
      if (this.subject > this.max) return 'above';
      return null;
    },
    medianPct() {
      if (!this.hasRange) return 0;
      return ((this.median - this.min) / (this.max - this.min)) * 100;
    },
    subjectPct() {
      if (!this.hasSubject) return 0;
      const raw = ((this.subject - this.min) / (this.max - this.min)) * 100;
      return Math.max(0, Math.min(100, raw));
    },
    subjectLabel() {
      return this.hasSubject ? this.formattedSubject : null;
    },
    formattedMin() {
      return this.min == null ? '—' : this.format(this.min);
    },
    formattedMax() {
      return this.max == null ? '—' : this.format(this.max);
    },
    formattedMedian() {
      return this.median == null ? '—' : this.format(this.median);
    },
    formattedSubject() {
      return this.subject == null ? '—' : this.format(this.subject);
    },
    callout() {
      // Magnitude is calculated against the breached end so the operator
      // sees how much the subject overshoots the comparables. Hides the
      // sign when the subject sits inside the range.
      if (!this.outlierSide) return null;
      if (this.outlierSide === 'above') {
        const pct = Math.round(((this.subject - this.max) / this.max) * 100);
        return `Subjektet ligger ${pct}% över högsta jämförbar — bekräfta innan du genererar.`;
      }
      const pct = Math.round(((this.min - this.subject) / this.min) * 100);
      return `Subjektet ligger ${pct}% under lägsta jämförbar — bekräfta innan du genererar.`;
    },
  },
};
</script>

<style scoped>
.range-chart {
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: var(--space-2xs, 4px);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background-color: #ffffff;
  color: var(--text-on-light);
}

.range-chart.outlier {
  border-color: #d97706;
  background-color: #fff7ed;
}

.range-chart__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
}

.range-chart__label {
  font-weight: 600;
  font-size: var(--text-sm);
}

.range-chart__subject-label {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.range-chart.outlier .range-chart__subject-label {
  color: #92400e;
  font-weight: 600;
}

.range-chart__axis {
  position: relative;
  height: 22px;
}

.range-chart__bar {
  position: absolute;
  inset: 50% 0 auto 0;
  transform: translateY(-50%);
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    rgba(59, 130, 246, 0.25) 0%,
    rgba(59, 130, 246, 0.55) 50%,
    rgba(59, 130, 246, 0.25) 100%
  );
}

.range-chart__median {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 14px;
  margin-left: -1px;
  transform: translateY(-50%);
  background-color: rgba(59, 130, 246, 0.9);
}

.range-chart__dot {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  transform: translateY(-50%);
  border-radius: 50%;
  background-color: #1f2937;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #1f2937;
}

.range-chart.outlier .range-chart__dot {
  background-color: #d97706;
  box-shadow: 0 0 0 1px #92400e;
}

.range-chart__ends {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-2xs, 0.7rem);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.range-chart__callout {
  margin: var(--space-2xs, 4px) 0 0;
  color: #92400e;
  font-size: var(--text-xs);
}
</style>
