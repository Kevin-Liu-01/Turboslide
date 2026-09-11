// export/non-native (SPEC 7.7; design C section 6.7; MILESTONES M2 item 7): the blocks of a slide
// that reach a PPTX or Slides file as rasters in the requested export mode, listed once per slide
// so the export report and the lint agree on what "native" means at this revision. Two kinds of
// entry: a block whose type is outside the native set (SPEC 4.2 export, NATIVE_BLOCK_TYPES) is a
// raster as a whole; a native block whose items carry semantic icons or whose text holds a
// standalone GT word keeps its text native and ships the icon or the mark as a PNG (SPEC 8.6).
// Severity 1: the listing is information for the export dialog and the judge, not a defect.
import type { Block, Finding } from '../contracts.ts';
import { isNativeBlockType, parseText } from '../contracts.ts';
import type { LintContext } from '../context.ts';
import { blockTexts } from '../context.ts';

export type RasterPart = 'icons' | 'mark' | 'image' | 'picture';

export type BlockExportClass = {
  blockId: string;
  type: Block['type'];
  /** true when the block's text is written as native text in the requested mode. */
  native: boolean;
  /** The raster parts inside a native block (icons, the GT mark), or ['block'] for a raster block. */
  parts: (RasterPart | 'block')[];
};

/** True when any Text of the block holds a standalone GT word (the mark at render, SPEC 5.2). */
export function hasGtWord(block: Block): boolean {
  if (block.type === 'panel') return false;
  return blockTexts(block).some((ref) => parseText(ref.text).some((run) => run.gt === true));
}

/** True when the block carries semantic icons in its items (rows keys, plain row starts). */
export function hasIcons(block: Block): boolean {
  if (block.type === 'rows' || block.type === 'plain')
    return block.items.some((item) => item.icon !== undefined);
  return false;
}

/** The export class of one block: native text with optional raster parts, or a raster as a whole. */
export function classifyBlock(block: Block): BlockExportClass {
  // A composite is a grid; its cells' blocks are listed as themselves (M5 native export).
  if (block.type === 'composite')
    return { blockId: block.id, type: block.type, native: true, parts: [] };
  if (!isNativeBlockType(block.type))
    return { blockId: block.id, type: block.type, native: false, parts: ['block'] };
  const parts: RasterPart[] = [];
  if (hasIcons(block)) parts.push('icons');
  if (hasGtWord(block)) parts.push('mark');
  return { blockId: block.id, type: block.type, native: true, parts };
}

export function checkExportNonNative(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const mode = ctx.options.exportMode;
  if (mode === false) return out;
  for (const slide of ctx.slideList()) {
    const classes = ctx.blocksOf(slide).map((ref) => classifyBlock(ref.block));
    const whole = classes.filter((c) => !c.native);
    const partial = classes.filter((c) => c.native && c.parts.length > 0);
    if (whole.length === 0 && partial.length === 0) continue;
    const wholeText = whole.map((c) => `${c.blockId} (${c.type})`).join(', ');
    const partialText = partial.map((c) => `${c.blockId} (${c.parts.join(' and ')})`).join(', ');
    const sentences: string[] = [];
    if (whole.length > 0)
      sentences.push(
        mode === 'flatten'
          ? `In flatten mode the slide is one 2x raster; ${wholeText} carry no native text beyond the invisible layer.`
          : `In native mode these blocks export as 2x rasters: ${wholeText}.`,
      );
    if (partial.length > 0)
      sentences.push(
        `Native text with raster parts: ${partialText}; icons and the GT mark are PNGs in every office format (SPEC 8.6).`,
      );
    out.push(
      ctx.finding('export/non-native', slide.id, {
        text: [...whole, ...partial].map((c) => c.blockId).join(', '),
        measured: { rasterBlocks: whole.length, partialBlocks: partial.length },
        proposal: sentences.join(' '),
      }),
    );
  }
  return out;
}
