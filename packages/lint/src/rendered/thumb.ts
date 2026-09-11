// sheet/thumb-legible (SPEC 7.7; report 03 section 1): text whose rendered size falls under 2 px at
// the grid's 0.14x. The record's font size is the computed CSS size; inside a diagram the
// rendered size is that times the diagram's scale, the block's width over its viewBox width, and
// that is where the rule adds to type/floor-15: an 18 px label in a 1200 unit viewBox drawn in a
// 600 px slot renders at 9 px. Text already under the 15 px floor is left to type/floor-15.
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { BlockIndex } from './shared.ts';
import { round2 } from './shared.ts';
import { svgViewBox } from './svg.ts';

/** The scale a diagram renders at: its measured width over its viewBox width; 1 for fit slot. */
export function diagramScale(
  ref: BlockIndex extends Map<string, infer R> ? R : never,
  boxWidth: number,
): number {
  const { block } = ref;
  if (block.type !== 'dia' || boxWidth <= 0) return 1;
  if (block.fit === 'slot') return 1;
  const viewBoxWidth =
    typeof block.fit === 'object'
      ? block.fit.viewBox[2]
      : block.svg
        ? svgViewBox(block.svg)?.[2]
        : block.data?.w;
  if (!viewBoxWidth || viewBoxWidth <= 0) return 1;
  return boxWidth / viewBoxWidth;
}

export function checkThumbLegible(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (!slide) return out;
  for (const [id, block] of Object.entries(record.blocks)) {
    if (block.type === 'row' || block.fontSize === undefined) continue;
    if (block.fontSize < RENDERED_LIMITS.floorPx) continue;
    const ref = refs.get(id);
    const scale = ref ? diagramScale(ref, block.box[2]) : 1;
    const rendered = block.fontSize * scale;
    const atThumb = rendered * RENDERED_LIMITS.thumbScale;
    if (atThumb >= RENDERED_LIMITS.thumbMinPx) continue;
    out.push(
      ctx.finding('sheet/thumb-legible', slide.id, {
        blockId: id,
        path: ref?.path,
        theme: record.theme,
        box: block.box,
        measured: {
          fontSize: block.fontSize,
          scale: round2(scale),
          rendered: round2(rendered),
          atThumb: round2(atThumb),
        },
        proposal: `Text at ${block.fontSize} px renders at ${round2(rendered)} px (the diagram is drawn at ${round2(scale)} of its viewBox), ${round2(atThumb)} px in a 0.14x thumbnail; keep rendered text at ${Math.ceil(RENDERED_LIMITS.thumbMinPx / RENDERED_LIMITS.thumbScale)} px or more, or size the viewBox to the slot (report 03 section 1).`,
      }),
    );
  }
  return out;
}
