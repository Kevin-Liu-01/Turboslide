// The Font picker's pure rules (gslides-parity SPEC-5-amendments A5 item 4; B7): the rows the
// dropdown lists (the families this presentation uses first, then the catalog by Google's four
// categories), the search over names, the family a selected block carries, the families a
// document uses, the words, the paths the studio serves the faces under, and the `font.list`
// answer's shape the plate reads. The chrome depends on the schema and never on the fonts
// package (packages/chrome/package.json), so the rows come from the `font.list` action and the
// few facts the toolbar needs before the answer (the family names, the generic families, the
// route) are spelled here; apps/studio/src/editor/font-picker-facts.test.ts pins them to
// @turboslide/fonts/names, which the studio can import. No React, no DOM:
// font-picker-model.test.ts runs in Node.
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, FONT_CATEGORIES, FONT_IDS, isFontId } from '@turboslide/schema/fonts';

/** One row of `font.list` (the action's output; @turboslide/fonts/catalog catalogSummary). */
export type FontRow = {
  id: FontId;
  name: string;
  category: FontCategory;
  weights: number[];
  italic: boolean;
  licence: FontLicence;
};

/** The picker's words. Google's labels where Google has the row; the rest is Turboslide's. */
export const FONT_PICKER = {
  control: 'Font',
  doc: 'The face of the selected text; every face is an open licence face Google Slides also offers',
  tableDoc: 'A table takes one size; its face is the theme’s',
  search: 'Search fonts',
  searchDoc: 'Type part of a family name',
  inThisPresentation: 'In this presentation',
  themeFace: 'Theme font',
  moreFonts: 'More fonts',
  moreFontsDoc: 'Every face of the catalog with its category and licence',
  noMatch: 'No font matches',
  /** the More fonts dialog (Google's form: the search, the category filter, the list, the chosen) */
  dialog: {
    title: 'More fonts',
    categories: 'Categories',
    allCategories: 'All categories',
    chosen: 'In this presentation',
    ok: 'OK',
    okDoc: 'Gives the selected text the chosen face',
    categoryDoc: 'Show one category of the catalog',
    licenceLine: (licence: FontLicence) =>
      licence === 'OFL 1.1' ? 'SIL Open Font License 1.1' : 'Apache License 2.0',
  },
} as const;

/** Google's words for the four categories, the picker's section titles and the More fonts filter. */
export const FONT_CATEGORY_LABELS: Readonly<Record<FontCategory, string>> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  mono: 'Monospace',
};

/** The generic family a category falls back to before a face has loaded. */
export const CATEGORY_GENERIC: Readonly<Record<FontCategory, string>> = {
  sans: 'sans-serif',
  serif: 'serif',
  display: 'sans-serif',
  mono: 'monospace',
};

/**
 * The family name of an id before `font.list` has answered: the id in title case, with the
 * families whose names are not title case spelled out (pinned to the catalog's names by
 * apps/studio/src/editor/font-picker-facts.test.ts).
 */
const NAME_EXCEPTIONS: Readonly<Partial<Record<FontId, string>>> = {
  'pt-serif': 'PT Serif',
  'eb-garamond': 'EB Garamond',
  'dm-sans': 'DM Sans',
  'ibm-plex-sans': 'IBM Plex Sans',
  'ibm-plex-mono': 'IBM Plex Mono',
  'jetbrains-mono': 'JetBrains Mono',
};

export function familyLabel(id: FontId, rows?: readonly FontRow[] | null): string {
  const row = rows?.find((each) => each.id === id);
  if (row !== undefined) return row.name;
  const exception = NAME_EXCEPTIONS[id];
  if (exception !== undefined) return exception;
  return id
    .split('-')
    .map((part) => (part === '' ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join(' ');
}

/** Where the studio serves the faces (apps/studio/src/routes/fonts.$.ts). */
export const FONTS_ROUTE = '/fonts';

/**
 * The stylesheet link of a set of families under the `current` version alias: the route answers
 * the current catalog's `@font-face` groups and the `--ts-font-<id>` rule, cached for a short
 * while, with the versioned and immutable file URLs inside it.
 */
export function fontsStylesheetHref(ids: readonly FontId[]): string {
  return `${FONTS_ROUTE}/faces/current/${[...ids].join('+')}.css`;
}

/** The `font-family` value of a row: its name quoted, then the category's generic family. */
export function rowFamilyStack(row: Pick<FontRow, 'name' | 'category'>): string {
  return `'${row.name.replace(/'/g, "\\'")}', ${CATEGORY_GENERIC[row.category]}`;
}

/** The family a block carries, or null for the theme's face. */
export function familyOf(block: Block | undefined): FontId | null {
  if (block === undefined) return null;
  const typography = (block as { typography?: { family?: unknown } }).typography;
  const family = typography?.family;
  return typeof family === 'string' && isFontId(family) && family !== DEFAULT_FONT_ID
    ? family
    : null;
}

/** True for a block whose typography takes a family (a table's face is the theme's). */
export function takesFamily(block: Block | undefined): boolean {
  if (block === undefined) return false;
  return block.type !== 'table';
}

/** The label the toolbar control shows for a block: the family name, else the theme's face. */
export function controlLabel(block: Block | undefined, rows?: readonly FontRow[] | null): string {
  const family = familyOf(block);
  return familyLabel(family ?? DEFAULT_FONT_ID, rows);
}

/** The family ids a block names, on itself and on the blocks a composite's cells hold. */
function blockFamilies(block: Block, out: Set<FontId>): void {
  const typography = (block as { typography?: { family?: unknown } }).typography;
  const family = typography?.family;
  if (typeof family === 'string' && isFontId(family)) out.add(family);
  if (block.type === 'composite')
    for (const cell of block.cells) for (const child of cell.blocks) blockFamilies(child, out);
}

/**
 * The catalog faces a document uses, in FONT_IDS order (the same walk as
 * @turboslide/fonts/used, which the chrome cannot import): every `typography.family` of every
 * block of every slide and every role of the theme record's fonts, never the theme's default face.
 */
export function usedFamilies(document: DeckDocument): FontId[] {
  const used = new Set<FontId>();
  for (const slide of Object.values(document.slides))
    for (const { block } of slideBlocks(slide)) blockFamilies(block, used);
  const roles = document.deck.themeEdits?.fonts;
  if (roles !== undefined)
    for (const family of Object.values(roles))
      if (typeof family === 'string' && isFontId(family)) used.add(family);
  used.delete(DEFAULT_FONT_ID);
  return FONT_IDS.filter((id) => used.has(id));
}

/** The rows whose name contains the query, case folded; every row for an empty query. */
export function filterRows(rows: readonly FontRow[], query: string): FontRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return [...rows];
  return rows.filter((row) => row.name.toLocaleLowerCase().includes(needle));
}

export type FontGroup = { id: 'used' | FontCategory; title: string; rows: FontRow[] };

/**
 * The picker's groups (A5 item 4): the families this presentation uses first, then the catalog
 * by category in Google's order (Sans serif, Serif, Display, Monospace). A used family stays in
 * its category too, so the catalog reads whole. Empty groups are dropped.
 */
export function groupRows(
  rows: readonly FontRow[],
  used: readonly FontId[],
  query = '',
): FontGroup[] {
  const shown = filterRows(rows, query);
  const groups: FontGroup[] = [];
  const usedRows = shown.filter((row) => used.includes(row.id));
  if (usedRows.length > 0)
    groups.push({ id: 'used', title: FONT_PICKER.inThisPresentation, rows: usedRows });
  for (const category of FONT_CATEGORIES) {
    const inCategory = shown.filter((row) => row.category === category);
    if (inCategory.length > 0)
      groups.push({ id: category, title: FONT_CATEGORY_LABELS[category], rows: inCategory });
  }
  return groups;
}

/** The flat row order of the groups, for the arrow keys (a row in two groups walks twice, once per group). */
export function flatRows(groups: readonly FontGroup[]): { group: FontGroup['id']; row: FontRow }[] {
  const out: { group: FontGroup['id']; row: FontRow }[] = [];
  for (const group of groups) for (const row of group.rows) out.push({ group: group.id, row });
  return out;
}

/** The `block.set /typography` value that gives a block a family; the theme's face removes the key. */
export function typographyWithFamily(
  typography: Record<string, unknown>,
  family: FontId | null,
): Record<string, unknown> {
  const { family: _dropped, ...rest } = typography;
  void _dropped;
  return family === null || family === DEFAULT_FONT_ID ? rest : { ...rest, family };
}
