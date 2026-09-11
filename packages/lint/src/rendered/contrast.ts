// contrast/both-themes (SPEC 7.7; DECK-GRAMMAR.md:61): the text color a record measured for a
// block against the ground it sits on, per theme. The ground is the dominant color inside the
// block's box with its rasters left out (paper, a plate, the code panel), read from the
// screenshot; without a screenshot the theme's paper stands in. The floor is WCAG 4.5:1, or 3:1
// from 26 px up. Blocks with fixed plates of their own (swatches, logo plates), escapes and
// pictures are left out.
import { RENDERED_LIMITS } from '@turboslide/schema/rules';

import type { Box, Finding, RenderRecord, Slide } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import type { Bitmap } from './bitmap.ts';
import { dominantColor } from './bitmap.ts';
import { PAPER, composite, contrastRatio, formatRgb, parseCssColor } from './palette.ts';
import type { Rgb } from './palette.ts';
import type { BlockIndex } from './shared.ts';
import { round2 } from './shared.ts';

const SKIP_TYPES = new Set([
  'swatches',
  'logoPlates',
  'html',
  'dither',
  'shot',
  'pair',
  'tiles',
  'details',
]);

export function checkContrast(
  ctx: LintContext,
  record: RenderRecord,
  slide: Slide | undefined,
  refs: BlockIndex,
  bitmap: Bitmap | null,
): Finding[] {
  const out: Finding[] = [];
  if (!slide) return out;
  const paper = PAPER[record.theme];
  /** The code panel's fixed ground in both themes (sheet.css .panel, tokens.ts PANEL). */
  const panel: Rgb = [16, 16, 16];
  const rasterBoxes: Box[] = record.rasters.map((r) => r.box);
  for (const [id, block] of Object.entries(record.blocks)) {
    if (block.type === 'row' || SKIP_TYPES.has(block.type)) continue;
    if (block.color === undefined || block.fontSize === undefined) continue;
    const text = parseCssColor(block.color);
    if (!text) continue;
    const ground =
      (bitmap && dominantColor(bitmap, block.box, rasterBoxes)) ??
      (block.type === 'panel' ? panel : paper);
    const ink = text.alpha < 1 ? composite(text, ground) : text.rgb;
    const ratio = contrastRatio(ink, ground);
    const floor =
      block.fontSize >= RENDERED_LIMITS.contrastLargePx
        ? RENDERED_LIMITS.contrastLargeMin
        : RENDERED_LIMITS.contrastMin;
    if (ratio >= floor) continue;
    const ref = refs.get(id);
    out.push(
      ctx.finding('contrast/both-themes', slide.id, {
        blockId: id,
        path: ref?.path,
        theme: record.theme,
        box: block.box,
        text: `${formatRgb(ink)} on ${formatRgb(ground)}`,
        measured: { ratio: round2(ratio), floor, fontSize: block.fontSize },
        proposal: `Text at ${block.fontSize} px in ${formatRgb(ink)} on ${formatRgb(ground)} measures ${round2(ratio)}:1 in the ${record.theme} theme; the floor is ${floor}:1 (${RENDERED_LIMITS.contrastMin}:1 under ${RENDERED_LIMITS.contrastLargePx} px). Use a darker token or a larger size, and check the other theme (DECK-GRAMMAR.md:61).`,
      }),
    );
  }
  return out;
}
