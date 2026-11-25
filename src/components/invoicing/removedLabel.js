// The Transactions button that opens the removed rows, as the page shows it
// (§3.143 Decision 6). The empty draft's line names it by these words
// (system_3 #12318 review point 4), so the two can never read apart.
export function showRemovedLabel(n) {
  return `Show ${n} removed row${n === 1 ? '' : 's'}`;
}
