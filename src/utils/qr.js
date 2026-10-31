import qrcode from 'qrcode-generator';

// QR codes drawn in the browser (#9132, operator c57326). These used to be
// <img src="https://api.qrserver.com/...?data=<text>">, which sent whatever was
// encoded (a private link, a room code) to a third party, and kept that origin
// in the site's content policy. Now the module matrix is computed here and
// painted on a canvas; the result is a blob: URL, which img-src already allows.

// The library's own string-to-bytes keeps only the low byte of each UTF-16
// unit, so "å" would be encoded as a different character. Encode as UTF-8 and
// hand it the bytes as a binary string, which byte mode takes verbatim.
function utf8Binary(text) {
  let out = '';
  for (const b of new TextEncoder().encode(text)) out += String.fromCharCode(b);
  return out;
}

/**
 * Draw `text` as a QR code and resolve to a PNG Blob.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.size=200] edge length in CSS px (the PNG is this many px)
 * @param {string} [opts.dark='#000000'] module colour
 * @param {string} [opts.light='#ffffff'] background colour
 * @param {number} [opts.margin=4] quiet zone, in modules (the spec's minimum is 4)
 * @returns {Promise<Blob>}
 */
export function qrPngBlob(text, { size = 200, dark = '#000000', light = '#ffffff', margin = 4 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(utf8Binary(text), 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const cells = count + margin * 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = dark;
  // Module edges on whole pixels, so no module bleeds into its neighbour.
  const edge = (i) => Math.round((i * size) / cells);
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (!qr.isDark(r, c)) continue;
      const x = edge(c + margin);
      const y = edge(r + margin);
      ctx.fillRect(x, y, edge(c + margin + 1) - x, edge(r + margin + 1) - y);
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('QR canvas produced no image'))), 'image/png');
  });
}

/**
 * A reactive-friendly holder for one QR image: `set(text, opts)` draws and
 * swaps in a fresh blob: URL, revoking the previous one; `clear()` revokes it.
 * Each view keeps one per code it shows and calls `clear()` on unmount.
 */
export function createQrImage(onUrl) {
  let url = '';
  let blob = null;
  let seq = 0;
  return {
    async set(text, opts) {
      const mine = (seq += 1);
      const next = await qrPngBlob(text, opts);
      if (mine !== seq) return; // a newer set() won the race
      if (url) URL.revokeObjectURL(url);
      blob = next;
      url = URL.createObjectURL(next);
      onUrl(url);
    },
    clear() {
      seq += 1;
      if (url) URL.revokeObjectURL(url);
      url = '';
      blob = null;
      onUrl('');
    },
    blob: () => blob,
  };
}
