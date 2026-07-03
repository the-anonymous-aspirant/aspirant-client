<template>
  <div class="run-forensic-view" data-test="run-forensic-view">
    <div class="crumb" data-test="run-forensic-crumb">
      <router-link to="/admin/browser-flows">all flows</router-link>
      <span class="crumb-sep">/</span>
      <router-link :to="`/admin/browser-flows/${flowId}`" data-test="crumb-flow">
        {{ flow ? flow.name : flowId }}
      </router-link>
      <span class="crumb-sep">/</span>
      <span data-test="crumb-run">run {{ runId }}</span>
    </div>

    <h1 v-if="run" data-test="run-header">
      Run
      <span :class="['status-pill', `status-${statusClass(run.status)}`]" data-test="run-status">
        {{ run.status }}
      </span>
      <button
        v-if="run.status === 'running'"
        type="button"
        class="btn btn-cancel"
        data-test="run-cancel"
        :disabled="cancelling"
        @click="onCancel"
      >✕ Cancel</button>
    </h1>
    <h1 v-else data-test="run-header">Run</h1>

    <p v-if="loadError" class="load-error" data-test="run-forensic-error">{{ loadError }}</p>
    <div v-else-if="loading" class="loading" data-test="run-forensic-loading">Laddar…</div>

    <template v-else-if="run">
      <div class="meta" data-test="run-meta">
        <div class="meta-cell">
          <span class="meta-label">Started</span>
          <div class="meta-value">{{ run.started_at }}</div>
        </div>
        <div class="meta-cell">
          <span class="meta-label">Finished</span>
          <div class="meta-value">{{ run.completed_at || '—' }}</div>
        </div>
        <div class="meta-cell">
          <span class="meta-label">Duration</span>
          <div class="meta-value">{{ formatDuration(durationMs) }}</div>
        </div>
        <div class="meta-cell" data-test="meta-rows">
          <span class="meta-label">Rows extracted</span>
          <div class="meta-value">{{ run.output_rows_count ?? 0 }}</div>
        </div>
        <div v-if="run.proxy_used" class="meta-cell">
          <span class="meta-label">Proxy</span>
          <div class="meta-value">{{ run.proxy_used }}</div>
        </div>
        <div v-if="run.location_used" class="meta-cell">
          <span class="meta-label">Location</span>
          <div class="meta-value">{{ run.location_used }}</div>
        </div>
        <div v-if="run.user_agent_used" class="meta-cell meta-cell-wide">
          <span class="meta-label">User-agent</span>
          <div class="meta-value meta-value-small">{{ run.user_agent_used }}</div>
        </div>
      </div>

      <section v-if="run.errors && run.errors.length" data-test="run-errors">
        <h2>Run-level errors</h2>
        <pre class="pre-block">{{ formatJson(run.errors) }}</pre>
      </section>

      <section data-test="outputs-section">
        <h2>Extracted output ({{ run.outputs.length }} row{{ run.outputs.length === 1 ? '' : 's' }})</h2>
        <div v-if="!run.outputs.length" class="empty-state" data-test="outputs-empty">
          No output rows recorded for this run.
        </div>
        <div
          v-for="(output, idx) in run.outputs"
          v-else
          :key="output.id"
          class="output-block"
          :data-test="`output-row-${idx}`"
        >
          <div class="output-head">row #{{ idx + 1 }} — scraped {{ output.scraped_at }}</div>
          <pre class="pre-block">{{ formatJson(output.row_data) }}</pre>
        </div>
      </section>

      <section data-test="trace-section">
        <h2>Per-action trace ({{ sortedActions.length }} step{{ sortedActions.length === 1 ? '' : 's' }})</h2>
        <div v-if="!sortedActions.length" class="empty-state" data-test="trace-empty">
          No action rows recorded for this run yet.
        </div>
        <div
          v-for="action in sortedActions"
          v-else
          :key="action.id"
          :class="['step', { 'step-failed': isFailed(action) }]"
          :data-test="`step-${action.step_order}`"
        >
          <div class="step-head">
            <span class="step-order">#{{ action.step_order }}</span>
            <span :class="['status-pill', `status-${stepStatusClass(action)}`]" :data-test="`step-status-${action.step_order}`">
              {{ stepStatusLabel(action) }}
            </span>
            <span class="step-action">{{ action.action_type }}</span>
            <span v-if="action.selector" class="step-selector">{{ action.selector }}</span>
            <span class="step-duration">
              {{ action.duration_ms !== null && action.duration_ms !== undefined ? `${action.duration_ms} ms` : '—' }}
            </span>
          </div>

          <div class="thumbs" :data-test="`thumbs-${action.step_order}`">
            <a
              v-for="when in ['before', 'after']"
              :key="when"
              class="thumb"
              :href="assetUrl(action.step_order, `screenshot_${when}.png`)"
              target="_blank"
              rel="noopener"
              :data-test="`screenshot-${when}-${action.step_order}`"
            >
              <img
                :src="assetUrl(action.step_order, `screenshot_${when}.png`)"
                :alt="`screenshot ${when} step ${action.step_order}`"
                loading="lazy"
                @error="onThumbError"
              >
              <span>screenshot {{ when }}</span>
            </a>
          </div>

          <p v-if="action.error" class="error-msg" :data-test="`step-error-${action.step_order}`">
            {{ action.error }}
          </p>

          <div class="asset-links" :data-test="`assets-${action.step_order}`">
            <a
              v-for="asset in TRACE_ASSETS"
              :key="asset"
              :href="assetUrl(action.step_order, asset)"
              target="_blank"
              rel="noopener"
              class="asset-link"
              :data-test="`asset-link-${action.step_order}-${asset}`"
            >{{ asset }}</a>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
  import { useBrowserFlows } from '../../../composables/useBrowserFlows.js';

  const KNOWN_STATUSES = new Set([
    'success',
    'running',
    'blocked',
    'failed',
    'cancelled',
  ]);

  const TRACE_ASSETS = Object.freeze([
    'screenshot_before.png',
    'screenshot_after.png',
    'dom_before.html',
    'dom_after.html',
    'stdout.txt',
    'stderr.txt',
    'har.json',
    'step.json',
  ]);

  export default {
    name: 'RunForensic',
    data() {
      return {
        flow: null,
        run: null,
        loading: false,
        loadError: null,
        cancelling: false,
        TRACE_ASSETS,
      };
    },
    computed: {
      flowId() {
        return this.$route.params.id;
      },
      runId() {
        return this.$route.params.run_id;
      },
      durationMs() {
        if (!this.run || !this.run.completed_at) return null;
        const start = new Date(this.run.started_at).getTime();
        const end = new Date(this.run.completed_at).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) return null;
        return end - start;
      },
      sortedActions() {
        if (!this.run || !this.run.actions) return [];
        return [...this.run.actions].sort((a, b) => a.step_order - b.step_order);
      },
    },
    watch: {
      $route: {
        immediate: true,
        handler(to, from) {
          const nextFlowId = to.params.id;
          const nextRunId = to.params.run_id;
          if (!nextFlowId || !nextRunId) return;
          if (
            from &&
            from.params.id === nextFlowId &&
            from.params.run_id === nextRunId
          ) {
            return;
          }
          this.loadAll();
        },
      },
    },
    methods: {
      statusClass(status) {
        return KNOWN_STATUSES.has(status) ? status : 'unknown';
      },
      stepStatusClass(action) {
        if (action.succeeded) return 'success';
        return action.error ? 'failed' : 'skipped';
      },
      stepStatusLabel(action) {
        if (action.succeeded) return 'ok';
        return action.error ? 'failed' : 'skipped';
      },
      isFailed(action) {
        return !action.succeeded && Boolean(action.error);
      },
      assetUrl(stepOrder, asset) {
        return `/browser-flows/${this.flowId}/runs/${this.runId}/steps/${stepOrder}/${asset}`;
      },
      formatDuration(ms) {
        if (ms === undefined || ms === null) return '—';
        if (ms < 1000) return `${Math.round(ms)} ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
        const mins = Math.floor(ms / 60_000);
        const secs = Math.round((ms % 60_000) / 1000);
        return `${mins}m ${secs}s`;
      },
      formatJson(obj) {
        if (obj === null || obj === undefined) return '';
        try {
          return JSON.stringify(obj, null, 2);
        } catch (err) {
          return String(obj);
        }
      },
      async loadAll() {
        this.loading = true;
        this.loadError = null;
        const { listFlows, getRunDetail } = useBrowserFlows();
        const [{ flows, error: flowsError }, { run, error: runError }] = await Promise.all([
          listFlows(),
          getRunDetail(this.flowId, this.runId),
        ]);
        if (flowsError) {
          this.loadError = flowsError;
          this.loading = false;
          return;
        }
        if (runError) {
          this.loadError = runError;
          this.loading = false;
          return;
        }
        this.flow = flows.find((f) => f.id === this.flowId) || null;
        this.run = run;
        this.loading = false;
      },
      async onCancel() {
        if (this.cancelling) return;
        this.cancelling = true;
        try {
          const { cancelRun } = useBrowserFlows();
          const { error } = await cancelRun(this.flowId, this.runId);
          if (error) {
            this.loadError = error;
            return;
          }
          await this.loadAll();
        } finally {
          this.cancelling = false;
        }
      },
      onThumbError(event) {
        const img = event.target;
        img.style.visibility = 'hidden';
        const wrapper = img.parentElement;
        if (!wrapper || wrapper.querySelector('.thumb-missing')) return;
        const placeholder = document.createElement('div');
        placeholder.className = 'thumb-missing';
        placeholder.textContent = 'no screenshot';
        wrapper.insertBefore(placeholder, img);
      },
    },
  };
</script>

<style scoped>
  .run-forensic-view {
    padding: 1.5rem;
    color: var(--text-on-dark, #e0e0e0);
  }
  .crumb {
    color: var(--text-muted, #9e9e9e);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }
  .crumb a {
    color: var(--brand-primary, #ffb300);
    text-decoration: none;
  }
  .crumb a:hover {
    text-decoration: underline;
  }
  .crumb-sep {
    margin: 0 0.4rem;
    color: var(--text-muted, #9e9e9e);
  }
  h1 {
    color: var(--brand-primary, #ffb300);
    font-size: 1.4rem;
    font-weight: 600;
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  h2 {
    color: #ffb300;
    font-size: 1rem;
    font-weight: 600;
    margin: 1.25rem 0 0.5rem;
  }
  .load-error {
    color: var(--feedback-error, #ff3739);
    font-weight: 600;
  }
  .loading,
  .empty-state {
    color: var(--text-muted, #9e9e9e);
    font-style: italic;
  }

  .status-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    color: #ffffff;
    text-transform: lowercase;
  }
  .status-success { background: #2e7d32; }
  .status-running { background: #f9a825; color: #212121; }
  .status-blocked { background: #ad1457; }
  .status-failed { background: #c62828; }
  .status-cancelled { background: #5e35b1; }
  .status-skipped { background: #757575; }
  .status-unknown { background: #9e9e9e; }

  .btn {
    background: none;
    border: 1px solid var(--brand-primary, #ffb300);
    color: var(--brand-primary, #ffb300);
    padding: 0.25rem 0.7rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-cancel {
    border-color: var(--feedback-error, #ff3739);
    color: var(--feedback-error, #ff3739);
  }
  .btn-cancel:hover {
    background: var(--feedback-error, #ff3739);
    color: #ffffff;
  }
  .btn[disabled] {
    color: #9e9e9e;
    border-color: #9e9e9e;
    cursor: not-allowed;
  }

  .meta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }
  .meta-cell {
    background: var(--surface-card, #424242);
    border: 1px solid rgba(255, 179, 0, 0.25);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .meta-cell-wide {
    max-width: 28rem;
  }
  .meta-label {
    font-size: 0.7rem;
    color: var(--text-muted, #9e9e9e);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: block;
  }
  .meta-value {
    font-weight: 600;
    margin-top: 0.1rem;
    color: #ffffff;
  }
  .meta-value-small {
    font-size: 0.75rem;
    font-weight: 400;
    word-break: break-all;
  }

  .pre-block {
    background: var(--surface-card, #424242);
    padding: 0.6rem 0.8rem;
    border-radius: 4px;
    font-size: 0.8rem;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .output-block {
    background: var(--surface-card, #424242);
    border: 1px solid rgba(255, 179, 0, 0.25);
    border-radius: 4px;
    padding: 0.6rem 0.9rem;
    margin-bottom: 0.85rem;
  }
  .output-head {
    color: var(--text-muted, #9e9e9e);
    font-size: 0.75rem;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .step {
    background: var(--surface-card, #424242);
    border: 1px solid rgba(255, 179, 0, 0.25);
    border-radius: 4px;
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.85rem;
  }
  .step-failed {
    border-color: #c62828;
    background: #3a1f1f;
  }
  .step-head {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
    color: #ffffff;
  }
  .step-order {
    font-weight: 700;
    color: var(--text-muted, #cccccc);
    min-width: 2.2rem;
  }
  .step-action {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.95rem;
  }
  .step-selector {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.8rem;
    color: #82b1ff;
    word-break: break-all;
  }
  .step-duration {
    color: var(--text-muted, #9e9e9e);
    font-size: 0.8rem;
    margin-left: auto;
  }
  .thumbs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.4rem 0 0.5rem;
  }
  .thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.7rem;
    color: var(--text-muted, #cccccc);
    text-decoration: none;
  }
  .thumb img {
    display: block;
    max-width: 180px;
    max-height: 110px;
    border: 1px solid #666;
    background: #212121;
  }
  .thumb-missing {
    width: 180px;
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-style: italic;
    color: var(--text-muted, #9e9e9e);
    border: 1px dashed #666;
    background: #212121;
  }
  .error-msg {
    color: #ff8080;
    margin: 0.4rem 0;
    font-size: 0.85rem;
  }
  .asset-links {
    font-size: 0.75rem;
    margin-top: 0.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .asset-link {
    color: #82b1ff;
    text-decoration: none;
  }
  .asset-link:hover {
    text-decoration: underline;
  }
</style>
