import type { Band } from './state';

/**
 * The page's motion system (docs/LANDING.md section 3; the first pass's helpers, fixed on day 0 in
 * docs/gslides-parity/landing/build/integrator.md "Landing, day 0" 4.5, and the second pass's loop
 * scheduler and Pause Motion, 6.3 "The motion API"). V4 owns this file; every band of the live
 * module animates through it, so the rules of section 3 hold in one place:
 *
 * - Durations and curves are grammar.css's tokens (3.1), read through `getComputedStyle`, so the
 *   one media block that sets every duration to 0 ms under reduced motion (3.6) stops every motion
 *   here too. No file writes the length of a motion as a literal: a token the stylesheet does not
 *   answer reads 0 ms, the end state at once. Holds, clocks and input windows (the agent flag's
 *   800 ms, the 24 ms agent clock, the 700 ms nudge step) are constants of their own code.
 * - `play` makes one Web Animation, or none under reduced motion or at 0 ms, where it sets the
 *   last keyframe at once. When the animation ends it writes the last keyframe inline and cancels
 *   the animation, so `document.getAnimations()` is empty at rest (row `home.motion.rest`).
 * - Every running animation and script sequence is tracked by its band, so `finishBand` (any new
 *   input on a band, 3.5) and `finishAll` (a hidden tab, a change of reduced motion) end it at its
 *   end state.
 * - `?slow=10` multiplies the page's timers by ten for the frame strips (3.8) and does nothing
 *   else.
 * - A loop (3.1, 3.4: the hero's staged run, the interludes, the two people, the pattern's shader)
 *   registers with `loop(band, element, spec)`; the scheduler alone calls its `play` and `pause`,
 *   from one `IntersectionObserver` (B's rule: at most one demonstration, the one most in view of
 *   those at least half in view, and the two fields most in view), the tab's visibility, reduced
 *   motion and Pause Motion. A paused loop holds its frame and no frame callback or timer.
 * - Pause Motion (3.2) is `html[data-motion="paused"]`, which the boot script sets before the first
 *   paint and toggles from the navigation's button; this module follows the attribute.
 * - One frame clock (`onFrame`): `requestAnimationFrame` runs only while a loop plays or a
 *   sequence runs, and nothing else here calls it.
 *
 * Positions move by `transform` only (3.7).
 */

export type DurationToken =
  | 'fast'
  | 'state'
  | 'row'
  | 'settle'
  | 'ground'
  | 'exit'
  | 'beat'
  | 'line'
  | 'lit'
  | 'gather'
  | 'develop';

export type CurveToken = 'arrive' | 'move' | 'tone' | 'fade';

/**
 * A band that runs sequences: the bands of the store, the field strip, the close and the bands of
 * the second pass that hold motions of their own.
 */
export type SequenceBand = Band | 'field' | 'close' | 'people' | 'patterns' | 'interlude';

type Running = { band: SequenceBand; finish: () => void };

/** Every running animation and script sequence, by band. */
const running = new Set<Running>();

let slow: number | null = null;

/** 10 with `?slow=10`, else 1 (3.8). */
export function slowFactor(): number {
  if (slow === null) {
    try {
      slow = new URLSearchParams(window.location.search).get('slow') === '10' ? 10 : 1;
    } catch {
      slow = 1;
    }
  }
  return slow;
}

/** Whether the visitor asks for reduced motion (3.6). */
export function reduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function rootVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `--ts-d-<token>` in ms from the root's computed style, times `slowFactor()`; 0 when reduced. */
export function ms(token: DurationToken): number {
  if (reduced()) return 0;
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(rootVar(`--ts-d-${token}`));
  if (match === null) return 0;
  const value = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value * slowFactor() : 0;
}

/** The CSS value of `--ts-ease-<token>`, for a Web Animation's `easing`. */
export function ease(token: CurveToken): string {
  return rootVar(`--ts-ease-${token}`) || 'linear';
}

/** 3t^2 - 2t^3 on t clamped to 0 to 1: the tone curve in script, equal to `--ts-ease-tone`. */
export function smoothstep(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

const KEYFRAME_META = new Set(['offset', 'easing', 'composite']);

/** Writes a keyframe's properties inline: the state an animation ends in, kept after it is gone. */
function setStyles(el: Element, keyframe: Keyframe): void {
  const style = (el as HTMLElement | SVGElement).style as CSSStyleDeclaration | undefined;
  if (style === undefined) return;
  for (const [key, value] of Object.entries(keyframe)) {
    if (KEYFRAME_META.has(key) || value === null || value === undefined) continue;
    const name = key.startsWith('--')
      ? key
      : key === 'cssFloat'
        ? 'float'
        : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    style.setProperty(name, String(value));
  }
}

/**
 * One Web Animation from the tokens; null under reduced motion or at 0 ms, with the last keyframe
 * set at once. On its end it commits its styles and cancels, so `document.getAnimations()` is
 * empty at rest (home.motion.rest); it is tracked so `finishBand` and `finishAll` end it. The fill
 * is `both`, so a staggered item holds its first keyframe through its delay. `delayMs` is a
 * stagger or a beat in real ms; it is multiplied by `slowFactor()` like the duration.
 */
export function play(
  el: Element,
  keyframes: Keyframe[],
  token: DurationToken,
  curve: CurveToken,
  band: SequenceBand,
  delayMs = 0,
): Animation | null {
  const last = keyframes[keyframes.length - 1];
  const duration = ms(token);
  if (last === undefined) return null;
  if (duration === 0 || typeof el.animate !== 'function') {
    setStyles(el, last);
    return null;
  }
  const animation = el.animate(keyframes, {
    duration,
    delay: Math.max(0, delayMs) * slowFactor(),
    easing: ease(curve),
    fill: 'both',
  });
  let settled = false;
  const entry: Running = {
    band,
    finish: () => {
      if (settled) return;
      settled = true;
      running.delete(entry);
      /* finish() resolves the animation's `finished` promise before cancel(), so a caller that
         awaits it is answered, never rejected, when input ends the motion early */
      try {
        animation.finish();
      } catch {
        /* an animation that cannot finish is cancelled below all the same */
      }
      setStyles(el, last);
      animation.cancel();
    },
  };
  running.add(entry);
  animation.addEventListener('finish', entry.finish);
  /* another hand cancelled it: it no longer runs, and its end state is that hand's to set */
  animation.addEventListener('cancel', () => {
    settled = true;
    running.delete(entry);
  });
  return animation;
}

/**
 * Registers a running script sequence (a field's frames, a run of timers); `finish` must set its
 * end state and stop its own frames and timers. The sequence calls `done()` when it ends by
 * itself.
 */
export function sequence(band: SequenceBand, finish: () => void): { done(): void } {
  const entry: Running = { band, finish };
  running.add(entry);
  return {
    done() {
      running.delete(entry);
    },
  };
}

/** Ends every running animation and sequence of a band at its end state (3.5: new input). */
export function finishBand(band: SequenceBand): void {
  for (const entry of [...running]) {
    if (entry.band !== band) continue;
    running.delete(entry);
    entry.finish();
  }
}

/** Ends every running animation and sequence at its end state (3.5: a hidden tab, reduced motion). */
export function finishAll(): void {
  for (const entry of [...running]) {
    running.delete(entry);
    entry.finish();
  }
}

/** How many animations and sequences run now, by band (the drivers' and the tests' reading). */
export function runningCount(band?: SequenceBand): number {
  let n = 0;
  for (const entry of running) if (band === undefined || entry.band === band) n += 1;
  return n;
}

/* ---- the one shot motions (LANDING.md 3.1, 3.5): the observer at 35 percent ---- */

/** The share of a motion's target in view that plays it (3.5). */
export const IN_VIEW = 0.35;

type Watched = { arm: () => void; play: () => void; end: () => void; first: boolean };
const watched = new Map<Element, Watched>();
let observer: IntersectionObserver | null = null;

function observed(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const item = watched.get(entry.target);
    if (item === undefined) continue;
    if (item.first) {
      item.first = false;
      const viewport = entry.rootBounds?.height ?? window.innerHeight;
      /* below the viewport: arm the hidden first pose and wait; in it or above it: the markup is
         the end state and nothing plays, so nothing seen changes by itself */
      if (!entry.isIntersecting && entry.boundingClientRect.top >= viewport) {
        item.arm();
        continue;
      }
      watched.delete(entry.target);
      observer?.unobserve(entry.target);
      continue;
    }
    if (entry.isIntersecting && entry.intersectionRatio >= IN_VIEW) {
      watched.delete(entry.target);
      observer?.unobserve(entry.target);
      /* Pause Motion (3.2): a one shot motion not yet played is drawn at its end state when its
         band arrives */
      if (motionPaused()) item.end();
      else item.play();
    }
  }
}

/**
 * Once, at 35 percent in view (3.5). `arm()` sets the hidden first pose and is called only when the
 * element is wholly below the viewport at its first observation; then `play()` runs when 35
 * percent of it is in view and the element is unobserved, or `end()` (the end state at once) when
 * motion is paused then. An element in the viewport or above it at its first observation renders
 * final and nothing plays. Under reduced motion or with Pause Motion pressed at registration
 * nothing is armed.
 */
export function onceInView(
  el: Element,
  arm: () => void,
  play: () => void,
  end: () => void = play,
): void {
  if (reduced() || motionPaused() || typeof IntersectionObserver !== 'function') return;
  installGuards();
  observer ??= new IntersectionObserver(observed, { threshold: [0, IN_VIEW] });
  watched.set(el, { arm, play, end, first: true });
  observer.observe(el);
}

/**
 * E1 (3.5): the export seam's hint. Its root is observed like every one shot motion: armed (the cut
 * at 82 percent) only when it is below the viewport at its first observation, then played one beat
 * (`--ts-d-beat`) after 35 percent of it is in view. The beat is a sequence of the band, so a press,
 * a key, a hidden tab or Pause Motion during it plays the hint's end state at once (the cut at 50).
 */
export function hintInView(band: HTMLElement, arm: () => void, hint: () => void): void {
  const root =
    band.querySelector('[data-seam-root]') ?? band.querySelector('[data-seam]')?.parentElement;
  if (root == null) return;
  const end = (): void => {
    hint();
    finishBand('export');
  };
  onceInView(
    root,
    arm,
    () => {
      let timer = 0;
      const wait = sequence('export', () => {
        window.clearTimeout(timer);
        end();
      });
      timer = window.setTimeout(() => {
        wait.done();
        hint();
      }, ms('beat'));
    },
    end,
  );
}

/* ---- the frame clock (3.8) ---- */

type Tick = (dt: number, now: number) => void;
const ticks = new Set<Tick>();
let frameId = 0;
let lastFrame = 0;

function frame(): void {
  const now = performance.now();
  /* the page's clock, not the frame's timestamp, which a DevTools playback rate rescales; a long
     gap (a hidden tab, a debugger) counts as one frame */
  const dt = Math.min(64, now - lastFrame) / slowFactor();
  lastFrame = now;
  for (const tick of [...ticks]) tick(dt, now);
  frameId = ticks.size > 0 ? requestAnimationFrame(frame) : 0;
}

/**
 * Runs `tick(dt, now)` every frame until the returned function is called; `dt` is the frame's
 * length in ms divided by `slowFactor()`. `requestAnimationFrame` runs only while a tick is
 * registered (3.8), so a paused or finished motion costs no frame.
 */
export function onFrame(tick: Tick): () => void {
  ticks.add(tick);
  if (frameId === 0) {
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }
  return () => {
    ticks.delete(tick);
    if (ticks.size === 0 && frameId !== 0) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
}

/** A staged sequence's events on one clock: `advance` plays them, `seek` lands them at once. */
export type Timeline = {
  /** adds an event at `t` ms; `instant` is true when `seek` lands it rather than play */
  at(t: number, fn: (instant: boolean) => void): Timeline;
  /** moves the clock by `dt` ms, firing the events it passes; at the end it resets and loops */
  advance(dt: number): void;
  /** resets, then fires every event up to `t` with `instant` true */
  seek(t: number): void;
  /** the clock in ms */
  readonly time: number;
  readonly length: number;
};

/**
 * B's timeline (`direction-b/landing.js` 215 to 258): events in time order on one clock, with a
 * reset that puts the loop's rest state back at every cycle's start, so a seek reaches the same
 * state however the clock got there and a paused loop resumes from the frame it held.
 */
export function timeline(length: number, reset: () => void): Timeline {
  const events: { t: number; fn: (instant: boolean) => void }[] = [];
  let sorted = true;
  let time = 0;
  let next = 0;
  const fireTo = (t: number, instant: boolean): void => {
    if (!sorted) {
      events.sort((a, b) => a.t - b.t);
      sorted = true;
    }
    while (next < events.length && events[next]!.t <= t) {
      events[next]!.fn(instant);
      next += 1;
    }
  };
  const restart = (): void => {
    time = 0;
    next = 0;
    reset();
  };
  const line: Timeline = {
    at(t, fn) {
      events.push({ t, fn });
      sorted = false;
      return line;
    },
    advance(dt) {
      time += dt;
      fireTo(time, false);
      if (time >= length) restart();
    },
    seek(t) {
      restart();
      time = t;
      fireTo(t, true);
    },
    get time() {
      return time;
    },
    length,
  };
  return line;
}

/* ---- Pause Motion (3.2) ---- */

/** The localStorage key of Pause Motion's choice (boot.ts writes the same). */
const MOTION_KEY = 'ts-home-motion';

/** Whether Pause Motion is pressed: `html[data-motion="paused"]` (3.2). */
export function motionPaused(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset['motion'] === 'paused';
}

const motionListeners = new Set<(paused: boolean) => void>();

/** Calls `fn(paused)` after every press of Pause Motion; returns the function that stops it. */
export function onMotionChange(fn: (paused: boolean) => void): () => void {
  motionListeners.add(fn);
  return () => motionListeners.delete(fn);
}

/**
 * The button's behaviour when the boot script did not run (a client side navigation to /home
 * inserts the inline script without running it): the same toggle as boot.ts.
 */
function toggleWithoutBoot(event: Event): void {
  if (window.tsHomeBoot !== undefined) return;
  const button = (event.target as Element | null)?.closest?.('[data-motion-toggle]');
  if (button == null) return;
  const root = document.documentElement;
  const pause = !motionPaused();
  if (pause) root.dataset['motion'] = 'paused';
  else delete root.dataset['motion'];
  button.setAttribute('aria-pressed', String(pause));
  try {
    if (pause) localStorage.setItem(MOTION_KEY, 'paused');
    else localStorage.removeItem(MOTION_KEY);
  } catch {
    /* the choice holds for the visit when storage throws */
  }
}

/** The button's pressed state from the attribute (the inline nav script sets it at first paint). */
function syncButtons(): void {
  const paused = String(motionPaused());
  for (const button of document.querySelectorAll('[data-motion-toggle]'))
    if (button.getAttribute('aria-pressed') !== paused) button.setAttribute('aria-pressed', paused);
}

function motionChanged(): void {
  const paused = motionPaused();
  syncButtons();
  if (paused) {
    /* within one frame of the press: a running one shot motion lands at its end state, and H5's
       still shows if its develop has not started */
    window.tsHomeBoot?.end();
    finishAll();
  }
  schedule();
  for (const fn of [...motionListeners]) fn(paused);
}

/* ---- the loops (3.1, 3.4, 3.8) ---- */

export type LoopKind = 'demonstration' | 'field';

export type LoopSpec = {
  kind: LoopKind;
  /** starts or resumes from the frame it holds; called by the scheduler alone */
  play(): void;
  /** holds the current frame: no frame callback and no timer after it returns */
  pause(): void;
  /** draws the still (reduced motion, Pause Motion at load, a change to reduced motion) */
  still(): void;
  /** the loop's id in `tsHomeMotion` (L-H, I1:<next band>, P-L, P-T); the band's by default */
  id?: string;
};

export type LoopHandle = {
  readonly id: string;
  /** stops the loop for good (a press in the hero's or the people's stage): paused, never resumed */
  stop(): void;
};

type Loop = {
  id: string;
  band: string;
  el: Element;
  spec: LoopSpec;
  vis: number;
  running: boolean;
  stopped: boolean;
};

const LOOP_IDS: Readonly<Record<string, string>> = { hero: 'L-H', people: 'P-L', patterns: 'P-T' };

const loops: Loop[] = [];
let loopObserver: IntersectionObserver | null = null;

/** The loops' observer's thresholds (3.8). */
const LOOP_THRESHOLDS = [0, 0.1, 0.25, 0.5, 0.75, 1];
/** A demonstration plays at least half in view (3.1). */
const HALF = 0.5;

/** How much of a loop's element is in view: its own share, or the viewport's for a tall one. */
function visibilityOf(entry: IntersectionObserverEntry): number {
  if (!entry.isIntersecting) return 0;
  const viewport = entry.rootBounds?.height ?? window.innerHeight;
  const ofViewport = viewport > 0 ? entry.intersectionRect.height / viewport : 0;
  return Math.max(entry.intersectionRatio, Math.min(1, ofViewport));
}

function call(fn: () => void, what: string): void {
  try {
    fn();
  } catch (error) {
    console.error(`the loop ${what} did not run`, error);
  }
}

/** Whether a loop may move now: no reduced motion, no Pause Motion, a visible tab. */
function loopsAllowed(): boolean {
  return !reduced() && !motionPaused() && document.visibilityState !== 'hidden';
}

/**
 * B's `schedule()` (`direction-b/landing.js` 175 to 202): at most one demonstration plays, the one
 * most in view of those at least half in view (the one playing keeps a tie), and at most two
 * fields, the two most in view with any part in view; every other loop is paused.
 */
function schedule(): void {
  const allowed = loopsAllowed();
  let best: Loop | null = null;
  for (const item of loops) {
    if (item.spec.kind !== 'demonstration' || item.stopped || item.vis < HALF) continue;
    if (best === null || item.vis > best.vis || (item.vis === best.vis && item.running))
      best = item;
  }
  const fields = loops
    .filter((item) => item.spec.kind === 'field' && !item.stopped && item.vis > 0)
    .sort((a, b) => b.vis - a.vis || Number(b.running) - Number(a.running))
    .slice(0, 2);
  for (const item of loops) {
    if (item.stopped) continue;
    const on =
      allowed && (item.spec.kind === 'demonstration' ? item === best : fields.includes(item));
    if (on && !item.running) {
      item.running = true;
      call(() => item.spec.play(), `${item.id} play`);
    } else if (!on && item.running) {
      item.running = false;
      call(() => item.spec.pause(), `${item.id} pause`);
    }
  }
}

function loopsObserved(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries)
    for (const item of loops) if (item.el === entry.target) item.vis = visibilityOf(entry);
  schedule();
}

/**
 * Registers a loop on `element` (3.8): the scheduler plays it while it may move and is in view by
 * its kind's rule, and pauses it otherwise. Under reduced motion or with Pause Motion pressed its
 * still is drawn at once. Returns its id and `stop()`.
 */
export function loop(band: string, element: Element, spec: LoopSpec): LoopHandle {
  installGuards();
  const id = spec.id ?? LOOP_IDS[band] ?? band;
  const item: Loop = { id, band, el: element, spec, vis: 0, running: false, stopped: false };
  loops.push(item);
  if (reduced() || motionPaused()) call(() => spec.still(), `${id} still`);
  if (typeof IntersectionObserver === 'function') {
    loopObserver ??= new IntersectionObserver(loopsObserved, { threshold: LOOP_THRESHOLDS });
    loopObserver.observe(element);
  }
  return {
    id,
    stop() {
      if (item.stopped) return;
      item.stopped = true;
      if (item.running) {
        item.running = false;
        call(() => spec.pause(), `${id} pause`);
      }
      schedule();
    },
  };
}

/** The drivers' reading of the loops (3.8), on `window.tsHomeMotion`. */
export type HomeMotionState = {
  readonly paused: boolean;
  /** the loop ids playing now */
  running(): string[];
  /** every loop id registered with `loop` on the page */
  registered(): string[];
  /** the loop ids stopped for good (`LoopHandle.stop`: a press in the hero's or the people's stage) */
  stopped(): string[];
  /** each registered loop's last read share in view, 0 to 1 */
  visible(): Record<string, number>;
};

declare global {
  interface Window {
    /** interface merging: the motion system's state for the drivers */
    tsHomeMotion?: HomeMotionState;
  }
}

/* ---- the guards: input, the hidden tab, reduced motion and Pause Motion (3.8) ---- */

let guarded = false;

/**
 * The rules of 3.8 that end motions from outside a band, installed once: any new press or key on a
 * band (and a wheel on the hero) finishes that band's running sequences at their end state before
 * the band's own handlers run (the capture phase); a hidden tab finishes every one and pauses every
 * loop, and a visible tab resumes the loops in view; a change of reduced motion finishes every
 * motion and stops every loop at its still; Pause Motion holds every loop's frame and finishes every
 * one shot motion, and Play resumes the loops in view. From a change to reduced motion on, `ms`
 * reads 0 and nothing new moves.
 */
export function installGuards(): void {
  if (guarded || typeof document === 'undefined') return;
  guarded = true;
  const onInput = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const band = target?.closest<HTMLElement>('[data-band]')?.dataset['band'];
    if (band === undefined) return;
    if (event.type === 'wheel' && band !== 'hero') return;
    if (band === 'hero' && event.type !== 'wheel') window.tsHomeBoot?.end();
    finishBand(band as SequenceBand);
  };
  for (const type of ['pointerdown', 'keydown', 'wheel'])
    document.addEventListener(type, onInput, { capture: true, passive: true });
  document.addEventListener('click', toggleWithoutBoot);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.tsHomeBoot?.end();
      finishAll();
    }
    schedule();
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    window.tsHomeBoot?.end();
    finishAll();
    if (reduced())
      for (const item of loops) {
        if (item.running) {
          item.running = false;
          call(() => item.spec.pause(), `${item.id} pause`);
        }
        if (!item.stopped) call(() => item.spec.still(), `${item.id} still`);
      }
    schedule();
  });
  new MutationObserver(motionChanged).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  });
  syncButtons();
  window.tsHomeMotion = {
    get paused() {
      return motionPaused();
    },
    running: () => loops.filter((item) => item.running).map((item) => item.id),
    registered: () => loops.map((item) => item.id),
    stopped: () => loops.filter((item) => item.stopped).map((item) => item.id),
    visible: () => Object.fromEntries(loops.map((item) => [item.id, item.vis])),
  };
}
