import axios from 'axios';

// Thin API wrapper for the per-user scratchpad. The session is carried by the
// HttpOnly auth_token cookie (same-origin), so no header/withCredentials is
// added here — see src/main.js for the auth model. The backend scopes the
// scratchpad to the session user; the frontend never sends a user id.
const API = '/api/users/me/scratchpad';

// getScratchpad returns { text, updated_at }. A never-written scratchpad comes
// back as { text: '', updated_at: null } (200, not 404).
export async function getScratchpad() {
  const resp = await axios.get(API);
  return {
    text: resp.data?.text ?? '',
    updated_at: resp.data?.updated_at ?? null,
  };
}

// putScratchpad overwrites the scratchpad and returns the saved { text, updated_at }.
export async function putScratchpad(text) {
  const resp = await axios.put(API, { text });
  return {
    text: resp.data?.text ?? text,
    updated_at: resp.data?.updated_at ?? null,
  };
}
