// "Bilder från kund har tagits i beaktning." (system_3 #8420). Jenny asked for a
// box to tick when the customer sent photos, so the statement says so without
// her typing it. The tick writes the sentence into the free-text note itself —
// `bilder_note`, which the commander places at the end of the "Beskrivning"
// paragraph — so the field always shows what the document will say, and a
// saved valuation keeps it with no separate flag.

export const BILDER_FRAN_KUND = 'Bilder från kund har tagits i beaktning.';

/** Ticked ⇔ the note carries the sentence. */
export function hasBilderFranKund(note) {
  return String(note ?? '').includes(BILDER_FRAN_KUND);
}

/** The note with the sentence first — photos, then the condition assessment,
 *  the template placeholder's own order. Whatever was typed stays as typed. */
export function withBilderFranKund(note) {
  const text = String(note ?? '');
  if (hasBilderFranKund(text)) return text;
  return text.trim() ? `${BILDER_FRAN_KUND} ${text}` : BILDER_FRAN_KUND;
}

/** The note without the sentence and the one space that joined it to the
 *  rest; nothing else is touched. */
export function withoutBilderFranKund(note) {
  const text = String(note ?? '');
  const at = text.indexOf(BILDER_FRAN_KUND);
  if (at < 0) return text;
  let before = text.slice(0, at);
  let after = text.slice(at + BILDER_FRAN_KUND.length);
  if (after.startsWith(' ')) after = after.slice(1);
  else if (before.endsWith(' ')) before = before.slice(0, -1);
  return before + after;
}
