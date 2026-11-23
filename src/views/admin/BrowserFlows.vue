<template>
  <div v-if="legacy" class="browser-flows-frame" data-test="browser-flows-legacy">
    <iframe
      :src="iframeSrc"
      title="Browser Flows (legacy)"
      class="browser-flows-iframe"
    ></iframe>
  </div>

  <div v-else class="browser-flows-view page" data-test="browser-flows-view">
    <h1>Browser Flows</h1>
    <!-- Reading instructions for a grid: say nothing about a grid that is not
         drawn (UX walk AA6, system_3 #11008; D1/D2). -->
    <p v-if="!loadError" class="meta">
      Rows = registered flows. Columns = last {{ maxRuns }} runs, oldest left, newest right.
      Click a cell for the run detail.
    </p>

    <div v-if="loadError" class="load-error-state" data-test="browser-flows-error">
      <p class="load-error">{{ loadError }}</p>
      <!-- The one next step a service outage has: go see whether it needs
           starting, where every other service's status already lives. -->
      <p class="load-error-next">
        <router-link to="/admin/system-health" data-test="browser-flows-error-next">Check System Health</router-link>
        to see whether the service needs starting.
      </p>
    </div>

    <div v-else-if="loading" class="loading" data-test="browser-flows-loading">Laddar…</div>

    <div
      v-else-if="!rows.length"
      class="empty-state"
      data-test="browser-flows-empty"
    >
      No flows registered yet. POST one to <code>/api/browser-flows</code> to get started.
    </div>

    <div v-else class="matrix-card" data-test="browser-flows-matrix">
      <!-- The card keeps its padding and does not scroll; the run strip
           scrolls inside it, so a run scrolled past the sticky Flow column is
           clipped at the scroller's edge and never shows left of a name. The
           viewport does not scroll either, so the edge fades (#4529) stay
           pinned to what is hidden (system_3 #11008, design c76151; §3.119). -->
      <div
        :class="[
          'matrix-viewport',
          {
            'matrix-viewport--overflow-start': overflowStart,
            'matrix-viewport--overflow-end': overflowEnd,
          },
        ]"
        :style="{ '--flow-col-width': `${flowColWidth}px` }"
        data-test="browser-flows-viewport"
      >
        <div
          ref="matrixScroll"
          class="matrix-scroll"
          data-test="browser-flows-scroll"
          @scroll.passive="measureOverflow"
        >
          <table>
            <thead>
              <tr>
                <th ref="flowHead" class="flow-col">Flow</th>
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
                    <AspTooltip :content="row.flow.enabled ? 'trigger this flow' : 'flow disabled'">
                      <AspButton
                        variant="secondary"
                        size="sm"
                        type="button"
                        :disabled="!row.flow.enabled || acting.has(row.flow.id)"
                        :data-test="`trigger-${row.flow.id}`"
                        @click="onTrigger(row.flow.id)"
                      >
                        ▶ Start
                      </AspButton>
                    </AspTooltip>
                    <AspTooltip
                      v-if="row.latestRun && row.latestRun.status === 'running'"
                      content="signal the driver to stop"
                    >
                      <AspButton
                        variant="destructive"
                        size="sm"
                        type="button"
                        :disabled="acting.has(row.flow.id)"
                        :data-test="`cancel-${row.flow.id}`"
                        @click="onCancel(row.flow.id, row.latestRun.id)"
                      >
                        ✕ Cancel
                      </AspButton>
                    </AspTooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="!loadError" class="legend" data-test="browser-flows-legend">
      <span><span class="swatch cell-success"></span>success</span>
      <span><span class="swatch cell-running"></span>running</span>
      <span><span class="swatch cell-blocked"></span>blocked</span>
      <span><span class="swatch cell-failed"></span>failed</span>
      <span><span class="swatch cell-cancelled"></span>cancelled</span>
      <span><span class="swatch cell-unknown"></span>unknown</span>
      <span><span class="swatch cell-empty"></span>no run</span>
    </div>
  </div>
</template>

<script>
  import { AspButton, AspTooltip } from '@aspirant/design-system';
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
    components: { AspButton, AspTooltip },
    data() {
      return {
        flows: [],
        runsByFlow: {},
        loading: false,
        loadError: null,
        acting: new Set(),
        maxRuns: MAX_RUNS,
        overflowStart: false,
        overflowEnd: false,
        flowColWidth: 0,
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
    beforeUnmount() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
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
        this.scrollGridToLatest();
      },
      // Runs read oldest-left, newest-right (`rows` computed above); open the
      // strip scrolled to its right end so the newest run is on first screen
      // instead of past the fold (system_3 #11846). The Flow column is sticky,
      // so the names stay beside their runs (#11008).
      scrollGridToLatest() {
        this.$nextTick(() => {
          const el = this.$refs.matrixScroll;
          if (!el) return;
          el.scrollLeft = el.scrollWidth;
          this.measureOverflow();
          if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.measureOverflow());
          }
          if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver.observe(el);
          }
        });
      },
      // Which edges hide runs, for the #4529 fades: as AspDataTable measures
      // it, with 1px for sub-pixel rounding at either end. The start fade sits
      // just right of the sticky Flow column, so it needs that column's width.
      measureOverflow() {
        const el = this.$refs.matrixScroll;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        const overflows = maxScroll > 1;
        this.overflowStart = overflows && el.scrollLeft > 1;
        this.overflowEnd = overflows && el.scrollLeft < maxScroll - 1;
        const head = this.$refs.flowHead;
        this.flowColWidth = head ? head.offsetWidth : 0;
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
  /* The shell's .app-main carries the one gutter (system_3 #9192, #9501). */
  .browser-flows-view {
    max-width: 100%;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-weight: 600;
  }
  .meta {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 1.25rem;
  }
  .load-error {
    color: var(--feedback-error);
    font-weight: 600;
  }
  .load-error-next {
    margin: 0.5rem 0 0;
    color: var(--text-muted);
  }
  .loading {
    color: var(--text-muted);
    font-style: italic;
  }
  .empty-state {
    color: var(--text-muted);
    font-style: italic;
    padding: 2rem 0;
  }
  .matrix-card {
    background: var(--surface-card);
    /* The card is dark in both themes, so it declares its ink (#9175). */
    color: var(--text-on-dark);
    border: 1px solid var(--brand-primary);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    box-shadow: var(--shadow-sm);
  }
  .matrix-viewport {
    position: relative;
  }
  .matrix-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  /* The #4529 edge fades, drawn only on a side where runs are hidden. Each
     dissolves into the card's own surface. The start fade sits just right of
     the sticky Flow column, over the runs scrolled under it. */
  .matrix-viewport::before,
  .matrix-viewport::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2.5rem;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
    z-index: 2;
  }
  .matrix-viewport::before {
    left: var(--flow-col-width, 0px);
    background: linear-gradient(to right, var(--surface-card), transparent);
  }
  .matrix-viewport::after {
    right: 0;
    background: linear-gradient(to left, var(--surface-card), transparent);
  }
  .matrix-viewport--overflow-start::before,
  .matrix-viewport--overflow-end::after {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .matrix-viewport::before,
    .matrix-viewport::after {
      transition: none;
    }
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 0.5rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  th {
    font-weight: 600;
  }
  /* The row-header column is sticky-left (§3.119), on the card's own
     surface so the runs pass under the name, and above a run scaled by
     :hover. Not the DS's --z-index-sticky: that ties with the phone's top
     bar and would paint over it (design c76151). */
  th.flow-col,
  td.flow-col {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--surface-card);
    min-width: 14rem;
  }
  /* §3.119's 16ch floor on a phone. An overflowing auto-layout table ignores
     `width` alone, so both are set; the name wraps. A name with no space in
     it (a domain, say) may break anywhere, or its one long word would hold
     the column wider than the floor (system_3 #11008). */
  @media (max-width: 767.98px) {
    th.flow-col,
    td.flow-col {
      min-width: 16ch;
      width: 16ch;
      overflow-wrap: anywhere;
    }
  }
  th.grid-head {
    text-align: center;
    font-weight: normal;
    color: var(--text-muted);
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
    color: var(--brand-primary);
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
    /* The card's ink, not the global link tint, so currentColor below is the
       ink of the surface the cells sit on (D9, §3.18). */
    color: inherit;
  }
  /* Marks on .matrix-card take the card's ink, not a page token: the card is
     dark in both themes, where --border-control falls below 3:1 on the light
     theme's card (system_3 #11008, design c76151). */
  .cell:hover {
    transform: scale(1.15);
    outline: 1px solid color-mix(in srgb, currentColor 50%, transparent);
  }
  /* "No run" is an outlined empty cell, as the legend draws it. */
  .cell-empty {
    background: transparent;
    border: 1.5px solid color-mix(in srgb, currentColor 50%, transparent);
    cursor: default;
    pointer-events: none;
  }
  .cell-success { background: var(--chart-series-3-on-dark); }
  .cell-running { background: var(--chart-series-1-on-dark); }
  .cell-blocked { background: var(--chart-series-5-on-dark); }
  .cell-failed { background: var(--chart-series-4-on-dark); }
  .cell-unknown { background: var(--chart-series-9-on-dark); }
  .cell-cancelled { background: var(--chart-series-2-on-dark); }
  .row-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
    align-items: center;
  }
  .legend {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
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
  /* The grid's own cells always sit on `.matrix-card`, which is dark in
     both themes, so the `-on-dark` fills (below) are correct there. The
     legend sits on the page itself, which is light or dark by site theme,
     so its swatches need the theme-matched fill (UX walk AA6, system_3
     #11008; the un-paired `-on-dark`-only fills read as two near-identical
     greys in light, and "no run" read as almost the page colour in dark).
     "No run" becomes an outlined empty cell instead of a fill, so it never
     depends on a hue reading differently from "unknown" at all. */
  .legend .swatch.cell-success { background: var(--chart-series-3-on-light); }
  .legend .swatch.cell-running { background: var(--chart-series-1-on-light); }
  .legend .swatch.cell-blocked { background: var(--chart-series-5-on-light); }
  .legend .swatch.cell-failed { background: var(--chart-series-4-on-light); }
  .legend .swatch.cell-cancelled { background: var(--chart-series-2-on-light); }
  .legend .swatch.cell-unknown { background: var(--chart-series-9-on-light); }
  .legend .swatch.cell-empty {
    background: transparent;
    border: 1.5px solid var(--border-control, var(--border-subtle));
  }
  /* No `:global()` around the theme attribute (system_3 #11455). In a scoped
     style Vue replaces a whole selector containing `:global(…)` with its
     inside, so `:global([data-theme='dark']) .legend .swatch.cell-x` became a
     bare `[data-theme=dark]` rule on <html> and these six fills never
     applied. Written plainly, the scope attribute goes on the last part only
     (`[data-theme='dark'] .legend .swatch.cell-x[data-v-…]`), which is what
     is wanted: the attribute lives on <html>, outside this component. */
  [data-theme='dark'] .legend .swatch.cell-success { background: var(--chart-series-3-on-dark); }
  [data-theme='dark'] .legend .swatch.cell-running { background: var(--chart-series-1-on-dark); }
  [data-theme='dark'] .legend .swatch.cell-blocked { background: var(--chart-series-5-on-dark); }
  [data-theme='dark'] .legend .swatch.cell-failed { background: var(--chart-series-4-on-dark); }
  [data-theme='dark'] .legend .swatch.cell-cancelled { background: var(--chart-series-2-on-dark); }
  [data-theme='dark'] .legend .swatch.cell-unknown { background: var(--chart-series-9-on-dark); }

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
