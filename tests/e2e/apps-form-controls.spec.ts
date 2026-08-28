import { test, expect, type Page } from '@playwright/test';
import { dismissMobileSidebarIfPresent } from './helpers/mockBackend';

/**
 * #4481 (#4476-C5e) — QrGenerator's textarea and size select become AspTextarea
 * and AspSelect.
 *
 * Two things here fail quietly and neither is a render bug:
 *
 *  - The size options are NUMBERS (`selectedSize` is interpolated into the QR
 *    service's `?size=NxN` query and the image's inline width/height). AspSelect
 *    matches with `===`, so a value that became a string would select nothing
 *    and size nothing while the dropdown still looked correct.
 *  - `<label for>` survives on the textarea and cannot on the select, because
 *    AspTextarea sets inheritAttrs: false (id reaches the real element) and
 *    AspSelect does not (id lands on its wrapper div). The captions must still
 *    render alike or the card carries two treatments.
 */

async function openQr(page: Page): Promise<void> {
  await page.goto('/applications/qr-generator');
  await dismissMobileSidebarIfPresent(page);
  await expect(page.getByRole('heading', { name: 'QR Code Generator' })).toBeVisible();
}

test.describe('#4481 QrGenerator form controls are DS components', () => {
  test('the input is AspTextarea, keeps its label association and its counter', async ({ page }) => {
    await openQr(page);

    const box = page.getByLabel('Enter text or URL');
    await expect(box, 'the <label for> still resolves to the real control').toBeVisible();
    await expect(box).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(box).toHaveClass(/field__textarea/);
    // maxlength rode $attrs through to the inner element.
    await expect(box).toHaveAttribute('maxlength', '900');

    await box.fill('https://example.com');
    await expect(page.locator('.char-counter')).toHaveText('19 / 900');
    // Typing regenerates: the handler hangs off update:modelValue now.
    await expect(page.locator('.qr-image')).toBeVisible();

    // .generator-card is a flex column with align-items: center, which shrinks
    // every item to its content width — the old `textarea { width: 100% }` was
    // undoing that. Measured, the field came out 190px in a 524px card once the
    // element rule went. Nothing about that is visible to a render assertion.
    // Compared against .char-counter rather than the card: the counter is the
    // sibling in the same flex column that still carries an explicit
    // `width: 100%`, so it is the exact width the field should have. The card's
    // own box includes padding and a 2px border, which makes a ratio against it
    // a threshold to tune rather than an equality to assert.
    const field = await box.boundingBox();
    const peer = await page.locator('.char-counter').boundingBox();
    expect(Math.round(field!.width), 'the field is as wide as its 100%-width sibling').toBe(Math.round(peer!.width));
  });

  test('the character counter is legible on the card it sits on', async ({ page }) => {
    await openQr(page);
    // .generator-card sets --surface-card and used to declare no ink, so
    // --text-muted (color-mix on currentColor) resolved the counter to 1.99:1
    // in light and 1.42:1 in dark. The card pairs its ink now; this asserts the
    // outcome, so it survives any later change to which token the counter uses.
    const ratio = await page.locator('.char-counter').evaluate((el) => {
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
      let bg = null;
      for (let n: HTMLElement | null = el as HTMLElement; n && !bg; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a === 1) bg = c;
      }
      const fg = parse(cs.color);
      if (!fg || !bg) return null;
      const eff = fg.a < 1
        ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
        : fg;
      const l1 = lum(eff), l2 = lum(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(ratio, 'counter contrast is measurable').not.toBeNull();
    expect(ratio!, 'counter clears AA 4.5:1').toBeGreaterThanOrEqual(4.5);
  });

  test('the size select is AspSelect and keeps NUMERIC values', async ({ page }) => {
    await openQr(page);
    await page.getByLabel('Enter text or URL').fill('https://example.com');
    const img = page.locator('.qr-image');
    await expect(img).toHaveAttribute('style', /width:\s*300px/);

    const size = page.getByRole('combobox', { name: 'Size' });
    await expect(size).toBeVisible();
    await expect(size).toContainText('Large (300px)');
    // AspSelect's trigger floors at min-width: 10rem (160px); the control was
    // 200px before, so the floor is kept explicitly rather than inherited.
    const sizeBox = await size.boundingBox();
    expect(Math.round(sizeBox!.width), 'the control keeps its 200px floor').toBeGreaterThanOrEqual(200);

    const regenerated = page.waitForRequest((r) => /qrserver\.com/.test(r.url()) && /size=500x500/.test(r.url()));
    await size.click();
    await page.getByRole('listbox').first().getByRole('option', { name: 'Extra Large (500px)', exact: true }).click();
    await regenerated;

    // Both halves of "the value is still a number": the query the service got,
    // and the inline style the image renders at. A string would break the
    // === match in AspSelect and neither would move.
    await expect(img).toHaveAttribute('style', /width:\s*500px/);
    await expect(size).toContainText('Extra Large (500px)');
  });

  test('both captions on the card render alike', async ({ page }) => {
    await openQr(page);
    // The select's caption had to stop being a <label for> when its control
    // became AspSelect. It must still resolve identically to the textarea's,
    // or the card carries two caption treatments — the mixed-contract
    // regression #4296 forbids in its label lane.
    const label = page.locator('.generator-card label').first();
    const caption = page.locator('.control-caption').first();
    for (const prop of ['font-size', 'font-weight', 'text-transform', 'letter-spacing', 'color']) {
      const a = await label.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      const b = await caption.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
      expect(b, `caption and label agree on ${prop}`).toBe(a);
    }
  });
});
