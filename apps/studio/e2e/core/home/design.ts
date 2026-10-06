import { loadavg } from 'node:os';

import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { HOME_ASSETS } from '../../../src/components/home/assets';
import {
  HOME_STEP_ICONS,
  HOME_TITLE_ROW,
  HOME_TOOLBAR,
} from '../../../src/components/home/chrome.generated';
import { HERO } from '../../../src/components/home/copy';
import { HOME_DECK, HOME_LOOP_FACTS } from '../../../src/components/home/deck.generated';
import { HERO_ROUND, NAV_ICONS } from '../../../src/components/home/design-copy';
import { extraHTTPHeaders, title } from '../lib';
import { rowsForDriver } from '../matrix';

// A lane module of core/home.spec.ts: the design round's landing rows (docs/DESIGN.md 8, 11;
// lane D4). DR-D4#1 enters the shared parts: the navigation's one row of icon controls, Inter's
// default glyphs with tabular figures, the radius ladder, the shared scrollbar on every scroll
// region and every picture loading. Each later push of D4 adds its rows here. Every observation is
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
}
