// The editor's 30 fps cap (docs/archive/rounds/FEATURES.md 5.6) through the frame pacer taken from
// Glyphfield: on a 60 Hz and a 120 Hz display whose animation frame timestamps jitter around the
// period, the loop draws 30 frames a second, plus or minus 1, where the strict rule it replaces
// (`throttleMount`) drew 20 to 24. The loop drives Paper through `setFrame` alone, keeps a frame a
// scrubber set, sleeps between frames, and stops while the document is hidden, at speed 0 and
// after `stop`. Node, with a fake clock that fires animation frames on the display's vsync.
import { describe, expect, it, vi } from 'vitest';

import type { MaterialHandle } from '@turboslide/materials/mount';

import { createFramePacer, paceFrames, paceHandle } from '../frame-pacer';
import type { FrameClock, PacedTarget } from '../frame-pacer';

/** A repeatable jitter in [-amplitude, amplitude] (a linear congruential generator). */
function jitter(seed: number, amplitude: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return (state / 2 ** 32 - 0.5) * 2 * amplitude;
  };
}

/** The animation frame timestamps of a display at `hz` over `seconds`, each off its vsync by the jitter. */
function vsyncs(hz: number, seconds: number, amplitude: number, seed = 7): number[] {
  const next = jitter(seed, amplitude);
  const period = 1000 / hz;
  return Array.from({ length: Math.round(seconds * hz) }, (_, k) => 1000 + k * period + next());
}

/** A clock whose animation frames land on the vsyncs and whose timers fire 1 ms late. */
function fakeClock(times: number[]) {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, { at: number; run: () => void }>();
  let requested = 0;
  const clock: FrameClock = {
    now: () => now,
    frame: (callback) => {
      requested += 1;
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => void frames.delete(id),
    after: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms + 1, run });
      return id;
    },
    cancelAfter: (id) => void timers.delete(id),
  };
  /** Runs every timer and animation frame up to `until`, in time order. */
  const run = (until: number) => {
    let vsync = times.findIndex((time) => time > now);
    for (;;) {
      const due = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      const frameAt = vsync === -1 ? Infinity : (times[vsync] ?? Infinity);
      if (due !== undefined && due[1].at <= frameAt && due[1].at <= until) {
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
        continue;
      }
      if (frameAt > until) {
        now = until;
        return;
      }
      now = frameAt;
      vsync += 1;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    }
  };
  return { clock, run, requested: () => requested, pending: () => frames.size + timers.size };
}

type FakeDocument = {
  hidden: boolean;
  defaultView: undefined;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  dispatch: () => void;
};

function fakeDocument(): FakeDocument {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    defaultView: undefined,
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    dispatch: () => listeners.forEach((listener) => listener()),
  };
}

/** A Paper mount as the loop sees it: the frame it shows, the frames set, and its own speed. */
function fakeTarget(doc: FakeDocument = fakeDocument()) {
  let frame = 5500;
  const set: number[] = [];
  const speeds: number[] = [];
  const target: PacedTarget = {
    setFrame: (ms) => {
      frame = ms;
      set.push(ms);
    },
    frame: () => frame,
    setSpeed: (speed) => void speeds.push(speed),
    canvas: () => ({ ownerDocument: doc }) as unknown as HTMLCanvasElement,
  };
  return { target, set, speeds, doc };
}

/** Frames per second over each whole second after the first. */
function perSecond(stamps: number[], from: number, seconds: number): number[] {
  return Array.from(
    { length: seconds },
    (_, s) =>
      stamps.filter((time) => time >= from + s * 1000 && time < from + (s + 1) * 1000).length,
  );
}

describe('createFramePacer', () => {
  it.each([
    [60, 0.4],
    [120, 0.3],
  ])('passes 30 frames a second of jittered %i Hz timestamps (jitter %f ms)', (hz, amplitude) => {
    const pacer = createFramePacer();
    const drawn = vsyncs(hz, 10, amplitude).filter((time) => pacer.shouldDraw(time, 30));
    for (const count of perSecond(drawn, 2000, 8)) {
      expect(count).toBeGreaterThanOrEqual(29);
      expect(count).toBeLessThanOrEqual(31);
    }
  });

  it('skips the frames a stall missed instead of replaying them', () => {
    const pacer = createFramePacer();
    expect(pacer.shouldDraw(1000, 30)).toBe(true);
    expect(pacer.shouldDraw(1500, 30)).toBe(true);
    expect(pacer.shouldDraw(1510, 30)).toBe(false);
    expect(pacer.shouldDraw(1534, 30)).toBe(true);
    expect(pacer.delayUntilNext(1534)).toBeGreaterThan(30);
  });
});

describe('paceFrames', () => {
  it.each([
    [60, 0.4],
    [120, 0.3],
  ])('drives setFrame 30 times a second on a jittered %i Hz display', (hz, amplitude) => {
    const times = vsyncs(hz, 10, amplitude);
    const { clock, run, requested } = fakeClock(times);
    const { target, set, speeds } = fakeTarget();
    const stamps: number[] = [];
    const recorded: PacedTarget = {
      ...target,
      setFrame: (ms) => {
        stamps.push(clock.now());
        target.setFrame(ms);
      },
    };
    const loop = paceFrames(recorded, { fps: 30, speed: 1 }, clock);
    run(11_000);
    expect(speeds).toEqual([0]);
    for (const count of perSecond(stamps, 2000, 8)) {
      expect(count).toBeGreaterThanOrEqual(29);
      expect(count).toBeLessThanOrEqual(31);
    }
    /* the loop sleeps between frames: about one animation frame asked per drawn frame, not one per vsync */
    expect(requested()).toBeLessThan(stamps.length * 1.5);
    /* the shader's time moves with the clock at speed 1: from the first tick, a period before the first frame */
    const advanced = (set.at(-1) ?? 5500) - 5500;
    expect(Math.abs(advanced - (stamps.at(-1)! - stamps[0]!) - 1000 / 30)).toBeLessThan(2);
    loop.stop();
  });

  it('keeps a frame a scrubber set and advances from it', () => {
    const { clock, run } = fakeClock(vsyncs(60, 2, 0.2));
    const { target } = fakeTarget();
    const loop = paceFrames(target, { fps: 30, speed: 1 }, clock);
    run(1500);
    target.setFrame(100);
    run(1600);
    expect(target.frame()).toBeGreaterThanOrEqual(100);
    expect(target.frame()).toBeLessThan(250);
    loop.stop();
  });

  it('stops while the document is hidden, at speed 0 and after stop, and resumes', () => {
    const { clock, run, requested, pending } = fakeClock(vsyncs(60, 8, 0.4));
    const { target, set, doc } = fakeTarget();
    const loop = paceFrames(target, { fps: 30, speed: 1 }, clock);
    run(2000);
    expect(set.length).toBeGreaterThan(20);
    doc.hidden = true;
    doc.dispatch();
    expect(pending()).toBe(0);
    const hiddenFrom = { set: set.length, requested: requested() };
    run(4000);
    expect(set.length).toBe(hiddenFrom.set);
    expect(requested()).toBe(hiddenFrom.requested);
    doc.hidden = false;
    doc.dispatch();
    run(5000);
    expect(set.length).toBeGreaterThan(hiddenFrom.set + 20);
    loop.setSpeed(0);
    const still = set.length;
    run(6000);
    expect(set.length).toBe(still);
    expect(pending()).toBe(0);
    loop.setSpeed(2);
    run(7000);
    expect(set.length).toBeGreaterThan(still + 20);
    loop.stop();
    const stopped = set.length;
    run(8000);
    expect(set.length).toBe(stopped);
    expect(pending()).toBe(0);
  });
});

describe('paceHandle', () => {
  it('routes the handle’s speed to the loop and stops the loop before Paper disposes', () => {
    const { clock, run, pending } = fakeClock(vsyncs(60, 3, 0.2));
    const { target, speeds } = fakeTarget();
    const dispose = vi.fn(() => {
      expect(pending()).toBe(0);
    });
    const handle = { ...target, dispose } as unknown as MaterialHandle;
    const paced = paceHandle(handle, { fps: 30, speed: 1 }, clock);
    run(1500);
    paced.setSpeed(0.5);
    expect(speeds).toEqual([0]);
    paced.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    run(2500);
    expect(pending()).toBe(0);
  });
});
