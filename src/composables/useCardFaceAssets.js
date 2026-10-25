import { reactive } from 'vue';
import { useCardgenBlobs } from './useCardgenBlobs.js';

// system_3 #8634 / #8649: the assets a set of resolved card faces needs,
// resolved once each into blob URLs (images) and FontFace families (fonts)
// for CardFace.vue. Ids are the server's; the renderer never builds a URL
// from anything else.
export function useCardFaceAssets() {
  const blobs = useCardgenBlobs();
  const assetUrls = reactive({});
  const fontFamilies = reactive({});
  const pending = new Map();

  function idsOf(faces) {
    const images = new Set();
    const fonts = new Set();
    for (const face of faces) {
      for (const el of face?.elements || []) {
        const p = el.props || {};
        if (Number.isInteger(p.asset_id) && p.asset_id > 0) images.add(p.asset_id);
        if (Number.isInteger(p.font_asset_id) && p.font_asset_id > 0) fonts.add(p.font_asset_id);
      }
    }
    return { images, fonts };
  }

  /** Resolves every asset the faces reference; resolves when all are settled. */
  async function ensure(faces) {
    const { images, fonts } = idsOf(faces);
    const work = [];
    for (const id of images) {
      if (assetUrls[id] || pending.has(`i${id}`)) continue;
      const p = blobs.urlFor(id, ['image/']).then(({ url }) => {
        if (url) assetUrls[id] = url;
        pending.delete(`i${id}`);
      });
      pending.set(`i${id}`, p);
      work.push(p);
    }
    for (const id of fonts) {
      if (fontFamilies[id] || pending.has(`f${id}`)) continue;
      const p = blobs.fontFor(id).then(({ family }) => {
        fontFamilies[id] = family;
        pending.delete(`f${id}`);
      });
      pending.set(`f${id}`, p);
      work.push(p);
    }
    await Promise.all(work);
  }

  return { assetUrls, fontFamilies, ensure, release: blobs.release };
}
