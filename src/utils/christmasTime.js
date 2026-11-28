// system_3 #12780: the Christmas cards' opening times. The server stores each
// time in UTC and decides on its own clock whether a card is open; the page
// only words the time in Berlin, where the hunt is, and counts down to it.

const ZONE = 'Europe/Berlin';

const LABEL = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** "Sat 19 Dec, 00:00" for an ISO time, in Berlin. */
export function berlinLabel(iso) {
  return LABEL.format(new Date(iso));
}

function berlinParts(ms) {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return p;
}

/** The "YYYY-MM-DDTHH:mm" a datetime-local input shows for an ISO time, in Berlin. */
export function berlinInputValue(iso) {
  if (!iso) return '';
  const p = berlinParts(Date.parse(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Berlin's offset from UTC at an instant, in milliseconds.
function berlinOffset(ms) {
  const p = berlinParts(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC ISO time of a Berlin wall time "YYYY-MM-DDTHH:mm", or null when it
 *  is empty or unreadable. */
export function berlinInputToIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall - berlinOffset(wall);
  ms = wall - berlinOffset(ms); // the offset at the instant itself, across a clock change
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Seven days at midnight in Berlin, one a day from a "YYYY-MM-DD" day. */
export function oneADay(day, count = 7) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  if (!m) return null;
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + i));
    out.push(berlinInputToIso(`${d.toISOString().slice(0, 10)}T00:00`));
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/** "2 days 04:12:09", "1 day 00:00:05" or "04:12:09" for a span in ms. */
export function countdownText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(s / 86400);
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  if (!days) return clock;
  return `${days} ${days === 1 ? 'day' : 'days'} ${clock}`;
}
