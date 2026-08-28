import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  seedProcessedRows,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

/**
 * #4447 (#4442-A10e) — the member/personal Värdeutlåtande surface adopts two DS
 * primitives: the two glyph-only controls become AspButton size="icon" (§3.89 /
 * §3.23 rule-4) and the three-member top-level strip becomes AspSegmented
 * as="tabs" (§3.89 Q1).
 *
 * These assert the OUTCOME — a DS root, an accessible name, the fixed 44x44
 * target, a working handler, the ARIA the pattern promises — not the class list
 * of the moment, so a regression is caught however it is reintroduced.
 *
 * NOT covered here, on purpose: `JobsView.vue`'s `.tab-strip`. Its members
 * carry `data-test="jobs-tab-all"` / `jobs-tab-saved` hooks that jobs.spec.ts
 * selects on, and AspSegmented renders its members from an `options` array with
 * no per-option attribute seam — porting it would drop a stable explicit hook
 * to work around a DS limitation. Held and filed as #4450; that strip stays
 * native until the DS lands a seam.
 */

const CREATE_TAB = 'Skapa';
const HISTORY_TAB = 'Tidigare värderingar';
const ABOUT_TAB = 'Om verktyget';

async function openView(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.locator('h1', { hasText: 'Värdeutlåtande' })).toBeVisible();
}

/** The DS root, an accessible name, the 44x44 square. */
async function expectIconButton(page: Page, name: string | RegExp, label: string): Promise<void> {
  const btn = page.getByRole('button', { name }).first();
  await expect(btn, `${label}: rendered`).toBeVisible();
  await expect(btn, `${label}: is the DS icon shape`).toHaveClass(/btn--size-icon/);
  const box = await btn.boundingBox();
  expect(box, `${label}: has a box`).not.toBeNull();
  expect(Math.round(box!.width), `${label}: 44px wide`).toBe(44);
  expect(Math.round(box!.height), `${label}: 44px tall`).toBe(44);
}

test.describe('#4447 member/personal glyph-only controls + tab strip', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('the per-file remove control is an icon AspButton and still removes the file', async ({ page }) => {
    await openView(page);
    await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);

    const first = PDF_UPLOAD_PAYLOAD[0].name;
    await expect(page.locator('.file-list li')).toHaveCount(PDF_UPLOAD_PAYLOAD.length);
    await expectIconButton(page, `Ta bort ${first}`, 'file remove');

    await page.getByRole('button', { name: `Ta bort ${first}` }).click();
    await expect(page.locator('.file-list li')).toHaveCount(PDF_UPLOAD_PAYLOAD.length - 1);
    await expect(page.locator('.file-name', { hasText: first })).toHaveCount(0);
  });

  test('the row-action kebab is an icon AspButton, keeps its selector hook, and opens the menu', async ({ page }) => {
    seedProcessedRows([
      { id: 'row-menu-1', name: 'Värdering A', created_at: '2026-08-01T10:00:00Z', final_values: {} },
    ]);
    await openView(page);
    await page.getByRole('tab', { name: HISTORY_TAB }).click();

    await expectIconButton(page, 'Åtgärder för Värdering A', 'row kebab');

    // The class survives the port because processed-valuations.spec.ts binds
    // it; AspButton merges it onto the DS root rather than a wrapper.
    const trigger = page.locator('[data-test-row-id="row-menu-1"] .row-menu-trigger');
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveClass(/btn--size-icon/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-test-row-id="row-menu-1"] .row-menu-popover')).toBeVisible();
  });

  test('the top-level strip is AspSegmented as="tabs" with a named tablist and real panels', async ({ page }) => {
    await openView(page);

    const strip = page.getByRole('tablist', { name: 'Värdeutlåtande-vyer' });
    await expect(strip).toBeVisible();
    await expect(strip.locator('.segmented__item')).toHaveCount(3);
    await expect(strip.getByRole('tab')).toHaveText([CREATE_TAB, HISTORY_TAB, ABOUT_TAB]);

    // The selected member says so, and the panel it names is the one rendered.
    const created = page.getByRole('tab', { name: CREATE_TAB });
    await expect(created).toHaveAttribute('aria-selected', 'true');
    const panelId = await created.getAttribute('aria-controls');
    expect(panelId).toBe('vs-panel-create');
    await expect(page.locator(`#${panelId}`)).toHaveAttribute('role', 'tabpanel');

    // One tab stop for the whole strip (roving tabindex), which is the DS
    // keyboard model the native strip never had.
    await expect(created).toHaveAttribute('tabindex', '0');
    await expect(page.getByRole('tab', { name: ABOUT_TAB })).toHaveAttribute('tabindex', '-1');
  });

  test('selecting the history member still loads the history, by click and by keyboard', async ({ page }) => {
    seedProcessedRows([
      { id: 'row-kbd', name: 'Värdering B', created_at: '2026-08-02T10:00:00Z', final_values: {} },
    ]);
    await openView(page);

    // Click: the load-on-open side effect the old per-button @click carried
    // survives on AspSegmented's update:modelValue.
    await page.getByRole('tab', { name: HISTORY_TAB }).click();
    await expect(page.locator('[data-test-row-id="row-kbd"]')).toBeVisible();
    await expect(page.locator('#vs-panel-history')).toBeVisible();

    // Keyboard: WAI-ARIA automatic activation moves selection AND the panel.
    await page.getByRole('tab', { name: HISTORY_TAB }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: ABOUT_TAB })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#vs-panel-about')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: HISTORY_TAB })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-test-row-id="row-kbd"]')).toBeVisible();
  });
});
