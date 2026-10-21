<template>
  <section class="invoices-chart" data-test="invoices-chart" :data-counts="counts.join(',')" :data-labels="labels.join(',')">
    <h3>Invoices issued per month</h3>
    <p v-if="!labels.length" class="muted" data-test="invoices-chart-empty">No invoices issued yet.</p>
    <AspBarChart
      v-else
      :data="chartData"
      unit="invoices"
      range="per month, by issue date"
      aria-label="Invoices issued per month"
      :height="180"
    />
  </section>
</template>

<script>
  import { AspBarChart } from '@aspirant/design-system';
  import { listInvoices } from './api.js';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Invoices issued over time (spec §4.9): a count per calendar month of the
  // issue date, zero-filled from the first issue month to this month. Only
  // invoices currently issued count — a Storno's replacement is counted, so
  // counting the cancelled one too would double the work.
  export default {
    name: 'InvoicesChart',
    components: { AspBarChart },
    props: {
      refreshKey: { type: Number, default: 0 },
      // Injected in tests; defaults to the browser clock.
      now: { type: Date, default: null },
    },
    data() {
      return { issued: [] };
    },
    computed: {
      buckets() {
        const months = this.issued.map((i) => String(i.issue_date || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m));
        if (!months.length) return [];
        const today = this.now || new Date();
        const last = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
        let [y, m] = months.reduce((a, b) => (a < b ? a : b)).split('-').map(Number);
        const end = months.reduce((a, b) => (a > b ? a : b), last);
        const out = [];
        for (let guard = 0; guard < 240; guard++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          out.push({ key, label: `${MONTHS[m - 1]} ${y}`, count: months.filter((x) => x === key).length });
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
        return this.buckets.map((b) => b.label);
      },
      counts() {
        return this.buckets.map((b) => b.count);
      },
      chartData() {
        return { labels: this.labels, datasets: [{ label: 'Invoices issued', data: this.counts }] };
      },
    },
    watch: {
      refreshKey: 'load',
    },
    mounted() {
      this.load();
    },
    methods: {
      async load() {
        try {
          this.issued = await listInvoices({ status: 'issued' });
        } catch (err) {
          this.issued = [];
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

  .muted {
    color: var(--text-muted);
    margin: 0;
  }
</style>
