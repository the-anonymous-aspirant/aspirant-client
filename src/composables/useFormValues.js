import axios from 'axios';

// Remembered form values (§3.154, system_3 #11190 / #11191): one record per
// user per tool on the server, read and written only through these calls.
// The session is the HttpOnly auth_token cookie, so no user id is ever sent;
// the server takes the user from the session. Callers keep what comes back in
// component state only — never localStorage, sessionStorage or IndexedDB.
const base = (tool) => `/api/users/me/form-values/${encodeURIComponent(tool)}`;

// { values, updated_at }, with values null when nothing is saved (200, not 404).
export async function getFormValues(tool) {
  const resp = await axios.get(base(tool));
  return { values: resp.data?.values ?? null, updated_at: resp.data?.updated_at ?? null };
}

// Saves over any earlier record; returns the stored { values, updated_at }.
export async function putFormValues(tool, values) {
  const resp = await axios.put(base(tool), values);
  return { values: resp.data?.values ?? null, updated_at: resp.data?.updated_at ?? null };
}

// Removes the record (the row goes, it is not emptied). 204 whether or not one existed.
export async function deleteFormValues(tool) {
  await axios.delete(base(tool));
}
