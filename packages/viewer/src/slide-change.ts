import { useState } from 'react';

/**
 * The slide change of a stage (the slide motion round): the slide shown, the slide the last move
 * left, and how the two share the sheet and the backdrop while the arriving one enters. Stage.tsx
 * and TwinStage.tsx hold one per sheet, render the backdrop from it (`SlideBackdrop`) and hand it
 * to SlideView, so the picture across the stage and the slide bodies change on one timeline.
 *
 * The leaving slide holds still at full opacity under the arriving one and goes when the arrival's
 * own animations have ended (SlideView's watch), so no frame shows the sheet or the surround
 * between the two slides: the old 120 ms fade out with a 180 ms fade in let the paper show through
 * the middle of every move, and the 120 ms timer took the old slide away a third of the way into a
 * 400 ms transition. A move that comes while the slide before it is still entering is shown at
 * once (`cut`): a held arrow or a quick double press flips cleanly instead of stacking fades.
 */
export type ShownSlide = {
  id: string;
  /** renderSlide output */
  html: string;
  /** the stage-wide picture of a full-picture slide (an opener, a mood, a closing), else undefined */
  picture: string | undefined;
};

export type SlideChange = {
  current: ShownSlide;
  /** the slide the last move left, under the arriving one until it has entered */
  leaving: ShownSlide | null;
  /** the move came while the slide before it was still entering: the arrival shows at once */
  cut: boolean;
  /** one per move; the arrival's end names it, so a late end never takes a newer leaving slide */
  seq: number;
};

/**
 * How each layer moves while a slide enters (`--ts-change` is the arrival's length):
 *
 * - content to content: the leaving body holds; nothing else moves.
 * - content to picture: the arriving picture fades in over the first half (the surround turns
 *   from the stage's ground to the picture, hidden inside the sheet by the leaving body's paper),
 *   then the leaving body fades out over the second half and uncovers it.
 * - picture to content: the arriving body brings its own paper over the leaving picture; the
 *   leaving picture holds for the first half and fades out over the second, so the surround
 *   returns to the stage's ground as the sheet becomes the new slide.
 * - picture to picture: the arriving picture fades in over the leaving one, and the leaving
 *   body's text fades out as the arriving text fades in.
 *
 * At no point are both layers part transparent over the same pixel, so no frame dips toward the
 * paper or the surround.
 */
export type ChangePhases = {
  /** the leaving body: holds, fades out over the whole change, or over its second half */
  leavingBody: 'hold' | 'all' | 'late' | null;
  /** the leaving picture: holds, or fades out over the second half */
  leavingPicture: 'hold' | 'late' | null;
  /** the arriving picture: fades in over the whole change, over its first half, or is just there */
  currentPicture: 'all' | 'early' | 'still' | null;
};

export function changePhases(change: SlideChange | null): ChangePhases {
  const none: ChangePhases = { leavingBody: null, leavingPicture: null, currentPicture: null };
  if (change === null) return none;
  const toPicture = change.current.picture !== undefined;
  const leaving = change.leaving;
  if (leaving === null)
    return { leavingBody: null, leavingPicture: null, currentPicture: toPicture ? 'still' : null };
  const fromPicture = leaving.picture !== undefined;
  if (!fromPicture && !toPicture)
    return { leavingBody: 'hold', leavingPicture: null, currentPicture: null };
  if (!fromPicture) return { leavingBody: 'late', leavingPicture: null, currentPicture: 'early' };
  if (!toPicture) return { leavingBody: 'hold', leavingPicture: 'late', currentPicture: null };
  return { leavingBody: 'all', leavingPicture: 'hold', currentPicture: 'all' };
}

/** True while the stage shows a picture across itself: the slide shown or the one leaving has one. */
export function showsPicture(change: SlideChange | null): boolean {
  if (change === null) return false;
  return change.current.picture !== undefined || change.leaving?.picture !== undefined;
}

type Held = { change: SlideChange | null; slide: ShownSlide | undefined };

/** The next change for a newly rendered slide: pure, so the move rules have a test. */
export function nextChange(
  was: SlideChange | null,
  slide: ShownSlide | undefined,
): SlideChange | null {
  if (slide === undefined) return null;
  if (was === null) return { current: slide, leaving: null, cut: false, seq: 0 };
  if (was.current.id === slide.id) {
    /* the same slide rendered again (an edit, a theme): it changes in place */
    if (was.current.html === slide.html && was.current.picture === slide.picture) return was;
    return { ...was, current: slide };
  }
  const cut = was.leaving !== null;
  return { current: slide, leaving: cut ? null : was.current, cut, seq: was.seq + 1 };
}

/** The arrival of move `seq` has entered: its leaving slide goes. A later move's arrival keeps its own. */
export function arrived(was: SlideChange | null, seq: number): SlideChange | null {
  if (was === null || was.seq !== seq || was.leaving === null) return was;
  return { ...was, leaving: null };
}

/**
 * The stage's change for the slide it renders. The next change is derived while rendering the
 * move, so the leaving body keeps its element (the keyed wrapper of SlideView) and is never
 * unmounted and mounted again; `entered` is SlideView's report that the arrival has ended.
 */
export function useSlideChange(slide: ShownSlide | undefined): {
  change: SlideChange | null;
  entered: (seq: number) => void;
} {
  const [held, setHeld] = useState<Held>(() => ({ change: nextChange(null, slide), slide }));
  let change = held.change;
  if (
    held.slide?.id !== slide?.id ||
    held.slide?.html !== slide?.html ||
    held.slide?.picture !== slide?.picture
  ) {
    change = nextChange(held.change, slide);
    setHeld({ change, slide });
  }
  const [entered] = useState(
    () => (seq: number) => setHeld((was) => ({ ...was, change: arrived(was.change, seq) })),
  );
  return { change, entered };
}
