import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { PEOPLE, TITLE_TEXT } from '../../../src/components/site/copy';
import { extraHTTPHeaders, title } from '../lib';

// The landing's rows of the site build (docs/SITE.md; the landing step, plan A, B and D): the
// Workbench layout in both appearances at 1440 and 390, the one line title with its two stacks,
// the hero's poster in a box whose size never changes, and the page's own script without an
// editor module. The hero step's rows of the live editor are hero.ts's.
// Every observation is through the page and the network; /home writes no store.

export const ROWS: readonly string[] = [
  'home.page.layout',
  'home.title.one-line',
  'home.title.stacks',
  'home.hero.poster-first',
  'home.budget.first-script',
];

type Theme = 'light' | 'dark';
const CELLS: readonly { width: number; height: number; theme: Theme }[] = [
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
];

async function open(
  browser: Browser,
  cell: { width: number; height: number; theme: Theme },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: cell.width, height: cell.height },
  });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('gt-theme', theme);
    } catch {
      // a private window draws the system's appearance
    }
  }, cell.theme);
  const page = await context.newPage();
  const response = await page.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

/** The tops of the h1's text lines, from the client rects of its text (the stacks left out). */
async function titleLines(
  page: Page,
): Promise<{ top: number; bottom: number; left: number; right: number }[]> {
  return page.evaluate(() => {
    const h1 = document.querySelector('#site-title') as HTMLElement;
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    const lines: { top: number; bottom: number; left: number; right: number }[] = [];
    for (const r of rects) {
      const line = lines.find((l) => Math.abs(l.top - r.top) < 4);
      if (line === undefined)
        lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      else {
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
      }
    }
    return lines.sort((a, b) => a.top - b.top);
  });
}

export function rows(): void {
  test(title('home.page.layout'), async ({ browser }) => {
    test.setTimeout(240_000);
    const notes: string[] = [];
    for (const cell of CELLS) {
      const { page, close } = await open(browser, cell);
      try {
        const facts = await page.evaluate(() => {
          const root = document.querySelector('.ts-site') as HTMLElement;
          const bar = root.querySelector('.site-bar') as HTMLElement;
          const radii = new Set<string>();
          const shadows: string[] = [];
          for (const el of root.querySelectorAll<HTMLElement>('*')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none') continue;
            radii.add(cs.borderTopLeftRadius);
            /* a shadow with an offset or a blur: the first three lengths of any layer non zero
               (a spread alone, the paper cut of the avatars, is allowed) */
            if (cs.boxShadow !== 'none')
              for (const layer of cs.boxShadow.split(/,(?![^(]*\))/)) {
                const lengths = [...layer.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
                if (lengths.slice(0, 3).some((n) => n !== 0)) shadows.push(cs.boxShadow);
              }
          }
          return {
            bar: Math.round(
              (bar.querySelector('.site-bar-row') as HTMLElement).getBoundingClientRect().height,
            ),
            marks: root.querySelectorAll('svg.site-mark').length,
            h1: document.querySelectorAll('h1').length,
            h2: [...root.querySelectorAll('main h2')].map((h) => h.textContent ?? ''),
            figures: root.querySelectorAll('main figure').length,
            keys: root.querySelectorAll('.site-keys kbd').length,
            footer: root.querySelectorAll('footer .site-foot-cols h2').length,
            wide: document.documentElement.scrollWidth - innerWidth,
            radii: [...radii],
            shadows,
          };
        });
        const label = `${cell.width} ${cell.theme}`;
        notes.push(
          `${label}: bar ${facts.bar}, ${facts.h2.length} screens, overflow ${facts.wide}`,
        );
        expect(facts.bar, `${label}: the 56 px bar`).toBe(56);
        expect(facts.marks, `${label}: the T in a box in the bar and the footer`).toBe(2);
        expect(facts.h1, `${label}: one h1`).toBe(1);
        expect(facts.h2, `${label}: the two screens' sentences`).toEqual([
          'An agent runs the same actions as the menus.',
          'Anyone with the link can open the presentation and present it.',
        ]);
        expect(facts.figures, `${label}: the editor, the run and the viewer`).toBe(3);
        expect(facts.keys, `${label}: six slideshow keys`).toBe(6);
        expect(facts.footer, `${label}: three footer columns`).toBe(3);
        expect(facts.wide, `${label}: nothing wider than the viewport`).toBeLessThanOrEqual(0);
        expect(
          facts.radii.filter((r) => !['0px', '4px', '6px', '8px', '50%'].includes(r)),
          `${label}: corners on the ladder`,
        ).toEqual([]);
        expect(facts.shadows, `${label}: no shadow with a blur or an offset`).toEqual([]);
      } finally {
        await close();
      }
    }
    test.info().annotations.push({ type: 'layout', description: notes.join(' | ') });
  });

  test(title('home.title.one-line'), async ({ browser }) => {
    test.setTimeout(120_000);
    for (const cell of CELLS) {
      const { page, close } = await open(browser, cell);
      try {
        const text = await page.locator('#site-title').evaluate((h1) => h1.textContent);
        expect(text).toBe(TITLE_TEXT);
        const lines = await titleLines(page);
        const column = await page
          .locator('.site-hero')
          .evaluate((el) => el.getBoundingClientRect().right);
        const stacks = await page
          .locator('#site-title .site-stack')
          .evaluateAll((all) => all.map((el) => el.getBoundingClientRect().right));
        if (cell.width >= 1024) {
          expect(lines, `${cell.width} ${cell.theme}: one line`).toHaveLength(1);
          for (const right of stacks) expect(right).toBeLessThanOrEqual(column + 0.5);
        } else {
          expect(lines.length, `${cell.width} ${cell.theme}: two or three lines`).toBeGreaterThan(
            1,
          );
          expect(lines.length).toBeLessThanOrEqual(3);
        }
      } finally {
        await close();
      }
    }
  });

  test(title('home.title.stacks'), async ({ browser }) => {
    test.setTimeout(180_000);
    for (const cell of CELLS) {
      const { page, close } = await open(browser, cell);
      try {
        const facts = await page.evaluate(() => {
          const out: { gap: number; topOver: number; lowInLine: number; crosses: number }[] = [];
          const h1 = document.querySelector('#site-title') as HTMLElement;
          const all: DOMRect[] = [];
          const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            all.push(...[...range.getClientRects()].filter((r) => r.width > 0));
          }
          for (const word of h1.querySelectorAll<HTMLElement>('.site-h1-word')) {
            const stack = word.querySelector('.site-stack') as HTMLElement;
            const range = document.createRange();
            range.selectNodeContents(word.firstChild as Node);
            const w = range.getBoundingClientRect();
            const s = stack.getBoundingClientRect();
            const others = all.filter((r) => Math.abs(r.top - w.top) >= 4);
            out.push({
              gap: s.left - w.right,
              /* the stack's top at or under its word's line top */
              topOver: w.top - s.top,
              /* the stack's bottom in the upper part of its word's line */
              lowInLine: (s.bottom - w.top) / w.height,
              crosses: others.filter(
                (r) => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top,
              ).length,
            });
          }
          return out;
        });
        const label = `${cell.width} ${cell.theme}`;
        expect(facts).toHaveLength(2);
        for (const f of facts) {
          expect(f.gap, `${label}: the stack beside its word`).toBeGreaterThanOrEqual(-1);
          expect(f.gap, `${label}: within 12 px of its word`).toBeLessThanOrEqual(12);
          expect(f.topOver, `${label}: never above its line`).toBeLessThanOrEqual(1);
          expect(f.lowInLine, `${label}: in the upper part of its line`).toBeLessThanOrEqual(0.75);
          expect(f.crosses, `${label}: over no other line's text`).toBe(0);
        }
        /* the four agents Kevin named; the marks module imports a stylesheet the runner cannot load */
        const names = [
          ...PEOPLE.map((person) => person.name),
          'Claude Code',
          'Codex',
          'OpenClaw',
          'Hermes',
        ];
        for (const name of names)
          await expect(page.getByRole('img', { name, exact: true }), name).toBeVisible();
        if (cell.width === 1440 && cell.theme === 'light') {
          /* the tooltip on hover and on focus */
          await page.mouse.move(10, 10);
          await page.getByRole('img', { name: 'Claude Code', exact: true }).hover();
          await expect(page.locator('#pt-tip .pt-tip-name')).toHaveText('Claude Code');
          await page.mouse.move(10, 10);
          await page.getByRole('img', { name: 'Codex', exact: true }).focus();
          await page.keyboard.press('Shift+Tab');
          await page.keyboard.press('Tab');
          await expect(page.locator('#pt-tip .pt-tip-name')).toHaveText('Codex');
        }
      } finally {
        await close();
      }
    }
  });

  test(title('home.hero.poster-first'), async ({ browser }) => {
    test.setTimeout(120_000);
    for (const cell of CELLS) {
      const { page, close } = await open(browser, cell);
      try {
        const box = page.locator('[data-hero-box]');
        const before = await box.boundingBox();
        const poster = await box.evaluate(async (el) => {
          const shown = [...el.querySelectorAll('img')].find(
            (img) => (img.parentElement as HTMLElement).offsetParent !== null,
          ) as HTMLImageElement;
          await shown.decode().catch(() => undefined);
          return {
            src: shown.currentSrc,
            natural: shown.naturalWidth,
            fetched: performance
              .getEntriesByType('resource')
              .filter((r) => /hero-(1280|358)-(light|dark)/.test(r.name)).length,
          };
        });
        await page.waitForTimeout(2_000);
        const after = await box.boundingBox();
        const label = `${cell.width} ${cell.theme}`;
        expect(poster.src, `${label}: the poster of the appearance`).toContain(`-${cell.theme}`);
        expect(poster.natural, `${label}: the poster drawn`).toBeGreaterThan(0);
        expect(poster.fetched, `${label}: one poster fetched`).toBe(1);
        expect(after, `${label}: the box never changes size`).toEqual(before);
        if (cell.width >= 1024) {
          expect(Math.abs((before?.width ?? 0) / (before?.height ?? 1) - 1.6)).toBeLessThan(0.01);
          expect(poster.src).toContain('hero-1280');
        } else {
          expect(before?.height).toBeLessThanOrEqual(560);
          expect(poster.src).toContain('hero-358');
        }
      } finally {
        await close();
      }
    }
  });

  test(title('home.budget.first-script'), async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ extraHTTPHeaders });
    const page = await context.newPage();
    const scripts: { url: string; bytes: number }[] = [];
    page.on('requestfinished', async (request) => {
      /* the page's own scripts: the hero's frame is a document of its own (docs/SITE.md D1) */
      if (request.resourceType() !== 'script' || request.frame() !== page.mainFrame()) return;
      const sizes = await request.sizes().catch(() => null);
      scripts.push({ url: request.url(), bytes: sizes?.responseBodySize ?? 0 });
    });
    try {
      await page.goto('/home');
      await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      const paths = scripts.map((s) => new URL(s.url).pathname);
      /* the router's entry carries editor/refusal.ts (the refused page's sentence table, a module
         with no import) on every route; nothing else of src/editor may load */
      const editor = paths.filter((p) =>
        /\/src\/editor\/(?!refusal\.ts)|\/src\/try\/|EditorShell|\/viewer\/src\/Editor\.tsx/.test(
          p,
        ),
      );
      const dev = paths.some((p) => p.startsWith('/@vite/'));
      const total = scripts.reduce((n, s) => n + s.bytes, 0);
      test.info().annotations.push({
        type: 'script',
        description: `${scripts.length} scripts, ${total} B on the wire${dev ? ' (a dev server: modules one by one, the byte line is read on a build)' : ''}`,
      });
      expect(editor, 'no editor module on the landing').toEqual([]);
      if (!dev) expect(total, "the page's own script under 120,000 B gzip").toBeLessThan(120_000);
    } finally {
      await context.close();
    }
  });
}
