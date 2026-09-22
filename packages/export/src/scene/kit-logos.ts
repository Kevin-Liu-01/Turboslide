// The logos an export shoots at 3x (docs/FEATURES.md 4.8; audit-logos 18), read from the document
// and not from the sheet: the brand kit's picture logos, which the sheet draws outside any block,
// and the picture and shot blocks whose asset carries `role: 'logo'`. Schema imports alone, so the
// PowerPoint builder and the report read these names without the extractor's browser graph.
import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';

/**
 * The block ids the extractor gives the brand kit's picture logos (docs/PRODUCT.md 4.1, 4.4): the
 * footer's `.wordmark.is-picture img` and the title slide's `img.mark-picture[data-slot="mark"]`.
 * `tagRasterElements` tags `svg.mark` and `.wordmark svg` (the GT mark) and nothing of a picture
 * logo, so a deck whose kit carried a company's mark exported an Editable text file without it;
 * `tagKitLogoElements` (extract.ts) tags both as `mark` rasters, the 3x kind, and the PowerPoint
 * builder places them per slide, in the Perfect mode over the sheet raster as the wordmark sits on
 * the master (row logos.export.pdf-pptx-crisp).
 */
export const KIT_LOGO_BLOCK_IDS: ReadonlySet<string> = new Set(['footer-logo', 'title-logo']);

/** True when the deck's brand kit draws a picture in the title slot or the footer (PRODUCT.md 4.1). */
export function kitHasPictureLogo(deck: Pick<Deck, 'brand'>): boolean {
  const kit = deck.brand;
  if (kit === undefined) return false;
  const mark = kit.mark?.kind === 'picture' && kit.mark.assetId !== undefined;
  const footer = kit.footer?.logo === 'picture' && kit.footer.assetId !== undefined;
  return mark || footer;
}

/**
 * The ids of a slide's picture and shot blocks whose asset carries `role: 'logo'`, composites'
 * cells included: the blocks `auto` shoots at 3x as the `logo` kind (4.8). A block naming an
 * asset the deck lacks is not a logo.
 */
export function logoBlockIds(slide: Slide, deck: Pick<Deck, 'assets'>): Set<string> {
  const out = new Set<string>();
  const visit = (blocks: ReadonlyArray<Block>): void => {
    for (const block of blocks) {
      if (block.type === 'composite') {
        for (const cell of block.cells) visit(cell.blocks);
        continue;
      }
      if (block.type !== 'picture' && block.type !== 'shot') continue;
      if (deck.assets[block.asset]?.role === 'logo') out.add(block.id);
    }
  };
  for (const { block } of slideBlocks(slide)) visit([block]);
  return out;
}
