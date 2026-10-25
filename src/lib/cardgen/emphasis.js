// system_3 #8754 (D2 R2): the closed micro-markup inside a text value. The
// printed deck underlines and emboldens the modal words ("These players MUST
// share ..."), and the playtest feedback asks that the cards be clear on
// may/must. Exactly one construct is interpreted:
//
//   *word*   one emphasised run (bold + underline in both renderers)
//   \*       a literal asterisk
//
// Nothing else is markup: an unmatched `*`, an empty `**`, a backslash before
// any other character and every HTML-looking string stay literal text. The
// value is still a plain string on the server (at most 2000 characters, the
// validator is untouched); this only decides how it is drawn.

/** Splits `text` into runs `[{ text, em }]`; adjacent runs never share `em`. */
export function parseEmphasis(text) {
  const source = typeof text === 'string' ? text : '';
  // Pass 1: resolve escapes; record each unescaped `*` as a marker.
  const chars = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\' && source[i + 1] === '*') {
      chars.push({ ch: '*', marker: false });
      i += 1;
    } else {
      chars.push({ ch, marker: ch === '*' });
    }
  }
  // Pass 2: pair markers in order; a pair with nothing between stays literal,
  // and an odd marker out at the end stays literal.
  const markers = [];
  chars.forEach((c, i) => {
    if (c.marker) markers.push(i);
  });
  const paired = new Set();
  for (let m = 0; m + 1 < markers.length; m += 2) {
    const open = markers[m];
    const close = markers[m + 1];
    if (close - open > 1) {
      paired.add(open);
      paired.add(close);
    }
  }
  // Pass 3: build the runs.
  const runs = [];
  let em = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const last = runs[runs.length - 1];
    if (last && last.em === em) last.text += buf;
    else runs.push({ text: buf, em });
    buf = '';
  };
  chars.forEach((c, i) => {
    if (paired.has(i)) {
      flush();
      em = !em;
    } else {
      buf += c.ch;
    }
  });
  flush();
  return runs;
}

/** The text with the markup removed (what a reader sees, for length estimates). */
export function plainText(text) {
  return parseEmphasis(text).map((r) => r.text).join('');
}

export const EMPHASIS_HINT = '*word* prints bold and underlined; \\* prints an asterisk.';
