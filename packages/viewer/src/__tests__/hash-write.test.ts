// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hash write of a move (the presenter audit of a95d4097d, item 2): a held arrow or a run of
// presenter moves selects a slide every frame, and browsers refuse or ignore `replaceState` past
// a rate (Safari: 100 in 30 s; Chrome: 200 in 10 s). A write after a quiet gap goes at once; the
// writes inside the gap fold into one at its end, with the latest slide, on the same page only.
// The write goes through the document's own `replaceState` (History.prototype), past a client
// router's patch of `window.history.replaceState`, and keeps the router's history state.

type HashModule = typeof import('../hash');

async function load(): Promise<HashModule> {
  vi.resetModules();
  return import('../hash');
}

let calls = 0;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-09T09:00:00Z') });
  window.history.replaceState(null, '', '/deck/d');
  calls = 0;
  const replace = History.prototype.replaceState;
  vi.spyOn(History.prototype, 'replaceState').mockImplementation(function (this: History, ...args) {
    calls += 1;
    replace.apply(this, args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('writeSlideHash', () => {
  it('writes a lone move at once', async () => {
    const { writeSlideHash } = await load();
    writeSlideHash('id', { id: 'two', n: 2 });
    expect(window.location.hash).toBe('#s/two');
    expect(calls).toBe(1);
    /* the same hash again writes nothing */
    vi.advanceTimersByTime(1000);
    writeSlideHash('id', { id: 'two', n: 2 });
    expect(calls).toBe(1);
  });

  it('folds a run of moves into the first at once and the last at the end of the gap', async () => {
    const { HASH_WRITE_GAP_MS, writeSlideHash } = await load();
    for (let n = 1; n <= 60; n += 1) {
      writeSlideHash('n', { id: `s${n}`, n });
      vi.advanceTimersByTime(16);
    }
    /* sixty moves a frame apart, about a second: one write every gap at most */
    expect(calls).toBeLessThanOrEqual(Math.ceil((60 * 16) / HASH_WRITE_GAP_MS) + 1);
    vi.advanceTimersByTime(HASH_WRITE_GAP_MS);
    expect(window.location.hash).toBe('#60');
    const settled = calls;
    vi.advanceTimersByTime(HASH_WRITE_GAP_MS * 4);
    expect(calls).toBe(settled);
  });

  it('keeps a held key under the browsers’ limits: under 100 writes in 30 s', async () => {
    const { writeSlideHash } = await load();
    for (let tick = 0; tick < 900; tick += 1) {
      writeSlideHash('n', { id: `s${tick}`, n: (tick % 90) + 1 });
      vi.advanceTimersByTime(33);
    }
    expect(calls).toBeLessThan(100);
  });

  it('drops a waiting write when the run comes back to the hash shown', async () => {
    const { writeSlideHash } = await load();
    writeSlideHash('n', { id: 'a', n: 1 });
    writeSlideHash('n', { id: 'b', n: 2 });
    writeSlideHash('n', { id: 'a', n: 1 });
    vi.advanceTimersByTime(1000);
    expect(window.location.hash).toBe('#1');
    expect(calls).toBe(1);
  });

  it('drops a waiting write once the page has moved to another address', async () => {
    const { writeSlideHash } = await load();
    writeSlideHash('n', { id: 'a', n: 1 });
    writeSlideHash('n', { id: 'b', n: 2 });
    window.history.pushState(null, '', '/decks');
    vi.advanceTimersByTime(1000);
    expect(window.location.pathname).toBe('/decks');
    expect(window.location.hash).toBe('');
  });

  it('passes a router that patched history.replaceState and keeps its state', async () => {
    const { writeSlideHash } = await load();
    /* what @tanstack/history does: the instance method is wrapped to notify the router */
    const heard: unknown[] = [];
    const own = window.history.replaceState;
    window.history.replaceState({ __TSR_index: 3, key: 'k' }, '', '/deck/d');
    window.history.replaceState = function (this: History, ...args) {
      heard.push(args);
      return own.apply(this, args);
    };
    try {
      writeSlideHash('id', { id: 'two', n: 2 });
      expect(window.location.hash).toBe('#s/two');
      expect(heard).toHaveLength(0);
      expect(window.history.state).toEqual({ __TSR_index: 3, key: 'k' });
    } finally {
      delete (window.history as { replaceState?: unknown }).replaceState;
    }
  });

  it('reads the address hash a router navigation keeps (addressHash)', async () => {
    const { addressHash, writeSlideHash } = await load();
    writeSlideHash('id', { id: 'three', n: 3 });
    expect(addressHash()).toBe('s/three');
  });
});
