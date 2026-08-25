import { test, expect } from '@playwright/test';
import { seedTrustedSession } from './helpers/mockBackend';

test('kvitto maker form', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('user_role', 'Admin'));
  await page.goto('/admin/tools/kvitto');
  const fields = page.locator('.form-container .field');
  await expect(fields).toHaveCount(5);
  const labels = await page.locator('.form-container .field__label').allInnerTexts();
  const values = await page.locator('.form-container input').evaluateAll((ns) =>
    ns.map((n: HTMLInputElement) => `${n.type}:${n.value}`)
  );
  const h = await page.locator('.form-container .field__control').first().boundingBox();
  console.log(`KV labels=${JSON.stringify(labels)}\nKV values=${JSON.stringify(values)} box=${Math.round(h.width)}x${h.height}`);
  await page.locator('.form-container').screenshot({ path: '/tmp/c4307/kvitto.png' });
});

test('rgb guesser clamp + pairing', async ({ page }) => {
  await page.goto('/quizzes/rbguesser');
  const num = page.locator('.channel-field input').first();
  const range = page.locator('input[type="range"]').first();
  await expect(num).toBeVisible();

  // The clamp: type an out-of-range value and read what survives.
  await num.fill('300');
  const clamped = await num.inputValue();

  // Pairing: move the slider, the number must follow.
  await range.fill('137');
  const paired = await num.inputValue();

  // And back: type in the number, the slider must follow.
  await num.fill('42');
  const pairedBack = await range.inputValue();

  const box = await page.locator('.channel-field .field__control').first().boundingBox();
  const align = await num.evaluate((n) => getComputedStyle(n).textAlign);
  console.log(`RGB typed300->"${clamped}" slider137->num"${paired}" num42->slider"${pairedBack}" box=${Math.round(box.width)}x${box.height} align=${align}`);
  await page.locator('.color-inputs-container').screenshot({ path: '/tmp/c4307/rgb.png' });
});

test('pappas pushups AFTER', async ({ page }) => {
  await seedTrustedSession(page);
  await page.route(/\/api\/pushups\/entries$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [{ date: '2026-08-24', count: 40 }, { date: '2026-08-25', count: 55 }] }) }));
  await page.route(/\/api\/pushups\/milestones$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ milestones: [] }) }));
  await page.goto('/member/personal/pappas-pushups');
  await page.$$eval('.week-block', (bs) => bs.forEach((b) => b.setAttribute('open', '')));
  const table = page.locator('.entries-table').first();
  await expect(table).toBeVisible();
  await table.screenshot({ path: '/tmp/c4307/pushups-after.png' });
  const wrap = await page.locator('.count-field').first().boundingBox();
  console.log('PUSHUPS wrapper box', Math.round(wrap.width) + 'x' + Math.round(wrap.height));
  const st = await page.locator('.count-cell input').first().evaluate((n) => {
    const s = getComputedStyle(n);
    return `bg=${s.backgroundColor} color=${s.color} weight=${s.fontWeight} align=${s.textAlign} w=${s.width}`;
  });
  console.log('PUSHUPS AFTER ' + st);
});
