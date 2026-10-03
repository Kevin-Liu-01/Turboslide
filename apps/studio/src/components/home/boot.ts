/**
 * The page's boot script (docs/LANDING.md 2.1, 2.2, 3.2, 3.5, 3.9, 6.1; the second pass). V4 owns
 * this file and `scripts/home/boot.ts`, which turns `bootSource(HERO.visit)` into the inline string
 * of `boot.generated.ts` (minified, at most 1 KB). `src/routes/home.tsx` inlines it as the first
 * child of `main#top`, so it runs before any of the page's content is parsed. This module never
 * ships to the browser itself; only the string does.
 *
 * What the script does, in order, reading no layout:
 *
 * 1. The visit (`ts-home-visit` in localStorage holds the index, 0 to 2, of the next visit's
 *    sentence, so each visit shows the next sentence, wrapping after the third, and the first
 *    when storage throws) and Pause Motion's stored choice (`ts-home-motion`, `paused` or absent;
 *    playing when storage throws or is empty). A paused visitor's `html` takes
 *    `data-motion="paused"` here, before the first paint, so the page paints still (3.2).
 * 2. `ts-intro` on `html` unless reduced motion is set or motion is paused: it hides H5's still,
 *    the Blue Marble in the editor frame's slide 1, until the live core's develop starts. The
 *    script takes it away 3,000 ms after it starts (H5's latest start, 3.5) and on a press of
 *    Pause Motion, so the still shows then unless a develop runs; once the live core runs,
 *    `live/motion.ts` also takes it away on a hidden tab and a change of reduced motion. The
 *    script never draws a frame itself.
 * 3. In the first animation frame that finds the lead's `[data-visit]` element (which the browser
 *    runs before it paints that frame) it sets the visit's sentence there, so the sentence never
 *    changes after it paints. The markup holds the first sentence, so the script carries only the
 *    others.
 * 4. One click listener on the document for `[data-motion-toggle]`, Pause Motion's button in the
 *    navigation: a press toggles `html[data-motion]`, the stored choice and the button's
 *    `aria-pressed`, so the button works from its first paint, before hydration and before the
 *    live core loads; `live/motion.ts` follows the attribute from then on.
 *
 * It exposes `window.tsHomeBoot` (`t0`, `ended`, `end()`), which `live/hero.ts`, `live/motion.ts`
 * and the drivers read.
 */

/** The bytes the minified script may take (LANDING.md 4.1: the boot script at most 1 KB). */
export const BOOT_LIMIT_BYTES = 1000;
/** The longest visit sentence (row home.lead.visit). */
export const SENTENCE_MAX = 50;
/**
 * H5's latest start from the boot (3.5): past it the still shows and the live core starts no
 * develop.
 */
export const FIELD_STILL_MS = 3000;
/** The localStorage key of Pause Motion's stored choice (3.2). */
export const MOTION_KEY = 'ts-home-motion';
/** The localStorage key of the next visit's sentence (2.2). */
export const VISIT_KEY = 'ts-home-visit';

/** What the build bakes into the script: the visit sentences in order, the first blank. */
export type BootData = { s: readonly string[] };

/** The page's `window.tsHomeBoot`, written by the boot script. */
export type HomeBootState = {
  /** the frame that first held the lead, in `performance.now()` ms; absent until it is read */
  t0?: number;
  /** true once `ts-intro` left `html`, or from the start under reduced motion or Pause Motion */
  ended: boolean;
  /** takes `ts-intro` away at once, so H5's still shows unless a develop runs */
  end(): void;
};

declare global {
  interface Window {
    /** interface merging: the boot script's state on the page's window */
    tsHomeBoot?: HomeBootState;
  }
}

/**
 * The script before minification: one IIFE over `homeBoot` with the sentences baked in. Throws on
 * a sentence of no characters or more than 50.
 */
export function bootSource(sentences: readonly string[]): { source: string } {
  if (sentences.length === 0) throw new RangeError('the boot script needs a sentence');
  for (const sentence of sentences)
    if (sentence.length === 0 || sentence.length > SENTENCE_MAX)
      throw new RangeError(
        `the visit sentence "${sentence}" is not 1 to ${SENTENCE_MAX} characters`,
      );
  /* the markup holds the first sentence; the script carries an empty string in its place */
  const data: BootData = { s: sentences.map((sentence, index) => (index === 0 ? '' : sentence)) };
  return { source: `(${homeBoot.toString()})(${JSON.stringify(data)});` };
}

/**
 * The script itself. It is serialised with `toString()`, so it refers to nothing outside its own
 * body and its argument, and every name it uses is a browser global; the two keys and the 3,000
 * ms are written out here for that reason (boot.test.ts compares them with the constants above).
 */
export function homeBoot(data: BootData): void {
  const doc = document;
  const root = doc.documentElement;
  const set = root.dataset;
  const paused = 'paused';
  const motionKey = 'ts-home-motion';
  const visitKey = 'ts-home-visit';
  const n = data.s.length;
  let visit = 0;
  try {
    /* the key holds the index of the next visit's sentence; Storage's named properties are its
       items, so a missing key reads undefined and the first sentence */
    visit = +localStorage[visitKey] % n || 0;
    localStorage[visitKey] = (visit + 1) % n;
    if (localStorage[motionKey] == paused) set['motion'] = paused;
  } catch {
    /* the first sentence, and playing, when storage throws */
  }
  const state: HomeBootState = {
    ended: matchMedia('(prefers-reduced-motion:reduce)').matches || set['motion'] == paused,
    end,
  };
  window.tsHomeBoot = state;
  if (!state.ended) {
    root.classList.add('ts-intro');
    setTimeout(end, 3e3);
  }

  function end(): void {
    state.ended = true;
    root.classList.remove('ts-intro');
  }

  /* Pause Motion (3.2): the page's attribute, the stored choice and the button's state */
  doc.addEventListener('click', (event) => {
    const button = (event.target as Element).closest?.('[data-motion-toggle]');
    if (!button) return;
    const pause = set['motion'] != paused;
    if (pause) {
      set['motion'] = paused;
      end();
    } else delete set['motion'];
    button.ariaPressed = `${pause}`;
    try {
      if (pause) localStorage[motionKey] = paused;
      else delete localStorage[motionKey];
    } catch {
      /* the choice holds for the visit when storage throws */
    }
  });

  function frame(): unknown {
    const lead = doc.querySelector('[data-visit]');
    /* 'loading' is the one ready state after 'l' in code point order */
    if (!lead) return doc.readyState > 'l' && requestAnimationFrame(frame);
    state.t0 = performance.now();
    /* the markup holds the first sentence, so the script carries the others only */
    if (visit) lead.textContent = data.s[visit]!;
    return 0;
  }

  requestAnimationFrame(frame);
}
