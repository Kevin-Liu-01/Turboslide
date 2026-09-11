// The rendered half of dia/label-clearance (SPEC 7.7; DECK-GRAMMAR.md:45): a label box within 12
// px of a stroke inside a raw svg diagram. Declared diagrams are checked as data by the static
// rule (static/dia.ts); a raw svg string is read by svg.ts for its segments and labels in viewBox
// units, and the record's measured box for the block gives the scale from those units to sheet
// pixels, so the 12 px are real pixels and the finding's box lands on the sheet.
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Box, Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { BlockIndex } from './shared.ts';
import { round1, round2 } from './shared.ts';
import { boxToSegment, parseSvgGeometry } from './svg.ts';

export function checkLabelClearance(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
): Finding[] {
  const out: Finding[] = [];
  if (!slide) return out;
  for (const ref of refs.values()) {
    const { block } = ref;
    if (block.type !== 'dia' || !block.svg || block.data) continue;
    const measured = record.blocks[block.id];
    if (!measured || measured.box[2] <= 0) continue;
    const geometry = parseSvgGeometry(block.svg);
    if (geometry.segments.length === 0 || geometry.labels.length === 0) continue;
    const viewBox = typeof block.fit === 'object' ? block.fit.viewBox : geometry.viewBox;
    // fit slot: the renderer widens the viewBox to the slot, one unit stays one sheet pixel (render/blocks/dia.ts)
    const unitsWide = block.fit === 'slot' ? measured.box[2] : viewBox?.[2];
    if (!unitsWide || unitsWide <= 0) continue;
    const k = measured.box[2] / unitsWide;
    const ox = measured.box[0] - (block.fit === 'slot' ? 0 : (viewBox?.[0] ?? 0) * k);
    const oy = measured.box[1] - (block.fit === 'slot' ? 0 : (viewBox?.[1] ?? 0) * k);
    geometry.labels.forEach((label, i) => {
      let nearest = Number.POSITIVE_INFINITY;
      for (const seg of geometry.segments)
        nearest = Math.min(nearest, boxToSegment(label.box, seg));
      const clearance = nearest * k;
      // compared in whole pixels: a 12 px padding against a stroke snapped to the half pixel
      // measures 11.5 to its center and is the grammar's own spacing, not a defect
      if (Math.round(clearance) >= RENDERED_LIMITS.labelClearancePx) return;
      const box: Box = [
        Math.round(ox + label.box[0] * k),
        Math.round(oy + label.box[1] * k),
        Math.round(label.box[2] * k),
        Math.round(label.box[3] * k),
      ];
      out.push(
        ctx.finding('dia/label-clearance', slide.id, {
          blockId: block.id,
          path: `${ref.path}/svg#text-${i}`,
          theme: record.theme,
          text: label.text,
          box,
          measured: { clearance: round1(clearance), scale: round2(k), skipped: geometry.skipped },
          proposal: `The label "${label.text}" sits ${round1(clearance)} px from the nearest stroke; keep labels at least ${RENDERED_LIMITS.labelClearancePx} px clear of lines (DECK-GRAMMAR.md:45).`,
        }),
      );
    });
  }
  return out;
}
