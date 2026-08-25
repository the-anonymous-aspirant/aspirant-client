// Chart series colour resolution against the DS `--chart-series-*` tokens.
//
// chart.js paints on a <canvas>, which cannot consume CSS `var()` — so a chart
// that wants the design-system's CVD-safe (Okabe-Ito) series palette has to READ
// the token value at build time and hand chart.js a concrete colour string.
//
// This mirrors the surface-resolution AspBarChart does natively
// (@aspirant/design-system AspBarChart.vue): the right series set is not "what
// theme is it" but "what surface did this chart actually land on". We walk to the
// first opaque ancestor background, composite any alpha layers, and pick the
// `-on-dark` set on a dark surface / `-on-light` otherwise by that background's
// luminance (§3.78 item 2 / §3.79). A future [data-theme] activation (#4245) or a
// dark card flows through unchanged — no per-chart colour edit.
//
// Plain functions (not a Vue composable) so the Options-API charts that consume
// them can call from a `renderChart()` method without a setup() context.

// Okabe-Ito fallbacks, index i → series i, matching AspBarChart's SERIES_FALLBACKS
// so a missing-token build still paints the CVD-safe hue rather than nothing.
const SERIES_FALLBACKS = [
  '#ffb300', '#0072b2', '#009e73', '#d55e00', '#cc79a7',
  '#56b4e9', '#f0e442', '#e69f00', '#6c757d', '#82b1ff',
];

// Parse `#rgb` / `#rrggbb` / `rgb()` / `rgba()` → [r, g, b, a]; null if opaque-unknown.
function parseColor(str) {
  if (!str) return null;
  const s = String(str).trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  return null;
}

// The background this element actually renders on: first opaque ancestor, with any
// translucent layers above it composited down. Defaults to white when unknowable.
function resolvedBackground(el) {
  if (!el || typeof getComputedStyle === 'undefined') return [255, 255, 255, 1];
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    const c = parseColor(getComputedStyle(n).backgroundColor);
    if (!c || c[3] === 0) continue;
    layers.push(c);
    if (c[3] === 1) break;
  }
  let base = layers.pop() || [255, 255, 255, 1];
  while (layers.length) {
    const top = layers.pop();
    const a = top[3];
    base = [
      top[0] * a + base[0] * (1 - a),
      top[1] * a + base[1] * (1 - a),
      top[2] * a + base[2] * (1 - a),
      1,
    ];
  }
  return base;
}

// Relative-luminance channel linearisation (WCAG).
function lin(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// '-on-dark' when the resolved surface is dark, '-on-light' otherwise.
export function surfaceSuffix(el) {
  const bg = resolvedBackground(el);
  const L = 0.2126 * lin(bg[0]) + 0.7152 * lin(bg[1]) + 0.0722 * lin(bg[2]);
  return L < 0.4 ? '-on-dark' : '-on-light';
}

// Resolve `--chart-series-<index><suffix>` (1-based) to an rgba() string at the
// caller's alpha. `el` sets the surface; falls back to the Okabe-Ito value when
// the token is absent (e.g. a build without tokens.css).
export function seriesColor(el, index, { alpha = 1 } = {}) {
  const suffix = surfaceSuffix(el);
  const fallback = SERIES_FALLBACKS[(index - 1 + SERIES_FALLBACKS.length) % SERIES_FALLBACKS.length];
  let raw = fallback;
  if (typeof getComputedStyle !== 'undefined') {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(`--chart-series-${index}${suffix}`)
      .trim();
    if (v) raw = v;
  }
  const rgb = parseColor(raw) || parseColor(fallback) || [255, 179, 0, 1];
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha})`;
}

// Read an arbitrary DS token (for chart ink like --text-on-dark) → rgba string.
export function tokenColor(name, fallback, { alpha = 1 } = {}) {
  let raw = fallback;
  if (typeof getComputedStyle !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) raw = v;
  }
  const rgb = parseColor(raw) || parseColor(fallback) || [255, 255, 255, 1];
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha})`;
}
