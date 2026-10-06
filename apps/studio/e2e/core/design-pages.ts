import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { Scratch, ctl, invoke, newDeck, settled, slideOrder, state, teardownAll, title } from './lib';
import { isCoreId } from './matrix';

// Lane D5's rows of the design round (docs/DESIGN.md 9, 10.5, 11): the pages other than the editor
// and the landing. The spec files call one function each and spread its ids into their coverage
// list, the shape of chrome-foundation.ts; a row registers once its id is in the matrix.
//
// The scrollbar readings need the bars drawn: Playwright's Chromium runs with `--hide-scrollbars`,
// so these rows launch one Chromium of their own without that switch (research-scroll 2) and read
// a bar's width as `offsetWidth - clientWidth` less the borders: the shared bar of tokens.css is
// 8 px, the platform's classic bar 15 px, a hidden one 0. Each row opens its own contexts on that
// browser and tears down the decks it makes through the product.

type Appearance = 'light' | 'dark';
type Person = { context: BrowserContext; page: Page; scratch: Scratch };

const APPEARANCES: readonly Appearance[] = ['light', 'dark'];
/** The width of the shared scrollbar's gutter (DESIGN.md 6.2, `--pt-scroll-w`). */
const SHARED_BAR = 8;

let bars: Browser | null = null;
const people: Person[] = [];

/** The one Chromium of these rows that draws scrollbars. */
async function barsBrowser(): Promise<Browser> {
  bars ??= await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  return bars;
}

/** A context on the bars browser at a size and an appearance, stored as the theme button stores it. */
async function personAt(
  baseURL: string | undefined,
  width: number,
  height: number,
  appearance: Appearance,
): Promise<Person> {
  const browser = await barsBrowser();
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height },
    colorScheme: appearance,
    acceptDownloads: true,
  });
  /* the appearance a document of this context boots in: the cookie below names it, so a later
     switch (appearanceOf) reaches every page the context opens after it */
  await context.addInitScript(() => {
    const want = /(?:^|; )d5-appearance=(light|dark)/.exec(document.cookie)?.[1];
    try {
      if (want) localStorage.setItem('gt-theme', want);
    } catch {
      /* a storage that refuses keeps the system's appearance, which is the same here */
    }
  });
  await context.addCookies([{ name: 'd5-appearance', value: appearance, url: originOf(baseURL) }]);
  const page = await context.newPage();
  const person = { context, page, scratch: new Scratch() };
  people.push(person);
  return person;
}

function originOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4321').origin;
}

/** Moves a context to the other appearance: the stored key (through the cookie) and the system. */
async function appearanceOf(
  person: Person,
  baseURL: string | undefined,
  appearance: Appearance,
): Promise<void> {
  await person.context.addCookies([
    { name: 'd5-appearance', value: appearance, url: originOf(baseURL) },
  ]);
  await person.page.emulateMedia({ colorScheme: appearance });
}

export type BarReading = {
  /** the bar's width: offsetWidth less clientWidth less the side borders, in px */
  bar: number;
  /** the content is taller than the box */
  scrolls: boolean;
  overflowY: string;
  scrollbarWidth: string;
};

/** The vertical bar of the first element a selector matches, or null when none matches. */
export async function barOf(page: Page, selector: string): Promise<BarReading | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      bar:
        el.offsetWidth -
        el.clientWidth -
        parseFloat(cs.borderLeftWidth || '0') -
        parseFloat(cs.borderRightWidth || '0'),
      scrolls: el.scrollHeight > el.clientHeight + 1,
      overflowY: cs.overflowY,
      scrollbarWidth: cs.scrollbarWidth,
    };
  }, selector);
}

/** The document's vertical bar: the window's width less the root's client width. */
export async function documentBar(page: Page): Promise<BarReading> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    return {
      bar: window.innerWidth - root.clientWidth,
      scrolls: root.scrollHeight > root.clientHeight + 1,
      overflowY: cs.overflowY,
      scrollbarWidth: cs.scrollbarWidth,
    };
  });
}

/** The computed numerals of every element a selector matches (at most `limit`). */
export async function numeralsOf(page: Page, selector: string, limit = 6): Promise<string[]> {
  return page.evaluate(
    ([sel, max]) =>
      [...document.querySelectorAll<HTMLElement>(sel as string)]
        .slice(0, max as number)
        .map((el) => getComputedStyle(el).fontVariantNumeric),
    [selector, limit] as const,
  );
}

/** The top left corner's radius of the first element a selector matches, or '' when none. */
export async function radiusOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    return el ? getComputedStyle(el).borderTopLeftRadius : '';
  }, selector);
}

/**
 * Whether the element a selector matches paints first at its own centre: `elementsFromPoint` at
 * the centre of its box returns it or one of its descendants first, and the elements of `under`
 * (when given) after it.
 */
export async function paintsOnTop(
  page: Page,
  selector: string,
  under?: string,
): Promise<{ top: boolean; under: boolean; first: string }> {
  return page.evaluate(
    ([sel, below]) => {
      const el = document.querySelector<HTMLElement>(sel as string);
      if (!el) return { top: false, under: false, first: 'absent' };
      const box = el.getBoundingClientRect();
      const stack = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const first = stack[0];
      const name = (node: Element | undefined) =>
        node
          ? `${node.tagName.toLowerCase()}${node.getAttribute('data-control') ? `[${node.getAttribute('data-control')}]` : ''}${node.className && typeof node.className === 'string' ? `.${node.className.split(' ')[0]}` : ''}`
          : 'none';
      const top = first !== undefined && (first === el || el.contains(first));
      let beneath = true;
      if (below) {
        const other = document.querySelector(below as string);
        const at = other ? stack.findIndex((node) => node === other || other.contains(node)) : -1;
        const mine = stack.findIndex((node) => node === el || el.contains(node));
        beneath = other !== null && at > mine;
      }
      return { top, under: beneath, first: name(first) };
    },
    [selector, under ?? ''] as const,
  );
}

/** Registers the shared teardown of these rows once per spec file. */
function teardownHook(label: string): void {
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
    if (bars) {
      await bars.close().catch(() => undefined);
      bars = null;
    }
    expect(failures, `every deck of the ${label} rows is torn down`).toEqual([]);
  });
}

function rowsOf(label: string) {
  const declared: string[] = [];
  let hooked = false;
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (!isCoreId(id)) return;
    if (!hooked) {
      teardownHook(label);
      hooked = true;
    }
    declared.push(id);
    test(title(id), body);
  };
  return { declared, row };
}

/** A deck of eight slides with a forty line note on the first, made through /new by `person`. */
async function presenterDeck(person: Person): Promise<{ deckId: string; slides: string[] }> {
  const { page } = person;
  const deckId = await newDeck(page, person.scratch, 'Presenter surfaces');
  /* setup writes through the window API: seven more slides and the long note */
  while ((await slideOrder(page)).length < 8) {
    const order = await slideOrder(page);
    const s = await state(page);
    await invoke(page, 'slide.new', {
      layout: 'split',
      after: order[order.length - 1],
      baseRevision: s.revision,
    });
    await settled(page);
  }
  const slides = await slideOrder(page);
  const note = Array.from(
    { length: 40 },
    (_, i) => `Line ${i + 1} of the speaker notes for the opening slide.`,
  ).join('\n');
  const s = await state(page);
  await invoke(page, 'slide.update', {
    slideId: slides[0],
    baseRevision: s.revision,
    mutations: [{ op: 'slide.set', slideId: slides[0], path: '/notes', value: note }],
  });
  await settled(page);
  return { deckId, slides };
}

/** Shows the show's bar: a pointer move over the show, as a presenter does. */
async function wakeBar(page: Page): Promise<void> {
  await page.mouse.move(700, 450);
  await page.mouse.move(720, 470);
  await page.waitForTimeout(300);
}

/**
 * Lane D5's rows in core/present.spec.ts: the presenter view's numbers and scrollbars, and the
 * show's shortcuts card and toolbar menus over the show (DESIGN.md 9, `present.presenter.surfaces`).
 */
export function designPresent(): string[] {
  const { declared, row } = rowsOf('D5 present');

  row('present.presenter.surfaces', async ({ baseURL }) => {
    test.setTimeout(900_000);
    const person = await personAt(baseURL, 1440, 900, 'light');
    const { page, context } = person;
    const { deckId, slides } = await presenterDeck(person);
    const facts: string[] = [];
    const failures: string[] = [];
    const check = (ok: boolean, sentence: string) => {
      if (!ok) failures.push(sentence);
    };

    for (const appearance of APPEARANCES) {
      await appearanceOf(person, baseURL, appearance);

      /* the presenter view in a 600 px tall window, where the slide list of eight slides scrolls */
      const presenter = await context.newPage();
      await presenter.setViewportSize({ width: 1440, height: 600 });
      await presenter.emulateMedia({ colorScheme: appearance });
      await presenter.goto(`/present/${deckId}`);
      await presenter.locator('[data-control="presenter"]').waitFor({ timeout: 120_000 });
      await expect(presenter.locator('html')).toHaveAttribute('data-theme', appearance);
      const timer = await numeralsOf(presenter, '[data-control="presenter.elapsed"]');
      const counter = await numeralsOf(presenter, '[data-control="presenter.counter"]');
      const clock = await numeralsOf(presenter, '[data-control="presenter.clock"]');
      check(
        timer.length === 1 && timer.every((v) => v.includes('tabular-nums')),
        `${appearance}: the timer computes ${timer.join(', ') || 'nothing'}`,
      );
      check(
        counter.length === 1 && counter.every((v) => v.includes('tabular-nums')),
        `${appearance}: the counter computes ${counter.join(', ') || 'nothing'}`,
      );
      const notes = await barOf(presenter, '.ts-presenter-notes');
      check(
        notes !== null && notes.scrolls && notes.bar === SHARED_BAR,
        `${appearance}: the notes scroll ${notes?.scrolls} with a ${notes?.bar} px bar`,
      );
      await ctl(presenter, 'presenter.counter').click();
      const list = presenter.locator('[data-control="present.list"]');
      await list.waitFor({ timeout: 10_000 });
      const listBar = await barOf(presenter, '[data-control="present.list"]');
      const listCorner = await radiusOf(presenter, '[data-control="present.list"]');
      check(
        listBar !== null && listBar.scrolls && listBar.bar === SHARED_BAR,
        `${appearance}: the slide list scrolls ${listBar?.scrolls} with a ${listBar?.bar} px bar`,
      );
      facts.push(
        `${appearance} presenter: timer ${timer.join('/')}, counter ${counter.join('/')}, clock ${clock.join('/')}; notes bar ${notes?.bar} px (scrolls ${notes?.scrolls}); slide list bar ${listBar?.bar} px (scrolls ${listBar?.scrolls}), corner ${listCorner}`,
      );
      await presenter.keyboard.press('Escape');
      await presenter.close();

      /* the show from the editor: its slide list and Options menu over the show, the shortcuts card */
      await page.bringToFront();
      await page.goto(`/edit/${deckId}`);
      await page.locator('[data-control="present.open"]').waitFor({ timeout: 120_000 });
      await settled(page);
      await ctl(page, 'present.open').click();
      const show = page.locator('[data-control="present.show"]');
      await expect(show).toBeAttached({ timeout: 20_000 });
      await page
        .waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 800 })
        .catch(() => undefined);
      await page.waitForTimeout(300);

      await wakeBar(page);
      await ctl(page, 'present.counter').click();
      await page.locator('[data-control="present.list"]').waitFor({ timeout: 10_000 });
      const showList = await paintsOnTop(page, '[data-control="present.list"]');
      const showListLayer = await page
        .locator('[data-control="present.list"]')
        .getAttribute('data-layer');
      check(
        showList.top,
        `${appearance}: the show's slide list is under ${showList.first} at its centre`,
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      await wakeBar(page);
      await ctl(page, 'present.options').click();
      const options = page.locator('#ts-slideshow-options');
      await options.waitFor({ timeout: 10_000 });
      const menu = await paintsOnTop(page, '#ts-slideshow-options');
      const menuCorner = await radiusOf(page, '#ts-slideshow-options');
      check(menu.top, `${appearance}: the Options menu is under ${menu.first} at its centre`);
      await ctl(page, 'menu.present.options.more').hover();
      await ctl(page, 'menu.present.options.more.shortcuts').click({ timeout: 10_000 });
      const card = page.locator('[data-control="present.shortcuts"]');
      await card.waitFor({ timeout: 10_000 });
      const cardCorner = await radiusOf(page, '[data-control="present.shortcuts"]');
      const cardTop = await paintsOnTop(page, '[data-control="present.shortcuts"]');
      const cardLayer = await page
        .locator('.ts-present-scrim')
        .getAttribute('data-layer')
        .catch(() => null);
      check(cardCorner === '8px', `${appearance}: the shortcuts card's corner is ${cardCorner}`);
      check(
        cardTop.top,
        `${appearance}: the shortcuts card is under ${cardTop.first} at its centre`,
      );
      facts.push(
        `${appearance} show: slide list on top ${showList.top} (layer ${showListLayer ?? 'none'}); Options menu on top ${menu.top}, corner ${menuCorner}; shortcuts card corner ${cardCorner}, on top ${cardTop.top} (layer ${cardLayer ?? 'none'})`,
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if ((await show.count()) > 0) await page.keyboard.press('Escape');
      await expect(show).toHaveCount(0, { timeout: 10_000 });
    }

    test.info().annotations.push({
      type: 'surfaces',
      description: `${slides.length} slides; ${facts.join('; ')}`,
    });
    expect(failures, facts.join('; ')).toEqual([]);
  });

  return declared;
}

/** The deck every base serves to anyone: the General Translation brand deck. */
const VIEW_DECK = 'gt-brand';

/**
 * Lane D5's rows in core/decks.spec.ts: the deck view's scrollbars and numbers
 * (`view.deck.surfaces`); the pages' rows of DR-D5#1 and #2 join them.
 */
export function designDecks(): string[] {
  const { declared, row } = rowsOf('D5 decks');

  row('view.deck.surfaces', async ({ baseURL }) => {
    test.setTimeout(600_000);
    const facts: string[] = [];
    const failures: string[] = [];
    for (const appearance of APPEARANCES) {
      const { page } = await personAt(baseURL, 1440, 900, appearance);
      for (const mode of ['slide', 'grid', 'book'] as const) {
        const region =
          mode === 'slide' ? '.pt-sb .pt-tree' : mode === 'grid' ? '.pt-grid' : '.pt-book';
        const numbers =
          mode === 'slide' ? '.pt-orow-n' : mode === 'grid' ? '.pt-grid .pt-thumb .n' : '.pt-pn b';
        await page.goto(`/deck/${VIEW_DECK}?mode=${mode}`);
        await page.locator(region).waitFor({ timeout: 120_000 });
        await page.locator(numbers).first().waitFor({ timeout: 60_000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', appearance);
        const bar = await barOf(page, region);
        const figures = await numeralsOf(page, numbers);
        const name = mode === 'slide' ? 'the sidebar' : `the ${mode} view`;
        if (!(bar !== null && bar.scrolls && bar.bar === SHARED_BAR))
          failures.push(
            `${appearance}: ${name} scrolls ${bar?.scrolls} with a ${bar?.bar} px bar (${bar?.overflowY}, scrollbar-width ${bar?.scrollbarWidth})`,
          );
        if (figures.length === 0 || !figures.every((v) => v.includes('tabular-nums')))
          failures.push(
            `${appearance}: ${name}'s slide numbers compute ${figures.join(', ') || 'nothing'}`,
          );
        facts.push(
          `${appearance} ${name}: bar ${bar?.bar} px (scrolls ${bar?.scrolls}); numbers ${[...new Set(figures)].join('/')}`,
        );
      }
    }
    test.info().annotations.push({ type: 'surfaces', description: facts.join('; ') });
    expect(failures, facts.join('; ')).toEqual([]);
  });

  return declared;
}
