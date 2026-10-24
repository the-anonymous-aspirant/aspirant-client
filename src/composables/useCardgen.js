import axios from 'axios';

// system_3 #8634 / #8645: the card editor's API module. One function per
// server route under /api/cardgen (aspirant-server #8642 assets, #8643 types
// and templates, #8644 export profiles, #8646 cards), each returning
// `{ ...data, error }` rather than throwing, the shape useBrowserFlows.js set.
// The server is the source of truth for everything here: it validates specs,
// resolves template chains and gates every route to Admin.

const API_BASE = '/api/cardgen';

function extractError(err, fallback) {
  return err.response?.data?.error?.message || err.response?.data?.detail || fallback;
}

async function call(fn, key, fallbackValue, fallbackMessage) {
  try {
    const resp = await fn();
    const payload = resp.data || {};
    return { [key]: payload[key] ?? fallbackValue, error: null };
  } catch (err) {
    return { [key]: fallbackValue, error: extractError(err, fallbackMessage) };
  }
}

/** Browser-facing URL of an asset's bytes; the server sets the type and the
 *  disposition (inline only for raster images). Consumers fetch it as a blob
 *  and render through <img>, an iframe (PDF) or FontFace (fonts). */
export function assetContentUrl(id) {
  return `${API_BASE}/assets/${id}/content`;
}

export function useCardgen() {
  // ---- assets (#8642, #8647) ------------------------------------------------
  const listAssets = (kind) =>
    call(() => axios.get(`${API_BASE}/assets`, { params: kind ? { kind } : {} }), 'assets', [], 'Could not list assets');
  const getAsset = (id) => call(() => axios.get(`${API_BASE}/assets/${id}`), 'asset', null, 'Could not load the asset');
  const getAssetUsage = (id) => call(() => axios.get(`${API_BASE}/assets/${id}/usage`), 'usage', null, 'Could not load where the asset is used');
  const deleteAsset = (id) => call(() => axios.delete(`${API_BASE}/assets/${id}`), 'data', null, 'Could not delete the asset');
  /** Uploads one file; onProgress gets a 0..100 integer as the bytes go up. */
  async function uploadAsset(file, onProgress) {
    const form = new FormData();
    form.append('file', file, file.name);
    try {
      const resp = await axios.post(`${API_BASE}/assets`, form, {
        onUploadProgress: (evt) => {
          if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      return { asset: resp.data?.asset ?? null, deduplicated: !!resp.data?.deduplicated, error: null };
    } catch (err) {
      return { asset: null, deduplicated: false, error: extractError(err, `Could not upload ${file.name}`) };
    }
  }
  async function fetchAssetBlob(id) {
    try {
      const resp = await axios.get(assetContentUrl(id), { responseType: 'blob' });
      return { blob: resp.data, error: null };
    } catch (err) {
      return { blob: null, error: extractError(err, 'Could not fetch the asset') };
    }
  }

  // ---- types and templates (#8643) ------------------------------------------
  const listTypes = () => call(() => axios.get(`${API_BASE}/types`), 'types', [], 'Could not list card types');
  const createType = (body) => call(() => axios.post(`${API_BASE}/types`, body), 'type', null, 'Could not create the card type');
  const updateType = (id, body) => call(() => axios.put(`${API_BASE}/types/${id}`, body), 'type', null, 'Could not update the card type');

  const listTemplates = () => call(() => axios.get(`${API_BASE}/templates`), 'templates', [], 'Could not list templates');
  const getTemplate = (id) => call(() => axios.get(`${API_BASE}/templates/${id}`), 'template', null, 'Could not load the template');
  const createTemplate = (body) => call(() => axios.post(`${API_BASE}/templates`, body), 'template', null, 'Could not create the template');
  const updateTemplate = (id, body) => call(() => axios.put(`${API_BASE}/templates/${id}`, body), 'template', null, 'Could not update the template');
  const deleteTemplate = (id) => call(() => axios.delete(`${API_BASE}/templates/${id}`), 'data', null, 'Could not delete the template');
  const listTemplateVersions = (id) => call(() => axios.get(`${API_BASE}/templates/${id}/versions`), 'versions', [], 'Could not list the versions');
  const saveTemplateVersion = (id, spec, note) => call(() => axios.post(`${API_BASE}/templates/${id}/versions`, { spec, note }), 'version', null, 'Could not save the template');
  const restoreTemplateVersion = (id, n) => call(() => axios.post(`${API_BASE}/templates/${id}/versions/${n}/restore`), 'version', null, 'Could not restore that version');
  const resolveTemplate = (id) => call(() => axios.get(`${API_BASE}/templates/${id}/resolved`), 'resolved', null, 'Could not resolve the template');

  // ---- export profiles (#8644) ----------------------------------------------
  const listExportProfiles = () => call(() => axios.get(`${API_BASE}/export-profiles`), 'profiles', [], 'Could not list export profiles');
  const createExportProfile = (body) => call(() => axios.post(`${API_BASE}/export-profiles`, body), 'profile', null, 'Could not create the export profile');
  const updateExportProfile = (id, body) => call(() => axios.put(`${API_BASE}/export-profiles/${id}`, body), 'profile', null, 'Could not update the export profile');
  const deleteExportProfile = (id) => call(() => axios.delete(`${API_BASE}/export-profiles/${id}`), 'data', null, 'Could not delete the export profile');

  // ---- cards (#8646) ---------------------------------------------------------
  const listCards = (typeId) =>
    call(() => axios.get(`${API_BASE}/cards`, { params: typeId ? { type_id: typeId } : {} }), 'cards', [], 'Could not list cards');
  const getCard = (id) => call(() => axios.get(`${API_BASE}/cards/${id}`), 'card', null, 'Could not load the card');
  const createCard = (body) => call(() => axios.post(`${API_BASE}/cards`, body), 'card', null, 'Could not create the card');
  const updateCard = (id, body) => call(() => axios.put(`${API_BASE}/cards/${id}`, body), 'card', null, 'Could not update the card');
  const deleteCard = (id) => call(() => axios.delete(`${API_BASE}/cards/${id}`), 'data', null, 'Could not delete the card');
  const listCardVersions = (id) => call(() => axios.get(`${API_BASE}/cards/${id}/versions`), 'versions', [], 'Could not list the versions');
  const saveCardVersion = (id, data, note) => call(() => axios.post(`${API_BASE}/cards/${id}/versions`, { data, note }), 'version', null, 'Could not save the card');
  const restoreCardVersion = (id, n) => call(() => axios.post(`${API_BASE}/cards/${id}/versions/${n}/restore`), 'version', null, 'Could not restore that version');
  const resolveCard = (id) => call(() => axios.get(`${API_BASE}/cards/${id}/resolved`), 'resolved', null, 'Could not resolve the card');

  return {
    listAssets, getAsset, getAssetUsage, deleteAsset, uploadAsset, fetchAssetBlob,
    listTypes, createType, updateType,
    listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
    listTemplateVersions, saveTemplateVersion, restoreTemplateVersion, resolveTemplate,
    listExportProfiles, createExportProfile, updateExportProfile, deleteExportProfile,
    listCards, getCard, createCard, updateCard, deleteCard,
    listCardVersions, saveCardVersion, restoreCardVersion, resolveCard,
  };
}
