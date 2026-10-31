/**
 * The lighthouse slide of the Canvas screen (docs/SITE.md 9) in slide px, as the Turboslide CLI
 * wrote it (2026.1008.3, built at 417fd808, on a copy of `apps/studio/home-deck`): `slide to-canvas
 * lighthouse` placed every object at its box (home-deck/recorded/lighthouse-canvas.json; the
 * heading takes one line of the plate, the paragraph three), then
 * `block set lighthouse#h /pos '{"x":137,"y":129,"w":508,"h":48}'` and `block rotate lighthouse#h
 * --to 354` moved and turned the heading. An editor drag commits the same `block.set` on `/pos`
 * (packages/viewer/src/Gestures.tsx) and a turn the same rotate. The page writes whole px.
 */
export type SlideBox = { x: number; y: number; w: number; h: number; rotate?: number };

export const LIGHTHOUSE = {
  plate: { x: 903, y: 536.734375, w: 560, h: 234.265625 },
  paragraph: { x: 929, y: 618.25, w: 508, h: 99 },
  credit: { x: 929, y: 729.25, w: 508, h: 21.75 },
  /** the heading where `to-canvas` put it, on the plate */
  rest: { x: 929, y: 558.734375, w: 508, h: 47.515625, rotate: 0 },
  /** the heading after the two commands */
  moved: { x: 137, y: 129, w: 508, h: 48, rotate: 354 },
} as const satisfies Record<string, SlideBox>;

/**
 * The editor's selection ring stands 10 slide px off a text's box (TEXT_RING_OUTSET of
 * packages/viewer/src/text-ring.ts), so the ring and the dashed box of the rest pose are the
 * boxes grown by 10.
 */
export const RING_OFFSET = 10;

export function grow(box: SlideBox, by: number): SlideBox {
  return { ...box, x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by };
}

/**
 * Where the visitor has put the heading (CanvasScreen.tsx): its box's corner in whole slide px
 * and its turn in whole degrees; its size stays the moved box's.
 */
export type Pose = { x: number; y: number; rotate: number };

const SHEET = { w: 1600, h: 900 } as const;

/** A pose with whole values, its box's centre kept on the slide and its turn in 0 to 359. */
export function clampPose(pose: Pose): Pose {
  const { w, h } = LIGHTHOUSE.moved;
  const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Math.round(v)));
  return {
    x: clamp(pose.x, -w / 2, SHEET.w - w / 2),
    y: clamp(pose.y, -h / 2, SHEET.h - h / 2),
    rotate: turnTo(pose.rotate, 1),
  };
}

/** An angle in degrees as a turn of 0 to 359, rounded to a multiple of `step`. */
export function turnTo(deg: number, step: number): number {
  const turn = Math.round(deg / step) * step;
  return ((turn % 360) + 360) % 360;
}

/**
 * The `/pos` the editor writes for the heading at a pose, as the document holds it: the box's x,
 * y, w and h, then its turn (packages/schema `pos`; docs/freeform.md 2).
 */
export function poseJson(pose: Pose): string {
  const { w, h } = LIGHTHOUSE.moved;
  return JSON.stringify({ x: pose.x, y: pose.y, w, h, rotate: pose.rotate });
}
