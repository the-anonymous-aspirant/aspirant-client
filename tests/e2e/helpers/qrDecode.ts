import jsQR from 'jsqr';
import type { Locator } from '@playwright/test';

/** Read a rendered QR <img> back to the text it encodes (#9132). The image is
 *  drawn onto a canvas in the page, padded with a quiet zone in its own corner
 *  colour (the room's code is drawn with margin 0, and the decoder wants one),
 *  and decoded here with jsQR, trying both polarities (SupportView draws light
 *  on dark). The bytes are decoded as UTF-8, as the site encodes them. */
export async function decodeQrImage(img: Locator): Promise<{ src: string; width: number; text: string | null }> {
  const px = await img.evaluate(async (el: HTMLImageElement) => {
    if (!el.complete || !el.naturalWidth) await new Promise((r) => el.addEventListener('load', r, { once: true }));
    const pad = 16;
    const c = document.createElement('canvas');
    c.width = el.naturalWidth + pad * 2;
    c.height = el.naturalHeight + pad * 2;
    const ctx = c.getContext('2d')!;
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const pctx = probe.getContext('2d')!;
    pctx.drawImage(el, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(el, pad, pad);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { src: el.src, naturalWidth: el.naturalWidth, width: c.width, height: c.height, data: Array.from(d.data) };
  });
  const found = jsQR(Uint8ClampedArray.from(px.data), px.width, px.height, { inversionAttempts: 'attemptBoth' });
  return {
    src: px.src,
    width: px.naturalWidth,
    text: found ? new TextDecoder('utf-8').decode(Uint8Array.from(found.binaryData)) : null,
  };
}
