import type { Box } from '@turboslide/schema/render';

/**
 * The ring of a text object stands off its text (Kevin, 2026-09-20: the caret at the first
 * character sat on the ring's left edge and the two fused). A text object's measured box is its
 * text's box, so the selection ring, the hover ring and the drag area of a text object are drawn
 * this many sheet pixels outside it, the way Google Slides insets text inside a text box. The
 * document does not change: the outset is the overlay's, never the renderer's, so the show, the
 * PDF and the PowerPoint draw exactly what they drew.
 */
export const TEXT_RING_OUTSET = 10;

/** The block types whose box is a text box: the ring and the drag area stand off by TEXT_RING_OUTSET. */
export const TEXT_RING_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'text',
  'plain',
  'say',
  'credit',
]);

/** The ring box of a block: the measured box, outset for a text type, as measured for every other. */
export function ringBoxFor(type: string | undefined, box: Box): Box {
  if (type === undefined || !TEXT_RING_TYPES.has(type)) return box;
  const d = TEXT_RING_OUTSET;
  return [box[0] - d, box[1] - d, box[2] + 2 * d, box[3] + 2 * d];
}

/** Whether a sheet point sits inside a box, edges included. */
export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box[0] && x <= box[0] + box[2] && y >= box[1] && y <= box[1] + box[3];
}

/**
 * The type of a block as the renderer wrote it (`data-type` on the block element), for the
 * grammar fields the slide's block list does not carry (the cover title, a subtitle). Ids are the
 * renderer's slugs; anything else answers undefined rather than reaching the selector.
 */
export function blockTypeIn(root: ParentNode | null | undefined, id: string): string | undefined {
  if (!root || !/^[A-Za-z0-9_.:-]+$/.test(id)) return undefined;
  const el = root.querySelector(`[data-block="${id}"]`);
  return el?.getAttribute('data-type') ?? undefined;
}
