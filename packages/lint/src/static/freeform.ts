// The freeform rules (docs/freeform.md): layout/freeform says a slide left the grammar for hand
// placement (severity 1, so a pure-grammar deck knows); freeform/off-sheet is the static form of
// sheet/overflow for a positioned box (severity 3, the gate, DECK-GRAMMAR.md:15); freeform/overlap
// names two text-carrying blocks whose boxes intersect (severity 1: a box behind a text is a
// design, two texts over each other is a defect the judge reads). The arithmetic is the schema's
// (@turboslide/schema/freeform), the same the editor snaps with.
import type { Block, Finding, Position } from '../contracts.ts';
import { boxesOverlap, offSheet, overlapArea, positionBox, zOf } from '../contracts.ts';
import type { BlockRef, LintContext } from '../context.ts';

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
]);

function carriesText(block: Block): boolean {
  if (block.type === 'box') return block.text !== undefined && block.text !== '';
  return TEXT_CARRIERS.has(block.type);
}

function intersection(a: Position, b: Position): [number, number, number, number] {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return [x, y, Math.min(a.x + a.w, b.x + b.w) - x, Math.min(a.y + a.h, b.y + b.h) - y];
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
        proposal:
          'The slide places its blocks by hand on the freeform layout; a grammar layout keeps the deck on the slot geometry (slide.setLayout moves it back, docs/freeform.md).',
      }),
    );
    for (const ref of positioned) {
      const pos = ref.block.pos as Position;
      if (offSheet(pos)) {
        out.push(
          ctx.finding('freeform/off-sheet', slide.id, {
            blockId: ref.block.id,
            path: `${ref.path}/pos`,
            box: positionBox(pos),
            proposal: `Block "${ref.block.id}" reaches ${pos.x},${pos.y} ${pos.w}x${pos.h}, past the 1600 by 900 sheet; move or shrink it (DECK-GRAMMAR.md:15).`,
          }),
        );
      }
    }
    // pairs of text carriers; the finding names the block painted later, and names both
    const carriers: BlockRef[] = positioned
      .filter((ref) => carriesText(ref.block))
      .sort((a, b) => zOf(a.block.pos) - zOf(b.block.pos) || a.index - b.index);
    for (let i = 0; i < carriers.length; i += 1) {
      for (let j = i + 1; j < carriers.length; j += 1) {
        const lower = carriers[i];
        const upper = carriers[j];
        if (lower === undefined || upper === undefined) continue;
        const a = lower.block.pos as Position;
        const b = upper.block.pos as Position;
        if (!boxesOverlap(a, b)) continue;
        out.push(
          ctx.finding('freeform/overlap', slide.id, {
            blockId: upper.block.id,
            path: `${upper.path}/pos`,
            text: `${lower.block.id} and ${upper.block.id}`,
            box: intersection(a, b),
            measured: { overlap: overlapArea(a, b) },
            proposal: `Blocks "${lower.block.id}" and "${upper.block.id}" both carry text and their boxes overlap by ${Math.round(overlapArea(a, b))} px squared; move one so the reader sees both (docs/freeform.md).`,
          }),
        );
      }
    }
  }
  return out;
}
