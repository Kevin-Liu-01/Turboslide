// What the rendered rules share: the block index of a slide (id to BlockRef with its slot and JSON
// pointer), the record's box for a block, and the owner of a point (the innermost block whose
// measured box holds it), so every finding names a block and a pixel box (SPEC 7.7).
import type { Box, RenderRecord, Slide } from '../contracts.ts';
import type { BlockRef, LintContext } from '../context.ts';

export type BlockIndex = Map<string, BlockRef>;

export function indexBlocks(ctx: LintContext, slide: Slide | undefined): BlockIndex {
  const map: BlockIndex = new Map();
  if (!slide) return map;
  for (const ref of ctx.blocksOf(slide)) map.set(ref.block.id, ref);
  return map;
}

/** The measured box of a block, or undefined when the record has none for it. */
export function blockBox(record: RenderRecord, blockId: string): Box | undefined {
  return record.blocks[blockId]?.box;
}

function contains(box: Box, x: number, y: number, slack = 1): boolean {
  return (
    x >= box[0] - slack &&
    x <= box[0] + box[2] + slack &&
    y >= box[1] - slack &&
    y <= box[1] + box[3] + slack
  );
}

/** The innermost block (smallest box) whose measured box holds the point; rows entries are skipped. */
export function ownerAt(record: RenderRecord, x: number, y: number): string | undefined {
  let best: string | undefined;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const [id, block] of Object.entries(record.blocks)) {
    if (block.type === 'row') continue;
    if (!contains(block.box, x, y)) continue;
    const area = block.box[2] * block.box[3];
    if (area < bestArea) {
      best = id;
      bestArea = area;
    }
  }
  return best;
}

export function roundBox(box: Box): Box {
  return box.map(Math.round) as Box;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The union of two boxes. */
export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  const right = Math.max(a[0] + a[2], b[0] + b[2]);
  const bottom = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x, y, right - x, bottom - y];
}
