<template>
  <!-- Intended user: father (personal app — #4184 IA) -->
  <div class="pappas-view">
    <h1>Pappas sit-ups</h1>
    <p class="page-subtitle">
      57 dagar — 60 situps om dagen, 18 oktober till 13 december 2026.
    </p>

    <ReadState
      v-if="loading || loadError"
      :state="loading ? 'loading' : 'failed'"
      heading="Utmaningen kunde inte laddas"
      message="Vi nådde inte servern. Det är oftast tillfälligt."
      loading-label="Laddar"
      retry-label="Försök igen"
      skeleton="row"
      :rows="6"
      :columns="3"
      @retry="fetchAll"
    />

    <template v-else>
      <transition name="toast">
        <div v-if="activeToast" class="milestone-toast">{{ activeToast }}</div>
      </transition>

      <div class="chart-card">
        <h3>Sit-ups</h3>
        <!-- data-line-totals mirrors LINES, the one source of the chart's three
             reference datasets, so e2e can assert them without a canvas read. -->
        <div class="chart-wrap" :data-line-totals="lineTotals">
          <canvas ref="chartCanvas"></canvas>
        </div>
        <div class="chart-meta">
          <span>{{ cumulativeTotal }} av {{ target }} situps</span>
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
                  <!-- @change still receives the native event: AspInput binds
                       $attrs onto the inner <input>, so `event.target` is the
                       real control and onCountChange's write-back on invalid
                       input (`event.target.value = row.count`) still lands. -->
                  <div class="count-field">
                    <AspInput
                      type="number"
                      min="0"
                      step="1"
                      :model-value="row.count ?? ''"
                      :disabled="!row.editable || savingDates.has(row.date)"
                      @change="onCountChange(row, $event)"
                      :aria-label="`Antal situps för ${row.dateLabel}`"
                    />
                  </div>
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
  import { AspInput } from '@aspirant/design-system';
  import axios from 'axios';
  import { markRaw } from 'vue';
  import ReadState from '../../../components/ReadState.vue';
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
  import { seriesColor, tokenColor } from '../../../composables/chartSeries.js';

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

  // Three fixed cumulative-total lines (system_3 #7992 c49533): 60 sit-ups a
  // day over the 57-day window 2026-10-18..2026-12-13 is 3420, split into
  // thirds. Same fixed-total model as the pushups lines (#2848), so each line is
  // a horizontal at its total; at 60/day they fall on 5 nov, 24 nov and 13 dec.
  const PER_DAY = 60;
  const CHALLENGE_DAYS = 57;
  const TARGET = PER_DAY * CHALLENGE_DAYS; // 3420
  const LINES = [
    { total: 1140, label: '1140', message: '1140 — första linjen! En tredjedel klar.' },
    { total: 2280, label: '2280', message: '2280 — andra linjen! Två tredjedelar klara.' },
    { total: TARGET, label: `Mål (${TARGET})`, message: `${TARGET} — Mål! 60 om dagen hela vägen.` },
  ];
  const LINE_SERIES = [10, 5, 4]; // the pushups line colours, in the same order
  const EDIT_WINDOW_DAYS = 2;

  // Crowns past the goal (#7994 c49539): one above 3420, then one more per 300.
  // Pushups crowns every 100 on a 1000 goal (10%); 300 is ~9% of 3420, five
  // days at 60/day. Exactly 3420 shows the goal message instead, as pushups
  // shows its goal message at exactly 1000.
  const CROWN_STEP = 300;

  function crownCount(running) {
    if (running <= TARGET) return 0;
    return 1 + Math.floor((running - TARGET) / CROWN_STEP);
  }

  // The highest line a day's total crossed (prev < line <= running), or null.
  // Pushups matched exact totals against ~100 seeded messages; at 60 a day an
  // exact hit is rare and there is no server table here, so crossings count.
  function lineCrossed(prev, running) {
    let hit = null;
    for (const line of LINES) {
      if (prev < line.total && line.total <= running) hit = line;
    }
    return hit;
  }

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
    name: 'PappasSitups',
    components: { AspInput, ReadState },
    data() {
      return {
        target: TARGET,
        entries: [],
        loading: true,
        loadError: false,
        savingDates: new Set(),
        errorDates: new Set(),
        activeToast: null,
        toastTimer: null,
        chart: null,
      };
    },
    computed: {
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
          const isPastOrToday = diff <= 0;
          if (count === null || count === undefined) {
            if (isPastOrToday) message = 'vilodag?';
          } else if (count === 0) {
            cumulative = running;
            message = 'vilodag?';
          } else {
            const prev = running;
            running += count;
            cumulative = running;
            const crossed = lineCrossed(prev, running);
            if (running > TARGET) {
              message = '👑'.repeat(crownCount(running));
            } else if (crossed) {
              message = crossed.message;
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
      lineTotals() {
        return LINES.map((line) => line.total).join(',');
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
          const entriesResp = await axios.get('/api/situps/entries');
          this.entries = entriesResp.data.entries || [];
        } catch (err) {
          // The transport detail goes to the console; the page says it in
          // Swedish, like every other word on it (#5303).
          console.error('Situps: kunde inte hämta data', err);
          this.loadError = true;
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
          const resp = await axios.patch(`/api/situps/entries/${row.date}`, { count: parsed });
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
          // A per-row save failure is a toast, not a read state — the page is
          // fine and one cell did not save. Keep the SERVER's message when it
          // sent one (that is product prose from the API) and drop the axios
          // fallback, which is the only part that leaked (#5303).
          const msg = err.response?.data?.error?.message;
          this.flashToast(msg ? `Kunde inte spara: ${msg}` : 'Kunde inte spara. Försök igen.');
        } finally {
          this.savingDates.delete(row.date);
        }
      },
      maybeFireMilestoneToast(prevCumulative) {
        const current = this.cumulativeTotal;
        if (current <= prevCumulative) return;
        const crossed = lineCrossed(prevCumulative, current);
        if (crossed) this.flashToast(crossed.message);
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
        const lineData = LINES.map((line) => labels.map(() => line.total));

        if (this.chart) {
          this.chart.data.labels = labels;
          this.chart.data.datasets[0].data = cumulative;
          lineData.forEach((data, i) => {
            this.chart.data.datasets[i + 1].data = data;
          });
          this.chart.update();
          return;
        }

        // markRaw: Options-API data() would wrap the Chart.js instance in a deep
        // reactive Proxy, and the post-save chart.update() then stalls WebKit's
        // main thread -- the page stopped responding after every save under
        // mobile-safari (system_3 #7996). Chart.js state must never be reactive.
        this.chart = markRaw(new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Kumulativ',
                data: cumulative,
                borderColor: seriesColor(canvas, 1),
                backgroundColor: seriesColor(canvas, 1, { alpha: 0.15 }),
                fill: true,
                tension: 0.15,
                pointRadius: 2,
              },
              ...LINES.map((line, i) => ({
                label: line.label,
                data: lineData[i],
                borderColor: seriesColor(canvas, LINE_SERIES[i]),
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
              })),
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              // suggestedMax, not a hard max: a total past the goal stays on the
              // chart instead of clipping at the top line (pushups pins its roof).
              y: { beginAtZero: true, suggestedMax: TARGET },
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: tokenColor('--text-on-dark', '#e4e4e4') },
              },
              tooltip: { mode: 'index', intersect: false },
            },
          },
        }));
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
  /* --surface-card is dark in BOTH themes, so the card sets its own ink
     (§3.18: ink follows the setter, not the theme). Without it the cards
     inherit .pappas-view's --text-on-light, and every --text-muted label on
     them (a currentColor mix) went dark-on-dark in the light theme — the
     pushups page this was copied from still does. */
  color: var(--text-on-dark);
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
  height: 560px;
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
  /* At phone width the four-column table is wider than the card (80px at
     390px, measured on #7994; the pushups page has the same overflow). Let the
     table scroll inside its week instead of scrolling the whole page sideways. */
  overflow-x: auto;
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

/* Width, flow and the numeric alignment stay ours; the fill, border, ink,
   focus ring and disabled treatment are the component's now. The three rules
   this replaces existed to hand-build what AspInput already ships — including
   the `-webkit-text-fill-color: #fff` override on a locked row, which was there
   only because a browser greys out a disabled <input>'s text and the old
   translucent fill left nothing behind it. `inline-block`, because AspInput's
   root is a block-level flex column and the saving/error pill is its sibling
   inside the same cell. */
.count-field {
  display: inline-block;
  /* 5em, but 5em of WHAT: the old rule sat on the <input>, which set its own
     --text-base font-size, so the em resolved against that. On the wrapper the
     em would resolve against the cell's smaller font and the field would come
     out at 54px instead of 80px. Restating the font-size here keeps the column
     width identical across the swap. */
  font-size: var(--text-base);
  width: 5em;
  vertical-align: middle;
}

.count-field :deep(.field__input) {
  text-align: right;
  font-weight: 700;
  font-size: var(--text-base);
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
    height: 440px;
  }
}
</style>
