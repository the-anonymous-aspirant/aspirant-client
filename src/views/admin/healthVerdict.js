// What GET /api/health covers, in words: the server itself plus every check it
// reports ("Server and database OK"). Shared by the System Health page's
// partial banner and the Admin home tile (system_3 #11009), so the two cannot
// word one reading differently. It names its coverage on purpose: the server's
// status says nothing about containers or disk, and a bare "OK" here is the
// over-claim #11003 removed from the page.

export const joinNames = (names) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export function serverVerdict(health) {
  const covers = ['Server', ...Object.keys((health && health.checks) || {})];
  return `${joinNames(covers)} ${((health && health.status) || 'unknown').toUpperCase()}`;
}
