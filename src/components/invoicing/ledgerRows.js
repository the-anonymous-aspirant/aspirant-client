// How a movement of money is named and ordered, in one place for the Book
// and Transactions (§3.140 Decision 3, §3.143 Decision 3, system_3 #10630).
// Payer- and bank-written text is only ever rendered as text interpolation.
import { CATEGORY_LABELS, SOURCE_LABELS } from './api.js';

// "What it was for" as two parts (design_agent's Design ack c64353 on
// system_3 #10459): `who`, the counterparty in body ink, then `what`, the
// note, muted only when it follows a counterparty. A part that already
// contains the other (trimmed, case-insensitive; a booking text often names
// the payee) is shown once, the longer one, in body ink.
export function describeRow(counterparty, note) {
  const who = String(counterparty || '').trim();
  const what = String(note || '').trim();
  if (who && what) {
    const w = who.toLowerCase();
    const n = what.toLowerCase();
    if (n.includes(w)) return { who: '', what };
    if (w.includes(n)) return { who, what: '' };
  }
  return { who, what };
}

// A payment's payer leads its row, whether imported or entered by hand.
export const paymentParts = (p) => describeRow(p.sender_name, p.note);

// An import stores an expense's payee in `reference` (aspirant-server
// invoicing_n26.go / invoicing_payments.go). A hand-entered expense keeps
// its payee in its own field, "Paid to" (§3.143 Decision 3, server
// #10555-A1); its `reference` is the dialog's free-text "Reference
// (optional)", which nothing says names a payee, so it stays the note's
// fallback and is never shown as a counterparty.
export const expenseParts = (e) =>
  e.entry === 'import' ? describeRow(e.reference, e.note) : describeRow(e.payee, e.note || e.reference);

// "N26", "PayPal" or "By hand": a fact about the row, read on its muted date
// line (§3.143 Decision 3).
export function sourceLabel(row) {
  if (row.entry === 'manual') return 'By hand';
  return SOURCE_LABELS[row.source] || row.source || '';
}

// A payment's invoice as its row reads it: "Invoice 2026-014", "Draft", or
// nothing. The server names only the live invoice, never a cancelled one
// (aspirant-server `invoice`, system_3 #10666); a list without the field
// reads as no invoice.
export function invoiceLabel(payment) {
  const inv = payment && payment.invoice;
  if (!inv) return '';
  if (inv.status === 'issued') return inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Invoice';
  if (inv.status === 'draft') return 'Draft';
  return '';
}

// Newest first: the day the money moved, then the row entered last
// (§3.143 Decision 3, §3.145). A tie falls to the higher id, the later row
// of its table, then to money in before money out, so the order is the same
// on every load.
export function newestFirst(a, b) {
  if (a.paid_on !== b.paid_on) return a.paid_on < b.paid_on ? 1 : -1;
  const ac = a.created_at || '';
  const bc = b.created_at || '';
  if (ac !== bc) return ac < bc ? 1 : -1;
  if (a.id !== b.id) return b.id - a.id;
  return a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1;
}

// Transactions' one list (§3.143 Decision 3): incoming payments and
// expenses in one row shape, newest first. `payment` / `expense` keep the
// source record for the controls only one direction has.
export function transactionRows(payments, expenses) {
  const income = payments.map((p) => ({
    key: `p${p.id}`,
    id: p.id,
    direction: 'in',
    paid_on: p.paid_on,
    created_at: p.created_at,
    ...paymentParts(p),
    category: `in:${p.category}`,
    categoryLabel: CATEGORY_LABELS[p.category] || p.category,
    source: sourceLabel(p),
    invoice: invoiceLabel(p),
    amount_cents: p.gross_cents,
    currency: p.currency,
    transaction_id: p.transaction_id,
    payment: p,
    expense: null,
  }));
  const outgoing = expenses.map((e) => ({
    key: `e${e.id}`,
    id: e.id,
    direction: 'out',
    paid_on: e.paid_on,
    created_at: e.created_at,
    ...expenseParts(e),
    category: `out:${e.category}`,
    categoryLabel: e.category,
    source: sourceLabel(e),
    invoice: '',
    amount_cents: e.amount_cents,
    currency: e.currency,
    transaction_id: e.transaction_id,
    payment: null,
    expense: e,
  }));
  return [...income, ...outgoing].sort(newestFirst);
}
