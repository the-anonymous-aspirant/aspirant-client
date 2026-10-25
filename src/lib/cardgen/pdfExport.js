// system_3 #8634 / #8652: the print export. Pure functions from the server's
// resolved faces, an export profile and the fetched assets to a pdfmake
// document definition plus the layout facts the panel shows. No DOM here; the
// panel fetches bytes, rasterises what pdfmake cannot draw and registers
// fonts, then hands maps in.
//
// Geometry is in millimetres until the last step; pdfmake wants points.
// A sheet is the profile's page (plus the bleed on every side when crop marks
// are on, so the marks fall outside the trim) with `cols` x `rows` trim boxes
// centred on it. A card is drawn at trim size; its edge-touching rects and
// images extend into the bleed where there is room (the page edge, or half the
// gap between neighbours), text stays inside the trim. Back pages, when the
// profile says `mirror` and a card has a back, follow each front page with the
// columns reversed so a long-edge duplex lines up.

import { parseEmphasis, plainText } from './emphasis.js';
import { dpiOf, mmToPt } from './units.js';

export const PAGE_SIZES_MM = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };
const CROP_MARK_LEN_MM = 4;
const CROP_MARK_GAP_MM = 0.75;
const FALLBACK_FONT = 'Roboto';

function round(n) {
  return Math.round(n * 1000) / 1000;
}

/** The sheet geometry of a profile: page size (points and mm), slot trim boxes in mm. */
export function sheetLayout(profile) {
  const sheet = profile.sheet || {};
  let [pw, ph] = sheet.page === 'custom' ? [sheet.page_w_mm, sheet.page_h_mm] : PAGE_SIZES_MM[sheet.page || 'A4'] || PAGE_SIZES_MM.A4;
  if (sheet.orientation === 'landscape') [pw, ph] = [ph, pw];
  const bleed = profile.bleed_mm || 0;
  const marks = !!profile.crop_marks;
  const edge = marks ? bleed : 0;
  const pageW = pw + 2 * edge;
  const pageH = ph + 2 * edge;
  const cols = Math.max(1, sheet.cols || 1);
  const rows = Math.max(1, sheet.rows || 1);
  const gap = sheet.gap_mm || 0;
  const cw = profile.card_w_mm;
  const ch = profile.card_h_mm;
  const gridW = cols * cw + (cols - 1) * gap;
  const gridH = rows * ch + (rows - 1) * gap;
  const ox = (pageW - gridW) / 2;
  const oy = (pageH - gridH) / 2;
  const slots = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      slots.push({ row: r, col: c, x: ox + c * (cw + gap), y: oy + r * (ch + gap), w: cw, h: ch });
    }
  }
  // How far a card may extend past its trim on each side: the page edge
  // (the bleed, when the page carries it) or half the gap between neighbours.
  const extend = (slot) => ({
    left: Math.min(bleed, slot.col === 0 ? slot.x : gap / 2),
    right: Math.min(bleed, slot.col === cols - 1 ? pageW - (slot.x + cw) : gap / 2),
    top: Math.min(bleed, slot.row === 0 ? slot.y : gap / 2),
    bottom: Math.min(bleed, slot.row === rows - 1 ? pageH - (slot.y + ch) : gap / 2),
  });
  return { pageW, pageH, cols, rows, gap, bleed, marks, slots, extend, perPage: cols * rows };
}

function fontFor(el, fonts) {
  const id = el.props.font_asset_id;
  if (id && fonts && fonts.has(id)) return { font: `cardgen-font-${id}`, fallback: false };
  return { font: FALLBACK_FONT, fallback: !!id };
}

/**
 * Builds one card's drawing primitives at slot (sx, sy) in mm.
 * `face` is a resolved face; `assets` maps asset id -> { dataUrl, pixelWidth, pixelHeight }.
 */
function drawFace(face, slot, ext, profile, assets, fonts, warnings, cardName, canvasOps, nodes, crop) {
  const sx = profile.card_w_mm / (face.size?.w_mm || profile.card_w_mm);
  const sy = profile.card_h_mm / (face.size?.h_mm || profile.card_h_mm);
  // The card's own paper: white, extended into the bleed.
  canvasOps.push({
    type: 'rect',
    x: mmToPt(slot.x - ext.left),
    y: mmToPt(slot.y - ext.top),
    w: mmToPt(slot.w + ext.left + ext.right),
    h: mmToPt(slot.h + ext.top + ext.bottom),
    color: '#ffffff',
    lineWidth: 0,
    lineColor: '#ffffff',
  });
  const elements = [...(face.elements || [])].filter((el) => !el.props?.hidden).sort((a, b) => (a.props.z || 0) - (b.props.z || 0));
  for (const el of elements) {
    const p = el.props || {};
    const box = { x: (p.x_mm || 0) * sx, y: (p.y_mm || 0) * sy, w: (p.w_mm || 0) * sx, h: (p.h_mm || 0) * sy };
    // Edge-touching boxes grow into the bleed on the sides they touch.
    const bleedBox = { ...box };
    if (box.x <= 0.01) { bleedBox.x -= ext.left; bleedBox.w += ext.left; }
    if (box.x + box.w >= slot.w - 0.01) bleedBox.w += ext.right;
    if (box.y <= 0.01) { bleedBox.y -= ext.top; bleedBox.h += ext.top; }
    if (box.y + box.h >= slot.h - 0.01) bleedBox.h += ext.bottom;
    const absX = slot.x + bleedBox.x;
    const absY = slot.y + bleedBox.y;
    const opacity = p.opacity == null ? 1 : p.opacity;
    if (p.kind === 'rect') {
      const op = { type: 'rect', x: mmToPt(absX), y: mmToPt(absY), w: mmToPt(bleedBox.w), h: mmToPt(bleedBox.h), fillOpacity: opacity };
      if (p.fill) op.color = p.fill;
      if (p.stroke) { op.lineColor = p.stroke; op.lineWidth = mmToPt(p.stroke_mm || 0.3); } else op.lineWidth = 0;
      if (!p.fill && !p.stroke) continue;
      canvasOps.push(op);
    } else if (p.kind === 'image') {
      const a = p.asset_id ? assets.get(p.asset_id) : null;
      if (!a) {
        if (p.asset_id) warnings.push({ card: cardName, element: el.name, kind: 'missing-asset', message: `${cardName}: ${el.name} references asset ${p.asset_id}, which could not be loaded` });
        continue;
      }
      const w = mmToPt(bleedBox.w);
      const h = mmToPt(bleedBox.h);
      const node = { image: a.dataUrl, absolutePosition: { x: mmToPt(absX), y: mmToPt(absY) }, opacity };
      const fit = p.fit || 'cover';
      if (fit === 'cover') {
        // pdfmake cannot clip, so cover = the caller crops the raster to the
        // box's aspect (a canvas in the panel) and it is placed at box size.
        node.image = crop ? crop(p.asset_id, bleedBox.w / bleedBox.h) : a.dataUrl;
        node.width = w;
        node.height = h;
      } else if (fit === 'contain') {
        const s = Math.min(w / a.pixelWidth, h / a.pixelHeight);
        const dw = a.pixelWidth * s;
        const dh = a.pixelHeight * s;
        node.width = dw;
        node.height = dh;
        node.absolutePosition = { x: mmToPt(absX) + (w - dw) / 2, y: mmToPt(absY) + (h - dh) / 2 };
      } else {
        node.width = w;
        node.height = h;
      }
      nodes.push(node);
      const dpi = Math.min(dpiOf(a.pixelWidth, bleedBox.w), dpiOf(a.pixelHeight, bleedBox.h));
      if (dpi && profile.dpi && dpi < profile.dpi) {
        warnings.push({
          card: cardName,
          element: el.name,
          kind: 'low-dpi',
          assetId: p.asset_id,
          boxW: bleedBox.w,
          boxH: bleedBox.h,
          dpi: Math.round(dpi),
          message: `${cardName}: ${el.name} is ${a.pixelWidth}×${a.pixelHeight} px over ${round(bleedBox.w)}×${round(bleedBox.h)} mm, ${Math.round(dpi)} DPI against the profile's ${profile.dpi}`,
        });
      }
    } else {
      // text: inside the trim, never into the bleed
      const { font, fallback } = fontFor(el, fonts);
      if (fallback) warnings.push({ card: cardName, element: el.name, kind: 'font-fallback', message: `${cardName}: ${el.name} asks for font asset ${p.font_asset_id}, which is not loaded; ${FALLBACK_FONT} is used` });
      const upper = p.transform === 'uppercase';
      // `*word*` emphasis (#8754 R2): an emphasised run is bold and underlined,
      // the same two properties CardFace's .el-em draws.
      const runs = parseEmphasis(p.text || '').map((r) => {
        const t = upper ? r.text.toUpperCase() : r.text;
        return r.em ? { text: t, bold: true, decoration: 'underline' } : { text: t };
      });
      const text = runs.length === 1 && !runs[0].bold ? runs[0].text : runs.length ? runs : '';
      const flat = plainText(p.text || '');
      const size = p.size_pt || 10;
      const lineHeight = p.line_height || 1.2;
      // No clipping in pdfmake: the box width wraps the text, the box height
      // only positions it for middle and bottom alignment (an estimate).
      const widthPt = mmToPt(box.w);
      const avgChar = size * 0.5;
      const lines = Math.max(1, Math.ceil((flat.length * avgChar) / Math.max(widthPt, 1)) + (flat.match(/\n/g) || []).length);
      const textH = lines * size * lineHeight;
      let y = mmToPt(slot.y + box.y);
      if (p.valign === 'middle') y += Math.max(0, (mmToPt(box.h) - textH) / 2);
      else if (p.valign === 'bottom') y += Math.max(0, mmToPt(box.h) - textH);
      nodes.push({
        columns: [{
          width: widthPt,
          text,
          font,
          fontSize: size,
          bold: p.weight === 'bold',
          italics: !!p.italic,
          color: p.color || '#111111',
          alignment: p.align || 'left',
          lineHeight,
          characterSpacing: p.letter_spacing ? p.letter_spacing : 0,
          opacity,
        }],
        absolutePosition: { x: mmToPt(slot.x + box.x), y },
      });
    }
  }
}

function cropMarks(slot, ext, canvasOps) {
  // Ticks run from just outside the trim to the edge of the room the card has
  // on that side (the bleed at the page edge, half the gap between
  // neighbours; none where cards touch, because the cut line is shared).
  // They are drawn after the artwork, so they read on a full-bleed image.
  const inset = CROP_MARK_GAP_MM;
  const sides = [
    // [corner x, corner y, horizontal direction, vertical direction]
    [slot.x, slot.y, -1, -1],
    [slot.x + slot.w, slot.y, 1, -1],
    [slot.x, slot.y + slot.h, -1, 1],
    [slot.x + slot.w, slot.y + slot.h, 1, 1],
  ];
  for (const [x, y, dx, dy] of sides) {
    const roomX = dx < 0 ? ext.left : ext.right;
    const roomY = dy < 0 ? ext.top : ext.bottom;
    if (roomX > inset) {
      canvasOps.push({ type: 'line', x1: mmToPt(x + dx * inset), y1: mmToPt(y), x2: mmToPt(x + dx * Math.min(roomX, inset + CROP_MARK_LEN_MM)), y2: mmToPt(y), lineWidth: 0.25, lineColor: '#000000' });
    }
    if (roomY > inset) {
      canvasOps.push({ type: 'line', x1: mmToPt(x), y1: mmToPt(y + dy * inset), x2: mmToPt(x), y2: mmToPt(y + dy * Math.min(roomY, inset + CROP_MARK_LEN_MM)), lineWidth: 0.25, lineColor: '#000000' });
    }
  }
}

/**
 * One line per undersized asset, not per face (#8754 R3, §1.6): the asset, its
 * pixels, the DPI range it prints at, how many faces, and the pixels the
 * profile's DPI needs at the largest box it is placed in. The per-face
 * entries stay on the group for a disclosure.
 */
export function groupDpiWarnings(warnings, profile, assets = new Map()) {
  const byAsset = new Map();
  for (const w of warnings) {
    if (w.kind !== 'low-dpi') continue;
    const g = byAsset.get(w.assetId) || { assetId: w.assetId, entries: [], minDpi: Infinity, maxDpi: 0, maxW: 0, maxH: 0 };
    g.entries.push(w);
    g.minDpi = Math.min(g.minDpi, w.dpi);
    g.maxDpi = Math.max(g.maxDpi, w.dpi);
    g.maxW = Math.max(g.maxW, w.boxW);
    g.maxH = Math.max(g.maxH, w.boxH);
    byAsset.set(w.assetId, g);
  }
  const dpi = profile.dpi || 300;
  return [...byAsset.values()].map((g) => {
    const a = assets.get(g.assetId) || {};
    const name = a.name || `asset ${g.assetId}`;
    const needW = Math.ceil((g.maxW / 25.4) * dpi);
    const needH = Math.ceil((g.maxH / 25.4) * dpi);
    const range = g.minDpi === g.maxDpi ? `${g.minDpi}` : `${g.minDpi}-${g.maxDpi}`;
    const faces = g.entries.length;
    return {
      assetId: g.assetId,
      name,
      pixelWidth: a.pixelWidth,
      pixelHeight: a.pixelHeight,
      faces,
      entries: g.entries,
      needWidth: needW,
      needHeight: needH,
      message: `(${a.pixelWidth}×${a.pixelHeight} px) prints at ${range} DPI on ${faces} ${faces === 1 ? 'face' : 'faces'}; ${dpi} DPI needs ${needW}×${needH} px`,
    };
  });
}

/**
 * @param {Array<{name: string, resolved: {front: object, back: object|null}}>} cards
 * @param {object} profile the export profile spec
 * @param {Map<number, {dataUrl: string, pixelWidth: number, pixelHeight: number}>} assets
 * @param {Set<number>} fonts font asset ids registered with pdfmake
 * @param {(assetId: number, aspect: number) => string} [crop] returns a data URL of the asset cropped to `aspect` (w/h), for `fit: cover`
 */
export function buildExportDocument(cards, profile, assets = new Map(), fonts = new Set(), crop = null) {
  const layout = sheetLayout(profile);
  const warnings = [];
  const mirror = profile.backs === 'mirror';
  const pages = [];
  for (let i = 0; i < cards.length; i += layout.perPage) {
    const batch = cards.slice(i, i + layout.perPage);
    const front = { canvasOps: [], nodes: [], marks: [] };
    batch.forEach((c, j) => {
      const slot = layout.slots[j];
      drawFace(c.resolved.front, slot, layout.extend(slot), profile, assets, fonts, warnings, c.name, front.canvasOps, front.nodes, crop);
    });
    if (layout.marks) batch.forEach((c, j) => cropMarks(layout.slots[j], layout.extend(layout.slots[j]), front.marks));
    pages.push(front);
    if (mirror && batch.some((c) => c.resolved.back)) {
      const back = { canvasOps: [], nodes: [], marks: [] };
      batch.forEach((c, j) => {
        if (!c.resolved.back) return;
        const s = layout.slots[j];
        const slot = layout.slots.find((x) => x.row === s.row && x.col === layout.cols - 1 - s.col);
        drawFace(c.resolved.back, slot, layout.extend(slot), profile, assets, fonts, warnings, `${c.name} (back)`, back.canvasOps, back.nodes, crop);
      });
      if (layout.marks) batch.forEach((c, j) => {
        if (!c.resolved.back) return;
        const s = layout.slots[j];
        const slot = layout.slots.find((x) => x.row === s.row && x.col === layout.cols - 1 - s.col);
        cropMarks(slot, layout.extend(slot), back.marks);
      });
      pages.push(back);
    }
  }
  const content = [];
  pages.forEach((pg, idx) => {
    const first = { canvas: pg.canvasOps, absolutePosition: { x: 0, y: 0 } };
    if (idx > 0) first.pageBreak = 'before';
    content.push(first);
    content.push(...pg.nodes);
    if (pg.marks.length) content.push({ canvas: pg.marks, absolutePosition: { x: 0, y: 0 } });
  });
  if (!content.length) content.push({ text: '' });
  const doc = {
    pageSize: { width: mmToPt(layout.pageW), height: mmToPt(layout.pageH) },
    pageMargins: [0, 0, 0, 0],
    content,
    defaultStyle: { font: FALLBACK_FONT },
    info: { title: 'Constellations cards' },
  };
  return { doc, pages: pages.length, perPage: layout.perPage, layout, warnings, dpiGroups: groupDpiWarnings(warnings, profile, assets) };
}
