// API calls for the Invoices app (system_3 #8367). The server is the
// authority for every rule — who may see the data (flowah + Admin), which
// payments may be invoiced, the invoice number and the issue date — so these
// wrappers only move data; they never decide.

import axios from 'axios';

const base = '/api/invoicing';

export const getProfile = () => axios.get(`${base}/profile`).then((r) => r.data);
export const saveProfile = (profile) => axios.put(`${base}/profile`, profile).then((r) => r.data);

export const listClients = () => axios.get(`${base}/clients`).then((r) => r.data.clients || []);
export const createClient = (client) => axios.post(`${base}/clients`, client).then((r) => r.data.client);
export const updateClient = (id, client) => axios.put(`${base}/clients/${id}`, client).then((r) => r.data.client);

export function importPayPalCSV(file, dateOrder) {
  const form = new FormData();
  form.append('file', file);
  if (dateOrder) form.append('date_order', dateOrder);
  return axios.post(`${base}/payments/import`, form).then((r) => r.data.summary);
}

export const listPayments = () => axios.get(`${base}/payments`).then((r) => r.data.payments || []);
export const patchPayment = (id, patch) => axios.patch(`${base}/payments/${id}`, patch).then((r) => r.data.payment);

// The server's error envelope is { error: { code, message } }; fall back to
// a generic line so a network failure still reads as a sentence.
export function errorOf(err) {
  const envelope = (err && err.response && err.response.data && err.response.data.error) || {};
  return {
    status: err && err.response ? err.response.status : 0,
    code: envelope.code || '',
    message: envelope.message || 'The server could not be reached. Try again.',
  };
}

// Money arrives as integer cents; it is shown, never computed, here.
export function formatMoney(cents, currency = 'EUR') {
  const value = (cents || 0) / 100;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
}

// Dates arrive as ISO timestamps at UTC midnight for a calendar day; show the
// day itself, not a local-time shift of it.
export function formatDay(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

export const CATEGORY_LABELS = {
  uncategorised: 'Uncategorised',
  paid_work: 'Paid work',
  gift: 'Gift',
  loan: 'Loan',
  refund: 'Refund',
  other: 'Other',
};

export const SKIP_REASON_LABELS = {
  not_completed: 'not completed',
  currency_conversion: 'currency conversion',
  hold_or_authorization: 'hold or authorisation',
  bank_topup: 'top-up from the bank',
  zero_or_negative_credit: 'zero or negative credit',
  fee: 'fee',
  outgoing: 'outgoing payment',
  memo: 'memo',
  missing_transaction_id: 'no transaction id',
};
