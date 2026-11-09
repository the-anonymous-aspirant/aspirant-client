// API calls for the Invoices app (system_3 #8367). The server is the
// authority for every rule — who may see the data (its owner + Admin), which
// payments may be invoiced, the invoice number and the issue date — so these
// wrappers only move data; they never decide.

import axios from 'axios';

const base = '/api/invoicing';

export const getProfile = () => axios.get(`${base}/profile`).then((r) => r.data);
export const saveProfile = (profile) => axios.put(`${base}/profile`, profile).then((r) => r.data);

// The issuer's logo (system_3 #9858). The server normalizes the upload
// (PNG or JPEG in, a trimmed and scaled PNG out) and prints it top right on
// every invoice issued while it is set; issued invoices keep their own.
export const logoUrl = () => `${base}/profile/logo`;
export const getLogoBlob = () => axios.get(logoUrl(), { responseType: 'blob' }).then((r) => r.data);
export function uploadLogo(file) {
  const form = new FormData();
  form.append('logo', file);
  return axios.put(logoUrl(), form).then((r) => r.data.logo);
}
export const deleteLogo = () => axios.delete(logoUrl());

export const listClients = () => axios.get(`${base}/clients`).then((r) => r.data.clients || []);
export const createClient = (client) => axios.post(`${base}/clients`, client).then((r) => r.data.client);
export const updateClient = (id, client) => axios.put(`${base}/clients/${id}`, client).then((r) => r.data.client);

// The server reads a CSV or an .xlsx by its bytes (system_3 #9862-A1).
export function importPayPalCSV(file, dateOrder) {
  const form = new FormData();
  form.append('file', file);
  if (dateOrder) form.append('date_order', dateOrder);
  return axios.post(`${base}/payments/import`, form).then((r) => r.data.summary);
}

// N26 PDF import (system_3 #9760, server #9812). Two steps, unlike the
// PayPal CSV: parse stores nothing and returns candidate rows per file; the
// owner confirms or skips each row, and only the confirmed rows are posted
// back to be stored (source "n26", uncategorised, deduped by transaction id).
export function parseN26PDFs(files) {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return axios.post(`${base}/payments/import-n26/parse`, form).then((r) => r.data.files || []);
}
export const confirmN26Rows = (rows) =>
  axios.post(`${base}/payments/import-n26/confirm`, { rows }).then((r) => r.data.summary);

// A statement's outgoing rows come back as each file's `expense_candidates`
// (system_3 #10417), never among the payment candidates. The ones the owner
// ticks are posted here, each with her chosen category (empty means
// "other"), and stored as work expenses: { confirmed, duplicates }.
export const confirmN26Expenses = (rows) =>
  axios.post(`${base}/expenses/import-n26/confirm`, { rows }).then((r) => r.data.summary);

// The owner's expense categories (system_3 #10416/#10424): the ten starter
// types plus any she added, oldest first.
export const listExpenseCategories = () =>
  axios.get(`${base}/expense-categories`).then((r) => r.data.categories || []);

// The server's limit per parse request (maxN26FilesPerRequest).
export const N26_MAX_FILES = 10;

export const N26_KIND_LABELS = {
  n26_transfer_confirmation: 'Transfer confirmation',
  n26_account_statement: 'Account statement',
};

// Why a file could not be read, short enough to follow its name in the
// summary line ("statement-oct.pdf (not an N26 document)"). The server's own
// message is the fallback for a code this list does not know.
export const N26_FILE_ERROR_LABELS = {
  too_large: 'larger than 5 MB',
  not_a_pdf: 'not a PDF',
  extract_failed: 'its text could not be read',
  not_n26_document: 'not an N26 document',
  parse_failed: 'an N26 document with a missing or unreadable field',
};
// `fileError` is the parse response's per-file `{ code, message }`: the
// server's own prose, never an axios error.
export const n26FileErrorReason = (fileError) =>
  N26_FILE_ERROR_LABELS[fileError && fileError.code] || (fileError && fileError.message) || 'unreadable';

export const listPayments = () => axios.get(`${base}/payments`).then((r) => r.data.payments || []);

// Work expenses and their categories (system_3 #10414-A/#10424). An expense
// is never invoiced, so there is no patch/draft path, only create/list/delete.
export const listExpenses = () => axios.get(`${base}/expenses`).then((r) => r.data.expenses || []);
export const createManualExpense = (expense) =>
  axios.post(`${base}/expenses/manual`, expense).then((r) => r.data.expense);
export const deleteExpense = (id) => axios.delete(`${base}/expenses/${id}`);
// Seeded with ten starter types on first touch; the owner can add her own on
// top (operator's own ask, #10424).
export const listExpenseCategories = () =>
  axios.get(`${base}/expense-categories`).then((r) => r.data.categories || []);
export const createExpenseCategory = (category) =>
  axios.post(`${base}/expense-categories`, category).then((r) => r.data.category);
export const patchPayment = (id, patch) => axios.patch(`${base}/payments/${id}`, patch).then((r) => r.data.payment);
// A payment entered by hand (#8409): always incoming paid work, audited.
export const createManualPayment = (payment) =>
  axios.post(`${base}/payments/manual`, payment).then((r) => r.data.payment);
// Only a hand-entered payment that no invoice covers; the server refuses others.
// Any payment not on an issued invoice, imported or entered by hand (#10009).
export const deletePayment = (id) => axios.delete(`${base}/payments/${id}`);

// How a hand-entered payment was received, in the invoice's German wording.
export const METHOD_LABELS = {
  bank_transfer: 'Banküberweisung (Bank transfer)',
  paypal: 'PayPal',
  stripe: 'Stripe',
  cash: 'Bar (Cash)',
  other: 'Sonstige (Other)',
};

// Where an imported payment came from (`source` on an `entry != 'manual'`
// row). Mirrors the server's invoicingPaymentSourceN26 / ...PayPal constants
// (invoicing_payments.go, invoicing_n26.go).
export const SOURCE_LABELS = {
  n26: 'N26',
  paypal: 'PayPal',
};

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

// The calendar day of a moment in her calendar (Berlin), in the app's ISO
// day spelling: "2026-11-06" (system_3 #10003, design_agent c62046). sv-SE is
// the locale whose date format is exactly YYYY-MM-DD.
export function formatBerlinDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// The "@name" a stored profile link shows as. The link itself is used as
// stored (the server only stores https://www.instagram.com/<name>/ or
// https://t.me/<name>, system_3 #10002); this is only its visible text.
export function socialHandle(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? `@${seg}` : url;
  } catch {
    return url;
  }
}

// Defence in depth (security, c62062 on #10003): a stored link is shown as a
// link only in the two shapes the server stores (aspirant-server #10002). A
// value in any other shape, from a server regression or a hand-edited row,
// is not rendered at all, so no other scheme can reach an href.
export function safeSocialUrl(kind, url) {
  const prefix = kind === 'instagram' ? 'https://www.instagram.com/' : 'https://t.me/';
  return typeof url === 'string' && url.startsWith(prefix) && url.length > prefix.length ? url : '';
}

// The server's field refusals for a phone and the two links (#10002), in her words.
export const FIELD_REFUSALS = {
  invalid_phone: { field: 'phone', text: 'Use digits, spaces and + - ( ) / . only, at most 40 characters.' },
  invalid_instagram: { field: 'instagram_url', text: 'Use an Instagram name (@name) or a link to an Instagram profile.' },
  invalid_telegram: { field: 'telegram_url', text: 'Use a Telegram name (@name) or a t.me link.' },
};

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
  // system_3 #9862-A1, in the singular "3 × fee" grammar (design_agent c60951).
  reversal: 'reversal (a bounce or cancellation)',
  reversed: 'row a reversal cancelled',
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

// §33 UStDV: up to 250 € gross an invoice need not name the recipient's
// address (aspirant-server data_models.KleinbetragLimitCents; system_3 #9949).
export const KLEINBETRAG_LIMIT_CENTS = 25000;
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
export const allInvoicesCsvUrl = () => `${base}/export/invoices.csv`;
// Her client list as Kunden.csv (system_3 #10012).
export const clientsCsvUrl = () => `${base}/export/clients.csv`;

// The filename the server named in a Content-Disposition header, or '' when
// it named none. RFC 5987's filename*=UTF-8''... wins over filename="...".
// A path separator never reaches the saved name.
export function filenameFromDisposition(header) {
  if (!header) return '';
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim()).replace(/[\\/]/g, '_');
    } catch {
      // A malformed escape: fall back to the plain parameter.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const name = plain ? (plain[1] ?? plain[2] ?? '').trim() : '';
  return name.replace(/[\\/]/g, '_');
}

// 'Rechnungen.csv' -> 'Rechnungen-2026-11-06-1049.csv': the caller's name with
// the local time added, in the server's own format (system_3 #10056), for a
// response that names no file.
export function stampedFilename(filename, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? `${filename.slice(0, dot)}-${stamp}${filename.slice(dot)}` : `${filename}-${stamp}`;
}

// Fetch a file and hand it to the browser as a download. Going through axios
// (not a plain link) means a 409 from the export's own validation arrives as
// an error the page can show, instead of being saved as a file.
//
// The file is saved under the server's name, which carries the export time,
// so an older download and a newer one differ in the Downloads folder
// (system_3 #10057, from #9990 and #9964). `filename` is the fallback base
// when the server names none.
export async function downloadBlob(url, filename) {
  let res;
  try {
    res = await axios.get(url, { responseType: 'blob' });
  } catch (err) {
    // With responseType 'blob' an error body arrives as a Blob too, so the
    // server's {error:{code,message}} would be unreadable to errorOf. Parse it
    // back into JSON so a refusal can say why (system_3 #9960).
    const data = err && err.response && err.response.data;
    if (data && typeof data.text === 'function') {
      try {
        err.response.data = JSON.parse(await data.text());
      } catch {
        // Not JSON: leave it, and errorOf falls back to its generic message.
      }
    }
    throw err;
  }
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filenameFromDisposition(res.headers && res.headers['content-disposition']) || stampedFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export const invoicesZipUrl = () => `${base}/export/invoices.zip`;
// Several issued invoices' stored PDFs as one file (system_3 #9959/#9960). The
// server orders the pages by invoice number, whatever order the ids come in,
// and refuses a draft, cancelled or unknown id with a 422 naming it.
export const invoicesMergedPdfUrl = (ids) => `${base}/export/invoices-merged.pdf?ids=${ids.join(',')}`;
