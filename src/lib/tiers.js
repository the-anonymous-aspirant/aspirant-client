// Client mirror of the server's access-tier model (aspirant-server
// server/handlers/common.go, epic #5113-A2). "public" is the absence of a
// role (unauthenticated); the three authenticated tiers are viewer < member <
// admin. This is the single source of truth for client-side gate DISPLAY — the
// real enforcement is server-side + nginx auth_request; this only keeps the UI
// honest (the guard is trivially bypassed from devtools, and always was).
export const TIER = Object.freeze({
  blocked: 0, // authenticated but no access (legacy: Deleted)
  viewer: 1, // + applications (legacy: User/Guest/Gamer)
  member: 2, // + the member area (legacy: Trusted)
  admin: 3, // everything
});

// tierOf maps a role-claim string to its access tier. It accepts BOTH the tier
// names and the legacy six-role names, so a session minted before the #5113-A2
// migration keeps resolving during the transition — matching the server's
// tierOf exactly (a role never resolves higher than the tier A1 assigned it).
export function tierOf(role) {
  switch (role) {
    case 'Admin':
      return TIER.admin;
    case 'Member':
    case 'Trusted':
      return TIER.member;
    case 'Viewer':
    case 'User':
    case 'Guest':
    case 'Gamer':
      return TIER.viewer;
    default: // 'Blocked', 'Deleted', null, unknown, empty
      return TIER.blocked;
  }
}

// meetsTier is true when the role clears the given minimum tier (a monotonic
// floor — a higher tier always clears a lower gate).
export function meetsTier(role, min) {
  return tierOf(role) >= min;
}
