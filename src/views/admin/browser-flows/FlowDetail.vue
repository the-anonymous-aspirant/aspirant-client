<template>
  <div class="flow-detail-view" data-test="flow-detail-view">
    <div class="header">
      <router-link to="/admin/browser-flows" class="back-link" data-test="back-to-matrix">
        ← all flows
      </router-link>
      <h1 v-if="flow" data-test="flow-name">{{ flow.name }}</h1>
      <h1 v-else>Flow</h1>
    </div>

    <p v-if="loadError" class="load-error" data-test="flow-detail-error">{{ loadError }}</p>
    <div v-else-if="loading" class="loading" data-test="flow-detail-loading">Laddar…</div>

    <template v-else-if="flow">
      <div class="kpis" data-test="flow-detail-kpis">
        <div class="kpi-card" data-test="kpi-success-rate">
          <div class="kpi-label">Success rate</div>
          <div class="kpi-value">{{ formatPercent(health?.success_rate) }}</div>
          <div class="kpi-note">last {{ health?.window ?? '?' }} runs</div>
        </div>
        <div class="kpi-card" data-test="kpi-avg-duration">
          <div class="kpi-label">Avg duration</div>
          <div class="kpi-value">{{ formatDuration(health?.avg_duration_ms) }}</div>
          <div class="kpi-note">completed runs only</div>
        </div>
        <div class="kpi-card" data-test="kpi-total-runs">
          <div class="kpi-label">Total runs</div>
          <div class="kpi-value">{{ health?.total_runs ?? 0 }}</div>
          <div class="kpi-note">all time</div>
        </div>
        <div class="kpi-card" data-test="kpi-last-failure">
          <div class="kpi-label">Last failure</div>
          <div v-if="health?.last_failure" class="kpi-value kpi-value-small">
            <router-link
              :to="`/admin/browser-flows/${flowId}/runs/${health.last_failure.id}`"
              data-test="last-failure-link"
            >{{ health.last_failure.status }}</router-link>
          </div>
          <div v-else class="kpi-value kpi-value-small kpi-value-muted">none in window</div>
          <div class="kpi-note">{{ health?.last_failure ? formatRelative(health.last_failure.started_at) : '' }}</div>
        </div>
      </div>

      <section class="sparkline-section" data-test="rows-returned-sparkline-section">
        <h2>Rows returned (last {{ health?.window ?? 0 }} runs)</h2>
        <canvas
          v-if="sparklineData.length"
          ref="sparklineCanvas"
          class="sparkline-canvas"
          data-test="rows-returned-sparkline"
          aria-label="rows returned per run"
        ></canvas>
        <div v-else class="empty-inline" data-test="rows-returned-empty">
          No runs to plot yet.
        </div>
      </section>

      <section class="schema-section" data-test="flow-schemas">
        <div class="schema-block">
          <h2>Input schema</h2>
          <pre class="schema-json" data-test="input-schema">{{ formatJson(flow.input_schema) }}</pre>
        </div>
        <div class="schema-block">
          <h2>Output schema</h2>
          <pre class="schema-json" data-test="output-schema">{{ formatJson(flow.output_schema) }}</pre>
        </div>
      </section>

      <section class="runs-section" data-test="runs-section">
        <h2>Run history</h2>
        <div v-if="runsLoadError" class="load-error" data-test="runs-error">{{ runsLoadError }}</div>
        <div v-else-if="!runs.length" class="empty-inline" data-test="runs-empty">
          No runs yet.
        </div>
        <table v-else class="runs-table" data-test="runs-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Rows</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="run in runs"
              :key="run.id"
              :data-test="`run-row-${run.id}`"
            >
              <td>{{ formatDate(run.started_at) }}</td>
              <td>
                <span :class="['status-pill', `status-${statusClass(run.status)}`]">
                  {{ run.status }}
                </span>
              </td>
              <td>{{ formatDuration(runDurationMs(run)) }}</td>
              <td>{{ run.output_rows_count ?? 0 }}</td>
              <td>
                <router-link
                  :to="`/admin/browser-flows/${flowId}/runs/${run.id}`"
                  :data-test="`run-link-${run.id}`"
                >open →</router-link>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="totalRuns > runsPerPage" class="pagination" data-test="runs-pagination">
          <button
            type="button"
            :disabled="offset === 0 || runsLoading"
            data-test="runs-prev"
            @click="prevPage"
          >‹ Newer</button>
          <span class="page-indicator" data-test="runs-page-indicator">
            {{ offset + 1 }}–{{ Math.min(offset + runsPerPage, totalRuns) }} of {{ totalRuns }}
          </span>
          <button
            type="button"
            :disabled="offset + runsPerPage >= totalRuns || runsLoading"
            data-test="runs-next"
            @click="nextPage"
          >Older ›</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
  import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from 'chart.js';
  import { useBrowserFlows } from '../../../composables/useBrowserFlows.js';

  Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

  const RUNS_PER_PAGE = 25;
  const HEALTH_WINDOW = 20;
  const KNOWN_STATUSES = new Set([
    'success',
    'running',
    'blocked',
    'failed',
    'cancelled',
  ]);

  export default {
    name: 'FlowDetail',
    data() {
      return {
        flow: null,
        health: null,
        runs: [],
        totalRuns: 0,
        offset: 0,
        runsPerPage: RUNS_PER_PAGE,
        loading: false,
        loadError: null,
        runsLoading: false,
        runsLoadError: null,
        chart: null,
      };
    },
    computed: {
      flowId() {
        return this.$route.params.id;
      },
      sparklineData() {
        return this.health?.rows_returned_trend || [];
      },
    },
    watch: {
      flowId: {
        immediate: true,
        handler(id) {
          if (id) this.loadAll();
        },
      },
      sparklineData() {
        this.$nextTick(() => this.renderSparkline());
      },
    },
    beforeUnmount() {
      if (this.chart) this.chart.destroy();
    },
    methods: {
      statusClass(status) {
        return KNOWN_STATUSES.has(status) ? status : 'unknown';
      },
      formatPercent(v) {
        if (v === undefined || v === null) return '—';
        return `${Math.round(v * 100)}%`;
      },
      formatDuration(ms) {
        if (ms === undefined || ms === null) return '—';
        if (ms < 1000) return `${Math.round(ms)} ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
        const mins = Math.floor(ms / 60_000);
        const secs = Math.round((ms % 60_000) / 1000);
        return `${mins}m ${secs}s`;
      },
      formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toISOString().replace('T', ' ').slice(0, 19);
      },
      formatRelative(iso) {
        if (!iso) return '';
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return iso;
        const mins = Math.round((Date.now() - then) / 60_000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.round(hours / 24);
        return `${days}d ago`;
      },
      formatJson(obj) {
        if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) return '(empty)';
        try {
          return JSON.stringify(obj, null, 2);
        } catch (err) {
          return String(obj);
        }
      },
      runDurationMs(run) {
        if (!run.started_at || !run.completed_at) return null;
        const start = new Date(run.started_at).getTime();
        const end = new Date(run.completed_at).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) return null;
        return end - start;
      },
      async loadAll() {
        this.loading = true;
        this.loadError = null;
        const { listFlows, getFlowHealth } = useBrowserFlows();
        const { flows, error } = await listFlows();
        if (error) {
          this.loadError = error;
          this.loading = false;
          return;
        }
        this.flow = flows.find((f) => f.id === this.flowId) || null;
        if (!this.flow) {
          this.loadError = 'flow not found';
          this.loading = false;
          return;
        }
        const [{ health, error: healthErr }] = await Promise.all([
          getFlowHealth(this.flowId, { window: HEALTH_WINDOW }),
          this.loadRuns(),
        ]);
        if (healthErr) {
          this.loadError = healthErr;
        }
        this.health = health;
        this.loading = false;
      },
      async loadRuns() {
        this.runsLoading = true;
        this.runsLoadError = null;
        const { listRuns } = useBrowserFlows();
        const { runs, total, error } = await listRuns(this.flowId, {
          limit: this.runsPerPage,
          offset: this.offset,
        });
        if (error) {
          this.runsLoadError = error;
          this.runs = [];
          this.totalRuns = 0;
        } else {
          this.runs = runs;
          this.totalRuns = total;
        }
        this.runsLoading = false;
      },
      async prevPage() {
        if (this.offset === 0) return;
        this.offset = Math.max(0, this.offset - this.runsPerPage);
        await this.loadRuns();
      },
      async nextPage() {
        if (this.offset + this.runsPerPage >= this.totalRuns) return;
        this.offset += this.runsPerPage;
        await this.loadRuns();
      },
      renderSparkline() {
        if (!this.$refs.sparklineCanvas || !this.sparklineData.length) return;
        if (this.chart) this.chart.destroy();
        this.chart = new Chart(this.$refs.sparklineCanvas, {
          type: 'line',
          data: {
            labels: this.sparklineData.map((_, i) => String(i + 1)),
            datasets: [
              {
                data: this.sparklineData,
                borderColor: 'rgba(46, 125, 50, 1)',
                backgroundColor: 'rgba(46, 125, 50, 0.15)',
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 4,
                fill: true,
                tension: 0.25,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { intersect: false },
            },
            scales: {
              x: { display: false },
              y: { beginAtZero: true, ticks: { precision: 0 } },
            },
          },
        });
      },
    },
  };
</script>

<style scoped>
  .flow-detail-view {
    padding: 1.5rem;
  }
  .header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .back-link {
    color: var(--brand-primary, #ffb300);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .back-link:hover {
    text-decoration: underline;
  }
  h1 {
    margin: 0;
    color: var(--brand-primary, #ffb300);
    font-size: 1.6rem;
    font-weight: 600;
  }
  h2 {
    color: var(--brand-primary, #ffb300);
    font-size: 1rem;
    font-weight: 600;
    margin: 1.5rem 0 0.5rem;
  }
  .load-error {
    color: var(--feedback-error, #ff3739);
    font-weight: 600;
  }
  .loading,
  .empty-inline {
    color: var(--text-muted, #6c757d);
    font-style: italic;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .kpi-card {
    background: var(--surface-card, #ffffff);
    border: 1px solid var(--brand-primary, #ffb300);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .kpi-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #6c757d);
  }
  .kpi-value {
    font-size: 1.8rem;
    font-weight: 700;
    color: #ffffff;
    margin: 0.25rem 0;
  }
  .kpi-value-small {
    font-size: 1rem;
    font-weight: 600;
  }
  .kpi-value-muted {
    color: var(--text-muted, #6c757d);
    font-style: italic;
  }
  .kpi-value a {
    color: var(--brand-primary, #ffb300);
    text-decoration: none;
  }
  .kpi-value a:hover {
    text-decoration: underline;
  }
  .kpi-note {
    font-size: 0.75rem;
    color: var(--text-muted, #6c757d);
  }

  .sparkline-section {
    background: var(--surface-card, #ffffff);
    border: 1px solid var(--brand-primary, #ffb300);
    border-radius: 8px;
    padding: 1rem;
  }
  .sparkline-canvas {
    max-height: 140px;
  }

  .schema-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .schema-block {
    background: var(--surface-card, #ffffff);
    border: 1px solid var(--brand-primary, #ffb300);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    overflow-x: auto;
  }
  .schema-json {
    margin: 0;
    font-size: 0.8rem;
    color: #ffffff;
    white-space: pre;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .runs-section {
    margin-top: 1rem;
    background: var(--surface-card, #ffffff);
    border: 1px solid var(--brand-primary, #ffb300);
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
  }
  .runs-table {
    width: 100%;
    border-collapse: collapse;
  }
  .runs-table th,
  .runs-table td {
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 179, 0, 0.15);
    color: #ffffff;
  }
  .runs-table th {
    font-weight: 600;
    color: #ffffff;
    font-size: 0.85rem;
  }
  .status-pill {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    color: #ffffff;
    text-transform: lowercase;
  }
  .status-success { background: #2e7d32; }
  .status-running { background: #f9a825; color: #424242; }
  .status-blocked { background: #ad1457; }
  .status-failed { background: #c62828; }
  .status-cancelled { background: #5e35b1; }
  .status-unknown { background: #9e9e9e; }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
  }
  .pagination button {
    background: none;
    border: 1px solid var(--brand-primary, #ffb300);
    color: var(--brand-primary, #ffb300);
    padding: 0.25rem 0.7rem;
    border-radius: 4px;
    font-family: inherit;
    cursor: pointer;
  }
  .pagination button[disabled] {
    color: #9e9e9e;
    border-color: #9e9e9e;
    cursor: not-allowed;
  }
  .page-indicator {
    color: var(--text-muted, #6c757d);
    font-size: 0.9rem;
  }
</style>
