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
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    // A currency code Intl does not know (it came from an uploaded file)
    // must not take the whole table down (@security N7, c51503 on #8372).
    return `${value.toFixed(2)} ${currency}`;
  }
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

// ---- Invoices (system_3 #8367-D1) ----------------------------------------
// The number and the issue date are never sent: the server assigns both when
// the invoice is issued (spec §4.6), and refuses a body that names them.

export const listInvoices = (params = {}) =>
  axios.get(`${base}/invoices`, { params }).then((r) => r.data.invoices || []);
export const getInvoice = (id) => axios.get(`${base}/invoices/${id}`).then((r) => r.data);
export const createDraft = (paymentIds) =>
  axios.post(`${base}/invoices`, { payment_ids: paymentIds }).then((r) => r.data);
export const updateDraft = (id, patch) => axios.put(`${base}/invoices/${id}`, patch).then((r) => r.data);
export const deleteDraft = (id) => axios.delete(`${base}/invoices/${id}`);
export const issueInvoice = (id) => axios.post(`${base}/invoices/${id}/issue`).then((r) => r.data);
export const cancelInvoice = (id, reason) =>
  axios.post(`${base}/invoices/${id}/cancel`, { reason }).then((r) => r.data);
export const invoicePdfUrl = (id) => `${base}/invoices/${id}/pdf`;

// Decimal input → integer minor units without floating-point error:
// "19,99" / "19.99" → 1999 cents; "2,5" → 2500 thousandths. Returns null for
// anything that is not a plain non-negative decimal.
function parseDecimal(raw, places) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  if (frac.length > places) return null;
  return Number(whole) * 10 ** places + Number(frac.padEnd(places, '0') || 0);
}
export const centsFromEuros = (raw) => parseDecimal(raw, 2);
export const milliFromDecimal = (raw) => parseDecimal(raw, 3);

// Back to an editable string: 1999 → "19.99", 2500 → "2.5".
export function decimalFromMinor(value, places) {
  const n = Number(value || 0);
  const whole = Math.floor(n / 10 ** places);
  const frac = String(n % 10 ** places).padStart(places, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

export const STATUS_LABELS = { draft: 'Draft', issued: 'Issued', cancelled: 'Cancelled' };

// ---- Review and exports (system_3 #8367-D2) ------------------------------

export const getValidation = () => axios.get(`${base}/validation`).then((r) => r.data);
export const listAuditEvents = (entityType, entityId) =>
  axios
    .get(`${base}/audit-events`, { params: { entity_type: entityType, entity_id: entityId } })
    .then((r) => r.data.events || []);
export const invoiceCsvUrl = (id) => `${base}/invoices/${id}/export.csv`;
export const allInvoicesCsvUrl = () => `${base}/export/invoices.csv`;

// Fetch a file and hand it to the browser as a download. Going through axios
// (not a plain link) means a 409 from the export's own validation arrives as
// an error the page can show, instead of being saved as a file.
export async function downloadBlob(url, filename) {
  const res = await axios.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export const workbookUrl = () => `${base}/export/workbook.xlsx`;
export const bundleUrl = () => `${base}/export/jobcenter-bundle.zip`;
