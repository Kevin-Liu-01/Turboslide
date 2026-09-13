// The canvas rules (docs/freeform.md; gslides-parity SPEC-2 1.4, 0.76, 0.96, 0.107): layout/freeform
// says a slide is arranged by hand (severity 1, the one note a canvas slide carries; no rule fires
// because a slide was converted or holds many objects); freeform/off-sheet reads an object's
// rotated bounding box against the sheet, severity 3 when nothing of it shows (wholly outside) and
// 2 through the severity override when it crosses an edge, because Google lets objects lie past
// the slide and clips them in the show; freeform/overlap names two text carrying objects placed
// over each other (severity 1), skipping a pair whose lower object is the picture object or a
// textless box, since a text over a photograph or a plate is the design. The arithmetic is the
// schema's (@turboslide/schema/freeform), the same the editor snaps with. The messages are the
// sales sentences of SPEC-2 section 10, with no engineering word.
import type { Block, Finding, Position } from '../contracts.ts';
import {
  boundingBox,
  boxesOverlap,
  offSheetKind,
  overlapArea,
  positionBox,
  zOf,
} from '../contracts.ts';
import type { BlockRef, LintContext } from '../context.ts';

/** The sentence layout/freeform carries (SPEC-2 1.4, 0.76). */
export const FREEFORM_SENTENCE = 'This slide is arranged by hand; Apply layout re-flows it';
/** The two sentences of freeform/off-sheet (SPEC-2 0.96). */
export const OFF_SHEET_OUTSIDE =
  'This object is outside the slide and will not show. Move it onto the slide or delete it';
export const OFF_SHEET_CROSSING = "Part of this object is past the slide's edge and will not show";

/** Block types whose box carries text the reader must see whole. */
export const TEXT_CARRIERS: ReadonlySet<Block['type']> = new Set<Block['type']>([
  'heading',
  'paragraph',
  'credit',
  'text',
  'rows',
  'plain',
  'refs',
  'say',
  'scales',
  'ladder',
  'panel',
  'board',
  'matrix',
  'table',
]);

function carriesText(block: Block): boolean {
  if (block.type === 'box' || block.type === 'shape')
    return block.text !== undefined && block.text !== '';
  return TEXT_CARRIERS.has(block.type);
}

/** A lower object a text may sit over by design: the picture object, or a box with no text (SPEC-2 0.76). */
function isGround(block: Block): boolean {
  if (block.type === 'picture') return true;
  return block.type === 'box' && (block.text === undefined || block.text === '');
}

function intersection(a: Position, b: Position): [number, number, number, number] {
  const ba = boundingBox(a);
  const bb = boundingBox(b);
  const x = Math.max(ba.x, bb.x);
  const y = Math.max(ba.y, bb.y);
  return [x, y, Math.min(ba.x + ba.w, bb.x + bb.w) - x, Math.min(ba.y + ba.h, bb.y + bb.h) - y];
}

function roundBox(pos: Position): [number, number, number, number] {
  const b = boundingBox(pos);
  return [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)];
}

export function checkFreeform(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    if (slide.kind !== 'content' || slide.layout.type !== 'freeform') continue;
    const positioned = ctx
      .blocksOf(slide)
      .filter((ref) => ref.parent === undefined && ref.block.pos !== undefined);
    out.push(
      ctx.finding('layout/freeform', slide.id, {
        path: '/layout',
        text: 'freeform',
        measured: { blocks: positioned.length },
        proposal: FREEFORM_SENTENCE,
      }),
    );
    for (const ref of positioned) {
      const pos = ref.block.pos as Position;
      const kind = offSheetKind(pos);
      if (kind === 'inside') continue;
      out.push(
        ctx.finding('freeform/off-sheet', slide.id, {
          blockId: ref.block.id,
          path: `${ref.path}/pos`,
          box: roundBox(pos),
          measured: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
          proposal: kind === 'outside' ? OFF_SHEET_OUTSIDE : OFF_SHEET_CROSSING,
          // crossing an edge is severity 2: part of the object shows and the editor lets a
          // photograph bleed (SPEC-2 0.96); the table severity 3 stays the gate for an object
          // nothing of which shows
          ...(kind === 'crossing' ? { severity: 2 as const } : {}),
        }),
      );
    }
    // pairs in paint order; the finding names the object painted later and both ids
    const stack: BlockRef[] = [...positioned].sort(
      (a, b) => zOf(a.block.pos) - zOf(b.block.pos) || a.index - b.index,
    );
    const n = ctx.slideN(slide.id);
    for (let i = 0; i < stack.length; i += 1) {
      for (let j = i + 1; j < stack.length; j += 1) {
        const lower = stack[i];
        const upper = stack[j];
        if (lower === undefined || upper === undefined) continue;
        if (!carriesText(upper.block) || !carriesText(lower.block)) continue;
        if (isGround(lower.block)) continue;
        const a = lower.block.pos as Position;
        const b = upper.block.pos as Position;
        if (!boxesOverlap(a, b)) continue;
        out.push(
          ctx.finding('freeform/overlap', slide.id, {
            blockId: upper.block.id,
            path: `${upper.path}/pos`,
            text: `${lower.block.id} and ${upper.block.id}`,
            box: intersection(a, b),
            measured: { overlap: Math.round(overlapArea(a, b)) },
            proposal: `Slide ${n} has 2 objects placed over its text. Move one of them or apply a layout`,
          }),
        );
      }
    }
  }
  return out;
}

export { positionBox };
