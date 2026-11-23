// The house spelling of an absolute time: `YYYY-MM-DD HH:MM UTC` (§3.120 Q5).
// Not the viewer's locale: "11/14/2026" and "4:17:01 AM" read differently to
// different people, and neither says which zone (system_3 #11010, UX walk AA8).
//
// Takes an ISO string, a Date or epoch milliseconds; an empty or unparseable
// value reads as an em dash, the house mark for "no value".
export function utcStamp(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
