<template>
  <div v-if="legacy" class="browser-flows-frame" data-test="browser-flows-legacy">
    <iframe
      :src="iframeSrc"
      title="Browser Flows (legacy)"
      class="browser-flows-iframe"
    ></iframe>
  </div>

  <div v-else class="browser-flows-view" data-test="browser-flows-view">
    <h1>Browser Flows</h1>
    <p class="meta">
      Rows = registered flows. Columns = last {{ maxRuns }} runs, oldest left, newest right.
      Click a cell for the run detail.
    </p>

    <p v-if="loadError" class="load-error" data-test="browser-flows-error">{{ loadError }}</p>

    <div v-else-if="loading" class="loading" data-test="browser-flows-loading">Laddar…</div>

    <div
      v-else-if="!rows.length"
      class="empty-state"
      data-test="browser-flows-empty"
    >
      No flows registered yet. POST one to <code>/api/browser-flows</code> to get started.
    </div>

    <div v-else class="matrix-card" data-test="browser-flows-matrix">
      <table>
        <thead>
          <tr>
            <th class="flow-col">Flow</th>
            <th class="grid-head">Last {{ maxRuns }} runs →</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.flow.id"
            :data-test="`flow-row-${row.flow.id}`"
          >
            <td class="flow-col">
              <div class="flow-name">
                <router-link :to="`/admin/browser-flows/${row.flow.id}`">
                  {{ row.flow.name }}
                </router-link>
              </div>
            </td>
            <td>
              <div class="grid">
                <span
                  v-for="n in row.emptyCells"
                  :key="`empty-${row.flow.id}-${n}`"
                  class="cell cell-empty"
                  title="(no run)"
                ></span>
                <router-link
                  v-for="run in row.runs"
                  :key="run.id"
                  :class="['cell', `cell-${cellStatus(run.status)}`]"
                  :to="`/admin/browser-flows/${row.flow.id}/runs/${run.id}`"
                  :title="`${run.status} — ${run.started_at} — ${run.output_rows_count} row(s)`"
                  :data-test="`cell-${row.flow.id}-${run.id}`"
                ></router-link>
              </div>
            </td>
            <td>
              <div class="row-actions">
                <button
                  class="btn"
                  type="button"
                  :disabled="!row.flow.enabled || acting.has(row.flow.id)"
                  :title="row.flow.enabled ? 'trigger this flow' : 'flow disabled'"
                  :data-test="`trigger-${row.flow.id}`"
                  @click="onTrigger(row.flow.id)"
                >
                  ▶ Start
                </button>
                <button
                  v-if="row.latestRun && row.latestRun.status === 'running'"
                  class="btn btn-cancel"
                  type="button"
                  :disabled="acting.has(row.flow.id)"
                  title="signal the driver to stop"
                  :data-test="`cancel-${row.flow.id}`"
                  @click="onCancel(row.flow.id, row.latestRun.id)"
                >
                  ✕ Cancel
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="legend" data-test="browser-flows-legend">
      <span><span class="swatch cell-success"></span>success</span>
      <span><span class="swatch cell-running"></span>running</span>
      <span><span class="swatch cell-blocked"></span>blocked</span>
      <span><span class="swatch cell-failed"></span>failed</span>
      <span><span class="swatch cell-cancelled"></span>cancelled</span>
      <span><span class="swatch cell-empty"></span>no run</span>
    </div>
  </div>
</template>

<script>
  import { useBrowserFlows } from '../../composables/useBrowserFlows.js';

  const MAX_RUNS = 20;
  const KNOWN_STATUSES = new Set([
    'success',
    'running',
    'blocked',
    'failed',
    'cancelled',
  ]);

  export default {
    name: 'BrowserFlows',
    data() {
      return {
        flows: [],
        runsByFlow: {},
        loading: false,
        loadError: null,
        acting: new Set(),
        maxRuns: MAX_RUNS,
      };
    },
    computed: {
      legacy() {
        return this.$route.query.legacy === '1';
      },
      iframeSrc() {
        return '/browser-flows';
      },
      rows() {
        return this.flows.map((flow) => {
          const runs = this.runsByFlow[flow.id] || [];
          const oldestFirst = runs.slice().reverse();
          return {
            flow,
            runs: oldestFirst,
            emptyCells: Math.max(0, this.maxRuns - runs.length),
            latestRun: runs.length ? runs[0] : null,
          };
        });
      },
    },
    watch: {
      legacy: {
        immediate: true,
        handler(isLegacy) {
          if (!isLegacy) this.fetchAll();
        },
      },
    },
    methods: {
      cellStatus(status) {
        return KNOWN_STATUSES.has(status) ? status : 'unknown';
      },
      async fetchAll() {
        this.loading = true;
        this.loadError = null;
        const { listFlows, listRuns } = useBrowserFlows();
        const { flows, error } = await listFlows();
        if (error) {
          this.loadError = error;
          this.flows = [];
          this.runsByFlow = {};
          this.loading = false;
          return;
        }
        this.flows = flows;
        const runsByFlow = {};
        await Promise.all(
          flows.map(async (flow) => {
            const { runs, error: runsError } = await listRuns(flow.id, {
              limit: this.maxRuns,
            });
            if (runsError) {
              this.loadError = runsError;
              runsByFlow[flow.id] = [];
              return;
            }
            runsByFlow[flow.id] = runs;
          }),
        );
        this.runsByFlow = runsByFlow;
        this.loading = false;
      },
      async onTrigger(flowId) {
        if (this.acting.has(flowId)) return;
        this.acting.add(flowId);
        try {
          const { triggerRun } = useBrowserFlows();
          const { error } = await triggerRun(flowId);
          if (error) {
            this.loadError = error;
            return;
          }
          await this.fetchAll();
        } finally {
          this.acting.delete(flowId);
        }
      },
      async onCancel(flowId, runId) {
        if (this.acting.has(flowId)) return;
        this.acting.add(flowId);
        try {
          const { cancelRun } = useBrowserFlows();
          const { error } = await cancelRun(flowId, runId);
          if (error) {
            this.loadError = error;
            return;
          }
          await this.fetchAll();
        } finally {
          this.acting.delete(flowId);
        }
      },
    },
  };
</script>

<style scoped>
  .browser-flows-view {
    padding: 1.5rem;
    max-width: 100%;
  }
  h1 {
    margin: 0 0 0.25rem;
    color: var(--brand-primary);
    font-size: 1.8rem;
    font-weight: 600;
  }
  .meta {
    color: var(--text-muted, #6c757d);
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
  }
  .load-error {
    color: var(--feedback-error, #ff3739);
    font-weight: 600;
  }
  .loading {
    color: var(--text-muted, #6c757d);
    font-style: italic;
  }
  .empty-state {
    color: var(--text-muted, #6c757d);
    font-style: italic;
    padding: 2rem 0;
  }
  .matrix-card {
    background: var(--surface-card, #ffffff);
    border: 1px solid var(--brand-primary, #ffb300);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 0.5rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid #cccccc;
    vertical-align: middle;
  }
  th {
    font-weight: 600;
    color: #424242;
  }
  th.flow-col {
    min-width: 14rem;
  }
  th.grid-head {
    text-align: center;
    font-weight: normal;
    color: var(--text-muted, #6c757d);
    font-size: 0.75rem;
  }
  th.actions-col {
    width: 11rem;
    text-align: right;
  }
  .flow-name {
    font-weight: 600;
  }
  .flow-name a {
    color: var(--brand-primary, #ffb300);
    text-decoration: none;
  }
  .flow-name a:hover {
    text-decoration: underline;
  }
  .grid {
    display: flex;
    gap: 2px;
    align-items: center;
    flex-wrap: nowrap;
  }
  .cell {
    display: inline-block;
    width: 1.1rem;
    height: 1.6rem;
    border-radius: 2px;
    text-decoration: none;
    transition: transform 0.05s ease-in-out;
    flex-shrink: 0;
  }
  .cell:hover {
    transform: scale(1.15);
    outline: 1px solid #444;
  }
  .cell-empty {
    background: #f0f0f0;
    cursor: default;
    pointer-events: none;
  }
  .cell-success { background: #2e7d32; }
  .cell-running { background: #f9a825; }
  .cell-blocked { background: #ad1457; }
  .cell-failed { background: #c62828; }
  .cell-unknown { background: #9e9e9e; }
  .cell-cancelled { background: #5e35b1; }
  .row-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
    align-items: center;
  }
  .btn {
    background: none;
    border: 1px solid var(--brand-primary, #ffb300);
    color: var(--brand-primary, #ffb300);
    padding: 0.25rem 0.7rem;
    font-size: 0.78rem;
    font-family: inherit;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .btn:hover {
    background: var(--brand-primary, #ffb300);
    color: #ffffff;
  }
  .btn[disabled] {
    color: #9e9e9e;
    border-color: #9e9e9e;
    cursor: not-allowed;
    background: none;
  }
  .btn-cancel {
    border-color: var(--feedback-error, #ff3739);
    color: var(--feedback-error, #ff3739);
  }
  .btn-cancel:hover {
    background: var(--feedback-error, #ff3739);
    color: #ffffff;
  }
  .legend {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--text-muted, #6c757d);
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .legend .swatch {
    display: inline-block;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 2px;
    margin-right: 0.25rem;
    vertical-align: middle;
  }

  .browser-flows-frame {
    height: 100vh;
    width: 100%;
    display: flex;
  }
  .browser-flows-iframe {
    flex: 1;
    border: 0;
    width: 100%;
    height: 100%;
  }
</style>
