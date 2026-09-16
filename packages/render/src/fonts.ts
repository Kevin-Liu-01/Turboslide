// The @font-face emission for the catalog faces a deck uses (gslides-parity SPEC-5-amendments
// A5 item 3; B7). A deck names a face by id on a block's `typography.family` or on the theme
// record's font roles (`themeEdits.fonts`); the renderer emits one @font-face group per used
// family (one rule per file: the upright and, where the family ships one, the italic) into the
// sheet stylesheet and nothing for a family nobody uses, so a deck set in Inter alone loads no
// font file before the ready mark (SPEC-4 4). The rules' `src` is the caller's: the studio and a
// served document pass a URL resolver over the asset route, a self contained document (the
// standalone build, the headless capture) passes @turboslide/fonts/catalog-node's data URIs.
// Beside the faces, one rule on the sheet root defines `--ts-font-<id>` per used family
// (@turboslide/fonts/catalog fontFamilyVariable), the custom property the schema's
// typographyDeclarations reads for `font-family`; a family the document never loaded inherits
// the theme's face. Inter is never emitted here: the base stylesheet (inter.css) carries it.
// Browser safe: no `node:` import.
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, FONT_IDS } from '@turboslide/schema/fonts';
import type { CatalogFile } from '@turboslide/fonts/catalog-files';
import {
  catalogFont,
  fontAssetPath,
  fontFamilyStack,
  fontFamilyVariable,
} from '@turboslide/fonts/catalog';
import { usedFontIds } from '@turboslide/fonts/used';

// the schema only half lives in @turboslide/fonts/used so the editor page decides whether the
// sheet needs a stylesheet link without loading the catalog's file table
export { blockFamilies, usedFontIds } from '@turboslide/fonts/used';

/** Where a file's bytes come from: a URL the document can fetch, or a data URI. */
export type FontSrc = (id: FontId, file: CatalogFile) => string;

/** The `src` resolver of a document served from a base URL: `<base>/assets/<id>/<file>`. */
export function fontSrcUnder(base: string): FontSrc {
  const trimmed = base.replace(/\/$/, '');
  return (id, file) => `${trimmed}/${fontAssetPath(id, file.file)}`;
}

/** A weight descriptor: one weight for a static cut, the axis range for a variable file. */
function weightDescriptor(weight: CatalogFile['weight']): string {
  return typeof weight === 'number' ? String(weight) : `${weight[0]} ${weight[1]}`;
}

/** The @font-face rules of one family: one per file, `font-display: swap`, woff2 alone. */
export function fontFaceRules(id: FontId, src: FontSrc): string {
  const row = catalogFont(id);
  const name = row.name.replace(/'/g, "\\'");
  return row.files
    .map((file) =>
      [
        '@font-face {',
        `  font-family: '${name}';`,
        `  font-style: ${file.style};`,
        `  font-weight: ${weightDescriptor(file.weight)};`,
        '  font-display: swap;',
        `  src: url('${src(id, file)}') format('woff2');`,
        '}',
      ].join('\n'),
    )
    .join('\n');
}

/** The sheet root rule defining `--ts-font-<id>` for the used families; empty for none. */
export function fontVariablesRule(ids: readonly FontId[]): string {
  if (ids.length === 0) return '';
  const declarations = ids.map((id) => `  ${fontFamilyVariable(id)}: ${fontFamilyStack(id)};`);
  return ['.ts-sheet {', ...declarations, '}'].join('\n');
}

/**
 * The stylesheet for a list of used families: the @font-face groups in FONT_IDS order, then the
 * custom property rule. An empty list answers an empty string, so a document that uses no
 * catalog face gains no bytes and no request.
 */
export function fontsCss(ids: readonly FontId[], src: FontSrc): string {
  const ordered = FONT_IDS.filter((id) => ids.includes(id) && id !== DEFAULT_FONT_ID);
  if (ordered.length === 0) return '';
  return [...ordered.map((id) => fontFaceRules(id, src)), fontVariablesRule(ordered)].join('\n');
}

/** `fontsCss` over the families a deck uses (usedFontIds). */
export function deckFontsCss(deck: Deck, slides: Iterable<Slide>, src: FontSrc): string {
  return fontsCss(usedFontIds(deck, slides), src);
}

/** How many @font-face rules a stylesheet holds, for the tests and the export report. */
export function fontFaceCount(css: string): number {
  return (css.match(/@font-face\s*\{/g) ?? []).length;
}
