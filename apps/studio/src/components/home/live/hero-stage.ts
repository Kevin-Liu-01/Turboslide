import { ANNOUNCE } from '../copy';
import type { LoopStep } from '../loop.generated';
import type { HomeSlideId } from '../deck.generated';
import type { StepHandle } from './step';
import { heroDeveloped } from './hero';
import { cloneSlide } from './index';
import type { LiveContext } from './index';
import { loop, reduced, slowFactor } from './motion';
import type { LoopHandle } from './motion';
import { paintSlide, paintSlides } from './paint';
import type { HomeDeckState, SlideKey } from './state';

/**
 * The hero's stage (docs/LANDING.md 2.2, Kevin's pick "B: 96 px headline over a live editor frame
 * and an agent terminal side by side"; V1's file, imported by `stage.ts` when the core starts, a
 * chunk of its own): the editor frame's filmstrip, which shows a
 * slide in the frame by a cut, and the loop L-H (3.4), a staged sequence on the frame and the
 * terminal that writes nothing to the page deck or Version history.
 *
 * The filmstrip. A click, Enter or Space on a thumbnail shows that slide in the frame's stage: a
 * fresh root of the slide as the build wrote it (V2's `cloneSlide`, never a copy of the thumbnail,
 * whose drawn poses would read as the copy's rest), which `paintSlide` draws with the deck's state
 * and makes selectable, or slide 1's own instance with its Blue Marble. Up and Down move focus
 * among the thumbnails (a roving tab stop). The title row's counter follows the shown slide. On
 * every change of the store the thumbnails take the deck's order (a Tailor or miniature move, a
 * restore) and a slide the deck does not hold is hidden (a deleted slide, slide 5 in version 1); a
 * slide a menu row adds gets a thumbnail of its own (v2.md R21). While the loop stages the run's
 * start, the frame reads the deck's order without slide 5.
 *
 * The loop. A cycle holds slide 1 for 3 s; Restore clears the terminal, types `turboslide version
 * restore 1` and prints its answer, and slide 5 leaves the frame's filmstrip (the counters read
 * n / 8); then the recorded run's three steps play through V3's `playStep` on the agent's 24 ms
 * clock with the ink ring and flag, the frame cutting to slide 5 when step 1's answer lands and
 * slide 5 taking its recorded states (`bands/live.generated.ts`, imported on the loop's first
 * play); slide 5 holds for 2 s; a cut back to slide 1. The playing step tab carries
 * `aria-current="step"` and its 2 px ink rule fills across the step's length. V4's `loop` plays
 * it when the stage is at least half in view and pauses it otherwise; it registers once H5 has
 * ended (`heroDeveloped`) and its first cycle waits one beat (500 ms, 3.4) before the hold. A press
 * or a key in the stage stops it for good at its rest state before the press acts: a mouse button
 * at once, a finger or a pen only as a tap (lifted within the scroll slop), so a scroll that
 * starts on the frame leaves it playing, as a wheel does (2.2); the tap then acts on the rest
 * state, selecting the object under it as a first touch does. A step tab stops it for good, lands
 * the steps before it at once and plays the pressed one; a
 * change to slide 5 or its place in the deck (other than the customer's name or the kit) stops it
 * for good. Under reduced motion it never registers, and a step tab lands its step at once.
 */

type StepId = LoopStep['id'];
type StepModule = typeof import('./step');
type LoopModule = typeof import('../loop.generated');

/**
 * V3's step and the recorded loop, imported on the loop's first play or a tab's first press, so
 * neither travels in the live core (4.1's 64 KB and 20 KB; v2.md R24, v3.md R22).
 */
let modules: Promise<{ step: StepModule; loop: LoopModule }> | null = null;
const loadLoop = (): Promise<{ step: StepModule; loop: LoopModule }> =>
  (modules ??= Promise.all([import('./step'), import('../loop.generated')]).then(
    ([step, loop]) => ({ step, loop }),
  ));
type SlideState = 'absent' | 'placeholders' | 'titled' | 'filled';

const STEP_IDS: readonly StepId[] = ['restore', 'new', 'title', 'rows'];
const BEAT_MS = 500;
/** A finger or a pen that moves further than this before it lifts is a scroll, not a tap (px). */
const TAP_SLOP_PX = 10;
/** Slide 5, which the loop's Restore takes out of the frame's order. */
const SLIDE_5 = 'next-steps' as HomeSlideId;

/** The state slide 5 holds after each step of the run, and Restore's. */
const AFTER: Readonly<Record<StepId, SlideState>> = {
  restore: 'absent',
  new: 'placeholders',
  title: 'titled',
  rows: 'filled',
};

type LiveStates = { placeholders: string; titled: string };

export function startStage(ctx: LiveContext): void {
  const band = ctx.band;
  const stage = band.querySelector<HTMLElement>('[data-hero-stage]');
  const strip = band.querySelector<HTMLElement>('[data-hero-filmstrip]');
  const host = band.querySelector<HTMLElement>('[data-hero-slide]');
  const wrapper = host?.querySelector<HTMLElement>('[data-sheet="hero"]') ?? null;
  const counter = band.querySelector<HTMLElement>('[data-hero-counter]');
  const screen = band.querySelector<HTMLElement>('[data-hero-screen]');
  if (stage === null || strip === null || host === null || wrapper === null || screen === null)
    return;
  const heroRoot = wrapper.querySelector<HTMLElement>('[data-home-slides]');
  if (heroRoot === null) return;
  const thumbs = (): HTMLElement[] =>
    [...strip.querySelectorAll<HTMLElement>('[data-hero-thumb]')].filter((t) => !t.hidden);
  const thumbOf = (id: string): HTMLElement | null =>
    strip.querySelector<HTMLElement>(`[data-hero-thumb="${id}"]`);
  const restLines = [...screen.childNodes].map((node) => node.cloneNode(true));
  const thumbRoots = new Map<string, HTMLElement>();
  for (const thumb of strip.querySelectorAll<HTMLElement>('[data-hero-thumb]')) {
    const root = thumb.querySelector<HTMLElement>('[data-home-slides]');
    if (root !== null) thumbRoots.set(thumb.dataset['heroThumb'] ?? '', root);
  }

  /* ---- the frame: which slide it shows, and the order its filmstrip reads ---- */
  let shown: string = 'title';
  /** true while the loop stages the run's start: the deck's order without slide 5 */
  let staged = false;
  const orderNow = (): readonly string[] => {
    const order = ctx.store.get().order;
    return staged ? order.filter((id) => id !== SLIDE_5) : order;
  };

  const paintCounter = (): void => {
    const order = orderNow();
    const n = order.indexOf(shown) + 1;
    const text = `${n} / ${order.length}`;
    if (counter !== null && n > 0 && counter.textContent !== text) counter.textContent = text;
  };
  /**
   * The frame's thumbnails in the order the frame reads, each numbered by it, a slide the order
   * does not hold hidden after them; while the loop stages its order, the slide counters too.
   * `renumber` (paint.ts) has numbered them by the deck's order already; this puts the elements
   * in that order, which it never does, and applies the staged order over it.
   */
  const paintOrder = (): void => {
    const order = orderNow();
    const items = [...strip.querySelectorAll<HTMLElement>(':scope > [data-hero-thumb]')];
    const inOrder = order.flatMap((id) => {
      const thumb = thumbOf(id);
      return thumb === null ? [] : [thumb];
    });
    const want = [...inOrder, ...items.filter((t) => !inOrder.includes(t))];
    // moveBefore keeps a moved thumbnail's focus and its slide's state where the browser has it
    const parent = strip as HTMLElement & { moveBefore?: (n: Node, r: Node | null) => void };
    if (!want.every((t, i) => items[i] === t))
      for (const thumb of want) {
        if (typeof parent.moveBefore === 'function') parent.moveBefore(thumb, null);
        else strip.append(thumb);
      }
    for (const thumb of want) {
      const id = thumb.dataset['heroThumb'] ?? '';
      const n = order.indexOf(id) + 1;
      if (thumb.hidden !== (n === 0)) thumb.hidden = n === 0;
      const label = thumb.querySelector('[data-thumb-n]');
      if (label !== null && n > 0 && label.textContent !== String(n)) label.textContent = String(n);
    }
    if (!staged) return;
    for (const root of [
      ...strip.querySelectorAll<HTMLElement>('[data-home-slides]'),
      ...host.querySelectorAll<HTMLElement>('[data-home-slides]'),
    ]) {
      const n = order.indexOf(root.dataset['slide'] ?? '') + 1;
      if (n === 0) continue;
      for (const c of root.querySelectorAll('[data-counter-text]'))
        c.textContent = `${n} / ${order.length}`;
    }
  };
  const select = (id: string): void => {
    for (const thumb of strip.querySelectorAll<HTMLElement>('[data-hero-thumb]')) {
      const on = thumb.dataset['heroThumb'] === id;
      thumb.toggleAttribute('data-selected', on);
      if (on) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
      thumb.tabIndex = on ? 0 : -1;
    }
  };
  /** Puts a slide root in the frame's stage by a cut, the ring and flag kept beside it. */
  const place = (root: HTMLElement): void => {
    const current = wrapper.querySelector<HTMLElement>(':scope > [data-home-slides]');
    if (current === root) return;
    if (current === null) wrapper.prepend(root);
    else current.replaceWith(root);
  };
  const copyOf = (html: string | HTMLElement, id: string): HTMLElement => {
    let root: HTMLElement;
    if (typeof html === 'string') {
      const template = document.createElement('template');
      template.innerHTML = html;
      root = template.content.firstElementChild as HTMLElement;
    } else root = html.cloneNode(true) as HTMLElement;
    root.classList.remove('is-thumb');
    root.dataset['instance'] = `hero-${id}`;
    for (const el of root.querySelectorAll('[id]')) el.removeAttribute('id');
    return root;
  };
  /** Shows a slide of the deck in the frame (the filmstrip's cut). */
  const show = (id: string): void => {
    shown = id;
    select(id);
    if (id === 'title') place(heroRoot);
    else {
      const state = ctx.store.get();
      const fresh = cloneSlide(id as SlideKey, state, `hero-${id}`);
      const source = thumbRoots.get(id);
      const root = fresh ?? (source === undefined ? null : copyOf(source, id));
      if (root === null) return;
      root.classList.remove('is-thumb');
      place(root);
      paintSlide(root, state);
      paintSlides(strip, state);
      paintOrder();
    }
    paintCounter();
  };

  /** A thumbnail for each slide a menu row added, placed after the slide before it in the order. */
  const syncAdded = (state: HomeDeckState): void => {
    for (const key of state.order) {
      if (!key.startsWith('added-') || thumbOf(key) !== null) continue;
      const root = cloneSlide(key, state, `hero-thumb-${key}`);
      if (root === null) continue;
      root.classList.add('is-thumb');
      const item = document.createElement('li');
      item.className = 'ts-hero-thumb';
      item.dataset['heroThumb'] = key;
      item.tabIndex = -1;
      const n = document.createElement('span');
      n.className = 'ts-hero-thumb-n';
      n.setAttribute('data-thumb-n', '');
      n.setAttribute('aria-hidden', 'true');
      const sheet = document.createElement('div');
      sheet.className = 'ts-home-sheet is-thumb';
      sheet.dataset['sheet'] = `hero-thumb-${key}`;
      sheet.append(root);
      item.append(n, sheet);
      // placed at the end here; `paintOrder` puts every thumbnail in the deck's order
      strip.append(item);
      thumbRoots.set(key, root);
      paintSlide(root, state);
    }
    for (const [key, root] of thumbRoots)
      if (key.startsWith('added-') && !state.order.includes(key as SlideKey)) {
        root.closest('[data-hero-thumb]')?.remove();
        thumbRoots.delete(key);
      }
    paintSlides(strip, state);
  };

  /* ---- the filmstrip's keys and presses ---- */
  strip.addEventListener('click', (event) => {
    const thumb = (event.target as Element).closest<HTMLElement>('[data-hero-thumb]');
    if (thumb === null) return;
    const id = thumb.dataset['heroThumb'] ?? 'title';
    show(id);
    const order = orderNow();
    ctx.announce(ANNOUNCE.showCounter(order.indexOf(id) + 1, order.length));
  });
  strip.addEventListener('keydown', (event) => {
    const thumb = (event.target as Element).closest<HTMLElement>('[data-hero-thumb]');
    if (thumb === null || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      thumb.click();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const list = thumbs();
    const at = list.indexOf(thumb);
    const next =
      list[Math.max(0, Math.min(list.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next === undefined) return;
    for (const t of list) t.tabIndex = t === next ? 0 : -1;
    next.focus();
  });

  /* ---- the loop L-H ---- */
  const stepButtons = new Map<StepId, HTMLButtonElement>();
  for (const id of STEP_IDS) {
    const button = band.querySelector<HTMLButtonElement>(`[data-hero-step="${id}"]`);
    if (button !== null) stepButtons.set(id, button);
  }
  const stepOf = (loop: LoopModule, id: StepId): LoopStep =>
    loop.HOME_LOOP.steps.find((s) => s.id === id) ?? loop.HOME_LOOP.steps[0]!;

  let states: LiveStates | null = null;
  const loadStates = async (): Promise<LiveStates> => {
    if (states !== null) return states;
    const live = await import('../bands/live.generated');
    states = live.LIVE_SLIDE_HTML.nextSteps;
    return states;
  };

  /** Draws slide 5 in a state on its thumbnail and, when shown, in the frame. */
  const slide5 = (state: SlideState, show5: boolean): HTMLElement | null => {
    const thumb = thumbOf('next-steps');
    const rest = thumbRoots.get('next-steps');
    if (thumb === null || rest === undefined) return null;
    const sheet = thumb.querySelector<HTMLElement>('.ts-home-sheet');
    let markup: HTMLElement;
    if (state === 'filled' || state === 'absent' || states === null) markup = rest;
    else {
      const thumbCopy = copyOf(states[state], 'next-steps');
      thumbCopy.classList.add('is-thumb');
      thumbCopy.dataset['instance'] = 'hero-thumb-next-steps';
      markup = thumbCopy;
    }
    const current = sheet?.querySelector<HTMLElement>(':scope > [data-home-slides]');
    if (sheet !== null && current !== markup) {
      if (current === null || current === undefined) sheet.prepend(markup);
      else current.replaceWith(markup);
      paintSlides(sheet, ctx.store.get());
    }
    if (!show5) return null;
    shown = 'next-steps';
    select('next-steps');
    const now = ctx.store.get();
    const root =
      state === 'filled' || states === null
        ? (cloneSlide('next-steps', now, 'hero-next-steps') ?? copyOf(rest, 'next-steps'))
        : copyOf(states[state as 'placeholders' | 'titled'], 'next-steps');
    root.classList.remove('is-thumb');
    place(root);
    paintSlide(root, now);
    paintOrder();
    paintCounter();
    return root;
  };

  /** The frame at the deck as the store holds it: slide 1 shown, slide 5 filled, the transcript. */
  const toRest = (): void => {
    staged = false;
    slide5('filled', false);
    paintSlides(strip, ctx.store.get());
    show('title');
    screen.replaceChildren(...restLines.map((n) => n.cloneNode(true)));
    for (const button of stepButtons.values()) {
      button.removeAttribute('aria-current');
      button.style.removeProperty('--ts-step-progress');
    }
  };

  /** Lands a step's change on the frame (the recorded state after it); returns the ring's target. */
  const land = (id: StepId): HTMLElement | null => {
    if (id === 'restore') {
      staged = true;
      slide5('absent', false);
      show('title');
      paintOrder();
      paintCounter();
      return null;
    }
    staged = false;
    paintSlides(strip, ctx.store.get());
    const root = slide5(AFTER[id], true);
    if (root === null) return null;
    if (id === 'new') return root;
    return (
      root.querySelector<HTMLElement>(
        id === 'title' ? '[data-block="h"]' : '[data-block="rows"]',
      ) ?? root
    );
  };

  let handle: StepHandle | null = null;
  let playing: StepId | null = null;
  /** the pausable wait of the loop's holds */
  let hold: { remaining: number; timer: number; resolve: () => void; started: number } | null =
    null;
  let running = false;
  let stoppedForGood = false;
  let loopHandle: LoopHandle | null = null;
  let frame = 0;
  let stepStarted = 0;
  let stepElapsed = 0;

  const ruleTick = (): void => {
    if (playing === null || handle === null) return;
    const button = stepButtons.get(playing);
    const elapsed = stepElapsed + (performance.now() - stepStarted);
    const p = Math.min(1, elapsed / Math.max(1, handle.length));
    button?.style.setProperty('--ts-step-progress', p.toFixed(4));
    frame = window.requestAnimationFrame(ruleTick);
  };

  const wait = (msIn: number): Promise<void> =>
    new Promise<void>((resolve) => {
      const ms = msIn * slowFactor();
      hold = { remaining: ms, timer: 0, resolve, started: performance.now() };
      if (running) hold.timer = window.setTimeout(() => endHold(), ms);
    });
  const endHold = (): void => {
    const h = hold;
    hold = null;
    h?.resolve();
  };

  const playOne = async (id: StepId, track: boolean): Promise<void> => {
    if (id === 'new' || id === 'title' || id === 'rows') await loadStates();
    const { step: steps, loop } = await loadLoop();
    const step = steps.loopStep(stepOf(loop, id), ctx.store.get().customer);
    playing = id;
    const button = stepButtons.get(id);
    button?.setAttribute('aria-current', 'step');
    button?.style.setProperty('--ts-step-progress', '0');
    stepElapsed = 0;
    stepStarted = performance.now();
    const mine = steps.playStep({ terminal: { narrow: screen }, sheet: wrapper }, step, {
      clear: id === 'restore',
      land: () => land(id),
      band: 'hero',
      track,
    });
    handle = mine;
    if (running || track) {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(ruleTick);
    } else mine.pause();
    await mine.done;
    /* a step tab's press may have started its own step meanwhile: clean up only this one's */
    if (handle !== mine) return;
    window.cancelAnimationFrame(frame);
    button?.style.setProperty('--ts-step-progress', '1');
    button?.removeAttribute('aria-current');
    playing = null;
    handle = null;
  };

  const cycle = async (): Promise<void> => {
    /* one beat after H5 before the first hold (3.4: ms('beat') is 0 under reduced motion, which
       never plays the loop, so the 500 ms is a constant) */
    const loading = loadLoop();
    await wait(BEAT_MS);
    const { loop } = await loading;
    while (!stoppedForGood) {
      await wait(loop.HOME_LOOP.holdFirstMs);
      for (const id of STEP_IDS) {
        if (stoppedForGood) return;
        await playOne(id, false);
        for (const b of stepButtons.values()) b.style.removeProperty('--ts-step-progress');
      }
      if (stoppedForGood) return;
      await wait(loop.HOME_LOOP.holdLastMs);
      if (stoppedForGood) return;
      /* the cut back to slide 1, the deck as the store holds it */
      staged = false;
      paintSlides(strip, ctx.store.get());
      show('title');
    }
  };
  let cycling: Promise<void> | null = null;

  const play = (): void => {
    if (stoppedForGood) return;
    running = true;
    if (cycling === null) {
      cycling = cycle();
      return;
    }
    if (hold !== null && hold.timer === 0) {
      hold.started = performance.now();
      hold.timer = window.setTimeout(() => endHold(), hold.remaining);
    }
    if (handle !== null) {
      handle.resume();
      stepStarted = performance.now();
      frame = window.requestAnimationFrame(ruleTick);
    }
  };
  const pause = (): void => {
    running = false;
    if (hold !== null && hold.timer !== 0) {
      window.clearTimeout(hold.timer);
      hold.remaining = Math.max(0, hold.remaining - (performance.now() - hold.started));
      hold.timer = 0;
    }
    if (handle !== null) {
      handle.pause();
      stepElapsed += performance.now() - stepStarted;
    }
    window.cancelAnimationFrame(frame);
  };

  /** Stops the loop for good: the step finished, the holds dropped, the frame at rest. */
  const stopForGood = (toRestState: boolean): void => {
    if (stoppedForGood) return;
    stoppedForGood = true;
    running = false;
    loopHandle?.stop();
    if (hold !== null) {
      window.clearTimeout(hold.timer);
      const h = hold;
      hold = null;
      h.resolve();
    }
    window.cancelAnimationFrame(frame);
    handle?.finish();
    handle = null;
    playing = null;
    if (toRestState) toRest();
  };

  /* a press or a key in the stage stops the loop for good at its rest state before it acts; the
     capture phase runs first, so the press then acts on the rest state. A mouse button stops it
     at once. A finger or a pen stops it only as a tap: until it lifts within the slop it may be
     the page's scroll, which leaves the loop playing (2.2: a wheel does not stop it), so its down
     goes no further than the stage while the loop plays (the replica selects nothing on a staged
     slide), and the tap, once the frame is at rest, selects the object under it as a first touch
     does (5 "Touch and zoom") and lets its click show a thumbnail */
  let tap: { id: number; x: number; y: number } | null = null;
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (stoppedForGood) return;
      if (event.pointerType === 'mouse') {
        stopForGood(true);
        return;
      }
      tap = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
      event.stopPropagation();
    },
    { capture: true },
  );
  stage.addEventListener(
    'pointermove',
    (event) => {
      if (tap === null || event.pointerId !== tap.id) return;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX) tap = null;
    },
    { capture: true, passive: true },
  );
  stage.addEventListener(
    'pointercancel',
    (event) => {
      if (tap !== null && event.pointerId === tap.id) tap = null;
    },
    { capture: true },
  );
  stage.addEventListener(
    'pointerup',
    (event) => {
      const t = tap;
      tap = null;
      if (t === null || event.pointerId !== t.id || stoppedForGood) return;
      if (Math.hypot(event.clientX - t.x, event.clientY - t.y) > TAP_SLOP_PX) return;
      stopForGood(true);
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const object = hit?.closest<HTMLElement>('[data-object]') ?? null;
      if (object !== null && wrapper.contains(object) && object.tabIndex >= 0)
        object.focus({ preventScroll: true });
    },
    { capture: true },
  );
  stage.addEventListener('keydown', () => stopForGood(true), { capture: true });

  /* a step tab: the steps before it land at once, the pressed one plays; Restore after the run
     takes the frame to the run's start */
  let tabRun: Promise<void> = Promise.resolve();
  for (const [id, button] of stepButtons)
    button.addEventListener('click', () => {
      const first = !stoppedForGood;
      stopForGood(first);
      tabRun = tabRun.then(async () => {
        if (first) {
          const at = STEP_IDS.indexOf(id);
          for (const before of STEP_IDS.slice(0, at)) {
            if (before !== 'restore') await loadStates();
            const { step: steps, loop } = await loadLoop();
            const step = steps.loopStep(stepOf(loop, before), ctx.store.get().customer);
            const h = steps.playStep({ terminal: { narrow: screen }, sheet: wrapper }, step, {
              clear: before === 'restore',
              land: () => land(before),
              band: 'hero',
              track: false,
            });
            h.finish();
            await h.done;
          }
        }
        running = true;
        await playOne(id, true);
        running = false;
      });
    });

  /* a change to slide 5 or its place (a chip, a menu row, the filmstrip, a restore) stops it, at
     the rest state, so the frame never keeps a staged slide 5 or order the deck does not hold; the
     recorded run's step is part of it, since a restore of version 2 or 3 keeps slide 5's place and
     draws its placeholders (v2.md R27) */
  const signature = (state: HomeDeckState): string =>
    JSON.stringify([
      state.agentStep,
      state.order.indexOf('next-steps' as HomeSlideId),
      state.order.length,
      state.skipped['next-steps' as HomeSlideId] === true,
      state.nextSteps,
      state.canvas['next-steps' as HomeSlideId] === true,
      Object.entries(state.poses).filter(([k]) => k.startsWith('next-steps#')),
      Object.entries(state.texts).filter(([k]) => k.startsWith('next-steps#')),
      state.removed,
    ]);
  let last = signature(ctx.store.get());
  ctx.store.subscribe((state) => {
    syncAdded(state);
    const now = signature(state);
    if (now !== last) {
      last = now;
      // at the deck's own state: no staged order, slide 5 as the deck holds it, slide 1 shown
      stopForGood(true);
    }
    paintOrder();
    // a slide that left the deck leaves the frame: the first slide of the order shows by a cut
    const order = orderNow();
    if (!order.includes(shown) && order[0] !== undefined) show(order[0]);
    else if (shown === 'title' || stoppedForGood) paintCounter();
  });

  show('title');
  if (reduced()) return;

  /* L-H registers once H5 has ended (V4's `heroDeveloped`, at once when it never ran) */
  void heroDeveloped().then(() => {
    if (loopHandle !== null || stoppedForGood) return;
    loopHandle = loop('hero', stage, {
      kind: 'demonstration',
      id: 'L-H',
      play,
      pause,
      still: () => undefined,
    });
  });
}
