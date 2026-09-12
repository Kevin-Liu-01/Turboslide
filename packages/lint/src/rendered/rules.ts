// Rendered rules over RenderRecords (SPEC 7.7; MILESTONES M1 item 9 and M3 item 5): sheet/overflow,
// sheet/rail-touch, type/floor-15, type/weight-cap, type/face, rows/two-lines and the rendered
// half of type/svg-label-min from the record's boxes and text metrics; layout/columns-aligned,
// layout/pair-gaps, asset/stretched and sheet/thumb-legible from the boxes and the document; the
// rendered half of dia/label-clearance from a raw svg's geometry scaled by its measured box; and
// contrast/both-themes, layout/empty-half and lines/law from the screenshot's pixels (bitmap.ts),
// which are skipped when the PNG is not on disk. Every finding names the block and its pixel box
// from the record; a record carries the theme, so findings do too. The limits are
// RENDERED_LIMITS in @turboslide/schema/rules, one source for the checks and the docs.
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { RenderedInputs } from './bitmap.ts';
import { loadRecordBitmap } from './bitmap.ts';
import { checkLabelClearance } from './clearance.ts';
import { checkContrast } from './contrast.ts';
import { checkColumnsAligned, checkEmptyHalf, checkPairGaps } from './layout.ts';
import { checkLinesLaw } from './lines.ts';
import { indexBlocks } from './shared.ts';
import { checkStretched } from './stretched.ts';
import { checkThumbLegible } from './thumb.ts';

export type { RenderedInputs } from './bitmap.ts';

/** Rails at 56 px from the edges, rules at 56 px from top and bottom (SPEC 2.1). */
export const RAIL = 56;
export const RAIL_TOUCH_PX = RENDERED_LIMITS.railTouchPx;
export const FLOOR_PX = RENDERED_LIMITS.floorPx;
export const WEIGHT_CAP = RENDERED_LIMITS.weightCap;
export const SVG_LABEL_MIN = RENDERED_LIMITS.svgLabelMinPx;

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
  'text',
  'box',
]);

/**
 * The render directory a caller passed through the lint options, when it did. LintOptions in
 * context.ts does not declare the field yet; it is read here by name so `turboslide lint
 * --render <dir>` can hand it down once the CLI passes it (AGENTS.md contracts: a record's image
 * is relative to the render directory).
 */
function renderDirOf(options: object): string | undefined {
  const value: unknown = (options as Record<string, unknown>).renderDir;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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

export function lintRecord(
  ctx: LintContext,
  record: RenderRecord,
  inputs: RenderedInputs = {},
): Finding[] {
  const out: Finding[] = [];
  const slide: Slide | undefined = ctx.slides[record.slideId];
  const refs = indexBlocks(ctx, slide);
  const paths = new Map([...refs].map(([id, ref]) => [id, ref.path]));
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
    // a rows value is `<blockId>/<row>` of type row; a table cell is `<blockId>/<row>/<column>`
    // of type cell (gslides-parity SPEC 7.3): rows/two-lines reads both
    const isRow = block.type === 'row';
    const isCell = block.type === 'cell';
    const segments = key.split('/');
    const blockId = isRow
      ? key.slice(0, key.lastIndexOf('/'))
      : isCell
        ? segments.slice(0, -2).join('/')
        : key;
    const rowIndex = isRow
      ? Number(key.slice(key.lastIndexOf('/') + 1))
      : isCell
        ? Number(segments[segments.length - 2])
        : -1;
    const columnIndex = isCell ? Number(segments[segments.length - 1]) : -1;
    const path = paths.get(blockId);
    if (isRow || isCell) {
      if ((block.lines ?? 0) > 2) {
        out.push(
          ctx.finding('rows/two-lines', record.slideId, {
            blockId,
            path: path
              ? isCell
                ? `${path}/rows/${rowIndex}/cells/${columnIndex}`
                : `${path}/items/${rowIndex}/value`
              : undefined,
            theme,
            box: block.box,
            measured: { lines: block.lines ?? 0 },
            proposal: isCell
              ? `The cell at row ${rowIndex + 1}, column ${columnIndex + 1} wraps to ${block.lines} lines; cells are at most two lines (gslides-parity SPEC 7.3). Shorten the text or widen the column.`
              : `Row ${rowIndex + 1} wraps to ${block.lines} lines; values are at most two lines (DECK-GRAMMAR.md:36). Shorten the value or widen the column.`,
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

  // M3 item 5: the rules that read the document and the boxes together
  out.push(...checkColumnsAligned(ctx, record, slide, refs));
  out.push(...checkPairGaps(ctx, record, slide, refs));
  out.push(...checkStretched(ctx, record, slide, refs));
  out.push(...checkThumbLegible(ctx, record, slide, refs));
  out.push(...checkLabelClearance(ctx, record, slide, refs));

  // and the rules that read the screenshot; null means there is none, so nothing is read from disk
  const renderDir = inputs.renderDir ?? renderDirOf(ctx.options);
  const bitmap = inputs.bitmap !== undefined ? inputs.bitmap : loadRecordBitmap(record, renderDir);
  out.push(...checkContrast(ctx, record, slide, refs, bitmap));
  out.push(...checkEmptyHalf(ctx, record, slide, refs, bitmap));
  out.push(...checkLinesLaw(ctx, record, slide, refs, bitmap));
  return out;
}
