// The frames of one live gesture (docs/archive/rounds/OBJECTS.md 2.4, the cadence and the budget): the stage
// renders the draft document at most once per animation frame, and this module is the pure
// record of what those renders cost and the rule that degrades the render when the budget is
// missed. The Editor keeps one record per gesture (a move, a resize, a rotation, a seam drag, a
// draw), adds a frame after every render of the sheet with the time from the animation frame
// callback's start to the end of the commit (the layout effect's measure included), and
// publishes the record through the window API as `describe().state.gesture`, so a driver reads
// the frame count, the worst frame and whether the budget held without instrumentation. The
// budget: a rendered frame over FRAME_OVER_MS twice in a row sets `degraded`; while degraded a
// move takes the wrapper path (no sheet render, the moved wrappers placed inline) and a resize or
// rotation renders every second frame; a frame back under FRAME_UNDER_MS twice clears it. Only
// the sheet's render is ever skipped: the ring, the handles, the readout and the commit never are.
// Framework free, no DOM; gesture-frame.test.ts pins it.

/** A rendered frame over this many ms, twice in a row, degrades the gesture (two 60 Hz frames). */
export const FRAME_OVER_MS = 32;
/** A rendered frame under this many ms, twice in a row, clears the degradation (one 60 Hz frame). */
export const FRAME_UNDER_MS = 16;

/** One rendered frame: the animation frame callback's start and the end of the sheet's commit, in ms. */
export type GestureFrame = { start: number; end: number };

export type GestureFrameRecord = {
  /** the frames that rendered the sheet */
  frames: number;
  /** the longest rendered frame in ms */
  maxMs: number;
  /** the mean rendered frame in ms */
  meanMs: number;
  /** the sum of the rendered frames in ms (meanMs times frames, kept exact) */
  totalMs: number;
  /** the animation frames whose sheet render the budget skipped */
  skipped: number;
  /** true while the budget is missed */
  degraded: boolean;
  /** consecutive rendered frames over FRAME_OVER_MS (cleared by a frame at or under it) */
  over: number;
  /** consecutive rendered frames under FRAME_UNDER_MS while degraded (cleared by a frame at or over it) */
  under: number;
};

export const EMPTY_GESTURE_RECORD: GestureFrameRecord = {
  frames: 0,
  maxMs: 0,
  meanMs: 0,
  totalMs: 0,
  skipped: 0,
  degraded: false,
  over: 0,
  under: 0,
};

/** The record after one rendered frame: the counts, the worst and the mean, and the budget's verdict. */
export function frameRecord(record: GestureFrameRecord, frame: GestureFrame): GestureFrameRecord {
  const ms = Math.max(0, frame.end - frame.start);
  const frames = record.frames + 1;
  const totalMs = record.totalMs + ms;
  const over = ms > FRAME_OVER_MS ? record.over + 1 : 0;
  const under = record.degraded && ms < FRAME_UNDER_MS ? record.under + 1 : 0;
  let degraded = record.degraded;
  if (!degraded && over >= 2) degraded = true;
  else if (degraded && under >= 2) degraded = false;
  return {
    frames,
    maxMs: Math.max(record.maxMs, ms),
    meanMs: totalMs / frames,
    totalMs,
    skipped: record.skipped,
    degraded,
    over,
    under: degraded ? under : 0,
  };
}

/** The record after an animation frame whose sheet render the budget skipped. */
export function skippedFrame(record: GestureFrameRecord): GestureFrameRecord {
  return { ...record, skipped: record.skipped + 1 };
}

/** What a gesture does to the sheet, for the degradation rule. */
export type GestureRenderKind = 'move' | 'resize' | 'rotate' | 'other';

/**
 * Whether the next animation frame renders the sheet: always while the budget holds; while
 * degraded, never for a move (the wrapper path places the moved objects without a render until
 * the release) and every second frame for a resize or a rotation (`lastRendered` says whether the
 * previous animation frame rendered); every other gesture renders every frame.
 */
export function rendersFrame(
  record: GestureFrameRecord,
  kind: GestureRenderKind,
  lastRendered: boolean,
): boolean {
  if (!record.degraded) return true;
  if (kind === 'move') return false;
  if (kind === 'resize' || kind === 'rotate') return !lastRendered;
  return true;
}

/** The record as the window API publishes it (`describe().state.gesture`). */
export type GestureReport = {
  frames: number;
  maxMs: number;
  meanMs: number;
  skipped: number;
  degraded: boolean;
};

export function gestureReport(record: GestureFrameRecord): GestureReport {
  return {
    frames: record.frames,
    maxMs: Math.round(record.maxMs * 10) / 10,
    meanMs: Math.round(record.meanMs * 10) / 10,
    skipped: record.skipped,
    degraded: record.degraded,
  };
}

/**
 * The clock the frame record reads, the page's `performance.now` unless a test replaces it: a
 * spy on `performance.now` itself is read by React's own profiler timers many times per render,
 * so a test that wants a frame to read as slow or fast sets `gestureClock.now` instead.
 */
export const gestureClock = { now: (): number => performance.now() };

/** A frame scheduler: the window's requestAnimationFrame pair, or a fake in a test. */
export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export type FrameCoalescer = {
  /** the work of the next animation frame; a later call before the frame replaces it */
  push: (apply: () => void) => void;
  /** drops the pending work, if any */
  cancel: () => void;
  /** true while a frame is scheduled */
  pending: () => boolean;
};

/**
 * One render per animation frame: every `push` inside a frame keeps only the latest thunk and
 * schedules one callback when none is pending; the callback runs that thunk once, so a burst of
 * pointermoves inside one frame renders the sheet once and the last position wins.
 */
export function createFrameCoalescer(scheduler: FrameScheduler): FrameCoalescer {
  let latest: (() => void) | null = null;
  let handle = 0;
  const run = () => {
    handle = 0;
    const apply = latest;
    latest = null;
    apply?.();
  };
  return {
    push: (apply) => {
      latest = apply;
      if (handle !== 0) return;
      handle = scheduler.request(run);
    },
    cancel: () => {
      if (handle !== 0) scheduler.cancel(handle);
      handle = 0;
      latest = null;
    },
    pending: () => handle !== 0,
  };
}
