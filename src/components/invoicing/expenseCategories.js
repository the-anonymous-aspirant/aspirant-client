// Zir expense categories as the lists and the expense dialog use them
// (design_conventions §3.161, system_3 #11580). The server lists every
// category ze has, removed ones too (`removed_at` set, server #11579), and
// marks the ten starters and Private `builtin`.

export const isRemoved = (category) => !!(category && category.removed_at);

const fold = (name) => String(name || '').toLocaleLowerCase();

// The category with this name ignoring case, as the server and the select's
// add row compare names; undefined when ze has none.
export const findCategory = (categories, name) => categories.find((c) => fold(c.name) === fold(name));

// The names offered for a new choice: live categories only, in the server's
// order (§3.161 Decision 5).
export const liveNames = (categories) => categories.filter((c) => !isRemoved(c)).map((c) => c.name);

// A select's options: the live names, plus the select's own stored value at
// the end when it is not among them (a removed category, or one the list does
// not hold yet), so the select always shows what is stored (§3.69).
export function namesWithOwn(categories, own) {
  const names = liveNames(categories);
  if (own && !names.includes(own)) names.push(own);
  return names;
}

// The categories the Book's "Change what counts" and the Transactions filter
// list: live ones, plus a removed one while any expense still has it
// (§3.161 Decision 5).
export function stillListed(categories, expenses) {
  const used = new Set(expenses.map((e) => e.category));
  return categories.filter((c) => !isRemoved(c) || used.has(c.name));
}

const HINT = 'To add a category, type its name in the list.';

// What shows under the expense dialog's Category field: one action when it
// can act, and one muted line (§3.161 Decisions 3 and 4). It depends only on
// the field, the category the expense is saved with, zir list, a name added
// in this dialog and a remove just made, so it reads the same after the
// dialog is closed and reopened.
//   field       the field's value
//   saved       the category the expense is saved with ('' on a new expense)
//   added       a name chosen from the add row in this dialog, until it is
//               saved or dropped ('' when none)
//   justRemoved a category removed from this dialog while the expense is not
//               saved with it; the field returned to `saved` and the action
//               offers it back until the field changes ('' when none)
// Returns { action: { kind, name, label, aria } | null, line }.
export function categoryState({ field, saved, categories, added, justRemoved }) {
  if (justRemoved) {
    return {
      action: { kind: 'restore', name: justRemoved, label: `Restore “${justRemoved}”`, aria: `Restore “${justRemoved}” to your categories` },
      line: `Removed “${justRemoved}” from your categories.`,
    };
  }
  const category = findCategory(categories, field);
  if (added && field === added) {
    if (isRemoved(category)) return { action: null, line: 'You removed this category. Save restores it.' };
    return { action: null, line: 'New category. Save adds it to your categories.' };
  }
  if (!category || category.builtin) return { action: null, line: HINT };
  const name = category.name;
  if (isRemoved(category)) {
    return {
      action: { kind: 'restore', name, label: 'Restore to your categories', aria: `Restore “${name}” to your categories` },
      line: name === saved ? 'Removed from your categories. This expense keeps it until you choose another.' : HINT,
    };
  }
  return {
    action: { kind: 'remove', name, label: 'Remove from your categories', aria: `Remove “${name}” from your categories` },
    line: HINT,
  };
}

// Zir list with one category as the server now has it (after a Remove or a
// Restore), in place, so every select on the page follows without a reload.
export const withCategory = (categories, updated) => categories.map((c) => (c.id === updated.id ? updated : c));
