import { createContext, runInContext } from 'node:vm';

import { minifySync } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  BOOT_LIMIT_BYTES,
  FIELD_STILL_MS,
  MOTION_KEY,
  SENTENCE_MAX,
  VISIT_KEY,
  bootSource,
} from './boot';
import type { HomeBootState } from './boot';

// The page's boot script (docs/LANDING.md 2.2, 3.2, 3.5, 3.9; the second pass): the minified script
// stays inside 1 KB and reads no layout, and the script run in a stand in browser turns the visits
// in order, sets the visit's sentence in the lead's first frame, paints a stored Pause Motion
// before anything else, keeps `ts-intro` only while H5's still may develop, and toggles Pause
// Motion from its button with no other script on the page.

const SENTENCES = [
  'Turboslide is a slides editor in the browser.',
  'Turboslide puts one customer name on every slide.',
  'Turboslide downloads PDF and PowerPoint files.',
];
/** The lead after its sentence, in the same run of text as the sentence (DESIGN.md 8.2). */
const REST = ' It has a CLI and an MCP server, so agents edit the same deck. No account is needed.';

type Listener = (event: { target: unknown }) => void;

/** A stand in for the few browser globals the script reads, with a clock the test moves. */
function standIn(options: { reduce?: boolean; storage?: Map<string, string> | 'throws' }) {
  const timers: { at: number; fn: () => void }[] = [];
  const frames: (() => void)[] = [];
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const clicks: Listener[] = [];
  const lead = { textContent: SENTENCES[0]! + REST };
  let leadParsed = false;
  const storage = options.storage;
  const store =
    storage === 'throws'
      ? new Proxy(
          {},
          {
            get() {
              throw new Error('SecurityError');
            },
            set() {
              throw new Error('SecurityError');
            },
          },
        )
      : new Proxy({} as Record<string, unknown>, {
          get: (_t, key: string) => storage?.get(key),
          set: (_t, key: string, value: unknown) => {
            storage?.set(key, String(value));
            return true;
          },
          deleteProperty: (_t, key: string) => {
            storage?.delete(key);
            return true;
          },
        });
  const document = {
    documentElement: {
      dataset,
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      },
    },
    readyState: 'loading',
    querySelector: (selector: string) => (selector === '[data-visit]' && leadParsed ? lead : null),
    addEventListener: (type: string, fn: Listener) => {
      if (type === 'click') clicks.push(fn);
    },
  };
  const window: { tsHomeBoot?: HomeBootState } = {};
  const context = createContext({
    window,
    document,
    performance: { now: () => 1234 },
    matchMedia: () => ({ matches: options.reduce === true }),
    localStorage: store,
    setTimeout: (fn: () => void, at: number) => timers.push({ at, fn }),
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
  });
  return {
    context,
    window,
    classes,
    dataset,
    lead,
    timers,
    /** runs the queued animation frames once; the lead is parsed before them when `parsed` */
    frame(parsed: boolean) {
      leadParsed = parsed;
      const queued = frames.splice(0);
      for (const fn of queued) fn();
      return queued.length;
    },
    click(target: unknown) {
      for (const fn of clicks) fn({ target });
    },
  };
}

function run(stand: ReturnType<typeof standIn>): void {
  runInContext(bootSource(SENTENCES).source, stand.context);
}

/** A button the click listener finds by `closest`. */
function toggleButton() {
  const button = {
    ariaPressed: 'false',
    closest: (selector: string) => (selector === '[data-motion-toggle]' ? button : null),
  };
  return button;
}

describe('the boot script', () => {
  it('minifies to at most 1 KB and reads no layout', () => {
    const { source } = bootSource(SENTENCES);
    const script = minifySync('boot.js', source, { compress: true, mangle: true }).code.trim();
    expect(Buffer.byteLength(script)).toBeLessThanOrEqual(BOOT_LIMIT_BYTES);
    expect(script).not.toMatch(
      /getBoundingClientRect|offset(Width|Height|Top|Left)|getComputedStyle|scroll(Top|Height)/,
    );
    /* the serialised body writes its keys and its hold out; they are the module's constants */
    expect(source).toMatch(new RegExp(`["'\`]${MOTION_KEY}["'\`]`));
    expect(source).toMatch(new RegExp(`["'\`]${VISIT_KEY}["'\`]`));
    expect(FIELD_STILL_MS).toBe(3000);
    expect(source).toMatch(/setTimeout\(end, 3e3\)/);
    /* the markup holds the first sentence, so the script does not carry it */
    expect(source).not.toContain(SENTENCES[0]);
  });

  it('refuses a sentence over 50 characters', () => {
    expect(() => bootSource(['x'.repeat(SENTENCE_MAX + 1)])).toThrow(RangeError);
    expect(() => bootSource([])).toThrow(RangeError);
  });

  it('turns the three sentences in visit order, set in the first frame that holds the lead', () => {
    const storage = new Map<string, string>();
    const read: string[] = [];
    for (let visit = 0; visit < 4; visit += 1) {
      const stand = standIn({ storage });
      run(stand);
      /* the parser has not reached the lead: the frame asks for the next one and sets nothing */
      expect(stand.frame(false)).toBe(1);
      expect(stand.lead.textContent).toBe(SENTENCES[0] + REST);
      stand.frame(true);
      expect(stand.window.tsHomeBoot?.t0).toBe(1234);
      read.push(stand.lead.textContent);
    }
    /* the sentence changes and the rest of the lead stays in the same run of text */
    expect(read).toEqual(
      [SENTENCES[0], SENTENCES[1], SENTENCES[2], SENTENCES[0]].map((s) => s + REST),
    );
  });

  it('reads the first sentence and plays when storage throws, and the button still works', () => {
    const stand = standIn({ storage: 'throws' });
    run(stand);
    stand.frame(true);
    expect(stand.lead.textContent).toBe(SENTENCES[0] + REST);
    expect(stand.dataset['motion']).toBeUndefined();
    expect(stand.classes.has('ts-intro')).toBe(true);
    const button = toggleButton();
    stand.click(button);
    expect(stand.dataset['motion']).toBe('paused');
    expect(button.ariaPressed).toBe('true');
  });

  it('keeps ts-intro until H5 may no longer start, then shows the still', () => {
    const stand = standIn({ storage: new Map() });
    run(stand);
    expect(stand.classes.has('ts-intro')).toBe(true);
    expect(stand.window.tsHomeBoot?.ended).toBe(false);
    expect(stand.timers.map((t) => t.at)).toEqual([FIELD_STILL_MS]);
    stand.timers[0]?.fn();
    expect(stand.classes.has('ts-intro')).toBe(false);
    expect(stand.window.tsHomeBoot?.ended).toBe(true);
  });

  it('adds no intro under reduced motion', () => {
    const stand = standIn({ reduce: true, storage: new Map() });
    run(stand);
    expect(stand.classes.size).toBe(0);
    expect(stand.timers).toHaveLength(0);
    expect(stand.window.tsHomeBoot?.ended).toBe(true);
  });

  it('paints a stored Pause Motion still: the attribute before anything parses, no intro', () => {
    const storage = new Map([[MOTION_KEY, 'paused']]);
    const stand = standIn({ storage });
    run(stand);
    expect(stand.dataset['motion']).toBe('paused');
    expect(stand.classes.size).toBe(0);
    expect(stand.window.tsHomeBoot?.ended).toBe(true);
  });

  it('toggles Pause Motion from its button: the attribute, aria-pressed and the stored choice', () => {
    const storage = new Map<string, string>();
    const stand = standIn({ storage });
    run(stand);
    const button = toggleButton();
    stand.click({ closest: () => null });
    expect(stand.dataset['motion']).toBeUndefined();
    stand.click(button);
    expect(stand.dataset['motion']).toBe('paused');
    expect(button.ariaPressed).toBe('true');
    expect(storage.get(MOTION_KEY)).toBe('paused');
    /* pausing shows H5's still at once */
    expect(stand.classes.has('ts-intro')).toBe(false);
    stand.click(button);
    expect(stand.dataset['motion']).toBeUndefined();
    expect(button.ariaPressed).toBe('false');
    expect(storage.has(MOTION_KEY)).toBe(false);
  });
});
