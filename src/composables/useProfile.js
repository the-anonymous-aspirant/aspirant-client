import axios from 'axios';

// useProfile wraps the current user's own profile endpoints (#4170). It follows
// the app's per-feature composable convention (src/composables/*): a thin axios
// wrapper, relative /api paths, and the session HttpOnly cookie carried
// automatically same-origin (no JS-side token — see main.js). Each call
// unwraps the standard { status, data } success envelope.
export function useProfile() {
  const unwrap = (res) => (res && res.data && 'data' in res.data ? res.data.data : res.data);

  // GET /api/profile → { ID, username, display_name, email, avatar_url, CreatedAt }
  const getProfile = async () => unwrap(await axios.get('/api/profile'));

  // PATCH /api/profile { display_name } → the refreshed profile
  const updateDisplayName = async (displayName) =>
    unwrap(await axios.patch('/api/profile', { display_name: displayName }));

  // PUT /api/profile/avatar (multipart image) → { avatar_url }
  const uploadAvatar = async (file) => {
    const form = new FormData();
    form.append('image', file);
    return unwrap(
      await axios.put('/api/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
  };

  // DELETE /api/profile/avatar → { avatar_url: '' }
  const clearAvatar = async () => unwrap(await axios.delete('/api/profile/avatar'));

  return { getProfile, updateDisplayName, uploadAvatar, clearAvatar };
}
