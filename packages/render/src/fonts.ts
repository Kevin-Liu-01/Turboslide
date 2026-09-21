// The @font-face emission for the catalog faces a deck uses (gslides-parity SPEC-5-amendments
// A5 item 3; docs/PRODUCT.md 4.2; ported from round five's fonts.ts). A deck names a face by id
// on a block's `typography.family` or on the brand kit's font roles (`brand.fonts`); the renderer
// emits one @font-face group per used family (one rule per file: the upright and, where the
// family ships one, the italic) and nothing for a family nobody uses, so a deck set in Inter alone
// loads no font file before the ready mark (SPEC-4 4; the row fonts.budget.no-load-before-ready).
// The rules' `src` is the caller's: the studio and a served document resolve over the fonts route
// (`/fonts/<version>/<id>/<file>`, the default), a self contained document (the standalone build,
// the headless capture of the export) passes @turboslide/fonts/catalog-node's data URIs. Beside
// the faces, one rule on the sheet root defines `--ts-font-<id>` per used family
// (@turboslide/fonts/catalog fontFamilyVariable), the custom property the schema's
// typographyDeclarations reads for `font-family`; a family the document never loaded inherits
// the theme's face. Inter is never emitted here: the base stylesheet (inter.css) carries it.
// Browser safe: no `node:` import.
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, FONT_IDS } from '@turboslide/schema/fonts';
import type { LightFile } from '@turboslide/fonts/catalog-light';
import { fontFilePath } from '@turboslide/fonts/names';
import type { FontListRow } from '@turboslide/fonts/summary';
import {
  catalogSummary,
  fontAssetPath,
  fontFamilyStack,
  fontFamilyVariable,
  lightFamily,
} from '@turboslide/fonts/summary';
import { usedFontIds } from '@turboslide/fonts/used';

// the schema only half lives in @turboslide/fonts/used so the editor page decides whether the
// sheet needs the faces without loading the catalog's file table
export { blockFamilies, usedFontIds } from '@turboslide/fonts/used';

/** Where a file's bytes come from: a URL the document can fetch, or a data URI. */
export type FontSrc = (id: FontId, file: LightFile) => string;

/** The default resolver: the studio's fonts route, `/fonts/<version>/<id>/<file>` (apps/studio/src/routes/fonts.$.ts). */
export const routeFontSrc: FontSrc = (id, file) => fontFilePath(id, file.file);

/** The `src` resolver of a document served from a base URL: `<base>/assets/<id>/<file>`. */
export function fontSrcUnder(base: string): FontSrc {
  const trimmed = base.replace(/\/$/, '');
  return (id, file) => `${trimmed}/${fontAssetPath(id, file.file)}`;
}

/** A weight descriptor: one weight for a static cut, the axis range for a variable file. */
function weightDescriptor(weight: LightFile['weight']): string {
  return typeof weight === 'number' ? String(weight) : `${weight[0]} ${weight[1]}`;
}

/** The @font-face rules of one family: one per file, `font-display: swap`, woff2 alone. */
export function fontFaceRules(id: FontId, src: FontSrc = routeFontSrc): string {
  const row = lightFamily(id);
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
export function fontsCss(ids: readonly FontId[], src: FontSrc = routeFontSrc): string {
  const ordered = FONT_IDS.filter((id) => ids.includes(id) && id !== DEFAULT_FONT_ID);
  if (ordered.length === 0) return '';
  return [...ordered.map((id) => fontFaceRules(id, src)), fontVariablesRule(ordered)].join('\n');
}

/** `fontsCss` over the families a deck uses (usedFontIds). */
export function deckFontsCss(
  deck: Deck,
  slides: Iterable<Slide>,
  src: FontSrc = routeFontSrc,
): string {
  return fontsCss(usedFontIds(deck, slides), src);
}

/**
 * The catalog's rows as `font.list` answers them (docs/PRODUCT.md 4.2), for the chrome's Font
 * dropdown: the chrome depends on this package and not on the fonts package, and the light table
 * behind the rows weighs a few kilobytes, so the dropdown lists the faces without a fetch.
 */
export function fontRows(): FontListRow[] {
  return catalogSummary().fonts;
}
export type { FontListRow };

/** How many @font-face rules a stylesheet holds, for the tests and the export report. */
export function fontFaceCount(css: string): number {
  return (css.match(/@font-face\s*\{/g) ?? []).length;
}
