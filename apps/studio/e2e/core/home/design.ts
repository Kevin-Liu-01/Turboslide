import { loadavg } from 'node:os';

import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { TAILOR as PRODUCT_TAILOR } from '@turboslide/chrome/panels/assist-strings';

import { HOME_ASSETS } from './asset-records';
import {
  HOME_FORMAT_PANEL,
  HOME_STEP_ICONS,
  HOME_TITLE_ROW,
  HOME_TOOLBAR,
} from '../../../src/components/home/chrome.generated';
import { AGENTS, CANVAS, EXPORT, HERO, VERSIONS } from '../../../src/components/home/copy';
import {
  HOME_DECK,
  HOME_EXPORT_FACTS,
  HOME_LOOP_FACTS,
  HOME_TAILOR_WORDS,
} from '../../../src/components/home/deck.generated';
import {
  AGENTS_ROUND,
  PEOPLE_ROUND,
  BAND_CONTROLS,
  CANVAS_ROUND,
  DIAGRAM_WORDS,
  DIAGRAMS_ROUND,
  FIGURES_ROUND,
  HERO_ROUND,
  KITS_ROUND,
  MENUS_ROUND,
  NAV_ICONS,
} from '../../../src/components/home/design-copy';
import { HOME_FACTS } from '../../../src/components/home/facts';
import { MENU_GLYPHS } from '../../../src/components/home/menu-glyphs.generated';
import { MINI_MENUS } from '../../../src/components/home/menus.generated';
import { HOME_PATTERN_CARDS } from '../../../src/components/home/pattern-cards.generated';
import {
  HOME_THEME_AT_REST,
  HOME_THEME_TILES,
} from '../../../src/components/home/theme-tiles.generated';
import type { MiniRow } from '../../../src/components/home/menus.generated';
import { HOME_RUN } from '../../../src/components/home/run.generated';
import { HOME_GLYPH_IDS, HOME_SPRITE } from '../../../src/components/home/sprite.generated';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';
import { bandReady, geom } from './objects';

// A lane module of core/home.spec.ts: the design round's landing rows (docs/DESIGN.md 8, 11;
// lane D4). DR-D4#1 enters the shared parts: the navigation's one row of icon controls, Inter's
// default glyphs with tabular figures, the radius ladder, the shared scrollbar on every scroll
// region and every picture loading. Each later push of D4 adds its rows here: DR-D4#2 the hero's,
// DR-D4#4 the menus' glyphs, the canvas band's Format options readout and the Tailor dialog,
// DR-D4#7 the diagrams, the captured presenter view and the patterns gallery. Every observation is
// through the page and the network; the one file read is the page's own assets.json twin
// (`assets.ts`), the list the build wrote of every file under /home/.
//
// The scroll row runs in a Chromium of its own launched with its scrollbars shown, as the
// headless default hides them (`--hide-scrollbars`); nothing else differs from the runner's.

export const ROWS: readonly string[] = [
  'home.nav.icons',
  'home.type.default-glyphs',
  'home.radius.ladder',
  'home.scroll.regions',
  'home.pictures.all-load',
  'home.hero.frame-chrome',
  'home.hero.terminal-never-empty',
  'home.hero.steps',
  'home.menus.icons',
  'home.canvas.panel',
  'home.tailor.dialog',
  'home.diagrams.flows',
  'home.present.figure',
  'home.export.dialog',
  'home.patterns.stills',
  'home.kits.themes',
  'home.agents.history-panel',
  'home.people.share-dialog',
  'home.hero.font-swap',
  'home.kits.colors',
];

type Theme = 'light' | 'dark';
type Size = { width: number; height: number };

const DESKTOP: Size = { width: 1440, height: 900 };
const PHONE: Size = { width: 390, height: 844 };
const SIZES = [DESKTOP, PHONE] as const;
const THEMES: readonly Theme[] = ['light', 'dark'];

/** A row of this module is declared only once the matrix holds it (`title` throws otherwise). */
const entered = (id: string): boolean =>
  rowsForDriver('core/home.spec.ts').some((row) => row.id === id);

const oneMinuteLoad = (): number => Math.round((loadavg()[0] ?? 0) * 10) / 10;

async function homeContext(
  browser: Browser,
  size: Size,
  theme: Theme,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders,
    viewport: size,
    deviceScaleFactor: 1,
    colorScheme: theme,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('gt-theme', value);
    } catch {
      /* private mode */
    }
  }, theme);
  return { context, page: await context.newPage() };
}

async function openHome(page: Page): Promise<void> {
  const response = await page.goto('/home');
  expect(response?.status(), '/home answers 200').toBe(200);
  await page.locator('main#top[data-hydrated]').waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('main#top[data-live="ready"]').waitFor({ timeout: 60_000 });
}

/** Scrolls through the page so every band's chunk fills its reserved box, then back to the top. */
async function fillBands(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < height; y += Math.round(vh * 0.8)) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-reserve]')].every((box) =>
        box.hasAttribute('data-filled'),
      ),
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------------------------
// home.nav.icons

async function readNav(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('header .ts-product-nav-row')!;
    const rowBox = row.getBoundingClientRect();
    const shown = (el: Element | null): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden';
    const box = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        cy: Math.round(r.top + r.height / 2),
      };
    };
    const theme = document.querySelector('header [data-control="view.theme"]');
    const motion = document.querySelector('header [data-motion-toggle]');
    /* every control with words in the bar: a frame or a ground at rest is a box */
    const boxed = [...row.querySelectorAll<HTMLElement>('a, button')]
      .filter((el) => shown(el) && (el.textContent ?? '').trim() !== '' && !el.matches('.pt-icon'))
      .filter((el) => !el.closest('.ts-product-lockup'))
      .map((el) => {
        const s = getComputedStyle(el);
        const frame =
          parseFloat(s.borderTopWidth) > 0 &&
          !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.borderTopColor);
        const ground = !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.backgroundColor);
        return {
          text: (el.textContent ?? '').trim(),
          control: el.dataset['control'] ?? '',
          frame,
          ground,
        };
      })
      .filter((c) => c.frame || c.ground);
    return {
      rowHeight: Math.round(rowBox.height),
      rowTop: Math.round(rowBox.top),
      rows: new Set(
        [...row.querySelectorAll<HTMLElement>('a, button')].filter(shown).map((el) => {
          const r = el.getBoundingClientRect();
          return Math.round((r.top + r.height / 2 - rowBox.top) / 58);
        }),
      ).size,
      docs: shown(document.querySelector('header [data-control="home.nav.docs"]')),
      footerDocs: document.querySelector('footer [data-control="home.foot.docs"]') !== null,
      theme: box(theme),
      themeTip: theme?.getAttribute('data-tip') ?? null,
      themeIcon: theme?.classList.contains('pt-icon') ?? false,
      motion: box(motion),
      motionTip: motion?.getAttribute('data-tip') ?? null,
      motionPressed: motion?.getAttribute('aria-pressed') ?? null,
      themeBeforeMotion: theme !== null && motion !== null && theme.nextElementSibling === motion,
      newPresentation: box(document.querySelector('header [data-control="home.nav.new"]')),
      boxed,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

async function navIcons(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        const nav = await readNav(page);
        notes.push(
          `${label}: row ${nav.rowHeight} px, ${nav.rows} row; theme ${nav.theme?.w}x${nav.theme?.h} "${nav.themeTip}", motion ${nav.motion?.w}x${nav.motion?.h} "${nav.motionTip}"; boxed ${nav.boxed.map((b) => b.text).join(', ')}`,
        );
        if (nav.rowHeight !== 58) failures.push(`${label}: the bar is ${nav.rowHeight} px`);
        if (nav.rows !== 1) failures.push(`${label}: the controls sit in ${nav.rows} rows`);
        if (nav.overflow > 0)
          failures.push(`${label}: the page is ${nav.overflow} px wider than the view`);
        if (nav.docs !== size.width >= 720)
          failures.push(`${label}: Documentation ${nav.docs ? 'shown' : 'hidden'} in the bar`);
        if (!nav.footerDocs) failures.push(`${label}: no Documentation in the footer`);
        for (const [name, b] of [
          ['theme button', nav.theme],
          ['motion toggle', nav.motion],
        ] as const)
          if (b === null || b.w !== 32 || b.h !== 32)
            failures.push(`${label}: the ${name} is ${b?.w}x${b?.h}, not a 32 px square`);
        if (!nav.themeIcon)
          failures.push(`${label}: the theme button is not the shell's icon square`);
        /* the shared component's own words: its name says the next appearance, its sentence the
           control (ThemeButton.tsx) */
        const nextAppearance = theme === 'light' ? 'Switch to dark' : 'Switch to light';
        if (nav.themeTip !== nextAppearance)
          failures.push(`${label}: the theme button's tooltip reads "${nav.themeTip}"`);
        if (nav.motionTip !== NAV_ICONS.motion.pause)
          failures.push(`${label}: the motion toggle's tooltip reads "${nav.motionTip}"`);
        if (!nav.themeBeforeMotion)
          failures.push(`${label}: the motion toggle does not follow the theme button`);
        const boxed = nav.boxed.filter((b) => b.control !== 'home.nav.new');
        if (boxed.length > 0)
          failures.push(`${label}: boxed text controls ${boxed.map((b) => b.text).join(', ')}`);
        if (!nav.boxed.some((b) => b.control === 'home.nav.new' && b.ground))
          failures.push(`${label}: New Presentation is not solid`);
        /* the shared tooltip: the pointer's own arrival on the theme button shows the plate */
        const themeButton = page.locator('header [data-control="view.theme"]');
        const tb = (await themeButton.boundingBox())!;
        await page.mouse.move(tb.x - 40, tb.y + tb.height / 2);
        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
        await expect(page.locator('#pt-tip')).toBeVisible({ timeout: 3_000 });
        const tip = await page.locator('#pt-tip').innerText();
        if (!tip.startsWith(nextAppearance) || !tip.includes('Dark or light'))
          failures.push(`${label}: the tooltip plate reads "${tip}"`);
        await page.mouse.move(tb.x - 40, tb.y + 200);
        /* the toggle flips aria-pressed and its glyph, and back */
        const glyphs = () =>
          page.evaluate(() =>
            ['pause', 'play'].map(
              (g) =>
                getComputedStyle(document.querySelector(`[data-motion-toggle] [data-icon="${g}"]`)!)
                  .visibility,
            ),
          );
        const before = await glyphs();
        await page.evaluate(() =>
          document.querySelector<HTMLButtonElement>('[data-motion-toggle]')!.click(),
        );
        const pressed = await page
          .locator('header [data-motion-toggle]')
          .getAttribute('aria-pressed');
        const after = await glyphs();
        await page.evaluate(() =>
          document.querySelector<HTMLButtonElement>('[data-motion-toggle]')!.click(),
        );
        const back = await page.locator('header [data-motion-toggle]').getAttribute('aria-pressed');
        if (
          JSON.stringify(before) !== '["visible","hidden"]' ||
          pressed !== 'true' ||
          JSON.stringify(after) !== '["hidden","visible"]' ||
          back !== 'false'
        )
          failures.push(
            `${label}: the toggle read ${JSON.stringify({ before, pressed, after, back })}`,
          );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'nav', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.type.default-glyphs

/** The numbers of docs/DESIGN.md 8.0 the tree draws: counters, slide numbers, the numbers row,
    times and versions, read wherever they exist on the page. */
const NUMBER_SELECTORS = [
  '.ts-number-figure .pt-num',
  '.ts-number-chips .pt-num',
  '.ts-feature-keys kbd',
  '[data-hero-counter]',
  '[data-thumb-n]',
  '.ts-mini-thumb-n',
  '.ts-home-history-time',
  '[data-version-caption]',
] as const;

async function defaultGlyphs(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await fillBands(page);
        const read = await page.evaluate((selectors) => {
          const inSlide = (el: Element): boolean =>
            el.closest('.ts-sheet, [data-home-slides]') !== null;
          const alternates: string[] = [];
          let elements = 0;
          for (const el of document.querySelectorAll('body *')) {
            if (inSlide(el)) continue;
            elements += 1;
            const features = getComputedStyle(el).fontFeatureSettings;
            if (/cv11|ss01/.test(features))
              alternates.push(
                `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${features}`,
              );
          }
          const proportional: string[] = [];
          const counts: Record<string, number> = {};
          for (const selector of selectors) {
            const found = [...document.querySelectorAll(selector)].filter((el) => !inSlide(el));
            counts[selector] = found.length;
            for (const el of found)
              if (!getComputedStyle(el).fontVariantNumeric.includes('tabular-nums'))
                proportional.push(`${selector} "${(el.textContent ?? '').trim().slice(0, 20)}"`);
          }
          /* a word that clips its overflow keeps its whole line box, so no g, p or y loses its
             descender (pass 2 finding 4; the miniature's, the people screens' and the status
             row's titles read the same); the screen reader's one pixel box is the exception */
          const clipped: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('body *')) {
            if (inSlide(el) || el.closest('.ts-sr, [hidden], svg') !== null) continue;
            const own = [...el.childNodes].some(
              (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
            );
            if (!own || el.getClientRects().length === 0) continue;
            if (getComputedStyle(el).overflowY === 'visible') continue;
            if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight)
              clipped.push(
                `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 24)}" ${el.scrollHeight} over ${el.clientHeight}`,
              );
          }
          return {
            elements,
            alternates: alternates.slice(0, 12),
            proportional: proportional.slice(0, 12),
            clipped: clipped.slice(0, 12),
            counts,
          };
        }, NUMBER_SELECTORS);
        notes.push(
          `${label}: ${read.elements} elements outside the slides; numbers ${Object.entries(
            read.counts,
          )
            .map(([s, n]) => `${s} ${n}`)
            .join(', ')}`,
        );
        if (read.alternates.length > 0)
          failures.push(`${label}: alternates on ${read.alternates.join('; ')}`);
        if (read.proportional.length > 0)
          failures.push(`${label}: proportional figures in ${read.proportional.join('; ')}`);
        if (read.clipped.length > 0)
          failures.push(`${label}: a line box cut by its clip: ${read.clipped.join('; ')}`);
        if (
          (read.counts['.ts-number-figure .pt-num'] ?? 0) === 0 ||
          (read.counts['[data-thumb-n]'] ?? 0) === 0
        )
          failures.push(`${label}: the numbers row or the filmstrip numbers were not found`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'glyphs', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.radius.ladder

/** The ladder of docs/DESIGN.md 3.1 as /home draws it: each class of surface and its corner. */
const LADDER: readonly {
  rung: string;
  px: string;
  selectors: readonly string[];
  optional?: readonly string[];
}[] = [
  {
    rung: 'controls',
    px: '6px',
    selectors: [
      'header .pt-ib',
      '.ts-product .ts-button',
      '.ts-text-button',
      '.ts-product .ts-chip',
      '.ts-home-kit',
      '.ts-field',
      '.ts-mini-menus-key',
    ],
    /* the Menus key of the miniature is drawn under 720 px only */
    optional: ['.ts-mini-menus-key'],
  },
  { rung: 'menus', px: '6px', selectors: ['.ts-mini-plate'] },
  { rung: 'tooltips', px: '6px', selectors: ['#pt-tip'] },
  {
    rung: 'figure frames',
    px: '8px',
    selectors: [
      '.ts-hero-frame',
      '.ts-hero-terminal',
      '.ts-mini-editor',
      '[data-band="agents"] .ts-home-panel',
      '.ts-home-vh',
      '.ts-people-screen',
      '.ts-people-share',
    ],
  },
  { rung: 'dialogs', px: '8px', selectors: ['.ts-mini-dialog'] },
  {
    rung: 'key and count chips',
    px: '4px',
    selectors: ['.ts-product kbd.pt-kbd', '.ts-number-chips > li'],
  },
  {
    rung: 'slides, thumbnails, rails and seams',
    px: '0px',
    selectors: [
      '.ts-home-sheet',
      '.ts-sheet[data-home-slides]',
      '.ts-home-sheet.is-thumb',
      '.ts-rails',
      '.ts-seam',
      '.ts-hero-filmstrip',
      '.ts-mini-filmstrip',
    ],
  },
];

async function radiusLadder(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await fillBands(page);
        /* a tooltip: the pointer's own arrival on the theme button */
        const tb = (await page.locator('header [data-control="view.theme"]').boundingBox())!;
        await page.mouse.move(tb.x - 40, tb.y + tb.height / 2);
        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 });
        await expect(page.locator('#pt-tip')).toBeVisible({ timeout: 3_000 });
        const tip = await readRadii(
          page,
          LADDER.filter((r) => r.rung === 'tooltips'),
        );
        await page.mouse.move(tb.x - 40, tb.y + 300);
        /* a menu and a dialog of the miniature editor: File, then the first row that opens a dialog */
        const menus = page.locator('[data-band="menus"]');
        await menus.scrollIntoViewIfNeeded();
        if (size.width >= 720) await menus.locator('[data-menu="file"]').click();
        else {
          /* under 720 px the Menus key lists the nine menus; File is the first */
          await menus.locator('.ts-mini-menus-key').click();
          await menus.locator('[data-mini-plate="0"] [data-menu-open="0"]').click();
        }
        await expect(menus.locator('.ts-mini-plate').first()).toBeVisible({ timeout: 5_000 });
        const plates = await readRadii(
          page,
          LADDER.filter((r) => r.rung === 'menus'),
        );
        await menus.locator('[data-menu-item="file.rename"]').click();
        await expect(page.locator('.ts-mini-dialog').first()).toBeVisible({ timeout: 5_000 });
        const dialogs = await readRadii(
          page,
          LADDER.filter((r) => r.rung === 'dialogs'),
        );
        await page.keyboard.press('Escape');
        const rest = await readRadii(
          page,
          LADDER.filter((r) => !['tooltips', 'menus', 'dialogs'].includes(r.rung)),
        );
        const all = [...tip, ...plates, ...dialogs, ...rest];
        notes.push(`${label}: ${all.map((r) => `${r.selector} ${r.count}`).join(', ')}`);
        for (const r of all) {
          if (r.count === 0 && !r.optional) failures.push(`${label}: no ${r.selector} (${r.rung})`);
          if (r.wrong.length > 0)
            failures.push(`${label}: ${r.rung} ${r.selector} ${r.wrong.join(', ')}`);
        }
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'radii', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

async function readRadii(page: Page, rungs: typeof LADDER) {
  return page.evaluate(
    (list) =>
      list.flatMap(({ rung, px, selectors, optional }) =>
        selectors.map((selector) => {
          const found = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
          );
          const wrong = found
            .map((el) => {
              const s = getComputedStyle(el);
              const corners = [
                s.borderTopLeftRadius,
                s.borderTopRightRadius,
                s.borderBottomRightRadius,
                s.borderBottomLeftRadius,
              ];
              return corners.every((c) => c === px)
                ? null
                : `${corners.join(' ')} on "${(el.textContent ?? '').trim().slice(0, 16)}"`;
            })
            .filter((w): w is string => w !== null);
          return {
            rung,
            selector,
            count: found.length,
            optional: optional.includes(selector),
            wrong: [...new Set(wrong)].slice(0, 4),
          };
        }),
      ),
    rungs.map((r) => ({
      rung: r.rung,
      px: r.px,
      selectors: [...r.selectors],
      optional: [...(r.optional ?? [])],
    })),
  );
}

// ---------------------------------------------------------------------------------------------
// home.scroll.regions

async function scrollRegions(): Promise<void> {
  /* a Chromium with its scrollbars shown: the headless default hides them */
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const failures: string[] = [];
  const notes: string[] = [];
  try {
    for (const size of SIZES)
      for (const theme of THEMES) {
        const { context, page } = await homeContext(browser, size, theme);
        const label = `${size.width} ${theme}`;
        try {
          await openHome(page);
          await fillBands(page);
          await page.locator('[data-band="menus"]').scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          const read = await page.evaluate((narrow) => {
            const bar = (el: Element | null, axis: 'y' | 'x') => {
              if (!(el instanceof HTMLElement)) return null;
              const s = getComputedStyle(el);
              return {
                size:
                  axis === 'y'
                    ? el.offsetWidth -
                      el.clientWidth -
                      parseFloat(s.borderLeftWidth) -
                      parseFloat(s.borderRightWidth)
                    : el.offsetHeight -
                      el.clientHeight -
                      parseFloat(s.borderTopWidth) -
                      parseFloat(s.borderBottomWidth),
                overflow:
                  axis === 'y'
                    ? el.scrollHeight - el.clientHeight
                    : el.scrollWidth - el.clientWidth,
                thumb: s.getPropertyValue('--pt-thumb').trim(),
                width: s.scrollbarWidth,
              };
            };
            /* the hero terminal scrolls once it holds more lines than its slots: lines appended
               here stand for a long transcript, read and taken out again */
            const screen = document.querySelector<HTMLElement>('[data-hero-screen]');
            const added: HTMLElement[] = [];
            if (screen !== null)
              for (let i = 0; i < 30; i += 1) {
                const line = document.createElement('span');
                line.textContent = '$ turboslide version list';
                screen.append(line);
                added.push(line);
              }
            const terminal = bar(screen, 'y');
            for (const line of added) line.remove();
            const notes = document.querySelector<HTMLTextAreaElement>('.ts-mini-notes textarea');
            const patterns = document.querySelector('[data-patterns-row]');
            return {
              documentBar: innerWidth - document.documentElement.clientWidth,
              rootWidth: getComputedStyle(document.documentElement).scrollbarWidth,
              terminal,
              /* a column beside the stage at 720 px and over, a strip under it */
              miniFilmstrip: bar(document.querySelector('.ts-mini-filmstrip'), narrow ? 'x' : 'y'),
              heroFilmstrip: bar(document.querySelector('[data-hero-filmstrip]'), 'x'),
              patterns: patterns === null ? null : bar(patterns, 'x'),
              notes:
                notes === null
                  ? null
                  : {
                      overflow: notes.scrollHeight - notes.clientHeight,
                      bar: notes.offsetWidth - notes.clientWidth,
                    },
            };
          }, size.width < 720);
          notes.push(`${label}: ${JSON.stringify(read)}`);
          const inkThumb = theme === 'light' ? 'rgba(7, 7, 7, 0.44)' : 'rgba(242, 242, 240, 0.44)';
          /* a token's value is its text as the sheet wrote it: the build's minifier writes
             rgba(255, 255, 255, 0.44) as #ffffff70, so the two forms compare as colours, the
             channels equal and the alpha within one step of 255 */
          const rgbaOf = (value: string): number[] | null => {
            const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
            if (hex !== null) {
              const n = (i: number) => parseInt((hex[1] ?? '').slice(i, i + 2), 16);
              return [n(0), n(2), n(4), hex[2] === undefined ? 1 : parseInt(hex[2], 16) / 255];
            }
            const fn = /^rgba?\(([^)]+)\)$/.exec(value);
            if (fn === null) return null;
            const parts = (fn[1] ?? '')
              .split(/[\s,/]+/)
              .filter(Boolean)
              .map(Number);
            return [parts[0] ?? NaN, parts[1] ?? NaN, parts[2] ?? NaN, parts[3] ?? 1];
          };
          const sameColour = (a: string, b: string): boolean => {
            const x = rgbaOf(a);
            const y = rgbaOf(b);
            return (
              x !== null &&
              y !== null &&
              x[0] === y[0] &&
              x[1] === y[1] &&
              x[2] === y[2] &&
              Math.abs((x[3] ?? 1) - (y[3] ?? 1)) <= 1 / 255
            );
          };
          if (read.documentBar !== 8)
            failures.push(`${label}: the document's bar is ${read.documentBar} px`);
          if (read.rootWidth !== 'auto')
            failures.push(`${label}: the root's scrollbar-width is ${read.rootWidth}`);
          const t = read.terminal;
          if (t === null || t.size !== 8 || !sameColour(t.thumb, 'rgba(255, 255, 255, 0.44)'))
            failures.push(`${label}: the hero terminal's bar ${JSON.stringify(t)}`);
          const m = read.miniFilmstrip;
          if (
            m === null ||
            m.overflow <= 0 ||
            m.size !== 8 ||
            !sameColour(m.thumb, inkThumb) ||
            m.width !== 'auto'
          )
            failures.push(`${label}: the miniature filmstrip's bar ${JSON.stringify(m)}`);
          if (size.width < 720) {
            const h = read.heroFilmstrip;
            if (h === null || h.overflow <= 0 || h.size !== 8 || h.width !== 'auto')
              failures.push(`${label}: the hero filmstrip's bar ${JSON.stringify(h)}`);
            const p = read.patterns;
            if (p !== null && (p.overflow <= 0 || p.size !== 8))
              failures.push(`${label}: the patterns row's bar ${JSON.stringify(p)}`);
          }
          if (read.notes === null || read.notes.overflow > 0 || read.notes.bar !== 0)
            failures.push(`${label}: the notes field at rest ${JSON.stringify(read.notes)}`);
        } finally {
          await context.close();
        }
      }
  } finally {
    await browser.close();
  }
  test.info().annotations.push({ type: 'scroll', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.pictures.all-load

async function picturesLoad(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const listed = new Map(HOME_ASSETS.map((asset) => [asset.path, asset]));
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      const answers = new Map<string, number>();
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (/^\/home\/[^/]+\.[a-z0-9]+$/.test(path)) answers.set(path, response.status());
      });
      try {
        await openHome(page);
        await fillBands(page);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 400) {
          await page.evaluate((to) => window.scrollTo(0, to), y);
          await page.waitForTimeout(150);
        }
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
        const read = await page.evaluate(async () => {
          const shown = (el: Element) => el.getClientRects().length > 0;
          const imgs = [...document.querySelectorAll('img')].filter(shown);
          await Promise.all(
            imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))),
          );
          const broken = imgs
            .filter((img) => !img.complete || img.naturalWidth === 0)
            .map((img) => img.currentSrc || img.src);
          const named = [...document.querySelectorAll('img, source')].flatMap((el) =>
            [
              el.getAttribute('src'),
              ...(el.getAttribute('srcset') ?? '')
                .split(',')
                .map((part) => part.trim().split(/\s+/)[0]),
            ]
              .filter((src): src is string => typeof src === 'string' && src !== '')
              .map((src) => new URL(src, location.href).pathname),
          );
          const uses = [...document.querySelectorAll('use')]
            .map((use) => use.getAttribute('href') ?? '')
            .filter((href) => href.startsWith('/'))
            .map((href) => href.split('#')[0]!);
          return { shown: imgs.length, broken, named: [...new Set([...named, ...uses])] };
        });
        const other: Theme = theme === 'light' ? 'dark' : 'light';
        const requested = [...answers.keys()];
        notes.push(
          `${label}: ${read.shown} pictures shown, ${requested.length} /home files requested`,
        );
        if (read.broken.length > 0)
          failures.push(`${label}: not decoded ${read.broken.join(', ')}`);
        for (const [path, status] of answers)
          if (status !== 200 && status !== 304)
            failures.push(`${label}: ${path} answered ${status}`);
        for (const path of [...read.named, ...requested].filter((p) => p.startsWith('/home/'))) {
          if (path === '/home') continue;
          if (!listed.has(path)) failures.push(`${label}: ${path} is not in assets.json`);
        }
        for (const path of requested) {
          const asset = listed.get(path);
          if (asset !== undefined && asset.appearance === other && asset.role !== 'pdf')
            failures.push(`${label}: the ${other} twin ${path} was requested`);
        }
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'pictures', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.hero.frame-chrome

async function frameChrome(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of THEMES) {
    const { context, page } = await homeContext(browser, DESKTOP, theme);
    const label = `1440 ${theme}`;
    try {
      await openHome(page);
      const read = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('[data-hero-frame]')!;
        const text = (sel: string) =>
          (frame.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const glyph = (el: Element | null) => {
          if (!(el instanceof HTMLElement)) return null;
          const s = getComputedStyle(el);
          return {
            name: el.dataset['icon'] ?? '',
            mask: s.maskImage !== 'none' || s.webkitMaskImage !== 'none',
            w: Math.round(el.getBoundingClientRect().width),
          };
        };
        const title = frame.querySelector('.ts-hero-frame-title')!;
        /* the toolbar's cells in order: a glyph or a word each; the undo is the frame's Undo */
        const tools = [
          ...frame.querySelectorAll<HTMLElement>('[data-hero-tools] .ts-hero-tool'),
        ].map((el) => ({
          undo: el.matches('button[data-undo="hero"]'),
          icon: glyph(el.querySelector('.ts-icon')),
          word: el.querySelector('.ts-icon') === null ? (el.textContent ?? '').trim() : null,
        }));
        const counter = frame.querySelector<HTMLElement>('[data-hero-counter]');
        return {
          mark: title.querySelector('svg') !== null,
          name: text('[data-hero-title]'),
          saved: text('.ts-hero-frame-saved'),
          titleGlyphs: [...title.querySelectorAll('.ts-icon')].map(glyph),
          slideshow: text('.ts-hero-frame-split'),
          share: text('.ts-hero-frame-share'),
          /* one run of words since the design round's finishing round 2 (no word moves when Inter
             arrives after the first paint) */
          menus: (frame.querySelector('.ts-hero-frame-menus')?.textContent ?? '')
            .trim()
            .split(/\s+/),
          tools,
          thumbs: frame.querySelectorAll('[data-hero-filmstrip] [data-hero-thumb]').length,
          slide: frame.querySelector('[data-hero-slide] [data-home-slides]') !== null,
          notes: text('[data-hero-notes]'),
          counter: (counter?.textContent ?? '').trim(),
          counterFigures: counter === null ? '' : getComputedStyle(counter).fontVariantNumeric,
          radius: getComputedStyle(frame).borderTopLeftRadius,
        };
      });
      notes.push(
        `${label}: title "${read.name}" "${read.saved}" ${read.titleGlyphs.map((g) => g?.name).join(',')}; ${read.tools.length} tools; notes "${read.notes}" ${read.counter}`,
      );
      if (!read.mark) failures.push(`${label}: no mark in the title row`);
      if (read.name !== HOME_DECK.title) failures.push(`${label}: the title reads "${read.name}"`);
      if (read.saved !== HOME_TITLE_ROW.saved)
        failures.push(`${label}: the save cell reads "${read.saved}"`);
      const wantGlyphs = [
        HOME_TITLE_ROW.savedIcon,
        HOME_TITLE_ROW.agentIcon,
        HOME_TITLE_ROW.commentsIcon,
        HOME_TITLE_ROW.slideshowIcon,
        HOME_TITLE_ROW.slideshowMore,
        HOME_TITLE_ROW.shareIcon,
      ];
      if (JSON.stringify(read.titleGlyphs.map((g) => g?.name)) !== JSON.stringify(wantGlyphs))
        failures.push(
          `${label}: the title row's glyphs ${read.titleGlyphs.map((g) => g?.name).join(',')}`,
        );
      if (read.titleGlyphs.some((g) => g === null || !g.mask || g.w === 0))
        failures.push(`${label}: a title row glyph draws no mask`);
      if (read.slideshow !== HOME_TITLE_ROW.slideshow || read.share !== HOME_TITLE_ROW.share)
        failures.push(`${label}: Slideshow "${read.slideshow}", Share "${read.share}"`);
      if (JSON.stringify(read.menus) !== JSON.stringify(HERO.stage.menus))
        failures.push(`${label}: the menu row reads ${read.menus.join(' ')}`);
      if (read.tools.length !== 16)
        failures.push(`${label}: the toolbar draws ${read.tools.length} controls`);
      HOME_TOOLBAR.forEach((cell, i) => {
        const got = read.tools[i];
        if (got === undefined)
          failures.push(`${label}: no toolbar control ${i + 1} (${cell.control})`);
        else if (got.undo !== (cell.control === 'toolbar.undo'))
          failures.push(`${label}: toolbar control ${i + 1} is the frame's Undo: ${got.undo}`);
        else if (
          cell.icon !== null &&
          (got.icon?.name !== cell.icon || !got.icon.mask || got.icon.w === 0)
        )
          failures.push(
            `${label}: ${cell.control} draws ${got.icon?.name}, not the editor's ${cell.icon}`,
          );
        else if (cell.word !== null && got.word !== cell.word)
          failures.push(`${label}: ${cell.control} reads "${got.word}"`);
      });
      if (read.thumbs !== 9 || !read.slide)
        failures.push(`${label}: ${read.thumbs} thumbnails, slide ${read.slide}`);
      if (read.notes !== HOME_DECK.slides.title.notes)
        failures.push(`${label}: the notes row reads "${read.notes}"`);
      if (read.counter !== '1 / 9' || !read.counterFigures.includes('tabular-nums'))
        failures.push(`${label}: the counter "${read.counter}" in ${read.counterFigures}`);
      if (read.radius !== '8px') failures.push(`${label}: the frame's corner is ${read.radius}`);
    } finally {
      await context.close();
    }
  }
  /* the title row's words keep their descenders at both widths: a cell that clips its overflow
     holds its whole line box (pass 1 finding 9, pass 2 finding 4: "Onboarding plan" on a 14 px
     line lost the g and p) */
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-hero-frame] .ts-hero-frame-title *')]
            .filter((el) => {
              const s = getComputedStyle(el);
              return (
                s.overflowY !== 'visible' &&
                (el.textContent ?? '').trim() !== '' &&
                el.getClientRects().length > 0
              );
            })
            .map((el) => ({
              cls: el.className,
              text: (el.textContent ?? '').trim(),
              scroll: el.scrollHeight,
              client: el.clientHeight,
              line: getComputedStyle(el).lineHeight,
            })),
        );
        const name = clipped.find((c) => c.cls.includes('ts-hero-frame-name'));
        notes.push(
          `${label}: the title cell ${name === undefined ? 'not read' : `${name.scroll} over ${name.client} (line ${name.line})`}`,
        );
        if (name === undefined) failures.push(`${label}: the title cell was not read`);
        for (const c of clipped)
          if (c.scroll > c.client)
            failures.push(
              `${label}: "${c.text}" (${c.cls}) clips its line: ${c.scroll} over ${c.client}`,
            );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'frame', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.hero.terminal-never-empty

async function terminalNeverEmpty(browser: Browser): Promise<void> {
  const { context, page } = await homeContext(browser, DESKTOP, 'light');
  const failures: string[] = [];
  const notes: string[] = [];
  try {
    await openHome(page);
    await page.waitForFunction(
      () =>
        (window as unknown as { tsHomeMotion?: { running(): string[] } }).tsHomeMotion
          ?.running()
          .includes('L-H') === true,
      undefined,
      { timeout: 30_000 },
    );
    const samples = await page.evaluate(async () => {
      const screen = document.querySelector<HTMLElement>('[data-hero-screen]')!;
      const out: {
        t: number;
        visible: number;
        lines: number;
        atEnd: boolean;
        restore: boolean;
        restoreLast: boolean;
      }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 24_000) {
        const box = screen.getBoundingClientRect();
        const lines = [...screen.children] as HTMLElement[];
        const visible = lines.filter((l) => {
          const r = l.getBoundingClientRect();
          return (
            r.bottom > box.top + 4 && r.top < box.bottom - 4 && (l.textContent ?? '').trim() !== ''
          );
        }).length;
        const restoreAt = lines.findLastIndex((l) =>
          (l.textContent ?? '').startsWith('$ turboslide version restore'),
        );
        out.push({
          t: Math.round(performance.now() - t0),
          visible,
          lines: lines.length,
          atEnd: screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 2,
          restore:
            document.querySelector('[data-hero-step="restore"][aria-current="step"]') !== null,
          restoreLast: restoreAt >= 0 && restoreAt >= lines.length - 3,
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return out;
    });
    const fewest = Math.min(...samples.map((s) => s.visible));
    const during = samples.filter((s) => s.restore);
    notes.push(
      `${samples.length} samples over 24 s: fewest visible lines ${fewest}, most lines held ${Math.max(...samples.map((s) => s.lines))}; ${during.length} samples while Restore played; load ${oneMinuteLoad()}`,
    );
    if (samples.length < 80) failures.push(`only ${samples.length} samples in 24 s`);
    if (fewest < 12) failures.push(`a sample showed ${fewest} lines`);
    if (during.length === 0) failures.push('Restore did not play in 24 s');
    const restored = during.filter((s) => s.restoreLast);
    if (during.length > 0 && restored.length === 0)
      failures.push("Restore's line never reached the end");
    const lagging = during.filter((s) => s.restoreLast && !s.atEnd);
    if (lagging.length > 0)
      failures.push(
        `${lagging.length} samples with Restore's line printed and the screen short of its end`,
      );
    const before = samples.findIndex((s) => s.restore);
    if (before > 0 && (samples[before]?.lines ?? 0) < (samples[before - 1]?.lines ?? 0))
      failures.push('Restore cleared the screen');
  } finally {
    await context.close();
  }
  test.info().annotations.push({ type: 'terminal', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.hero.steps

async function heroSteps(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const theme of THEMES) {
    const { context, page } = await homeContext(browser, DESKTOP, theme);
    const label = `1440 ${theme}`;
    try {
      await openHome(page);
      const rest = await page.evaluate(() => {
        const terminal = document.querySelector<HTMLElement>('[data-hero-terminal]')!;
        const rows = [...document.querySelectorAll<HTMLElement>('[data-hero-step]')];
        const done = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-status-done')
          .trim();
        return {
          head: [...(terminal.querySelector('.ts-hero-terminal-head')?.children ?? [])]
            .map((el) => (el.textContent ?? '').trim())
            .filter((t) => t !== '')
            .join(' '),
          pause: terminal.querySelector('.ts-hero-terminal-head [data-motion-toggle]') !== null,
          inFoot: rows.every((r) => r.closest('[data-hero-terminal]') === terminal),
          rows: rows.map((r) => {
            const glyph = r.querySelector<HTMLElement>('.is-done');
            const length = r.querySelector<HTMLElement>('.ts-hero-step-length');
            return {
              id: r.dataset['heroStep'] ?? '',
              label: (r.querySelector('.ts-hero-step-label')?.textContent ?? '').trim(),
              length: (length?.textContent ?? '').trim(),
              tabular:
                length !== null &&
                getComputedStyle(length).fontVariantNumeric.includes('tabular-nums'),
              glyph: glyph?.dataset['icon'] ?? '',
              glyphShown: glyph !== null && getComputedStyle(glyph).visibility === 'visible',
              glyphColor: glyph === null ? '' : getComputedStyle(glyph).color,
              text: (r.textContent ?? '').trim(),
            };
          }),
          doneColor: done,
          cli: document.querySelectorAll('.ts-hero-step-cli, [data-caption-row]').length,
        };
      });
      notes.push(
        `${label}: head "${rest.head}"; rows ${rest.rows.map((r) => `${r.label} ${r.length}`).join(', ')}`,
      );
      if (
        rest.head !==
        `${HERO_ROUND.terminal.agent} ${HERO_ROUND.terminal.recorded(HOME_LOOP_FACTS.captionSeconds)}`
      )
        failures.push(`${label}: the head reads "${rest.head}"`);
      if (!rest.pause) failures.push(`${label}: no pause button in the head`);
      if (!rest.inFoot || rest.rows.length !== 4)
        failures.push(`${label}: ${rest.rows.length} rows, in the foot ${rest.inFoot}`);
      if (rest.cli > 0) failures.push(`${label}: a CLI fragment under a step`);
      HERO.stage.steps.forEach((step, i) => {
        const row = rest.rows[i];
        const want = HERO_ROUND.terminal.length(HOME_LOOP_FACTS.stepSeconds[step.id]);
        if (row === undefined || row.id !== step.id || row.label !== step.label) {
          failures.push(`${label}: row ${i + 1} is ${row?.id} "${row?.label}"`);
          return;
        }
        if (row.length !== want || !/^\d+\.\d s$/.test(row.length) || !row.tabular)
          failures.push(`${label}: ${step.id} length "${row.length}", tabular ${row.tabular}`);
        if (row.glyph !== HOME_STEP_ICONS.done || !row.glyphShown)
          failures.push(`${label}: ${step.id} at rest draws no done glyph`);
        if (/version restore|slide new|block set/.test(row.text))
          failures.push(`${label}: ${step.id} carries CLI words`);
      });
      /* the done glyph in the status green: the token's colour as the browser computes it */
      const green = await page.evaluate((token) => {
        const probe = document.createElement('i');
        probe.style.color = token;
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }, rest.doneColor);
      for (const row of rest.rows)
        if (row.glyphColor !== green)
          failures.push(`${label}: ${row.id}'s glyph is ${row.glyphColor}, not ${green}`);
      /* the playing row: aria-current, the play glyph and the 2 px countdown rule filling */
      await page.waitForFunction(
        () => document.querySelector('[data-hero-step][aria-current="step"]') !== null,
        undefined,
        { timeout: 30_000 },
      );
      const playing = await page.evaluate(async () => {
        const row = document.querySelector<HTMLElement>('[data-hero-step][aria-current="step"]')!;
        const before = getComputedStyle(row, '::before');
        const first = parseFloat(row.style.getPropertyValue('--ts-step-progress') || '0');
        await new Promise((resolve) => setTimeout(resolve, 600));
        const later = parseFloat(row.style.getPropertyValue('--ts-step-progress') || '0');
        const play = row.querySelector<HTMLElement>('.is-playing');
        return {
          id: row.dataset['heroStep'],
          ruleHeight: before.height,
          first,
          later,
          play: play !== null && getComputedStyle(play).visibility === 'visible',
        };
      });
      notes.push(
        `${label}: playing ${playing.id}, rule ${playing.ruleHeight}, progress ${playing.first.toFixed(2)} to ${playing.later.toFixed(2)}`,
      );
      if (playing.ruleHeight !== '2px')
        failures.push(`${label}: the countdown rule is ${playing.ruleHeight}`);
      if (!(playing.later > playing.first) && playing.later < 1)
        failures.push(
          `${label}: the countdown did not fill (${playing.first} to ${playing.later})`,
        );
      if (!playing.play) failures.push(`${label}: the playing row draws no play glyph`);
    } finally {
      await context.close();
    }
  }
  test.info().annotations.push({ type: 'steps', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.menus.icons (DESIGN.md 8.4)

/**
 * Each row of the miniature's menus with its glyph's symbol id, paired depth first as the menus
 * chunk does ('' for a row that draws none).
 */
function glyphsOf(): Map<MiniRow, string> {
  const out = new Map<MiniRow, string>();
  let n = 0;
  const pair = (rows: readonly MiniRow[]): void => {
    for (const r of rows) {
      const i = MENU_GLYPHS[n++] ?? -1;
      out.set(r, i < 0 ? '' : `g${i}`);
      if (r.items !== undefined) pair(r.items);
    }
  };
  for (const m of MINI_MENUS) pair(m.rows);
  return out;
}

/** The rows of an open plate as drawn: label, glyph fragment, chevron, grey, check state. */
function plateRead(page: Page, depth: number) {
  return page.evaluate((d) => {
    const plate = document.querySelector(`[data-band="menus"] [data-mini-plate="${d}"]`);
    return [...(plate?.querySelectorAll<HTMLElement>('.ts-mini-row:not(.is-back)') ?? [])].map(
      (el) => ({
        label: el.querySelector('.ts-mini-row-label')?.textContent ?? '',
        glyph:
          (el.querySelector('.ts-mini-row-check use')?.getAttribute('href') ?? '').split('#')[1] ??
          '',
        next:
          (el.querySelector('.ts-mini-chevron use')?.getAttribute('href') ?? '').split('#')[1] ??
          '',
        off: el.classList.contains('is-off'),
        disabled: el.getAttribute('aria-disabled') === 'true',
        checked: el.getAttribute('aria-checked') === 'true',
      }),
    );
  }, depth);
}

async function menusIcons(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const glyphs = glyphsOf();
  const used = new Set<string>([HOME_GLYPH_IDS['check'] ?? '', HOME_GLYPH_IDS['next'] ?? '']);
  for (const theme of THEMES) {
    const { context, page } = await homeContext(browser, DESKTOP, theme);
    const label = `1440 ${theme}`;
    try {
      await openHome(page);
      await bandReady(page, 'menus');
      const head = await page.evaluate(() => ({
        h2: document.querySelector('#ts-h-menus')?.textContent ?? '',
        lead:
          document.querySelector('[data-band="menus"] .ts-band-head .ts-lead')?.textContent ?? '',
      }));
      if (head.h2 !== MENUS_ROUND.h2 || head.lead !== MENUS_ROUND.lead)
        failures.push(`${label}: the head reads ${JSON.stringify(head)}`);
      // the glyphs land with their own chunk after the band starts
      await page.waitForFunction(
        () => (window as unknown as { tsHomeStore?: unknown }).tsHomeStore !== undefined,
        undefined,
        { timeout: 15_000 },
      );
      const titles = page.locator('[data-band="menus"] .ts-mini-menu');
      for (const [i, menu] of MINI_MENUS.entries()) {
        await page.mouse.move(0, 0);
        await titles.nth(i).click();
        await page.locator('[data-band="menus"] [data-mini-plate="0"]').waitFor();
        await page.mouse.move(0, 0);
        await page.waitForFunction(
          () =>
            document.querySelector(
              '[data-band="menus"] [data-mini-plate="0"] .ts-mini-row-check use',
            ) !== null,
          undefined,
          { timeout: 10_000 },
        );
        const drawn = await plateRead(page, 0);
        if (drawn.length !== menu.rows.length)
          failures.push(
            `${label}: ${menu.label} draws ${drawn.length} rows of ${menu.rows.length}`,
          );
        for (const [k, row] of menu.rows.entries()) {
          const d = drawn[k];
          if (d === undefined) continue;
          const want = d.checked ? (HOME_GLYPH_IDS['check'] ?? '') : (glyphs.get(row) ?? '');
          used.add(want);
          if (d.glyph !== want)
            failures.push(
              `${label}: ${menu.label} > ${row.label} draws "${d.glyph}" for "${want}"`,
            );
          if ((row.items !== undefined) !== (d.next === HOME_GLYPH_IDS['next']))
            failures.push(`${label}: ${menu.label} > ${row.label} next glyph ${d.next}`);
          if (row.run !== true && d.off !== (row.off === true))
            failures.push(
              `${label}: ${menu.label} > ${row.label} grey ${d.off}, the editor ${row.off === true}`,
            );
          if (row.run !== true && row.items === undefined && d.disabled !== (row.off === true))
            failures.push(`${label}: ${menu.label} > ${row.label} aria-disabled ${d.disabled}`);
        }
        await page.keyboard.press('Escape');
      }
      // a submenu's rows: Insert > Shape
      const insert = MINI_MENUS.findIndex((m) => m.id === 'insert');
      const shape = MINI_MENUS[insert]?.rows.find((r) => r.label === 'Shape');
      await titles.nth(insert).click();
      await page
        .locator('[data-band="menus"] [data-mini-plate="0"] .ts-mini-row', { hasText: 'Shape' })
        .first()
        .hover();
      await page.locator('[data-band="menus"] [data-mini-plate="1"]').waitFor();
      const sub = await plateRead(page, 1);
      for (const [k, row] of (shape?.items ?? []).entries())
        if (sub[k]?.glyph !== (glyphs.get(row) ?? ''))
          failures.push(`${label}: Insert > Shape > ${row.label} draws "${sub[k]?.glyph}"`);
      await page.keyboard.press('Escape');
      // the press of a row the page does not run answers in the status row
      const file = MINI_MENUS[0];
      const notRun = file?.rows.find(
        (r) => r.run !== true && r.off !== true && r.items === undefined,
      );
      await titles.nth(0).click();
      await page
        .locator('[data-band="menus"] [data-mini-plate="0"] .ts-mini-row', {
          hasText: notRun?.label ?? '',
        })
        .first()
        .click();
      const status = await page.locator('[data-band="menus"] [data-mini-status]').innerText();
      if (!status.startsWith('This row runs in the editor.'))
        failures.push(`${label}: ${notRun?.label} says "${status}"`);
      notes.push(`${label}: nine menus read, ${glyphs.size} rows paired`);
    } finally {
      await context.close();
    }
  }
  // the sprite answers and holds every glyph the rows drew
  {
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      const response = await page.request.get(HOME_SPRITE);
      const text = await response.text();
      if (response.status() !== 200) failures.push(`${HOME_SPRITE} answered ${response.status()}`);
      for (const name of used)
        if (name !== '' && !text.includes(`<symbol id="${name}"`))
          failures.push(`${HOME_SPRITE} has no symbol ${name}`);
      notes.push(`${HOME_SPRITE}: ${text.length} B, ${used.size} glyphs drawn`);
    } finally {
      await context.close();
    }
  }
  // at 390 the Menus key's plate sits in the flow under the key, inside the frame
  for (const theme of THEMES) {
    const { context, page } = await homeContext(browser, PHONE, theme);
    const label = `390 ${theme}`;
    try {
      await openHome(page);
      await bandReady(page, 'menus');
      const before = await page.locator('[data-band="menus"] .ts-mini-editor').boundingBox();
      await page.locator('[data-band="menus"] .ts-mini-menus-key').click();
      await page.locator('[data-band="menus"] [data-mini-plate="0"]').waitFor();
      await page
        .locator('[data-band="menus"] [data-mini-plate="0"] .ts-mini-row', { hasText: 'Insert' })
        .first()
        .click();
      await page.waitForTimeout(200);
      const read = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('[data-band="menus"] .ts-mini-editor')!;
        const key = document.querySelector<HTMLElement>('[data-band="menus"] .ts-mini-menus-key')!;
        const plate = document.querySelector<HTMLElement>('[data-band="menus"] [data-mini-plate]')!;
        const f = frame.getBoundingClientRect();
        const k = key.getBoundingClientRect();
        const p = plate.getBoundingClientRect();
        return {
          position: getComputedStyle(plate).position,
          under: p.top >= k.bottom - 1,
          inside: p.left >= f.left - 1 && p.right <= f.right + 1 && p.bottom <= f.bottom + 1,
          height: f.height,
          glyphs: plate.querySelectorAll('.ts-mini-row-check use').length,
        };
      });
      if (read.position !== 'static' || !read.under || !read.inside)
        failures.push(`${label}: the open menu ${JSON.stringify(read)}`);
      if (before !== null && read.height <= before.height)
        failures.push(`${label}: the frame did not grow (${before.height} to ${read.height})`);
      if (read.glyphs < 8) failures.push(`${label}: Insert drew ${read.glyphs} glyphs`);
      notes.push(`${label}: the frame grew ${Math.round(read.height - (before?.height ?? 0))} px`);
    } finally {
      await context.close();
    }
  }
  test.info().annotations.push({ type: 'menus', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.canvas.panel (DESIGN.md 8.5)

const PLATE = HOME_DECK.slides.lighthouse.objects[0];

async function canvasPanel(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await bandReady(page, 'canvas');
        await page.waitForFunction(
          () =>
            document.querySelectorAll('[data-band="canvas"] .ts-fo h4 > .ts-glyph').length === 4,
          undefined,
          { timeout: 15_000 },
        );
        const rest = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('[data-band="canvas"] .ts-fo')!;
          const sheet = document.querySelector<HTMLElement>('[data-band="canvas"] [data-reserve]')!;
          const fields: Record<string, { text: string; numeric: string }> = Object.fromEntries(
            [...panel.querySelectorAll<HTMLElement>('[data-fo]')].map((el) => [
              el.dataset['fo'] ?? '',
              { text: el.textContent ?? '', numeric: getComputedStyle(el).fontVariantNumeric },
            ]),
          );
          const p = panel.getBoundingClientRect();
          const s = sheet.getBoundingClientRect();
          return {
            title: panel.querySelector('h3')?.textContent ?? '',
            heads: [...panel.querySelectorAll('h4')].map((h) => h.textContent ?? ''),
            glyphs: [...panel.querySelectorAll('h4 use')].map(
              (u) => (u.getAttribute('href') ?? '').split('#')[1] ?? '',
            ),
            radius: getComputedStyle(panel).borderTopLeftRadius,
            undo: panel.querySelector('[data-undo="canvas"]')?.getAttribute('aria-label') ?? '',
            layout: panel.querySelector('[data-layout-row]')?.textContent ?? '',
            fields,
            beside: p.left >= s.right - 1 && Math.abs(p.top - s.top) <= 1,
            under: p.top >= s.bottom - 1,
            rows: document.querySelectorAll('[data-band="canvas"] .ts-home-rows').length,
          };
        });
        const heads = [
          HOME_FORMAT_PANEL.size,
          HOME_FORMAT_PANEL.position,
          HOME_FORMAT_PANEL.layout,
          CANVAS_ROUND.command,
        ];
        if (rest.title !== HOME_FORMAT_PANEL.title) failures.push(`${label}: title ${rest.title}`);
        if (JSON.stringify(rest.heads) !== JSON.stringify(heads))
          failures.push(`${label}: sections ${rest.heads.join(', ')}`);
        if (
          JSON.stringify(rest.glyphs) !==
          JSON.stringify(HOME_FORMAT_PANEL.icons.map((n) => HOME_GLYPH_IDS[n]))
        )
          failures.push(`${label}: section glyphs ${rest.glyphs.join(', ')}`);
        if (rest.radius !== '8px') failures.push(`${label}: the panel's corner ${rest.radius}`);
        if (rest.undo !== BAND_CONTROLS.undo)
          failures.push(`${label}: the panel's Undo ${rest.undo}`);
        if (rest.layout !== CANVAS.layout.mood) failures.push(`${label}: Layout ${rest.layout}`);
        if (rest.rows !== 0) failures.push(`${label}: ${rest.rows} rows of text under the slide`);
        if (size.width === 1440 ? !rest.beside : !rest.under)
          failures.push(
            `${label}: the panel is not ${size.width === 1440 ? 'beside' : 'under'} the slide`,
          );
        const want = { w: PLATE?.box.w, h: PLATE?.box.h, r: 0, x: PLATE?.box.x, y: PLATE?.box.y };
        for (const [k, v] of Object.entries(want)) {
          const f = rest.fields[k];
          if (f === undefined || f.text !== String(Math.round(v ?? 0)))
            failures.push(`${label}: ${k} reads ${f?.text} at rest, not ${Math.round(v ?? 0)}`);
          if (f !== undefined && !f.numeric.includes('tabular-nums'))
            failures.push(`${label}: ${k} is not in tabular figures`);
        }
        if (size.width === 1440 && theme === 'light') {
          // a drag of the heading: the fields read its new box, the log's line and Layout agree
          const H = '[data-band="canvas"] [data-object="lighthouse#h"]';
          const g0 = await geom(page, H);
          await page.mouse.click(g0.cx, g0.cy);
          await page.mouse.down();
          await page.mouse.move(g0.cx - 50, g0.cy - 30, { steps: 5 });
          await page.mouse.up();
          const code = page.locator('[data-band="canvas"] [data-log]');
          await expect(code).toHaveText(/^turboslide block set lighthouse#h \/pos /, {
            timeout: 2000,
          });
          const line = (await code.innerText()).trim();
          const json = JSON.parse(
            line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")),
          ) as Record<string, number>;
          const after = await page.evaluate(() =>
            Object.fromEntries(
              [...document.querySelectorAll<HTMLElement>('[data-band="canvas"] [data-fo]')].map(
                (el) => [el.dataset['fo'], Number(el.textContent)],
              ),
            ),
          );
          // the fields round the store's pose, the line the gesture's box: within one unit
          for (const k of ['x', 'y', 'w', 'h'])
            if (Math.abs((after[k] ?? NaN) - (json[k] ?? NaN)) > 1 || Number.isNaN(after[k]))
              failures.push(`${label}: ${k} reads ${after[k]} after the drag, the line ${json[k]}`);
          const face = await code.evaluate((el) => ({
            family: getComputedStyle(el).fontFamily,
            ground: getComputedStyle(el).backgroundColor,
          }));
          if (!/mono|menlo|consolas/i.test(face.family))
            failures.push(`${label}: the line's face ${face.family}`);
          const layout = await page.locator('[data-band="canvas"] [data-layout-row]').innerText();
          if (layout !== CANVAS.layout.canvas)
            failures.push(`${label}: Layout reads ${layout} after the drag`);
          // a turn by the keys reads in Rotate
          await page.keyboard.press('Alt+ArrowRight');
          await expect(page.locator('[data-band="canvas"] [data-fo="r"]')).toHaveText('15', {
            timeout: 2000,
          });
          // Undo until the band has nothing left: the heading's box at rest and Mood
          const undo = page.locator('[data-band="canvas"] [data-undo="canvas"]');
          for (let i = 0; i < 6 && (await undo.getAttribute('aria-disabled')) !== 'true'; i += 1) {
            await undo.click();
            await page.waitForTimeout(150);
          }
          const back = HOME_DECK.slides.lighthouse.objects.find(
            (o) => o.id === 'lighthouse#h',
          )?.box;
          const x = await page.locator('[data-band="canvas"] [data-fo="x"]').innerText();
          if (back !== undefined && x !== String(Math.round(back.x)))
            failures.push(`${label}: X reads ${x} after Undo, not ${Math.round(back.x)}`);
          const mood = await page.locator('[data-band="canvas"] [data-layout-row]').innerText();
          if (mood !== CANVAS.layout.mood)
            failures.push(`${label}: Layout reads ${mood} after Undo`);
          notes.push(
            `${label}: drag read ${JSON.stringify(json)}, face ${face.family.split(',')[0]}`,
          );
        }
        notes.push(
          `${label}: at rest ${Object.values(rest.fields)
            .map((f) => f.text)
            .join(' ')}`,
        );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'canvas', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.tailor.dialog (DESIGN.md 8.6)

async function tailorDialog(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await bandReady(page, 'tailor');
        const band = page.locator('[data-band="tailor"]');
        const rest = await page.evaluate(() => {
          const b = document.querySelector<HTMLElement>('[data-band="tailor"]')!;
          const form = b.querySelector<HTMLElement>('[data-tailor]')!;
          const strip = b.querySelector<HTMLElement>('[data-filmstrip]')!;
          const stage = b.querySelector<HTMLElement>('[data-stage]')!;
          const snack = b.querySelector<HTMLElement>('[data-snackbar]')!;
          const thumbs = [...strip.querySelectorAll<HTMLElement>('[data-thumb]')].map((t) =>
            t.getBoundingClientRect(),
          );
          const f = form.getBoundingClientRect();
          const st = stage.getBoundingClientRect();
          const sn = snack.getBoundingClientRect();
          return {
            title: form.querySelector('h3')?.textContent ?? '',
            labels: [...form.querySelectorAll('.ts-tailor-field > span:first-child')].map(
              (s) => s.textContent ?? '',
            ),
            buttons: [...form.querySelectorAll('button')].map(
              (x) => `${x.type}:${x.textContent ?? ''}`,
            ),
            radius: getComputedStyle(form).borderTopLeftRadius,
            oneRow: thumbs.every((t) => Math.abs(t.top - (thumbs[0]?.top ?? 0)) <= 1),
            stripAbove: thumbs.every((t) => t.bottom <= st.top + 1),
            snackUnder: sn.top >= st.bottom - 1,
            beside: f.right <= (thumbs[0]?.left ?? 0) + 1,
            movesAtRest: [...strip.querySelectorAll<HTMLElement>('[data-thumb-move]')].filter((m) =>
              m.checkVisibility({ visibilityProperty: true }),
            ).length,
            moves: strip.querySelectorAll('[data-thumb-move] use').length,
          };
        });
        if (rest.title !== HOME_TAILOR_WORDS.title) failures.push(`${label}: title ${rest.title}`);
        if (
          JSON.stringify(rest.labels) !==
          JSON.stringify([HOME_TAILOR_WORDS.from, HOME_TAILOR_WORDS.to])
        )
          failures.push(`${label}: fields ${rest.labels.join(', ')}`);
        if (
          JSON.stringify(rest.buttons) !==
          JSON.stringify([`reset:${HOME_TAILOR_WORDS.cancel}`, `submit:${HOME_TAILOR_WORDS.apply}`])
        )
          failures.push(`${label}: buttons ${rest.buttons.join(', ')}`);
        if (rest.radius !== '8px') failures.push(`${label}: the dialog's corner ${rest.radius}`);
        if (!rest.oneRow || !rest.stripAbove || !rest.snackUnder)
          failures.push(`${label}: the editor part ${JSON.stringify(rest)}`);
        if (size.width === 1440 && !rest.beside)
          failures.push(`${label}: the dialog is not beside the filmstrip`);
        if (rest.moves !== 10) failures.push(`${label}: ${rest.moves} move glyphs`);
        if (rest.movesAtRest !== 0)
          failures.push(`${label}: ${rest.movesAtRest} move buttons shown at rest`);
        // a hover shows the thumbnail's moves; a keyboard focus does too
        if (size.width === 1440) {
          await band.locator('[data-thumb="gets"]').hover();
          const shown = await band
            .locator('[data-thumb="gets"] [data-thumb-move]')
            .evaluateAll(
              (els) => els.filter((e) => e.checkVisibility({ visibilityProperty: true })).length,
            );
          if (shown !== 2) failures.push(`${label}: ${shown} moves on hover`);
          await page.mouse.move(0, 0);
        }
        await band.locator('[data-thumb="ships"]').focus();
        const focused = await band
          .locator('[data-thumb="ships"] [data-thumb-move]')
          .evaluateAll(
            (els) => els.filter((e) => e.checkVisibility({ visibilityProperty: true })).length,
          );
        if (focused !== 2) failures.push(`${label}: ${focused} moves on focus`);
        // Cancel empties With; Apply shows the product's snackbar under the stage
        const field = band.locator('[data-tailor-to]');
        await field.fill('Initech');
        await band.locator('button[type="reset"]').click();
        if ((await field.inputValue()) !== '')
          failures.push(`${label}: Cancel left "${await field.inputValue()}"`);
        const restCount = HOME_RUN.tailorCounts.rest;
        await expect(band.locator('[data-tailor-count]')).toHaveText(
          PRODUCT_TAILOR.count(restCount.places, restCount.slides),
        );
        await field.fill('Globex');
        await band.locator('[data-tailor-apply]').click();
        const snack = band.locator('[data-snackbar]');
        await expect(snack).toHaveAttribute('data-on', '');
        await expect(snack.locator('[data-snackbar-text]')).toHaveText(
          PRODUCT_TAILOR.result('Globex', restCount.places, restCount.slides, 0),
        );
        const look = await snack.evaluate((el) => ({
          ground: getComputedStyle(el).backgroundColor,
          radius: getComputedStyle(el).borderTopLeftRadius,
          shown: el.checkVisibility({ visibilityProperty: true }),
        }));
        if (!look.shown || look.radius !== '6px')
          failures.push(`${label}: the snackbar ${JSON.stringify(look)}`);
        await snack.locator('[data-snackbar-undo]').click();
        notes.push(`${label}: snackbar ${look.ground}, moves on hover and focus`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'tailor', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.diagrams.flows (DESIGN.md 8.0 "Diagrams", 8.10, 8.11)

const FLOWS = [
  {
    band: 'present',
    id: 'd-present',
    label: DIAGRAMS_ROUND.present.label,
    words: DIAGRAM_WORDS.present,
    markers: 2,
    /* under the buttons, in the band's head */
    within: '.ts-band-head',
    after: '.ts-buttons',
  },
  {
    band: 'export',
    id: 'd-export',
    label: DIAGRAMS_ROUND.export.label,
    words: DIAGRAM_WORDS.export,
    markers: 2,
    /* at the head of the column beside the Download dialog, over the reading (finishing round 2) */
    within: '.ts-export-facts',
    after: null,
  },
  {
    band: 'agents',
    id: 'd-agents',
    label: DIAGRAMS_ROUND.agents.label,
    words: DIAGRAM_WORDS.agents,
    markers: 4,
    /* under Version history, in the column beside the console (finishing round 2) */
    within: '.ts-agents-right',
    after: '.ts-home-vh',
  },
] as const;

async function diagramsFlows(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  // the symbols in the sprite: the labels, the markers, the tokens, no arrowheads
  {
    const { context, page } = await homeContext(browser, DESKTOP, 'light');
    try {
      const response = await page.request.get(HOME_SPRITE);
      const text = await response.text();
      if (response.status() !== 200) failures.push(`${HOME_SPRITE} answered ${response.status()}`);
      for (const flow of FLOWS) {
        const at = text.indexOf(`<symbol id="${flow.id}"`);
        const body = at < 0 ? '' : text.slice(at, text.indexOf('</symbol>', at));
        if (body === '') {
          failures.push(`${HOME_SPRITE} has no ${flow.id}`);
          continue;
        }
        const texts = [...body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
        for (const word of Object.values(flow.words))
          if (!texts.includes(word)) failures.push(`${flow.id}: no label "${word}"`);
        const markers = (body.match(/width="11" height="11"/g) ?? []).length;
        if (markers !== flow.markers) failures.push(`${flow.id}: ${markers} markers`);
        if (/<marker|marker-end|<polygon/.test(body)) failures.push(`${flow.id}: an arrowhead`);
        if (/#[0-9a-f]{3,6}\b|rgb\(/i.test(body.replace(/href="[^"]*"/g, '')))
          failures.push(`${flow.id}: a colour outside the tokens`);
        if (!/rx="8"/.test(body)) failures.push(`${flow.id}: no window at the 8 px corner`);
      }
      notes.push(`${HOME_SPRITE}: ${text.length} B`);
    } finally {
      await context.close();
    }
  }
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        for (const flow of FLOWS) {
          const band = page.locator(`[data-band="${flow.band}"]`);
          await band.scrollIntoViewIfNeeded();
          const svg = band.locator('svg.ts-diagram');
          if ((await svg.count()) !== 1) {
            failures.push(`${label}: ${flow.band} holds ${await svg.count()} diagrams`);
            continue;
          }
          const read = await svg.evaluate(
            (el, place) => ({
              role: el.getAttribute('role'),
              name: el.getAttribute('aria-label'),
              href: el.querySelector('use')?.getAttribute('href') ?? '',
              width: el.getBoundingClientRect().width,
              font: getComputedStyle(el).fontFamily,
              placed:
                el.parentElement?.matches(place.within) === true &&
                (place.after === null
                  ? el.previousElementSibling === null
                  : el.previousElementSibling?.matches(place.after) === true),
            }),
            { within: flow.within, after: flow.after },
          );
          if (!read.placed)
            failures.push(
              `${label}: ${flow.band}'s diagram is not in ${flow.within}${flow.after ? ` after ${flow.after}` : ' first'}`,
            );
          if (read.role !== 'img' || read.name !== flow.label)
            failures.push(`${label}: ${flow.band}'s diagram is ${read.role} "${read.name}"`);
          if (read.href !== `${HOME_SPRITE}#${flow.id}`)
            failures.push(`${label}: ${flow.band}'s diagram uses ${read.href}`);
          if (read.width < 200)
            failures.push(`${label}: ${flow.band}'s diagram is ${read.width} px`);
          if (!/^"?Inter/.test(read.font)) failures.push(`${label}: the labels' face ${read.font}`);
          // the symbol drew: the use's box holds the flow
          const drawn = await page
            .waitForFunction(
              (sel) => {
                const use = document.querySelector<SVGGraphicsElement>(sel);
                return use !== null && use.getBBox().width > 100;
              },
              `[data-band="${flow.band}"] svg.ts-diagram use`,
              { timeout: 15_000 },
            )
            .then(() => true)
            .catch(() => false);
          if (!drawn) failures.push(`${label}: ${flow.band}'s diagram drew nothing`);
        }
        // the Present band's buttons: the play glyph and the key chips, the printer glyph
        const buttons = await page.evaluate(() => {
          const present = document.querySelector('[data-band="present"] [data-present]');
          const print = document.querySelector('[data-band="present"] [data-print]');
          return {
            play: present?.querySelector('.ts-icon[data-icon="play"]') !== null,
            keys: present?.querySelectorAll('.ts-present-keys > kbd').length ?? 0,
            printer: print?.querySelector('.ts-icon[data-icon="printer"]') !== null,
          };
        });
        if (!buttons.play || buttons.keys < 2 || !buttons.printer)
          failures.push(`${label}: the Present band's buttons ${JSON.stringify(buttons)}`);
        notes.push(`${label}: ${FLOWS.length} diagrams drawn`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'diagrams', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.present.figure (DESIGN.md 8.0 "Figures", 8.10)

async function presentFigure(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const files = HOME_ASSETS.filter((a) => a.role === 'presenter');
  if (files.length !== 4) failures.push(`assets.json lists ${files.length} presenter files`);
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      const asked: string[] = [];
      page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (path.startsWith('/home/presenter-')) asked.push(path);
      });
      try {
        await openHome(page);
        if (asked.length > 0) failures.push(`${label}: ${asked.join(', ')} requested at the top`);
        const figure = page.locator('[data-band="present"] figure[data-figure="presenter"]');
        await figure.scrollIntoViewIfNeeded();
        const img = figure.locator(`img.ts-only-${theme}`);
        await page
          .waitForFunction(
            (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
            await img.elementHandle(),
            { timeout: 30_000 },
          )
          .catch(() => failures.push(`${label}: the presenter view did not decode`));
        const read = await figure.evaluate((el, t) => {
          const frame = el.querySelector('.pt-window');
          const shown = el.querySelector<HTMLImageElement>(`img.ts-only-${t}`);
          const box = shown?.getBoundingClientRect();
          const framed = frame?.getBoundingClientRect();
          return {
            /* the frame's width over its height: 1024 by 544, the capture's top 544 rows */
            frameRatio:
              framed === undefined || framed.height === 0 ? 0 : framed.width / framed.height,
            radius: frame === null ? '' : getComputedStyle(frame).borderTopLeftRadius,
            src: shown === null ? '' : new URL(shown.currentSrc || shown.src).pathname,
            natural: shown?.naturalWidth ?? 0,
            attrs: [shown?.getAttribute('width'), shown?.getAttribute('height')],
            ratio: box === undefined || box.height === 0 ? 0 : box.width / box.height,
            width: box?.width ?? 0,
            alt: shown?.alt ?? '',
            caption: el.querySelector('figcaption')?.textContent ?? '',
          };
        }, theme);
        const shownFile = files.find((f) => f.path === read.src);
        if (shownFile === undefined || shownFile.appearance !== theme)
          failures.push(`${label}: the figure shows ${read.src}`);
        if (read.radius !== '8px') failures.push(`${label}: the frame's corner ${read.radius}`);
        if (read.natural === 0) failures.push(`${label}: natural width 0`);
        if (read.attrs[0] !== '1024' || read.attrs[1] !== '640')
          failures.push(`${label}: width and height ${read.attrs.join(' by ')}`);
        if (Math.abs(read.ratio - 1.6) > 0.02) failures.push(`${label}: ratio ${read.ratio}`);
        /* restated in the design round's finishing round 2 (DESIGN.md 8.10): the frame crops the
           capture's empty foot under the previous and next slides */
        if (Math.abs(read.frameRatio - 1024 / 544) > 0.02)
          failures.push(
            `${label}: the frame's ratio ${read.frameRatio.toFixed(3)}, not 1024 by 544`,
          );
        if (read.alt !== FIGURES_ROUND.presenter.alt) failures.push(`${label}: alt "${read.alt}"`);
        if (read.caption !== FIGURES_ROUND.presenter.caption)
          failures.push(`${label}: caption "${read.caption}"`);
        const other = theme === 'light' ? 'dark' : 'light';
        const twins = asked.filter((p) => p.startsWith(`/home/presenter-${other}-`));
        if (twins.length > 0) failures.push(`${label}: the hidden twin ${twins.join(', ')}`);
        const answer = await page.request.get(read.src, { headers: extraHTTPHeaders });
        if (answer.status() !== 200) failures.push(`${label}: ${read.src} ${answer.status()}`);
        notes.push(`${label}: ${read.src} at ${Math.round(read.width)} px, ${read.radius} frame`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'figure', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.export.dialog (DESIGN.md 8.0 "Figures", 8.11)

async function exportDialog(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const files = HOME_ASSETS.filter((a) => a.role === 'download-dialog');
  if (files.length !== 4) failures.push(`assets.json lists ${files.length} Download dialog files`);
  const sentence = EXPORT.rows.perfect.sentence(
    { width: HOME_EXPORT_FACTS.perfectWidth, height: HOME_EXPORT_FACTS.perfectHeight },
    HOME_FACTS,
  );
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      const asked: string[] = [];
      page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (path.startsWith('/home/download-dialog-')) asked.push(path);
      });
      try {
        await openHome(page);
        if (asked.length > 0) failures.push(`${label}: ${asked.join(', ')} requested at the top`);
        const figure = page.locator('[data-band="export"] figure[data-figure="download"]');
        await figure.scrollIntoViewIfNeeded();
        await page
          .waitForFunction(
            (t) => {
              const img = document.querySelector<HTMLImageElement>(
                `[data-band="export"] figure[data-figure="download"] img.ts-only-${t}`,
              );
              return img !== null && img.complete && img.naturalWidth > 0;
            },
            theme,
            { timeout: 30_000 },
          )
          .catch(() => failures.push(`${label}: the Download dialog did not decode`));
        const read = await page.evaluate((t) => {
          const band = document.querySelector('[data-band="export"]')!;
          const img = band.querySelector<HTMLImageElement>(
            `figure[data-figure="download"] img.ts-only-${t}`,
          );
          const glyph = band.querySelector<HTMLElement>('.ts-export-readout > .ts-icon');
          const probe = document.createElement('i');
          probe.style.color = 'var(--pt-status-done)';
          band.append(probe);
          const done = getComputedStyle(probe).color;
          probe.remove();
          return {
            src: img === null ? '' : new URL(img.currentSrc || img.src).pathname,
            natural: img?.naturalWidth ?? 0,
            attrs: [img?.getAttribute('width'), img?.getAttribute('height')],
            alt: img?.alt ?? '',
            readout: band.querySelector('.ts-export-readout')?.textContent ?? '',
            glyph: glyph?.dataset['icon'] ?? '',
            glyphColour: glyph === null ? '' : getComputedStyle(glyph).backgroundColor,
            done,
            pdf: band.querySelectorAll('a[data-pdf][download]').length,
            record: band.querySelectorAll('[data-control="home.export.record"]').length,
            labels: [...band.querySelectorAll('.ts-seam-label')].map(
              (el) => el.querySelector<HTMLElement>('.ts-icon')?.dataset['icon'] ?? '',
            ),
            rows: band.querySelectorAll('.ts-row').length,
          };
        }, theme);
        const shown = files.find((f) => f.path === read.src);
        if (shown === undefined || shown.appearance !== theme)
          failures.push(`${label}: the figure shows ${read.src}`);
        const x1 = files.find((f) => f.appearance === theme && f.variant === 'x1');
        if (read.attrs[0] !== String(x1?.width) || read.attrs[1] !== String(x1?.height))
          failures.push(`${label}: width and height ${read.attrs.join(' by ')}`);
        if (read.natural === 0) failures.push(`${label}: natural width 0`);
        if (read.alt !== FIGURES_ROUND.download.alt) failures.push(`${label}: alt "${read.alt}"`);
        if (!read.readout.includes(sentence))
          failures.push(`${label}: the readout "${read.readout}"`);
        if (read.glyph !== 'check-circle' || read.glyphColour !== read.done)
          failures.push(`${label}: the readout's glyph ${read.glyph} in ${read.glyphColour}`);
        if (read.pdf !== 1 || read.record !== 1)
          failures.push(`${label}: ${read.pdf} PDF links, ${read.record} record links`);
        if (read.labels.join(' ') !== 'photo document')
          failures.push(`${label}: the seam's labels draw ${read.labels.join(', ')}`);
        if (read.rows !== 0) failures.push(`${label}: ${read.rows} ruled rows left`);
        const other = theme === 'light' ? 'dark' : 'light';
        const twins = asked.filter((p) => p.startsWith(`/home/download-dialog-${other}-`));
        if (twins.length > 0) failures.push(`${label}: the hidden twin ${twins.join(', ')}`);
        const answer = await page.request.get(read.src, { headers: extraHTTPHeaders });
        if (answer.status() !== 200) failures.push(`${label}: ${read.src} ${answer.status()}`);
        notes.push(`${label}: ${read.src}, the readout's glyph in ${read.glyphColour}`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'dialog', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.hero.font-swap (DESIGN.md 8.2; the design round's pass 3 finding 3)

/** The hero's boxes and its words' lines, read from the page as it is painted. */
async function heroBoxes(page: Page) {
  return page.evaluate(() => {
    const at = (el: Element | null) => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10);
    };
    /* the words on each line of an element's first text run, as counts: "6,7,6,4" */
    const lines = (el: Element | null): string => {
      const text =
        el === null ? null : document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      if (text === null || text === undefined) return '';
      const data = text.textContent ?? '';
      const tops: number[] = [];
      for (const m of data.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(text, m.index);
        range.setEnd(text, m.index + m[0].length);
        tops.push(Math.round(range.getClientRects()[0]?.top ?? -1));
      }
      const counts: number[] = [];
      tops.forEach((top, i) => {
        if (i === 0 || top !== tops[i - 1]) counts.push(1);
        else counts[counts.length - 1]! += 1;
      });
      return counts.join(',');
    };
    const h1 = document.querySelector('h1#ts-product-h1');
    return {
      face: [...document.fonts].some((f) => f.family === 'Inter' && f.status === 'loaded'),
      h1: at(h1)?.slice(1),
      h1Lines: [...document.querySelectorAll('.ts-h1-line')].map(lines).join(' / '),
      lead: at(document.querySelector('.ts-hero-lead'))?.slice(1),
      leadLines: lines(document.querySelector('.ts-hero-lead')),
      side: at(document.querySelector('.ts-hero-side'))?.slice(1),
      /* where each button starts and its height: the last one's width may differ by face */
      buttons: [...document.querySelectorAll('.ts-hero-side .ts-button')].map((el) => {
        const b = at(el);
        return b === null ? null : [b[0], b[1], b[3]];
      }),
      stage: at(document.querySelector('[data-hero-stage]'))?.slice(1, 2),
    };
  });
}

/**
 * With Inter blocked the hero paints in 'Inter Fallback'; with Inter it paints in Inter. Every
 * box of the hero (the h1, the lead, the side, the two buttons, the stage's top) and every line
 * break of the h1 and of the lead must be the same in both, for each of the three visit sentences,
 * at 1440, 390 and 320 px: then nothing moves when Inter arrives after the first paint. A second
 * reading answers Inter 2.5 s late and reads no layout shift in the first screen.
 */
async function fontSwap(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const sizes: Size[] = [DESKTOP, PHONE, { width: 320, height: 640 }];
  for (const size of sizes)
    for (const visit of [0, 1, 2]) {
      const reads: Awaited<ReturnType<typeof heroBoxes>>[] = [];
      for (const block of [true, false]) {
        const { context, page } = await homeContext(browser, size, 'light');
        try {
          await context.addInitScript((v) => {
            try {
              localStorage.setItem('ts-home-visit', String(v));
            } catch {
              /* private mode */
            }
          }, visit);
          /* the face's files alone: the dev server also answers module imports of the woff2 */
          if (block)
            await context.route(/\.woff2(\?|$)/, (route) =>
              route.request().resourceType() === 'font' ? route.abort() : route.continue(),
            );
          const response = await page.goto('/home');
          expect(response?.status(), '/home answers 200').toBe(200);
          await page.locator('main#top[data-hydrated]').waitFor({ timeout: 60_000 });
          await page.evaluate(() => document.fonts.ready);
          reads.push(await heroBoxes(page));
        } finally {
          await context.close();
        }
      }
      const [fallback, inter] = reads;
      const label = `${size.width} visit ${visit + 1}`;
      if (fallback === undefined || inter === undefined) continue;
      if (fallback.face || !inter.face)
        failures.push(`${label}: Inter loaded ${fallback.face} blocked and ${inter.face} answered`);
      for (const key of ['h1', 'h1Lines', 'lead', 'leadLines', 'side', 'buttons', 'stage'] as const)
        if (JSON.stringify(fallback[key]) !== JSON.stringify(inter[key]))
          failures.push(
            `${label}: ${key} ${JSON.stringify(fallback[key])} in the fallback, ${JSON.stringify(inter[key])} in Inter`,
          );
      notes.push(
        `${label}: h1 ${inter.h1Lines} (${inter.h1?.join(' ')}), lead ${inter.leadLines}, stage at ${inter.stage?.join('')}`,
      );
    }
  /* Inter answered 2.5 s late: no layout shift in the first screen when it arrives */
  for (const size of [DESKTOP, PHONE]) {
    const { context, page } = await homeContext(browser, size, 'light');
    try {
      await context.route(/\.woff2(\?|$)/, async (route) => {
        if (route.request().resourceType() === 'font')
          await new Promise((done) => setTimeout(done, 2500));
        await route.continue().catch(() => undefined);
      });
      await context.addInitScript(() => {
        const w = window as unknown as { __shifts: string[] };
        w.__shifts = [];
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & {
              value?: number;
              hadRecentInput?: boolean;
              sources?: { node?: Node | null }[];
            })[])
              if (!e.hadRecentInput)
                w.__shifts.push(
                  `${(e.value ?? 0).toFixed(6)} at ${Math.round(e.startTime)} ms on ${(
                    e.sources ?? []
                  )
                    .map((src) => {
                      const el = src.node instanceof Element ? src.node : src.node?.parentElement;
                      return el
                        ? `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`
                        : '?';
                    })
                    .join(' ')}`,
                );
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {
          /* no layout shift entries */
        }
      });
      await page.goto('/home');
      await page.locator('main#top[data-hydrated]').waitFor({ timeout: 60_000 });
      await page.waitForFunction(
        () => [...document.fonts].some((f) => f.family === 'Inter' && f.status === 'loaded'),
        undefined,
        { timeout: 60_000 },
      );
      await page.waitForTimeout(1500);
      const shifts = await page.evaluate(
        () => (window as unknown as { __shifts: string[] }).__shifts,
      );
      notes.push(
        `${size.width}: Inter after 2.5 s, ${shifts.length} shifts${shifts.length > 0 ? ` (${shifts.join('; ')})` : ''}`,
      );
      if (shifts.length > 0)
        failures.push(`${size.width}: Inter after 2.5 s moved ${shifts.join('; ')}`);
    } finally {
      await context.close();
    }
  }
  test.info().annotations.push({ type: 'font-swap', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.kits.colors (DESIGN.md 8.7; the design round's pass 3 finding 6)

/** The Colors row as drawn, and the six tokens of the grid's first slide as the renderer set them. */
async function readColors(page: Page) {
  return page.evaluate(() => {
    const band = document.querySelector('[data-band="kits"]')!;
    /* a text's own box, which runs past its element's box when the element is too narrow */
    const textBox = (node: Node | null): { left: number; right: number } => {
      if (node === null) return { left: 0, right: 0 };
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right };
    };
    const rows = [...band.querySelectorAll<HTMLElement>('[data-kit-roles] > li')].map((li) => {
      const swatch = li.querySelector('i');
      const code = li.querySelector<HTMLElement>('.pt-num');
      const label = [...li.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
      const cell = li.getBoundingClientRect();
      return {
        name: label
          .map((n) => n.textContent)
          .join('')
          .trim(),
        hex: (code?.textContent ?? '').trim(),
        num: code === null ? '' : getComputedStyle(code).fontVariantNumeric,
        paint: swatch === null ? '' : getComputedStyle(swatch).backgroundColor,
        h: Math.round(li.getBoundingClientRect().height),
        cell: { left: cell.left, right: cell.right },
        label: textBox(label[0] ?? null),
        value: textBox(code),
      };
    });
    const slide = band.querySelector<HTMLElement>('[data-kit-grid] [data-home-slides]');
    const style = slide === null ? null : getComputedStyle(slide);
    /* the build's minifier may write a token in three digits (#fff): read in six */
    const tokens = ['ink', 'paper', 'ink-2', 'titanium', 'blue', 'accent'].map((t) =>
      (style?.getPropertyValue(`--${t}`) ?? '')
        .trim()
        .toLowerCase()
        .replace(/^#(\w)(\w)(\w)$/, '#$1$1$2$2$3$3'),
    );
    const list = band.querySelector('[data-kit-roles]');
    const listStyle = list === null ? null : getComputedStyle(list);
    return {
      rows,
      tokens,
      ratio: (band.querySelector('[data-kit-ratio]')?.textContent ?? '').trim(),
      ratioNum: getComputedStyle(band.querySelector('[data-kit-ratio]')!).fontVariantNumeric,
      listHeight: list === null ? 0 : Math.round(list.getBoundingClientRect().height),
      listWidth: list === null ? 0 : list.getBoundingClientRect().width,
      /* the height the list holds before the kits chunk writes it */
      listReserved: listStyle === null ? 0 : Math.round(parseFloat(listStyle.minHeight)),
      columns: listStyle === null ? 0 : listStyle.gridTemplateColumns.split(' ').length,
      window: document.documentElement.clientWidth,
    };
  });
}

/** The WCAG ratio of two #rrggbb colours, floored to a tenth as the page reads it. */
function floorRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [x, y] = [lum(a) + 0.05, lum(b) + 0.05];
  return Math.floor((Math.max(x, y) / Math.min(x, y)) * 10) / 10;
}

const rgbOf = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** The kits band's Colors row at 1280 and 320 besides SIZES: the widths the row's cells change at. */
const COLOR_SIZES: readonly Size[] = [
  DESKTOP,
  { width: 1280, height: 800 },
  PHONE,
  { width: 320, height: 700 },
];

/** The columns of the Colors row for the list's width (editing.css: a cell takes 168 px). */
const colorColumns = (width: number): number => (width >= 536 ? 3 : width >= 352 ? 2 : 1);

/**
 * The kits band at rest lists the kit's six colours as the Brand kit panel names them, each a
 * swatch painted in its hex value, which is the token the grid's slides draw, in tabular figures
 * with the slashed zero, and the contrast of the text on the background; Kestrel, a typed
 * background and the Swiss theme each change them to the colours the slides then draw. Each
 * value's text sits inside its cell, after its label, and inside the window, at 1440, 1280, 390
 * and 320 in both appearances, at rest and on each of the nine themes (the design round's pass 4
 * finding 2: "#070707" ran under the next swatch at 1440 and past the window at 320).
 */
async function kitsColors(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const check = (label: string, read: Awaited<ReturnType<typeof readColors>>): void => {
    const names = read.rows.map((r) => r.name);
    if (JSON.stringify(names) !== JSON.stringify(KITS_ROUND.roles))
      failures.push(`${label}: the roles read ${names.join(', ')}`);
    read.rows.forEach((row, i) => {
      if (row.hex !== read.tokens[i])
        failures.push(`${label}: ${row.name} reads ${row.hex}, the slides draw ${read.tokens[i]}`);
      if (!/^#[0-9a-f]{6}$/.test(row.hex))
        failures.push(`${label}: ${row.name} reads "${row.hex}"`);
      else if (row.paint !== rgbOf(row.hex))
        failures.push(`${label}: ${row.name}'s swatch paints ${row.paint} for ${row.hex}`);
      if (!row.num.includes('tabular-nums') || !row.num.includes('slashed-zero'))
        failures.push(`${label}: ${row.name}'s value in ${row.num}`);
    });
    const [text = '', paper = ''] = read.tokens;
    const want = KITS_ROUND.ratio(floorRatio(text, paper));
    if (read.ratio !== want) failures.push(`${label}: the readout "${read.ratio}", not "${want}"`);
    if (!read.ratioNum.includes('tabular-nums'))
      failures.push(`${label}: the readout in ${read.ratioNum}`);
    /* every value fits its cell: its text ends inside the cell and the window, after its label */
    const px = (n: number): string => n.toFixed(1);
    for (const row of read.rows) {
      if (row.value.right > row.cell.right + 0.5)
        failures.push(
          `${label}: ${row.name} ${row.hex} ends at ${px(row.value.right)}, its cell at ${px(row.cell.right)}`,
        );
      if (row.value.right > read.window + 0.5)
        failures.push(
          `${label}: ${row.name} ${row.hex} ends at ${px(row.value.right)}, past the window`,
        );
      if (row.label.right > row.value.left - 4)
        failures.push(
          `${label}: ${row.name} ends at ${px(row.label.right)}, its value starts at ${px(row.value.left)}`,
        );
    }
    /* the columns follow the list's width, and the rows fill the height the list holds before the
       chunk writes them, so nothing under them moves */
    const columns = colorColumns(read.listWidth);
    if (read.columns !== columns)
      failures.push(
        `${label}: ${read.columns} columns in ${px(read.listWidth)} px, not ${columns}`,
      );
    const lines = Math.ceil(read.rows.length / Math.max(1, read.columns));
    if (Math.abs(read.listHeight - (lines * 20 + (lines - 1) * 6)) > 1)
      failures.push(`${label}: the list is ${read.listHeight} px for ${lines} rows`);
    if (read.listReserved !== read.listHeight)
      failures.push(
        `${label}: the list holds ${read.listReserved} px and draws ${read.listHeight}`,
      );
  };
  for (const size of COLOR_SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await bandReady(page, 'kits');
        const band = page.locator('[data-band="kits"]');
        await page.waitForFunction(
          () => document.querySelectorAll('[data-band="kits"] [data-kit-roles] > li').length === 6,
          undefined,
          { timeout: 30_000 },
        );
        const rest = await readColors(page);
        check(`${label} at rest`, rest);
        const room = Math.min(...rest.rows.map((r) => r.cell.right - r.value.right));
        notes.push(
          `${label}: ${rest.columns} column${rest.columns === 1 ? '' : 's'}, ${rest.listHeight} px, ${room.toFixed(1)} px of room; ${rest.rows.map((r) => `${r.name} ${r.hex}`).join(', ')}; ${rest.ratio}`,
        );
        if (size.width === DESKTOP.width) {
          await band.locator('[data-kit="kestrel"]').click();
          await page.waitForTimeout(800);
          const kestrel = await readColors(page);
          check(`${label} Kestrel`, kestrel);
          if (kestrel.rows[1]?.hex !== '#f3efe6')
            failures.push(`${label}: Kestrel's background reads ${kestrel.rows[1]?.hex}`);
          const field = band.locator('[data-kit-color]');
          await field.fill('#e6e0d2');
          await page.waitForTimeout(300);
          const typed = await readColors(page);
          check(`${label} typed`, typed);
          if (typed.rows[1]?.hex !== '#e6e0d2')
            failures.push(`${label}: a typed background reads ${typed.rows[1]?.hex}`);
          await field.press('Escape');
          await band.locator('[data-kit="gt"]').click();
          await page.waitForTimeout(800);
          await band.locator('[data-theme-id="swiss"]').click();
          await page.waitForFunction(
            () => document.querySelector('style[data-home-theme="swiss"]') !== null,
            undefined,
            { timeout: 30_000 },
          );
          await page.waitForTimeout(300);
          const swiss = await readColors(page);
          check(`${label} Swiss`, swiss);
          if (swiss.rows[4]?.hex === rest.rows[4]?.hex)
            failures.push(`${label}: Swiss's primary reads the sheet's ${swiss.rows[4]?.hex}`);
          notes.push(
            `${label}: Kestrel ${kestrel.ratio}; typed ${typed.rows[1]?.hex}; Swiss ${swiss.rows.map((r) => r.hex).join(' ')}`,
          );
        }
        /* each of the nine themes: its six values in their cells */
        const tiles = await band
          .locator('[data-theme-id]')
          .evaluateAll((all) => all.map((t) => (t as HTMLElement).dataset['themeId'] ?? ''));
        let least = Infinity;
        for (const id of tiles) {
          await band.locator(`[data-theme-id="${id}"]`).click();
          /* a press applies the theme's sheet, then marks its tile pressed */
          await band
            .locator(`[data-theme-id="${id}"][aria-pressed="true"]`)
            .waitFor({ timeout: 30_000 });
          await page.waitForTimeout(250);
          const read = await readColors(page);
          check(`${label} ${id}`, read);
          least = Math.min(least, ...read.rows.map((r) => r.cell.right - r.value.right));
        }
        notes.push(`${label}: ${tiles.length} themes, the least room ${least.toFixed(1)} px`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'colors', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.patterns.stills (DESIGN.md 8.12)

async function patternsStills(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const cards = HOME_ASSETS.filter((a) => a.role === 'pattern-card');
  if (cards.length !== 17) failures.push(`assets.json lists ${cards.length} pattern cards`);
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      const asked = new Map<string, number>();
      page.on('response', (r) => {
        const path = new URL(r.url()).pathname;
        if (path.startsWith('/home/pattern-card-')) asked.set(path, r.status());
      });
      try {
        await openHome(page);
        await page.evaluate(() => {
          (window as unknown as { __cls: number }).__cls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as {
              value: number;
              hadRecentInput: boolean;
            }[])
              if (!entry.hadRecentInput)
                (window as unknown as { __cls: number }).__cls += entry.value;
          }).observe({ type: 'layout-shift' });
        });
        if (asked.size > 0) failures.push(`${label}: ${asked.size} cards requested at the top`);
        const list = page.locator('[data-band="patterns"] .ts-pattern-cards');
        await list.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        /* a sideways row loads the cards it shows; its end brings in the rest */
        await list.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
        await page.waitForTimeout(800);
        await list.evaluate((el) => el.scrollTo({ left: 0 }));
        await page
          .waitForFunction(
            () =>
              [...document.querySelectorAll<HTMLImageElement>('.ts-pattern-card > img')].every(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            undefined,
            { timeout: 30_000 },
          )
          .catch(() => failures.push(`${label}: a card did not decode`));
        const read = await list.evaluate((el) => {
          const items = [...el.querySelectorAll('.ts-pattern-card')];
          return {
            names: items.map((li) => li.querySelector('.ts-pattern-card-name')?.textContent ?? ''),
            paths: items.map((li) => li.querySelector('img')?.getAttribute('src') ?? ''),
            sized: items.every((li) => {
              const img = li.querySelector('img');
              return img?.getAttribute('width') === '320' && img.getAttribute('height') === '200';
            }),
            tops: [...new Set(items.map((li) => Math.round(li.getBoundingClientRect().top)))]
              .length,
            scrolls: el.scrollWidth > el.clientWidth + 1,
            overflow: getComputedStyle(el).overflowX,
            crumbs:
              el.parentElement?.querySelector('.ts-crumbs')?.textContent?.replace(/\s+/g, ' ') ??
              '',
          };
        });
        const names = HOME_PATTERN_CARDS.map((card) => card.name);
        if (JSON.stringify(read.names) !== JSON.stringify(names))
          failures.push(`${label}: the names ${read.names.join(', ')}`);
        if (JSON.stringify(read.paths) !== JSON.stringify(cards.map((c) => c.path)))
          failures.push(`${label}: the cards are not assets.json's in its order`);
        if (!read.sized) failures.push(`${label}: a card's img without width and height`);
        if (read.crumbs.replace(/\s/g, '') !== 'InsertAnimatedpattern')
          failures.push(`${label}: the crumbs read "${read.crumbs}"`);
        if (size.width >= 1024 && read.tops !== 2)
          failures.push(`${label}: ${read.tops} rows of cards (nine to a row is 2)`);
        if (size.width < 720 && (read.tops !== 1 || !read.scrolls || read.overflow !== 'auto'))
          failures.push(
            `${label}: ${read.tops} rows, scrolls ${read.scrolls}, overflow ${read.overflow}`,
          );
        for (const [path, status] of asked)
          if (status !== 200) failures.push(`${label}: ${path} answered ${status}`);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        if (cls > 0) failures.push(`${label}: CLS ${cls} while the cards loaded`);
        notes.push(
          `${label}: ${read.names.length} cards in ${read.tops} rows, ${asked.size} requested, CLS ${cls}`,
        );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'stills', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.people.share-dialog

async function shareDialog(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const W = PEOPLE_ROUND.share;
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
          origin: new URL(page.url()).origin,
        });
        await bandReady(page, 'people');
        const band = page.locator('[data-band="people"]');
        await band.locator('[data-share] .ts-share-title').waitFor({ timeout: 30_000 });
        const read = await band.evaluate((root) => {
          const box = root.querySelector<HTMLElement>('[data-share]')!;
          const text = (el: Element | null) => (el?.textContent ?? '').trim();
          const glyphs = [...box.querySelectorAll<HTMLElement>('.ts-icon')].map((el) => ({
            name: el.dataset['icon'] ?? '',
            mask: getComputedStyle(el).maskImage !== 'none',
            w: Math.round(el.getBoundingClientRect().width),
          }));
          const screens = [...root.querySelectorAll<HTMLElement>('.ts-people-screen')];
          const b = box.getBoundingClientRect();
          const s = screens[0]?.getBoundingClientRect();
          return {
            radius: getComputedStyle(box).borderTopLeftRadius,
            screenRadii: screens.map((el) => getComputedStyle(el).borderTopLeftRadius),
            title: text(box.querySelector('.ts-share-title')),
            label: text(box.querySelector('.ts-share-label')),
            access: text(box.querySelector('.ts-share-access')),
            field: box.querySelector<HTMLInputElement>('.ts-share-field')?.value ?? '',
            copy: text(box.querySelector('.ts-share-copy')),
            people: [...box.querySelectorAll('.ts-share-person')].map((li) => ({
              name: text(li.querySelector('.ts-share-name')),
              sub: text(li.querySelector('.ts-share-sub')),
              role: text(li.querySelector('.ts-share-role')),
            })),
            done: text(box.querySelector('.ts-share-done')),
            glyphs,
            beside: s === undefined ? null : b.right <= s.left + 1,
            above: s === undefined ? null : b.bottom <= s.top + 1,
          };
        });
        notes.push(
          `${label}: "${read.title}", ${read.people.map((p) => `${p.name} ${p.role}${p.sub === '' ? '' : ` (${p.sub})`}`).join(', ')}; field ${read.field}`,
        );
        if (read.radius !== '8px') failures.push(`${label}: the dialog's corner is ${read.radius}`);
        if (read.screenRadii.length !== 2 || read.screenRadii.some((r) => r !== '8px'))
          failures.push(`${label}: the screens' corners ${read.screenRadii.join(', ')}`);
        if (read.title !== W.title(HOME_DECK.title))
          failures.push(`${label}: the title "${read.title}"`);
        if (read.label !== W.generalAccess) failures.push(`${label}: the label "${read.label}"`);
        for (const words of [W.anyoneWithLink, W.anyoneCanEdit, W.roles.editor])
          if (!read.access.includes(words))
            failures.push(`${label}: the access row lacks "${words}"`);
        if (read.field !== new URL('/home', page.url()).href)
          failures.push(`${label}: the link field reads ${read.field}`);
        if (read.copy !== W.copyLink) failures.push(`${label}: Copy Link reads "${read.copy}"`);
        const want = [
          [W.you, W.roles.owner],
          ['Maya', W.roles.editor],
          ['Sam', W.roles.editor],
        ];
        if (JSON.stringify(read.people.map((p) => [p.name, p.role])) !== JSON.stringify(want))
          failures.push(`${label}: the people ${JSON.stringify(read.people)}`);
        for (const p of read.people.slice(1))
          if (!/^Editing slide \d+$/.test(p.sub))
            failures.push(`${label}: ${p.name}'s slide "${p.sub}"`);
        if (read.done !== W.done) failures.push(`${label}: Done reads "${read.done}"`);
        if (read.glyphs.some((g) => !g.mask || g.w === 0))
          failures.push(`${label}: a glyph draws no mask (${JSON.stringify(read.glyphs)})`);
        if (size.width >= 720 ? read.beside !== true : read.above !== true)
          failures.push(`${label}: the dialog beside ${read.beside}, above ${read.above}`);
        /* Copy Link writes the page's link */
        await band.locator('.ts-share-copy').click();
        await expect(band.locator('.ts-share-copy')).toHaveText(W.linkCopied);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        if (clip !== new URL('/home', page.url()).href)
          failures.push(`${label}: the clipboard holds "${clip}"`);
        /* Done says what it does in the editor */
        await band.locator('.ts-share-done').click();
        await expect(band.locator('.ts-share-note')).toHaveText(W.doneSays);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'share', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.agents.history-panel

/** The chips' glyphs in their order (DESIGN.md 8.8). */
const CHIP_GLYPHS = ['command-line', 'arrow-path', 'pencil', 'eye-slash'] as const;

async function historyPanel(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await bandReady(page, 'agents');
        const band = page.locator('[data-band="agents"]');
        await band.locator('.ts-versions-thumb').waitFor({ timeout: 30_000 });
        const read = () =>
          band.evaluate((root) => {
            const glyph = (el: Element | null) =>
              el instanceof HTMLElement
                ? {
                    name: el.dataset['icon'] ?? '',
                    mask: getComputedStyle(el).maskImage !== 'none',
                    w: Math.round(el.getBoundingClientRect().width),
                  }
                : null;
            const panel = root.querySelector<HTMLElement>('.ts-home-vh')!;
            const restore = root.querySelector<HTMLElement>('[data-version-restore]')!;
            const rows = (group: string) =>
              [
                ...root.querySelectorAll<HTMLElement>(
                  `[data-history-group="${group}"] [data-history-row]`,
                ),
              ].map((li) => {
                const chip = li.querySelector<HTMLElement>('.ts-home-history-icon')!;
                const when = li.querySelector<HTMLElement>('.ts-home-history-time')!;
                return {
                  author: li.querySelector('.ts-home-history-author')?.textContent ?? '',
                  words: li.querySelector('[data-history-words]')?.textContent ?? '',
                  when: when.textContent ?? '',
                  figures: getComputedStyle(when).fontVariantNumeric,
                  current: li.getAttribute('aria-current') === 'true',
                  plate: getComputedStyle(li).backgroundColor,
                  chipRadius: getComputedStyle(chip).borderTopLeftRadius,
                  glyph: glyph(chip.querySelector('.ts-icon')),
                };
              });
            return {
              radius: getComputedStyle(panel).borderTopLeftRadius,
              title: panel.querySelector('.ts-home-vh-title')?.textContent ?? '',
              clock: glyph(panel.querySelector('.ts-home-vh-head .ts-icon')),
              slider: root.querySelector('[role="slider"]') !== null,
              restore: {
                words: restore.textContent?.trim() ?? '',
                disabled: restore.getAttribute('aria-disabled'),
                radius: getComputedStyle(restore).borderTopLeftRadius,
                glyph: glyph(restore.querySelector('.ts-icon')),
              },
              days: [...root.querySelectorAll('.ts-home-history-day')].map(
                (d) => d.textContent ?? '',
              ),
              empty: root.querySelector<HTMLElement>('[data-history-empty]')?.hidden ?? null,
              today: rows('today'),
              recorded: rows('recorded'),
              chips: [...root.querySelectorAll<HTMLElement>('[data-chip]')].map((c) =>
                glyph(c.querySelector('.ts-icon')),
              ),
            };
          });
        const rest = await read();
        notes.push(
          `${label}: ${rest.title}, ${rest.days.join(' / ')}; recorded ${rest.recorded.map((r) => `${r.when} ${r.words}`).join(', ')}; chips ${rest.chips.map((c) => c?.name).join(',')}`,
        );
        if (rest.radius !== '8px') failures.push(`${label}: the panel's corner is ${rest.radius}`);
        if (rest.title !== AGENTS.historyLabel)
          failures.push(`${label}: the head reads ${rest.title}`);
        if (rest.clock?.name !== 'clock' || !rest.clock.mask || rest.clock.w === 0)
          failures.push(`${label}: the head's clock does not draw`);
        if (!rest.slider) failures.push(`${label}: no scrubber`);
        if (
          rest.restore.words !== VERSIONS.restore ||
          rest.restore.disabled !== 'true' ||
          rest.restore.radius !== '6px' ||
          rest.restore.glyph?.name !== 'arrow-uturn-left' ||
          !rest.restore.glyph.mask
        )
          failures.push(`${label}: Restore This Version ${JSON.stringify(rest.restore)}`);
        if (
          JSON.stringify(rest.days) !==
          JSON.stringify([AGENTS_ROUND.history.today, AGENTS_ROUND.history.recorded])
        )
          failures.push(`${label}: the groups read ${rest.days.join(', ')}`);
        if (rest.today.length !== 0 || rest.empty !== false)
          failures.push(
            `${label}: Today at rest holds ${rest.today.length} rows, sentence hidden ${rest.empty}`,
          );
        const wantRecorded = [...HOME_RUN.steps]
          .reverse()
          .map((s) => s.history)
          .concat(HOME_DECK.title);
        if (JSON.stringify(rest.recorded.map((r) => r.words)) !== JSON.stringify(wantRecorded))
          failures.push(
            `${label}: the recorded rows read ${rest.recorded.map((r) => r.words).join(', ')}`,
          );
        rest.recorded.forEach((r, i) => {
          if (r.when !== AGENTS_ROUND.history.version(4 - i) || !r.figures.includes('tabular-nums'))
            failures.push(`${label}: recorded row ${i + 1} reads "${r.when}" in ${r.figures}`);
          if (r.author !== AGENTS.author.agent || r.glyph?.name !== 'command-line' || !r.glyph.mask)
            failures.push(`${label}: recorded row ${i + 1} by ${r.author} with ${r.glyph?.name}`);
          if (r.chipRadius !== '0px')
            failures.push(`${label}: an identity chip at ${r.chipRadius}`);
          if (r.current !== (i === 0))
            failures.push(`${label}: recorded row ${i + 1} current ${r.current}`);
        });
        const plate = rest.recorded[0]?.plate ?? '';
        if (plate === '' || plate === 'rgba(0, 0, 0, 0)')
          failures.push(`${label}: the current row has no plate (${plate})`);
        if (JSON.stringify(rest.chips.map((c) => c?.name)) !== JSON.stringify(CHIP_GLYPHS))
          failures.push(`${label}: the chips draw ${rest.chips.map((c) => c?.name).join(',')}`);
        if (rest.chips.some((c) => c === null || !c.mask || c.w === 0))
          failures.push(`${label}: a chip glyph draws no mask`);
        /* a chip's change enters Today with its time, on the plate */
        await band.locator('[data-chip="turn"]').click();
        await band
          .locator('[data-history-group="today"] [data-history-row]')
          .first()
          .waitFor({ timeout: 30_000 });
        await page.waitForFunction(
          () =>
            document.querySelector('[data-band="agents"] [data-chip][aria-disabled="true"]') ===
            null,
          undefined,
          { timeout: 30_000 },
        );
        const after = await read();
        const row = after.today[0];
        notes.push(`${label}: after Turn the Title, Today ${row?.when} ${row?.words}`);
        if (
          after.today.length !== 1 ||
          row === undefined ||
          !/^\d{1,2}:\d{2}\s?(AM|PM)$/.test(row.when) ||
          !row.figures.includes('tabular-nums') ||
          !row.current ||
          after.empty !== true ||
          after.recorded.some((r) => r.current)
        )
          failures.push(
            `${label}: after a chip, Today ${JSON.stringify(after.today)}, sentence hidden ${after.empty}`,
          );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'history', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// home.kits.themes (DESIGN.md 8.7)

async function kitsThemes(browser: Browser): Promise<void> {
  const failures: string[] = [];
  const notes: string[] = [];
  const swiss = HOME_THEME_TILES.find((t) => t.id === 'swiss');
  if (swiss === undefined) throw new Error('no Swiss tile in theme-tiles.generated.ts');
  for (const size of SIZES)
    for (const theme of THEMES) {
      const { context, page } = await homeContext(browser, size, theme);
      const label = `${size.width} ${theme}`;
      try {
        await openHome(page);
        await fillBands(page);
        const band = page.locator('[data-band="kits"]');
        const tiles = band.locator('[data-theme-id]');
        const rest = await tiles.evaluateAll((els) =>
          els.map((el) => ({
            id: el.getAttribute('data-theme-id') ?? '',
            name: el.textContent?.trim() ?? '',
            pressed: el.getAttribute('aria-pressed'),
            paper: getComputedStyle(el.querySelector('.ts-home-theme-swatch')!).backgroundColor,
          })),
        );
        if (
          JSON.stringify(rest.map((t) => t.name)) !==
          JSON.stringify(HOME_THEME_TILES.map((t) => t.name))
        )
          failures.push(`${label}: the tiles read ${rest.map((t) => t.name).join(', ')}`);
        const pressed = rest.filter((t) => t.pressed === 'true').map((t) => t.id);
        if (pressed.join() !== HOME_THEME_AT_REST)
          failures.push(`${label}: pressed at rest ${pressed.join(', ')}`);
        /* the slides' paper and ink, read from every slide root on the page */
        const slides = () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.ts-product [data-home-slides]')]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => {
                const cs = getComputedStyle(el);
                return {
                  paper: cs.getPropertyValue('--paper').trim().toLowerCase(),
                  ink: cs.getPropertyValue('--ink').trim().toLowerCase(),
                  kit: el.style.getPropertyValue('--paper') !== '',
                };
              }),
          );
        const before = await slides();
        const want = swiss[theme];
        const swissTile = band.locator('[data-theme-id="swiss"]');
        await swissTile.scrollIntoViewIfNeeded();
        const pressedAt = Date.now();
        await swissTile.click();
        await page.waitForTimeout(500);
        const after = (await slides()).filter((s) => !s.kit);
        const off = after.filter((s) => s.paper !== want.paper || s.ink !== want.ink);
        if (after.length < 10 || off.length > 0)
          failures.push(
            `${label}: ${off.length} of ${after.length} slides off Swiss's ${want.paper} and ${want.ink} (${off[0]?.paper} ${off[0]?.ink})`,
          );
        const sheet = await page.evaluate(
          () =>
            document.querySelector<HTMLStyleElement>('style[data-home-theme]')?.dataset[
              'homeTheme'
            ] ?? '',
        );
        if (sheet !== 'swiss') failures.push(`${label}: the theme sheet reads "${sheet}"`);
        const cross = await page.evaluate(() => {
          const el = document.querySelector('.ts-product [data-home-slides] .frame .cross');
          return el === null ? 'none' : getComputedStyle(el).display;
        });
        if (cross !== 'none') failures.push(`${label}: Swiss draws the frame's crosses (${cross})`);
        const status = (await band.locator('[data-kit-status]').textContent())?.trim() ?? '';
        if (status !== KITS_ROUND.status.theme(swiss.name))
          failures.push(`${label}: the status reads "${status}"`);
        if ((await swissTile.getAttribute('aria-pressed')) !== 'true')
          failures.push(`${label}: Swiss is not pressed after its press`);
        /* a kit's colours stay over the theme */
        await band.locator('[data-kit="globex"]').click();
        await page.waitForTimeout(700);
        const kitted = await slides();
        if (kitted.some((s) => s.ink === want.ink && s.paper === want.paper))
          failures.push(`${label}: a slide kept Swiss's colours under the Globex kit`);
        /* the GT kit, then General Translation: the sheet's own colours again */
        await band.locator('[data-kit="gt"]').click();
        await page.waitForTimeout(700);
        await band.locator(`[data-theme-id="${HOME_THEME_AT_REST}"]`).click();
        await page.waitForTimeout(500);
        const back = await slides();
        const changed = back.filter(
          (s, i) => s.paper !== before[i]?.paper || s.ink !== before[i]?.ink,
        );
        if (changed.length > 0)
          failures.push(`${label}: ${changed.length} slides did not return to the sheet's colours`);
        notes.push(
          `${label}: ${rest.length} tiles, Swiss on ${after.length} slides in ${Date.now() - pressedAt} ms with its reads, back to General Translation on ${back.length}`,
        );
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'themes', description: notes.join(' | ') });
  expect(failures).toEqual([]);
}

export function rows(): void {
  if (entered('home.nav.icons'))
    test(title('home.nav.icons'), async ({ browser }) => {
      test.setTimeout(300_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await navIcons(browser);
    });
  if (entered('home.type.default-glyphs'))
    test(title('home.type.default-glyphs'), async ({ browser }) => {
      test.setTimeout(300_000);
      await defaultGlyphs(browser);
    });
  if (entered('home.radius.ladder'))
    test(title('home.radius.ladder'), async ({ browser }) => {
      test.setTimeout(360_000);
      await radiusLadder(browser);
    });
  if (entered('home.scroll.regions'))
    test(title('home.scroll.regions'), async () => {
      test.setTimeout(360_000);
      await scrollRegions();
    });
  if (entered('home.hero.frame-chrome'))
    test(title('home.hero.frame-chrome'), async ({ browser }) => {
      test.setTimeout(240_000);
      await frameChrome(browser);
    });
  if (entered('home.hero.terminal-never-empty'))
    test(title('home.hero.terminal-never-empty'), async ({ browser }) => {
      test.setTimeout(240_000);
      await terminalNeverEmpty(browser);
    });
  if (entered('home.hero.steps'))
    test(title('home.hero.steps'), async ({ browser }) => {
      test.setTimeout(240_000);
      await heroSteps(browser);
    });
  if (entered('home.pictures.all-load'))
    test(title('home.pictures.all-load'), async ({ browser }) => {
      test.setTimeout(420_000);
      await picturesLoad(browser);
    });
  if (entered('home.menus.icons'))
    test(title('home.menus.icons'), async ({ browser }) => {
      test.setTimeout(420_000);
      await menusIcons(browser);
    });
  if (entered('home.canvas.panel'))
    test(title('home.canvas.panel'), async ({ browser }) => {
      test.setTimeout(360_000);
      await canvasPanel(browser);
    });
  if (entered('home.tailor.dialog'))
    test(title('home.tailor.dialog'), async ({ browser }) => {
      test.setTimeout(360_000);
      await tailorDialog(browser);
    });
  if (entered('home.diagrams.flows'))
    test(title('home.diagrams.flows'), async ({ browser }) => {
      test.setTimeout(300_000);
      await diagramsFlows(browser);
    });
  if (entered('home.present.figure'))
    test(title('home.present.figure'), async ({ browser }) => {
      test.setTimeout(300_000);
      await presentFigure(browser);
    });
  if (entered('home.export.dialog'))
    test(title('home.export.dialog'), async ({ browser }) => {
      test.setTimeout(300_000);
      await exportDialog(browser);
    });
  if (entered('home.kits.themes'))
    test(title('home.kits.themes'), async ({ browser }) => {
      test.setTimeout(360_000);
      await kitsThemes(browser);
    });
  if (entered('home.people.share-dialog'))
    test(title('home.people.share-dialog'), async ({ browser }) => {
      test.setTimeout(360_000);
      await shareDialog(browser);
    });
  if (entered('home.agents.history-panel'))
    test(title('home.agents.history-panel'), async ({ browser }) => {
      test.setTimeout(360_000);
      await historyPanel(browser);
    });
  if (entered('home.hero.font-swap'))
    test(title('home.hero.font-swap'), async ({ browser }) => {
      test.setTimeout(480_000);
      test.info().annotations.push({ type: 'load', description: `${oneMinuteLoad()}` });
      await fontSwap(browser);
    });
  if (entered('home.kits.colors'))
    test(title('home.kits.colors'), async ({ browser }) => {
      test.setTimeout(720_000);
      await kitsColors(browser);
    });
  if (entered('home.patterns.stills'))
    test(title('home.patterns.stills'), async ({ browser }) => {
      test.setTimeout(300_000);
      await patternsStills(browser);
    });
}
