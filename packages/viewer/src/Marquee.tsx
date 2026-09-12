// The marquee of the freeform stage (this round's directive: multi-select with Shift click and a
// marquee): a press on the sheet outside every block drags a rectangle, and the blocks whose
// boxes it crosses become the selection, in document order, the first as the anchor the inspector
// edits. The model is pure over sheet pixels and pinned by marquee.test.ts; the component draws
// the rectangle inside the overlay layer in CSS pixels, 1px --pt-ink as a state (SPEC 2.2 line law:
// an active gesture draws ink), never inside the sheet's markup.
import type { CSSProperties } from 'react';

import type { Box } from '@turboslide/schema/render';

import type { Point } from './Gestures';

import './Marquee.css';

/** A press has to travel this many sheet pixels before it counts as a marquee rather than a click. */
export const MARQUEE_MIN_PX = 3;

/** The normalized rectangle between the press and the pointer. */
export function marqueeBox(start: Point, now: Point): Box {
  const x = Math.min(start.x, now.x);
  const y = Math.min(start.y, now.y);
  return [x, y, Math.abs(now.x - start.x), Math.abs(now.y - start.y)];
}

/** True when the marquee is wide or tall enough to be one. */
export function isMarquee(box: Box): boolean {
  return box[2] >= MARQUEE_MIN_PX || box[3] >= MARQUEE_MIN_PX;
}

function intersects(a: Box, b: Box): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

/**
 * The blocks a marquee crosses, in `order` (document order from the rendered slide). A block
 * touched at all is taken; a zero-size marquee takes nothing.
 */
export function marqueeHits(
  box: Box,
  blocks: Record<string, Box>,
  order: readonly string[],
): string[] {
  if (box[2] <= 0 && box[3] <= 0) return [];
  return order.filter((id) => {
    const block = blocks[id];
    return block !== undefined && intersects(box, block);
  });
}

export type MarqueeRectProps = { box: Box; k: number };

/** The marquee rectangle, placed in CSS pixels inside the overlay. */
export function MarqueeRect({ box, k }: MarqueeRectProps) {
  const style: CSSProperties = {
    left: box[0] * k,
    top: box[1] * k,
    width: box[2] * k,
    height: box[3] * k,
  };
  return <div className="ts-marquee" style={style} aria-hidden="true" />;
}
