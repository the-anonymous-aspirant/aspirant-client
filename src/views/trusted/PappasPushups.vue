<template>
  <div class="pappas-view">
    <h1>Pappas pushups</h1>
    <p class="page-subtitle">
      60 dagars utmaning — 1000 armhävningar mellan 1 juli och 29 augusti 2026.
    </p>
    <p class="music-hint">Glöm inte att klicka på musikknappen för Robbans Tusen!</p>

    <RobbansTusen></RobbansTusen>

    <div v-if="loading" class="loading-text">Laddar…</div>
    <div v-else-if="loadError" class="error-text">{{ loadError }}</div>

    <template v-else>
      <transition name="toast">
        <div v-if="activeToast" class="milestone-toast">{{ activeToast }}</div>
      </transition>

      <div class="chart-card">
        <h3>Kumulativ summa</h3>
        <div class="chart-wrap">
          <canvas ref="chartCanvas"></canvas>
        </div>
        <div class="chart-meta">
          <span>{{ cumulativeTotal }} av {{ target }} armhävningar</span>
          <span v-if="daysWithData > 0" class="chart-meta-sep">·</span>
          <span v-if="daysWithData > 0">
            Snitt så långt: {{ averagePerLoggedDay }} per loggad dag
          </span>
        </div>
      </div>

      <div class="entries-card">
        <h3>Dagar</h3>
        <details
          v-for="week in weekChunks"
          :key="week.index"
          class="week-block"
          :open="week.containsToday"
        >
          <summary class="week-summary">
            <span class="week-label">Vecka {{ week.index + 1 }}</span>
            <span class="week-range">{{ week.label }}</span>
            <span v-if="week.containsToday" class="week-today-pill">idag</span>
          </summary>
          <table class="entries-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Antal</th>
                <th>Total</th>
                <th>Meddelande</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in week.rows"
                :key="row.date"
                :class="{ locked: !row.editable, today: row.isToday }"
              >
                <td class="date-cell">
                  <span class="weekday">{{ row.weekday }}</span>
                  <span class="date-label">{{ row.dateLabel }}</span>
                </td>
                <td class="count-cell">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    :value="row.count"
                    :disabled="!row.editable || savingDates.has(row.date)"
                    @change="onCountChange(row, $event)"
                    :aria-label="`Antal armhävningar för ${row.dateLabel}`"
                  />
                  <span v-if="savingDates.has(row.date)" class="saving-pill">sparar…</span>
                  <span v-else-if="errorDates.has(row.date)" class="error-pill">fel</span>
                </td>
                <td class="cumulative-cell">{{ row.cumulative !== null ? row.cumulative : '—' }}</td>
                <td class="message-cell">
                  <span v-if="row.message" class="milestone-badge">{{ row.message }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </template>
  </div>
</template>

<script>
  import axios from 'axios';
  import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler,
  } from 'chart.js';
  import RobbansTusen from '../../components/RobbansTusen.vue';

  Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
    Filler
  );

  const TARGET = 1000;
  const EDIT_WINDOW_DAYS = 2;

  const SV_WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
  const SV_MONTHS = [
    'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
    'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
  ];

  function parseISODate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const STOCKHOLM_TODAY_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function todayInStockholm() {
    return parseISODate(STOCKHOLM_TODAY_FMT.format(new Date()));
  }

  function dayDiff(a, b) {
    const ms = a.getTime() - b.getTime();
    return Math.round(ms / 86400000);
  }

  function chunkIntoWeeks(rows) {
    const chunks = [];
    for (let i = 0; i < rows.length; i += 7) {
      const slice = rows.slice(i, i + 7);
      const first = slice[0];
      const last = slice[slice.length - 1];
      chunks.push({
        index: chunks.length,
        label: `${first.dateLabel} – ${last.dateLabel}`,
        rows: slice,
        containsToday: slice.some((r) => r.isToday),
      });
    }
    return chunks;
  }

  export default {
    name: 'PappasPushups',
    components: { RobbansTusen },
    data() {
      return {
        target: TARGET,
        entries: [],
        milestones: [],
        loading: true,
        loadError: null,
        savingDates: new Set(),
        errorDates: new Set(),
        activeToast: null,
        toastTimer: null,
        chart: null,
      };
    },
    computed: {
      milestoneMap() {
        const map = new Map();
        for (const m of this.milestones) {
          map.set(m.cumulative_count, m.message_sv);
        }
        return map;
      },
      tableRows() {
        const today = todayInStockholm();
        let running = 0;
        const rows = [];
        for (const entry of this.entries) {
          const date = parseISODate(entry.date);
          const diff = dayDiff(date, today);
          const editable = Math.abs(diff) <= EDIT_WINDOW_DAYS;
          const count = entry.count;
          let cumulative = null;
          let message = null;
          if (count !== null && count !== undefined) {
            running += count;
            cumulative = running;
            if (this.milestoneMap.has(running)) {
              message = this.milestoneMap.get(running);
            }
          }
          rows.push({
            date: entry.date,
            count,
            cumulative,
            editable,
            isToday: diff === 0,
            weekday: SV_WEEKDAYS[date.getUTCDay()],
            dateLabel: `${date.getUTCDate()} ${SV_MONTHS[date.getUTCMonth()]}`,
            message,
          });
        }
        return rows;
      },
      weekChunks() {
        return chunkIntoWeeks(this.tableRows);
      },
      cumulativeTotal() {
        let total = 0;
        for (const e of this.entries) {
          if (e.count !== null && e.count !== undefined) total += e.count;
        }
        return total;
      },
      daysWithData() {
        return this.entries.filter((e) => e.count !== null && e.count !== undefined).length;
      },
      averagePerLoggedDay() {
        if (!this.daysWithData) return 0;
        return Math.round(this.cumulativeTotal / this.daysWithData);
      },
    },
    methods: {
      async fetchAll() {
        this.loading = true;
        this.loadError = null;
        try {
          const [entriesResp, milestonesResp] = await Promise.all([
            axios.get('/api/pushups/entries'),
            axios.get('/api/pushups/milestones'),
          ]);
          this.entries = entriesResp.data.entries || [];
          this.milestones = milestonesResp.data.milestones || [];
        } catch (err) {
          this.loadError = err.response?.data?.error?.message || err.message || 'Kunde inte hämta data';
        }
        this.loading = false;
        this.$nextTick(() => this.renderChart());
      },
      async onCountChange(row, event) {
        const raw = event.target.value;
        const parsed = raw === '' ? null : Number(raw);
        if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
          event.target.value = row.count ?? '';
          return;
        }

        this.errorDates.delete(row.date);
        this.savingDates.add(row.date);

        const prevCumulative = this.cumulativeTotal;
        try {
          const resp = await axios.patch(`/api/pushups/entries/${row.date}`, { count: parsed });
          const updated = resp.data.entry;
          const idx = this.entries.findIndex((e) => e.date === row.date);
          if (idx !== -1) {
            this.entries[idx] = { ...this.entries[idx], count: updated.count };
          }
          this.$nextTick(() => {
            this.renderChart();
            this.maybeFireMilestoneToast(prevCumulative);
          });
        } catch (err) {
          this.errorDates.add(row.date);
          event.target.value = row.count ?? '';
          const msg = err.response?.data?.error?.message || err.message;
          this.flashToast(`Kunde inte spara: ${msg}`);
        } finally {
          this.savingDates.delete(row.date);
        }
      },
      maybeFireMilestoneToast(prevCumulative) {
        const current = this.cumulativeTotal;
        if (current <= prevCumulative) return;
        let highest = null;
        for (const m of this.milestones) {
          if (m.cumulative_count > prevCumulative && m.cumulative_count <= current) {
            if (!highest || m.cumulative_count > highest.cumulative_count) highest = m;
          }
        }
        if (highest) this.flashToast(highest.message_sv);
      },
      flashToast(message) {
        this.activeToast = message;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.activeToast = null;
        }, 4500);
      },
      renderChart() {
        const canvas = this.$refs.chartCanvas;
        if (!canvas) return;

        const labels = this.entries.map((e) => {
          const d = parseISODate(e.date);
          return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
        });
        let running = 0;
        const cumulative = this.entries.map((e) => {
          if (e.count !== null && e.count !== undefined) running += e.count;
          return running;
        });
        const targetLine = labels.map(() => this.target);

        if (this.chart) {
          this.chart.data.labels = labels;
          this.chart.data.datasets[0].data = cumulative;
          this.chart.data.datasets[1].data = targetLine;
          this.chart.update();
          return;
        }

        this.chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Kumulativ',
                data: cumulative,
                borderColor: '#ffb300',
                backgroundColor: 'rgba(255, 179, 0, 0.15)',
                fill: true,
                tension: 0.15,
                pointRadius: 2,
              },
              {
                label: `Mål (${this.target})`,
                data: targetLine,
                borderColor: '#82b1ff',
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, suggestedMax: this.target },
            },
            plugins: {
              legend: { position: 'bottom', labels: { color: '#e4e4e4' } },
              tooltip: { mode: 'index', intersect: false },
            },
          },
        });
      },
    },
    mounted() {
      this.fetchAll();
    },
    beforeUnmount() {
      if (this.chart) this.chart.destroy();
      if (this.toastTimer) clearTimeout(this.toastTimer);
    },
  };
</script>

<style scoped>
.pappas-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-on-light);
  min-height: 100vh;
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xs);
  text-align: center;
}

.music-hint {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-xl) 0;
  text-align: center;
  font-style: italic;
}

.loading-text,
.error-text {
  font-size: var(--text-lg);
  padding: var(--space-xl) 0;
}

.error-text {
  color: var(--feedback-error);
}

.milestone-toast {
  position: fixed;
  top: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--brand-primary);
  color: #1a1a1a;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  font-weight: 600;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}

.chart-card,
.entries-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.chart-card h3,
.entries-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.chart-wrap {
  height: 280px;
  position: relative;
}

.chart-meta {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
}

.chart-meta-sep {
  opacity: 0.5;
}

.week-block {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.week-block:first-of-type {
  border-top: none;
}

.week-summary {
  cursor: pointer;
  padding: var(--space-sm) var(--space-xs);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  list-style: none;
  user-select: none;
  color: var(--text-on-dark);
}

.week-summary::-webkit-details-marker {
  display: none;
}

.week-summary::before {
  content: '▸';
  display: inline-block;
  width: 1em;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.week-block[open] > .week-summary::before {
  transform: rotate(90deg);
}

.week-label {
  font-weight: 600;
  color: var(--text-heading-card);
}

.week-range {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.week-today-pill {
  margin-left: auto;
  padding: 0 var(--space-xs);
  font-size: var(--text-xs);
  background-color: var(--brand-primary);
  color: #1a1a1a;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.entries-table {
  width: 100%;
  border-collapse: collapse;
}

.entries-table th,
.entries-table td {
  padding: var(--space-xs) var(--space-sm);
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.entries-table th {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.entries-table tr.locked td {
  opacity: 0.5;
}

.entries-table tr.locked td.count-cell,
.entries-table tr.locked td.cumulative-cell {
  opacity: 1;
}

.entries-table tr.locked td.count-cell input:disabled {
  background-color: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  -webkit-text-fill-color: #ffffff;
}

.entries-table tr.today {
  background-color: rgba(255, 179, 0, 0.06);
}

.date-cell {
  white-space: nowrap;
}

.date-cell .weekday {
  display: inline-block;
  width: 2.5em;
  color: var(--text-muted);
  text-transform: lowercase;
}

.count-cell input {
  width: 5em;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  font-weight: 700;
  font-size: var(--text-base);
  text-align: right;
}

.count-cell input:disabled {
  cursor: not-allowed;
  background-color: rgba(0, 0, 0, 0.15);
}

.count-cell input:focus {
  outline: 2px solid var(--brand-primary);
  outline-offset: 1px;
}

.saving-pill,
.error-pill {
  margin-left: var(--space-xs);
  font-size: var(--text-xs);
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
}

.saving-pill {
  color: var(--text-muted);
}

.error-pill {
  color: var(--feedback-error);
  border: 1px solid currentColor;
}

.cumulative-cell {
  font-variant-numeric: tabular-nums;
  color: #ffffff;
  font-weight: 700;
}

.milestone-badge {
  display: inline-block;
  padding: 2px 8px;
  background-color: var(--brand-primary);
  color: #1a1a1a;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
}

@media (max-width: 600px) {
  .entries-table th:nth-child(3),
  .entries-table td:nth-child(3) {
    display: none;
  }
  .chart-wrap {
    height: 220px;
  }
}
</style>
