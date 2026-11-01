import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { PEOPLE, TITLE_TEXT } from '../../../src/components/site/copy';
import { extraHTTPHeaders, title } from '../lib';

// The landing's rows of the site build (docs/SITE.md; the landing step, plan A, B and D): the
// Workbench layout in both appearances at 1440 and 390, the two line title with its rows of
// pointers and marks and what pressing one does in the live editor,
// the hero's poster in a box whose size never changes, and the page's own script without an
// editor module. The hero step's rows of the live editor are hero.ts's.
// Every observation is through the page and the network; /home writes no store.

export const ROWS: readonly string[] = [
  'home.page.layout',
  'home.title.one-line',
  'home.title.stacks',
  'home.title.press',
  'home.hero.poster-first',
  'home.budget.first-script',
  'home.bar.narrow',
  'home.canvas.gestures',
];

type Theme = 'light' | 'dark';
const CELLS: readonly { width: number; height: number; theme: Theme }[] = [
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
];

/* the bar at a phone's narrow widths (2026-10-16: at 320 the bar's New Presentation scrolled /faq,
   /home, /features and /about sideways by 37 px; under 390 site.css draws the lockup's T alone) */
const NARROW_WIDTHS: readonly number[] = [320, 360, 390];
const BAR_PAGES: readonly string[] = ['/home', '/features', '/about', '/faq', '/docs'];

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
  test(title('home.bar.narrow'), async ({ browser }) => {
    test.setTimeout(240_000);
    const notes: string[] = [];
    for (const width of NARROW_WIDTHS) {
      const context = await browser.newContext({
        extraHTTPHeaders,
        viewport: { width, height: 800 },
      });
      try {
        const page = await context.newPage();
        for (const path of BAR_PAGES) {
          const label = `${width} ${path}`;
          expect((await page.goto(path))?.status(), `${label} answers 200`).toBe(200);
          await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 60_000 });
          await page.evaluate(() => document.fonts.ready);
          const facts = await page.evaluate(() => ({
            wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            window: document.documentElement.clientWidth,
            bar: Math.max(
              ...[...document.querySelectorAll('.site-bar-row > *')].map(
                (el) => el.getBoundingClientRect().right,
              ),
            ),
          }));
          notes.push(`${label}: overflow ${facts.wide}, bar to ${Math.round(facts.bar)}`);
          expect(facts.wide, `${label}: nothing wider than the viewport`).toBeLessThanOrEqual(0);
          expect(facts.bar, `${label}: the bar ends inside the 16 px side`).toBeLessThanOrEqual(
            facts.window - 16 + 0.5,
          );
        }
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'bar', description: notes.join(' | ') });
  });

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
               (a spread alone is allowed) */
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
            marks: root.querySelectorAll('svg.ts-mark').length,
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
        expect(facts.marks, `${label}: the mark in the bar and the footer`).toBe(2);
        expect(facts.h1, `${label}: one h1`).toBe(1);
        expect(facts.h2, `${label}: the five screens' headings`).toEqual([
          'Freeform Canvas',
          'Feature Parity for Agents',
          'Present from Any Link',
          'Animated Patterns',
          'PDF and PowerPoint Export',
        ]);
        expect(
          facts.figures,
          `${label}: the editor, the canvas, the callers, the two windows, the pattern and the seam`,
        ).toBe(6);
        expect(facts.keys, `${label}: six slideshow keys`).toBe(6);
        expect(facts.footer, `${label}: four footer columns`).toBe(4);
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
        await expect(page.getByRole('heading', { level: 1, name: TITLE_TEXT })).toBeVisible();
        const lines = await titleLines(page);
        const facts = await page.evaluate(() => {
          const h1 = document.querySelector('#site-title') as HTMLElement;
          const words = [...h1.querySelectorAll<HTMLElement>('.site-h1-word')];
          const people = document.createRange();
          people.selectNodeContents(words[0]?.firstChild as Node);
          /* the word after "people": the text node " and " */
          const and = [...h1.childNodes].find(
            (n) => n.nodeType === 3 && /and/.test(n.textContent ?? ''),
          );
          const range = document.createRange();
          if (and !== undefined) {
            const at = (and.textContent ?? '').indexOf('a');
            range.setStart(and, at);
            range.setEnd(and, at + 1);
          }
          return {
            andTop: range.getBoundingClientRect().top,
            peopleTop: people.getBoundingClientRect().top,
            /* each row's box: its line is the word's when its middle sits inside the word's box */
            stacks: [...h1.querySelectorAll('.site-stack')].map((st, i) => {
              const r = [...st.querySelectorAll('.site-av')].map((av) =>
                av.getBoundingClientRect(),
              );
              const word = document.createRange();
              word.selectNodeContents(words[i]?.firstChild as Node);
              const w = word.getBoundingClientRect();
              const middle =
                (Math.min(...r.map((b) => b.top)) + Math.max(...r.map((b) => b.bottom))) / 2;
              return {
                right: Math.max(...r.map((b) => b.right)),
                onWordLine: middle > w.top && middle < w.bottom,
                afterWord: Math.min(...r.map((b) => b.left)) >= w.right - 0.5,
              };
            }),
            column: (document.querySelector('.site-hero') as HTMLElement).getBoundingClientRect()
              .right,
          };
        });
        const label = `${cell.width} ${cell.theme}`;
        /* two lines from 1024, "Presentations for people" and "and agents"; on a phone three,
           "Presentations for", "people" and "and agents"; "and" always starts the last line */
        expect(lines, `${label}: lines`).toHaveLength(cell.width >= 1024 ? 2 : 3);
        expect(facts.andTop, `${label}: "and" starts the last line`).toBeGreaterThan(
          facts.peopleTop + 4,
        );
        for (const stack of facts.stacks) {
          expect(stack.onWordLine, `${label}: each row on its word's line`).toBe(true);
          expect(stack.afterWord, `${label}: each row after its word`).toBe(true);
          expect(stack.right).toBeLessThanOrEqual(
            cell.width >= 1024 ? facts.column + 0.5 : cell.width,
          );
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
          const h1 = document.querySelector('#site-title') as HTMLElement;
          const size = parseFloat(getComputedStyle(h1).fontSize);
          /* each glyph's ink box from its character's box: a descent of 0.242em, the cap height
             0.727em over the baseline, the x-height 0.546em; ascenders reach a little over the
             cap height */
          const glyphs: { left: number; right: number; top: number; bottom: number }[] = [];
          const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (let i = 0; i < text.length; i += 1) {
              const ch = text[i] ?? ' ';
              if (/\s/.test(ch)) continue;
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const r = range.getBoundingClientRect();
              const baseline = r.bottom - 0.242 * size;
              const short = /[acemnorsuvwxz]/.test(ch);
              glyphs.push({
                left: r.left + 1,
                right: r.right - 1,
                top: baseline - (short ? 0.546 : 0.76) * size,
                bottom: baseline + (/[gpqy]/.test(ch) ? 0.2 * size : 0),
              });
            }
          }
          const bar = (document.querySelector('.site-bar') as HTMLElement).getBoundingClientRect();
          const out = [...h1.querySelectorAll<HTMLElement>('.site-av')].map((av) => {
            const r = av.getBoundingClientRect();
            return {
              name: av.getAttribute('aria-label') ?? '',
              size: Math.round(r.height),
              /* the figure's box, 1 px in, against each glyph's box */
              covers: glyphs.filter(
                (g) =>
                  r.left + 1 < g.right &&
                  r.right - 1 > g.left &&
                  r.top + 1 < g.bottom &&
                  r.bottom - 1 > g.top,
              ).length,
              underBar: r.top - bar.bottom,
              left: r.left,
              right: r.right,
            };
          });
          const words = [...h1.querySelectorAll<HTMLElement>('.site-h1-word')].map((w) => {
            const range = document.createRange();
            range.selectNodeContents(w.firstChild as Node);
            return range.getBoundingClientRect();
          });
          /* the first figure of each row follows its word on the word's line */
          const starts = [...h1.querySelectorAll<HTMLElement>('.site-stack')].map((st, i) => {
            const first = (st.querySelector('.site-av') as HTMLElement).getBoundingClientRect();
            const word = words[i] as DOMRect;
            return {
              dx: first.left - word.right,
              middle: (first.top + first.bottom) / 2 - (word.top + word.bottom) / 2,
              height: word.height,
            };
          });
          /* no disc, plate or ring: a person is the editor's pointer, an agent its tool's mark */
          const bare = [...h1.querySelectorAll<HTMLElement>('.site-av')].every((av) => {
            const cs = getComputedStyle(av);
            return cs.borderTopStyle === 'none' && cs.backgroundColor === 'rgba(0, 0, 0, 0)';
          });
          const figures = {
            pointers: h1.querySelectorAll('.site-stack[data-stack="people"] .site-pointer').length,
            marks: h1.querySelectorAll('.site-stack[data-stack="agents"] .ts-agent-mark').length,
          };
          /* the two words in two faces, each loaded rather than drawn by its fallback */
          const faces = [...h1.querySelectorAll<HTMLElement>('.site-h1-word')].map((w) => {
            const style = getComputedStyle(w);
            const face = style.fontFamily.split(',')[0]?.replace(/['"]/g, '').trim() ?? '';
            const font = `${style.fontWeight} ${style.fontSize} "${face}"`;
            const loaded = [...document.fonts].some(
              (f) => f.family.replace(/['"]/g, '') === face && f.status === 'loaded',
            );
            return loaded && document.fonts.check(font, w.textContent ?? '')
              ? face
              : `${face} (not loaded)`;
          });
          return { out, starts, bare, figures, faces };
        });
        const label = `${cell.width} ${cell.theme}`;
        expect(facts.out).toHaveLength(9);
        for (const av of facts.out) {
          expect(av.covers, `${label}: ${av.name} covers no letter`).toBe(0);
          expect(av.underBar, `${label}: ${av.name} under the bar`).toBeGreaterThanOrEqual(0);
          expect(av.left, `${label}: ${av.name} on the screen`).toBeGreaterThanOrEqual(0);
          expect(av.right, `${label}: ${av.name} on the screen`).toBeLessThanOrEqual(cell.width);
          if (cell.width >= 1024)
            expect(av.size, `${label}: ${av.name}`).toBeGreaterThanOrEqual(24);
          else expect(av.size, `${label}: ${av.name}`).toBeGreaterThanOrEqual(16);
        }
        for (const start of facts.starts) {
          expect(start.dx, `${label}: the row follows its word`).toBeGreaterThanOrEqual(0);
          expect(start.dx, `${label}: the row follows its word`).toBeLessThanOrEqual(24);
          expect(
            Math.abs(start.middle),
            `${label}: the row sits on its word's line`,
          ).toBeLessThanOrEqual(start.height / 3);
        }
        expect(facts.bare, `${label}: no disc, plate or ring`).toBe(true);
        expect(facts.figures, `${label}: five pointers and four marks`).toEqual({
          pointers: 5,
          marks: 4,
        });
        expect(
          facts.faces,
          `${label}: "people" in Katagami Round, "agents" in Katagami Mono`,
        ).toEqual(['Katagami Round', 'Katagami Mono']);
        const names = [
          ...PEOPLE.map((person) => person.name),
          'Claude Code',
          'Codex',
          'OpenClaw',
          'Hermes',
        ];
        for (const name of names)
          await expect(page.getByRole('button', { name, exact: true }), name).toBeVisible();
      } finally {
        await close();
      }
    }
  });

  test(title('home.title.press'), async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, close } = await open(browser, CELLS[0] as (typeof CELLS)[number]);
    try {
      const xs = () =>
        page
          .locator('.site-stack[data-stack="people"] .site-av')
          .evaluateAll((all) => all.map((av) => Math.round(av.getBoundingClientRect().left)));
      const closed = await xs();
      /* a pointer over the row spreads it apart: the last figure moves out along the line */
      await page.locator('.site-av[data-name="Cobalt 118"]').hover();
      await page.waitForTimeout(500);
      const open = await xs();
      expect((open[4] ?? 0) - (closed[4] ?? 0), 'the row spreads').toBeGreaterThan(20);
      await page.mouse.move(10, 600);
      /* one tab stop per row; the arrows move along it */
      await page.locator('.site-av[data-name="Cobalt 118"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.site-av[data-name="Argon 905"]')).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.locator('.site-av[data-name="Xenon 734"]')).toBeFocused();
      await expect(
        page.locator('.site-av[data-name="Xenon 734"]'),
        'what pressing does, after the name',
      ).toHaveAttribute('aria-describedby', 'site-press-person');
      /* the live editor */
      await page.locator('[data-hero-box][data-state="done"]').waitFor({ timeout: 300_000 });
      const frame = page.frames().find((f) => f.url().includes('/try'));
      expect(frame, 'the frame').toBeDefined();
      if (frame === undefined) return;
      await frame.waitForFunction(() => window.turboslideTry !== undefined, null, {
        timeout: 60_000,
      });
      /* an agent pressed takes its next step: a write within 4 s */
      const before = await frame.evaluate(() => window.turboslideTry?.state().writes ?? 0);
      await page.locator('.site-av[data-name="Codex"]').focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(() => frame.evaluate(() => window.turboslideTry?.state().writes ?? 0), {
          timeout: 4000,
        })
        .toBeGreaterThan(before);
      /* a person pressed joins the room, and leaves after a while */
      await page.locator('.site-av[data-name="Argon 905"]').click();
      await expect
        .poll(() => frame.evaluate(() => window.turboslideTry?.guests() ?? []), { timeout: 5000 })
        .toContain('guest:argon-905');
      await expect(frame.locator('.ts-presence-chip')).toHaveCount(3, { timeout: 5000 });
      /* OpenClaw pressed joins and leaves a comment on the slide */
      await page.locator('.site-av[data-name="OpenClaw"]').click();
      await expect
        .poll(() => frame.evaluate(() => window.turboslideTry?.guests() ?? []), { timeout: 5000 })
        .toContain('agent:openclaw');
      await expect
        .poll(
          () =>
            frame.evaluate(async () =>
              ((await window.turboslideTry?.entries()) ?? []).some(
                (e) =>
                  (e as { kind?: string; author?: { principalId?: string } }).kind === 'comment' &&
                  (e as { author?: { principalId?: string } }).author?.principalId ===
                    'agent:openclaw',
              ),
            ),
          { timeout: 8000 },
        )
        .toBe(true);
      await expect
        .poll(() => frame.evaluate(() => window.turboslideTry?.guests() ?? []), {
          timeout: 30_000,
        })
        .toEqual([]);
    } finally {
      await close();
    }
  });

  test(title('home.canvas.gestures'), async ({ browser }) => {
    test.setTimeout(180_000);
    for (const cell of [CELLS[0], CELLS[3]] as (typeof CELLS)[number][]) {
      const { page, close } = await open(browser, cell);
      try {
        const label = `${cell.width} ${cell.theme}`;
        await page.locator('#canvas .site-cv-fig').scrollIntoViewIfNeeded();
        /* the committed line (the live one beside it holds a drag's last frame) */
        const line = page.locator('#site-cv-write .site-cv-code');
        /* the call the line prints last: its action, block and the position it writes */
        const written = async (): Promise<{ call: string; pos: Record<string, number> }> => {
          const text = (await line.textContent()) ?? '';
          const at = text.lastIndexOf('block.set');
          const json = text.slice(text.indexOf('{', at), text.indexOf('}', at) + 1);
          return { call: text.slice(at, text.indexOf('{', at)).trim(), pos: JSON.parse(json) };
        };
        const centre = async (selector: string): Promise<{ x: number; y: number }> => {
          const box = await page.locator(selector).boundingBox();
          if (box === null) throw new Error(`${selector} has no box`);
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        };
        /* a press on the paragraph selects it with the frame and the turn handle */
        const p = await centre('[data-cv="p1"]');
        await page.mouse.click(p.x, p.y);
        await expect(page.locator('[data-cv="p1"]'), label).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-cv-frame] .site-cv-knob'), label).toBeVisible();
        /* a drag moves it, and the line reads the editor's write */
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x - 40, p.y - 30, { steps: 8 });
        await page.mouse.up();
        const moved = await written();
        expect(moved.call, label).toBe('block.set lighthouse#p1 /pos');
        expect(moved.pos.x, label).not.toBe(929);
        /* undo writes the paragraph's first box forward */
        await page.keyboard.press('ControlOrMeta+z');
        const undone = await written();
        expect(undone.call, label).toBe('block.set lighthouse#p1 /pos');
        expect({ x: undone.pos.x, y: undone.pos.y }, label).toEqual({ x: 929, y: 618.25 });
        /* the turned heading moves to a snap and its box stays at 1/64 px */
        const h = await centre('[data-cv="h"]');
        await page.mouse.move(h.x, h.y);
        await page.mouse.down();
        await page.mouse.move(h.x + 37, h.y + 23, { steps: 8 });
        await page.mouse.up();
        const heading = await written();
        expect(heading.call, label).toBe('block.set lighthouse#h /pos');
        for (const key of ['x', 'y'])
          expect(Number.isInteger((heading.pos[key] ?? 0.5) * 64), `${label}: ${key}`).toBe(true);
        /* Escape clears the selection */
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-cv][aria-pressed="true"]'), label).toHaveCount(0);
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
          expect(Math.abs((before?.width ?? 0) / (before?.height ?? 1) - 2)).toBeLessThan(0.01);
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
