// How the Invoices app folds its long lists (design_conventions §3.145,
// system_3 #10622): Clients by first letter, Invoices by month. One module, so
// every list groups and orders the same way.

// German order, case- and accent-insensitive: "Ärztin" sorts with A, and
// "bauer" with "Bach". The server's `name asc` is byte order, which puts Ä
// after Z and lowercase after capitals, so the client sorts for itself.
export const collator = new Intl.Collator('de', { sensitivity: 'base' });

export const OTHER_LETTER = '#';

// The letter a name files under: its first letter folded to its base, A-Z
// (Ä→A, Ö→O, Ü→U, ß→S). A name that starts with a digit or a symbol files
// under "#".
export function letterKey(name) {
  const first = String(name || '').trim().charAt(0);
  if (!first) return OTHER_LETTER;
  // Before uppercasing: 'ß'.toUpperCase() is "SS", two letters.
  if (first === 'ß' || first === 'ẞ') return 'S';
  const base = first.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(base) ? base : OTHER_LETTER;
}

// Rows grouped by the letter of `nameOf(row)`: `[{ key, rows }]`, letters A-Z
// and "#" last, rows ordered by the same collator within each letter.
export function groupByLetter(rows, nameOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = letterKey(nameOf(row));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === OTHER_LETTER) return b === OTHER_LETTER ? 0 : 1;
    if (b === OTHER_LETTER) return -1;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    rows: groups.get(key).sort((a, b) => collator.compare(nameOf(a), nameOf(b))),
  }));
}

// "2026-11-13T00:00:00Z" or "2026-11-13" -> "2026-11"; '' for no date.
export function monthKey(date) {
  const s = String(date || '');
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}

// "2026-11" -> "November 2026", in the browser's month names like every other
// date on the page.
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export const DRAFTS_GROUP = 'drafts';

// Invoices grouped for the list (§3.145 Decision 1): a "Drafts" group first,
// for rows with no issue date, then one group per month of the issue date,
// newest month first, and newest first within a month. A cancelled invoice
// keeps its issue date, so it stays in its month. Returns
// `[{ key, label, rows }]`; `key` is "drafts" or "YYYY-MM".
export function groupInvoicesByMonth(rows) {
  const drafts = [];
  const months = new Map();
  for (const row of rows) {
    const key = monthKey(row.issue_date);
    if (!key) {
      drafts.push(row);
      continue;
    }
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(row);
  }
  const newestFirst = (a, b) => {
    const da = String(a.issue_date);
    const db = String(b.issue_date);
    if (da !== db) return da < db ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  };
  const groups = [...months.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({ key, label: monthLabel(key), rows: months.get(key).sort(newestFirst) }));
  if (drafts.length) groups.unshift({ key: DRAFTS_GROUP, label: 'Drafts', rows: drafts });
  return groups;
}

// Rows grouped by the month of `dateOf(row)` (§3.145 Decision 1): newest month
// first, `[{ key, label, rows }]` with `key` "YYYY-MM". Rows keep the order
// they came in, so the caller sorts them (newest day first) before grouping.
export function groupByMonth(rows, dateOf) {
  const months = new Map();
  for (const row of rows) {
    const key = monthKey(dateOf(row));
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(row);
  }
  return [...months.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({ key, label: key ? monthLabel(key) : 'No date', rows: months.get(key) }));
}

// Which groups are open now, as a Set of keys (§3.145 Decision 3, §3.17):
// - while a filter is active, every group, unless ze closed one (R2);
// - otherwise zir own choice this visit (`chosen`, key -> open);
// - otherwise the default: a lone group (R3), and whatever `defaultOpen` says.
// `chosenWhileFiltered` is kept apart and dropped by the caller when the
// filter changes, so clearing a filter brings back the folds from before.
export function openGroupKeys(groups, { filtered = false, chosen = {}, chosenWhileFiltered = {}, defaultOpen }) {
  const open = new Set();
  for (const g of groups) {
    let on;
    if (filtered) on = g.key in chosenWhileFiltered ? chosenWhileFiltered[g.key] : true;
    else if (g.key in chosen) on = chosen[g.key];
    else on = groups.length === 1 || defaultOpen(g);
    if (on) open.add(g.key);
  }
  return open;
}

// `Map(rowKey -> groupKey)` for a list of groups: a snapshot to compare
// against after a reload.
export function groupOfRows(groups, keyOf) {
  const map = new Map();
  for (const g of groups) for (const row of g.rows) map.set(keyOf(row), g.key);
  return map;
}

// The rows that are new, or now in another group, since `before` (a
// `groupOfRows` snapshot): `[{ key, group }]` in list order, so the first is
// the newest. After a save or an import these are the groups to open and the
// row to bring into view (§3.145 Decision 2).
export function landedRows(before, groups, keyOf) {
  const landed = [];
  for (const g of groups) {
    for (const row of g.rows) {
      const key = keyOf(row);
      if (before.get(key) !== g.key) landed.push({ key, group: g.key });
    }
  }
  return landed;
}

// "September 2026", "September–November 2026" or "November 2026–January
// 2027": where a batch of rows went, for the import line (§3.145 Decision 2).
export function monthSpanLabel(keys) {
  const sorted = [...new Set(keys)].filter(Boolean).sort();
  if (!sorted.length) return '';
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return monthLabel(first);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    const [y, m] = first.split('-').map(Number);
    const firstName = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
    return `${firstName}–${monthLabel(last)}`;
  }
  return `${monthLabel(first)}–${monthLabel(last)}`;
}
