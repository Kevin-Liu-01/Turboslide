import { expect, test } from '@playwright/test';
import type { Browser, Frame, Locator, Page } from '@playwright/test';

import { PEOPLE, STORY, TITLE_TEXT } from '../../../src/components/site/copy';
import { extraHTTPHeaders, title } from '../lib';

// The landing's rows of the site build (docs/SITE.md; the landing step, plan A, B and D): the
// Workbench layout in both appearances at 1440 and 390, the two line title with its rows of
// pointers and marks and what pressing one does in the live editor,
// the hero's poster in a box whose size never changes, the chapters after the hero each playing
// in a live editor, and the page's own script without an editor module. The hero
// step's rows of the live editor are hero.ts's.
// Every observation is through the page and the network; /home writes no store.

export const ROWS: readonly string[] = [
  'home.page.layout',
  'home.title.one-line',
  'home.title.stacks',
  'home.title.press',
  'home.hero.poster-first',
  'home.budget.first-script',
  'home.bar.narrow',
  'home.story.chapters',
  'home.page.after-editor',
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
  { holdFrame = false }: { holdFrame?: boolean } = {},
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: cell.width, height: cell.height },
  });
  /* a row that reads the poster keeps the editor's frame from loading, so the poster stays up
     while it is read; the swap itself is home.hero.swap-no-shift's */
  if (holdFrame)
    await context.route(
      (url) => url.pathname === '/try',
      (route) => route.abort(),
    );
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

/** The document of a frame element, for its `turboslideTry` handle and the page API. */
async function frameOf(locator: Locator): Promise<Frame> {
  const frame = await (await locator.elementHandle()).contentFrame();
  if (frame === null) throw new Error('the frame has no document');
  return frame;
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

  /* 2026-11-01 (Kevin: "fix how when going to /home it can just break"): the editor's overlay
     sheet drew its connection sites as `.ts-site`, a route's sheet stays loaded after a client
     navigation, and /home reached from the editor was a 7 px column with the bar packed left */
  test(title('home.page.after-editor'), async ({ browser }) => {
    test.setTimeout(360_000);
    const context = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      expect((await page.goto('/new'))?.status(), '/new answers 200').toBe(200);
      await page.locator('[data-control="title.home"]').first().click({ timeout: 180_000 });
      await page.waitForURL(/\/decks(?:[?#]|$)/, { timeout: 60_000 });
      await page.locator('[data-control="appbar.about"]').first().click({ timeout: 60_000 });
      await page.waitForURL(/\/home(?:[?#]|$)/, { timeout: 60_000 });
      await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 60_000 });
      const facts = await page.evaluate(() => {
        const width = (selector: string): number =>
          document.querySelector(selector)?.getBoundingClientRect().width ?? 0;
        return {
          window: document.documentElement.clientWidth,
          root: width('.ts-site'),
          main: width('main'),
          title: width('#site-title'),
          nav: document.querySelector('.site-bar-nav')?.getBoundingClientRect().left ?? 0,
          overlaySheet: [...document.styleSheets].some((sheet) => {
            try {
              return [...sheet.cssRules].some((rule) => /\.ts-conn-site\b/.test(rule.cssText));
            } catch {
              return false;
            }
          }),
        };
      });
      test.info().annotations.push({ type: 'after-editor', description: JSON.stringify(facts) });
      expect(facts.overlaySheet, "the editor's overlay sheet is still loaded").toBe(true);
      expect(facts.root, 'the root spans the window').toBe(facts.window);
      expect(facts.main, 'main spans the window').toBe(facts.window);
      expect(facts.title, 'the title spans the column').toBeGreaterThan(facts.window / 2);
      expect(facts.nav, 'the nav sits on the right half of the bar').toBeGreaterThan(
        facts.window / 2,
      );
    } finally {
      await context.close();
    }
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
            footer: root.querySelectorAll('footer .site-foot-cols h2').length,
            wide: document.documentElement.scrollWidth - innerWidth,
            radii: [...radii],
            shadows,
          };
        });
        const label = `${cell.width} ${cell.theme}`;
        notes.push(
          `${label}: bar ${facts.bar}, ${facts.h2.length} chapters, overflow ${facts.wide}`,
        );
        expect(facts.bar, `${label}: the 56 px bar`).toBe(56);
        expect(facts.marks, `${label}: the mark in the bar and the footer`).toBe(2);
        expect(facts.h1, `${label}: one h1`).toBe(1);
        expect(facts.h2, `${label}: the story's four chapter headings`).toEqual(
          STORY.chapters.map((chapter) => chapter.heading),
        );
        expect(facts.figures, `${label}: the hero's editor and one in each chapter`).toBe(
          1 + STORY.chapters.length,
        );
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

  /* the chapters after the hero (docs/SITE.md 5, "The chapters"; Kevin, 2026-11-03): each
     section's editor plays its chapter in the hero's deck, the hero's own editor stays at rest,
     and a section far from the window unloads its editor */
  test(title('home.story.chapters'), async ({ browser }) => {
    test.setTimeout(420_000);
    const { page, close } = await open(browser, CELLS[0] as (typeof CELLS)[number]);
    try {
      const sections = page.locator('.site-chapter');
      await expect(sections).toHaveCount(STORY.chapters.length);
      for (const [i, chapter] of STORY.chapters.entries()) {
        const section = sections.nth(i);
        await section.scrollIntoViewIfNeeded();
        await expect(section.locator('h2')).toHaveText(chapter.heading);
        const box = section.locator('.site-chapter-box');
        await expect(box, `${chapter.id}: its editor is ready`).toHaveAttribute(
          'data-state',
          'live',
          { timeout: 120_000 },
        );
        const frame = await frameOf(section.locator('iframe'));
        const playing = () => frame.evaluate(() => window.turboslideTry?.chapter() ?? -1);
        await expect.poll(playing, { timeout: 15_000 }).toBe(i + 1);
        const slides = () =>
          frame.evaluate(async () => {
            const studio = (
              window as unknown as {
                turboslide?: { studio?: { invoke: (a: string, i: unknown) => Promise<unknown> } };
              }
            ).turboslide?.studio;
            const info = (await studio?.invoke('deck.info', {})) as
              { sections?: { slides: { id: string }[] }[] } | undefined;
            return (info?.sections ?? []).flatMap((part) => part.slides.map((slide) => slide.id));
          });
        if (i === 0)
          await expect
            .poll(async () => (await slides()).some((id) => id.startsWith('story-light-')), {
              timeout: 30_000,
            })
            .toBe(true);
        if (i === 1)
          await expect
            .poll(async () => (await slides()).some((id) => id.startsWith('story-chart-')), {
              timeout: 30_000,
            })
            .toBe(true);
        if (i === 2)
          await expect
            .poll(() => frame.evaluate(() => window.turboslideTry?.guests().length ?? 0), {
              timeout: 20_000,
            })
            .toBeGreaterThan(0);
        if (i === 3)
          await expect
            .poll(
              () => frame.evaluate(() => document.querySelector('.pt-viewer.is-present') !== null),
              { timeout: 15_000 },
            )
            .toBe(true);
      }
      /* the hero's editor stayed at rest, with no slide a chapter adds */
      await page.evaluate(() => window.scrollTo(0, 0));
      const hero = await frameOf(page.locator('[data-hero-box] iframe'));
      expect(await hero.evaluate(() => window.turboslideTry?.chapter() ?? -1)).toBe(0);
      /* back at the top the last section is far from the window, and its editor unloads */
      await expect(sections.last().locator('.site-chapter-box')).toHaveAttribute(
        'data-state',
        'empty',
        { timeout: 10_000 },
      );
    } finally {
      await close();
    }
  });

  test(title('home.hero.poster-first'), async ({ browser }) => {
    test.setTimeout(120_000);
    for (const cell of CELLS) {
      const { page, close } = await open(browser, cell, { holdFrame: true });
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
              /* the pictures alone: a build also names a script chunk after the poster's module */
              .filter((r) => /hero-(1280|358)-(light|dark)[^/]*\.webp/.test(r.name)).length,
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
    const loaded: { url: string; bytes: number }[] = [];
    page.on('requestfinished', async (request) => {
      /* the page's scripts: the hero's frame is a document of its own (docs/SITE.md D1) */
      if (request.resourceType() !== 'script' || request.frame() !== page.mainFrame()) return;
      const sizes = await request.sizes().catch(() => null);
      loaded.push({ url: request.url(), bytes: sizes?.responseBodySize ?? 0 });
    });
    try {
      await page.goto('/home');
      await page.locator('.ts-site[data-hydrated]').waitFor({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      /* the page's own: a script of another origin is not the page's (Google Analytics' gtag.js on
         production since 2026-10-16, routes/-analytics.ts), so it is named and not counted */
      const origin = new URL(page.url()).origin;
      const scripts = loaded.filter((s) => new URL(s.url).origin === origin);
      const others = loaded.filter((s) => new URL(s.url).origin !== origin);
      const paths = scripts.map((s) => new URL(s.url).pathname);
      /* the router's entry carries editor/refusal.ts (the refused page's sentence table, a module
         with no import) on every route; nothing else of src/editor may load */
      const editor = paths.filter((p) =>
        /\/src\/editor\/(?!refusal\.ts)|\/src\/try\/|EditorShell|\/viewer\/src\/Editor\.tsx/.test(
          p,
        ),
      );
      /* a dev server serves the modules one by one from these prefixes; a build from /assets */
      const dev = paths.some((p) => /^\/(?:@vite|@fs|@id|src|node_modules)\//.test(p));
      const total = scripts.reduce((n, s) => n + s.bytes, 0);
      const elsewhere = others.reduce((n, s) => n + s.bytes, 0);
      test.info().annotations.push({
        type: 'script',
        description: `${scripts.length} scripts, ${total} B on the wire${dev ? ' (a dev server: modules one by one, the byte line is read on a build)' : ''}; ${others.length} of other origins, ${elsewhere} B, not counted`,
      });
      expect(editor, 'no editor module on the landing').toEqual([]);
      if (!dev) expect(total, "the page's own script under 120,000 B gzip").toBeLessThan(120_000);
    } finally {
      await context.close();
    }
  });
}
