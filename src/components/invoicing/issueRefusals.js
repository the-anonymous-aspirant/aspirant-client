import { errorOf, formatMoney } from './api.js';

// The issue press's refusals in the app's own words (system_3 #12274, the
// table under "After an independent review"). The server's sentence is never
// shown as written: each code reads its figures from error.details
// (aspirant-server #12274). Accept and "Issue now" save the draft before they
// issue, so after a refusal what ze typed is saved, and the fallback says so.
export const ISSUE_REFUSAL_FALLBACK =
  'The invoice could not be issued. Your changes to the draft are saved.';

const PROFILE_PARTS = {
  name: 'the name',
  address: 'the address',
  steuernummer: 'the Steuernummer',
};

function listed(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function profileSentence(missing) {
  const parts = (Array.isArray(missing) ? missing : [])
    .map((m) => PROFILE_PARTS[m])
    .filter(Boolean);
  if (!parts.length) return 'Your Issuer profile is not complete.';
  return `Your Issuer profile is not complete: ${listed(parts)} ${parts.length > 1 ? 'are' : 'is'} missing.`;
}

const SENTENCES = {
  client_incomplete: (d) =>
    d.missing === 'name' ? 'The client has no name. Add it under Clients.' : 'Choose the client.',
  client_address_required: (d) =>
    d.currency && d.currency !== 'EUR'
      ? `An invoice in ${d.currency} needs the client's postal address. Add it under Clients.`
      : `This invoice totals ${formatMoney(d.total_cents, d.currency || 'EUR')}. Above ${formatMoney(d.limit_cents, 'EUR')} an invoice needs the client's postal address. Add it under Clients.`,
  profile_incomplete: (d) => profileSentence(d.missing),
  line_items_incomplete: (d) =>
    d.position
      ? `Line ${d.position} needs a description, a quantity above zero and a price above zero.`
      : 'Add at least one line.',
  quantity_too_large: (d) =>
    d.position ? `Line ${d.position}: the quantity is too large.` : 'A quantity is too large.',
  total_zero: (d) =>
    `The invoice totals ${formatMoney(0, d.currency || 'EUR')}, so it cannot be issued.`,
  service_date_invalid: (d) =>
    ({
      ends_before_start: '“Service until” is before “Service date (from)”.',
      after_today: 'The work is dated after today. The invoice can be issued from that day.',
    })[d.reason] || 'Enter the day the work was done.',
  payment_removed: () =>
    'A payment this draft covers was removed. Restore it, or delete the draft.',
  // #12318 governs the draft that covers no payment. A covered payment set to
  // another category has no row in the table; this names it the same way.
  payment_not_paid_work: (d) =>
    d.reason === 'not_paid_work'
      ? 'A payment this draft covers is no longer Paid work. Set it back on Transactions, or delete the draft.'
      : 'This draft covers no payment, so it cannot be issued.',
  payment_paypal_transfer: () =>
    'A payment this draft covers is a transfer from PayPal to your bank, not income.',
  payment_already_invoiced: (d) =>
    d.invoice_number
      ? `A payment this draft covers is already on invoice ${d.invoice_number}.`
      : 'A payment this draft covers is already on an issued invoice.',
  payment_not_found: () => 'A payment this draft covers no longer exists. Delete the draft.',
  mixed_currencies: () =>
    'The payments this draft covers are in different currencies. An invoice holds one currency.',
  issue_date_before_previous: () =>
    'The last invoice is dated after today, so this one cannot be issued yet.',
  unprintable_characters: (d) =>
    d.characters
      ? `The invoice cannot print “${d.characters}”. Change it in the profile, the client or the lines.`
      : 'The invoice cannot print some of its characters. Change them in the profile, the client or the lines.',
  not_a_draft: (d) =>
    d.status === 'cancelled' ? 'This invoice is cancelled.' : 'This invoice is already issued.',
};

// The sentence for a failed issue call. No answer at all keeps errorOf's
// "could not be reached"; any code not in the table reads the fallback.
export function issueRefusalText(err) {
  if (!err || !err.response) return errorOf(err).message;
  const data = err.response.data || {};
  const envelope = data.error || {};
  // Own keys only: a code such as "constructor" must not reach a method of
  // Object.prototype (security's nit on PR 575, c77377).
  const sentence = Object.hasOwn(SENTENCES, envelope.code) ? SENTENCES[envelope.code] : null;
  return sentence ? sentence(envelope.details || {}) : ISSUE_REFUSAL_FALLBACK;
}

// A draft save before the issue: only the quantity bound has its sentence
// here (the table's "Line 1: the quantity is too large."); every other
// refusal of a save keeps the message the dialog shows today.
export function saveRefusalText(err) {
  const envelope = (err && err.response && err.response.data && err.response.data.error) || {};
  if (envelope.code === 'quantity_too_large')
    return SENTENCES.quantity_too_large(envelope.details || {});
  return null;
}
