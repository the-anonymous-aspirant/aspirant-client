// system_3 #8754 (D2 R1): one fallback font on screen and on paper. The PDF
// export falls back to pdfmake's bundled Roboto (Regular for normal text,
// Medium for bold, the Italic pair for italics); the DOM renderer fell back to
// the generic `sans-serif`, so the same body text wrapped at different points
// in the review and in the file. This registers the same four Roboto files as
// one FontFace family, so `CardFace` and `pdfExport` set text in the same
// glyphs and the review page is the print-scale preview it claims to be.
import pdfFonts from 'pdfmake/build/vfs_fonts';

export const FALLBACK_FAMILY = 'cardgen-fallback';

// pdfmake's default client fonts map bold to Roboto-Medium, so weight 700 here
// is the Medium file too (the browser must not pick a different face).
const FACES = [
  ['Roboto-Regular.ttf', { weight: '400', style: 'normal' }],
  ['Roboto-Medium.ttf', { weight: '700', style: 'normal' }],
  ['Roboto-Italic.ttf', { weight: '400', style: 'italic' }],
  ['Roboto-MediumItalic.ttf', { weight: '700', style: 'italic' }],
];

let loading = null;

function base64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Registers the fallback family once; resolves true when all four faces loaded. */
export function ensureFallbackFont() {
  if (loading) return loading;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    loading = Promise.resolve(false);
    return loading;
  }
  const vfs = pdfFonts && pdfFonts.vfs ? pdfFonts.vfs : pdfFonts;
  loading = Promise.all(
    FACES.map(async ([file, descriptors]) => {
      const data = vfs && vfs[file];
      if (!data) return false;
      const face = new FontFace(FALLBACK_FAMILY, base64ToBuffer(data), descriptors);
      await face.load();
      document.fonts.add(face);
      return true;
    }),
  )
    .then((results) => results.every(Boolean))
    .catch(() => false);
  return loading;
}
