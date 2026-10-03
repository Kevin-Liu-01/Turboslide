import type { GapTable } from './boot.generated';

/**
 * The hero's boot script (docs/LANDING.md 2.2, 3.2 H1 to H4, 3.5, 3.6, 6.1; the contract of
 * docs/gslides-parity/landing/build/integrator.md "Landing, day 0" 4.7). L4 owns this file.
 * `scripts/build-home-assets.ts --boot` turns `bootSource(HERO.visit)` into the inline string of
 * `boot.generated.ts` (minified, at most 1.5 KB), and `src/routes/home.tsx` inlines it as the
 * first child of `main#top`, so it runs before any of the page's content is parsed. This module
 * never ships to the browser itself; only the string does.
 *
 * What the script does, in order:
 *
 * 1. It reads reduced motion and the visit (`ts-home-visit` in localStorage holds the index, 0 to
 *    2, of the next visit's sentence, so each visit shows the next sentence, wrapping after the
 *    third, and the first when storage throws), and adds `ts-intro` to `html` unless reduced
 *    motion is set. `ts-intro` is the hero's start pose in L1's CSS: the rails and rules at
 *    scale 0 and the field's still hidden.
 * 2. In its first animation frame that finds the subtitle (`[data-object="title#lead"]`), which
 *    the browser runs before it paints that frame, it sets the visit's sentence and, with the
 *    intro, moves the letters into a span with no ink of its own, so the sentence is never
 *    swapped after it paints and the typing moves no box. It reads no layout.
 * 3. T0 is the later of that frame and `document.fonts.ready`, capped at 800 ms after the frame.
 *    At T0 it adds `ts-t0` (H1: the rails draw out of their crosses in CSS, and the field's still
 *    shows at T0 + 3.0 s unless the live module's develop runs, answer 1); the first key lands at
 *    T0 + 700 ms with the caret (H2), every key on `gapTable`'s rhythm (H3), and 400 ms after the
 *    last key the caret leaves by a cut and the sequence ends (H4), by T0 + 3.97 s at most.
 * 4. A key, a press or a wheel in the hero, a hidden tab or a change to reduced motion ends the
 *    sequence at its end state at once (3.5): the sentence whole and both classes gone, so the
 *    finished CSS animations leave `document.getAnimations()` and the field's still shows unless
 *    a develop runs.
 *
 * It exposes `window.tsHomeBoot` (`t0`, `ended`, `end()`), which `live/hero.ts` and the drivers
 * read. Under `?slow=10` it multiplies its timers by ten (3.5); a frame strip slows the CSS
 * animations of H1 to a tenth through the DevTools protocol, as prototype A's strips did.
 */

/** The bytes the minified script may take (LANDING.md 6.1: 1.5 KB, read as 1,500 bytes). */
export const BOOT_LIMIT_BYTES = 1500;
/** The longest visit sentence (LANDING.md 2.2). */
export const SENTENCE_MAX = 50;
/** The first key lands this long after T0 (H2, H3). */
export const FIRST_KEY_MS = 700;
/** The caret holds this long after the last key, then leaves by a cut (H4). */
export const CARET_HOLD_MS = 400;
/** The last key's latest time from T0 (H3: 0.7 s + 50 keys at 60 ms + 9 spaces at 30 ms). */
export const LAST_KEY_MAX_MS = 3970;
/** T0 waits for the font at most this long after the first paint (3.2). */
export const T0_CAP_MS = 800;
/**
 * The hero field's still shows at this time from T0 unless the live module's develop runs
 * (answer 1; L1's CSS keyed on `ts-t0`), and the live module starts no develop after it.
 */
export const FIELD_STILL_MS = 3000;
/** The person's rhythm: a gap of 34 to 60 ms before each key, 30 ms more after a space (H3). */
export const KEY_GAP_MIN_MS = 34;
/** the gap's spread: 27 values, 34 to 60 ms */
export const KEY_GAP_SPAN = 27;
export const SPACE_PAUSE_MS = 30;

/** What the build bakes into the script: the sentences and the clock's constants. */
export type BootData = {
  /** the visit sentences in order */
  s: readonly string[];
  /**
   * FIRST_KEY_MS, CARET_HOLD_MS, T0_CAP_MS, KEY_GAP_MIN_MS, KEY_GAP_SPAN and SPACE_PAUSE_MS,
   * in that order
   */
  t: readonly [number, number, number, number, number, number];
};

/** The page's `window.tsHomeBoot`, written by the boot script. */
export type HomeBootState = {
  /** T0 in `performance.now()` ms, absent until it is read */
  t0?: number;
  /** true once the sequence ended, or from the start under reduced motion */
  ended: boolean;
  /** ends the sequence at its end state at once */
  end(): void;
};

declare global {
  interface Window {
    /** interface merging: the boot script's state on the page's window */
    tsHomeBoot?: HomeBootState;
  }
}

/**
 * One sentence's gap table: a person's uneven rhythm as a fixed pattern per sentence, so every
 * visit types a sentence the same way and the script carries no table. `gapsMs[0]` is 0, because
 * the first key lands with the caret at FIRST_KEY_MS (H2); every later gap is 34 to 60 ms from
 * `(10 key + 7 visit) mod 27` (10 and 27 are coprime, so a sentence walks the 27 gaps in an
 * irregular order), plus 30 ms when the key before it was a space.
 */
export function gapTable(sentence: string, visit: number): GapTable {
  const gapsMs: number[] = [];
  let at = FIRST_KEY_MS;
  for (let i = 0; i < sentence.length; i += 1) {
    const gap =
      i === 0
        ? 0
        : KEY_GAP_MIN_MS +
          ((i * 10 + visit * 7) % KEY_GAP_SPAN) +
          (sentence[i - 1] === ' ' ? SPACE_PAUSE_MS : 0);
    gapsMs.push(gap);
    at += gap;
  }
  return { sentence, gapsMs, lastKeyMs: at };
}

/** Each key's time from T0 in a gap table. */
export function keyTimes(table: GapTable): number[] {
  const times: number[] = [];
  let at = FIRST_KEY_MS;
  for (const gap of table.gapsMs) {
    at += gap;
    times.push(at);
  }
  return times;
}

/**
 * The script before minification and the three gap tables: one IIFE over `homeBoot` with the
 * sentences baked in. Throws on a sentence longer than 50 characters or a last key later than
 * 3,970 ms (H3), so a copy change that breaks the 4.5 s of 3.7 fails the build.
 */
export function bootSource(sentences: readonly string[]): { source: string; tables: GapTable[] } {
  if (sentences.length === 0) throw new RangeError('the boot script needs a sentence');
  const tables = sentences.map((sentence, index) => {
    if (sentence.length === 0 || sentence.length > SENTENCE_MAX)
      throw new RangeError(
        `the visit sentence "${sentence}" is not 1 to ${SENTENCE_MAX} characters`,
      );
    const table = gapTable(sentence, index);
    if (table.lastKeyMs > LAST_KEY_MAX_MS)
      throw new RangeError(`the visit sentence "${sentence}" types past ${LAST_KEY_MAX_MS} ms`);
    return table;
  });
  const data: BootData = {
    s: sentences,
    t: [FIRST_KEY_MS, CARET_HOLD_MS, T0_CAP_MS, KEY_GAP_MIN_MS, KEY_GAP_SPAN, SPACE_PAUSE_MS],
  };
  return { source: `(${homeBoot.toString()})(${JSON.stringify(data)});`, tables };
}

/**
 * The script itself. It is serialised with `toString()`, so it refers to nothing outside its own
 * body and its argument, and every name it uses is a browser global. It is written for its
 * minified size (1.5 KB with the data, LANDING.md 6.1): it types with `gapTable`'s rule and
 * constants (BootData.t), which boot.test.ts and the build's check compare with `VISIT_GAPS`.
 */
export function homeBoot(data: BootData): void {
  const doc = document;
  const classes = doc.documentElement.classList;
  const motion = matchMedia('(prefers-reduced-motion:reduce)');
  const slow = location.search.includes('slow=10') ? 10 : 1;
  const [firstKey, hold, cap, gapMin, gapSpan, spacePause] = data.t;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const clock = (): number => performance.now();
  const raf = requestAnimationFrame;
  const key = 'ts-home-visit';
  let done = motion.matches;
  let visit = 0;
  let t0 = 0;
  let node: Text | null;
  let rest: HTMLElement | undefined;
  try {
    /* the key holds the index of the next visit's sentence */
    visit = +localStorage.getItem(key)! % data.s.length || 0;
    localStorage.setItem(key, `${(visit + 1) % data.s.length}`);
  } catch {
    /* the first sentence when storage throws */
  }
  const sentence = data.s[visit]!;
  const state: HomeBootState = { ended: done, end };
  const later = (ms: number, fn: () => void): number => timers.push(setTimeout(fn, ms));
  window.tsHomeBoot = state;
  if (!done) classes.add('ts-intro');

  function end(): void {
    if (done) return;
    state.ended = done = true;
    timers.forEach(clearTimeout);
    if (node) node.data = sentence;
    rest?.remove();
    classes.remove('ts-intro', 'ts-t0');
  }

  /* T0 (3.2): the frame that first holds the subtitle, or the font when it comes later, capped */
  function go(at0: number): void {
    if (t0 || done) return;
    state.t0 = t0 = at0;
    classes.add('ts-t0');
    const lag = clock() - at0;
    let at = firstKey;
    [...sentence].forEach((letter, index) => {
      if (index)
        at +=
          gapMin +
          ((index * 10 + visit * 7) % gapSpan) +
          +(sentence[index - 1] === ' ') * spacePause;
      later(at * slow - lag, () => {
        node!.data += letter;
        rest!.textContent = sentence.slice(index + 1);
        /* the caret (H2): a bar in the text's colour where the typed letters end, drawn as the
           untyped letters' box shadow, so it moves no letter and breaks no line; solid, no blink.
           The shadow sits 0.01 em inside the box's top and bottom, which clips its long edges
           whole on a scaled sheet, so only the bar shows */
        rest!.style.boxShadow = '-.05em 0 0 -.01em';
      });
    });
    later((at + hold) * slow - lag, end);
  }

  function frame(): unknown {
    const lead = doc.querySelector('[data-object="title#lead"]');
    /* 'loading' is the one ready state after 'l' in code point order */
    if (!lead) return doc.readyState > 'l' ? raf(frame) : end();
    /* 4 is NodeFilter.SHOW_TEXT: the subtitle's first text node holds its one sentence */
    node = doc.createTreeWalker(lead, 4).nextNode() as Text | null;
    if (!node || done) {
      if (node) node.data = sentence;
      return end();
    }
    /* the untyped letters hold their place with no ink of their own (their `color`, which the
       caret's shadow takes, stays the text's), so the typing shifts nothing */
    node.data = '';
    rest = doc.createElement('span');
    rest.style.webkitTextFillColor = 'transparent';
    rest.textContent = sentence;
    node.after(rest);
    for (const type of ['keydown', 'pointerdown', 'wheel'])
      (lead.closest('[data-band]') ?? lead).addEventListener(type, end, true);
    doc.onvisibilitychange = () => doc.hidden && end();
    motion.onchange = end;
    const painted = clock();
    later(cap, () => go(painted + cap));
    void doc.fonts.ready.then(() => go(clock()));
  }

  raf(frame);
}
