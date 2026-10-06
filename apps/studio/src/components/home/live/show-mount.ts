import { ANNOUNCE, PRESENT } from '../copy';
import type { HomeSlideId } from '../deck.generated';
import { play, reduced } from './motion';
import { factsOf, openShows, settleEntrance, showSlide, shownSlides } from './show';
import type { ShowHandle } from './show';
import type { HomeStore, SlideKey } from './state';
import { customerText } from './tailor';

/**
 * The show itself (docs/LANDING.md 2.11, 3.6 P1 to P4): the dialog over its host with the slide,
 * the bar, the timer and the notes, opened from the Present band's Present, its keys and the
 * miniature's View > Slideshow. A chunk of its own, asked for on the first hover or focus of
 * Present and loaded before the show opens, so it is not part of the page's script until a
 * person presents (docs/DESIGN.md 8.16, the design round's finishing fix); `show.ts` keeps the
 * band's list, its chosen slide and the slide copies every band draws.
 */

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

export function mountShow(options: ShowOptions): ShowHandle {
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
