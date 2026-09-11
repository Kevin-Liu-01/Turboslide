// The layout rules over a record (SPEC 7.7; DECK-GRAMMAR.md:61; report 03 section 11 item 4):
// layout/columns-aligned compares the tops of side-by-side rows blocks, layout/pair-gaps compares
// the gaps of a pair or details grid from the measured image boxes, and layout/empty-half reads
// the screenshot to compare the ink coverage of the two columns of a cols slide.
import { slotBoxes } from '@turboslide/render/geometry';
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Box, Finding, RenderRecord, Slide, SlotName } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { Bitmap } from './bitmap.ts';
import { inkFraction } from './bitmap.ts';
import { PAPER } from './palette.ts';
import type { BlockIndex } from './shared.ts';
import { round1, round2 } from './shared.ts';

/** The slot pairs that sit side by side (SPEC 4.2 Layout: cols, and a split head in columns). */
const SIDE_BY_SIDE: readonly [SlotName, SlotName][] = [
  ['left', 'right'],
  ['headLeft', 'headRight'],
];

export function checkColumnsAligned(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (!slide || slide.kind !== 'content') return out;
  for (const [a, b] of SIDE_BY_SIDE) {
    const left = [...refs.values()].find((ref) => ref.slot === a && ref.block.type === 'rows');
    const right = [...refs.values()].find((ref) => ref.slot === b && ref.block.type === 'rows');
    if (!left || !right) continue;
    const lb = record.blocks[left.block.id]?.box;
    const rb = record.blocks[right.block.id]?.box;
    if (!lb || !rb) continue;
    const dy = rb[1] - lb[1];
    if (Math.abs(dy) <= RENDERED_LIMITS.columnsAlignedPx) continue;
    const lower = dy > 0 ? right : left;
    const other = dy > 0 ? left : right;
    const lowerBox = dy > 0 ? rb : lb;
    out.push(
      ctx.finding('layout/columns-aligned', slide.id, {
        blockId: lower.block.id,
        path: lower.path,
        theme: record.theme,
        box: lowerBox,
        measured: { dy: Math.abs(dy), leftTop: lb[1], rightTop: rb[1] },
        text: `${left.block.id} at ${lb[1]}, ${right.block.id} at ${rb[1]}`,
        proposal: `The rows block ${lower.block.id} starts ${Math.abs(dy)} px below ${other.block.id} in the other column; side-by-side rows share one top within ${RENDERED_LIMITS.columnsAlignedPx} px (report 03 section 11 item 4). Match the blocks above them or the column alignment.`,
      }),
    );
  }
  return out;
}

type Row = { top: number; bottom: number; boxes: Box[] };

/** Image boxes grouped into rows: boxes whose tops lie within 4 px share a row. */
function groupRows(boxes: readonly Box[]): Row[] {
  const sorted = [...boxes].sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const rows: Row[] = [];
  for (const box of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(box[1] - row.top) <= 4) {
      row.boxes.push(box);
      row.bottom = Math.max(row.bottom, box[1] + box[3]);
    } else rows.push({ top: box[1], bottom: box[1] + box[3], boxes: [box] });
  }
  for (const row of rows) row.boxes.sort((p, q) => p[0] - q[0]);
  return rows;
}

export function checkPairGaps(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (!slide) return out;
  for (const ref of refs.values()) {
    const { block } = ref;
    if (block.type !== 'pair' && block.type !== 'details') continue;
    const images = record.rasters
      .filter((r) => r.blockId === block.id && r.kind === 'shot')
      .map((r) => r.box);
    if (images.length < 2) continue;
    const rows = groupRows(images);
    const horizontal: number[] = [];
    for (const row of rows) {
      for (let i = 1; i < row.boxes.length; i += 1) {
        const prev = row.boxes[i - 1];
        const next = row.boxes[i];
        if (prev && next) horizontal.push(next[0] - (prev[0] + prev[2]));
      }
    }
    const vertical: number[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const next = rows[i];
      if (prev && next) vertical.push(next.top - prev.bottom);
    }
    const report = (axis: 'horizontal' | 'vertical', gaps: number[]): void => {
      if (gaps.length < 2) return;
      const min = Math.min(...gaps);
      const max = Math.max(...gaps);
      if (max - min <= RENDERED_LIMITS.pairGapPx) return;
      out.push(
        ctx.finding('layout/pair-gaps', slide.id, {
          blockId: block.id,
          path: ref.path,
          theme: record.theme,
          box: record.blocks[block.id]?.box,
          text: `${axis} gaps ${gaps.join(', ')} px`,
          measured: { min, max, spread: max - min },
          proposal: `The ${axis} gaps between the figures of ${block.id} run from ${min} to ${max} px; a ${block.type} grid keeps its gaps equal within ${RENDERED_LIMITS.pairGapPx} px (DECK-GRAMMAR.md:61). Give the figures one width or one gap.`,
        }),
      );
    };
    report('horizontal', horizontal);
    report('vertical', vertical);
  }
  return out;
}

export function checkEmptyHalf(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
  bitmap: Bitmap | null,
): Finding[] {
  const out: Finding[] = [];
  if (!bitmap || !slide || slide.kind !== 'content' || slide.layout.type !== 'cols') return out;
  const boxes = slotBoxes(slide.layout);
  const left = boxes.left;
  const right = boxes.right;
  if (!left || !right) return out;
  const paper = PAPER[record.theme];
  const coverage = {
    left: inkFraction(bitmap, left, paper),
    right: inkFraction(bitmap, right, paper),
  };
  const check = (empty: 'left' | 'right', full: 'left' | 'right'): void => {
    if (
      coverage[empty] >= RENDERED_LIMITS.emptyHalfMaxFraction ||
      coverage[full] <= RENDERED_LIMITS.fullHalfMinFraction
    )
      return;
    const first = [...refs.values()].find((ref) => ref.slot === empty);
    out.push(
      ctx.finding('layout/empty-half', slide.id, {
        blockId: first?.block.id,
        path: first?.path ?? `/slots/${empty}`,
        theme: record.theme,
        box: empty === 'left' ? left : right,
        text: `${empty} column`,
        measured: {
          leftCoverage: round2(coverage.left * 100),
          rightCoverage: round2(coverage.right * 100),
        },
        proposal: `The ${empty} column carries ${round1(coverage[empty] * 100)} percent ink while the ${full} column carries ${round1(coverage[full] * 100)} percent; a half-empty slide is a defect (DECK-GRAMMAR.md:61). Fill the column or use a single-column layout.`,
      }),
    );
  };
  check('left', 'right');
  check('right', 'left');
  return out;
}
