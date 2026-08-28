import { test, expect, type Page } from '@playwright/test';
import {
  installCommanderMocks,
  seedTrustedSession,
  dismissMobileSidebarIfPresent,
  PDF_UPLOAD_PAYLOAD,
} from './helpers/mockBackend';

/**
 * #4480 (#4476-C5d) — Värdeutlåtande's two selects and its note field become
 * AspSelect / AspTextarea, and LuddeAnalytics' comment box becomes AspTextarea.
 *
 * The failure this file exists for is not "the control did not render". It is
 * the confidence colour code silently going missing: the tint rules listed
 * `input, select, textarea`, and AspSelect renders a <button> that none of
 * those reach. Both migrated rows lost their tint on the first build, and only
 * the existing box-uniformity assertion caught it. These tests pin the tint to
 * the DS surfaces by name so the next migration in this file cannot drop it.
 */

async function walkToReview(page: Page): Promise<void> {
  await page.goto('/member/personal/valuation-statement');
  await dismissMobileSidebarIfPresent(page);
  await page.locator('input[type="file"]').setInputFiles(PDF_UPLOAD_PAYLOAD);
  await page.getByRole('button', { name: /Extrahera värden/ }).click();
  await expect(page.getByRole('heading', { name: /Granska och justera/ })).toBeVisible({ timeout: 15_000 });
}

/** The edge of a control against the surface immediately around it — the larger
 *  of border-vs-surround and fill-vs-surround, since either can draw the box. */
async function restBoundary(locator: ReturnType<Page['locator']>): Promise<number | null> {
  return locator.evaluate((el) => {
    const parse = (s: string) => {
      let m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
      if (m) return { r: 255 * +m[1], g: 255 * +m[2], b: 255 * +m[3], a: m[4] === undefined ? 1 : +m[4] };
      return null;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const cs = getComputedStyle(el as HTMLElement);
    let surround = null;
    for (let n = (el as HTMLElement).parentElement; n && !surround; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a === 1) surround = c;
    }
    if (!surround) return null;
    const cands = [parse(cs.borderColor), parse(cs.backgroundColor)]
      .filter((c): c is { r: number; g: number; b: number; a: number } => !!c && c.a === 1);
    if (!cands.length) return null;
    return Math.max(...cands.map((c) => {
      const l1 = lum(c), l2 = lum(surround!);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }));
  });
}

test.describe('#4480 personal form controls are DS components', () => {
  test.beforeEach(async ({ page }) => {
    await seedTrustedSession(page);
    await installCommanderMocks(page);
  });

  test('the two review selects are AspSelect and still mark the field manual', async ({ page }) => {
    await walkToReview(page);

    const row = page.locator('.field-row', { hasText: /^Upplåtelseform/ });
    const trigger = row.getByRole('combobox', { name: 'Upplåtelseform' });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName('Upplåtelseform');

    // markManual is the second effect the native paired with v-model via
    // @change. AspSelect emits only update:modelValue, so a port that keeps
    // v-model and drops the handler renders perfectly and stops recolouring the
    // row — which is exactly the state the operator scans this form by.
    await trigger.click();
    await page.getByRole('listbox').first().getByRole('option', { name: 'Tomträtt', exact: true }).click();
    await expect(trigger).toContainText('Tomträtt');
    await expect(row, 'choosing a value marks the row manual').toHaveClass(/manual/);

    await expect(page.getByRole('combobox', { name: 'Likviditet' })).toBeVisible();
  });

  test('the confidence tint reaches every DS control surface, not just AspInput', async ({ page }) => {
    await walkToReview(page);

    // The tint is what the operator scans the form by. It lands on whichever
    // node paints the fill, and each DS component puts that on a different
    // class: AspInput on .field__control, AspSelect on .select__trigger (a
    // <button> — no `select` selector reaches it), AspTextarea on
    // .field__textarea. A migration that adds a component without adding its
    // surface here loses the colour code silently.
    const surfaces = ['.field__control', '.select__trigger', '.field__textarea'];
    for (const surface of surfaces) {
      const el = page.locator(`.field-row.confident ${surface}, .field-row.uncertain ${surface}, .field-row.manual ${surface}, .field-row.not-found ${surface}`).first();
      if (!(await el.count())) continue;
      const fill = await el.evaluate((n) => getComputedStyle(n as HTMLElement).backgroundColor);
      expect(fill, `${surface} carries a tint, not the plain elevated fill`).not.toBe('rgb(249, 249, 249)');
      expect(fill, `${surface} carries an opaque tint`).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    }
  });

  test('the note field is AspTextarea and still marks the field manual', async ({ page }) => {
    await walkToReview(page);
    const row = page.locator('.field-row', { hasText: /bilder\/skick/ });
    const note = row.locator('textarea');
    await expect(note).toBeVisible();
    await expect(note).toHaveClass(/field__textarea/);
    await note.fill('en anteckning');
    await expect(row, 'typing marks the row manual').toHaveClass(/manual/);
  });

  test('the operator-defaults checkbox keeps a visible rest boundary', async ({ page }) => {
    // Pinned to light: this control sits on the page, and the native box's #000
    // boundary reads very differently against a near-white ground than against
    // the dark card #4479's equivalent sits on. Which control is rendering is
    // not the assertion — the boundary clearing 3:1 is, so this holds whether
    // the checkbox is native today or AspCheckbox after #4482.
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await walkToReview(page);
    const box = page.locator('.checkbox-row input[type=checkbox]').first();
    await expect(box).toBeVisible();
    const ratio = await restBoundary(box);
    expect(ratio, 'boundary is measurable').not.toBeNull();
    expect(ratio!, 'rest boundary clears WCAG 1.4.11 3:1').toBeGreaterThanOrEqual(3);
  });
});
