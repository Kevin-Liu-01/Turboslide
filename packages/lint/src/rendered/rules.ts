// Rendered rules over RenderRecords (SPEC 7.7; MILESTONES M1 item 9): sheet/overflow,
// sheet/rail-touch, type/floor-15, type/weight-cap, type/face, rows/two-lines, plus the rendered
// half of type/svg-label-min. The remaining rendered rules (dia/label-clearance on raw svg,
// lines/law inside the sheet, contrast/both-themes, layout/*, asset/stretched,
// sheet/thumb-legible) land in M3 (MILESTONES M3 item 5). Every finding names the block and its
// pixel box from the record; a record carries the theme, so findings do too.
import type { Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';

/** Rails at 56 px from the edges, rules at 56 px from top and bottom (SPEC 2.1). */
export const RAIL = 56;
export const RAIL_TOUCH_PX = 8;
export const FLOOR_PX = 15;
export const WEIGHT_CAP = 500;
export const SVG_LABEL_MIN = 18;

/** Block types whose boxes hold text and must keep clear of the rails. */
const TEXT_TYPES = new Set([
  'heading',
  'paragraph',
  'credit',
  'rows',
  'plain',
  'refs',
  'say',
  'scales',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'panel',
  'board',
  'tiles',
  'matrix',
  'logoPlates',
]);

function blockPaths(ctx: LintContext, slide: Slide | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!slide) return map;
  for (const ref of ctx.blocksOf(slide)) map.set(ref.block.id, ref.path);
  return map;
}

/** Distance from a box to the four rails and rules; 0 when the box crosses one. */
function railDistance(box: [number, number, number, number]): { line: string; distance: number } {
  const [x, y, w, h] = box;
  const right = x + w;
  const bottom = y + h;
  const gap = (line: number, lo: number, hi: number): number =>
    lo > line ? lo - line : hi < line ? line - hi : 0;
  const candidates = [
    { line: 'left rail', distance: gap(RAIL, x, right) },
    { line: 'right rail', distance: gap(1600 - RAIL, x, right) },
    { line: 'top rule', distance: gap(RAIL, y, bottom) },
    { line: 'bottom rule', distance: gap(900 - RAIL, y, bottom) },
  ];
  return candidates.reduce((best, c) => (c.distance < best.distance ? c : best));
}

export function lintRecord(ctx: LintContext, record: RenderRecord): Finding[] {
  const out: Finding[] = [];
  const slide = ctx.slides[record.slideId];
  const paths = blockPaths(ctx, slide);
  const theme = record.theme;

  for (const entry of record.overflow) {
    out.push(
      ctx.finding('sheet/overflow', record.slideId, {
        blockId: entry.blockId,
        path: entry.blockId ? paths.get(entry.blockId) : undefined,
        theme,
        text: entry.selector,
        box: entry.box,
        proposal: `${entry.selector} leaves the 1600 by 900 sheet at ${entry.box[0]},${entry.box[1]} ${entry.box[2]}x${entry.box[3]}; shorten the copy or tighten the layout (DECK-GRAMMAR.md:15).`,
      }),
    );
  }

  if (record.fonts.status !== 'loaded') {
    const fallbacks = record.fonts.faces.filter((f) => f.startsWith('fallback:'));
    out.push(
      ctx.finding('type/face', record.slideId, {
        theme,
        text: fallbacks.join('; ') || record.fonts.status,
        proposal:
          'Inter did not load for every face the slide uses; the render fell back to another face (pptx report section 4.4). Check the fonts CSS and the woff2 path.',
      }),
    );
  }

  for (const [key, block] of Object.entries(record.blocks)) {
    const isRow = block.type === 'row';
    const [blockId, rowIndex] = isRow
      ? [key.slice(0, key.lastIndexOf('/')), Number(key.slice(key.lastIndexOf('/') + 1))]
      : [key, -1];
    const path = paths.get(blockId);
    if (isRow) {
      if ((block.lines ?? 0) > 2) {
        out.push(
          ctx.finding('rows/two-lines', record.slideId, {
            blockId,
            path: path ? `${path}/items/${rowIndex}/value` : undefined,
            theme,
            box: block.box,
            measured: { lines: block.lines ?? 0 },
            proposal: `Row ${rowIndex + 1} wraps to ${block.lines} lines; values are at most two lines (DECK-GRAMMAR.md:36). Shorten the value or widen the column.`,
          }),
        );
      }
      continue;
    }
    if (block.fontSize !== undefined && block.fontSize < FLOOR_PX) {
      out.push(
        ctx.finding('type/floor-15', record.slideId, {
          blockId,
          path,
          theme,
          box: block.box,
          measured: { fontSize: block.fontSize },
          proposal: `Text at ${block.fontSize} px is under the 15 px floor (DECK-GRAMMAR.md:21); use a ladder size.`,
        }),
      );
    }
    if (block.type === 'dia' && block.fontSize !== undefined && block.fontSize < SVG_LABEL_MIN) {
      out.push(
        ctx.finding('type/svg-label-min', record.slideId, {
          blockId,
          path,
          theme,
          box: block.box,
          measured: { fontSize: block.fontSize },
          proposal: `Diagram text renders at ${block.fontSize} px; the minimum is 18 px (head:157-160).`,
        }),
      );
    }
    if (block.fontWeight !== undefined && block.fontWeight > WEIGHT_CAP && block.type !== 'spec') {
      out.push(
        ctx.finding('type/weight-cap', record.slideId, {
          blockId,
          path,
          theme,
          box: block.box,
          measured: { fontWeight: block.fontWeight },
          proposal: `Weight ${block.fontWeight} renders in a ${block.type} block; display weight is capped at 500 (DECK-GRAMMAR.md:20).`,
        }),
      );
    }
    if (TEXT_TYPES.has(block.type)) {
      const near = railDistance(block.box);
      const crosses = block.box[0] < RAIL && block.box[0] + block.box[2] > RAIL;
      if (
        near.distance < RAIL_TOUCH_PX &&
        !crosses &&
        record.overflow.every((o) => o.blockId !== blockId)
      ) {
        out.push(
          ctx.finding('sheet/rail-touch', record.slideId, {
            blockId,
            path,
            theme,
            box: block.box,
            measured: { distance: near.distance },
            proposal: `The ${block.type} box is ${near.distance} px from the ${near.line}; keep text at least ${RAIL_TOUCH_PX} px clear of the rails and rules (DECK-GRAMMAR.md:15).`,
          }),
        );
      }
    }
  }
  return out;
}
