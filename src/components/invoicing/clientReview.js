// What the Clients tab offers for review (system_3 #11507, epic #11497 item 5;
// Design ack c71154): pairs of clients that look like the same person, and
// clients that look like a card payment or an online service. It only points.
// Nothing here merges, renames or deletes: the owner opens a row and acts.
import { lookAlikePairs, looksLikeCardPaymentOrService } from './payerMatch.js';

// The guesses the owner has cleared, kept in this browser only, like the line
// categories (lineCategories.js). Not zir book: nothing is sent to the server.
const KEY = 'invoicing.clientReview.v1';

export const pairKey = (a, b) => `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;

export function loadDismissed() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return {
      pairs: Array.isArray(parsed.pairs) ? parsed.pairs.filter((k) => typeof k === 'string') : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards.filter((id) => Number.isInteger(id)) : [],
    };
  } catch {
    // Storage blocked or its content unreadable: nothing was cleared.
    return { pairs: [], cards: [] };
  }
}

// False when the browser would not keep it; the flag is then cleared for this
// visit only.
export function saveDismissed(dismissed) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(dismissed));
    return true;
  } catch {
    return false;
  }
}

// `{ pairs, cardLike, ids, others }` for a client book and the cleared
// guesses: `pairs` as [a, b]; `cardLike` as clients; `ids` every client
// involved; `others` maps a client id to the clients it looks like.
export function reviewOf(clients, dismissed) {
  const cleared = new Set(dismissed.pairs);
  const real = new Set(dismissed.cards);
  const pairs = lookAlikePairs(clients).filter(([a, b]) => !cleared.has(pairKey(a, b)));
  const cardLike = clients.filter((c) => looksLikeCardPaymentOrService(c.name) && !real.has(c.id));
  const ids = new Set(cardLike.map((c) => c.id));
  const others = new Map();
  for (const [a, b] of pairs) {
    ids.add(a.id);
    ids.add(b.id);
    others.set(a.id, [...(others.get(a.id) || []), b]);
    others.set(b.id, [...(others.get(b.id) || []), a]);
  }
  return { pairs, cardLike, ids, others };
}

// The line's sentences, look-alikes first. One case is named; several are
// counted, so the line stays one line.
export function reviewSentences(review) {
  const out = [];
  const p = review.pairs.length;
  if (p === 1) out.push(`2 clients look like the same person: ${review.pairs[0][0].name} and ${review.pairs[0][1].name}.`);
  else if (p > 1) out.push(`${p} pairs of clients look like the same person.`);
  const c = review.cardLike.length;
  if (c === 1) out.push(`1 client looks like a card payment or an online service: ${review.cardLike[0].name}.`);
  else if (c > 1) out.push(`${c} clients look like card payments or online services.`);
  return out;
}
