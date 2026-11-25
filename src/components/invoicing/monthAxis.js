// One month axis for both charts, and the month labels the app prints
// (system_3 #12312, rulings 4 and 5 with the review's points 2 and 4).
//
// A month key is "YYYY-MM" with the year as stored: a mistyped "0026-11"
// stays the year 0026. It is never passed through Date(y, m), which reads
// the years 0 to 99 as 1900 to 1999.

import { formatBerlinDay } from './api.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// At most twenty years of months on one axis.
export const MAX_AXIS_MONTHS = 240;

// The calendar day in Berlin as "YYYY-MM-DD", the zone the server checks a
// date against: api.js's one Berlin day function. The browser's own zone or
// UTC would be a day off in the first hours of a day.
export function berlinToday(now = new Date()) {
  return formatBerlinDay(now);
}

// This month in Berlin, "YYYY-MM".
export function berlinMonthKey(now = new Date()) {
  return berlinToday(now).slice(0, 7);
}

function previousMonth(key) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return `${String(py).padStart(4, '0')}-${String(pm).padStart(2, '0')}`;
}

// The months a chart draws for the months its rows fall in. The axis ends at
// the later of this month (Berlin) and the newest row's month, and runs back
// to the oldest row's month, at most MAX_AXIS_MONTHS of them. So one far-back
// date can never push this month off the axis. `cut` says that older rows
// exist than the first month drawn.
export function monthAxis(keys, now = new Date()) {
  const seen = keys.filter((k) => /^\d{4}-\d{2}$/.test(String(k || '')));
  if (!seen.length) return { months: [], firstDrawn: null, cut: false };
  const oldest = seen.reduce((a, b) => (a < b ? a : b));
  const end = seen.reduce((a, b) => (a > b ? a : b), berlinMonthKey(now));
  const months = [];
  for (let key = end; months.length < MAX_AXIS_MONTHS; key = previousMonth(key)) {
    months.unshift(key);
    if (key <= oldest) break;
  }
  return { months, firstDrawn: months[0], cut: months[0] > oldest };
}

// "2026-11" -> "Nov 2026"; "0026-11" -> "Nov 0026".
export function shortMonthLabel(key) {
  return `${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

// "2026-11" -> "November 2026", in the browser's month names like every
// other date on the page; "0026-11" -> "November 0026". Only the month name
// comes from Date, from a year Date reads as written.
export function monthLabel(key) {
  const name = new Date(2000, Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
  return `${name} ${key.slice(0, 4)}`;
}

// The line under a chart whose axis left older rows out (ruling 4).
export function cutLine(axis) {
  return axis.cut ? `Entries before ${monthLabel(axis.firstDrawn)} are not drawn.` : '';
}
