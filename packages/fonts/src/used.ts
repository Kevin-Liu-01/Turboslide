// The catalog families a deck uses (gslides-parity SPEC-5-amendments A5 item 3; B7), from the
// schema alone: every `typography.family` of every block of the given slides (the blocks a
// composite's cells hold included) and every role of the theme record's fonts, in FONT_IDS order,
// never the theme's default face (Inter is the base stylesheet's). The editor page runs this on
// every document change to decide whether the sheet needs a stylesheet link at all, so the module
// reads nothing but the schema and weighs nothing; the renderer re-exports it beside the
// @font-face emission (@turboslide/render/fonts).
import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, FONT_IDS, isFontId } from '@turboslide/schema/fonts';

/** The family ids a block names, on itself and on the blocks a composite's cells hold. */
export function blockFamilies(block: Block, out: Set<FontId>): void {
  const typography = (block as { typography?: { family?: unknown } }).typography;
  const family = typography?.family;
  if (typeof family === 'string' && isFontId(family)) out.add(family);
  if (block.type === 'composite')
    for (const cell of block.cells) for (const child of cell.blocks) blockFamilies(child, out);
}

/**
 * The catalog faces a deck uses, in FONT_IDS order: every `typography.family` of every block of
 * the given slides and every role of `themeEdits.fonts`. The theme's default face (Inter) is
 * never in the answer because the base stylesheet always carries it.
 */
export function usedFontIds(deck: Pick<Deck, 'themeEdits'>, slides: Iterable<Slide>): FontId[] {
  const used = new Set<FontId>();
  for (const slide of slides)
    for (const { block } of slideBlocks(slide)) blockFamilies(block, used);
  const roles = deck.themeEdits?.fonts;
  if (roles !== undefined)
    for (const family of Object.values(roles))
      if (typeof family === 'string' && isFontId(family)) used.add(family);
  used.delete(DEFAULT_FONT_ID);
  return FONT_IDS.filter((id) => used.has(id));
}
