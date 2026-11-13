// "What it was for" categories (system_3 #9928, operator c61358): a few
// defaults plus the ones ze saves zirself. Zirs live in this browser's
// localStorage; the server only ever sees the line's plain description text,
// so a chosen category and typed text are the same thing to it.
//
// Every storage access is guarded: a private window, blocked site data or a
// full quota must never break the invoice form. Without storage ze gets the
// defaults and no save action.

export const DEFAULT_CATEGORIES = ['Tattoo', 'Tattoo (small)', 'Tattoo (big)'];

const KEY = 'invoicing.lineCategories';

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function storageAvailable() {
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// Zir own categories, in the order ze saved them.
export function savedCategories() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string' && c.trim()) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function allCategories() {
  const mine = savedCategories().filter((c) => !DEFAULT_CATEGORIES.some((d) => same(d, c)));
  // Zirs follow the defaults alphabetically (design_agent on #9928): ze finds
  // one by name, and save order is a history the screen does not show.
  return [...DEFAULT_CATEGORIES, ...mine.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))];
}

export const isDefault = (text) => DEFAULT_CATEGORIES.some((d) => same(d, text));
export const isSaved = (text) => savedCategories().some((c) => same(c, text));

export function saveCategory(text) {
  const t = text.trim();
  if (!t || isDefault(t) || isSaved(t)) return false;
  return write([...savedCategories(), t]);
}

export function removeCategory(text) {
  return write(savedCategories().filter((c) => !same(c, text)));
}
