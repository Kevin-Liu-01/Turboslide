import { createContext, runInContext } from 'node:vm';

import { minifySync } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  BOOT_LIMIT_BYTES,
  CARET_HOLD_MS,
  FIRST_KEY_MS,
  LAST_KEY_MAX_MS,
  SENTENCE_MAX,
  T0_CAP_MS,
  bootSource,
  gapTable,
  keyTimes,
} from './boot';

// The hero's boot script (docs/LANDING.md 2.2, 3.2 H1 to H4, 6.1): the gap tables keep H3's
// bounds, the minified script stays inside 1.5 KB, and the script run in a stand in browser
// types each visit's sentence on `gapTable`'s rhythm, turns the visits in order, ends on input
// and under reduced motion sets the sentence whole with no intro. The stand in records every
// timer, so the key times are read from the script itself, not restated.

const SENTENCES = [
  'Turboslide is a slides editor in the browser.',
  'Turboslide puts one customer name on every slide.',
  'Turboslide downloads PDF and PowerPoint files.',
];

type Timer = { at: number; fn: () => void; id: number };

/** A stand in for the few browser globals the script reads, with a clock the test moves. */
function standIn(options: { reduce?: boolean; storage?: Map<string, string> | 'throws' }) {
  let now = 1000;
  let nextId = 1;
  const timers: Timer[] = [];
  const frames: (() => void)[] = [];
  const classes = new Set<string>();
  const listeners: string[] = [];
  const text = { data: SENTENCES[0]!, after: (el: unknown) => inserted.push(el) };
  const inserted: unknown[] = [];
  const band = { addEventListener: (type: string) => listeners.push(type) };
  const lead = { closest: () => band };
  const media = { matches: options.reduce === true, onchange: null as unknown };
  const storage = options.storage;
  let fontsReady: () => void = () => undefined;
  const document = {
    documentElement: {
      classList: {
        add: (...names: string[]) => names.forEach((n) => classes.add(n)),
        remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
      },
    },
    readyState: 'loading',
    hidden: false,
    onvisibilitychange: null as unknown,
    fonts: { ready: new Promise<void>((resolve) => (fontsReady = resolve)) },
    querySelector: (selector: string) => (selector === '[data-object="title#lead"]' ? lead : null),
    createTreeWalker: () => ({ nextNode: () => text }),
    createElement: () => {
      const span = {
        style: {} as Record<string, string>,
        textContent: '',
        removed: false,
        remove() {
          span.removed = true;
        },
      };
      return span;
    },
  };
  const window: Record<string, unknown> = {};
  const context = createContext({
    window,
    document,
    location: { search: '' },
    performance: { now: () => now },
    matchMedia: () => media,
    localStorage: {
      getItem(key: string) {
        if (storage === 'throws') throw new Error('denied');
        return storage?.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (storage === 'throws') throw new Error('denied');
        storage?.set(key, value);
      },
    },
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: now + Math.max(0, ms), fn, id });
      return id;
    },
    clearTimeout: (id: number) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  return {
    run: (script: string) => runInContext(script, context),
    boot: () => window['tsHomeBoot'] as { t0?: number; ended: boolean; end(): void },
    frame: () => frames.shift()?.(),
    fonts: async () => {
      fontsReady();
      await Promise.resolve();
      await Promise.resolve();
    },
    /** runs every timer due by `until`, in time order, moving the clock to each */
    advance(until: number) {
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (next === undefined || next.at > until) break;
        timers.shift();
        now = next.at;
        next.fn();
      }
      now = until;
    },
    now: () => now,
    timers,
    classes,
    listeners,
    text,
    inserted: inserted as {
      textContent: string;
      style: Record<string, string>;
      removed: boolean;
    }[],
    media,
    document,
  };
}

const minified = (): string =>
  minifySync('boot.js', bootSource(SENTENCES).source, { compress: true, mangle: true }).code.trim();

describe('the gap tables', () => {
  it('type every sentence on a person rhythm inside H3 bounds', () => {
    for (const [index, sentence] of SENTENCES.entries()) {
      const table = gapTable(sentence, index);
      expect(sentence.length).toBeLessThanOrEqual(SENTENCE_MAX);
      expect(table.gapsMs.length).toBe(sentence.length);
      expect(table.gapsMs[0]).toBe(0);
      for (const [i, gap] of table.gapsMs.entries()) {
        if (i === 0) continue;
        const pause = sentence[i - 1] === ' ' ? 30 : 0;
        expect(gap - pause).toBeGreaterThanOrEqual(34);
        expect(gap - pause).toBeLessThanOrEqual(60);
      }
      expect(table.lastKeyMs).toBeLessThanOrEqual(LAST_KEY_MAX_MS);
      expect(keyTimes(table).at(-1)).toBe(table.lastKeyMs);
      /* H4 ends the sequence inside the 4.5 s of 3.7 */
      expect(table.lastKeyMs + CARET_HOLD_MS).toBeLessThanOrEqual(4370);
    }
  });

  it('refuses a sentence over 50 characters', () => {
    expect(() => bootSource([`${'a'.repeat(SENTENCE_MAX)}b`])).toThrow(RangeError);
  });

  it('minifies to at most 1.5 KB', () => {
    expect(Buffer.byteLength(minified())).toBeLessThanOrEqual(BOOT_LIMIT_BYTES);
  });
});

describe('the boot script in a stand in browser', () => {
  it('types the first visit on the gap table, then ends with the sentence whole', async () => {
    const page = standIn({ storage: new Map() });
    page.run(minified());
    expect(page.classes.has('ts-intro')).toBe(true);
    expect(page.boot().ended).toBe(false);
    page.frame();
    /* the letters moved into the span with no ink, the text node empty: nothing swapped */
    expect(page.text.data).toBe('');
    const rest = page.inserted[0]!;
    expect(rest.textContent).toBe(SENTENCES[0]);
    expect(rest.style['webkitTextFillColor']).toBe('transparent');
    expect(page.listeners).toEqual(['keydown', 'pointerdown', 'wheel']);
    const t0 = page.now();
    await page.fonts();
    expect(page.boot().t0).toBe(t0);
    expect(page.classes.has('ts-t0')).toBe(true);
    /* the key timers are the gap table's key times */
    const keys = keyTimes(gapTable(SENTENCES[0]!, 0));
    const scheduled = page.timers.map((t) => t.at - t0).sort((a, b) => a - b);
    for (const at of keys) expect(scheduled).toContain(at);
    expect(scheduled).toContain(keys.at(-1)! + CARET_HOLD_MS);
    /* no caret before the first key; the first key at T0 + 700 with the caret */
    page.advance(t0 + FIRST_KEY_MS - 1);
    expect(rest.style['boxShadow']).toBeUndefined();
    page.advance(t0 + FIRST_KEY_MS);
    expect(page.text.data).toBe('T');
    expect(rest.textContent).toBe(SENTENCES[0]!.slice(1));
    expect(rest.style['boxShadow']).toBe('-.05em 0 0 -.01em');
    page.advance(t0 + keys.at(-1)!);
    expect(page.text.data).toBe(SENTENCES[0]);
    expect(rest.textContent).toBe('');
    expect(page.boot().ended).toBe(false);
    page.advance(t0 + keys.at(-1)! + CARET_HOLD_MS);
    expect(page.boot().ended).toBe(true);
    expect(rest.removed).toBe(true);
    expect(page.text.data).toBe(SENTENCES[0]);
    expect([...page.classes]).toEqual([]);
  });

  it('caps T0 at 800 ms after the frame when the font is late', () => {
    const page = standIn({ storage: new Map() });
    page.run(minified());
    page.frame();
    const painted = page.now();
    page.advance(painted + T0_CAP_MS);
    expect(page.boot().t0).toBe(painted + T0_CAP_MS);
  });

  it('shows the next sentence each visit, wraps after the third, and the first when storage throws', () => {
    const storage = new Map<string, string>();
    const seen: string[] = [];
    for (let visit = 0; visit < 4; visit += 1) {
      const page = standIn({ storage });
      page.run(minified());
      page.frame();
      page.boot().end();
      seen.push(page.text.data);
    }
    expect(seen).toEqual([SENTENCES[0], SENTENCES[1], SENTENCES[2], SENTENCES[0]]);
    const denied = standIn({ storage: 'throws' });
    denied.run(minified());
    denied.frame();
    denied.boot().end();
    expect(denied.text.data).toBe(SENTENCES[0]);
  });

  it('ends at once on input, on a hidden tab and on a change to reduced motion', async () => {
    const page = standIn({ storage: new Map() });
    page.run(minified());
    page.frame();
    await page.fonts();
    page.advance(page.now() + 1500);
    expect(page.boot().ended).toBe(false);
    page.document.hidden = true;
    (page.document.onvisibilitychange as () => void)();
    expect(page.boot().ended).toBe(true);
    expect(page.text.data).toBe(SENTENCES[0]);
    expect(page.timers.length).toBe(0);

    const second = standIn({ storage: new Map() });
    second.run(minified());
    second.frame();
    (second.media.onchange as () => void)();
    expect(second.boot().ended).toBe(true);
    expect([...second.classes]).toEqual([]);
  });

  it('under reduced motion sets the sentence whole, with no intro and no timer', () => {
    const storage = new Map([['ts-home-visit', '2']]);
    const page = standIn({ reduce: true, storage });
    page.run(minified());
    expect(page.classes.has('ts-intro')).toBe(false);
    expect(page.boot().ended).toBe(true);
    page.frame();
    expect(page.text.data).toBe(SENTENCES[2]);
    expect(page.inserted.length).toBe(0);
    expect(page.timers.length).toBe(0);
  });
});
