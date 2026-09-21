// The light half of the catalog for the browser (gslides-parity SPEC-5-amendments A5 items 3 and
// 4; B7): the family name of every id, the generic family per category, the catalog's version
// and the paths the studio serves the faces under. The toolbar's Font control, the picker rows
// and the sheet's stylesheet link read this module; the file table with its digests
// (catalog-files.ts, about 20 KB) stays out of the client graph, because the editor's main chunk
// runs within 20 KB of its ceiling (BUILD-STATUS-5.md merge 1). catalog.test.ts pins every name
// here to the generated facts and the version to GOOGLE_FONTS_COMMIT, so the two halves agree.
import type { FontCategory, FontId } from '@turboslide/schema/fonts';

/** The family name PowerPoint and Google Slides use, per id (the generated facts' `name`). */
export const FONT_NAMES: Readonly<Record<FontId, string>> = {
  inter: 'Inter',
  roboto: 'Roboto',
  'open-sans': 'Open Sans',
  lato: 'Lato',
  montserrat: 'Montserrat',
  poppins: 'Poppins',
  'source-sans-3': 'Source Sans 3',
  'source-serif-4': 'Source Serif 4',
  merriweather: 'Merriweather',
  'playfair-display': 'Playfair Display',
  lora: 'Lora',
  'pt-serif': 'PT Serif',
  'libre-baskerville': 'Libre Baskerville',
  'eb-garamond': 'EB Garamond',
  nunito: 'Nunito',
  raleway: 'Raleway',
  'work-sans': 'Work Sans',
  'dm-sans': 'DM Sans',
  'space-grotesk': 'Space Grotesk',
  oswald: 'Oswald',
  'bebas-neue': 'Bebas Neue',
  'roboto-mono': 'Roboto Mono',
  'jetbrains-mono': 'JetBrains Mono',
  'ibm-plex-sans': 'IBM Plex Sans',
  'ibm-plex-mono': 'IBM Plex Mono',
  'fira-code': 'Fira Code',
};

/** The generic family a category falls back to before a face has loaded. */
export const CATEGORY_GENERIC: Readonly<Record<FontCategory, string>> = {
  sans: 'sans-serif',
  serif: 'serif',
  display: 'sans-serif',
  mono: 'monospace',
};

/** Google's words for the four categories, the picker's section titles and the More fonts filter. */
export const FONT_CATEGORY_LABELS: Readonly<Record<FontCategory, string>> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  mono: 'Monospace',
};

/** The family name of a face (B6's R4: the theme mode's Fonts control names its two roles with it). */
export function fontFamilyName(id: FontId): string {
  return FONT_NAMES[id];
}

/**
 * The catalog's version, the google/fonts commit the assets were fetched at (catalog.ts
 * GOOGLE_FONTS_COMMIT, pinned equal by the test). Every served path carries its first twelve
 * characters, so a refetch at another commit is another URL and the faces cache as immutable.
 */
export const FONT_CATALOG_VERSION = '1ac2012c34919f5fa2675aacf723fa98edb30b5f';
export const FONT_PATH_VERSION = FONT_CATALOG_VERSION.slice(0, 12);

/** Where the studio serves the faces (apps/studio/src/routes/fonts.$.ts). */
export const FONTS_ROUTE = '/fonts';

/**
 * The version alias a page that does not carry the catalog may name (`packages/chrome` reads no
 * fonts module): the route answers it with the current catalog's stylesheet, cached for a short
 * while, whose file URLs carry the real version and cache as immutable.
 */
export const CURRENT_VERSION_ALIAS = 'current';

/** The stylesheet with one @font-face group per id and the `--ts-font-<id>` rule: `/fonts/faces/<version>/<a+b>.css`. */
export function fontsStylesheetPath(
  ids: readonly FontId[],
  version: string = FONT_PATH_VERSION,
): string {
  return `${FONTS_ROUTE}/faces/${version}/${[...ids].join('+')}.css`;
}

/** One woff2 file: `/fonts/<version>/<id>/<file>`. */
export function fontFilePath(id: FontId, file: string): string {
  return `${FONTS_ROUTE}/${FONT_PATH_VERSION}/${id}/${file}`;
}

/** The ids a served stylesheet path names, in the order given; null for a path outside the form. */
export function parseStylesheetPath(splat: string): { version: string; ids: string[] } | null {
  const match = /^faces\/([0-9a-f]{12}|current)\/([a-z0-9+-]+)\.css$/.exec(splat);
  if (match === null) return null;
  return { version: match[1] as string, ids: (match[2] as string).split('+') };
}

/** The (version, id, file) a served file path names; null for a path outside the form. */
export function parseFilePath(splat: string): { version: string; id: string; file: string } | null {
  const match = /^([0-9a-f]{12})\/([a-z0-9-]+)\/([A-Za-z0-9._-]+\.woff2)$/.exec(splat);
  if (match === null) return null;
  return { version: match[1] as string, id: match[2] as string, file: match[3] as string };
}
