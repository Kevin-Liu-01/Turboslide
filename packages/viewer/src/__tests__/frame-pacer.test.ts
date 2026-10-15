// The editor's 30 fps cap (docs/archive/rounds/FEATURES.md 5.6) through the frame pacer taken from
// Glyphfield: on a 60 Hz and a 120 Hz display whose animation frame timestamps jitter around the
// period, the loop draws 30 frames a second, plus or minus 1, where the strict rule it replaces
// (`throttleMount`) drew 20 to 24. The loop drives Paper through `setFrame` alone, keeps a frame a
// scrubber set, sleeps between frames, and stops while the document is hidden, at speed 0 and
// after `stop`. Node, with a fake clock that fires animation frames on the display's vsync, and a
// second that runs an ask made between two vsyncs at once with the earlier stamp, as Chromium does.
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

/**
 * Chromium's clock (the review of wave 1, raf-phase.mjs: 57 of 59 animation frames asked from a
 * timer ran a median 0.3 ms after the ask): an ask made inside a vsync interval whose frame has not
 * run yet runs at once, stamped with the vsync that began the interval; an ask made once that frame
 * ran waits for the next vsync. Timers fire 1 ms late, as in `fakeClock`.
 */
function chromiumClock(times: number[]) {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, { callback: (time: number) => void; at: number; stamp: number }>();
  const timers = new Map<number, { at: number; run: () => void }>();
  const ran = new Set<number>();
  let requested = 0;
  /** The index of the vsync that began the interval holding `time`, or -1 before the first. */
  const intervalOf = (time: number) => {
    let index = -1;
    for (let k = 0; k < times.length && (times[k] ?? Infinity) <= time; k += 1) index = k;
    return index;
  };
  const clock: FrameClock = {
    now: () => now,
    frame: (callback) => {
      requested += 1;
      const id = nextId++;
      const k = intervalOf(now);
      if (k >= 0 && !ran.has(k) && now > (times[k] ?? Infinity)) {
        ran.add(k);
        frames.set(id, { callback, at: now + 0.3, stamp: times[k] ?? now });
      } else {
        const next = times[k + 1] ?? Infinity;
        frames.set(id, { callback, at: next, stamp: next });
      }
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
    for (;;) {
      const timer = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      const frame = [...frames.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      const timerAt = timer?.[1].at ?? Infinity;
      const frameAt = frame?.[1].at ?? Infinity;
      if (Math.min(timerAt, frameAt) > until) {
        now = until;
        return;
      }
      if (timer !== undefined && timerAt <= frameAt) {
        timers.delete(timer[0]);
        now = timerAt;
        timer[1].run();
        continue;
      }
      /* every frame due at this moment runs in one batch, as one vsync's callbacks do */
      now = frameAt;
      const batch = [...frames.entries()].filter(([, entry]) => entry.at === frameAt);
      for (const [id] of batch) frames.delete(id);
      const k = intervalOf(now);
      if (k >= 0 && times[k] === now) ran.add(k);
      for (const [, entry] of batch) entry.callback(entry.stamp);
    }
  };
  return { clock, run, requested: () => requested };
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
    /* the loop sleeps between frames: where an ask waits for the next vsync (Firefox, WebKit), about
       one animation frame asked per drawn frame, not one per vsync */
    expect(requested()).toBeLessThan(stamps.length * 1.5);
    /* the shader's time moves with the clock at speed 1: from the first tick, a period before the first frame */
    const advanced = (set.at(-1) ?? 5500) - 5500;
    expect(Math.abs(advanced - (stamps.at(-1)! - stamps[0]!) - 1000 / 30)).toBeLessThan(2);
    loop.stop();
  });

  it.each([
    [60, 0.4, 2],
    [120, 0.3, 2],
  ])(
    'on Chromium’s clock at %i Hz (jitter %f ms) draws 30 frames a second and asks at most %i animation frames per draw',
    (hz, amplitude, asksPerDraw) => {
      /* Chromium runs the timer's ask at once with the earlier vsync's stamp, which is early, so
         the loop asks again and draws on the next vsync: two asks per draw, where a loop asking on
         every vsync makes two at 60 Hz and four at 120 Hz (the review of wave 1, finding 1) */
      const times = vsyncs(hz, 10, amplitude);
      const { clock, run, requested } = chromiumClock(times);
      const { target } = fakeTarget();
      const stamps: number[] = [];
      const loop = paceFrames(
        {
          ...target,
          setFrame: (ms) => {
            stamps.push(clock.now());
            target.setFrame(ms);
          },
        },
        { fps: 30, speed: 1 },
        clock,
      );
      run(11_000);
      for (const count of perSecond(stamps, 2000, 8)) {
        expect(count).toBeGreaterThanOrEqual(29);
        expect(count).toBeLessThanOrEqual(31);
      }
      /* plus the first ask and the one pending when the clock stops: 299 draws, 601 asks */
      expect(requested()).toBeLessThanOrEqual(stamps.length * asksPerDraw + 4);
      expect(requested()).toBeGreaterThan(stamps.length * 1.5);
      loop.stop();
    },
  );

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
