import { test, expect, type Page, type Route } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4477 (#4476-C5a) — the native form controls in the three admin views are DS
 * components: AspSelect for the seven `<select>`s, AspCheckbox for Finance's
 * internal-transfer toggle, AspTextarea for Advisor's question box.
 *
 * These assert the OUTCOME rather than a class list: the ARIA shape AspSelect
 * builds (a `combobox` trigger opening a `listbox`), the accessible name, and
 * — the part a shallow existence check would miss — that choosing an option
 * still runs the handler the native's `@change` used to run. AspSelect emits
 * only `update:modelValue`, so a migration that keeps `v-model` and drops the
 * refetch renders perfectly and silently stops filtering.
 *
 * Every option list is read off the trigger's own text after the choice, not
 * off the DOM class, because AspSelect's panel is `v-show`n and its options
 * stay in the tree when closed.
 */

const json = (body: unknown) => (route: Route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openAdmin(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await dismissMobileSidebarIfPresent(page);
}

async function seedAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('user_role', 'Admin');
    localStorage.setItem('user_name', 'e2e-admin');
  });
}

/** Catch-all first — Playwright matches most-recently-registered first. */
async function mockAdmin(page: Page): Promise<void> {
  await page.route(/\/api\//, json({}));
  await page.route(/\/api\/finance\/summary\/overview/, json({ total_transactions: 12, total_income: 1000, total_expenses: 500, banks: ['seb'], categories: ['groceries', 'rent'] }));
  // Non-empty: `v-if="monthlyData.length"` gates the whole chart section, and
  // with it the chart-category select and the internal-transfer checkbox.
  await page.route(/\/api\/finance\/summary\/monthly/, json([
    { month: '2026-01', category: 'groceries', flow_direction: 'expense', total_absolute: 250 },
    { month: '2026-02', category: 'rent', flow_direction: 'expense', total_absolute: 900 },
    { month: '2026-02', category: 'internal_transfer', flow_direction: 'income', total_absolute: 500 },
  ]));
  await page.route(/\/api\/finance\/summary\/outliers/, json({ top_expenses: [], top_income: [] }));
  await page.route(/\/api\/finance\/transactions/, json({ transactions: [], total: 0 }));
  await page.route(/\/api\/finance\/sources/, json([{ bank: 'seb', name: 'SEB', transaction_count: 12 }]));
  await page.route(/\/api\/finance\/categories/, json({ categories: ['groceries', 'rent'] }));
  await page.route(/\/api\/voice-messages/, json({ items: [] }));
  await page.route(/\/api\/commander\/tasks/, json({ items: [], total: 0 }));
  await page.route(/\/api\/commander\/notes/, json({ items: [], total_pages: 1 }));
  await page.route(/\/api\/commander\/vocabulary/, json([]));
  await page.route(/\/api\/advisor\/sources/, json({ domains: [{ name: 'legal', display_name: 'Legal', icon: 'scale', document_count: 1 }] }));
  await page.route(/\/api\/advisor\/documents/, json({ documents: [] }));
}

/** The DS dropdown's contract: a named combobox trigger that opens a listbox. */
async function expectSelect(page: Page, name: string, triggerText: string) {
  const trigger = page.getByRole('combobox', { name }).first();
  await expect(trigger, `${name}: rendered`).toBeVisible();
  await expect(trigger, `${name}: keeps an accessible name`).toHaveAccessibleName(name);
  await expect(trigger, `${name}: shows its current value`).toContainText(triggerText);
  return trigger;
}

/** Open `trigger`, click the option labelled `option`, return when it closes. */
async function choose(page: Page, trigger: ReturnType<Page['getByRole']>, option: string) {
  await trigger.click();
  const listbox = page.getByRole('listbox').first();
  await expect(listbox, 'panel opens as a listbox').toBeVisible();
  await listbox.getByRole('option', { name: option, exact: true }).first().click();
  await expect(listbox).toBeHidden();
}

test.describe('#4477 admin form controls are DS components', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdmin(page);
    await mockAdmin(page);
  });

  test('Finance filter selects are AspSelect and still refetch on choice', async ({ page }) => {
    await openAdmin(page, '/admin/finance');
    await expect(page.locator('.source-folder')).toBeVisible();

    const bank = await expectSelect(page, 'Filter by bank', 'All banks');
    await expectSelect(page, 'Filter by category', 'All categories');

    // The refetch is the half a render-only assertion misses: the native paired
    // v-model with @change, and only the explicit update:model-value handler
    // keeps that second effect alive.
    const refetch = page.waitForRequest((r) => /\/api\/finance\/transactions/.test(r.url()) && /bank=seb/.test(r.url()));
    await choose(page, bank, 'SEB');
    await refetch;
    await expect(bank).toContainText('SEB');
  });

  /**
   * The internal-transfer toggle is HELD native — AspCheckbox draws its box with
   * --border-subtle, which measures 1.26:1 against the light page where the
   * native's boundary measures 16.52:1 (dark is the reverse: 1.21:1 native vs
   * 10.84:1 DS) — DS defect #4482. This locks the hold so a later sweep does not
   * port it silently:
   * it asserts the boundary is still visible, not that the element is native.
   * When the DS box carries --border-control, the port lands and this assertion
   * keeps holding.
   */
  test('Finance internal-transfer toggle keeps a visible rest boundary', async ({ page }) => {
    // Pinned to light on purpose. The native box's boundary is #000: 16.52:1 on
    // the light page, but only 1.21:1 on the dark one, so an unpinned run would
    // pass or fail on whatever theme the runner resolved to. The dark failure is
    // real and pre-existing — it is the half of this control the DS fixes — and
    // is recorded in the hold comment rather than asserted here, because a red
    // that fires on a defect this PR deliberately did not touch teaches nobody.
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await openAdmin(page, '/admin/finance');
    // The view ships this filter ON (`excludeInternalTransfers: true`), so the
    // round-trip starts by clearing it — asserting an unchecked start would
    // have been asserting my assumption rather than the view's default.
    const box = page.getByRole('checkbox', { name: 'Exclude internal transfers' });
    await expect(box).toBeVisible();
    await expect(box, 'ships on').toBeChecked();
    await box.uncheck();
    await expect(box).not.toBeChecked();

    const contrast = await box.evaluate((el) => {
      const parse = (s: string) => {
        const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
      };
      const lum = (c: { r: number; g: number; b: number }) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const cs = getComputedStyle(el as HTMLElement);
      const border = parse(cs.borderColor) || parse(cs.color)!;
      let surround = null;
      for (let n = (el as HTMLElement).parentElement; n && !surround; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && !/rgba\(0, 0, 0, 0\)/.test(getComputedStyle(n).backgroundColor)) surround = c;
      }
      if (!surround) return null;
      const l1 = lum(border), l2 = lum(surround);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(contrast, 'unchecked boundary clears WCAG 1.4.11 3:1').not.toBeNull();
    expect(contrast!, 'unchecked boundary clears WCAG 1.4.11 3:1').toBeGreaterThanOrEqual(3);

    await box.check();
    await expect(box).toBeChecked();
    // The chart section survives the re-render the handler triggers.
    await expect(page.getByRole('combobox', { name: 'Chart category' })).toBeVisible();
  });

  test('VoiceCommander filter selects are AspSelect, and the row keeps one caption treatment', async ({ page }) => {
    await openAdmin(page, '/admin/voice-commander');
    const status = await expectSelect(page, 'Status', 'All');
    await expectSelect(page, 'Priority', 'All');

    const refetch = page.waitForRequest((r) => /\/api\/commander\/tasks/.test(r.url()) && /status=open/.test(r.url()));
    await choose(page, status, 'Open');
    await refetch;
    await expect(status).toContainText('Open');

    // The two select captions became <span class="filter-caption"> when their
    // controls stopped being labelable; they must still render the same as the
    // <label> the AspInput beside them keeps, or the row carries two caption
    // treatments — the mixed-contract regression #4296 forbids.
    const caption = page.locator('.filter-caption').first();
    const label = page.locator('.filter-group label').first();
    for (const prop of ['font-size', 'font-weight', 'text-transform', 'letter-spacing', 'color']) {
      const a = await caption.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      const b = await label.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      expect(a, `caption and label agree on ${prop}`).toBe(b);
    }
  });

  test('Advisor question box is AspTextarea and keeps its row width', async ({ page }) => {
    await openAdmin(page, '/admin/advisor');
    const box = page.getByPlaceholder('Ask a question...');
    await expect(box).toBeVisible();
    await expect(box, 'the DS renders the real textarea').toHaveJSProperty('tagName', 'TEXTAREA');
    // The consumer class must be on the WRAPPER, never on AspTextarea: its
    // inheritAttrs is false and $attrs rides the inner <textarea>, so a class
    // passed to the component lands where no scoped rule from the view reaches.
    await expect(box, 'consumer class is not on the DS textarea').not.toHaveClass(/chat-input/);
    // maxlength rode $attrs through to the inner element.
    await expect(box).toHaveAttribute('maxlength', '2000');

    // Send is disabled until the bound value is non-empty — proof v-model
    // reached the component and not just the DOM.
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await box.fill('what is the deductible');
    await expect(send).toBeEnabled();

    // flex: 1 now rides the component root; without it the field collapses to
    // its content width beside the button.
    const area = page.locator('.chat-input-area');
    const areaBox = await area.boundingBox();
    const fieldBox = await page.locator('.chat-input').boundingBox();
    expect(fieldBox!.width, 'question box takes the remaining row width').toBeGreaterThan(areaBox!.width * 0.6);
  });

  test('Advisor upload selects are AspSelect, placeholder included', async ({ page }) => {
    await openAdmin(page, '/admin/advisor');
    await expect(page.getByRole('heading', { name: 'Document Management' })).toBeVisible();
    // uploadDomain starts '' and matches no option, so the trigger shows the
    // placeholder — which is what the old disabled <option value=""> was for.
    const domain = await expectSelect(page, 'Domain', 'Select domain');
    await expectSelect(page, 'Access Level', 'Admin only');
    await choose(page, domain, 'Legal');
    await expect(domain).toContainText('Legal');
  });
});
