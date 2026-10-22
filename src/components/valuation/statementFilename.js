// The saved statement is named after the property (system_3 #8421). Jenny asked
// "att när filen sparas döps den till namnet för fastigheten/lägenheten". The
// commander answers /generate with a timestamped "vardeutlatande_<stamp>" name,
// so the client names the download itself from the values the statement was
// made from — the same values in the create flow and in a re-download from
// Tidigare värderingar.
//
// The identifier is `objekt_short`, the property as the statement's running
// text names it: a beteckning with its kommun for a house ("Testby Eklunda
// 1:76"), "LGH <nr> <förening>" for an apartment. `objekt` without its
// parenthesised org number stands in when it is blank, then the street
// address; with none of them the name is "Värdeutlåtande <datum>".

const MAX_STEM = 120;
// Windows' reserved device names cannot be a file name, extension or not.
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** A file-name stem safe on Windows, macOS and Linux; '' when nothing is left.
 *  A beteckning's ":" becomes "-" ("Eklunda 1:76" → "Eklunda 1-76"); the other
 *  forbidden characters and control characters become spaces. Å, ä and ö stay. */
export function safeStem(value) {
  const stem = String(value ?? '')
    .normalize('NFC')
    .replace(/:/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot hides the file on macOS and Linux; Windows drops trailing
    // dots and spaces, so a name ending in one is not the name that was saved.
    .replace(/^[. ]+|[. ]+$/g, '');
  // Truncate, then strip again: a cut can land on a space or a dot.
  return [...stem].slice(0, MAX_STEM).join('').replace(/[. ]+$/, '');
}

/** "Testby Eklunda 1-76.docx"; "Värdeutlåtande 2026-10-22.pdf" with no
 *  identifier. `values` is the statement's field set (the review form or a
 *  saved row's final_values); `ext` is "docx" or "pdf". */
export function statementFilename(values, ext) {
  const v = values || {};
  const candidates = [
    v.objekt_short,
    String(v.objekt ?? '').replace(/\([^)]*\)/g, ' '),
    v.adress,
  ];
  let stem = candidates.map(safeStem).find(Boolean) || '';
  if (!stem || RESERVED.test(stem)) {
    const datum = safeStem(v.datum) || new Date().toLocaleDateString('sv-SE');
    stem = stem ? `Värdeutlåtande ${stem}` : `Värdeutlåtande ${datum}`;
  }
  return `${stem}.${ext}`;
}
