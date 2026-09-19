// Three pure rules of the stage's gestures, kept out of Editor.tsx so they carry unit tests
// (__tests__/stage-rules.test.ts; the return round, docs/RETURN.md section 6, B3 objects):
// which deck guide a press at a crossing of two guides drags, whether the stage or the browser
// owns a Tab, and the size a draw drag shows while it is down. Framework free, no DOM.
import type { Box } from '@turboslide/schema/render';

import { drawnPosition } from './Gestures';

export type GuideAxis = 'x' | 'y';
/** A deck guide: `axis: 'x'` is a vertical line at `at`, `axis: 'y'` a horizontal one. */
export type GuidePress = { axis: GuideAxis; at: number };
export type GuideLists = { x: ReadonlyArray<number>; y: ReadonlyArray<number> };
export type Point = { x: number; y: number };

/**
 * The hit strip of a deck guide in CSS px: DeckGuides.tsx draws the 1 px rule down the middle of
 * a 7 px strip that takes the pointer (its GUIDE_HIT_PX; the chrome depends on the viewer, so the
 * number is repeated here and deck-guides.test.tsx pins the chrome's).
 */
export const GUIDE_HIT_PX = 7;
/** A press at a crossing waits this many CSS px of travel before it picks the guide it drags. */
export const GUIDE_PICK_PX = 3;

/**
 * The guide on the other axis under a press on a guide, or null when none crosses there. The
 * measured mechanism (b3.md, return round): View > Guides > Add vertical guide lands at x 800 and
 * Add horizontal guide at y 450, which cross at the sheet centre, the midpoint of both lines; the
 * horizontal guide is drawn after the vertical one, so a press at the vertical guide's centre
 * lands on the horizontal guide, and a horizontal drag of a horizontal guide changes nothing
 * (audit-surface row 45's readout "3.75 in" is y 450 at 120 px per inch). `hit` is the half
 * strip in sheet px, so the crossing is read at the stage's scale.
 */
export function crossingGuide(
  pressed: GuidePress,
  point: Point,
  guides: GuideLists,
  hit: number,
): GuidePress | null {
  const other: GuideAxis = pressed.axis === 'x' ? 'y' : 'x';
  const along = other === 'x' ? point.x : point.y;
  let best: GuidePress | null = null;
  for (const at of guides[other]) {
    const distance = Math.abs(at - along);
    if (distance <= hit && (best === null || distance < Math.abs(best.at - along)))
      best = { axis: other, at };
  }
  return best;
}

/**
 * Which of the two crossing guides a drag moves, from the pointer's travel since the press in
 * CSS px: the guide that lies across the dominant travel (a horizontal travel moves the vertical
 * guide, a vertical travel the horizontal one), or null while the travel is under `threshold`,
 * so a click at a crossing drags nothing.
 */
export function guideForTravel(
  pressed: GuidePress,
  crossing: GuidePress,
  dx: number,
  dy: number,
  threshold: number = GUIDE_PICK_PX,
): GuidePress | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  const axis: GuideAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  return pressed.axis === axis ? pressed : crossing;
}

export type TabPress = {
  /** an object is selected on the stage */
  selected: boolean;
  /** the key's target is a chrome control outside the stage (Editor.tsx isChromeControlTarget) */
  fromControl: boolean;
  /** the target sits in the overlay layer (a handle, the chip): the stage's own controls */
  fromOverlay: boolean;
  /** the target sits inside the stage root */
  inside: boolean;
  /** the target is the document body */
  fromPage: boolean;
};

/**
 * True when the stage walks the objects on Tab and Shift Tab (SPEC-2 0.83); false leaves the
 * browser's focus order. A Tab from a chrome control outside the stage and the overlay (a title
 * row button, a toolbar button, a panel field, a filmstrip card) is the browser's whether or not
 * an object is selected: docs/RETURN.md 4.1 (`chrome.split.tab-order`) measured the stage taking
 * the Tab from the Slideshow half while the title was selected, so the focus never reached the
 * chevron and the canvas selection moved to the subtitle. A Tab from the stage, the body or an
 * overlay handle walks the objects as before; with nothing selected, only the stage and the body
 * start the walk.
 */
export function stageOwnsTab(press: TabPress): boolean {
  if (press.fromControl && !press.fromOverlay) return false;
  if (!press.selected && !press.inside && !press.fromPage) return false;
  return true;
}

/**
 * The size a draw drag shows while it is down: the width and height the release would store
 * (drawnPosition, the 8 px grid under Snap to > Grid), or null before the pointer has travelled
 * DRAW_MIN_PX, when the release places the tool's default box. The resize readout shows the same
 * two numbers (Overlay.tsx), so a seller drawing a box reads its size the way Google Slides shows
 * it while a shape is drawn.
 */
export function drawReadout(
  box: Box,
  dragged: boolean,
  grid: boolean,
): { w: number; h: number } | null {
  if (!dragged) return null;
  const position = drawnPosition(box, 0, grid);
  return { w: position.w, h: position.h };
}

/** The readout's text, the resize readout's form (menus/strings.ts CANVAS.size). */
export function sizeLabel(w: number, h: number): string {
  return `${w} × ${h}`;
}

/** The readout chip's height and gap in CSS px (Overlay.css .ts-readout is 18 px tall). */
export const READOUT_H = 18;
export const READOUT_GAP = 6;

/**
 * Where the draw readout sits: above the drawn box's top right edge, clear of the box, or under
 * its bottom right when the box touches the top of the sheet; in CSS px at the stage scale `k`.
 */
export function drawReadoutStyle(
  box: Box,
  k: number,
): { left: number; top: number; transform: string } {
  const above = box[1] * k - READOUT_H - READOUT_GAP;
  return {
    left: (box[0] + box[2]) * k,
    top: above >= 0 ? above : (box[1] + box[3]) * k + READOUT_GAP,
    transform: 'translateX(-100%)',
  };
}
