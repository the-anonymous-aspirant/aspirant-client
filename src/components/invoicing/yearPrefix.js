// The invoice-number prefix at the turn of the year (system_3 #12306 ruling
// 2, with the review's points 1 and 6). The app never changes the prefix by
// itself (D13); it says, where ze decides, that the numbers still start with
// last year.

import { formatBerlinDay } from './api.js';

// { prefix, year } while the prefix is a four-digit year earlier than this
// year in Berlin, else null. A prefix that is not a year ("R", "FT-2026") or
// is already this year or next gets nothing: the app cannot know what ze
// means by it (D2).
export function stalePrefixYear(prefix, now = new Date()) {
  const p = String(prefix || '').trim();
  if (!/^\d{4}$/.test(p)) return null;
  const year = Number(formatBerlinDay(now).slice(0, 4));
  return Number(p) < year ? { prefix: p, year } : null;
}

// On the Issuer line, muted.
export function issuerYearSentence(stale) {
  return stale ? `Invoice numbers still start with ${stale.prefix}.` : '';
}

// In the confirmation before issuing, and in the review's Accept note.
export function issueYearSentence(stale) {
  return stale ? `Your numbers still start with ${stale.prefix}. To start ${stale.year}'s with ${stale.year}, change the prefix in the Issuer profile first.` : '';
}
