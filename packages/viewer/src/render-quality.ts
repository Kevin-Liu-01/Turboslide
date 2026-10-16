// Adaptive quality for the show's live shader (PLAN wave 3.3), taken from Glyphfield's landing
// sampler (`src/lib/landingRenderQuality.ts`, MIT, Kevin Liu, THIRD_PARTY_NOTICES.md), Auto only and
// with no select. The pacer reports each drawn frame; after a 2 s warm-up the draws are sorted into
// 2.5 s windows against the pacer's own rate. Two slow windows in a row halve the canvas's pixels;
// smooth windows restore them, four at first, and each drop after a restore doubles that wait up
// to one minute, so quality does not flap. A pause (a hidden tab, a stage out of view, a gap over
// 250 ms) never counts as GPU pressure. Only the resolution changes: the material's uniforms and
// its clock are untouched, so the still and the show agree.

export type FrameWindow = 'slow' | 'smooth' | 'steady';

export type RenderQuality = 'high' | 'low';

/** The windows' timing (Glyphfield's numbers). */
const WARMUP_MS = 2_000;
const WINDOW_MS = 2_500;
const MIN_FRAMES = 24;
const PAUSE_MS = 250;
/** Two slow windows in a row lower the quality. */
const SLOW_WINDOWS_TO_REDUCE = 2;
/** Smooth windows in a row that restore it: 10 s at first. */
const SMOOTH_WINDOWS_TO_RESTORE = 4;
/** Each drop after a restore doubles the wait, up to one minute of windows. */
const MAX_SMOOTH_WINDOWS_TO_RESTORE = 24;

/** Sorts drawn frames into windows at `fps`; `sample` answers a verdict when a window completes. */
export function createFrameAssessment(fps: number): {
  sample: (time: number) => FrameWindow | null;
  reset: () => void;
} {
  const target = 1000 / Math.max(1, fps);
  let previous: number | null = null;
  let warmupStarted: number | null = null;
  let windowStarted: number | null = null;
  let frames = 0;
  let elapsed = 0;
  let slowFrames = 0;
  const reset = () => {
    previous = null;
    warmupStarted = null;
    windowStarted = null;
    frames = 0;
    elapsed = 0;
    slowFrames = 0;
  };
  const sample = (time: number): FrameWindow | null => {
    const interval = previous === null ? 0 : time - previous;
    if (!Number.isFinite(time) || interval < 0 || interval > PAUSE_MS) {
      reset();
      return null;
    }
    previous = time;
    warmupStarted ??= time;
    if (time - warmupStarted < WARMUP_MS || interval === 0) return null;
    windowStarted ??= time;
    frames += 1;
    elapsed += interval;
    if (interval > target * 1.35) slowFrames += 1;
    if (time - windowStarted < WINDOW_MS || frames < MIN_FRAMES) return null;
    const average = elapsed / frames;
    const slowShare = slowFrames / frames;
    const verdict: FrameWindow =
      average > target * 1.15 && slowShare >= 0.2
        ? 'slow'
        : average <= target * 1.05 && slowShare <= 0.05
          ? 'smooth'
          : 'steady';
    windowStarted = time;
    frames = 0;
    elapsed = 0;
    slowFrames = 0;
    return verdict;
  };
  return { sample, reset };
}

/** The Auto policy over the windows: `sample` answers the new quality when it changes, else null. */
export function createRenderQuality(fps: number): {
  sample: (time: number) => RenderQuality | null;
  quality: () => RenderQuality;
} {
  const assessment = createFrameAssessment(fps);
  let quality: RenderQuality = 'high';
  let slowWindows = 0;
  let smoothWindows = 0;
  let windowsToRestore = SMOOTH_WINDOWS_TO_RESTORE;
  let restoredBefore = false;
  const sample = (time: number): RenderQuality | null => {
    const verdict = assessment.sample(time);
    if (verdict === null) return null;
    slowWindows = verdict === 'slow' ? slowWindows + 1 : 0;
    smoothWindows = verdict === 'smooth' ? smoothWindows + 1 : 0;
    let changed = false;
    if (quality === 'high' && slowWindows >= SLOW_WINDOWS_TO_REDUCE) {
      if (restoredBefore)
        windowsToRestore = Math.min(MAX_SMOOTH_WINDOWS_TO_RESTORE, windowsToRestore * 2);
      quality = 'low';
      changed = true;
    } else if (quality === 'low' && smoothWindows >= windowsToRestore) {
      restoredBefore = true;
      quality = 'high';
      changed = true;
    }
    if (!changed) return null;
    /* a resolution change resizes the canvas; measure the new one from a fresh warm-up */
    assessment.reset();
    slowWindows = 0;
    smoothWindows = 0;
    return quality;
  };
  return { sample, quality: () => quality };
}

/** What adaptive quality drives: the mount's canvas and its pixel budget. */
export type QualityTarget = {
  canvas: () => HTMLCanvasElement;
  setPixelBudget: (maxPixelCount: number) => void;
};

/**
 * The pacer's draw callback for a show mount: on a drop the budget becomes half the canvas's
 * pixels at that moment, and a restore returns the full budget.
 */
export function adaptivePixels(
  target: QualityTarget,
  fps: number,
  fullBudget: number,
): (time: number) => void {
  const policy = createRenderQuality(fps);
  return (time) => {
    const next = policy.sample(time);
    if (next === null) return;
    const canvas = target.canvas();
    target.setPixelBudget(
      next === 'low' ? Math.max(1, Math.floor((canvas.width * canvas.height) / 2)) : fullBudget,
    );
  };
}
