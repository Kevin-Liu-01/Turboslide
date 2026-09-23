// The Font dropdown's pure rules (gslides-parity SPEC-5-amendments A5 item 4; docs/PRODUCT.md 4.2;
// ported from round five and re pointed at the brand kit): the rows the dropdown lists (the
// kit's two faces under Brand, the families this presentation uses, then the catalog by Google's
// four categories), the search over names, the family a selected block carries, the families a
// document uses, the words, the paths the studio serves the faces under, and the `font.list`
// answer's shape the plate reads. The chrome depends on the schema and never on the fonts package
// (packages/chrome/package.json), so the rows come from the `font.list` action and the few facts
// the toolbar needs before the answer (the family names, the generic families, the route) are
// spelled here; packages/fonts/src/catalog.test.ts pins the names to the catalog. No React, no
// DOM: font-picker-model.test.ts runs in Node.
//
// The fixed kinds' fields (the cover's heading and lead, a statement's big line, a picture kind's
// plate; editor-shell.ts pseudoBlockOf) carry no `typography`: the brand kit's Display face draws
// the heading and its Text face the rest (packages/render/src/theme-css.ts writes `--display` and
// `--text` from the kit), so the Font control on such a field reads the kit's face for the
// field's role and says where it is set, instead of reading the theme's face and opening nothing
// (the features round's fix round, docs/gslides-parity/focus/VERIFICATION.md F.5 F8). Whether the
// fields take a typography of their own is Kevin's call (F.10 item 5); until then the control is
// honest about the kit path.
import type { BrandKit, KitFonts } from '@turboslide/schema/brand';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, FONT_CATEGORIES, FONT_IDS, isFontId } from '@turboslide/schema/fonts';

/** One row of `font.list` (the action's output; @turboslide/fonts/summary catalogSummary). */
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
  doc: 'The face of the selected text; More fonts lists every face with its licence',
  tableDoc: 'A table takes one size; its face is the theme’s',
  /* a fixed kind's field (the cover's heading and lead): the kit's face for its role draws it */
  fixedDisplayDoc: 'This heading takes the brand kit’s Display face; Slide > Edit theme changes it',
  fixedTextDoc: 'This text takes the brand kit’s Text face; Slide > Edit theme changes it',
  search: 'Search fonts',
  searchDoc: 'Type part of a family name',
  brand: 'Brand',
  inThisPresentation: 'In this presentation',
  /* the features round (docs/FEATURES.md 3.5, P1): the Recent group and its foot row */
  recent: 'Recent',
  clearRecent: 'Clear recent',
  clearRecentDoc: 'Forgets the faces this browser picked lately',
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
    licenceDoc: 'Opens the licence text',
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
 * families whose names are not title case spelled out (pinned to the catalog's names by the
 * fonts package test).
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

/** A role of the kit's fonts: `display` for every heading, `text` for the body text. */
export type KitFontRole = keyof KitFonts;

/**
 * The kit role a fixed kind's field draws in (editor-shell.ts pseudoBlockOf): the cover's heading
 * and a statement's big line are headings and take the Display face (sheet.css `h1, h2, .big`);
 * the lead and a picture kind's plate take the Text face (the sheet root's `--text`).
 */
export function fixedFieldRole(field: Block): KitFontRole {
  return field.type === 'heading' ? 'display' : 'text';
}

/**
 * The family a fixed field draws in, as `familyOf` spells it: the kit's face for the role, or
 * null for the theme's face when the kit is silent or names the theme's own (`inter`).
 */
export function fixedFieldFamily(kit: BrandKit | undefined, role: KitFontRole): FontId | null {
  const family = kit?.fonts?.[role];
  return family !== undefined && family !== DEFAULT_FONT_ID ? family : null;
}

/** The disabled control's sentence on a fixed field: which kit face draws it and where that is set. */
export function fixedFieldDoc(role: KitFontRole): string {
  return role === 'display' ? FONT_PICKER.fixedDisplayDoc : FONT_PICKER.fixedTextDoc;
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
 * block of every slide and every role of the brand kit's fonts, never the theme's default face.
 */
export function usedFamilies(document: DeckDocument): FontId[] {
  const used = new Set<FontId>();
  for (const slide of Object.values(document.slides))
    for (const { block } of slideBlocks(slide)) blockFamilies(block, used);
  const roles = document.deck.brand?.fonts;
  if (roles !== undefined)
    for (const family of Object.values(roles))
      if (typeof family === 'string' && isFontId(family)) used.add(family);
  used.delete(DEFAULT_FONT_ID);
  return FONT_IDS.filter((id) => used.has(id));
}

/**
 * The kit's faces (docs/PRODUCT.md 4.2, "the kit's two faces first under Brand"): the display
 * and text roles, the theme's face for a role the kit leaves silent, in that order and without
 * repeats, so the Brand group always names what the presentation's headings and body draw in.
 */
export function brandFamilies(kit: BrandKit | undefined): FontId[] {
  const display = kit?.fonts?.display ?? DEFAULT_FONT_ID;
  const text = kit?.fonts?.text ?? DEFAULT_FONT_ID;
  return text === display ? [display] : [display, text];
}

/**
 * The rows the query matches, case folded; every row for an empty query. The features round
 * (docs/FEATURES.md 3.5, audit-fonts 11, row `fonts.picker.search-category`): the query matches
 * the name, the category's label ("mono" lists the monospace families, "serif" the serifs and,
 * as a word inside it, the sans serifs) and the id ("dm-sans"), so a seller who types the kind
 * of face and not a name finds it.
 */
export function filterRows(rows: readonly FontRow[], query: string): FontRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return [...rows];
  return rows.filter(
    (row) =>
      row.name.toLocaleLowerCase().includes(needle) ||
      FONT_CATEGORY_LABELS[row.category].toLocaleLowerCase().includes(needle) ||
      row.id.includes(needle),
  );
}

export type FontGroup = {
  id: 'brand' | 'used' | 'recent' | FontCategory;
  title: string;
  rows: FontRow[];
};

/**
 * The picker's groups (docs/PRODUCT.md 4.2): the kit's faces under Brand, the families this
 * presentation uses, the faces this browser picked lately (docs/FEATURES.md 3.5, P1; audit-fonts
 * 10) then the catalog by category in Google's order (Sans serif, Serif, Display, Monospace). A
 * used or recent family stays in its category too, so the catalog reads whole. Every group
 * filters by the query; empty groups are dropped.
 */
export function groupRows(
  rows: readonly FontRow[],
  used: readonly FontId[],
  query = '',
  brand: readonly FontId[] = [],
  recent: readonly FontId[] = [],
): FontGroup[] {
  const shown = filterRows(rows, query);
  const groups: FontGroup[] = [];
  const brandRows = brand
    .map((id) => shown.find((row) => row.id === id))
    .filter((row): row is FontRow => row !== undefined);
  if (brandRows.length > 0) groups.push({ id: 'brand', title: FONT_PICKER.brand, rows: brandRows });
  const usedRows = shown.filter((row) => used.includes(row.id));
  if (usedRows.length > 0)
    groups.push({ id: 'used', title: FONT_PICKER.inThisPresentation, rows: usedRows });
  const recentRows = recent
    .map((id) => shown.find((row) => row.id === id))
    .filter((row): row is FontRow => row !== undefined);
  if (recentRows.length > 0)
    groups.push({ id: 'recent', title: FONT_PICKER.recent, rows: recentRows });
  for (const category of FONT_CATEGORIES) {
    const inCategory = shown.filter((row) => row.category === category);
    if (inCategory.length > 0)
      groups.push({ id: category, title: FONT_CATEGORY_LABELS[category], rows: inCategory });
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Recent, per browser (docs/FEATURES.md 3.5, P1; audit-fonts 10; question 6 of section 9)

/** The `localStorage` key of the faces this browser picked lately. */
export const FONTS_RECENT_STORAGE = 'turboslide.fonts.recent';
/** The Recent group lists at most this many faces. */
export const FONTS_RECENT_MAX = 5;

/** The recent ids a store holds, the catalog's alone, at most five; nothing on a broken store. */
export function readRecentFonts(storage: Storage | null): FontId[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(FONTS_RECENT_STORAGE);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: FontId[] = [];
    for (const each of parsed)
      if (typeof each === 'string' && isFontId(each) && !out.includes(each)) out.push(each);
    return out.slice(0, FONTS_RECENT_MAX);
  } catch {
    return [];
  }
}

/** The list with `id` first and no repeat, at most five; the theme's face is never remembered. Written back when a store exists. */
export function pushRecentFont(
  recent: readonly FontId[],
  id: FontId | null,
  storage: Storage | null,
): FontId[] {
  if (id === null || id === DEFAULT_FONT_ID) return [...recent];
  const next = [id, ...recent.filter((each) => each !== id)].slice(0, FONTS_RECENT_MAX);
  writeRecentFonts(next, storage);
  return next;
}

/** Writes the list, or removes the key for an empty one (Clear recent). */
export function writeRecentFonts(recent: readonly FontId[], storage: Storage | null): void {
  if (storage === null) return;
  try {
    if (recent.length === 0) storage.removeItem(FONTS_RECENT_STORAGE);
    else storage.setItem(FONTS_RECENT_STORAGE, JSON.stringify(recent));
  } catch {
    // private mode: the group holds for the session
  }
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

/** The pinned google/fonts commit and the directory per family, for the licence link (catalog.ts FONT_SOURCES). */
export const GOOGLE_FONTS_COMMIT = '1ac2012c34919f5fa2675aacf723fa98edb30b5f';
const DIRECTORIES: Readonly<Record<FontId, string>> = {
  inter: 'rsms/inter',
  roboto: 'ofl/roboto',
  'open-sans': 'ofl/opensans',
  lato: 'ofl/lato',
  montserrat: 'ofl/montserrat',
  poppins: 'ofl/poppins',
  'source-sans-3': 'ofl/sourcesans3',
  'source-serif-4': 'ofl/sourceserif4',
  merriweather: 'ofl/merriweather',
  'playfair-display': 'ofl/playfairdisplay',
  lora: 'ofl/lora',
  'pt-serif': 'ofl/ptserif',
  'libre-baskerville': 'ofl/librebaskerville',
  'eb-garamond': 'ofl/ebgaramond',
  nunito: 'ofl/nunito',
  raleway: 'ofl/raleway',
  'work-sans': 'ofl/worksans',
  'dm-sans': 'ofl/dmsans',
  'space-grotesk': 'ofl/spacegrotesk',
  oswald: 'ofl/oswald',
  'bebas-neue': 'ofl/bebasneue',
  'roboto-mono': 'ofl/robotomono',
  'jetbrains-mono': 'ofl/jetbrainsmono',
  'ibm-plex-sans': 'ofl/ibmplexsans',
  'ibm-plex-mono': 'ofl/ibmplexmono',
  'fira-code': 'ofl/firacode',
  /* the features round's eight families (docs/FEATURES.md 3.2; B2's catalog rows) */
  geist: 'ofl/geist',
  'geist-mono': 'ofl/geistmono',
  'instrument-sans': 'ofl/instrumentsans',
  manrope: 'ofl/manrope',
  'bricolage-grotesque': 'ofl/bricolagegrotesque',
  'schibsted-grotesk': 'ofl/schibstedgrotesk',
  newsreader: 'ofl/newsreader',
  fraunces: 'ofl/fraunces',
};

/**
 * The Inter release the bundled files come from (docs/FEATURES.md 3.1 items 1 and 2; audit-fonts
 * 4 and 5): rsms/inter tags the release `v4.1` while the font's internal version reads 4.001, and
 * the `v4.001` tag does not exist, so the licence link a marketer clicks from More fonts answered
 * 404 (B2's row `fonts.links.licence-v4-1`, the one line in this file by B2's request).
 */
export const INTER_RELEASE_TAG = 'v4.1';

/** The licence text's address: the family's OFL.txt in the Google Fonts repository at the pinned commit, Inter's release licence. */
export function licenceUrlOf(id: FontId): string {
  if (id === 'inter') return `https://github.com/rsms/inter/blob/${INTER_RELEASE_TAG}/LICENSE.txt`;
  return `https://github.com/google/fonts/blob/${GOOGLE_FONTS_COMMIT}/${DIRECTORIES[id]}/OFL.txt`;
}
