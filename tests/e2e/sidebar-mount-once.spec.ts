import { test, expect, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';

/**
 * system_3 #9581 (UX walk 2026-11-02 AC2; D13, §3.23, §3.121): the sidebar
 * arrives once, in place. On the served site the nav icons first showed the
 * shared `default` blob, then the logo appeared and pushed every link down
 * 143px, and the labels faded in twice, because every link was keyed on
 * `imagesLoaded` and remounted when the asset batch resolved.
 *
 * Every asset response is delayed, so the pending state lasts long enough to
 * sample, and each hash is served as a real PNG of its own width. A sampler
 * installed before the app runs records, every 100ms for 6s, each nav link's
 * y, its icon's src and its label's opacity, plus the logo container's height.
 */

const DELAY_MS = 1500;

/** A blank RGBA PNG `w` pixels square (same construction as nav-icons.spec). */
function png(w: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(w * (1 + w * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface Sample {
  t: number;
  logoHeight: number | null;
  links: Array<{ label: string; y: number; src: string; opacity: number }>;
}

async function sampleFirstSixSeconds(page: Page): Promise<Sample[]> {
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    (window as unknown as { __samples: unknown[] }).__samples = samples;
    const start = performance.now();
    const id = setInterval(() => {
      const t = Math.round(performance.now() - start);
      if (t > 6000) return clearInterval(id);
      const logo = document.querySelector<HTMLElement>('.logo-container');
      samples.push({
        t,
        logoHeight: logo ? Math.round(logo.getBoundingClientRect().height * 10) / 10 : null,
        links: Array.from(document.querySelectorAll<HTMLElement>('.nav-links a')).map((a) => {
          const img = a.querySelector('img');
          const label = a.querySelector<HTMLElement>('#sidebar-link');
          return {
            label: a.textContent!.trim(),
            y: Math.round(a.getBoundingClientRect().top * 10) / 10,
            src: img ? img.src : a.querySelector('.sidebar-image.loading') ? 'loading' : 'none',
            opacity: label ? Number(getComputedStyle(label).opacity) : 0,
          };
        }),
      });
    }, 100);
  });
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  let width = 10;
  const widthOf = new Map<string, number>();
  await page.route(/\/api\/fetch-object\//, async (route) => {
    const hash = new URL(route.request().url()).pathname.split('/').pop()!;
    if (!widthOf.has(hash)) widthOf.set(hash, width++);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.fulfill({ status: 200, contentType: 'image/png', body: png(widthOf.get(hash)!) });
  });
  await page.goto('/login');
  await page.waitForTimeout(6500);
  return page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
}

test('the sidebar mounts once: no shift, no shared placeholder, one fade, a held logo box', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the desktop sidebar; on a phone it is a drawer opened after load');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const samples = await sampleFirstSixSeconds(page);
  const withLinks = samples.filter((s) => s.links.length > 0);
  for (const s of withLinks.filter((_, i) => i % 5 === 0 || i === withLinks.length - 1))
    console.log(
      `SAMPLE t=${s.t} logo=${s.logoHeight} ${s.links.map((l) => `${l.label}:${l.y}:${l.src.slice(0, 5)}${l.src.slice(-6)}:${l.opacity}`).join(' ')}`
    );
  // The window must span the transition the defects lived in: some samples
  // while an icon is still pending, then the batch resolved. Without both, the
  // stability checks below would pass on a page that never changed.
  const pendingAt = withLinks.findIndex((s) => s.links.some((l) => l.src === 'loading'));
  expect(pendingAt, 'a sample caught an icon still loading').toBeGreaterThanOrEqual(0);
  const settledAfter = withLinks
    .slice(pendingAt)
    .findIndex((s) => s.links.every((l) => /^blob:|^http/.test(l.src)));
  expect(settledAfter, 'a later sample saw every icon loaded').toBeGreaterThan(0);

  const labels = [...new Set(withLinks.flatMap((s) => s.links.map((l) => l.label)))];
  const last = withLinks[withLinks.length - 1];
  console.log(
    `SIDEBAR samples=${withLinks.length} first_t=${withLinks[0].t} labels=${labels.join(',')} ` +
      `logo=${[...new Set(samples.map((s) => s.logoHeight))].join('/')} ` +
      `final=${JSON.stringify(last.links.map((l) => [l.label, l.y, l.src.slice(-12), l.opacity]))}`
  );

  // The assets did arrive: every icon is a loaded image by the end.
  for (const l of last.links) expect(l.src, `${l.label} icon loaded`).toMatch(/^blob:|^http/);

  for (const label of labels) {
    const seq = withLinks.flatMap((s) => s.links.filter((l) => l.label === label));
    const ys = [...new Set(seq.map((l) => l.y))];
    expect(ys, `${label} y never changes after first paint`).toHaveLength(1);
    // The label fades in once: once at 1 it stays at 1.
    const firstFull = seq.findIndex((l) => l.opacity >= 0.99);
    expect(firstFull, `${label} label reaches full opacity`).toBeGreaterThanOrEqual(0);
    const dips = seq.slice(firstFull).filter((l) => l.opacity < 0.99).length;
    expect(dips, `${label} label never fades again`).toBe(0);
  }

  // No two nav items ever show the same image (the shared default blob).
  for (const s of withLinks) {
    const srcs = s.links.map((l) => l.src).filter((src) => src !== 'loading' && src !== 'none');
    expect(new Set(srcs).size, `t=${s.t} distinct icons`).toBe(srcs.length);
  }

  const heights = [...new Set(samples.map((s) => s.logoHeight).filter((h) => h !== null))];
  expect(heights, 'the logo container height is constant').toHaveLength(1);
});
