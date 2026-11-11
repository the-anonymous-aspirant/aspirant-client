// "The same" and "close" (design_agent c65348 on #10539, §3.142 Decision 4):
// defined once, for both surfaces (hand entry here, and the payers dialog of
// #10536/#10550). Normalise both names: fold case, strip accents, drop `.`,
// `,`, `-` and `'`, and collapse spaces.
// Combining diacritical marks (U+0300-U+036F), the range NFD splits an
// accented letter into: the base letter plus one of these. Built from code
// points, not a literal escape in source, so the range is unambiguous
// however this file is viewed or re-saved.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

export function normalizeName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // strip accent marks left by NFD
    .toLowerCase()
    .replace(/[.,'’‘-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsOf(normalized) {
  return normalized.split(' ').filter(Boolean);
}

// (a) the same words in another order ("Esempio Mara").
function sameWordsAnyOrder(aWords, bWords) {
  if (aWords.length === 0 || aWords.length !== bWords.length) return false;
  const a = [...aWords].sort();
  const b = [...bWords].sort();
  return a.every((w, i) => w === b[i]);
}

// (b) each word of the shorter name is the start of the word in the same
// place in the longer one, and at least one word of two-or-more letters
// matches whole ("Mara E." and "M. Esempio" are both close to "Mara
// Esempio"). "Shorter" is by normalised length, as the examples are.
function closeByPrefix(aWords, bWords, aLen, bLen) {
  const [shortWords, longWords] = aLen <= bLen ? [aWords, bWords] : [bWords, aWords];
  if (shortWords.length === 0 || shortWords.length > longWords.length) return false;
  let wholeMatch = false;
  for (let i = 0; i < shortWords.length; i += 1) {
    const s = shortWords[i];
    const l = longWords[i];
    if (!l || !l.startsWith(s)) return false;
    if (s.length >= 2 && s === l) wholeMatch = true;
  }
  return wholeMatch;
}

// Plain Levenshtein edit distance (insert, delete, substitute), used by (c)
// and to rank close candidates "closest first".
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// The same: the normalised names are equal. Nothing is asked.
export function namesAreSame(a, b) {
  const na = normalizeName(a);
  return !!na && na === normalizeName(b);
}

// Close, by Decision 4 (a)-(c). Never true when the names are the same
// (namesAreSame is the caller's first check) or either is empty. A shared
// first name alone is not a match ("Mara Rossi" / "Mara Esempio"): rule (b)
// needs every word to align, not just one.
export function namesAreClose(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb || na === nb) return false;
  const aw = wordsOf(na);
  const bw = wordsOf(nb);
  if (sameWordsAnyOrder(aw, bw)) return true;
  if (closeByPrefix(aw, bw, na.length, nb.length)) return true;
  const letters = (s) => s.replace(/ /g, '').length;
  return letters(na) >= 6 && letters(nb) >= 6 && editDistance(na, nb) <= 2;
}

// Ranks a close match "closest first": a word-order or prefix match (a/b)
// outranks an edit-distance-only match (c), and within either tier the
// smaller edit distance sorts first.
function closenessRank(typed, name) {
  const na = normalizeName(typed);
  const nb = normalizeName(name);
  const aw = wordsOf(na);
  const bw = wordsOf(nb);
  const tier = sameWordsAnyOrder(aw, bw) || closeByPrefix(aw, bw, na.length, nb.length) ? 0 : 1;
  return [tier, editDistance(na, nb)];
}

// What Save will do with a typed payer name, against the client book
// (§3.142 Decision 3): empty, the same as a client (nothing to ask), close to
// one or more (at most 3, closest first), or new. `clients` is the book as
// loaded ([{ id, name }, ...]).
export function matchPayer(typed, clients) {
  const name = (typed || '').trim();
  if (!name) return { state: 'empty' };
  const same = clients.find((c) => namesAreSame(c.name, name));
  if (same) return { state: 'same', client: same };
  const close = clients
    .filter((c) => namesAreClose(c.name, name))
    .sort((a, b) => {
      const [ta, da] = closenessRank(name, a.name);
      const [tb, db] = closenessRank(name, b.name);
      return ta - tb || da - db;
    })
    .slice(0, 3);
  if (close.length) return { state: 'close', candidates: close };
  return { state: 'new' };
}

// §3.142 Decision 6: tidying a payer's name stops at what is certain, for
// turning typed free text into a new client-book record. Trim and collapse
// spaces. A name written all in capitals or all in lower case is capitalised
// word by word ("MARA ESEMPIO" becomes "Mara Esempio"). A name in mixed case
// is kept as written, because someone wrote it that way.
export function tidyName(raw) {
  const trimmed = (raw || '').trim().replace(/\s+/g, ' ');
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(' ')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ');
  }
  return trimmed;
}
