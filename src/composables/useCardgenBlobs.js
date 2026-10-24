import { getCurrentInstance, onBeforeUnmount } from 'vue';
import { useCardgen } from './useCardgen.js';

// system_3 #8634 / #8648: blob URLs and fonts for card assets. The server
// serves an asset's bytes with the type it sniffed at upload (inline only for
// raster images); the client fetches them as a blob and renders through an
// <img>, an <iframe> (PDF) or a FontFace, never through a document context the
// bytes could script (security review, #8634 c53354 item 1). Object URLs are
// revoked when the owning component unmounts.
export function useCardgenBlobs() {
  const { fetchAssetBlob } = useCardgen();
  const urls = new Map();
  const fonts = new Map();

  /** Object URL for an asset's bytes, or null with the error in prose. */
  async function urlFor(id) {
    if (urls.has(id)) return { url: urls.get(id), error: null };
    const { blob, error } = await fetchAssetBlob(id);
    if (!blob) return { url: null, error: error || 'Could not fetch the asset' };
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return { url, error: null };
  }

  /** Loads a font asset into document.fonts under `cardgen-font-<id>` and
   *  returns the family name. The name is returned even when the bytes do not
   *  load, with the error in prose, so a sample can still name the family. */
  async function fontFor(id) {
    const family = `cardgen-font-${id}`;
    if (fonts.has(id)) return { family, error: fonts.get(id) };
    const { blob, error } = await fetchAssetBlob(id);
    if (!blob) {
      fonts.set(id, error || 'Could not fetch the font');
      return { family, error: fonts.get(id) };
    }
    try {
      const face = new FontFace(family, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      fonts.set(id, null);
    } catch {
      fonts.set(id, 'The font could not be loaded by the browser');
    }
    return { family, error: fonts.get(id) };
  }

  function release() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  }

  if (getCurrentInstance()) onBeforeUnmount(release);
  return { urlFor, fontFor, release };
}

/** Millimetres an image covers when printed at `dpi` from its pixel count. */
export function mmAtDpi(pixels, dpi = 300) {
  if (!pixels || !dpi) return 0;
  return Math.round(((pixels / dpi) * 25.4) * 10) / 10;
}

export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
