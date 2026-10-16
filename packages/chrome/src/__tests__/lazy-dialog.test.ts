// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDLE_PRELOAD_DELAY_MS, preloadWhenIdle, savesData } from '../lib/lazyDialog';

// The idle preload of the lazy panels (the Glyphfield port, PLAN.md wave 2 item 7, from
// Glyphfield's StudioApp.tsx `scheduleStudioToolPrefetch`): nothing loads before the delay, then one
// module per idle period in order, nothing at all under Save-Data, and nothing more after the
// cancel. jsdom has no requestIdleCallback; the stand-in queues the callbacks so each idle period
// is run by hand, and the fallback (Safari has none) is a zero timer.

type Idle = {
  requestIdleCallback?:
    ((callback: () => void, options?: { timeout: number }) => number) | undefined;
  cancelIdleCallback?: (handle: number) => void;
};
const idleWindow = window as unknown as Idle;

/** The promise chain of one load (preload, catch, finally) settles within a few microtasks. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function module(name: string, order: string[], fails = false) {
  return {
    preload: vi.fn(async () => {
      order.push(name);
      if (fails) throw new Error(`${name} failed`);
    }),
  };
}

describe('preloadWhenIdle', () => {
  let idle: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    idle = [];
    idleWindow.requestIdleCallback = (callback) => idle.push(callback);
    idleWindow.cancelIdleCallback = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete idleWindow.requestIdleCallback;
    delete idleWindow.cancelIdleCallback;
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('waits for the delay, then loads one module per idle period, in order, past a failed one', async () => {
    const order: string[] = [];
    const diagram = module('diagram', order, true);
    const html = module('html', order);
    preloadWhenIdle([diagram, html]);
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS - 1);
    expect(idle).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(idle).toHaveLength(1);
    expect(order).toEqual([]);
    idle.shift()?.();
    expect(order).toEqual(['diagram']);
    /* the next module waits for its own idle period, after the first settled */
    expect(idle).toHaveLength(0);
    await settle();
    expect(idle).toHaveLength(1);
    idle.shift()?.();
    expect(order).toEqual(['diagram', 'html']);
    await settle();
    expect(idle).toHaveLength(0);
  });

  it('loads nothing when the browser asks to save data', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    expect(savesData()).toBe(true);
    const order: string[] = [];
    preloadWhenIdle([module('diagram', order)]);
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS * 10);
    expect(idle).toEqual([]);
    expect(order).toEqual([]);
  });

  it('starts nothing more after the cancel', async () => {
    const order: string[] = [];
    /* cancelled before the delay: nothing is asked of the browser */
    let cancel = preloadWhenIdle([module('diagram', order)]);
    cancel();
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS);
    expect(idle).toEqual([]);

    /* cancelled while it waits for an idle period: the callback is cancelled */
    cancel = preloadWhenIdle([module('diagram', order)]);
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS);
    expect(idle).toHaveLength(1);
    cancel();
    expect(idleWindow.cancelIdleCallback).toHaveBeenCalledWith(1);
    idle = [];

    /* cancelled during a load: the load finishes and the rest never start */
    cancel = preloadWhenIdle([module('diagram', order), module('html', order)]);
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS);
    idle.shift()?.();
    cancel();
    await settle();
    expect(order).toEqual(['diagram']);
    expect(idle).toEqual([]);
  });

  it('falls back to a timer where requestIdleCallback is absent', () => {
    /* an own undefined, since jsdom's window may carry one of its own */
    idleWindow.requestIdleCallback = undefined;
    const order: string[] = [];
    preloadWhenIdle([module('diagram', order)]);
    vi.advanceTimersByTime(IDLE_PRELOAD_DELAY_MS);
    expect(order).toEqual([]);
    /* a zero timer set inside a fake tick lands one millisecond later */
    vi.advanceTimersByTime(1);
    expect(order).toEqual(['diagram']);
  });
});
