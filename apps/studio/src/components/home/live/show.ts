import { ANNOUNCE, PRESENT } from '../copy';
import { HOME_DECK } from '../deck.generated';
import type { HomeSlideId } from '../deck.generated';
import { homeAsset } from '../assets';
import { LIVE_SLIDE_HTML } from '../bands/live.generated';
import { settleEntrance } from './agents';
import type { LiveContext } from './index';
import { finishBand, play, reduced } from './motion';
import type { HomeDeckState } from './state';
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
 * inside the band, whose box reserves its height, so opening it moves nothing outside the band.
 * Focus moves to the stage, named by its counter; Tab cycles among Previous, Next and Exit; the
 * keys page by cuts, as Slideshow does; Escape or Exit returns the slide over 400 ms and focus to
 * Present. The page has no single character shortcut (WCAG 2.2 SC 2.1.4).
 *
 * The slides are the page deck as the visitor left it: each is a clone of the page's own rendered
 * instance of that slide (the moved title, the turned heading, the customer's name, the kit, the
 * agent's slide), stripped of the editing hooks, and slide 7 from the live module's markup, whose
 * still is requested only when the show or the print first draws it.
 */

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

/** Requests a still once and resolves when it has loaded (or failed). */
export function loadStill(url: string): Promise<void> {
  let loaded = stills.get(url);
  if (loaded === undefined) {
    loaded = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
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
    const img = new Image();
    img.src = url;
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

export function startShow(ctx: LiveContext): void {
  const { band, root, store } = ctx;
  const present = band.querySelector<HTMLElement>('button[data-present], [data-present] button');
  const list = band.querySelector<HTMLElement>('[data-slide-list]');
  const display = band.querySelector<HTMLElement>('[data-home-slides][data-instance="present"]');
  if (present === null || list === null || display === null) return;
  const heading = band.querySelector('h2');
  display.setAttribute(DISPLAY_ATTR, '');

  /* ---------- the chosen slide and the list ---------- */
  let chosen = (display.dataset['slide'] as HomeSlideId | undefined) ?? 'gets';
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

  const paintList = (state: HomeDeckState): void => {
    if (!state.order.includes(chosen)) chosen = state.order[0] as HomeSlideId;
    let before: Element | null = null;
    for (const id of state.order as readonly HomeSlideId[]) {
      const row = rowsById.get(id);
      if (row === undefined) continue;
      itemOf(row).hidden = false;
      const cells = buttonOf(row).children;
      const n = cells[0];
      const title = cells[1];
      if (n !== undefined) n.textContent = String(state.order.indexOf(id) + 1);
      if (title !== undefined)
        title.textContent = customerText(HOME_DECK.slides[id as HomeSlideId].title, state.customer);
      const button = buttonOf(row);
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
    const clone = cloneSlide(root, state, chosen);
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
    const buttons = [...list.querySelectorAll<HTMLElement>('[data-slide-row]')]
      .filter((row) => !row.hidden)
      .map(buttonOf);
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    buttons[
      Math.max(0, Math.min(buttons.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))
    ]?.focus();
  });

  /* ---------- the show ---------- */
  let show: HTMLElement | null = null;
  let stage: HTMLElement | null = null;
  let current = 0;
  let clock: ReturnType<typeof setInterval> | undefined;
  let openedAt = 0;
  let closing = false;
  const parts: Partial<Record<'count' | 'notes' | 'time', HTMLElement>> = {};
  const buttons: HTMLButtonElement[] = [];

  const build = (): void => {
    show = document.createElement('div');
    show.className = 'ts-home-show';
    show.dataset['show'] = '';
    show.setAttribute('role', 'dialog');
    show.setAttribute('aria-modal', 'true');
    /* the surround of a show is the product Slideshow's near black in both appearances
       (Slideshow.css, --pt-panel-ink and --pt-panel-text); home.css draws the show's ground and
       bar in --pt-ink and --pt-paper, which the dark appearance swaps (l3.md R25) */
    show.style.setProperty('--pt-ink', 'var(--pt-panel-ink)');
    show.style.setProperty('--pt-paper', 'var(--pt-panel-text)');
    if (heading !== null) {
      if (heading.id === '') heading.id = 'ts-home-present-h';
      show.setAttribute('aria-labelledby', heading.id);
    }
    const ink = document.createElement('div');
    ink.className = 'ts-home-show-ink';
    ink.setAttribute('aria-hidden', 'true');
    stage = document.createElement('div');
    stage.className = 'ts-home-show-stage';
    stage.dataset['showStage'] = '';
    stage.tabIndex = -1;
    const bar = document.createElement('div');
    bar.className = 'ts-home-show-bar';
    for (const key of ['count', 'notes', 'time'] as const) {
      const span = document.createElement('span');
      span.className = `ts-home-show-${key}`;
      parts[key] = span;
    }
    buttons.length = 0;
    for (const [key, words] of [
      ['previous', PRESENT.show.previous],
      ['next', PRESENT.show.next],
      ['exit', PRESENT.show.exit],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = words;
      button.dataset['showButton'] = key;
      buttons.push(button);
    }
    bar.append(parts.count!, parts.notes!, parts.time!, ...buttons);
    fitBar(bar);
    show.append(ink, stage, bar);
    show.addEventListener('keydown', onShowKey);
    stage.addEventListener('click', () => go(current + 1));
    buttons[0]?.addEventListener('click', () => go(current - 1));
    buttons[1]?.addEventListener('click', () => go(current + 1));
    buttons[2]?.addEventListener('click', () => close());
    band.append(show);
  };

  const paintShow = (): void => {
    if (stage === null) return;
    const state = store.get();
    const id = state.order[current] as HomeSlideId;
    const total = state.order.length;
    stage.replaceChildren(cloneSlide(root, state, id));
    settleEntrance(stage);
    stage.setAttribute('aria-label', PRESENT.stageName(current + 1, total));
    if (parts.count) parts.count.textContent = PRESENT.counter(current + 1, total);
    if (parts.notes)
      parts.notes.textContent = customerText(HOME_DECK.slides[id as HomeSlideId].notes, state.customer);
  };
  const paintTime = (): void => {
    const s = Math.floor((Date.now() - openedAt) / 1000);
    if (parts.time)
      parts.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /** P3: a cut to another slide, as Slideshow pages. */
  const go = (n: number): void => {
    const total = store.get().order.length;
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === current || show === null) return;
    current = next;
    paintShow();
    ctx.announce(ANNOUNCE.showCounter(current + 1, total));
  };

  const flip = (from: DOMRect, to: DOMRect): Keyframe => ({
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
    transformOrigin: '0 0',
  });

  const open = (): void => {
    if (show !== null || closing) return;
    finishBand('present');
    endHeroSequence();
    const state = store.get();
    current = Math.max(0, state.order.indexOf(chosen));
    build();
    paintShow();
    openedAt = Date.now();
    paintTime();
    clock = setInterval(paintTime, 1000);
    const from = displayHost.getBoundingClientRect();
    displayHost.style.visibility = 'hidden';
    const ink = show!.querySelector<HTMLElement>('.ts-home-show-ink')!;
    /* P1 and P2 */
    play(ink, [{ opacity: 0 }, { opacity: 1 }], 'ground', 'fade', 'present');
    play(
      stage!,
      [flip(from, stage!.getBoundingClientRect()), { transform: 'none', transformOrigin: '0 0' }],
      'beat',
      'move',
      'present',
    );
    stage!.focus({ preventScroll: true });
    ctx.announce(ANNOUNCE.showCounter(current + 1, state.order.length));
  };

  const close = (): void => {
    if (show === null || closing) return;
    clearInterval(clock);
    const leaving = show;
    const leavingStage = stage!;
    chosen = (store.get().order[current] as HomeSlideId | undefined) ?? chosen;
    const state = store.get();
    paintDisplay(state);
    paintList(state);
    const done = (): void => {
      leaving.remove();
      displayHost.style.visibility = '';
      show = null;
      stage = null;
      closing = false;
      present.focus({ preventScroll: true });
    };
    if (reduced()) {
      done();
      return;
    }
    closing = true;
    /* P4: the slide returns to its place over 400 ms while the ground clears over 300 ms */
    const to = displayHost.getBoundingClientRect();
    const from = leavingStage.getBoundingClientRect();
    const ink = leaving.querySelector<HTMLElement>('.ts-home-show-ink')!;
    play(ink, [{ opacity: 1 }, { opacity: 0 }], 'ground', 'fade', 'present');
    for (const el of leaving.querySelectorAll<HTMLElement>('.ts-home-show-bar'))
      el.style.visibility = 'hidden';
    const back = play(
      leavingStage,
      [{ transform: 'none', transformOrigin: '0 0' }, flip(to, from)],
      'exit',
      'move',
      'present',
    );
    if (back === null) done();
    else back.finished.then(done, done);
  };

  function onShowKey(event: KeyboardEvent): void {
    const target = event.target as Element;
    const onButton = target.closest('button') !== null;
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
        go(store.get().order.length - 1);
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
        const ring = buttons;
        const at = ring.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          at < 0
            ? event.shiftKey
              ? ring.length - 1
              : 0
            : (at + (event.shiftKey ? -1 : 1) + ring.length) % ring.length;
        ring[next]?.focus();
        return;
      }
      default:
    }
  }

  present.addEventListener('click', open);

  /* any new input on the band finishes its running motion at its end state first (LANDING.md 3.5) */
  const settle = (): void => {
    if (show !== null) finishBand('present');
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
    if (show !== null) return;
    const slideshow =
      (event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'Enter') ||
      (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'F5');
    if (!slideshow || isTextField(document.activeElement)) return;
    const focusedInBand = band.contains(document.activeElement);
    if (!focusedInBand && !halfInView()) return;
    event.preventDefault();
    open();
  });

  /* the deck changed elsewhere: the list, the chosen slide and an open show follow it */
  store.subscribe((state) => {
    paintList(state);
    if (shownSheet !== display) paintDisplay(state);
    if (show !== null && !closing) {
      current = Math.min(current, state.order.length - 1);
      paintShow();
    }
  });
  paintList(store.get());
}
