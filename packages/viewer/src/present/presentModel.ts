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
