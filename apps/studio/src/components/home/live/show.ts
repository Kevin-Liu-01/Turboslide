import { ANNOUNCE, PRESENT } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId } from '../deck.generated';
import { homeAsset } from '../assets';
import { LIVE_SLIDE_HTML } from '../bands/live.generated';
import * as core from './index';
import type { LiveContext } from './index';
import { finishBand, play, reduced } from './motion';
import { paintNextSteps } from './next-steps';
import { sourceOf as sourceKey } from './state';
import type { HomeDeckState, HomeStore, SlideKey } from './state';
import { applyCustomer, customerText } from './tailor';
import { applyKit } from './theme';

/**
 * Present from the browser (docs/LANDING.md 2.7, 3.2 P1 to P5; rows home.present.show and
 * home.present.focus). L3's file. The band holds the chosen slide (slide 3 at rest) over a ruled
 * list of the deck's titles. A row's press makes its slide the chosen one by a cut. Present, or
 * Cmd+Enter or Ctrl+F5 (Google's Slideshow keys as the editor binds them, `packages/chrome/src/
 * menus/model.ts` 1236 to 1238) while the band is at least half in view and no text field has
 * focus, opens the show on the chosen slide: the band's ground turns ink over 300 ms while the slide
 * moves from its place to the stage over 500 ms (FLIP, by `transform`). The show is a modal dialog
 * inside the band, whose box reserves its height, so opening it moves nothing outside the band;
 * under 1,024 px, where the band runs taller than the show, it covers the screen instead
 * (agents.css), so the slide and its bar sit at the screen's middle.
 * Focus moves to the stage, named by its counter; Tab cycles among Previous, Next and Exit; the
 * keys page by cuts, as Slideshow does; Escape or Exit returns the slide over 400 ms and focus to
 * Present. The page has no single character shortcut (WCAG 2.2 SC 2.1.4).
 *
 * The slides are the page deck as the visitor left it: each is a clone of the page's own rendered
 * instance of that slide (the moved title, the turned heading, the customer's name, the kit, the
 * agent's slide), stripped of the editing hooks, and slide 7 from the live module's markup, whose
 * still is requested only when the show or the print first draws it.
 */

/** Ends at once the renderer's own entrance fade (`.slide.is-on`, sheet.css `cut`), a motion 3.6 does not list. */
export function settleEntrance(el: Element): void {
  for (const a of el.getAnimations({ subtree: true }))
    if (a instanceof CSSAnimation && a.animationName === 'cut') a.finish();
}

/** Marks a clone the show or the print made, so no band's hooks match it. */
export const CLONE_ATTR = 'data-slide-clone';
/** Marks the Present band's chosen slide, which shows a clone once the visitor chooses a row. */
const DISPLAY_ATTR = 'data-present-display';

/**
 * The editing hooks a clone drops: no focus stop, no object hook, no id. The root keeps its
 * `data-instance`, which home.css keys the hero's and the close's own layout on.
 */
const EDIT_ATTRS = [
  'id',
  'tabindex',
  'contenteditable',
  'role',
  'aria-roledescription',
  'aria-label',
  'data-object',
  'data-sheet',
] as const;

/** The page's own instances of a slide, largest first. */
function sourceOf(root: HTMLElement, id: HomeSlideId): HTMLElement | null {
  const found = [
    ...root.querySelectorAll<HTMLElement>(`[data-home-slides][data-slide="${id}"]`),
  ].filter(
    (el) =>
      el.closest(`[${CLONE_ATTR}]`) === null &&
      !el.hasAttribute(DISPLAY_ATTR) &&
      el.closest('[data-show], [data-print-deck]') === null,
  );
  found.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  return found[0] ?? null;
}

let fieldTemplate: HTMLElement | null = null;

/** Slide 7, the opener field's slide, from the live module's markup (integrator.md 2.1). */
function fieldSlide(): HTMLElement | null {
  if (fieldTemplate === null) {
    const template = document.createElement('template');
    template.innerHTML = LIVE_SLIDE_HTML.field;
    fieldTemplate =
      template.content.querySelector<HTMLElement>('[data-home-slides]') ??
      (template.content.firstElementChild as HTMLElement | null);
  }
  return fieldTemplate;
}

export function appearance(): 'light' | 'dark' {
  const theme = document.documentElement.dataset['theme'];
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The URL inside a CSS `url(...)` value; null for anything else. */
function urlOf(value: string): string | null {
  const match = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(value);
  return match?.[1] ?? null;
}

const stills = new Map<string, Promise<void>>();

/**
 * A still's picture as its CSS mask requests it, in CORS mode (as `field.ts`'s `pixelsOf` does). A
 * load in the other mode is a second request the mask does not wait for, and a print taken before
 * the mask's own request answers draws the whole box in ink.
 */
function stillImage(url: string): HTMLImageElement {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  return img;
}

/**
 * Requests a still once in the mode its layer draws it (a mask: the field stills and slide 8's
 * dots) and resolves when it has loaded (or failed).
 */
export function loadStill(url: string): Promise<void> {
  let loaded = stills.get(url);
  if (loaded === undefined) {
    loaded = new Promise<void>((resolve) => {
      const img = stillImage(url);
      if (img.complete && img.naturalWidth > 0) resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    stills.set(url, loaded);
  }
  return loaded;
}

/**
 * Every field still a clone shows, loaded before it is drawn: a mask whose picture has not arrived
 * would paint its whole box in ink, so the still layer waits hidden (the slide's paper shows) and
 * appears when its picture has loaded. An inlined still (a data URI) draws at once.
 */
function holdStills(wrapper: HTMLElement): void {
  for (const box of wrapper.querySelectorAll<HTMLElement>('[data-field]')) {
    const url = urlOf(box.style.getPropertyValue('--ts-still'));
    if (url === null || url.startsWith('data:')) continue;
    const img = stillImage(url);
    if (img.complete && img.naturalWidth > 0) continue;
    const layers = [...box.querySelectorAll<HTMLElement>('.ts-field-still')];
    for (const layer of layers) layer.style.visibility = 'hidden';
    void loadStill(url).then(() => {
      for (const layer of layers) layer.style.removeProperty('visibility');
    });
  }
}

/** The hashed still of slide 7 in the shown appearance (l3.md R9), set on first draw. */
function setFieldStill(clone: HTMLElement): void {
  for (const el of clone.querySelectorAll<HTMLElement>('[data-still="field-still"]')) {
    try {
      el.style.setProperty('--ts-still', `url("${homeAsset('field-still', appearance()).path}")`);
    } catch {
      /* the build has not written the still; the slide draws without its picture */
    }
  }
}

/**
 * The dots of slide 8's still frame as one mask for both appearances (the role `pattern-mask`);
 * null before the build writes it.
 */
export function patternMaskPath(): string | null {
  try {
    return homeAsset('pattern-mask', null).path;
  } catch {
    return null;
  }
}

/**
 * Slide 8's picture in a clone (LANDING.md 2.8, 2.11, 2.13): the frame the exporter stores for the
 * pattern, drawn as every other still is, through its dots' mask (the role `pattern-mask`) in the
 * slide's own ink over its paper, so a kit restyles it as it restyles every other slide (verify2
 * N3; the exporter's file is a picture in the GT colours, which a kit never reached). The slide's
 * own print box holds no still (its picture is a shader), so without this its masked layer prints
 * a whole box of ink. `holdStills` and the print's `loadStills` wait for the mask as for the other
 * stills; a duplicated slide 8 carries the box and takes the same frame.
 */
function setPatternStill(clone: HTMLElement): void {
  const boxes = clone.querySelectorAll<HTMLElement>('[data-field="pattern"]');
  const mask = patternMaskPath();
  if (boxes.length === 0 || mask === null) return;
  for (const box of boxes) {
    /* a copy of the patterns band's slide drops that band's states (the shader drawn, the frame
       printed on its canvas), whose canvas the clone does not keep */
    for (const name of box.getAttributeNames())
      if (name.startsWith('data-pattern-')) box.removeAttribute(name);
    box.style.setProperty('--ts-still', `url("${mask}")`);
    box.setAttribute('data-still-frame', '');
  }
}

/**
 * A clone of slide `id` in its current state, for the show, the present display and the print:
 * the sheet's wrapper (the size container that scales the 1,600 px sheet) around a copy of the
 * page's own largest instance of the slide, the editing hooks removed (no focus stop, no object
 * hook, no second h1), each field's still carried over inline and shown at full tone, the counter
 * written for its place. The root keeps `data-home-slides`, which the page's sheet rules key on,
 * so the bands' renumbering, renaming and kits reach an open show as they reach the bands.
 */
/** Ends the hero's typing sequence at its end state (the boot script's `end()`), so no clone holds half a subtitle. */
export function endHeroSequence(): void {
  (window as unknown as { tsHomeBoot?: { end(): void } }).tsHomeBoot?.end();
}

export function cloneSlide(root: HTMLElement, state: HomeDeckState, id: HomeSlideId): HTMLElement {
  const source = id === 'field' ? fieldSlide() : sourceOf(root, id);
  const wrapper = document.createElement('div');
  wrapper.className = 'ts-home-sheet';
  wrapper.setAttribute(CLONE_ATTR, id);
  if (source === null) return wrapper;
  const host = id === 'field' ? null : source.closest<HTMLElement>('.ts-home-sheet');
  /* a field box beside the slide in its wrapper travels with it */
  const parts =
    host === null
      ? [source]
      : ([...host.children].filter((el) => el instanceof HTMLElement) as HTMLElement[]);
  for (const part of parts) {
    const copy = part.cloneNode(true) as HTMLElement;
    const from = [part, ...part.querySelectorAll<HTMLElement>('[data-field]')].filter((el) =>
      el.hasAttribute('data-field'),
    );
    const to = [copy, ...copy.querySelectorAll<HTMLElement>('[data-field]')].filter((el) =>
      el.hasAttribute('data-field'),
    );
    to.forEach((el, i) => {
      const style = from[i] === undefined ? null : getComputedStyle(from[i] as HTMLElement);
      for (const name of ['--ts-still', '--ts-still-disc']) {
        const value = style?.getPropertyValue(name).trim() ?? '';
        if (value !== '') el.style.setProperty(name, value);
      }
      el.dataset['fieldState'] = 'still';
      for (const canvas of el.querySelectorAll('canvas')) canvas.remove();
      /* the page defers a picture's still with content-visibility: auto, under which Chromium's
         print draws the masked layer unmasked (a whole box of ink): a clone draws its still */
      el.style.setProperty('content-visibility', 'visible');
    });
    wrapper.append(copy);
  }
  for (const el of [...wrapper.querySelectorAll<HTMLElement>('*')])
    for (const name of EDIT_ATTRS) el.removeAttribute(name);
  for (const el of wrapper.querySelectorAll('[data-live-overlay], [data-live-spacer]')) el.remove();
  /* a one shot motion armed below the viewport holds its first pose until it plays: the clone
     draws the end state (l4.md M11) */
  for (const piece of wrapper.querySelectorAll<HTMLElement | SVGElement>('[data-mark-piece]')) {
    piece.style.removeProperty('translate');
    piece.style.removeProperty('opacity');
  }
  /* the page keeps one h1: a clone's heading keeps its element, which home.css styles, and drops
     its heading role */
  for (const heading of wrapper.querySelectorAll('h1, h2, h3'))
    heading.setAttribute('role', 'none');
  for (const el of wrapper.querySelectorAll<HTMLElement>('[style*="color: transparent"]'))
    el.style.removeProperty('color');
  /* a name Tailor is still lighting (T1) is drawn at rest: no blue on a shown or printed slide */
  for (const el of wrapper.querySelectorAll('.ts-home-lit')) el.classList.remove('ts-home-lit');
  const sheet = wrapper.querySelector<HTMLElement>('[data-home-slides]');
  if (sheet !== null) {
    sheet.classList.remove('is-thumb');
    sheet.setAttribute(CLONE_ATTR, id);
    if (id === 'field') {
      applyKit(sheet, state.kit);
      setFieldStill(sheet);
    }
    setPatternStill(sheet);
    /* the deck's customer on every name, also one Tailor's 55 ms stagger has not reached yet */
    applyCustomer(sheet, HOME_DECK.customer, state.customer);
    holdStills(wrapper);
    const n = state.order.indexOf(id) + 1;
    const counter = `${n} / ${state.order.length}`;
    sheet.setAttribute('data-counter', counter);
    for (const el of sheet.querySelectorAll('[data-counter-text]')) el.textContent = counter;
  }
  return wrapper;
}

/**
 * The bar under 720 px (LANDING.md 2.7 "Layout at 390"): the counter and the timer on one row,
 * Previous, Next and Exit on the next at 44 px, the notes under them. Inline while home.css lacks
 * R6's narrow block (l3.md R22); with that block in, these values equal it.
 */
const NARROW = '(max-width: 719px)';
function fitBar(bar: HTMLElement): void {
  if (!window.matchMedia(NARROW).matches) return;
  bar.style.flexWrap = 'wrap';
  bar.style.rowGap = '8px';
  for (const el of bar.children as HTMLCollectionOf<HTMLElement>) {
    if (el.classList.contains('ts-home-show-count')) el.style.flex = '1 0 calc(100% - 64px)';
    else if (el.classList.contains('ts-home-show-time')) el.style.flex = '0 0 auto';
    else if (el.classList.contains('ts-home-show-notes')) {
      el.style.order = '3';
      el.style.flexBasis = '100%';
    } else if (el.tagName === 'BUTTON') {
      el.style.order = '2';
      el.style.flex = '1 1 0';
      el.style.height = '44px';
    }
  }
}

function isTextField(el: Element | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
  );
}

/** The fixture's facts of a slide of the deck (a slide a menu row added reads its source's; New slide none). */
function factsOf(state: HomeDeckState, key: SlideKey): { title: string; notes: string } {
  const source = sourceKey(state, key);
  const facts = source === 'blank' ? undefined : HOME_DECK.slides[source];
  const typed = (state as HomeDeckState & { notes?: Readonly<Record<string, string>> }).notes?.[
    key
  ];
  /* slide 5 before the recorded run set its title (a restore of version 2) has none (v2.md R26) */
  const untitled = source === 'next-steps' && state.agentStep === 1;
  return { title: untitled ? '' : (facts?.title ?? ''), notes: typed ?? facts?.notes ?? '' };
}

/**
 * A slide of the deck as the show and the print draw it: the core's fresh copy of the slide with
 * the deck's state drawn on it (V2's `cloneSlide` and `paintSlide`, v2.md R4 answer), which holds a
 * slide a menu row added and one whose band has not loaded; the page's own instance (`cloneSlide`
 * below) when the core has no copy of it.
 */
export function showSlide(root: HTMLElement, state: HomeDeckState, key: SlideKey): HTMLElement {
  const api = core as unknown as {
    cloneSlide?: (key: SlideKey, state: HomeDeckState, instance: string) => HTMLElement | null;
    paintSlide?: (root: HTMLElement, state: HomeDeckState) => void;
  };
  const fresh = api.cloneSlide?.(key, state, 'show') ?? null;
  if (fresh === null || api.paintSlide === undefined)
    return cloneSlide(root, state, key as HomeSlideId);
  const wrapper = document.createElement('div');
  wrapper.className = 'ts-home-sheet';
  wrapper.setAttribute(CLONE_ATTR, key);
  fresh.classList.remove('is-thumb');
  fresh.setAttribute(CLONE_ATTR, key);
  wrapper.append(fresh);
  api.paintSlide(fresh, state);
  paintNextSteps(fresh, state);
  /* a picture's print box shows its still at full tone; its canvas is a band's motion, not the
     show's (the first pass's clone rule; slide 8's pattern mounts its own, below) */
  for (const box of fresh.querySelectorAll<HTMLElement>('[data-field]')) {
    box.dataset['fieldState'] = 'still';
    for (const canvas of box.querySelectorAll('canvas')) canvas.remove();
    box.style.setProperty('content-visibility', 'visible');
  }
  for (const el of [...wrapper.querySelectorAll<HTMLElement>('*')])
    for (const name of EDIT_ATTRS) el.removeAttribute(name);
  for (const el of wrapper.querySelectorAll('[data-live-overlay], [data-live-spacer]')) el.remove();
  for (const heading of wrapper.querySelectorAll('h1, h2, h3'))
    heading.setAttribute('role', 'none');
  if (key === 'field') setFieldStill(fresh);
  setPatternStill(fresh);
  holdStills(wrapper);
  return wrapper;
}

/** Whether the deck skips slide `id` (the store's `skipped`, V2's: a record of slide ids). */
export function isSkipped(state: HomeDeckState, id: string): boolean {
  const skipped = state.skipped as unknown;
  if (Array.isArray(skipped)) return skipped.includes(id);
  return (skipped as Readonly<Record<string, true>> | undefined)?.[id] === true;
}

/** The slides a show and a print draw: the deck's order without its skipped slides (2.11). */
export function shownSlides(state: HomeDeckState): SlideKey[] {
  return state.order.filter((id) => !isSkipped(state, id));
}

/** The Present list's mark of a skipped slide (2.11, `PRESENT.skipped`). */
const SKIPPED_WORD = PRESENT.skipped;

/**
 * V4's moving pattern on slide 8 (2.11, 2.13; v3.md R11): `window.tsHomePattern.mount` once the
 * pattern chunk has loaded and motion is allowed, else nothing and the still frame shows.
 */
type PatternMount = { mount(slide: HTMLElement): { stop(): void } | null };
function mountPattern(slide: HTMLElement): { stop(): void } | null {
  if (reduced()) return null;
  const hook = (window as unknown as { tsHomePattern?: PatternMount }).tsHomePattern;
  try {
    return hook?.mount(slide) ?? null;
  } catch {
    return null;
  }
}

/** A show open in a host: the Present band's, or a container another band asked for (`openShow`). */
type ShowOptions = {
  root: HTMLElement;
  store: HomeStore;
  /** the positioned element the show covers */
  host: HTMLElement;
  /** the slide it opens on (the next shown slide when that one is skipped) */
  slide: SlideKey;
  /** the box the slide moves from (P2), null for a cut */
  from: DOMRect | null;
  /** where the slide returns on Exit (P4), read at the close; null for a cut */
  to: () => DOMRect | null;
  /** the dialog's name */
  labelledBy: string | null;
  /** the element that takes focus back */
  returnFocus: HTMLElement | null;
  announce(text: string): void;
  /** called once the show has left, with the slide it showed last */
  onClosed(last: SlideKey): void;
  /** fits the stage inside the host's height (a container smaller than the band) */
  fit: boolean;
};

export type ShowHandle = { close(): void; readonly element: HTMLElement };

/** Every open show, so a deck change repaints it (P3 by a cut). */
const openShows = new Set<{ repaint(): void }>();

function mountShow(options: ShowOptions): ShowHandle {
  const { root, store, host } = options;
  const show = document.createElement('div');
  show.className = 'ts-home-show';
  show.dataset['show'] = '';
  show.setAttribute('role', 'dialog');
  show.setAttribute('aria-modal', 'true');
  /* the surround of a show is the product Slideshow's near black in both appearances
     (Slideshow.css, --pt-panel-ink and --pt-panel-text; l3.md R25) */
  show.style.setProperty('--pt-ink', 'var(--pt-panel-ink)');
  show.style.setProperty('--pt-paper', 'var(--pt-panel-text)');
  if (options.labelledBy !== null) show.setAttribute('aria-labelledby', options.labelledBy);
  const ink = document.createElement('div');
  ink.className = 'ts-home-show-ink';
  ink.setAttribute('aria-hidden', 'true');
  const stage = document.createElement('div');
  stage.className = 'ts-home-show-stage';
  stage.dataset['showStage'] = '';
  stage.tabIndex = -1;
  const bar = document.createElement('div');
  bar.className = 'ts-home-show-bar';
  const parts: Record<'count' | 'notes' | 'time', HTMLElement> = {
    count: document.createElement('span'),
    notes: document.createElement('span'),
    time: document.createElement('span'),
  };
  for (const [key, el] of Object.entries(parts)) el.className = `ts-home-show-${key}`;
  const buttons = (
    [
      ['previous', PRESENT.show.previous],
      ['next', PRESENT.show.next],
      ['exit', PRESENT.show.exit],
    ] as const
  ).map(([key, words]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = words;
    button.dataset['showButton'] = key;
    return button;
  });
  bar.append(parts.count, parts.notes, parts.time, ...buttons);
  fitBar(bar);
  show.append(ink, stage, bar);
  host.append(show);
  if (options.fit) {
    /* a host smaller than the band (the miniature's stage): the slide at the largest 16 by 9 that
       leaves the bar its row */
    const box = host.getBoundingClientRect();
    const barHeight = bar.getBoundingClientRect().height || 56;
    const width = Math.max(0, Math.min(box.width, ((box.height - barHeight) * 16) / 9));
    stage.style.width = `${Math.floor(width)}px`;
    bar.style.width = `${Math.floor(Math.max(width, Math.min(box.width, 320)))}px`;
  }

  let shown = shownSlides(store.get());
  const startAt = (): number => {
    const order = store.get().order as readonly string[];
    const from = order.indexOf(options.slide);
    for (let i = Math.max(0, from); i < order.length; i += 1) {
      const at = shown.indexOf(order[i] as HomeSlideId);
      if (at >= 0) return at;
    }
    return Math.max(0, shown.length - 1);
  };
  let current = startAt();
  let pattern: { stop(): void } | null = null;
  const openedAt = Date.now();
  let closing = false;

  const paint = (): void => {
    const state = store.get();
    shown = shownSlides(state);
    current = Math.max(0, Math.min(current, shown.length - 1));
    const id = shown[current];
    pattern?.stop();
    pattern = null;
    if (id === undefined) {
      stage.replaceChildren();
      return;
    }
    const total = shown.length;
    const clone = showSlide(root, state, id);
    /* the show's counter counts the slides it shows, as Slideshow's does */
    const sheet = clone.querySelector<HTMLElement>('[data-home-slides]');
    if (sheet !== null) {
      const counter = `${current + 1} / ${total}`;
      sheet.setAttribute('data-counter', counter);
      for (const el of sheet.querySelectorAll('[data-counter-text]')) el.textContent = counter;
    }
    stage.replaceChildren(clone);
    settleEntrance(stage);
    if (id === 'pattern' && sheet !== null) pattern = mountPattern(sheet);
    stage.setAttribute('aria-label', PRESENT.stageName(current + 1, total));
    parts.count.textContent = PRESENT.counter(current + 1, total);
    parts.notes.textContent = customerText(factsOf(state, id).notes, state.customer);
  };
  const paintTime = (): void => {
    const sec = Math.floor((Date.now() - openedAt) / 1000);
    parts.time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  /** P3: a cut to another slide, as Slideshow pages. */
  const go = (n: number): void => {
    const next = Math.max(0, Math.min(shown.length - 1, n));
    if (next === current || closing) return;
    current = next;
    paint();
    options.announce(ANNOUNCE.showCounter(current + 1, shown.length));
  };
  const flip = (from: DOMRect, to: DOMRect): Keyframe => ({
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
    transformOrigin: '0 0',
  });
  const entry = { repaint: paint };
  openShows.add(entry);
  let clock = 0;

  const close = (): void => {
    if (closing || !show.isConnected) return;
    closing = true;
    window.clearInterval(clock);
    openShows.delete(entry);
    pattern?.stop();
    pattern = null;
    const last = shown[current] ?? options.slide;
    options.onClosed(last);
    const done = (): void => {
      show.remove();
      options.returnFocus?.focus({ preventScroll: true });
    };
    const to = options.to();
    if (reduced() || to === null) {
      done();
      return;
    }
    /* P4: the slide returns to its place over 400 ms while the ground clears over 300 ms */
    const from = stage.getBoundingClientRect();
    play(ink, [{ opacity: 1 }, { opacity: 0 }], 'ground', 'fade', 'present');
    bar.style.visibility = 'hidden';
    const back = play(
      stage,
      [{ transform: 'none', transformOrigin: '0 0' }, flip(to, from)],
      'exit',
      'move',
      'present',
    );
    if (back === null) done();
    else back.finished.then(done, done);
  };

  show.addEventListener('keydown', (event) => {
    const onButton = (event.target as Element).closest('button') !== null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
        event.preventDefault();
        go(current + 1);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        event.preventDefault();
        go(current - 1);
        return;
      case 'Home':
        event.preventDefault();
        go(0);
        return;
      case 'End':
        event.preventDefault();
        go(shown.length - 1);
        return;
      case 'Escape':
        event.preventDefault();
        close();
        return;
      case ' ':
      case 'Enter':
        if (onButton) return;
        event.preventDefault();
        go(current + 1);
        return;
      case 'Tab': {
        /* the focus stays in the show: the stage, then Previous, Next and Exit, around */
        event.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          at < 0
            ? event.shiftKey
              ? buttons.length - 1
              : 0
            : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      default:
    }
  });
  stage.addEventListener('click', () => go(current + 1));
  buttons[0]?.addEventListener('click', () => go(current - 1));
  buttons[1]?.addEventListener('click', () => go(current + 1));
  buttons[2]?.addEventListener('click', close);

  paint();
  paintTime();
  clock = window.setInterval(paintTime, 1000);
  /* P1 and P2 */
  play(ink, [{ opacity: 0 }, { opacity: 1 }], 'ground', 'fade', 'present');
  if (options.from !== null)
    play(
      stage,
      [
        flip(options.from, stage.getBoundingClientRect()),
        { transform: 'none', transformOrigin: '0 0' },
      ],
      'beat',
      'move',
      'present',
    );
  stage.focus({ preventScroll: true });
  options.announce(ANNOUNCE.showCounter(current + 1, shown.length));
  return { close, element: show };
}

/** The live context the Present band started with: `openShow` reads its root and store. */
let presentContext: { root: HTMLElement; store: HomeStore } | null = null;

/**
 * Opens the show inside `container` on slide `slideId` (2.11; v2.md R13: the miniature's View >
 * Slideshow and Cmd+Enter): the same show as Present's, sized to the container, focus on its stage;
 * Escape and Exit close it by a cut and give focus back to the element that had it. Null when the
 * live core has not started.
 */
export function openShow(container: HTMLElement, slideId: SlideKey): ShowHandle | null {
  const ctx = presentContext ?? fallbackContext();
  if (ctx === null) return null;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const band = container.closest<HTMLElement>('[data-band]');
  return mountShow({
    root: ctx.root,
    store: ctx.store,
    host: container,
    slide: slideId,
    from: null,
    to: () => null,
    labelledBy: band?.querySelector('h2')?.id ?? null,
    returnFocus,
    announce: (text) => {
      const region = band?.querySelector<HTMLElement>('[data-announce]');
      if (region != null) region.textContent = text;
    },
    onClosed: () => undefined,
    fit: true,
  });
}

/** The store the core created, when the Present band has not started (V2's `homeStore`). */
function fallbackContext(): { root: HTMLElement; store: HomeStore } | null {
  const root = document.getElementById('top');
  const api = core as unknown as { homeStore?: () => HomeStore | null };
  const store = api.homeStore?.() ?? null;
  return root === null || store === null ? null : { root, store };
}

export function startShow(ctx: LiveContext): void {
  const { band, root, store } = ctx;
  presentContext = { root, store };
  const present = band.querySelector<HTMLElement>('button[data-present], [data-present] button');
  const list = band.querySelector<HTMLElement>('[data-slide-list]');
  const display = band.querySelector<HTMLElement>('[data-home-slides][data-instance="present"]');
  if (present === null || list === null || display === null) return;
  const heading = band.querySelector('h2');
  if (heading !== null && heading.id === '') heading.id = 'ts-home-present-h';
  display.setAttribute(DISPLAY_ATTR, '');

  /* ---------- the chosen slide and the list ---------- */
  let chosen: SlideKey = (display.dataset['slide'] as HomeSlideId | undefined) ?? 'gets';
  const rowsById = new Map<HomeSlideId, HTMLElement>();
  for (const row of list.querySelectorAll<HTMLElement>('[data-slide-row]'))
    rowsById.set(row.dataset['slideRow'] as HomeSlideId, row);
  /** The list's own child that holds a row (the row itself, or its `li`). */
  const itemOf = (row: HTMLElement): HTMLElement => {
    let el: HTMLElement = row;
    while (el.parentElement !== null && el.parentElement !== list) el = el.parentElement;
    return el;
  };
  const buttonOf = (row: HTMLElement): HTMLElement =>
    row.matches('button') ? row : (row.querySelector<HTMLElement>('button') ?? row);

  /** A row for a slide a menu row added, made from the list's first row (2.11: every slide is listed). */
  const rowFor = (id: SlideKey): HTMLElement | undefined => {
    const known = rowsById.get(id as HomeSlideId);
    if (known !== undefined) return known;
    const model = list.querySelector<HTMLElement>('[data-slide-row]');
    if (model === null) return undefined;
    const item = itemOf(model).cloneNode(true) as HTMLElement;
    const row = (
      item.matches('[data-slide-row]') ? item : item.querySelector<HTMLElement>('[data-slide-row]')
    )!;
    row.dataset['slideRow'] = id;
    row.removeAttribute('aria-current');
    list.append(item);
    rowsById.set(id as HomeSlideId, row);
    return row;
  };

  const paintList = (state: HomeDeckState): void => {
    if (!state.order.includes(chosen)) chosen = state.order[0] as SlideKey;
    let before: Element | null = null;
    for (const id of state.order) {
      const row = rowFor(id);
      if (row === undefined) continue;
      itemOf(row).hidden = false;
      const button = buttonOf(row);
      const cells = button.children;
      const n = cells[0];
      const title = cells[1];
      if (n !== undefined) n.textContent = String(state.order.indexOf(id) + 1);
      if (title !== undefined)
        title.textContent = customerText(factsOf(state, id).title, state.customer);
      /* a skipped slide's row says so in titanium (2.11), as the editor's filmstrip marks it */
      let mark = button.querySelector<HTMLElement>('.ts-slide-row-skip');
      const skipped = isSkipped(state, id);
      if (skipped && mark === null) {
        mark = document.createElement('span');
        mark.className = 'ts-slide-row-skip';
        mark.textContent = SKIPPED_WORD;
        button.append(mark);
      } else if (!skipped) mark?.remove();
      button.toggleAttribute('data-skipped', skipped);
      if (id === chosen) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      const node = itemOf(row);
      if (before === null) {
        if (list.firstElementChild !== node) list.prepend(node);
      } else if (before.nextElementSibling !== node) before.after(node);
      before = node;
    }
    for (const [id, row] of rowsById) if (!state.order.includes(id)) itemOf(row).hidden = true;
  };

  /** The chosen slide above the list, by a cut: its own markup until the visitor chooses a row. */
  const restingSlide = display.dataset['slide'] as HomeSlideId;
  const displayHost = display.parentElement ?? display;
  let shownSheet: HTMLElement = display;
  const paintDisplay = (state: HomeDeckState): void => {
    if (chosen === restingSlide && shownSheet === display) return;
    const clone = showSlide(root, state, chosen);
    const sheet = clone.querySelector<HTMLElement>('[data-home-slides]');
    /* the clone keeps its own instance (the hero's and the close's layout key on it) */
    sheet?.setAttribute(DISPLAY_ATTR, '');
    displayHost.replaceChildren(...clone.children);
    settleEntrance(displayHost);
    shownSheet = sheet ?? display;
  };

  list.addEventListener('click', (event) => {
    const row = (event.target as Element).closest<HTMLElement>('[data-slide-row]');
    const id = row?.dataset['slideRow'] as HomeSlideId | undefined;
    if (id === undefined || id === chosen) return;
    chosen = id;
    const state = store.get();
    paintDisplay(state);
    paintList(state);
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...list.querySelectorAll<HTMLElement>('[data-slide-row]')]
      .filter((row) => !itemOf(row).hidden)
      .map(buttonOf);
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    rows[
      Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))
    ]?.focus();
  });

  /* ---------- the show ---------- */
  let open: ShowHandle | null = null;
  const start = (): void => {
    if (open !== null) return;
    finishBand('present');
    endHeroSequence();
    const from = displayHost.getBoundingClientRect();
    open = mountShow({
      root,
      store,
      host: band,
      slide: chosen,
      from,
      to: () => displayHost.getBoundingClientRect(),
      labelledBy: heading?.id ?? null,
      returnFocus: present,
      announce: ctx.announce,
      onClosed: (last) => {
        chosen = last;
        const state = store.get();
        paintDisplay(state);
        paintList(state);
        displayHost.style.visibility = '';
        open = null;
      },
      fit: false,
    });
    displayHost.style.visibility = 'hidden';
  };
  present.addEventListener('click', start);

  /* any new input on the band finishes its running motion at its end state first (3.8) */
  const settle = (): void => {
    if (open !== null) finishBand('present');
  };
  band.addEventListener('pointerdown', settle, true);
  band.addEventListener('keydown', settle, true);

  /* Cmd+Enter or Ctrl+F5 while the band is half in view and no text field has focus; the share
     in view is read at the key, so a scroll just before it counts */
  const halfInView = (): boolean => {
    const r = band.getBoundingClientRect();
    const seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return r.height > 0 && seen >= r.height / 2;
  };
  document.addEventListener('keydown', (event) => {
    if (open !== null || document.querySelector('[data-show]') !== null) return;
    const slideshow =
      (event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'Enter') ||
      (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'F5');
    if (!slideshow || isTextField(document.activeElement)) return;
    /* the miniature's own Cmd+Enter opens the show in its stage (V2's menus band) */
    if (document.activeElement?.closest('[data-band="menus"]') != null) return;
    const focusedInBand = band.contains(document.activeElement);
    if (!focusedInBand && !halfInView()) return;
    event.preventDefault();
    start();
  });

  /* the deck changed elsewhere: the list, the chosen slide and every open show follow it */
  store.subscribe((state) => {
    paintList(state);
    if (shownSheet !== display) paintDisplay(state);
    for (const each of openShows) each.repaint();
  });
  paintList(store.get());
}
