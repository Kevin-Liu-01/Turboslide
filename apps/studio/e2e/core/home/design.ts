import { loadavg } from 'node:os';

import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { TAILOR as PRODUCT_TAILOR } from '@turboslide/chrome/panels/assist-strings';

import { HOME_ASSETS } from '../../../src/components/home/assets';
import {
  HOME_FORMAT_PANEL,
  HOME_STEP_ICONS,
  HOME_TITLE_ROW,
  HOME_TOOLBAR,
} from '../../../src/components/home/chrome.generated';
import { CANVAS, HERO } from '../../../src/components/home/copy';
import {
  HOME_DECK,
  HOME_LOOP_FACTS,
  HOME_TAILOR_WORDS,
} from '../../../src/components/home/deck.generated';
import {
  BAND_CONTROLS,
  CANVAS_ROUND,
  DIAGRAM_WORDS,
  DIAGRAMS_ROUND,
  HERO_ROUND,
  MENUS_ROUND,
  NAV_ICONS,
} from '../../../src/components/home/design-copy';
import { MENU_GLYPHS } from '../../../src/components/home/menu-glyphs.generated';
import { MINI_MENUS } from '../../../src/components/home/menus.generated';
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
// DR-D4#4 the menus' glyphs, the canvas band's Format options readout and the Tailor dialog. Every observation is
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
  '.ts-home-history time',
  '.ts-home-history [data-version]',
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
          return {
            elements,
            alternates: alternates.slice(0, 12),
            proportional: proportional.slice(0, 12),
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
          if (read.documentBar !== 8)
            failures.push(`${label}: the document's bar is ${read.documentBar} px`);
          if (read.rootWidth !== 'auto')
            failures.push(`${label}: the root's scrollbar-width is ${read.rootWidth}`);
          const t = read.terminal;
          if (t === null || t.size !== 8 || t.thumb !== 'rgba(255, 255, 255, 0.44)')
            failures.push(`${label}: the hero terminal's bar ${JSON.stringify(t)}`);
          const m = read.miniFilmstrip;
          if (
            m === null ||
            m.overflow <= 0 ||
            m.size !== 8 ||
            m.thumb !== inkThumb ||
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
          menus: [...frame.querySelectorAll('.ts-hero-frame-menus > span')].map((m) =>
            (m.textContent ?? '').trim(),
          ),
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
  },
  {
    band: 'export',
    id: 'd-export',
    label: DIAGRAMS_ROUND.export.label,
    words: DIAGRAM_WORDS.export,
    markers: 2,
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
          const read = await svg.evaluate((el) => ({
            role: el.getAttribute('role'),
            name: el.getAttribute('aria-label'),
            href: el.querySelector('use')?.getAttribute('href') ?? '',
            width: el.getBoundingClientRect().width,
            font: getComputedStyle(el).fontFamily,
          }));
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
        notes.push(`${label}: both diagrams drawn`);
      } finally {
        await context.close();
      }
    }
  test.info().annotations.push({ type: 'diagrams', description: notes.join(' | ') });
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
}
