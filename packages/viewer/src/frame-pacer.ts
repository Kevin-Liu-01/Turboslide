// The editor's 30 fps cap on a live shader (docs/archive/rounds/FEATURES.md 5.6), paced the way
// Glyphfield paces its materials (`liveMaterialRenderBudget.ts` and `liveMaterialFrameLoop.ts`,
// MIT, Kevin Liu). Paper runs at speed 0 and every frame goes through its public `setFrame`, so
// no private field of Paper is replaced. A frame is due 5 percent early (at most 0.75 ms), since
// animation frame timestamps jitter around the display's period and a strict comparison drops
// every frame that lands just under 33.33 ms, which held the editor at 20 to 24 fps. A late frame
// carries the remainder instead of starting a new phase. Between two drawn frames the loop sleeps
// on a timer that ends 8 ms before the next due frame, then asks for one animation frame. Firefox
// and WebKit run that ask on the next vsync, the due one, so they ask about one animation frame
// per drawn frame. Chromium runs an ask made between two vsyncs at once, stamped with the vsync
// that began the interval; that stamp is early, so the loop asks once more and draws on the next
// vsync: about two asks per drawn frame, where a loop asking on every vsync makes two at 60 Hz and
// four at 120 Hz (the reviews of wave 1 read 60 asks and 30 draws a second at 60 Hz, and 1.7 asks
// per draw at 120 Hz). Judging the ask by the clock instead of its stamp would not save it, since
// the clock still reads 8 ms early; only a timer ending after the due vsync would, and that costs
// Firefox and WebKit a whole vsync. A hidden document and a canvas out of the viewport stop the
// loop, as Paper's own observers stop its loop.
import type { MaterialHandle } from '@turboslide/materials/mount';

/** The due rule: one frame per period, a frame slightly early counts, a stall skips the missed ones. */
export type FramePacer = {
  /** True when the frame at `time` draws; `force` draws and starts a new phase. */
  shouldDraw: (time: number, fps: number, force?: boolean) => boolean;
  /** The wait in ms from `time` until the next frame is due. */
  delayUntilNext: (time: number) => number;
  reset: () => void;
};

export function createFramePacer(): FramePacer {
  let nextFrameAt: number | null = null;
  let previousFps = 0;
  return {
    shouldDraw(time, requestedFps, force = false) {
      const fps = Number.isFinite(requestedFps) ? Math.min(60, Math.max(1, requestedFps)) : 60;
      const interval = 1000 / fps;
      const tolerance = Math.min(0.75, interval * 0.05);
      if (fps !== previousFps) nextFrameAt = null;
      previousFps = fps;
      if (!force && nextFrameAt !== null && time + tolerance < nextFrameAt) return false;
      if (force || nextFrameAt === null || time < nextFrameAt) {
        // a frame slightly early starts the next period from its own time, so it never skips one
        nextFrameAt = time + interval;
      } else {
        // after a stall, the next due time skips the missed frames instead of replaying them
        nextFrameAt += (Math.floor((time - nextFrameAt) / interval) + 1) * interval;
      }
      return true;
    },
    delayUntilNext(time) {
      return Math.max(0, (nextFrameAt ?? time) - time);
    },
    reset() {
      nextFrameAt = null;
    },
  };
}

/** The timers the loop runs on; the browser's by default, a fake clock in a test. */
export type FrameClock = {
  now: () => number;
  frame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
  after: (callback: () => void, ms: number) => number;
  cancelAfter: (id: number) => void;
};

/* each a lookup at call time, so a page that wraps requestAnimationFrame (the perf rows' counter) sees the loop */
const BROWSER_CLOCK: FrameClock = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  after: (callback, ms) => window.setTimeout(callback, ms),
  cancelAfter: (id) => window.clearTimeout(id),
};

/** What the loop drives: Paper's public frame, speed and canvas. */
export type PacedTarget = Pick<MaterialHandle, 'setFrame' | 'frame' | 'setSpeed' | 'canvas'>;

export type PacedFrames = {
  /** The playback speed; 0 stops the loop and the frame stays where it is. */
  setSpeed: (speed: number) => void;
  stop: () => void;
};

/**
 * How long before a due frame the loop's timer ends, so the animation frame it asks for is the due
 * one where an ask waits for the next vsync (Firefox, WebKit; Chromium's is the header's extra ask).
 */
const WAKE_EARLY_MS = 8;

/**
 * Drives a mount at `fps`: Paper's own loop at speed 0, and `setFrame` advanced by the elapsed time
 * times `speed` on each due frame, from the frame the mount shows (so a scrubber's `setFrame` is
 * kept). Returns the speed setter and the stop.
 */
export function paceFrames(
  target: PacedTarget,
  options: { fps: number; speed: number },
  clock: FrameClock = BROWSER_CLOCK,
): PacedFrames {
  const pacer = createFramePacer();
  const canvas = target.canvas();
  const doc = canvas.ownerDocument;
  let speed = options.speed;
  let inView = true;
  let stopped = false;
  let frameId = 0;
  let timerId = 0;
  let last: number | null = null;

  const running = () => !stopped && speed !== 0 && inView && !doc.hidden;
  const halt = () => {
    if (frameId !== 0) clock.cancelFrame(frameId);
    if (timerId !== 0) clock.cancelAfter(timerId);
    frameId = 0;
    timerId = 0;
    last = null;
    pacer.reset();
  };
  const request = () => {
    timerId = 0;
    if (frameId === 0) frameId = clock.frame(tick);
  };
  const tick = (time: number) => {
    frameId = 0;
    if (!running()) {
      halt();
      return;
    }
    if (pacer.shouldDraw(time, options.fps)) {
      if (last !== null) target.setFrame(target.frame() + (time - last) * speed);
      last = time;
    }
    timerId = clock.after(request, Math.max(0, pacer.delayUntilNext(clock.now()) - WAKE_EARLY_MS));
  };
  const resume = () => {
    if (running() && frameId === 0 && timerId === 0) request();
    else if (!running()) halt();
  };

  const onVisibility = () => resume();
  doc.addEventListener('visibilitychange', onVisibility);
  const view = doc.defaultView;
  const observer =
    view?.IntersectionObserver === undefined
      ? null
      : new view.IntersectionObserver(([entry]) => {
          inView = entry?.isIntersecting ?? true;
          resume();
        });
  observer?.observe(canvas);

  target.setSpeed(0);
  resume();
  return {
    setSpeed: (next) => {
      speed = next;
      resume();
    },
    stop: () => {
      stopped = true;
      halt();
      doc.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    },
  };
}

/**
 * A live handle whose frames are paced at `fps`: its `setSpeed` sets the loop's speed, never
 * Paper's, and its `dispose` stops the loop first.
 */
export function paceHandle(
  handle: MaterialHandle,
  options: { fps: number; speed: number },
  clock?: FrameClock,
): MaterialHandle {
  const loop = paceFrames(handle, options, clock);
  return {
    ...handle,
    setSpeed: loop.setSpeed,
    dispose: () => {
      loop.stop();
      handle.dispose();
    },
  };
}
