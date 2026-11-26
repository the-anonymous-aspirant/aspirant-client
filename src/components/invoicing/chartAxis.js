// The month axis and money ticks the Invoices and Book charts share (system_3
// #12282).

// Compact money ticks, one decimal at most (§3.120 Q4), written one way: a
// whole thousand drops its ".0", so "€1k" stands beside "€800" and "€1.2k"
// (#12282 review, point 2).
export function moneyTick(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const compact = (n, unit) => `${sign}€${Math.round(n * 10) / 10}${unit}`;
  if (a >= 1e6) return compact(a / 1e6, 'M');
  if (a >= 1000) return compact(a / 1000, 'k');
  return `${sign}€${Math.round(a)}`;
}

// A month label never rotates (§3.122 P10). It wraps, "Jun" over "2026", and
// only if the wrapped labels still collide does Chart.js leave some out,
// evenly (#12282 ruling 1, with the review's point 3). The data keeps the
// one-line "Jun 2026", so a tooltip and the data-labels attribute read as
// before.
export function monthAxis() {
  return {
    offset: true,
    ticks: {
      maxRotation: 0,
      minRotation: 0,
      autoSkip: true,
      autoSkipPadding: 8,
      callback(value) {
        return String(this.getLabelForValue(value)).split(' ');
      },
    },
  };
}

// Records, on the chart's wrapper, the month labels' rotation, the months the
// axis prints and the money ticks, so a test can read them (Chart.js itself
// is not reachable from the page).
export const axisProbe = {
  id: 'axisProbe',
  afterLayout(chart) {
    const el = chart.canvas && chart.canvas.parentElement;
    const { x, y } = chart.scales || {};
    if (!el || !x) return;
    const text = (t) => (Array.isArray(t.label) ? t.label.join(' ') : String(t.label));
    el.dataset.labelRotation = String(x.labelRotation || 0);
    el.dataset.shownMonths = x.ticks.map(text).join(',');
    if (y) el.dataset.yTicks = y.ticks.map(text).join(',');
  },
};
