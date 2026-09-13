// chart/size (gslides-parity SPEC-2 2.8.1, 0.60): a legibility rule at severity 2. More than
// 8 categories in a chart narrower than 960 px, or a pie with more than 8 slices, gives labels
// no room at the 18 px the diagram grammar sets. The validator's caps (12 categories, 6 series)
// stand alone in validate.ts as `chart_size`; this rule never repeats them.
import { CHART_LEGIBLE_CATEGORIES, CHART_LEGIBLE_WIDTH_PX } from '@turboslide/schema/blocks/chart';
import type { Finding } from '../contracts.ts';
import type { LintContext } from '../context.ts';

export function checkCharts(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      if (block.type !== 'chart') continue;
      const categories = block.categories.length;
      const width = ref.width ?? 1326;
      if (block.kind === 'pie' && categories > CHART_LEGIBLE_CATEGORIES) {
        out.push(
          ctx.finding('chart/size', slide.id, {
            blockId: block.id,
            path: `${ref.path}/categories`,
            measured: { categories },
            proposal: `The pie chart has ${categories} slices, more than ${CHART_LEGIBLE_CATEGORIES} read at a glance. Group the small ones or use a bar chart`,
          }),
        );
        continue;
      }
      if (
        block.kind !== 'pie' &&
        categories > CHART_LEGIBLE_CATEGORIES &&
        width < CHART_LEGIBLE_WIDTH_PX
      ) {
        out.push(
          ctx.finding('chart/size', slide.id, {
            blockId: block.id,
            path: `${ref.path}/categories`,
            measured: { categories, width: Math.round(width) },
            proposal: `The chart has ${categories} categories in a box ${Math.round(width)} px wide; ${CHART_LEGIBLE_CATEGORIES} or fewer read at that width. Widen the chart to ${CHART_LEGIBLE_WIDTH_PX} px or split the categories`,
          }),
        );
      }
    }
  }
  return out;
}
