import { ref } from 'vue';

/**
 * Whether self sign-up is open, read once per page load (system_3 #10980, UX
 * walk AP4). The sidebar's sign-in renders on every page for every signed-out
 * visitor, and it offered "Create an account" even while sign-up was closed,
 * walking a first-time visitor into a dead end.
 *
 * 'unknown' until read, and again if the read fails: not knowing is not
 * closed, so a caller hides a sign-up door only on 'closed' (SignupView takes
 * the same reading). A server without the kill-switch answers 404 and cannot
 * be closed, so that is 'open'.
 */
export const signupState = ref('unknown');

let pending = null;

export function readSignupStatus() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch('/api/signup/status');
      if (response.status === 404) {
        signupState.value = 'open';
      } else if (!response.ok) {
        throw new Error(`status ${response.status}`);
      } else {
        const body = await response.json();
        signupState.value = body.signup_enabled ? 'open' : 'closed';
      }
    } catch (error) {
      console.error('Could not read sign-up status:', error);
      signupState.value = 'unknown';
      pending = null; // a later mount may try again
    }
    return signupState.value;
  })();
  return pending;
}
