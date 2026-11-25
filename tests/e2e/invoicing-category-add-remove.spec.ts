import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { seedTrustedSessionAs, dismissMobileSidebarIfPresent } from './helpers/mockBackend';
import { openWaysIn } from './helpers/waysIn';

/** Add a category by typing it in the expense dialog's list, and remove or
 *  restore one ze added under the field (system_3 #11580, design §3.161;
 *  server #11579). A removed category is not offered for a new choice, but
 *  an expense saved with one still shows it. Invented records only; every
 *  call is answered by an in-memory fake, behind a catch-all 404. */

type Json = Record<string, any>;

interface Fake {
  expenses: Json[];
  categories: Json[];
  requests: Array<{ method: string; path: string; body: string }>;
  nextCategoryId: number;
  // A Remove or Restore the server refuses, with this message.
  actionRefusal?: string;
}

const exp = (over: Json): Json => ({
  currency: 'EUR', payee: '', reference: '', note: '', removed_at: null, created_at: '2026-10-01T09:00:00Z', ...over,
});

const cat = (id: number, name: string, over: Json = {}): Json => ({
  id, name, counts_as: 'other', builtin: false, removed_at: null, created_at: '2026-10-01T09:00:00Z', ...over,
});

const REMOVED_AT = '2026-11-01T10:00:00Z';

// Three starters, zir own "Studio snacks", "Frames" ze removed, and Private
// last, as the server lists them.
const newFake = (): Fake => ({
  expenses: [
    exp({ id: 21, transaction_id: 'M-hand-e', source: 'manual', entry: 'manual', paid_on: '2026-10-20T00:00:00Z', payee: 'Kiosk Beispiel', note: 'Biscuits', category: 'Studio snacks', amount_cents: 650 }),
    exp({ id: 22, transaction_id: 'N26-imp-e', source: 'n26', entry: 'import', paid_on: '2026-10-18T00:00:00Z', reference: 'Bahn Beispiel', category: 'travel', amount_cents: 4200 }),
    exp({ id: 24, transaction_id: 'M-frame-e', source: 'manual', entry: 'manual', paid_on: '2026-10-12T00:00:00Z', payee: 'Rahmen Esempio', note: 'Oak frame', category: 'Frames', amount_cents: 3900 }),
  ],
  categories: [
    cat(1, 'materials and supplies', { builtin: true, counts_as: 'materials and supplies' }),
    cat(2, 'other', { builtin: true }),
    cat(3, 'travel', { builtin: true, counts_as: 'travel' }),
    cat(10, 'Studio snacks'),
    cat(11, 'Frames', { removed_at: REMOVED_AT }),
    cat(9, 'Private', { builtin: true, counts_as: 'Private' }),
  ],
  requests: [],
  nextCategoryId: 40,
});

const json = (route: Route, status: number, body: Json) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const fold = (s: string) => String(s).toLowerCase();

// What the server does with an expense's category (#11579): a typed one with
// create_category uses a live name, restores a removed one or makes a new
// one; a removed one is refused unless the expense already has it.
function resolveCategory(fake: Fake, body: Json, current: string): { refusal?: Json } {
  if (body.category === undefined) return {};
  if (body.create_category) {
    const found = fake.categories.find((c) => fold(c.name) === fold(body.category));
    if (found) {
      found.removed_at = null;
      body.category = found.name;
    } else {
      fake.categories.splice(fake.categories.length - 1, 0, cat(fake.nextCategoryId++, body.category));
    }
    delete body.create_category;
    return {};
  }
  const chosen = fake.categories.find((c) => c.name === body.category);
  if (chosen && chosen.removed_at && chosen.name !== current) {
    return { refusal: { code: 'removed_category', field: 'category', message: `category: "${chosen.name}" has been removed; restore it to choose it again` } };
  }
  return {};
}

async function mock(page: Page, fake: Fake): Promise<void> {
  await page.route(/\/api\//, (route) => json(route, 404, { error: { code: 'not_found', message: 'not stubbed' } }));
  await page.route(/\/api\/invoicing\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    fake.requests.push({ method, path, body: req.postData() || '' });
    if (path === '/invoicing/profile') return json(route, 200, { saved: true, profile: { full_name: 'Flower Example', address: 'A', steuernummer: '12/345/67890', is_kleinunternehmer: true, invoice_number_prefix: '2026', next_invoice_number: 15 } });
    if (path === '/invoicing/clients') return json(route, 200, { clients: [] });
    if (path === '/invoicing/payments' && method === 'GET') return json(route, 200, { payments: [] });
    if (path === '/invoicing/expenses' && method === 'GET') return json(route, 200, { expenses: fake.expenses });
    if (path === '/invoicing/invoices' && method === 'GET') return json(route, 200, { invoices: [] });
    if (path === '/invoicing/audit-events') return json(route, 200, { events: [] });
    if (path === '/invoicing/book/selection' && method === 'GET') return json(route, 200, { selection: { preset: 'work_only', changed: false, income: ['paid_work'], expense_all: true, expense: [] }, presets: [{ id: 'work_only', name: 'Work only', builtin: true, income: ['paid_work'], expense_all: true, expense: [] }] });
    if (path === '/invoicing/expense-categories' && method === 'GET') return json(route, 200, { categories: fake.categories });
    let m = path.match(/^\/invoicing\/expense-categories\/(\d+)\/(remove|restore)$/);
    if (m && method === 'POST') {
      if (fake.actionRefusal) return json(route, 500, { error: { code: 'server_error', message: fake.actionRefusal } });
      const c = fake.categories.find((x) => x.id === Number(m![1]))!;
      if (c.builtin) return json(route, 409, { error: { code: 'builtin_category', message: 'a starter category cannot be removed' } });
      c.removed_at = m[2] === 'remove' ? REMOVED_AT : null;
      return json(route, 200, { category: c });
    }
    if (path === '/invoicing/expenses/manual' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const { refusal } = resolveCategory(fake, body, '');
      if (refusal) return json(route, 409, { error: refusal });
      const e = exp({ id: 23, transaction_id: 'M-new-e', source: 'manual', entry: 'manual', ...body, paid_on: `${body.paid_on}T00:00:00Z` });
      fake.expenses.push(e);
      return json(route, 201, { expense: e });
    }
    m = path.match(/^\/invoicing\/expenses\/(\d+)$/);
    if (m && method === 'PATCH') {
      const e = fake.expenses.find((x) => x.id === Number(m![1]))!;
      const body = JSON.parse(req.postData() || '{}');
      const { refusal } = resolveCategory(fake, body, e.category);
      if (refusal) return json(route, 409, { error: refusal });
      Object.assign(e, body);
      return json(route, 200, { expense: e });
    }
    return json(route, 404, { error: { code: 'not_found', message: `unmocked ${method} ${path}` } });
  });
}

async function open(page: Page, fake: Fake): Promise<void> {
  await mock(page, fake);
  await seedTrustedSessionAs(page, 'vinoly');
  await page.goto('/member/personal/invoicing');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('[data-test="expense-row"]').first()).toBeVisible();
}

const narrowOf = (page: Page) => page.evaluate(() => window.matchMedia('(max-width: 640px)').matches);
const row = (page: Page, txn: string) => page.locator(`[data-test="expense-row"][data-txn="${txn}"]`);

async function openEdit(page: Page, txn: string): Promise<Locator> {
  if (await narrowOf(page)) await row(page, txn).locator('[data-test="row-who"]').click();
  else await row(page, txn).locator('[data-test="expense-edit"]').click();
  const dialog = page.getByRole('dialog', { name: 'Edit expense' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openNew(page: Page): Promise<Locator> {
  await openWaysIn(page);
  await page.locator('[data-test="expense-new"]').click();
  const dialog = page.getByRole('dialog', { name: 'Enter expense by hand' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// The select's trigger; while the list is open its search field is a
// combobox too, so the trigger is found by its data-test.
const field = (dialog: Locator) => dialog.locator('[data-test="expense-category"]');
const action = (dialog: Locator) => dialog.locator('[data-test="expense-category-action"]');
const hint = (dialog: Locator) => dialog.locator('[data-test="expense-category-hint"]');
const optionTexts = async (page: Page) => (await page.getByRole('option').allInnerTexts()).map((t) => t.trim());

async function choose(page: Page, dialog: Locator, name: string) {
  await field(dialog).click();
  await page.getByRole('option', { name, exact: true }).click();
}

// Types into the open list and picks its add row.
async function addTyped(page: Page, dialog: Locator, text: string) {
  await field(dialog).click();
  await page.keyboard.type(text);
  await page.getByRole('option', { name: `Add “${text}”` }).click();
}

// Closes a dialog with Cancel, discarding when it asks first.
async function cancel(page: Page, dialog: Locator) {
  await dialog.locator('[data-test="expense-cancel"]').click();
  const discard = dialog.locator('[data-test="unsent-discard"]');
  if (await discard.isVisible()) await discard.click();
  await expect(dialog).toBeHidden();
}

const HINT = 'To add a category, type its name in the list.';

test.describe('#11580 add a category in the select, remove it under the field', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a typed new name waits in the field and Save adds it with the expense', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    let dialog = await openNew(page);
    await dialog.locator('[data-test="expense-date"]').fill('2026-11-02');
    await dialog.locator('[data-test="expense-amount"]').fill('8,50');
    await field(dialog).click();
    await expect(page.locator('.select__search-input:visible')).toHaveAttribute('placeholder', 'Type to filter or add');
    await page.keyboard.type('Gig snacks');
    await page.getByRole('option', { name: 'Add “Gig snacks”' }).click();
    await expect(field(dialog)).toContainText('Gig snacks');
    await expect(hint(dialog)).toHaveText('New category. Save adds it to your categories.');
    await expect(action(dialog)).toHaveCount(0);
    expect(fake.requests.filter((r) => r.method === 'POST'), 'nothing is sent before Save').toEqual([]);

    await dialog.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();
    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/invoicing/expenses/manual')!;
    expect(JSON.parse(post.body)).toMatchObject({ category: 'Gig snacks', create_category: true });
    await expect(row(page, 'M-new-e')).toContainText('Gig snacks');

    dialog = await openNew(page);
    await field(dialog).click();
    expect(await optionTexts(page)).toContain('Gig snacks');
  });

  test('after Add and then Cancel the category does not exist', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    let dialog = await openNew(page);
    await addTyped(page, dialog, 'Gig snacks');
    await cancel(page, dialog);
    expect(fake.requests.filter((r) => r.method === 'POST')).toEqual([]);
    dialog = await openNew(page);
    await field(dialog).click();
    expect(await optionTexts(page)).not.toContain('Gig snacks');
  });

  test('choosing another category drops the added name', async ({ page }) => {
    await open(page, newFake());
    const dialog = await openNew(page);
    await addTyped(page, dialog, 'Gig snacks');
    await choose(page, dialog, 'travel');
    await field(dialog).click();
    expect(await optionTexts(page)).not.toContain('Gig snacks');
  });

  test('Enter with a typed name and nothing matching adds nothing', async ({ page }) => {
    await open(page, newFake());
    const dialog = await openNew(page);
    await field(dialog).click();
    await page.keyboard.type('Gig snacks');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: 'Add “Gig snacks”' }), 'the add row is still only offered').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(field(dialog)).toContainText('other');
    await expect(hint(dialog)).toHaveText(HINT);
  });

  test('a starter type and Private show the hint and no action; the old add form is gone', async ({ page }) => {
    await open(page, newFake());
    const dialog = await openEdit(page, 'N26-imp-e');
    await expect(field(dialog)).toContainText('travel');
    await expect(action(dialog)).toHaveCount(0);
    await expect(hint(dialog)).toHaveText(HINT);
    await choose(page, dialog, 'Private');
    await expect(action(dialog)).toHaveCount(0);
    await expect(hint(dialog)).toHaveText(HINT);
    await expect(dialog.getByText('+ Add a category')).toHaveCount(0);
    await expect(dialog.getByText('Save category')).toHaveCount(0);
  });

  test('removed while saved with it: Restore, the expense keeps it, other selects drop it, Save still works', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    let dialog = await openEdit(page, 'M-hand-e');
    await expect(action(dialog)).toHaveText('Remove from your categories');
    await expect(action(dialog)).toHaveAttribute('aria-label', 'Remove “Studio snacks” from your categories');
    await expect(hint(dialog)).toHaveText(HINT);
    await action(dialog).click();
    await expect(action(dialog)).toHaveText('Restore to your categories');
    await expect(action(dialog)).toHaveAttribute('aria-label', 'Restore “Studio snacks” to your categories');
    await expect(hint(dialog)).toHaveText('Removed from your categories. This expense keeps it until you choose another.');
    await expect(field(dialog)).toContainText('Studio snacks');
    expect(fake.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual(['/invoicing/expense-categories/10/remove']);

    // Still saves, with no category in the patch.
    await dialog.locator('[data-test="expense-payee"]').fill('Kiosk Beispiel GmbH');
    await dialog.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();
    const patch = fake.requests.find((r) => r.method === 'PATCH')!;
    expect(JSON.parse(patch.body)).toEqual({ payee: 'Kiosk Beispiel GmbH' });

    dialog = await openEdit(page, 'N26-imp-e');
    await field(dialog).click();
    expect(await optionTexts(page)).not.toContain('Studio snacks');
    await page.keyboard.press('Escape');
    await cancel(page, dialog);

    // Reopened, it reads the same; Restore offers it again.
    dialog = await openEdit(page, 'M-hand-e');
    await expect(action(dialog)).toHaveText('Restore to your categories');
    await action(dialog).click();
    await expect(action(dialog)).toHaveText('Remove from your categories');
    await cancel(page, dialog);
    dialog = await openEdit(page, 'N26-imp-e');
    await field(dialog).click();
    expect(await optionTexts(page)).toContain('Studio snacks');
  });

  test('removed while not saved with it: the field returns, and Restore “…” undoes it until the field changes', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp-e');
    await choose(page, dialog, 'Studio snacks');
    await expect(action(dialog)).toHaveText('Remove from your categories');
    await action(dialog).click();
    await expect(field(dialog)).toContainText('travel');
    await expect(hint(dialog)).toHaveText('Removed “Studio snacks” from your categories.');
    await expect(action(dialog)).toHaveText('Restore “Studio snacks”');
    await expect(action(dialog)).toHaveAttribute('aria-label', 'Restore “Studio snacks” to your categories');

    await action(dialog).click();
    await expect(field(dialog)).toContainText('Studio snacks');
    await expect(action(dialog)).toHaveText('Remove from your categories');
    expect(fake.requests.filter((r) => r.method === 'POST').map((r) => r.path)).toEqual([
      '/invoicing/expense-categories/10/remove',
      '/invoicing/expense-categories/10/restore',
    ]);

    // Removed again, then the field changes: the offer ends.
    await action(dialog).click();
    await expect(action(dialog)).toHaveText('Restore “Studio snacks”');
    await choose(page, dialog, 'other');
    await expect(action(dialog)).toHaveCount(0);
    await expect(hint(dialog)).toHaveText(HINT);
  });

  test('on a new expense a remove returns the field to Other', async ({ page }) => {
    await open(page, newFake());
    const dialog = await openNew(page);
    await choose(page, dialog, 'Studio snacks');
    await action(dialog).click();
    await expect(field(dialog)).toContainText('other');
    await expect(action(dialog)).toHaveText('Restore “Studio snacks”');
  });

  test('a failed Remove shows the reason under the field and changes nothing', async ({ page }) => {
    const fake = newFake();
    fake.actionRefusal = 'Error updating category';
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp-e');
    await choose(page, dialog, 'Studio snacks');
    await action(dialog).click();
    await expect(dialog.locator('[data-test="expense-category-error"]')).toHaveText('Error updating category');
    await expect(field(dialog)).toContainText('Studio snacks');
    await expect(action(dialog)).toHaveText('Remove from your categories');
  });

  test('a failed Restore shows the reason under the field and changes nothing', async ({ page }) => {
    const fake = newFake();
    fake.actionRefusal = 'Error updating category';
    await open(page, fake);
    const dialog = await openEdit(page, 'M-frame-e');
    await action(dialog).click();
    await expect(dialog.locator('[data-test="expense-category-error"]')).toHaveText('Error updating category');
    await expect(action(dialog)).toHaveText('Restore to your categories');
    expect(fake.categories.find((c) => c.name === 'Frames')!.removed_at).toBe(REMOVED_AT);
  });

  test('an expense saved with a removed category shows it, with Restore', async ({ page }) => {
    await open(page, newFake());
    const dialog = await openEdit(page, 'M-frame-e');
    await expect(field(dialog)).toContainText('Frames');
    await expect(action(dialog)).toHaveText('Restore to your categories');
    await expect(hint(dialog)).toHaveText('Removed from your categories. This expense keeps it until you choose another.');
  });

  test('a typed name equal to a removed category says Save restores it, and Save does', async ({ page }) => {
    const fake = newFake();
    await open(page, fake);
    const dialog = await openEdit(page, 'N26-imp-e');
    await field(dialog).click();
    expect(await optionTexts(page), 'not offered for a new choice').not.toContain('Frames');
    await page.keyboard.type('frames');
    await page.getByRole('option', { name: 'Add “frames”' }).click();
    await expect(hint(dialog)).toHaveText('You removed this category. Save restores it.');
    await dialog.locator('[data-test="expense-save"]').click();
    await expect(dialog).toBeHidden();
    const patch = fake.requests.find((r) => r.method === 'PATCH')!;
    expect(JSON.parse(patch.body)).toEqual({ category: 'frames', create_category: true });
    expect(fake.categories.find((c) => c.name === 'Frames')!.removed_at).toBeNull();
  });
});

test.describe('#11580 a removed category is not offered for a new choice on Transactions', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop table; a phone card reads the category as text');
  const select = (page: Page, txn: string) => row(page, txn).locator('[data-test="table-expense-category"]');

  test('a row select lists live categories, plus its own removed one', async ({ page }) => {
    await open(page, newFake());
    await select(page, 'N26-imp-e').click();
    expect(await optionTexts(page)).toEqual(['materials and supplies', 'other', 'travel', 'Studio snacks', 'Private']);
    await page.keyboard.press('Escape');
    await select(page, 'M-frame-e').click();
    expect(await optionTexts(page)).toEqual(['materials and supplies', 'other', 'travel', 'Studio snacks', 'Private', 'Frames']);
  });

  test('Set category leaves out a removed category even when a row carries it', async ({ page }) => {
    await open(page, newFake());
    await select(page, 'N26-imp-e').click();
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Select N26-imp-e' }).check();
    await page.locator('[data-test="bulk-category"]').click();
    expect(await optionTexts(page)).not.toContain('Frames');
  });
});

// The Book's "Change what counts" (§3.161 Decision 5; design ack c75159):
// a removed category stays listed while an expense has it, and goes once
// none does and the selection does not name it.
test('#11580 the Book lists a removed category only while an expense still has it', async ({ page }) => {
  const fake = newFake();
  fake.categories.splice(5, 0, cat(12, 'Old prints', { removed_at: REMOVED_AT }));
  await open(page, fake);
  await page.getByRole('tab', { name: 'Book', exact: true }).click();
  await page.locator('[data-test="book-change-summary"]').click();
  const ticks = page.locator('[data-test="book-tick-out"]');
  await expect(ticks.first()).toBeVisible();
  const listed = await ticks.evaluateAll((els) => els.map((el) => el.getAttribute('data-category')));
  expect(listed).toContain('Frames');
  expect(listed).toContain('Studio snacks');
  expect(listed).not.toContain('Old prints');
});
