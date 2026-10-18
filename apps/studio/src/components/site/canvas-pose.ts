/**
 * The lighthouse slide of screen 02 (docs/SITE.md 9) in slide px, as the Turboslide CLI wrote
 * it (2026.1008.3, built at 417fd808, on a copy of `apps/studio/home-deck`): `slide to-canvas
 * lighthouse` placed every object at its box (home-deck/recorded/lighthouse-canvas.json; the
 * heading takes one line of the plate, the paragraph three), then
 * `block set lighthouse#h /pos '{"x":137,"y":129,"w":508,"h":48}'` and `block rotate lighthouse#h
 * --to 354` moved and turned the heading. An editor drag commits the same `block.set` on `/pos`
 * (packages/viewer/src/Gestures.tsx) and a turn the same rotate. The table rounds to whole px.
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
