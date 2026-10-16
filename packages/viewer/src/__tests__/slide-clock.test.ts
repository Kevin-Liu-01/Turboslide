// The slide clock (HTML-SLIDES-DESIGN 2.3, 2.6, 2.8) over a fake page and a fake Animation: next,
// back, seek and play; an early click finishes the playing segment; reduced motion cuts with no
// Animation; a hidden tab pauses and showing it resumes; dispose returns the authored state; the
// presenter's previews read hiddenAt and stepsOf. Node, no jsdom (vitest.config.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Effect } from '@turboslide/schema/motion-core';

import type { SlideMotion } from '../model';
import { createSlideClock, hiddenAt, stepsOf } from '../slide-clock';

type FakeTiming = { delay?: number; duration?: number; iterations?: number; fill?: string };

class FakeAnimation {
  currentTime: number | null = 0;
  playState: 'running' | 'paused' | 'idle' = 'running';
  readonly keyframes: unknown[];
  readonly timing: FakeTiming;
  private start: number | null = null;
  constructor(keyframes: unknown[], timing: FakeTiming) {
    this.keyframes = keyframes;
    this.timing = timing;
  }
  get startTime(): number | null {
    return this.start;
  }
  set startTime(value: number | null) {
    this.start = value;
    this.playState = 'running';
  }
  pause(): void {
    this.playState = 'paused';
  }
  play(): void {
    this.playState = 'running';
  }
  cancel(): void {
    this.playState = 'idle';
  }
}

type FakeStyle = Record<string, string> & { removeProperty: (name: string) => void };

class FakeElement {
  readonly animations: FakeAnimation[] = [];
  readonly style: FakeStyle;
  readonly attrs: Record<string, string>;
  readonly children: FakeElement[];
  readonly ownerDocument: unknown;
  constructor(
    attrs: Record<string, string>,
    children: FakeElement[] = [],
    ownerDocument: unknown = null,
  ) {
    this.attrs = attrs;
    this.children = children;
    this.ownerDocument = ownerDocument;
    const style: Record<string, string> = {};
    this.style = Object.assign(style, {
      removeProperty: (name: string) => {
        style[name] = '';
      },
    }) as FakeStyle;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  animate(keyframes: unknown[], timing: FakeTiming): FakeAnimation {
    const animation = new FakeAnimation(keyframes, timing);
    this.animations.push(animation);
    return animation;
  }
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  querySelectorAll(selector: string): FakeElement[] {
    if (selector === '[data-block]') return this.all().filter((el) => 'data-block' in el.attrs);
    return [];
  }
  querySelector(selector: string): FakeElement | null {
    const match = /^\[data-block="(.+)"\]$/.exec(selector);
    if (match === null) return null;
    return this.all().find((el) => el.attrs['data-block'] === match[1]) ?? null;
  }
}

function fakePage(blockIds: string[]) {
  const listeners = new Set<() => void>();
  const doc = {
    timeline: { currentTime: 1000 },
    defaultView: globalThis,
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
  };
  const blocks = blockIds.map((id) => new FakeElement({ 'data-block': id }, [], doc));
  const body = new FakeElement({ 'data-slide-id': 's1' }, blocks, doc);
  const setVisibility = (state: 'visible' | 'hidden') => {
    doc.visibilityState = state;
    for (const listener of listeners) listener();
  };
  return { doc, body, blocks, setVisibility, listeners };
}

const effect = (
  id: string,
  block: string,
  start: Effect['start'],
  role: Effect['role'] = 'enter',
): Effect => ({
  id,
  block,
  role,
  motion: { preset: role === 'emphasis' ? 'pulse' : 'fade' },
  start,
  durationMs: 400,
});

/* three blocks, each on its own click: three steps */
const threeClicks: SlideMotion = {
  effects: [
    effect('fx-1', 'b1', 'click'),
    effect('fx-2', 'b2', 'click'),
    effect('fx-3', 'b3', 'click'),
  ],
};

function create(motion: SlideMotion, reduced = false, entry: 'start' | 'end' | number = 'start') {
  const page = fakePage(['b1', 'b2', 'b3']);
  const steps: number[] = [];
  const clock = createSlideClock(page.body as unknown as HTMLElement, motion, {
    reduced,
    entry,
    doc: page.doc as unknown as Document,
    onStep: (step) => steps.push(step),
  });
  return { ...page, clock, steps };
}

/** The animations of one block (its visibility track and its preset). */
const runsOf = (el: FakeElement) => el.animations;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSlideClock', () => {
  it('counts the click steps and plays them in order, then answers false for the next slide', () => {
    const { clock, blocks } = create(threeClicks);
    expect(clock.steps).toBe(3);
    expect(clock.step()).toBe(0);
    /* nothing of a later segment runs before its click */
    expect(runsOf(blocks[0] as FakeElement).every((a) => a.playState === 'paused')).toBe(true);
    expect(clock.next()).toBe(true);
    expect(clock.step()).toBe(1);
    expect(runsOf(blocks[0] as FakeElement).every((a) => a.playState === 'running')).toBe(true);
    expect(runsOf(blocks[1] as FakeElement).every((a) => a.playState === 'paused')).toBe(true);
    expect(clock.next()).toBe(true);
    expect(clock.next()).toBe(true);
    expect(clock.next()).toBe(false);
  });

  it('hides an entering block before its click with its first effect filled backwards', () => {
    const { blocks } = create(threeClicks);
    const visibility = runsOf(blocks[1] as FakeElement)[0] as FakeAnimation;
    expect(visibility.keyframes).toEqual([{ visibility: 'hidden' }, { visibility: 'visible' }]);
    expect(visibility.timing.fill).toBe('both');
  });

  it('finishes a playing segment at once on an early click', () => {
    const { clock, blocks } = create(threeClicks);
    clock.next();
    const first = runsOf(blocks[0] as FakeElement);
    expect(first.every((a) => a.playState === 'running')).toBe(true);
    clock.next();
    for (const animation of first) {
      expect(animation.playState).toBe('paused');
      expect(animation.currentTime).toBe(clock.schedule.effects[0]?.endMs);
    }
    expect(runsOf(blocks[1] as FakeElement).every((a) => a.playState === 'running')).toBe(true);
  });

  it('goes back to the state after the previous step, and answers false at step 0', () => {
    const { clock, blocks } = create(threeClicks);
    clock.next();
    clock.next();
    expect(clock.back()).toBe(true);
    expect(clock.step()).toBe(1);
    const end = clock.schedule.segments[1]?.endMs;
    for (const el of blocks)
      for (const animation of runsOf(el)) {
        expect(animation.playState).toBe('paused');
        expect(animation.currentTime).toBe(end);
      }
    expect(clock.back()).toBe(true);
    expect(clock.back()).toBe(false);
  });

  it('enters at the end state, and seeks any moment of the rehearsal timeline', () => {
    const { clock, blocks } = create(threeClicks, false, 'end');
    expect(clock.step()).toBe(3);
    clock.seek(600);
    for (const el of blocks)
      for (const animation of runsOf(el)) expect(animation.currentTime).toBe(600);
  });

  it('cuts under reduced motion: no Animation, the hidden blocks by visibility, each step still reveals', () => {
    const { clock, blocks } = create(threeClicks, true);
    expect(blocks.every((el) => el.animations.length === 0)).toBe(true);
    expect((blocks[0] as FakeElement).style.visibility).toBe('hidden');
    clock.next();
    expect((blocks[0] as FakeElement).style.visibility).toBe('');
    expect((blocks[1] as FakeElement).style.visibility).toBe('hidden');
    clock.dispose();
    expect(blocks.every((el) => !el.style.visibility)).toBe(true);
  });

  it('pauses on a hidden tab and resumes from the same moment', () => {
    const { clock, blocks, setVisibility } = create(threeClicks);
    clock.next();
    setVisibility('hidden');
    expect(runsOf(blocks[0] as FakeElement).every((a) => a.playState === 'paused')).toBe(true);
    setVisibility('visible');
    expect(runsOf(blocks[0] as FakeElement).every((a) => a.playState === 'running')).toBe(true);
  });

  it('advances by itself after the last step ends and the hold runs out', () => {
    const page = fakePage(['b1']);
    const onAdvance = vi.fn();
    createSlideClock(
      page.body as unknown as HTMLElement,
      { effects: [effect('fx-1', 'b1', 'after')], advance: { afterMs: 2000 } },
      { reduced: false, entry: 'start', doc: page.doc as unknown as Document, onAdvance },
    );
    vi.advanceTimersByTime(400);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('cancels every Animation on dispose, so the slide draws as authored', () => {
    const { clock, blocks, listeners } = create(threeClicks);
    clock.next();
    clock.dispose();
    for (const el of blocks)
      for (const animation of runsOf(el)) expect(animation.playState).toBe('idle');
    expect(listeners.size).toBe(0);
  });

  it('skips an effect whose block is gone', () => {
    const { clock } = create({
      effects: [...threeClicks.effects, effect('fx-4', 'gone', 'click')],
    });
    expect(clock.steps).toBe(3);
  });
});

describe('hiddenAt and stepsOf', () => {
  it('names the blocks hidden after each step, and counts the steps without a page', () => {
    expect(stepsOf(threeClicks)).toBe(3);
    expect(stepsOf(undefined)).toBe(0);
    expect(hiddenAt(threeClicks, 0)).toEqual(['b1', 'b2', 'b3']);
    expect(hiddenAt(threeClicks, 2)).toEqual(['b3']);
    expect(hiddenAt(threeClicks, 3)).toEqual([]);
    const exits: SlideMotion = { effects: [effect('fx-1', 'b1', 'click', 'exit')] };
    expect(hiddenAt(exits, 0)).toEqual([]);
    expect(hiddenAt(exits, 1)).toEqual(['b1']);
  });
});
