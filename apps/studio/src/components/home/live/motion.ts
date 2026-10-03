import type { Band } from './state';

/**
 * The page's motion helpers (docs/LANDING.md section 3; the signatures fixed on day 0 in
 * docs/gslides-parity/landing/build/integrator.md "Landing, day 0" 4.5). L4 owns this file; every
 * band of the live module animates through it, so the rules of section 3 hold in one place:
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
 * - `?slow=10` multiplies the page's timers by ten for the frame strips (3.5) and does nothing
 *   else.
 *
 * Positions move by `transform` only, nothing loops, and nothing here calls
 * `requestAnimationFrame` (3.4, 3.5).
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

/** A band that runs sequences: the bands of the store, the field strip and the close. */
export type SequenceBand = Band | 'field' | 'close';

type Running = { band: SequenceBand; finish: () => void };

/** Every running animation and script sequence, by band. */
const running = new Set<Running>();

let slow: number | null = null;

/** 10 with `?slow=10`, else 1 (3.5). */
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
