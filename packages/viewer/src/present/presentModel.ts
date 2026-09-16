import type { MotionSchedule } from '@turboslide/schema/motion';

import type { ViewerSlide } from '../model';

/**
 * The pure facts of a slideshow (gslides-parity SPEC 9.2, 7.2.1): which slides a show runs over,
 * where it is, how the counter reads, how the digit jump resolves, and the two numbers the
 * presenter console shows (the timer, the notes text size). No React and no DOM, so the viewer's
 * unit tests and the studio's composition read the same rules.
 */

/** The two blank slides of Google's presenting table (R04 A10): B or . and W or , . */
export type BlankSlide = 'black' | 'white';

/**
 * True for a slide the loader marked skipped. `ViewerSlide` carries no `skip` field yet; the
 * audience routes leave skipped slides out of the payload (SPEC 7.2.1) and a payload that keeps
 * them with the flag is read here, so the show never depends on which the loader did.
 */
export function isSkippedSlide(slide: ViewerSlide): boolean {
  return 'skip' in slide && slide.skip === true;
}

/** The slides a show runs over: the deck's order with the skipped ones left out (SPEC 9.2). */
export function playList<T extends ViewerSlide>(slides: readonly T[]): T[] {
  return slides.filter((slide) => !isSkippedSlide(slide));
}

/** The position of a slide in the play list, or -1. */
export function playIndex(play: readonly ViewerSlide[], slideId: string): number {
  return play.findIndex((slide) => slide.id === slideId);
}

/**
 * Where the show is: the active slide's position in the play list, else the first unskipped
 * slide after the active one (a show started on a skipped slide opens on the next one), else
 * the last slide, else 0 for an empty list.
 */
export function currentPlayIndex(
  all: readonly ViewerSlide[],
  play: readonly ViewerSlide[],
  activeId: string,
): number {
  const direct = playIndex(play, activeId);
  if (direct >= 0) return direct;
  if (play.length === 0) return 0;
  const active = all.find((slide) => slide.id === activeId);
  if (active === undefined) return 0;
  const after = play.findIndex((slide) => slide.n > active.n);
  return after >= 0 ? after : play.length - 1;
}

/** The play list position after a move of `delta`, clamped to the first and the last slide. */
export function stepPlayIndex(index: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index + delta));
}

/** The counter over the unskipped count: "3 of 10" (SPEC 12 "Present mode"). */
export function counterText(index: number, total: number): string {
  return `${Math.max(0, index) + 1} of ${total}`;
}

/** The slide number typed as digits, or null when the digits name no slide (SPEC 9.2). */
export function slideNumberOf(digits: string, total: number): number | null {
  if (!/^\d+$/.test(digits)) return null;
  const n = Number.parseInt(digits, 10);
  return n >= 1 && n <= total ? n : null;
}

/** The elapsed timer of the presenter console: m:ss under an hour, h:mm:ss from then on (R04 A4). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** The notes text size of the presenter console: 14 to 28 px in steps of 2 (SPEC 9.3). */
export const NOTES_FONT = { min: 14, max: 28, step: 2, initial: 16 } as const;

/** The next notes size after a plus or minus press, held inside the range. */
export function stepNotesFont(size: number, direction: -1 | 1): number {
  const next = size + direction * NOTES_FONT.step;
  return Math.max(NOTES_FONT.min, Math.min(NOTES_FONT.max, next));
}

/** True when a notes size is one the buttons can reach; the stored value is read through this. */
export function isNotesFont(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= NOTES_FONT.min &&
    value <= NOTES_FONT.max &&
    (value - NOTES_FONT.min) % NOTES_FONT.step === 0
  );
}

// ---------------------------------------------------------------------------------------------
// The step model (gslides-parity SPEC-5 2.2, 0.14): a slide with motion has `stepCount` click
// steps after its entry step; a next consumes a step before the slide moves, a previous reverses
// a step before the slide moves back and lands on the previous slide's last step; a digit jump,
// Home, End and the slide list land on step 0 of the target with its entry step played. The
// schedule rides on the viewer slide as `motion` when the loader compiled one (ViewerSlide
// carries no field for it yet; `motionOf` reads it structurally the way `isSkippedSlide` reads
// `skip`), so the audience payload, the editor's viewer deck and the presenter agree on one
// schedule without a second compile in the browser.

/** The schedule a loader attached to a viewer slide, when the slide carries motion. */
export function motionOf(slide: ViewerSlide | undefined): MotionSchedule | undefined {
  if (slide === undefined || !('motion' in slide)) return undefined;
  const motion = (slide as { motion?: unknown }).motion;
  if (typeof motion !== 'object' || motion === null) return undefined;
  const record = motion as { steps?: unknown; slideId?: unknown };
  return Array.isArray(record.steps) && typeof record.slideId === 'string'
    ? (motion as MotionSchedule)
    : undefined;
}

/** The click steps of a schedule after its entry step; 0 for a slide without motion. */
export function stepCount(schedule: MotionSchedule | undefined): number {
  if (schedule === undefined) return 0;
  return Math.max(0, schedule.steps.length - 1);
}

/** A position in the show: the play list index and the step reached on that slide. */
export type ShowPosition = { index: number; step: number };

/** The step counts per play list position, or a function answering them. */
export type StepCounts = ReadonlyArray<number> | ((index: number) => number);

function stepsAt(steps: StepCounts, index: number): number {
  const count = typeof steps === 'function' ? steps(index) : steps[index];
  return Math.max(0, count ?? 0);
}

/**
 * Where a next lands (SPEC-5 2.2): the next step while one remains, else step 0 of the next
 * slide, else null at the end of the show.
 */
export function nextPosition(
  index: number,
  step: number,
  total: number,
  steps: StepCounts,
): ShowPosition | null {
  if (total <= 0) return null;
  if (step < stepsAt(steps, index)) return { index, step: step + 1 };
  if (index < total - 1) return { index: index + 1, step: 0 };
  return null;
}

/**
 * Where a previous lands (SPEC-5 0.14): the state before the current step while one was played,
 * else the previous slide at its last step, else null at the start of the show.
 */
export function previousPosition(
  index: number,
  step: number,
  total: number,
  steps: StepCounts,
): ShowPosition | null {
  if (total <= 0) return null;
  if (step > 0) return { index, step: step - 1 };
  if (index > 0) return { index: index - 1, step: stepsAt(steps, index - 1) };
  return null;
}

/** The presenter's step line: "Step 2 of 4"; empty for a slide without steps (`turboslide: true`). */
export function stepCounterText(step: number, steps: number): string {
  if (steps <= 0) return '';
  return `Step ${Math.max(0, step)} of ${steps}`;
}

/**
 * The show's Auto-play intervals (SPEC-5 2.2, R01 4): every 1, 2, 3, 5, 10, 15 and 30 seconds
 * and every minute, in milliseconds; each tick is one advance, so a step and a slide change take
 * a tick each (unverified against Google, SPEC-5 16.9).
 */
export const AUTO_PLAY_INTERVALS_MS = [1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000] as const;
export type AutoPlayIntervalMs = (typeof AUTO_PLAY_INTERVALS_MS)[number];

/** The label of an Auto-play interval: "Every 5 seconds", "Every minute". */
export function autoPlayLabel(ms: number): string {
  if (ms >= 60000) return ms === 60000 ? 'Every minute' : `Every ${ms / 60000} minutes`;
  const seconds = ms / 1000;
  return seconds === 1 ? 'Every second' : `Every ${seconds} seconds`;
}
