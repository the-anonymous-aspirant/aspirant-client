import { expect, type Page, type TestInfo } from '@playwright/test';
import { seedAdminSession } from './mockBackend';

/**
 * The one-page-gutter read (system_3 #9192, #9286, §3.121), shared by
 * page-gutter.spec.ts and the per-area signed-in specs (#9501: admin, member,
 * applications). Moved out of page-gutter.spec.ts unchanged, so each area adds
 * its own spec file rather than appending to one shared block (#9596).
 */

export async function open(page: Page, path: string, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('theme', t as string), theme);
  await page.route(/\/api\//, (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/signup/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signup_enabled: true }),
    })
  );
  await page.goto(path);
  await page.locator('.fade-in h1').first().waitFor();
  // Let the route's fade-in and any image settle before reading geometry.
  await page.waitForTimeout(400);
}

export interface Geometry {
  edge: number;
  rootBottom: number;
  titleTop: number;
  titleLeft: number;
  titleAlign: string;
  scrollHeight: number;
  innerHeight: number;
  centred: string[];
  toggleBottom: number | null;
}

/** The view's first content edge (leftmost in-flow box with size), the first
 *  heading's top, the document's scroll extent, and any in-flow text block
 *  that centres itself. */
export function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    // The routed view's root: router-view carries .fade-in (App.vue), and so
    // may other nodes, so take the one holding the route's heading.
    const root = Array.from(document.querySelectorAll<HTMLElement>('.fade-in')).find((e) =>
      e.querySelector('h1')
    )!;
    const onOwnGround = (el: HTMLElement) => {
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
        const ncs = getComputedStyle(n);
        const bg = ncs.backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;
        // A box closed by a visible border on all four sides (a drop zone, a
        // well) also bounds its own interior, background or not (#9596).
        const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
        if (
          sides.every(
            (s) =>
              parseFloat(ncs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 &&
              ncs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none'
          )
        )
          return true;
      }
      return false;
    };
    let edge = Infinity;
    const centred: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      edge = Math.min(edge, r.left);
      // Page-level text only: a card (any box below the root that paints its
      // own ground) lays out its own interior. So does the DS AspEmptyState,
      // which centres its heading and message by design and paints no ground
      // on purpose (it inherits its surface), so onOwnGround cannot see it.
      // Matched by its own BEM parts, so a view-local `.empty-state` still
      // counts (#9596).
      const inEmptyState = !!el.closest(
        '.empty-state:has(> .empty-state__heading, > .empty-state__message)'
      );
      if (
        /^H[1-6]$|^P$/.test(el.tagName) &&
        cs.textAlign === 'center' &&
        !onOwnGround(el) &&
        !inEmptyState
      )
        centred.push(`${el.tagName.toLowerCase()}.${el.className}`);
      // A page-level column that centres its children: the 100vh root's own
      // shape, repeated one level down. Text-align alone misses it (the
      // children keep text-align: start), and the title-x read only covers
      // the heading. Flagged when a child is narrower than the column, so a
      // column of full-width children centres nothing and passes (#9596).
      if (
        cs.display.includes('flex') &&
        cs.flexDirection.startsWith('column') &&
        cs.alignItems === 'center' &&
        !onOwnGround(el) &&
        !inEmptyState &&
        Array.from(el.children).some((c) => {
          const cr = (c as HTMLElement).getBoundingClientRect();
          return cr.width > 0 && cr.width < r.width - 1;
        })
      )
        centred.push(`flex-centre:${el.tagName.toLowerCase()}.${el.className}`);
    }
    const h1 = root.querySelector('h1') as HTMLElement;
    const rootBottom = Math.round(root.getBoundingClientRect().bottom + window.scrollY);
    const toggle = document.querySelector('.mobile-menu-toggle') as HTMLElement | null;
    return {
      edge: Math.round(edge * 10) / 10,
      rootBottom,
      titleTop: Math.round(h1.getBoundingClientRect().top * 10) / 10,
      titleLeft: Math.round(h1.getBoundingClientRect().left * 10) / 10,
      titleAlign: getComputedStyle(h1).textAlign,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      centred,
      toggleBottom:
        toggle && toggle.getBoundingClientRect().width > 0
          ? Math.round(toggle.getBoundingClientRect().bottom)
          : null,
    };
  });
}

/** The signed-in hubs (system_3 #9286, §3.121): the same gutter, title y and
 *  no page-level centring as the public routes, under an admin session. */
export async function openSignedIn(page: Page, path: string, theme: string): Promise<void> {
  await seedAdminSession(page);
  await open(page, path, theme);
}

/** Opens each signed-in path and asserts it against the public reference
 *  (`/`, read first in the same window): the same first content edge and
 *  title y, a title that is not centred, no page-level centred text, and no
 *  scroll past the content plus the shell's bottom gutter. Logs a GUTTER line
 *  per route so a capture states which code it measured. */
export async function expectSignedInGutter(
  page: Page,
  info: TestInfo,
  theme: string,
  paths: readonly string[]
): Promise<void> {
  const phone = (page.viewportSize()?.width ?? 1280) < 768;
  await open(page, '/', theme);
  const ref = await measure(page);
  for (const path of paths) {
    await openSignedIn(page, path, theme);
    const g = await measure(page);
    console.log(
      `GUTTER ${info.project.name} ${theme} ${path} edge=${g.edge} title=${g.titleLeft}/${g.titleTop} ` +
        `scroll=${g.scrollHeight}/${g.innerHeight} bottom=${g.rootBottom} centred=${g.centred.join(',') || '-'}`
    );
    expect(g.edge, `${path} first content edge`).toBe(ref.edge);
    expect(
      Math.abs(g.titleTop - ref.titleTop),
      `${path} title top ${g.titleTop} vs ${ref.titleTop}`
    ).toBeLessThanOrEqual(1);
    // The heading's own x, not just the leftmost box: a heading centred by its
    // flex parent keeps text-align: start, and a toolbar at the edge would
    // satisfy `edge` while the title sat mid-page (#9596).
    expect(
      Math.abs(g.titleLeft - ref.titleLeft),
      `${path} title x ${g.titleLeft} vs ${ref.titleLeft}`
    ).toBeLessThanOrEqual(1);
    expect(g.titleAlign, `${path} title aligns left`).not.toBe('center');
    expect(g.centred, `${path} centred text blocks`).toEqual([]);
    // The document ends where the content does, plus the shell's bottom
    // gutter; a 100vh root used to add the whole gutter again.
    const gutter = phone ? 16 : 32;
    expect(g.scrollHeight, `${path} scrolls past its content`).toBeLessThanOrEqual(
      Math.max(g.innerHeight, g.rootBottom + gutter + 1)
    );
  }
}
