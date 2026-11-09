<template>
  <figure
    class="book-chart"
    data-test="book-chart"
    :data-labels="labels.join(',')"
    :data-income="incomeEuros.join(',')"
    :data-expenses="expenseEuros.join(',')"
    :data-income-color="seriesColors.income"
    :data-expense-color="seriesColors.expense"
  >
    <figcaption><h3>Income vs expenses per month</h3></figcaption>
    <p v-if="!labels.length" class="muted" data-test="book-chart-empty">Nothing in the book yet.</p>
    <template v-else>
      <AspChart
        type="bar"
        :data="chartData"
        :options="options"
        :height="180"
        aria-label="Income and expenses per month in euros"
      />
      <p class="stat__range muted" data-test="book-chart-range">by the day paid; this month so far</p>
    </template>
  </figure>
</template>

<script>
  import { AspChart } from '@aspirant/design-system';
  import { formatMoney } from './api.js';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const Y_AXIS_WIDTH = 56;

  const moneyTick = (v) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${Math.round(v)}`);

  const monthOf = (d) => {
    const m = String(d || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(m) ? m : null;
  };

  const resolveToken = (name, fallback) => {
    if (typeof document === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  // The Book tab's monthly bar chart (system_3 #10414-D), on the same month
  // axis as InvoicesChart.vue's own charts — same zero-fill-to-today walk, same
  // y-axis width and money tick format, so a month lines up the same way and
  // reads the same whether she's looking at Invoices or Book. Two series on
  // one chart (unlike InvoicesChart's three single-series charts), so the
  // legend is ON here, not hidden.
  //
  // Colours (design_agent c63777/c63825, operator c63803: "let's go with
  // black"): income in the book's own ink, expenses in its red, explicit on
  // each dataset rather than AspChart's default series palette, resolved live
  // off the root element so a theme flip (the live OS-preference watcher,
  // #4245) repaints the bars without a reload.
  export default {
    name: 'BookChart',
    components: { AspChart },
    props: {
      payments: { type: Array, required: true },
      expenses: { type: Array, required: true },
      // Injected in tests; defaults to the browser clock.
      now: { type: Date, default: null },
    },
    data() {
      return { themeTick: 0 };
    },
    computed: {
      income() {
        return this.payments.filter((p) => p.kind === 'incoming');
      },
      incomeMonths() {
        return this.income.map((p) => monthOf(p.paid_on));
      },
      expenseMonths() {
        return this.expenses.map((e) => monthOf(e.paid_on));
      },
      months() {
        const seen = [...this.incomeMonths, ...this.expenseMonths].filter(Boolean);
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
      incomeEuros() {
        return this.months.map(
          (k) => this.income.reduce((s, p, n) => (this.incomeMonths[n] === k ? s + (Number(p.gross_cents) || 0) : s), 0) / 100
        );
      },
      expenseEuros() {
        return this.months.map(
          (k) => this.expenses.reduce((s, e, n) => (this.expenseMonths[n] === k ? s + (Number(e.amount_cents) || 0) : s), 0) / 100
        );
      },
      seriesColors() {
        // eslint-disable-next-line no-unused-expressions
        this.themeTick; // tracked so a theme flip recomputes these
        return {
          income: resolveToken('--text-body', '#424242'),
          expense: resolveToken('--feedback-error-text', '#8b0f10'),
        };
      },
      chartData() {
        const c = this.seriesColors;
        return {
          labels: this.labels,
          datasets: [
            { label: 'Income', data: this.incomeEuros, backgroundColor: c.income, borderColor: c.income },
            { label: 'Expenses', data: this.expenseEuros, backgroundColor: c.expense, borderColor: c.expense },
          ],
        };
      },
      options() {
        return {
          layout: { autoPadding: false, padding: { top: 6, right: 6, bottom: 0, left: 0 } },
          plugins: {
            legend: { display: true },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Math.round(ctx.parsed.y * 100))}` } },
          },
          scales: {
            x: { offset: true },
            y: {
              afterFit: (axis) => {
                axis.width = Y_AXIS_WIDTH;
              },
              ticks: { callback: moneyTick },
            },
          },
        };
      },
    },
    mounted() {
      if (typeof MutationObserver === 'undefined') return;
      this.themeObserver = new MutationObserver(() => {
        this.themeTick += 1;
      });
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    },
    beforeUnmount() {
      if (this.themeObserver) this.themeObserver.disconnect();
    },
  };
</script>

<style scoped>
  .book-chart {
    margin: 0 0 var(--space-md);
    min-width: 0;
  }

  .book-chart figcaption h3 {
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
