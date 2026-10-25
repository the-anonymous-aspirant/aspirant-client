// system_3 #8634 / #8652: the three unit conversions the card renderers share.
// CSS px at zoom 1 (CardFace.vue), PDF points (pdfExport.js) and inches for
// the DPI check all derive from millimetres, the unit every spec is written in.

export const PX_PER_MM = 96 / 25.4;
export const PT_PER_MM = 72 / 25.4;
export const PT_PER_PX = 72 / 96;

export function mmToPt(mm) {
  return mm * PT_PER_MM;
}

export function ptToMm(pt) {
  return pt / PT_PER_MM;
}

export function mmToPx(mm) {
  return mm * PX_PER_MM;
}

export function mmToIn(mm) {
  return mm / 25.4;
}

/** Effective DPI of a raster printed over `mm` millimetres. */
export function dpiOf(pixels, mm) {
  if (!pixels || !mm) return 0;
  return pixels / mmToIn(mm);
}
