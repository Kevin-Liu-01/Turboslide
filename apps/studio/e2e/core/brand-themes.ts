import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { loadavg } from 'node:os';

import { THEME_IDS } from '@turboslide/schema/brand';
import type { ThemeId } from '@turboslide/schema/brand';
import { themeRecord } from '@turboslide/theme/themes';

import {
  Scratch,
  addSlide,
  clickCard,
  extraHTTPHeaders,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  openGtBrandCopy,
  settled,
  slideOrder,
  teardownAll,
  title,
  typeInto,
  waitEditor,
  waitRevision,
} from './lib';
import { isCoreId } from './matrix';

// Lane D3's rows of the design round in core/brand.spec.ts (docs/DESIGN.md 7, 10.3, 11): the
// theme library drawn by the product. The spec file calls `brandThemes()` once and spreads its
// ids into its coverage list, the shape of chrome-foundation.ts; a row registers once its id is
// in the matrix. Each row opens its own context at 1440 by 900; the decks it makes are torn down
// through the product. Timings are read in the page from the write's call to the frame that
// shows the theme, and recorded with their reading; the machine's load is the gate's to record.

type Person = { context: BrowserContext; page: Page; scratch: Scratch };
const people: Person[] = [];

async function personAt(browser: Browser, width = 1440, height = 900): Promise<Person> {
  const context = await browser.newContext({ extraHTTPHeaders, viewport: { width, height } });
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

/** What the editor draws of a theme: the stage's sheet and every filmstrip card's sheet. */
export type ThemeDrawn = {
  /** the computed --paper and --ink of the stage's sheet */
  paper: string;
  ink: string;
  /** the computed --paper of every filmstrip card's sheet */
  cards: string[];
  rails: number;
  rules: { top: boolean; bottom: boolean };
  crosses: number;
  /** a drawn `.wordmark` on the stage */
  wordmark: number;
  /** a `<use href="#gt-mark">` on the stage outside the sprite */
  marks: number;
  /** the stage's counter words */
  counter: string;
  /** the title column's computed top, bottom, transform and text-align on the title slide */
  composition: { top: string; bottom: string; transform: string; align: string } | null;
  /** the stage heading's computed font-feature-settings */
  features: string;
  /** the heading's accent bar: its ::before content and background colour */
  bar: { content: string; color: string } | null;
};

/** Reads `ThemeDrawn` from the page (the stage is on the title slide). */
export async function themeDrawn(page: Page): Promise<ThemeDrawn> {
  return page.evaluate(() => {
    const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const sheet = stage?.closest('.ts-sheet') ?? null;
    /* a token as the sheet writes it, a three digit hex in its six digit form: the node-server
       build's minified sheet writes #ffffff as #fff */
    const token = (el: Element | null, name: string) => {
      const v = el === null ? '' : getComputedStyle(el).getPropertyValue(name).trim().toLowerCase();
      return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
    };
    const shown = (el: Element, pseudo?: string) => {
      const cs = getComputedStyle(el, pseudo);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (pseudo !== undefined) return cs.content !== 'none' && parseFloat(cs.width) > 0;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const frame = stage?.querySelector('.frame') ?? null;
    const rails =
      frame === null
        ? 0
        : [shown(frame, '::before'), shown(frame, '::after')].filter(Boolean).length;
    const top = frame?.querySelector('.rule.top');
    const bottom = frame?.querySelector('.rule.bottom');
    const crosses =
      frame === null ? 0 : [...frame.querySelectorAll('.cross')].filter((el) => shown(el)).length;
    const wordmark = [...(stage?.querySelectorAll('.wordmark') ?? [])].filter(
      (el) => el.getClientRects().length > 0 && el.children.length > 0 && shown(el),
    ).length;
    const marks = [...(stage?.querySelectorAll('use') ?? [])].filter((use) => {
      const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '';
      return (
        href === '#gt-mark' && use.closest('symbol') === null && use.closest('.wordmark') === null
      );
    }).length;
    const counter = [...(stage?.querySelectorAll('.counter') ?? [])]
      .filter((el) => shown(el))
      .map((el) => el.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    const column = stage?.querySelector(".slide.is-on[data-kind='title'] .left-mid") ?? null;
    const cs = column === null ? null : getComputedStyle(column);
    const heading = stage?.querySelector('.slide.is-on h1, .slide.is-on h2') ?? null;
    const before = heading === null ? null : getComputedStyle(heading, '::before');
    const cards = [...document.querySelectorAll('[data-control^="filmstrip.slide."]')]
      .map((card) => card.querySelector('.ts-sheet') ?? card.closest('.ts-sheet'))
      .filter((el): el is Element => el !== null)
      .map((el) => token(el, '--paper'));
    return {
      paper: token(sheet, '--paper'),
      ink: token(sheet, '--ink'),
      cards,
      rails,
      rules: {
        top: top !== null && top !== undefined && shown(top),
        bottom: bottom !== null && bottom !== undefined && shown(bottom),
      },
      crosses,
      wordmark,
      marks,
      counter,
      composition:
        cs === null
          ? null
          : { top: cs.top, bottom: cs.bottom, transform: cs.transform, align: cs.textAlign },
      features: heading === null ? '' : getComputedStyle(heading).fontFeatureSettings,
      bar:
        before === null || before.content === 'none'
          ? null
          : { content: before.content, color: before.backgroundColor },
    };
  });
}

/** `#rrggbb` as the browser computes a background colour. */
function rgbOf(hex: string): string {
  const v = hex.replace('#', '');
  return `rgb(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)})`;
}

/**
 * One `deck.set /theme` through the window API, timed in the page: from the call to the first
 * frame in which the stage's sheet and every filmstrip card's sheet compute the theme's paper.
 * Answers the milliseconds, or null when the frame did not come within 5 s.
 */
export async function setThemeTimed(
  page: Page,
  id: string,
  paper: string,
  baseRevision: number,
): Promise<number | null> {
  return page.evaluate(
    async ([theme, want, base]) => {
      const sheets = () => {
        const stage = document
          .querySelector('.ts-stagewrap.ts-editor .ts-stage')
          ?.closest('.ts-sheet');
        const cards = [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map(
          (card) => card.querySelector('.ts-sheet') ?? card.closest('.ts-sheet'),
        );
        return [stage ?? null, ...cards];
      };
      const paperOf = (el: Element) => {
        const v = getComputedStyle(el).getPropertyValue('--paper').trim().toLowerCase();
        return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
      };
      const drawn = () => sheets().every((el) => el !== null && paperOf(el) === want);
      const start = performance.now();
      const call = window.turboslide!.studio.invoke('deck.set', {
        path: '/theme',
        value: theme,
        baseRevision: base,
      }) as Promise<unknown>;
      let ms: number | null = null;
      while (performance.now() - start < 5000) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        if (drawn()) {
          ms = Math.round(performance.now() - start);
          break;
        }
      }
      await call;
      return ms;
    },
    [id, paper.toLowerCase(), baseRevision] as const,
  );
}

/** The counter words a theme draws on the first of two slides with no kit. */
function counterWords(id: ThemeId): string {
  const format = themeRecord(id).band.counter;
  if (format === 'none') return '';
  if (format === 'n') return '01';
  if (format === 'Slide n') return 'Slide 1';
  return '01 / 02';
}

export function brandThemes(): string[] {
  const declared: string[] = [];
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    declared.push(id);
    test(title(id), body);
  };
  test.afterAll(async () => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    for (const person of people.splice(0)) {
      try {
        if (person.scratch.ids.size > 0) await teardownAll(person.page, person.scratch);
      } catch (error) {
        failures.push(
          error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error),
        );
      } finally {
        await person.context.close().catch(() => undefined);
      }
    }
    expect(failures, 'every deck of the D3 rows is torn down').toEqual([]);
  });

  /* DESIGN.md 7.2, 7.4, 7.5: each of the nine ids, in both appearances, redraws every slide with
     its tokens, frame, band, composition and display features; the Blank kit is reset first, so
     the deck reads its theme alone */
  row('themes.render.each-theme', async ({ browser }) => {
    test.setTimeout(600_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Theme library deck');
    await addSlide(page);
    const [first] = await slideOrder(page);
    await clickCard(page, first!);
    let s = await settled(page);
    await invoke(page, 'brand.reset', { baseRevision: s.revision });
    const readings: string[] = [];
    const failures: string[] = [];
    for (const appearance of ['light', 'dark'] as const) {
      s = await settled(page);
      await invoke(page, 'deck.set', {
        path: '/defaults/appearance',
        value: appearance,
        baseRevision: s.revision,
      });
      for (const id of THEME_IDS) {
        const record = themeRecord(id);
        const tokens = record.tokens[appearance];
        s = await settled(page);
        const ms = await setThemeTimed(page, id, tokens.paper, s.revision);
        await settled(page);
        await page.waitForTimeout(150);
        const drawn = await themeDrawn(page);
        const facts = {
          frame: record.frame,
          logo: record.title.mark === 'gt',
          counter: counterWords(id),
          features: record.displayFeatures === 'normal' ? 'normal' : '"cv11", "ss01"',
        };
        readings.push(
          `${id} ${appearance}: ${ms === null ? 'not drawn within 5 s' : `${ms} ms`}, paper ${drawn.paper}, ink ${drawn.ink}, cards ${drawn.cards.join(' ')}, rails ${drawn.rails}, rules ${drawn.rules.top ? 'top' : ''}${drawn.rules.bottom ? ' bottom' : ''}, crosses ${drawn.crosses}, wordmark ${drawn.wordmark}, marks ${drawn.marks}, counter "${drawn.counter}", column ${JSON.stringify(drawn.composition)}, features ${drawn.features}, bar ${JSON.stringify(drawn.bar)}`,
        );
        const check = (ok: boolean, what: string) => {
          if (!ok) failures.push(`${id} ${appearance}: ${what}`);
        };
        check(ms !== null && ms <= 500, `every slide redrawn within 500 ms (${ms ?? 'none'})`);
        check(drawn.paper === tokens.paper.toLowerCase(), `paper ${drawn.paper}`);
        check(drawn.ink === tokens.ink.toLowerCase(), `ink ${drawn.ink}`);
        check(
          drawn.cards.length >= 2 && drawn.cards.every((p) => p === tokens.paper.toLowerCase()),
          `cards ${drawn.cards.join(' ')}`,
        );
        check(drawn.rails === (facts.frame.rails ? 2 : 0), `rails ${drawn.rails}`);
        check(drawn.rules.top === facts.frame.top, `top rule ${drawn.rules.top}`);
        check(drawn.rules.bottom === facts.frame.bottom, `bottom rule ${drawn.rules.bottom}`);
        check(drawn.crosses === (facts.frame.crosses ? 4 : 0), `crosses ${drawn.crosses}`);
        check(drawn.wordmark === (facts.logo ? 1 : 0), `wordmark ${drawn.wordmark}`);
        check(facts.logo ? drawn.marks > 0 : drawn.marks === 0, `title marks ${drawn.marks}`);
        check(drawn.counter === facts.counter, `counter "${drawn.counter}"`);
        check(drawn.features === facts.features, `features ${drawn.features}`);
        const column = drawn.composition;
        switch (record.title.composition) {
          case 'top-left':
            check(column?.top === '0px' && column.transform === 'none', 'top left');
            break;
          case 'bottom-left':
            check(column?.bottom === '0px' && column.transform === 'none', 'bottom left');
            break;
          case 'centre':
            check(column?.align === 'center', 'centred');
            break;
          default:
            check(column !== null && column.transform !== 'none', 'left, centred vertically');
        }
        check(
          record.title.accentBar
            ? drawn.bar !== null && drawn.bar.color === rgbOf(tokens.accent)
            : drawn.bar === null,
          `accent bar ${JSON.stringify(drawn.bar)}`,
        );
      }
    }
    test.info().annotations.push({ type: 'themes', description: readings.join('; ') });
    expect(failures, readings.join('\n')).toEqual([]);
  });

  /* DESIGN.md 7.3: /new and the Blank card on /decks make a Simple deck, light, with no GT part,
     and the Theme panel names Simple */
  row('themes.default.new-is-simple', async ({ browser }) => {
    test.setTimeout(480_000);
    const { page, scratch } = await personAt(browser);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const via of ['/new', 'the Blank card on /decks'] as const) {
      if (via === '/new') await newDeck(page, scratch, 'Simple from new');
      else await deckFromBlankCard(page, scratch, 'Simple from the Blank card');
      const info = await invoke<{ theme: string; defaults?: { appearance?: string } }>(
        page,
        'deck.info',
      );
      const [first] = await slideOrder(page);
      await clickCard(page, first!);
      const drawn = await themeDrawn(page);
      await menuPath(page, 'slide', 'slide.changeTheme');
      const named = await page
        .locator('[data-control="panel.theme.current"] .ts-theme-current-name')
        .first()
        .textContent({ timeout: 10_000 })
        .catch(() => null);
      await page.keyboard.press('Escape');
      readings.push(
        `${via}: theme ${info.theme}, appearance ${info.defaults?.appearance ?? 'none'}, paper ${drawn.paper}, marks ${drawn.marks}, wordmark ${drawn.wordmark}, counter "${drawn.counter}", rails ${drawn.rails}, rules ${drawn.rules.top || drawn.rules.bottom ? 'drawn' : 'none'}, crosses ${drawn.crosses}, the panel names "${named?.trim() ?? 'nothing'}"`,
      );
      const check = (ok: boolean, what: string) => {
        if (!ok) failures.push(`${via}: ${what}`);
      };
      check(info.theme === 'simple', `theme ${info.theme}`);
      check(info.defaults?.appearance === 'light', `appearance ${info.defaults?.appearance}`);
      check(drawn.paper === '#ffffff', `paper ${drawn.paper}`);
      check(drawn.marks === 0 && drawn.wordmark === 0, 'no GT mark and no wordmark');
      check(drawn.counter === '', `counter "${drawn.counter}"`);
      check(
        drawn.rails === 0 && !drawn.rules.top && !drawn.rules.bottom && drawn.crosses === 0,
        'no frame',
      );
      check(named?.trim() === 'Simple', `the panel names "${named?.trim()}"`);
    }
    test.info().annotations.push({ type: 'themes', description: readings.join('; ') });
    expect(failures, readings.join('\n')).toEqual([]);
  });

  /* DESIGN.md 7.3 (G7): with no stored appearance a deck draws its theme's: Simple light, General
     Translation dark */
  row('themes.appearance.theme-default', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Appearance default deck');
    const sheetTheme = () =>
      page.evaluate(
        () =>
          document
            .querySelector('.ts-stagewrap.ts-editor .ts-stage')
            ?.closest('.ts-sheet')
            ?.getAttribute('data-theme') ?? '',
      );
    let s = await settled(page);
    await invoke(page, 'deck.set', { path: '/defaults/appearance', baseRevision: s.revision });
    await settled(page);
    await page.waitForTimeout(300);
    const info = await invoke<{ theme: string; defaults?: { appearance?: string } }>(
      page,
      'deck.info',
    );
    const simple = await sheetTheme();
    s = await settled(page);
    await invoke(page, 'deck.set', {
      path: '/theme',
      value: 'general-translation',
      baseRevision: s.revision,
    });
    await settled(page);
    await page.waitForTimeout(300);
    const gt = await sheetTheme();
    test.info().annotations.push({
      type: 'themes',
      description: `appearance removed: ${info.defaults?.appearance ?? 'none stored'}; Simple draws ${simple}, General Translation draws ${gt}`,
    });
    expect(info.theme).toBe('simple');
    expect(info.defaults?.appearance).toBeUndefined();
    expect(simple).toBe('light');
    expect(gt).toBe('dark');
  });

  /* DESIGN.md 7.9 rule 1: a deck made from the General Translation brand deck reads
     general-translation and draws every GT part; the Theme panel names General Translation */
  row('themes.migration.gt-unchanged', async ({ browser }) => {
    test.setTimeout(600_000);
    const { page, scratch } = await personAt(browser);
    await page.goto('/decks');
    await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 120_000 });
    const id = scratch.add(await openGtBrandCopy(page, 240_000));
    await waitEditor(page);
    await settled(page, 60_000);
    const info = await invoke<{ theme: string }>(page, 'deck.info');
    const order = await slideOrder(page);
    await clickCard(page, order[0]!);
    const first = await themeDrawn(page);
    const titleId = order.find((slide) => slide === 'title') ?? order[1]!;
    await clickCard(page, titleId);
    const title = await themeDrawn(page);
    await menuPath(page, 'slide', 'slide.changeTheme');
    const named = await page
      .locator('[data-control="panel.theme.current"] .ts-theme-current-name')
      .first()
      .textContent({ timeout: 10_000 })
      .catch(() => null);
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'themes',
      description: `deck ${id}: theme ${info.theme}; first slide ${order[0]}: wordmark ${first.wordmark}, counter "${first.counter}", rails ${first.rails}, rules ${first.rules.top && first.rules.bottom ? 'both' : 'not both'}, crosses ${first.crosses}; title slide ${titleId}: GT marks ${title.marks}, features ${title.features}; the panel names "${named?.trim() ?? 'nothing'}"`,
    });
    expect(info.theme).toBe('general-translation');
    expect(first.wordmark).toBe(1);
    expect(first.counter).toBe(`01 / ${String(order.length).padStart(2, '0')}`);
    expect(first.rails).toBe(2);
    expect(first.rules).toEqual({ top: true, bottom: true });
    expect(first.crosses).toBe(4);
    expect(title.marks).toBeGreaterThan(0);
    expect(title.features).toBe('"cv11", "ss01"');
    expect(named?.trim()).toBe('General Translation');
  });

  /* DESIGN.md 7.5 (G4), 7.7: Closing on a Simple deck with no logo draws no GT mark and no picture */
  row('themes.closing.no-gt-mark-on-simple', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Closing on Simple');
    const s = await settled(page);
    const made = await invoke<{ slide: { id: string; kind: string; template?: string } }>(
      page,
      'slide.new',
      { layout: 'closing', baseRevision: s.revision },
    );
    await settled(page);
    await clickCard(page, made.slide.id);
    const drawn = await pictureFacts(page);
    const info = await invoke<{ theme: string; brand?: unknown }>(page, 'deck.info');
    test.info().annotations.push({
      type: 'themes',
      description: `deck theme ${info.theme}, kit ${JSON.stringify(info.brand ?? null)}; Closing made a ${made.slide.kind} slide (template ${made.slide.template ?? 'none'}); on the stage GT marks ${drawn.marks}, pictures ${drawn.pictures}, credits ${drawn.credits}, recipes ${drawn.recipes}, heading prompt "${drawn.prompt}"`,
    });
    expect(info.theme).toBe('simple');
    expect(drawn.marks, 'no #gt-mark use on the stage').toBe(0);
    expect(drawn.pictures + drawn.recipes, 'no material on the stage').toBe(0);
    expect(drawn.credits, 'no credit').toBe(0);
    expect(drawn.prompt).toBe('Click to add title');
  });

  /* DESIGN.md 7.7 (G5): on a Simple deck Section header writes the title and its sentence on the
     theme's ground with no picture and no credit, Caption asks for a picture first, and the
     disclosure row reads More layouts (11) */
  row('themes.layouts.no-gt-pictures-on-simple', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Layouts on Simple');
    const s = await settled(page);
    const made = await invoke<{ slide: { id: string; kind: string; template?: string } }>(
      page,
      'slide.new',
      { layout: 'opener', baseRevision: s.revision },
    );
    await settled(page);
    await clickCard(page, made.slide.id);
    const drawn = await pictureFacts(page);
    await page.locator('[data-control="toolbar.layout"]').first().click();
    const plate = page.locator('[data-control="layout.apply.plate"]');
    await plate.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const grid = await page.evaluate(() => {
      const plateEl = document.querySelector('[data-control="layout.apply.plate"]');
      const rule = plateEl?.querySelector('[data-control$=".gt"]');
      const tile = (id: string) =>
        plateEl
          ?.querySelector(`[data-control$=".${id}"]`)
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? '';
      return {
        rule: rule?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        mood: tile('mood'),
        opener: tile('opener'),
      };
    });
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'themes',
      description: `Section header made a ${made.slide.kind} slide (template ${made.slide.template ?? 'none'}); on the stage pictures ${drawn.pictures}, recipes ${drawn.recipes}, credits ${drawn.credits}, heading prompt "${drawn.prompt}", ground ${drawn.ground}; the Caption tile reads "${grid.mood}"; the Section header tile "${grid.opener}"; the row "${grid.rule}"`,
    });
    expect(made.slide.kind).toBe('opener');
    expect(drawn.pictures + drawn.recipes, 'no picture').toBe(0);
    expect(drawn.credits, 'no credit').toBe(0);
    expect(drawn.prompt).toBe('Click to add title');
    expect(drawn.ground).toBe('#ffffff');
    expect(grid.mood).toContain('Add a picture first');
    expect(grid.opener).not.toContain('Add a picture first');
    expect(grid.rule).toBe('More layouts (11)');
  });

  /* DESIGN.md 7.6 items 2 and 3: nine named tiles of the deck's own slides in each theme, the
     current tile's 2 px ink border, In this presentation with the theme and the kit row */
  row('themes.picker.lists-library', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Library deck');
    await addSlide(page);
    await openThemePanel(page);
    const tiles = await libraryFacts(page);
    const own = await page.evaluate(() => ({
      name:
        document
          .querySelector('[data-control="panel.theme.current"] .ts-theme-current-name')
          ?.textContent?.trim() ?? '',
      kit: document.querySelector('[data-control="panel.theme.kit"]')?.textContent?.trim() ?? '',
      clones: document.querySelectorAll(
        '[data-control="panel.theme.current"] .ts-theme-clone .ts-sheet',
      ).length,
    }));
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'themes',
      description: `tiles ${tiles.map((t) => `${t.name} (${t.clones} clones, papers ${t.papers.join(' ')}, current ${t.current}, border ${t.border})`).join('; ')}; In this presentation "${own.name}", "${own.kit}", ${own.clones} clones`,
    });
    expect(tiles.map((t) => t.name)).toEqual([
      'Simple',
      'General Translation',
      'Swiss',
      'Mint',
      'Coral',
      'Night',
      'Slate',
      'Sand',
      'Signal',
    ]);
    for (const t of tiles) {
      expect(t.clones, t.name).toBe(2);
      const paper = themeRecord(t.id).tokens.light.paper.toLowerCase();
      expect(t.papers, t.name).toEqual([paper, paper]);
    }
    const current = tiles.filter((t) => t.current);
    expect(current.map((t) => t.id)).toEqual(['simple']);
    expect(current[0]?.border).toBe('2px');
    expect(own.name).toBe('Simple');
    expect(own.kit).toBe('Brand kit: none');
    expect(own.clones).toBe(2);
  });

  /* DESIGN.md 7.6 item 3: a pick is one revision labelled "Theme: Swiss", one Undo step, and a
     Version history row */
  row('themes.picker.apply-one-commit', async ({ browser }) => {
    test.setTimeout(360_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Pick deck');
    await openThemePanel(page);
    const before = (await settled(page)).revision;
    const ink = themeRecord('swiss').tokens.light.ink.toLowerCase();
    const start = Date.now();
    await page.locator('[data-control="panel.theme.swiss"]').click();
    const ms = await expect
      .poll(() => stageToken(page, '--ink'), { timeout: 5000, intervals: [25] })
      .toBe(ink)
      .then(() => Date.now() - start)
      .catch(() => null);
    const after = (await settled(page)).revision;
    const picked = await invoke<{ theme: string }>(page, 'deck.info');
    await page.keyboard.press('Escape');
    /* Version history lists the pick while it stands (an undone entry leaves the list) */
    await menuPath(page, 'file', 'file.versionHistory', 'file.versionHistory.see');
    await page.locator('[data-control="panel.versionHistory"]').waitFor({ timeout: 10_000 });
    const readRows = () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-control^="versionHistory."][data-control$=".pick"]'),
        ].map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      );
    let rows: string[] = [];
    await expect
      .poll(
        async () => {
          for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
            if ((await w.getAttribute('aria-expanded')) !== 'true')
              await w.click().catch(() => undefined);
          rows = await readRows();
          return rows.some((text) => text.includes('Theme: Swiss'));
        },
        { timeout: 20_000, intervals: [500] },
      )
      .toBe(true)
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    await page.locator('.ts-stagewrap.ts-editor').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect
      .poll(async () => (await invoke<{ theme: string }>(page, 'deck.info')).theme, {
        timeout: 10_000,
      })
      .toBe('simple')
      .catch(() => undefined);
    const undone = await invoke<{ theme: string }>(page, 'deck.info');
    await settled(page);
    /* a timing is a verdict only at a load of 24 or less (docs/DESIGN.md 11) */
    const load = loadavg()[0] ?? 0;
    test.info().annotations.push({
      type: 'themes',
      description: `revision ${before} to ${after}; theme ${picked.theme}; every slide drew Swiss's ink ${ms === null ? 'not within 5 s' : `${ms} ms`} after the click (as read by the test's poll, load ${load.toFixed(1)}); Version history rows ${rows.slice(0, 6).join(' | ')}; Cmd+Z: ${undone.theme}`,
    });
    expect(picked.theme).toBe('swiss');
    expect(after).toBe(before + 1);
    expect(ms, 'every slide redrawn within 5 s').not.toBeNull();
    if (load <= 24) expect(ms!, 'every slide redrawn within 500 ms').toBeLessThanOrEqual(500);
    expect(rows.some((text) => text.includes('Theme: Swiss'))).toBe(true);
    expect(undone.theme, 'one Undo step returns Simple').toBe('simple');
  });

  /* DESIGN.md 7.6 item 3: the tiles are a radio group; the arrows move, Enter applies; each tile's
     tooltip names its theme with one sentence */
  row('themes.picker.keyboard', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Keyboard deck');
    await openThemePanel(page);
    const group = await page.evaluate(() => {
      const g = document.querySelector('[data-control="panel.theme.library"]');
      return {
        role: g?.getAttribute('role') ?? '',
        radios: g?.querySelectorAll('[role="radio"]').length ?? 0,
        tabbable: [...(g?.querySelectorAll('[role="radio"]') ?? [])].filter(
          (el) => el.getAttribute('tabindex') === '0',
        ).length,
      };
    });
    await page.locator('[data-control="panel.theme.simple"]').focus();
    const focused = () =>
      page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.themeId ?? '');
    await page.keyboard.press('ArrowRight');
    const one = await focused();
    await page.keyboard.press('ArrowRight');
    const two = await focused();
    await page.keyboard.press('ArrowLeft');
    const back = await focused();
    await page.keyboard.press('ArrowRight');
    const notYet = (await invoke<{ theme: string }>(page, 'deck.info')).theme;
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await invoke<{ theme: string }>(page, 'deck.info')).theme, {
        timeout: 10_000,
      })
      .toBe('swiss')
      .catch(() => undefined);
    const applied = (await invoke<{ theme: string }>(page, 'deck.info')).theme;
    const tips: string[] = [];
    for (const id of ['simple', 'mint']) {
      const tile = page.locator(`[data-control="panel.theme.${id}"]`);
      await tile.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await tile.hover();
      await page
        .locator('.pt-tip')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => undefined);
      await page.waitForTimeout(300);
      tips.push(
        await page.evaluate(
          () => document.querySelector('.pt-tip')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ),
      );
    }
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'themes',
      description: `group ${group.role} with ${group.radios} radios, ${group.tabbable} tabbable; ArrowRight to ${one}, again to ${two}, ArrowLeft to ${back}; before Enter the theme was ${notYet}, after ${applied}; tooltips ${tips.map((t) => `"${t}"`).join(', ')}`,
    });
    expect(group).toEqual({ role: 'radiogroup', radios: 9, tabbable: 1 });
    expect([one, two, back]).toEqual(['general-translation', 'swiss', 'general-translation']);
    expect(notYet).toBe('simple');
    expect(applied).toBe('swiss');
    expect(tips[0]).toContain('Simple');
    expect(tips[1]).toContain('Mint');
    expect(tips[1]).toContain('Applies Mint to every slide. Your content stays.');
  });

  /* Kevin's item 2: General Translation is a theme to pick; picking it draws every GT part and
     picking Simple again removes every one */
  row('themes.gt.selectable', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Theme pick deck');
    await addSlide(page);
    const [first] = await slideOrder(page);
    await clickCard(page, first!);
    await openThemePanel(page);
    await page.locator('[data-control="panel.theme.general-translation"]').click();
    await expect
      .poll(async () => (await invoke<{ theme: string }>(page, 'deck.info')).theme, {
        timeout: 10_000,
      })
      .toBe('general-translation');
    await settled(page);
    let gt = await themeDrawn(page);
    await expect
      .poll(
        async () => {
          gt = await themeDrawn(page);
          return gt.wordmark === 1 && gt.marks > 0 && gt.crosses === 4;
        },
        { timeout: 10_000, intervals: [100] },
      )
      .toBe(true)
      .catch(() => undefined);
    await page.locator('[data-control="panel.theme.simple"]').scrollIntoViewIfNeeded();
    await page.locator('[data-control="panel.theme.simple"]').click();
    await expect
      .poll(async () => (await invoke<{ theme: string }>(page, 'deck.info')).theme, {
        timeout: 10_000,
      })
      .toBe('simple');
    await settled(page);
    let simple = await themeDrawn(page);
    await expect
      .poll(
        async () => {
          simple = await themeDrawn(page);
          return simple.marks + simple.wordmark + simple.rails + simple.crosses === 0;
        },
        { timeout: 10_000, intervals: [100] },
      )
      .toBe(true)
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'themes',
      description: `General Translation: marks ${gt.marks}, wordmark ${gt.wordmark}, counter "${gt.counter}", rails ${gt.rails}, rules ${gt.rules.top && gt.rules.bottom}, crosses ${gt.crosses}; Simple again: marks ${simple.marks}, wordmark ${simple.wordmark}, counter "${simple.counter}", rails ${simple.rails}, crosses ${simple.crosses}`,
    });
    expect(gt.marks).toBeGreaterThan(0);
    expect(gt.wordmark).toBe(1);
    expect(gt.counter).toBe('01 / 02');
    expect(gt.rails).toBe(2);
    expect(gt.rules).toEqual({ top: true, bottom: true });
    expect(gt.crosses).toBe(4);
    expect(simple).toMatchObject({ marks: 0, wordmark: 0, counter: '', rails: 0, crosses: 0 });
    expect(simple.rules).toEqual({ top: false, bottom: false });
  });

  /* DESIGN.md 7.5 (G1): Reset to Simple removes the kit, draws no GT part, and says so with Undo */
  row('themes.reset.returns-to-theme', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Reset deck');
    let s = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/colors/light/primary',
      value: '#0b3d91',
      baseRevision: s.revision,
    });
    s = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/frame/rails',
      value: true,
      baseRevision: s.revision,
    });
    await settled(page);
    await openThemePanel(page);
    const label =
      (await page.locator('[data-control="panel.brand.reset"]').textContent())?.trim() ?? '';
    await page.locator('[data-control="panel.brand.reset"]').click();
    const said = await expect
      .poll(
        async () =>
          (await page
            .locator('[data-control="snackbar"]')
            .textContent()
            .catch(() => '')) ?? '',
        { timeout: 8000 },
      )
      .toContain('Reset to Simple')
      .then(() => page.locator('[data-control="snackbar"]').textContent())
      .catch(() => null);
    const undo = await page
      .locator('[data-control="snackbar.action"]')
      .textContent({ timeout: 3000 })
      .catch(() => null);
    await settled(page);
    const info = await invoke<{ brand?: unknown; theme: string }>(page, 'deck.info');
    await page.keyboard.press('Escape');
    const drawn = await themeDrawn(page);
    test.info().annotations.push({
      type: 'themes',
      description: `the foot read "${label}"; the snackbar "${said?.trim() ?? 'none'}" with "${undo?.trim() ?? 'no action'}"; the kit after ${JSON.stringify(info.brand ?? null)}, theme ${info.theme}; marks ${drawn.marks}, wordmark ${drawn.wordmark}, counter "${drawn.counter}", rails ${drawn.rails}, crosses ${drawn.crosses}`,
    });
    expect(label).toBe('Reset to Simple');
    expect(said).not.toBeNull();
    expect(undo?.trim()).toBe('Undo');
    expect(info.brand).toBeUndefined();
    expect(info.theme).toBe('simple');
    expect(drawn).toMatchObject({ marks: 0, wordmark: 0, counter: '', rails: 0, crosses: 0 });
  });

  /* DESIGN.md 7.5 (G2, G3): brand.reset of one field returns that field to Simple's value */
  row('themes.reset.field-returns-to-theme', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Field reset deck');
    await addSlide(page);
    const [first] = await slideOrder(page);
    await clickCard(page, first!);
    const set = async (path: string, value: unknown) => {
      const s = await settled(page);
      await invoke(page, 'brand.set', { path, value, baseRevision: s.revision });
      await settled(page);
    };
    const reset = async (path: string) => {
      const s = await settled(page);
      await invoke(page, 'brand.reset', { path, baseRevision: s.revision });
      await settled(page);
      await page.waitForTimeout(300);
    };
    await set('/frame', { rails: true, rules: true, crosses: true });
    await set('/mark', { kind: 'default' });
    await set('/footer', { logo: 'default', text: 'Confidential' });
    await set('/counter', { show: true });
    await page.waitForTimeout(300);
    const on = await themeDrawn(page);
    const footerOn = await footerText(page);
    const readings: string[] = [
      `with the kit: rails ${on.rails}, crosses ${on.crosses}, marks ${on.marks}, wordmark ${on.wordmark}, footer "${footerOn}", counter "${on.counter}"`,
    ];
    const after: Record<string, ThemeDrawn & { footer: string }> = {};
    for (const path of ['/frame', '/mark', '/footer', '/counter']) {
      await reset(path);
      after[path] = { ...(await themeDrawn(page)), footer: await footerText(page) };
      const d = after[path]!;
      readings.push(
        `after brand.reset ${path}: rails ${d.rails}, rules ${d.rules.top || d.rules.bottom}, crosses ${d.crosses}, marks ${d.marks}, wordmark ${d.wordmark}, footer "${d.footer}", counter "${d.counter}"`,
      );
    }
    const info = await invoke<{ brand?: unknown }>(page, 'deck.info');
    test.info().annotations.push({ type: 'themes', description: readings.join('; ') });
    expect(on.rails).toBe(2);
    expect(on.counter).toBe('01 / 02');
    expect(footerOn).toBe('Confidential');
    expect(after['/frame']).toMatchObject({ rails: 0, crosses: 0 });
    expect(after['/frame']!.rules).toEqual({ top: false, bottom: false });
    expect(after['/mark']!.marks).toBe(0);
    expect(after['/footer']).toMatchObject({ wordmark: 0, footer: '' });
    expect(after['/counter']!.counter).toBe('');
    expect(info.brand ?? {}).toEqual({});
  });

  /* DESIGN.md 7.5 (G6): "Use the theme's logo" on General Translation alone, and it draws the mark */
  row('themes.logo.theme-logo-only', async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, scratch } = await personAt(browser);
    await newDeck(page, scratch, 'Theme logo deck');
    let s = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/mark',
      value: { kind: 'none' },
      baseRevision: s.revision,
    });
    await settled(page);
    await openThemePanel(page);
    const onSimple = await page.locator('[data-control="panel.brand.logo.default"]').count();
    s = await settled(page);
    await invoke(page, 'deck.set', {
      path: '/theme',
      value: 'general-translation',
      baseRevision: s.revision,
    });
    await settled(page);
    const button = page.locator('[data-control="panel.brand.logo.default"]');
    await button.waitFor({ timeout: 10_000 }).catch(() => undefined);
    const onGt = await button.count();
    const words = (await button.textContent().catch(() => null))?.trim() ?? '';
    if (onGt > 0) await button.click();
    await settled(page);
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    const drawn = await themeDrawn(page);
    const kit = (await invoke<{ brand?: { mark?: unknown } }>(page, 'deck.info')).brand;
    test.info().annotations.push({
      type: 'themes',
      description: `Simple: ${onSimple} theme logo buttons; General Translation: ${onGt} ("${words}"); after it the kit's mark ${JSON.stringify(kit?.mark ?? null)} and ${drawn.marks} GT marks on the title slide`,
    });
    expect(onSimple).toBe(0);
    expect(onGt).toBe(1);
    expect(words).toBe('Use the theme’s logo');
    expect(drawn.marks).toBeGreaterThan(0);
  });

  return declared;
}

/** A deck from the Blank card on /decks (a link to /new), its title typed so the first write saves it. */
async function deckFromBlankCard(page: Page, scratch: Scratch, text: string): Promise<string> {
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 120_000 });
  await page.locator('[data-control="home.blank"]').first().click();
  await page.waitForURL(/\/new/, { timeout: 60_000 });
  await waitEditor(page);
  const info = await invoke<{ id: string }>(page, 'deck.info');
  const run = await headingRun(page);
  await typeInto(page, run, text);
  await waitRevision(page, 1, 30_000);
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(page);
  const close = page.locator('[data-control="dialog.namePrompt.close"]');
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  return scratch.add(info.id);
}

/** What the stage draws of pictures on the current slide: GT marks, pictures, recipes, credits, the heading prompt, the ground. */
async function pictureFacts(page: Page): Promise<{
  marks: number;
  pictures: number;
  recipes: number;
  credits: number;
  prompt: string;
  ground: string;
}> {
  return page.evaluate(() => {
    const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const slide = stage?.querySelector('.slide.is-on') ?? null;
    const marks = [...(stage?.querySelectorAll('use') ?? [])].filter((use) => {
      const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '';
      return href === '#gt-mark' && use.closest('symbol') === null;
    }).length;
    const pictures = slide === null ? 0 : slide.querySelectorAll('img, canvas').length;
    const recipes = slide === null ? 0 : slide.querySelectorAll('[data-recipe]').length;
    const credits =
      slide === null ? 0 : slide.querySelectorAll('.credit, [data-type="credit"]').length;
    const prompt =
      slide
        ?.querySelector('h1 [data-prompt], h2 [data-prompt], .big [data-prompt], [data-prompt]')
        ?.textContent?.trim() ??
      slide?.querySelector('[data-prompt]')?.getAttribute('data-prompt') ??
      '';
    const sheet = stage?.closest('.ts-sheet') ?? null;
    /* the build's minified sheet writes #ffffff as #fff: the six digit form compares */
    const six = (v: string) =>
      /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
    const ground =
      sheet === null
        ? ''
        : six(getComputedStyle(sheet).getPropertyValue('--paper').trim().toLowerCase());
    return { marks, pictures, recipes, credits, prompt, ground };
  });
}

/** Opens the Theme panel through Slide > Change theme and waits for its library. */
async function openThemePanel(page: Page): Promise<void> {
  await menuPath(page, 'slide', 'slide.changeTheme');
  await page.locator('[data-control="panel.theme.library"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
}

/** A custom property of the stage's sheet, lowercased, a three digit hex in its six digit form. */
function stageToken(page: Page, name: string): Promise<string> {
  return page.evaluate((property) => {
    const sheet = document.querySelector('.ts-stagewrap.ts-editor .ts-stage')?.closest('.ts-sheet');
    const v = sheet ? getComputedStyle(sheet).getPropertyValue(property).trim().toLowerCase() : '';
    return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
  }, name);
}

/** The footer text the stage draws, or an empty string. */
function footerText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('.ts-stagewrap.ts-editor .ts-stage .ts-kit-footer');
    return el && el.getClientRects().length > 0 ? (el.textContent?.trim() ?? '') : '';
  });
}

/** Every library tile scrolled into view in turn: its id, name, clones, their papers, current and border. */
async function libraryFacts(
  page: Page,
): Promise<
  { id: string; name: string; clones: number; papers: string[]; current: boolean; border: string }[]
> {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-control="panel.theme.library"] [data-theme-id]')].map(
      (el) => (el as HTMLElement).dataset.themeId ?? '',
    ),
  );
  const out = [];
  for (const id of ids) {
    const tile = page.locator(`[data-control="panel.theme.library"] [data-theme-id="${id}"]`);
    await tile.scrollIntoViewIfNeeded();
    await expect
      .poll(() => tile.locator('.ts-theme-clone .ts-sheet').count(), { timeout: 5000 })
      .toBe(2)
      .catch(() => undefined);
    out.push(
      await tile.evaluate((el) => {
        const sheets = [...el.querySelectorAll('.ts-theme-clone .ts-sheet')];
        const pair = el.querySelector('.ts-theme-pair');
        return {
          id: (el as HTMLElement).dataset.themeId ?? '',
          name: el.querySelector('.ts-theme-name')?.textContent?.trim() ?? '',
          clones: sheets.length,
          papers: sheets.map((s) => {
            const v = getComputedStyle(s).getPropertyValue('--paper').trim().toLowerCase();
            return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
          }),
          current: el.getAttribute('aria-checked') === 'true',
          border: pair ? getComputedStyle(pair).borderTopWidth : '',
        };
      }),
    );
  }
  return out;
}
