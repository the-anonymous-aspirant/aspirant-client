import jsQR from 'jsqr';
import type { Locator } from '@playwright/test';

/** Read a rendered QR <img> back to the text it encodes (#9132). The image's
 *  pixels are read through a canvas in the page and decoded here with jsQR.
 *  The decoder needs a quiet zone, and the room's code is drawn with margin 0,
 *  so the image is padded before decoding. The pad colour cannot be read off
 *  the image (with margin 0 every corner is a dark finder module), so both a
 *  white and a black pad are tried, each in both polarities (SupportView draws
 *  light on dark). The bytes are decoded as UTF-8, as the site encodes them. */
export async function decodeQrImage(img: Locator): Promise<{ src: string; width: number; text: string | null }> {
  const px = await img.evaluate(async (el: HTMLImageElement) => {
    if (!el.complete || !el.naturalWidth) await new Promise((r) => el.addEventListener('load', r, { once: true }));
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { src: el.src, width: c.width, height: c.height, data: Array.from(d.data) };
  });

  const pad = 16;
  for (const shade of [255, 0]) {
    const w = px.width + pad * 2;
    const h = px.height + pad * 2;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = shade;
      out[i + 1] = shade;
      out[i + 2] = shade;
      out[i + 3] = 255;
    }
    for (let y = 0; y < px.height; y += 1) {
      const src = y * px.width * 4;
      out.set(px.data.slice(src, src + px.width * 4), ((y + pad) * w + pad) * 4);
    }
    const found = jsQR(out, w, h, { inversionAttempts: 'attemptBoth' });
    if (found) {
      return { src: px.src, width: px.width, text: new TextDecoder('utf-8').decode(Uint8Array.from(found.binaryData)) };
    }
  }
  return { src: px.src, width: px.width, text: null };
}
