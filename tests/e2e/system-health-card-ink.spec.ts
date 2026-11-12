import { test, expect, type Route } from '@playwright/test';
import { seedAdminSession } from './helpers/mockBackend';

/** Admin → System health (system_3 #10578): every muted text on the dark
 *  health cards reads in both themes. The page's --text-muted renders as the
 *  card's own colour in light theme, which left the card labels invisible.
 *  This measures each text's contrast against its card (alpha composited),
 *  so an ink equal to the card scores 1:1 and fails. */

const json = (route: Route, body: Record<string, any>) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const SELECTORS = [
  '.disk-label', '.container-count', '.container-status', '.metric-label',
  '.metric-value', '.container-uptime', '.info-label', '.db-summary',
];

for (const theme of ['light', 'dark'] as const) {
  test(`every muted text on a health card clears 4.5:1 (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.route(/\/api\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.route(/\/api\/health$/, (route) => json(route, { status: 'healthy', service: 'aspirant-server', checks: { database: 'ok' } }));
    await page.route(/\/api\/system\/containers$/, (route) => json(route, {
      containers: [{ name: 'aspirant-online-server-1', status: 'running', cpu_percent: 3.2, memory_usage_mb: 120, memory_limit_mb: 512, memory_percent: 23, network_rx_mb: 1.5, network_tx_mb: 2.5, uptime: '3 days' }],
    }));
    await page.route(/\/api\/system\/disk$/, (route) => json(route, {
      disks: [{ mount: '/', label: 'Root', total_gb: 100, used_gb: 40, free_gb: 60, percent_used: 40 }],
      volumes: [{ name: '/data/aspirant/models', size_mb: 2048, ref_count: -1 }],
      images: { total_count: 3, total_size_mb: 900 },
    }));
    await page.route(/\/api\/system\/db-stats$/, (route) => json(route, {
      data: { table_count: 1, total_rows: 3, total_size_mb: 1, tables: [{ name: 'users', rows: 3, size_mb: 1 }] },
    }));
    await seedAdminSession(page);
    await page.goto('/admin/system-health');
    await expect(page.locator('.container-uptime').first()).toBeVisible();

    const ratios = await page.evaluate((sels) => {
      const parse = (c: string): number[] => {
        const nums = (c.match(/[\d.]+/g) || []).map(Number);
        if (c.startsWith('color(srgb')) return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums.length > 3 ? nums[3] : 1];
        return [nums[0], nums[1], nums[2], nums.length > 3 ? nums[3] : 1];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const out: Record<string, number> = {};
      for (const sel of sels) {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) { out[sel] = -1; continue; }
        let bgEl: HTMLElement | null = el;
        while (bgEl && parse(getComputedStyle(bgEl).backgroundColor)[3] === 0) bgEl = bgEl.parentElement;
        const bg = parse(getComputedStyle(bgEl!).backgroundColor);
        const [r, g, b, a] = parse(getComputedStyle(el).color);
        const ink = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
        const [l1, l2] = [lum(ink), lum(bg)].sort((x, y) => y - x);
        out[sel] = Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
      }
      return out;
    }, SELECTORS);
    console.log(`card ink ${theme}: ${JSON.stringify(ratios)}`);
    for (const sel of SELECTORS) expect(ratios[sel], `${sel} (${theme})`).toBeGreaterThanOrEqual(4.5);
  });
}

/** system_3 #10594: `.container-card.stopped` used to dim the whole card
 *  (including its text) to 50% opacity, which undid most of the contrast
 *  gain above for a stopped container. The rule is gone; the state stays
 *  said in words (.container-status) and by the dot's colour alone. */
for (const theme of ['light', 'dark'] as const) {
  test(`a stopped container's name and status clear 4.5:1 (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.route(/\/api\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.route(/\/api\/health$/, (route) => json(route, { status: 'healthy', service: 'aspirant-server', checks: { database: 'ok' } }));
    await page.route(/\/api\/system\/containers$/, (route) => json(route, {
      containers: [
        { name: 'aspirant-online-server-1', status: 'running', cpu_percent: 3.2, memory_usage_mb: 120, memory_limit_mb: 512, memory_percent: 23, network_rx_mb: 1.5, network_tx_mb: 2.5, uptime: '3 days' },
        { name: 'aspirant-stopped-1', status: 'stopped', cpu_percent: 0, memory_usage_mb: 0, memory_limit_mb: 512, memory_percent: 0, network_rx_mb: 0, network_tx_mb: 0, uptime: '-' },
      ],
    }));
    await page.route(/\/api\/system\/disk$/, (route) => json(route, {
      disks: [{ mount: '/', label: 'Root', total_gb: 100, used_gb: 40, free_gb: 60, percent_used: 40 }],
      volumes: [{ name: '/data/aspirant/models', size_mb: 2048, ref_count: -1 }],
      images: { total_count: 3, total_size_mb: 900 },
    }));
    await page.route(/\/api\/system\/db-stats$/, (route) => json(route, {
      data: { table_count: 1, total_rows: 3, total_size_mb: 1, tables: [{ name: 'users', rows: 3, size_mb: 1 }] },
    }));
    await seedAdminSession(page);
    await page.goto('/admin/system-health');
    await expect(page.locator('.container-card.stopped')).toBeVisible();

    const ratios = await page.evaluate(() => {
      const parse = (c: string): number[] => {
        const nums = (c.match(/[\d.]+/g) || []).map(Number);
        if (c.startsWith('color(srgb')) return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums.length > 3 ? nums[3] : 1];
        return [nums[0], nums[1], nums[2], nums.length > 3 ? nums[3] : 1];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const out: Record<string, number> = {};
      const card = document.querySelector('.container-card.stopped') as HTMLElement;
      for (const sel of ['.container-name', '.container-status']) {
        const el = card.querySelector(sel) as HTMLElement;
        let bgEl: HTMLElement | null = el;
        while (bgEl && parse(getComputedStyle(bgEl).backgroundColor)[3] === 0) bgEl = bgEl.parentElement;
        const bg = parse(getComputedStyle(bgEl!).backgroundColor);
        const [r, g, b, a] = parse(getComputedStyle(el).color);
        const ink = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
        const [l1, l2] = [lum(ink), lum(bg)].sort((x, y) => y - x);
        out[sel] = Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
      }
      out['.container-card.stopped.opacity'] = Number(getComputedStyle(card).opacity);
      return out;
    });
    console.log(`stopped card ink ${theme}: ${JSON.stringify(ratios)}`);
    expect(ratios['.container-card.stopped.opacity'], `card opacity (${theme})`).toBe(1);
    expect(ratios['.container-name'], `.container-name (${theme})`).toBeGreaterThanOrEqual(4.5);
    expect(ratios['.container-status'], `.container-status (${theme})`).toBeGreaterThanOrEqual(4.5);
  });
}
