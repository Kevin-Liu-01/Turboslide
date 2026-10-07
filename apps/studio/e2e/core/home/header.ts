import { loadavg } from 'node:os';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { MOTION_KEY } from '../../../src/components/home/boot';
import { HERO } from '../../../src/components/home/copy';
import { MOTION_BUTTON } from '../../../src/components/home/design-copy';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';

// A lane module of core/home.spec.ts: polish two's navigation and hero rows (docs/POLISH-2.md 3,
// 6.3; lane N). P2-N#1 enters the bar without the motion toggle (the toggles in the hero
// terminal's head and the footer) and the bar at 320 px; P2-N#2 the theme glyph from the first
// paint; P2-N#3 the hero's side spanning the h1. Every observation is through the page.

export const ROWS: readonly string[] = [
  'home.nav.no-pause',
  'home.nav.fits-320',
  'home.nav.theme-first-paint',
  'home.hero.side-fits-headline',
];

type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/** A row of this module is declared only once the matrix holds it (`title` throws otherwise). */
const entered = (id: string): boolean =>
  rowsForDriver('core/home.spec.ts').some((row) => row.id === id);

const oneMinuteLoad = (): number => Math.round((loadavg()[0] ?? 0) * 10) / 10;

async function homeContext(
  browser: Browser,
  width: number,
  theme: Theme,
  options: { reduce?: boolean; paused?: boolean; height?: number } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width, height: options.height ?? 900 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: options.reduce === true ? 'reduce' : 'no-preference',
  });
  await context.addInitScript(
    ([value, paused, key]) => {
      try {
        localStorage.setItem('gt-theme', value as string);
        if (paused === true) localStorage.setItem(key as string, 'paused');
      } catch {
        /* private mode */
      }
    },
    [theme, options.paused === true, MOTION_KEY] as const,
  );
  return { context, page: await context.newPage() };
}

async function openHome(page: Page): Promise<void> {
  const response = await page.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  await page.locator('main#top[data-hydrated]').waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('main#top[data-live="ready"]').waitFor({ timeout: 60_000 });
}

// ---------------------------------------------------------------------------------------------
// home.nav.no-pause (P2-N#1)

/** The toggles' places and states, read from the page. */
function readToggles(page: Page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-motion-toggle]')];
    const one = (el: HTMLElement | undefined) => {
      if (el === undefined) return null;
      const r = el.getBoundingClientRect();
      const label = [...el.querySelectorAll<HTMLElement>('.ts-motion-word')].find(
        (w) => getComputedStyle(w).visibility === 'visible',
      );
      const glyph = [...el.querySelectorAll<HTMLElement>('.ts-icon')].find(
        (g) => getComputedStyle(g).visibility === 'visible',
      );
      return {
        control: el.dataset['control'] ?? '',
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        icon: el.classList.contains('pt-icon'),
        shown: el.getClientRects().length > 0,
        label: label?.textContent ?? null,
        glyph: glyph?.dataset['icon'] ?? null,
        pressed: el.getAttribute('aria-pressed'),
        name: el.getAttribute('aria-label'),
      };
    };
    return {
      header: document.querySelectorAll('header [data-motion-toggle]').length,
      count: all.length,
      hero: one(
        document.querySelector<HTMLElement>('.ts-hero-terminal-head [data-motion-toggle]') ??
          undefined,
      ),
      foot: one(
        document.querySelector<HTMLElement>('footer .ts-product-foot-end [data-motion-toggle]') ??
          undefined,
      ),
    };
  });
}

/**
 * Presses one toggle with its own click (no scroll) and reads, in the next frame, the page's
 * attribute and both toggles' pressed states.
 */
function pressAndRead(page: Page, control: string) {
  return page.evaluate(
    (which) =>
      new Promise<{ motion: string | null; pressed: (string | null)[] }>((done) => {
        document.querySelector<HTMLButtonElement>(`[data-control="${which}"]`)!.click();
        requestAnimationFrame(() =>
          done({
            motion: document.documentElement.getAttribute('data-motion'),
            pressed: [...document.querySelectorAll('[data-motion-toggle]')].map((b) =>
              b.getAttribute('aria-pressed'),
            ),
          }),
        );
      }),
    control,
  );
}

export async function noPause(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const width of [1440, 1024, 768, 390, 320])
    for (const theme of THEMES) {
      const label = `${width} ${theme}`;
      const { context, page } = await homeContext(browser, width, theme);
      try {
        await openHome(page);
        const read = await readToggles(page);
        if (read.header !== 0) failures.push(`${label}: ${read.header} toggles in the header`);
        if (read.count !== 2) failures.push(`${label}: ${read.count} toggles on the page`);
        const { hero, foot } = read;
        if (hero === null || !hero.icon || hero.w !== 28 || hero.h !== 28)
          failures.push(`${label}: the terminal's toggle reads ${JSON.stringify(hero)}`);
        if (
          foot === null ||
          foot.icon ||
          foot.label !== MOTION_BUTTON.pause ||
          foot.glyph !== 'pause'
        )
          failures.push(`${label}: the footer's toggle reads ${JSON.stringify(foot)}`);
        for (const t of [hero, foot])
          if (t !== null && (t.name !== 'Pause motion' || t.pressed !== 'false' || !t.shown))
            failures.push(`${label}: ${t.control} named "${t.name}", pressed ${t.pressed}`);
        /* the hero's press, then the footer's: both toggles follow within one frame */
        const paused = await pressAndRead(page, 'home.hero.motion');
        const pausedFoot = (await readToggles(page)).foot;
        const played = await pressAndRead(page, 'home.foot.motion');
        if (paused.motion !== 'paused' || paused.pressed.join() !== 'true,true')
          failures.push(`${label}: after the hero's press ${JSON.stringify(paused)}`);
        if (played.motion !== null || played.pressed.join() !== 'false,false')
          failures.push(`${label}: after the footer's press ${JSON.stringify(played)}`);
        if (pausedFoot?.label !== MOTION_BUTTON.play || pausedFoot.glyph !== 'play')
          failures.push(`${label}: the paused footer toggle reads ${JSON.stringify(pausedFoot)}`);
        if (foot !== null && pausedFoot !== null && Math.abs(foot.w - pausedFoot.w) > 0.1)
          failures.push(`${label}: the footer toggle is ${foot.w} px and ${pausedFoot.w} px`);
        notes.push(
          `${label}: header 0 of ${read.count}; terminal ${hero?.w}x${hero?.h}; footer ${foot?.w}x${foot?.h} "${foot?.label}" then ${pausedFoot?.w} "${pausedFoot?.label}"`,
        );
      } finally {
        await context.close();
      }
    }
  /* a stored pause: both toggles pressed when the document is parsed, before the live core
     (window.tsHomeMotion) exists, and both drawing the play glyph (CSS on html[data-motion]) */
  for (const width of [1440, 390]) {
    const { context, page } = await homeContext(browser, width, 'light', { paused: true });
    try {
      await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          (window as unknown as { __parsed: unknown }).__parsed = {
            live: (window as unknown as { tsHomeMotion?: unknown }).tsHomeMotion !== undefined,
            pressed: [...document.querySelectorAll('[data-motion-toggle]')].map((b) =>
              b.getAttribute('aria-pressed'),
            ),
          };
        });
      });
      await openHome(page);
      const parsed = await page.evaluate(
        () => (window as unknown as { __parsed: unknown }).__parsed,
      );
      const glyphs = await page.evaluate(() =>
        [...document.querySelectorAll('[data-motion-toggle] .ts-icon')]
          .filter((g) => getComputedStyle(g).visibility === 'visible')
          .map((g) => g.getAttribute('data-icon')),
      );
      notes.push(
        `${width} stored pause at DOMContentLoaded: ${JSON.stringify(parsed)}, glyphs ${glyphs.join(' ')}`,
      );
      if (JSON.stringify(parsed) !== JSON.stringify({ live: false, pressed: ['true', 'true'] }))
        failures.push(`${width}: a stored pause parsed as ${JSON.stringify(parsed)}`);
      if (glyphs.join() !== 'play,play') failures.push(`${width}: paused glyphs ${glyphs.join()}`);
    } finally {
      await context.close();
    }
  }
  /* reduced motion: neither toggle shows */
  for (const width of [1440, 390]) {
    const { context, page } = await homeContext(browser, width, 'dark', { reduce: true });
    try {
      await openHome(page);
      const read = await readToggles(page);
      if (read.count !== 2 || read.hero?.shown !== false || read.foot?.shown !== false)
        failures.push(`${width} reduced: ${JSON.stringify(read)}`);
    } finally {
      await context.close();
    }
  }
  test.info().annotations.push({ type: 'toggles', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.nav.fits-320 (P2-N#1)

function readBar(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('header .ts-product-nav-row')!;
    const shown = (el: Element): boolean =>
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const named: [string, string][] = [
      ['lockup', '[data-control="home.nav.lockup"]'],
      ['documentation', '[data-control="home.nav.docs"]'],
      ['theme', '[data-control="view.theme"]'],
      ['hairline', '.ts-product-nav-rule'],
      ['sign in', '[data-control="home.nav.signIn"]'],
      ['new', '[data-control="home.nav.new"]'],
    ];
    const controls = named.flatMap(([name, selector]) =>
      [...row.querySelectorAll(selector)].filter(shown).map((el) => ({ name, ...box(el) })),
    );
    controls.sort((a, b) => a.l - b.l);
    const overlap = (a: (typeof controls)[number], b: (typeof controls)[number]): boolean =>
      Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 &&
      Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
    const overlaps: string[] = [];
    for (let i = 0; i < controls.length; i += 1)
      for (let j = i + 1; j < controls.length; j += 1)
        if (overlap(controls[i]!, controls[j]!))
          overlaps.push(`${controls[i]!.name} and ${controls[j]!.name}`);
    /* anything drawn inside Sign In's box that is not Sign In, its content or its slot */
    const signIn = row.querySelector('[data-control="home.nav.signIn"]');
    const inside: string[] = [];
    if (signIn !== null) {
      const s = { name: 'sign in', ...box(signIn) };
      for (const el of row.querySelectorAll('*')) {
        if (el === signIn || signIn.contains(el) || el.contains(signIn) || !shown(el)) continue;
        if (overlap(s, { name: '', ...box(el) }))
          inside.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      }
    }
    const rowBox = row.getBoundingClientRect();
    return {
      height: Math.round(rowBox.height),
      gap: getComputedStyle(row).columnGap,
      order: controls.map((c) => c.name),
      right: Math.round(Math.max(...controls.map((c) => c.r)) * 10) / 10,
      overlaps,
      inside,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

export async function fits320(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const width of [320, 359, 360, 390, 720, 1024, 1440])
    for (const theme of THEMES) {
      const label = `${width} ${theme}`;
      const { context, page } = await homeContext(browser, width, theme);
      try {
        await openHome(page);
        await page
          .locator('header [data-control="home.nav.signIn"]')
          .waitFor({ timeout: 30_000 })
          .catch(() => failures.push(`${label}: no Sign In`));
        const bar = await readBar(page);
        notes.push(
          `${label}: ${bar.height} px, gap ${bar.gap}, ${bar.order.join(', ')}, last edge ${bar.right}`,
        );
        if (bar.height !== 58) failures.push(`${label}: the bar is ${bar.height} px`);
        if (bar.overflow > 0) failures.push(`${label}: ${bar.overflow} px wider than the view`);
        if (bar.overlaps.length > 0) failures.push(`${label}: ${bar.overlaps.join('; ')} overlap`);
        if (bar.inside.length > 0)
          failures.push(`${label}: drawn inside Sign In: ${bar.inside.join(', ')}`);
        const want = [
          'lockup',
          ...(width >= 720 ? ['documentation'] : []),
          'theme',
          ...(width >= 360 ? ['hairline'] : []),
          'sign in',
          'new',
        ];
        if (bar.order.join() !== want.join())
          failures.push(`${label}: the bar reads ${bar.order.join(', ')}`);
        if (width < 360 && bar.gap !== '4px')
          failures.push(`${label}: the row's gap is ${bar.gap}`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'bar', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.nav.theme-first-paint (P2-N#2)

/** The theme button's drawn glyph (the one span that computes a display) and its name. */
function readThemeButton(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('header [data-control="view.theme"]')!;
    const drawn = [...button.querySelectorAll<HTMLElement>('.pt-theme-glyph')].filter(
      (g) => getComputedStyle(g).display !== 'none' && g.getClientRects().length > 0,
    );
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      hydrated: document.querySelector('main#top')?.hasAttribute('data-hydrated') ?? false,
      glyphs: drawn.map((g) => g.textContent ?? ''),
      visible: drawn.every((g) => getComputedStyle(g).visibility === 'visible'),
      name: button.getAttribute('aria-label'),
      paper: getComputedStyle(document.body).backgroundColor,
    };
  });
}

const GLYPH: Record<Theme, string> = { light: '◐', dark: '◑' };

export async function themeFirstPaint(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const width of [1440, 390])
    for (const theme of THEMES) {
      const label = `${width} ${theme}`;
      /* the page's module scripts aborted: the root's inline boot script sets html[data-theme]
         and nothing hydrates */
      const blocked = await homeContext(browser, width, theme);
      try {
        await blocked.page.route('**/*', (route) =>
          route.request().resourceType() === 'script' ? route.abort() : route.continue(),
        );
        const response = await blocked.page.goto('/home', { waitUntil: 'load' });
        expect(response?.status(), '/home answers 200').toBe(200);
        const read = await readThemeButton(blocked.page);
        notes.push(`${label} before hydration: ${JSON.stringify(read)}`);
        if (read.hydrated) failures.push(`${label}: the page hydrated with its scripts aborted`);
        if (read.theme !== theme) failures.push(`${label}: html[data-theme] is ${read.theme}`);
        if (read.glyphs.join('') !== GLYPH[theme] || !read.visible)
          failures.push(
            `${label} before hydration: the button draws ${JSON.stringify(read.glyphs)}`,
          );
        if (read.name !== 'Dark or light')
          failures.push(`${label} before hydration: the button is named "${read.name}"`);
      } finally {
        await blocked.context.close();
      }
      /* hydrated, then each press: the glyph follows html[data-theme] */
      const live = await homeContext(browser, width, theme);
      try {
        await openHome(live.page);
        const order: Theme[] =
          theme === 'light' ? ['light', 'dark', 'light'] : ['dark', 'light', 'dark'];
        for (const [i, want] of order.entries()) {
          if (i > 0) await live.page.locator('header [data-control="view.theme"]').click();
          await expect(live.page.locator('html')).toHaveAttribute('data-theme', want);
          const read = await readThemeButton(live.page);
          if (read.glyphs.join('') !== GLYPH[want] || read.name !== 'Dark or light')
            failures.push(`${label} hydrated, ${want}: ${JSON.stringify(read)}`);
        }
        await expect(live.page.locator('header [data-control="view.theme"]')).toHaveAccessibleName(
          'Dark or light',
        );
      } finally {
        await live.context.close();
      }
    }
  /* JavaScript off: no html[data-theme], the light page, and the button draws ◐ */
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width, height: 900 },
      javaScriptEnabled: false,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto('/home', { waitUntil: 'load' });
      expect(response?.status(), '/home answers 200').toBe(200);
      const read = await readThemeButton(page);
      notes.push(`${width} without script: ${JSON.stringify(read)}`);
      if (read.theme !== null || read.glyphs.join('') !== GLYPH.light || !read.visible)
        failures.push(`${width} without script: ${JSON.stringify(read)}`);
    } finally {
      await context.close();
    }
  }
  test.info().annotations.push({ type: 'theme', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.hero.side-fits-headline (P2-N#3)

/**
 * Inter's metrics at 2,048 units to the em (ascender 1,984, cap height 1,490). A text range's box
 * is its content area, the ascender to the descender, which 'Inter Fallback' matches through its
 * overrides (packages/fonts/src/inter.css), so a line's cap line and baseline are read from that
 * box with Inter's numbers in both faces: the row reads where the layout puts each line, and the
 * layout is what must not move when Inter arrives.
 */
const ASCENT = 1984 / 2048;
const CAP = 1490 / 2048;

/** The hero head's boxes and lines, read from the page as it is painted. */
function readHead(page: Page) {
  return page.evaluate(
    ([ascent, cap]) => {
      const h1 = document.querySelector<HTMLElement>('h1#ts-product-h1')!;
      const side = document.querySelector<HTMLElement>('.ts-hero-side')!;
      const lead = document.querySelector<HTMLElement>('.ts-hero-lead')!;
      const buttons = document.querySelector<HTMLElement>('.ts-hero-side .ts-buttons')!;
      /* each word's content area top, in the order of the text */
      const words = (el: Element): { top: number; text: string }[] => {
        const out: { top: number; text: string }[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const data = node.textContent ?? '';
          for (const m of data.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const rect = range.getClientRects()[0];
            if (rect !== undefined) out.push({ top: rect.top, text: m[0] });
          }
        }
        return out;
      };
      const lines = (el: Element): { top: number; count: number }[] => {
        const result: { top: number; count: number }[] = [];
        for (const w of words(el)) {
          const last = result.at(-1);
          if (last !== undefined && Math.abs(last.top - w.top) < 1) last.count += 1;
          else result.push({ top: w.top, count: 1 });
        }
        return result;
      };
      const size = (el: Element): number => parseFloat(getComputedStyle(el).fontSize);
      const h1Size = size(h1);
      const leadSize = size(lead);
      const h1Lines = lines(h1);
      const leadLines = lines(lead);
      const box = (el: Element) => el.getBoundingClientRect();
      const round = (n: number): number => Math.round(n * 100) / 100;
      return {
        face: [...document.fonts].some((f) => f.family === 'Inter' && f.status === 'loaded'),
        theme: document.documentElement.getAttribute('data-theme'),
        sentence: (lead.textContent ?? '').trim().split('. ')[0] ?? '',
        h1Size: round(h1Size),
        h1Box: round(box(h1).height),
        sideBox: round(box(side).height),
        columns: getComputedStyle(h1.parentElement!).gridTemplateColumns.split(' ').length,
        leadBreaks: leadLines.map((l) => l.count).join(','),
        h1Breaks: h1Lines.map((l) => l.count).join(','),
        /* the lead's first cap line less the h1's: negative when the lead's sits higher */
        capDelta:
          h1Lines.length > 0 && leadLines.length > 0
            ? round(
                leadLines[0]!.top +
                  (ascent - cap) * leadSize -
                  (h1Lines[0]!.top + (ascent - cap) * h1Size),
              )
            : NaN,
        /* the buttons' foot less the h1's last baseline */
        footDelta:
          h1Lines.length > 0
            ? round(box(buttons).bottom - (h1Lines.at(-1)!.top + ascent * h1Size))
            : NaN,
      };
    },
    [ASCENT, CAP] as const,
  );
}

export async function sideFitsHeadline(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const sentences = HERO.visit;
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    const wide = width >= 1024;
    const breaks: Record<string, string[]> = { inter: [], fallback: [] };
    for (const face of ['inter', 'fallback'] as const) {
      const { context, page } = await homeContext(browser, width, 'light', { height: 900 });
      try {
        if (face === 'fallback')
          await context.route(/\.woff2(\?|$)/, (route) =>
            route.request().resourceType() === 'font' ? route.abort() : route.continue(),
          );
        /* a fresh context shows the first visit's sentence; each reload the next (boot.ts) */
        for (const visit of [0, 1, 2]) {
          if (visit === 0) await openHome(page);
          else {
            await page.reload();
            await page.locator('main#top[data-hydrated]').waitFor({ timeout: 60_000 });
            await page.evaluate(() => document.fonts.ready);
          }
          const reads = [await readHead(page)];
          /* the other appearance through the bar's theme button: the same boxes */
          if (wide) {
            await page.locator('header [data-control="view.theme"]').click();
            reads.push(await readHead(page));
            await page.locator('header [data-control="view.theme"]').click();
          }
          for (const r of reads) {
            const label = `${width} ${face} ${r.theme} visit ${visit + 1}`;
            if (r.face !== (face === 'inter'))
              failures.push(`${label}: Inter ${r.face ? 'loaded' : 'not loaded'}`);
            if (!r.sentence.startsWith((sentences[visit] ?? '').replace(/\.$/, '')))
              failures.push(`${label}: the lead starts "${r.sentence}"`);
            const lines = r.leadBreaks.split(',').length;
            const wantLines = width === 320 && visit === 2 ? 3 : 2;
            if (lines !== wantLines)
              failures.push(`${label}: the lead is ${lines} lines (${r.leadBreaks})`);
            if (r.h1Breaks !== '2,3') failures.push(`${label}: the h1's words ${r.h1Breaks}`);
            const wantSize = width >= 1136 ? 76 : width >= 1024 ? 61.6 : width >= 720 ? 64 : null;
            if (wantSize !== null && Math.abs(r.h1Size - wantSize) > (width === 1024 ? 0.5 : 1))
              failures.push(`${label}: the h1 is ${r.h1Size} px`);
            if (wide) {
              if (r.sideBox > r.h1Box + 0.5)
                failures.push(`${label}: the side is ${r.sideBox} px over an h1 of ${r.h1Box}`);
              if (Math.abs(r.capDelta) > 1)
                failures.push(`${label}: the lead's cap line ${r.capDelta} px from the h1's`);
              if (Math.abs(r.footDelta) > 1.5)
                failures.push(`${label}: the buttons' foot ${r.footDelta} px from the baseline`);
            } else if (r.columns !== 1)
              failures.push(`${label}: the head has ${r.columns} columns`);
            notes.push(
              `${label}: h1 ${r.h1Size} px, box ${r.h1Box}, side ${r.sideBox}, lead ${r.leadBreaks}${wide ? `, cap ${r.capDelta}, foot ${r.footDelta}` : ''}`,
            );
          }
          breaks[face]!.push(reads[0]!.leadBreaks);
        }
      } finally {
        await context.close();
      }
    }
    if (breaks['inter']!.join(' / ') !== breaks['fallback']!.join(' / '))
      failures.push(
        `${width}: the lead breaks ${breaks['inter']!.join(' / ')} in Inter and ${breaks['fallback']!.join(' / ')} in the fallback`,
      );
  }
  test.info().annotations.push({ type: 'hero', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

export function rows(): void {
  if (entered('home.nav.no-pause'))
    test(title('home.nav.no-pause'), async ({ browser }) => {
      test.setTimeout(420_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await noPause(browser);
    });
  if (entered('home.nav.fits-320'))
    test(title('home.nav.fits-320'), async ({ browser }) => {
      test.setTimeout(420_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await fits320(browser);
    });
  if (entered('home.nav.theme-first-paint'))
    test(title('home.nav.theme-first-paint'), async ({ browser }) => {
      test.setTimeout(420_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await themeFirstPaint(browser);
    });
  if (entered('home.hero.side-fits-headline'))
    test(title('home.hero.side-fits-headline'), async ({ browser }) => {
      test.setTimeout(900_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await sideFitsHeadline(browser);
    });
}
