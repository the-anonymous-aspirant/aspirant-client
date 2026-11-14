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
