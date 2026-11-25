<template>
  <section
    class="invoices-chart"
    data-test="invoices-chart"
    :data-counts="counts.join(',')"
    :data-labels="labels.join(',')"
    :data-clients="clientTotals.join(',')"
    :data-income="incomeEuros.join(',')"
  >
    <h3>Statistics</h3>
    <p v-if="!labels.length" class="muted" data-test="invoices-chart-empty">No issued invoices yet.</p>
    <!-- Three charts on one month axis, so a month lines up across all three
         (operator c61586: "# of clients by date (cumulative). EUR income.
         # invoices"; system_3 #9972). -->
    <div v-else class="stats">
      <figure class="stat" data-test="stat-clients">
        <figcaption><h4>Clients over time</h4></figcaption>
        <AspChart type="line" :data="clientsData" :options="optionsFor('position', clientTotals)" :plugins="[plotAreaProbe]" :height="140" aria-label="Clients over time, running total by the month of each client's first invoiced work" />
        <p class="stat__range muted" data-test="stat-clients-range">{{ clientsCaption }}</p>
      </figure>
      <figure class="stat" data-test="stat-income">
        <figcaption><h4>Income per month</h4></figcaption>
        <AspChart type="bar" :data="incomeData" :options="optionsFor('money', incomeEuros)" :plugins="[plotAreaProbe]" :height="140" aria-label="Income per month in euros, issued invoices by the month the work was done" />
        <p class="stat__range muted" data-test="stat-income-range">{{ incomeCaption }}</p>
      </figure>
      <figure class="stat" data-test="stat-invoices">
        <figcaption><h4>Invoices issued per month</h4></figcaption>
        <AspChart type="bar" :data="chartData" :options="optionsFor('count', counts)" :plugins="[plotAreaProbe]" :height="140" aria-label="Invoices issued per month" />
        <p class="stat__range muted" data-test="stat-invoices-range">{{ invoiceCountCaption }}</p>
      </figure>
    </div>
  </section>
</template>

<script>
  import { AspChart } from '@aspirant/design-system';
  import { formatMoney, listInvoices } from './api.js';

  // An invoice holds one currency; a missing one reads as EUR.
  const inEuros = (invoice) => (invoice.currency || 'EUR') === 'EUR';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The y-axis labels of all three charts take the same width, so the plot
  // areas start at the same x and one month sits at one x in every chart
  // (design_agent on #10005).
  const Y_AXIS_WIDTH = 56;

  // Compact money ticks, one decimal (§3.120 Q4): €950, €1.2k.
  const moneyTick = (v) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`);

  // Records each chart's plot area and month positions on its wrapper, so the
  // alignment can be measured from the page (Chart.js itself is not reachable
  // there). Per-instance, so no other chart in the app carries it.
  const plotAreaProbe = {
    id: 'plotAreaProbe',
    afterLayout(chart) {
      const el = chart.canvas && chart.canvas.parentElement;
      if (!el || !chart.chartArea) return;
      el.dataset.plotLeft = String(Math.round(chart.chartArea.left));
      el.dataset.plotRight = String(Math.round(chart.chartArea.right));
      el.dataset.plotTop = String(Math.round(chart.chartArea.top));
      el.dataset.plotBottom = String(Math.round(chart.chartArea.bottom));
      const x = chart.scales && chart.scales.x;
      if (x) el.dataset.monthX = chart.data.labels.map((_, i) => Math.round(x.getPixelForValue(i))).join(',');
    },
    // The rendered top/bottom of the one series' marks (a bar's top, or a
    // line's point y), so a test can measure headroom off the plot edges
    // (UX walk AM7, system_3 #11024) the way the finding itself measured it —
    // pixels, not the domain numbers that produced them. Datasets are not
    // positioned yet at `afterLayout`, and animate toward their final
    // position over the next render(s); `afterRender` is the hook Chart.js
    // calls once per render including the last, settled one, so the DOM
    // attribute ends up correct once the animation (or a reduced-motion
    // instant render) completes, which a `toHaveAttribute` assertion is
    // already built to wait out.
    afterRender(chart) {
      const el = chart.canvas && chart.canvas.parentElement;
      if (!el) return;
      const points = chart
        .getDatasetMeta(0)
        .data.map((p) => p.y)
        .filter((y) => Number.isFinite(y));
      if (points.length) {
        el.dataset.markTop = String(Math.round(Math.min(...points)));
        el.dataset.markBottom = String(Math.round(Math.max(...points)));
      }
    },
  };

  const monthOf = (d) => {
    const m = String(d || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(m) ? m : null;
  };

  // The Invoices tab's statistics (spec §4.9; system_3 #9972). One month
  // axis, zero-filled from the first month any series has a value to this
  // month. Only invoices currently issued count: a Storno's replacement is
  // counted, so counting the cancelled one too would double the work.
  //
  // Dating (operator c61853 on #9972, system_3 #10005 c61867):
  // - income: an issued invoice's total in the month its service period
  //   starts (service_date_from), i.e. when the work was done;
  // - clients: each client from the service month of their first issued
  //   invoice; a client with no issued invoice is not counted yet;
  // - invoices issued: the issue month, unchanged.
  //
  // An issued invoice always has a service period (the issue check requires
  // it); the issue month stands in only if a row ever lacks one.
  export default {
    name: 'InvoicesChart',
    components: { AspChart },
    props: {
      refreshKey: { type: Number, default: 0 },
      // Injected in tests; defaults to the browser clock.
      now: { type: Date, default: null },
    },
    data() {
      return { invoices: [], plotAreaProbe };
    },
    computed: {
      issued() {
        return this.invoices.filter((i) => i.status === 'issued');
      },
      // The month an issued invoice's work was done.
      serviceMonths() {
        return this.issued.map((i) => monthOf(i.service_date_from) || monthOf(i.issue_date));
      },
      // client id -> the service month of their first issued invoice.
      clientFirstMonths() {
        const first = new Map();
        this.issued.forEach((inv, k) => {
          const m = this.serviceMonths[k];
          if (inv.client_id == null || !m) return;
          if (!first.has(inv.client_id) || m < first.get(inv.client_id)) first.set(inv.client_id, m);
        });
        return [...first.values()];
      },
      // Today's month key, the same shape as every other month in `months`.
      currentKey() {
        const today = this.now || new Date();
        return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
      },
      months() {
        const seen = [...this.issued.map((i) => monthOf(i.issue_date)), ...this.serviceMonths].filter(Boolean);
        if (!seen.length) return [];
        let [y, m] = seen.reduce((a, b) => (a < b ? a : b)).split('-').map(Number);
        const end = seen.reduce((a, b) => (a > b ? a : b), this.currentKey);
        const out = [];
        for (let guard = 0; guard < 240; guard++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          out.push(key);
          if (key >= end) break;
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
        return out;
      },
      labels() {
        return this.months.map((k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`);
      },
      counts() {
        return this.months.map((k) => this.issued.filter((i) => monthOf(i.issue_date) === k).length);
      },
      // Euro invoices only: a total never adds two currencies (system_3
      // #12258). The caption says how many it leaves out.
      incomeEuros() {
        return this.months.map((k) => this.issued.reduce((s, i, n) => (this.serviceMonths[n] === k && inEuros(i) ? s + (Number(i.total_cents) || 0) : s), 0) / 100);
      },
      otherCurrencies() {
        return this.issued.filter((i) => !inEuros(i));
      },
      // Clients by the end of each month (a running total).
      clientTotals() {
        return this.months.map((k) => this.clientFirstMonths.filter((m) => m <= k).length);
      },
      chartData() {
        return { labels: this.labels, datasets: [{ label: 'Invoices issued', data: this.counts }] };
      },
      incomeData() {
        return { labels: this.labels, datasets: [{ label: 'Income (EUR)', data: this.incomeEuros }] };
      },
      clientsData() {
        // Stepped, no smoothing: a count that only rises must not dip
        // between months on screen (design_agent on #10005, D2).
        return { labels: this.labels, datasets: [{ label: 'Clients', data: this.clientTotals, stepped: true, tension: 0, fill: false }] };
      },
      // Each caption states its own extremes and the part-month bar in
      // words (UX walk AM7, system_3 #11024; §3.66f's "low N · high M" text
      // convention over a shape to decode), so the axis never has to carry
      // a reading no bar or tick can show by itself.
      incomeCaption() {
        const money = (v) => formatMoney(Math.round(v * 100));
        const base = `issued invoices, by the month the work was done, cancelled invoices left out; ${this.seriesCaption(this.incomeEuros, money)}`;
        const other = this.otherCurrencies;
        if (!other.length) return base;
        const codes = [...new Set(other.map((i) => i.currency))].sort().join(', ');
        const clause = other.length === 1 ? `1 invoice in another currency (${codes}) is not counted` : `${other.length} invoices in other currencies (${codes}) are not counted`;
        return `${base}; ${clause}`;
      },
      invoiceCountCaption() {
        return `per month, by issue date, cancelled invoices left out; ${this.seriesCaption(this.counts, String)}`;
      },
      clientsCaption() {
        const clients = (v) => `${v} client${v === 1 ? '' : 's'}`;
        return `running total; each client counts from the month of the work on their first issued invoice; ${this.seriesCaption(this.clientTotals, clients)}`;
      },
    },
    watch: {
      refreshKey: 'load',
    },
    mounted() {
      this.load();
    },
    methods: {
      // One options shape for all three: same y-axis width, points centred
      // over the bars (offset), no legend (each chart has one series and a
      // title), and money in the app's one format (formatMoney, en-GB).
      // `kind` also picks the headroom: 'position' (the clients running
      // total) pads both ends of the observed range; the two bars ('money',
      // 'count') keep their zero baseline and gain top headroom only (UX
      // walk AM7, §3.60) so the tallest bar no longer ends on the gridline.
      optionsFor(kind, values) {
        const money = kind === 'money';
        return {
          // One explicit padding for all three. Chart.js otherwise pads a line
          // chart for its point markers (5px measured on the right), which
          // shifts its plot off the bars'. With offset, every point sits half
          // a month inside the plot, so nothing is clipped.
          layout: { autoPadding: false, padding: { top: 6, right: 6, bottom: 0, left: 0 } },
          plugins: {
            legend: { display: false },
            tooltip: money ? { callbacks: { label: (ctx) => formatMoney(Math.round(ctx.parsed.y * 100)) } } : {},
          },
          scales: {
            x: { offset: true },
            y: {
              ...this.paddedDomain(values || [], kind),
              afterFit: (axis) => {
                axis.width = Y_AXIS_WIDTH;
              },
              ticks: money ? { callback: moneyTick } : { precision: 0 },
            },
          },
        };
      },
      // §3.60: a magnitude bar keeps its zero baseline and gains headroom at
      // the top only; a position line is padded on both ends around the
      // observed range, so it never rides a gridline at either edge.
      paddedDomain(values, kind) {
        if (!values.length) return {};
        const max = Math.max(...values);
        if (kind !== 'position') return { suggestedMax: Math.max(max * 1.15, max + 1) };
        const min = Math.min(...values);
        const pad = Math.max((max - min) * 0.1, 1);
        return { suggestedMin: Math.max(0, min - pad), suggestedMax: max + pad };
      },
      monthShort(i) {
        return this.labels[i].split(' ')[0];
      },
      // "low N in <month> · high M in <month>", naming the current month
      // "so far" wherever it falls (an extreme or its own third clause) —
      // the operator's converged caption preference (§3.66f/D4), extended
      // with month names since this axis spans many of them, unlike the
      // fixed rolling window §3.66f was written against. A flat series (one
      // month, or every month tied) has no extremes to contrast, so it
      // collapses to a single reading instead of a redundant "low X · high
      // X" (the #3993 suppression §3.66f restores, carried to this axis).
      seriesCaption(values, fmt) {
        if (!values.length) return '';
        const curI = this.months.indexOf(this.currentKey);
        let hiI = 0;
        let loI = 0;
        values.forEach((v, i) => {
          if (v > values[hiI]) hiI = i;
          if (v < values[loI]) loI = i;
        });
        const soFar = (i) => (i === curI ? ' so far' : '');
        if (values[hiI] === values[loI]) {
          return curI >= 0 ? `${this.monthShort(curI)} so far ${fmt(values[curI])}` : `${fmt(values[hiI])} in ${this.monthShort(hiI)}`;
        }
        const parts = [`low ${fmt(values[loI])} in ${this.monthShort(loI)}${soFar(loI)}`, `high ${fmt(values[hiI])} in ${this.monthShort(hiI)}${soFar(hiI)}`];
        if (curI >= 0 && curI !== hiI && curI !== loI) parts.push(`${this.monthShort(curI)} so far ${fmt(values[curI])}`);
        return parts.join(' · ');
      },
      async load() {
        try {
          this.invoices = await listInvoices({});
        } catch {
          this.invoices = [];
        }
      },
    },
  };
</script>

<style scoped>
  .invoices-chart {
    margin-bottom: var(--space-md);
  }

  .invoices-chart h3 {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-md, 1rem);
  }

  /* Stacked at every width, full width each, so one month sits at one x in
     all three (design_agent on #10005). */
  .stats {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .stat {
    margin: 0;
    min-width: 0;
  }

  .stat figcaption h4 {
    margin: 0 0 var(--space-2xs);
    font-size: var(--text-sm);
  }

  .stat__range {
    margin: var(--space-2xs) 0 0;
    font-size: var(--text-xs, 0.75rem);
    text-align: center;
  }

  .muted {
    color: var(--text-muted);
    margin: 0;
  }
</style>
