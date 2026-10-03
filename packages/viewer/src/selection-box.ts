// The box of the selection ring (docs/archive/rounds/OBJECTS.md 2.4, the rotated ring; the objects round, B1).
// Measured on production (audit `a1-rectangle-rotate-08-step7.png`, `-17-up+400.png`): the ring
// of a rotated object was the measured box of its `.free` wrapper, which for a turned wrapper is
// the axis aligned bounding box (707 by 707 for 680 by 320 at 45 degrees), and the overlay then
// turned that box by the object's angle, so the ring read upright and growing during the drag
// and as a bounding box turned a second time after it. The rule here: one selected object that
// carries `pos` takes its `pos` box as the ring (the overlay turns it about its centre, the
// handles sit on the same box), read from the shown document so a gesture's draft drives it at
// every frame; an object without `pos` (a grammar field, a conversion's virtual object, a block
// in a layout slot) keeps its measured box, and so do the hover ring and the extra rings of a
// multi selection, which the overlay never turns. The text outset of text-ring.ts applies to
// both. Pure over the block and the boxes; selection-box.test.ts pins it.
import type { Block } from '@turboslide/schema/blocks';
import type { Box } from '@turboslide/schema/render';

import { ringBoxFor } from './text-ring';

/**
 * The ring box of one selected object: its `pos` box when the block carries one, else the
 * measured box; null when neither is known. `type` names the block's type for the text outset
 * when the block itself is unknown (a grammar field's type read from the markup).
 */
export function selectionRingBox(
  block: Pick<Block, 'type' | 'pos'> | undefined,
  measured: Box | null,
  type?: string,
): Box | null {
  const pos = block?.pos;
  const box: Box | null = pos !== undefined ? [pos.x, pos.y, pos.w, pos.h] : measured;
  if (box === null) return null;
  return ringBoxFor(block?.type ?? type, box);
}
