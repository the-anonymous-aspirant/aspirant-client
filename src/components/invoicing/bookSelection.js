// What the Book counts (§3.143 Decisions 7 and 8, system_3 #10555-D1). One
// predicate for the Book's rows and for Transactions' "Not in the Book" flag,
// so the two never disagree. The server applies the same rule to the
// bookkeeping CSV (aspirant-server `invoicing_book_report.go`).

export const WORK_ONLY = 'work_only';
export const PRIVATE_CATEGORY = 'private';

// Money in, in the order the "Change what counts" group lists it.
export const INCOME_ORDER = ['paid_work', 'gift', 'loan', 'refund', 'other', 'uncategorised'];

export const isPrivate = (category) => String(category || '').toLowerCase() === PRIVATE_CATEGORY;

// An incoming payment counts when its category is ticked; an expense when
// every expense counts or its category is ticked. Private never counts, and
// a withdrawal (an outgoing payment) is not income.
export function countsInBook(selection, { direction, category, kind }) {
  if (!selection) return true;
  if (direction === 'in') return kind === 'incoming' && selection.income.includes(category);
  if (isPrivate(category)) return false;
  return selection.expense_all || selection.expense.includes(category);
}

// The expense categories that may count: hers, without Private.
export const countableExpenseNames = (categories) => categories.map((c) => c.name).filter((n) => !isPrivate(n));

// The name the selection reads by: its preset's, "(changed)" when the ticks
// differ from it, or "Custom" when its preset was deleted.
export function selectionName(selection, presets) {
  const preset = presets.find((p) => p.id === selection.preset);
  if (!preset) return 'Custom';
  return selection.changed ? `${preset.name} (changed)` : preset.name;
}

// "a", "a or b", "a, b or c".
function orList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

// "Counting with Work only: payments marked Paid work, and every expense
// except Private." The labels are the ones the row's category reads by.
export function countingSentence(selection, presets, incomeLabels) {
  const income = INCOME_ORDER.filter((c) => selection.income.includes(c)).map((c) => incomeLabels[c] || c);
  const payments = income.length ? `payments marked ${orList(income)}` : 'no payments';
  let expenses;
  if (selection.expense_all) expenses = 'every expense except Private';
  else if (selection.expense.length) expenses = `expenses marked ${orList([...selection.expense].sort((a, b) => a.localeCompare(b)))}`;
  else expenses = 'no expenses';
  return `Counting with ${selectionName(selection, presets)}: ${payments}, and ${expenses}.`;
}
