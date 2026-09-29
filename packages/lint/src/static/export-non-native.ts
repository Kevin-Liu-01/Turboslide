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

/**
 * The plain name of a block type in the listing's sentence, with its plural (docs/POLISH.md 2.6
 * item 55: Check slides names the object in plain words, never by its id and never in a
 * parenthesis; the words are the chip's, viewer Selection.tsx DISPLAY_NAMES). A type outside the
 * table reads as its own name.
 */
const BLOCK_WORDS: Readonly<Partial<Record<Block['type'], readonly [string, string]>>> = {
  shot: ['image', 'images'],
  picture: ['image', 'images'],
  pair: ['image pair', 'image pairs'],
  tiles: ['image grid', 'image grids'],
  details: ['detail grid', 'detail grids'],
  material: ['shader', 'shaders'],
  chart: ['chart', 'charts'],
  dia: ['diagram', 'diagrams'],
  mark: ['mark', 'marks'],
  icon: ['icon', 'icons'],
  say: ['quote block', 'quote blocks'],
  scales: ['scale', 'scales'],
  board: ['board', 'boards'],
  matrix: ['matrix', 'matrices'],
  html: ['embedded block', 'embedded blocks'],
  spec: ['type specimen', 'type specimens'],
  lang: ['script sample', 'script samples'],
  swatches: ['swatch row', 'swatch rows'],
  rows: ['list', 'lists'],
  plain: ['list', 'lists'],
  refs: ['list', 'lists'],
  ladder: ['type ladder', 'type ladders'],
  panel: ['code block', 'code blocks'],
};

function wordsOf(type: Block['type'], count: number): string {
  const [one, many] = BLOCK_WORDS[type] ?? [type, `${type}s`];
  if (count === 1) return /^[aeiou]/.test(one) ? `an ${one}` : `a ${one}`;
  return `${count} ${many}`;
}

/** "an image", "2 images and a chart", "an image, a chart and a diagram": the types counted, in first appearance order. */
export function describeBlocks(types: ReadonlyArray<Block['type']>): string {
  const counts = new Map<Block['type'], number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
  const words = [...counts].map(([type, count]) => wordsOf(type, count));
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The raster parts of one native block as words: "the list's icons and mark". */
function partsOf(entry: BlockExportClass): string {
  const [one] = BLOCK_WORDS[entry.type] ?? [entry.type, `${entry.type}s`];
  const parts = entry.parts.map((part) => (part === 'mark' ? 'GT mark' : part));
  return `the ${one}'s ${parts.join(' and ')}`;
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
    /* the sentences name the blocks in plain words with no id and no parenthesis (item 55;
       VERIFICATION.md "Polish round, pass 1" finding 20: "audit-pic-mumqjwt5 (shot)" beside the
       table's sentence); the ids stay in the finding's evidence for the tools */
    const wholeText = describeBlocks(whole.map((c) => c.type));
    const partialText = partial.map(partsOf).join(', ');
    const sentences: string[] = [];
    if (whole.length > 0)
      sentences.push(
        mode === 'flatten'
          ? `In flatten mode the slide is one 2x raster; ${wholeText} ${whole.length === 1 ? 'carries' : 'carry'} no native text beyond the invisible layer.`
          : whole.length === 1
            ? `In native mode ${wholeText} exports as a 2x raster.`
            : `In native mode ${wholeText} export as 2x rasters.`,
      );
    if (partial.length > 0)
      sentences.push(
        `Native text with raster parts: ${partialText}. Icons and the GT mark are PNGs in every office format.`,
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
