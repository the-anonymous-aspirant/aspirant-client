// A row's audit events as History lines, newest first (§3.143 Decision 5,
// system_3 #10694): "12 Nov 2026 · Category: Uncategorised → Paid work".
// An edit's details carry only the fields it changed, as {before, after}
// (aspirant-server invoicing_edit.go); other actions are named. Every value
// is rendered as text by the caller.
import { CATEGORY_LABELS, METHOD_LABELS, formatMoney } from './api.js';

const FIELD_LABELS = {
  paid_on: 'Date',
  gross_cents: 'Amount',
  amount_cents: 'Amount',
  method: 'Method',
  reference: 'Reference',
  sender_name: 'Paid by',
  payee: 'Paid to',
  note: 'What it was for',
  category: 'Category',
  client_id: 'Client',
};

// The server's action names (aspirant-server handlers' invoicingAction*).
const ACTION_LABELS = {
  create_manual: 'Entered by hand',
  create: 'Created',
  import: 'Imported',
  categorise: 'Category or client changed',
  edit: 'Edited',
  remove: 'Removed',
  restore: 'Restored',
  delete: 'Deleted',
};

// "12 Nov 2026", in the browser's own calendar for the moment it happened.
export function historyDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// An expense's categories are her own names (system_3 #10424) and read as
// given; the income labels map only a payment's fixed keys, where `other` is
// the income "Other" (system_3 #10744).
function valueText(key, value, clients, entityType) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'category') return entityType === 'expense' ? String(value) : CATEGORY_LABELS[value] || String(value);
  if (key === 'method') return METHOD_LABELS[value] || String(value);
  if (key === 'gross_cents' || key === 'amount_cents') return formatMoney(Number(value));
  if (key === 'paid_on') return String(value).slice(0, 10);
  if (key === 'client_id') {
    const c = clients.find((x) => x.id === value);
    return c ? c.name : `client ${value}`;
  }
  return String(value);
}

function parseDetails(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}') || {};
  } catch {
    return {};
  }
}

// One line per event: the day, then what changed or what was done.
export function historyLines(events, clients = [], entityType = 'payment') {
  return [...events]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id))
    .map((e) => {
      const d = parseDetails(e.details);
      const after = d.after && typeof d.after === 'object' ? d.after : null;
      const before = d.before && typeof d.before === 'object' ? d.before : {};
      let what;
      if (after && Object.keys(after).length) {
        what = Object.keys(after)
          .map((k) => `${FIELD_LABELS[k] || k}: ${valueText(k, before[k], clients, entityType)} → ${valueText(k, after[k], clients, entityType)}`)
          .join(', ');
      } else {
        const a = String(e.action || '');
        what = ACTION_LABELS[a] || (a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Changed');
      }
      return { id: e.id, text: `${historyDay(e.created_at)} · ${what}` };
    });
}
