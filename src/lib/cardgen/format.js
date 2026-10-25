// system_3 #8753 (D2 U7, §3.106 R5): human vocabulary for the card editor's
// history rows and asset metadata. The DTOs carry ISO timestamps, numeric
// user ids and full SHA-256 strings; a person reads "3 h ago", "you" and
// twelve hex characters, with the full value within reach in `title`.

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['h', 3600],
  ['min', 60],
];

/** "3 h ago", "2 days ago", "just now"; `now` is injectable for tests. */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso || '';
  let seconds = Math.round((now - t) / 1000);
  const future = seconds < 0;
  seconds = Math.abs(seconds);
  if (seconds < 45) return future ? 'in a moment' : 'just now';
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const n = Math.round(seconds / size);
      const label = unit === 'h' || unit === 'min' ? `${n} ${unit}` : `${n} ${unit}${n === 1 ? '' : 's'}`;
      return future ? `in ${label}` : `${label} ago`;
    }
  }
  return future ? 'in a moment' : 'just now';
}

/** The absolute form for `title`: the ISO string as the server sent it. */
export function absoluteTime(iso) {
  return iso || '';
}

/** Session user id when the app recorded one; null otherwise. */
export function sessionUserId() {
  try {
    const raw = localStorage.getItem('user_id');
    const n = Number(raw);
    return raw != null && Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** "you" for the session user, else the DTO's display name (`created_by_name` /
 *  `uploaded_by_name`, #8758), else "system" (0) or "user N" for a row from a
 *  server that predates the name or a user that no longer exists. */
export function actorLabel(userId, me = sessionUserId(), name = '') {
  if (me != null && userId != null && userId !== '' && Number(userId) === me) return 'you';
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  if (userId === 0 || userId === '0') return 'system';
  if (userId == null || userId === '') return 'unknown';
  return `user ${userId}`;
}

export function shortSha(sha, length = 12) {
  if (!sha) return '';
  return String(sha).slice(0, length);
}
