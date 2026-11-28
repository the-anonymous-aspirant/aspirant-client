import axios from 'axios';

// system_3 #12582: the Christmas cards' API module, one function per server
// route under /api/christmas (aspirant-server PR 258). Every route is
// Admin-only on the server. Play's routes never carry a word; Control's do.
// Each function returns `{ data, error }` and never throws: `error` is
// `{ status, code }` (status 0 when the server was not reached), and the
// views word it themselves.

const API_BASE = '/api/christmas';

function failure(err) {
  return { data: null, error: { status: err.response?.status || 0, code: err.response?.data?.error?.code || '' } };
}

async function call(fn) {
  try {
    const resp = await fn();
    return { data: resp.data, error: null };
  } catch (err) {
    return failure(err);
  }
}

/** An object URL for a card's picture, or null. The bytes come as a blob
 *  over the session's own request, so an <img> never asks the server itself;
 *  only image types get a URL. The caller revokes it. */
async function pictureUrl(path) {
  try {
    const resp = await axios.get(path, { responseType: 'blob' });
    if (!resp.data?.type?.startsWith('image/')) return null;
    return URL.createObjectURL(resp.data);
  } catch {
    return null;
  }
}

export function useChristmas() {
  return {
    play: () => call(() => axios.get(`${API_BASE}/play`)),
    answer: (n, answer) => call(() => axios.post(`${API_BASE}/cards/${n}/answer`, { answer })),
    playPicture: (n) => pictureUrl(`${API_BASE}/cards/${n}/picture`),

    control: () => call(() => axios.get(`${API_BASE}/control`)),
    controlPicture: (n) => pictureUrl(`${API_BASE}/control/cards/${n}/picture`),
    saveWord: (n, word) => call(() => axios.put(`${API_BASE}/control/cards/${n}/word`, { word })),
    savePicture: (n, file) => {
      const form = new FormData();
      form.append('picture', file);
      return call(() => axios.put(`${API_BASE}/control/cards/${n}/picture`, form));
    },
    saveSentence: (sentence) => call(() => axios.put(`${API_BASE}/control/sentence`, { sentence })),
    goBack: (to) => call(() => axios.post(`${API_BASE}/control/reset`, { to })),
    // #12780: all seven opening times at once, card 1 first, each a UTC ISO
    // time or null for open now.
    saveOpens: (opensAt) => call(() => axios.put(`${API_BASE}/control/opens`, { opens_at: opensAt })),
  };
}

/** Control's sentence for a refused save, by the server's code. */
export function refusalText(error) {
  if (!error || !error.status) return "Couldn't reach the server. Try again.";
  switch (error.code) {
    case 'required':
      return 'This cannot be empty.';
    case 'too_long':
      return 'This is too long.';
    case 'hidden_characters':
      return 'Remove the hidden character: a control or a direction mark.';
    case 'unsupported_file_type':
      return 'Choose a PNG or a JPEG.';
    case 'file_too_large':
      return 'Choose a picture under 8 MB.';
    case 'unreadable_file':
      return 'That picture could not be read.';
    case 'invalid_time':
      return 'A time could not be read.';
    default:
      return 'This could not be saved.';
  }
}
