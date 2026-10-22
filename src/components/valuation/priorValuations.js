// "Have I valued this property before?" (system_3 #8419). Jenny asked to be
// warned when a client sends the same case again, so she does not set a
// completely different value without knowing she valued it before. Her own
// history (`GET /processed`, owner-scoped server-side, #3096) is matched here
// against the property on the review step. The match only ever informs: it
// never blocks generating a statement.
//
// The identity is free text, the `objekt` slot: a beteckning for a house
// ("Kommun Trakt 1:76"), "LGH <nr> <förening> (<orgnr>)" for an apartment.
// The same property comes back written differently — spacing, case, the
// org number as "(7696000000)" or "(769600-0000)", co-encumbered properties
// appended in parentheses — so each value is reduced to keys that survive
// those differences.

const MIN_KEY_LENGTH = 3;

/** The comparison keys for one identity string; empty for a blank value.
 *
 *  - Base key: NFKC, upper case, parenthesised text dropped, then everything
 *    but letters, digits and `:` dropped. "Testby Eklunda 1 : 76 (Testby
 *    Eklunda 1:11)" and "TESTBY EKLUNDA 1:76" share it.
 *  - Apartment key: org number digits + LGH number, when both parse. The
 *    förening name is spelled differently across sources; these two are not.
 */
export function propertyKeys(value) {
  const keys = new Set();
  if (value == null) return keys;
  const text = String(value).normalize('NFKC');

  const base = text
    .replace(/\([^)]*\)/g, ' ')
    .toLocaleUpperCase('sv-SE')
    .replace(/[^\p{L}\p{N}:]/gu, '');
  if (base.length >= MIN_KEY_LENGTH) keys.add(`B:${base}`);

  const lgh = text.match(/\bLGH\.?\s*(\d+(?:\s*-\s*\d+)?)/i);
  if (lgh) {
    // The org number normally sits in the parentheses; prefer it there so a
    // long LGH number can never be read as one.
    const parens = (text.match(/\(([^)]*)\)/g) || []).join(' ');
    const org = parens.match(/(\d{6})\s*-?\s*(\d{4})/) || text.match(/(\d{6})\s*-\s*(\d{4})/);
    if (org) keys.add(`A:${org[1]}${org[2]}:${lgh[1].replace(/\D/g, '')}`);
  }
  return keys;
}

// `objekt` is the identity; `objekt_short` stands in only when it is blank. A
// stale short form must not keep matching after Objekt has been corrected.
function keysOf(values) {
  if (!values) return new Set();
  const keys = propertyKeys(values.objekt);
  return keys.size ? keys : propertyKeys(values.objekt_short);
}

function pick(row, key) {
  const v = (row.final_values && row.final_values[key]) ??
            (row.extracted_values && row.extracted_values[key]);
  return v == null ? '' : String(v).trim();
}

/** The caller's earlier valuations of the property in `current`, newest first.
 *
 *  `current` is the review form. A row matches when any key of its committed
 *  or extracted identity equals a key of the form's.
 *  `excludeId` is the row being edited, which is not an earlier valuation of
 *  itself.
 */
export function findPriorValuations(rows, current, excludeId = null) {
  const wanted = keysOf(current);
  if (!wanted.size) return [];
  const matches = [];
  for (const row of rows || []) {
    if (!row || (excludeId != null && row.id === excludeId)) continue;
    const have = new Set([...keysOf(row.final_values), ...keysOf(row.extracted_values)]);
    if (![...have].some(k => wanted.has(k))) continue;
    matches.push({
      id: row.id,
      name: row.name || '',
      objekt: pick(row, 'objekt') || pick(row, 'objekt_short'),
      // The statement's own date as signed; the save time when it has none.
      date: pick(row, 'datum') || String(row.created_at || '').slice(0, 10),
      createdAt: row.created_at || '',
      value: pick(row, 'marknadsvarde_kr'),
      interval: pick(row, 'intervall_kr'),
    });
  }
  return matches.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** "3 050 000 kr" that never breaks inside itself ("3 050 / 000 kr" on a
 *  phone); empty for no value. */
export function formatAmount(value) {
  if (!value) return '';
  return `${String(value).trim().replace(/\s+/g, '\u00a0')}\u00a0kr`;
}

/** "3 050 000 kr ± 50 000 kr", or what of it exists. The line may still break
 *  between the value and its interval. */
export function formatPriorValue(match) {
  if (!match.value) return 'inget marknadsvärde angivet';
  return match.interval
    ? `${formatAmount(match.value)} ±\u00a0${formatAmount(match.interval)}`
    : formatAmount(match.value);
}

/** The row's name when Jenny has renamed it; '' for the automatic
 *  "<YYYY-MM-DD>_<objekt>" name, which would only repeat the date and the
 *  property already on the line. (Live store, 2026-10-22: 179 of 179 rows
 *  still carry the automatic name.) */
export function renamedName(match) {
  const name = (match.name || '').trim();
  return /^\d{4}-\d{2}-\d{2}_/.test(name) ? '' : name;
}
