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
        <AspChart type="line" :data="clientsData" :options="optionsFor('count')" :plugins="[plotAreaProbe]" :height="140" aria-label="Clients over time, running total by the month of each client's first invoiced work" />
        <p class="stat__range muted" data-test="stat-clients-range">running total; each client counts from the month of the work on their first issued invoice</p>
      </figure>
      <figure class="stat" data-test="stat-income">
        <figcaption><h4>Income per month</h4></figcaption>
        <AspChart type="bar" :data="incomeData" :options="optionsFor('money')" :plugins="[plotAreaProbe]" :height="140" aria-label="Income per month in euros, issued invoices by the month the work was done" />
        <p class="stat__range muted" data-test="stat-income-range">issued invoices, by the month the work was done; this month so far</p>
      </figure>
      <figure class="stat" data-test="stat-invoices">
        <figcaption><h4>Invoices issued per month</h4></figcaption>
        <AspChart type="bar" :data="chartData" :options="optionsFor('count')" :plugins="[plotAreaProbe]" :height="140" aria-label="Invoices issued per month" />
        <p class="stat__range muted">per month, by issue date; this month so far</p>
      </figure>
    </div>
  </section>
</template>

<script>
  import { AspChart } from '@aspirant/design-system';
  import { formatMoney, listInvoices } from './api.js';

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
      const x = chart.scales && chart.scales.x;
      if (x) el.dataset.monthX = chart.data.labels.map((_, i) => Math.round(x.getPixelForValue(i))).join(',');
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
      months() {
        const seen = [...this.issued.map((i) => monthOf(i.issue_date)), ...this.serviceMonths].filter(Boolean);
        if (!seen.length) return [];
        const today = this.now || new Date();
        const last = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
        let [y, m] = seen.reduce((a, b) => (a < b ? a : b)).split('-').map(Number);
        const end = seen.reduce((a, b) => (a > b ? a : b), last);
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
      incomeEuros() {
        return this.months.map((k) => this.issued.reduce((s, i, n) => (this.serviceMonths[n] === k ? s + (Number(i.total_cents) || 0) : s), 0) / 100);
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
      optionsFor(kind) {
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
              afterFit: (axis) => {
                axis.width = Y_AXIS_WIDTH;
              },
              ticks: money ? { callback: moneyTick } : { precision: 0 },
            },
          },
        };
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
