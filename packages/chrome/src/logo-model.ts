// The logo picker's pure rules (docs/FEATURES.md 4.2 to 4.6, 4.11; audit-logos 5, 6, 12, 17): the
// row shape the cached index holds and `logo.search` answers, the ranking over title, slug,
// aliases and categories, the licence classes with the seller's sentence for each recorded string,
// the appearance rule that picks a variant for a light or a dark deck, the Mono decision, the kit's
// text colour a mono mark is tinted with, the logo size an insert takes and the words the dialog,
// the Tailor button and the snackbar read. The studio server imports it for the search and the
// insert (apps/studio/src/server/logos.ts) and B1's dialog for the tiles, so one module decides on
// both sides. No React, no DOM, no network: logo-model.test.ts runs in Node.
import type { BrandKit, KitAppearance } from '@turboslide/schema/brand';
import { TOKENS } from '@turboslide/theme/tokens';

/** The one source this round reads (audit-logos section 1; 4.10 names the fallback). */
export const LOGO_SOURCE = 'thesvg.org';
/** The provider word the asset's source record carries. */
export const LOGO_PROVIDER = 'thesvg';
/** The studio's logo route (routes/api/logo.$.ts): the tiles, the search, the refresh, the insert. */
export const LOGO_ROUTE = '/api/logo';

/** The collections thesvg.org ships (`icons.json` `collection`); brands and community are the default results (question 1). */
export const LOGO_BRAND_COLLECTIONS: ReadonlyArray<string> = ['brands', 'community'];

/** How many rows a search answers by default, and the most a caller may ask for (4.11). */
export const LOGO_SEARCH_DEFAULT_LIMIT = 20;
export const LOGO_SEARCH_MAX_LIMIT = 50;

/** A symbol inserts 160 sheet px tall and a wordmark 320 sheet px wide (4.4; audit-logos 9). */
export const LOGO_SYMBOL_HEIGHT = 160;
export const LOGO_WORDMARK_WIDTH = 320;
/** The twins are rasterized at 3x of the logo size, the long side inside these bounds (audit-logos 2). */
export const LOGO_RASTER_SCALE = 3;
export const LOGO_RASTER_MIN_LONG_SIDE = 384;
export const LOGO_RASTER_MAX_LONG_SIDE = 1536;
/** The room a placed logo keeps from the edges of its area, the picture rule's (picture-place.ts). */
export const LOGO_INSERT_MARGIN = 40;

/** Why a variant is not offered: the upstream answered 404 or 5xx, the file did not parse, or the sanitizer dropped something that draws. */
export type LogoUnavailable = {
  at: string;
  status?: number;
  reason?: 'missing' | 'broken' | 'sanitized' | 'gradient';
};

/**
 * One row of the cached index, `icons.json` trimmed to what the picker and the insert read (4.2);
 * `variants` maps a key (`default`, `mono`, `light`, `dark`, `wordmark`, `wordmarkLight`,
 * `wordmarkDark`, ...) to the file path under the upstream (`/icons/<slug>/<file>.svg`), never
 * composed from the key (audit-logos 13). The two reads flags are absent until the refresh has
 * rasterized the default once; an absent flag reads as true.
 */
export type LogoRow = {
  slug: string;
  title: string;
  aliases: string[];
  categories: string[];
  hex?: string;
  variants: Record<string, string>;
  license: string;
  url?: string;
  guidelines?: string;
  collection: string;
  dateAdded?: string;
  readsOnPaper?: boolean;
  readsOnInk?: boolean;
  unavailable?: Record<string, LogoUnavailable>;
};

/** The index's facts the search answer and the dialog's foot carry (4.2, 4.6, 4.9). */
export type LogoIndexFacts = {
  /** the time of the last complete build; null before the first one completes */
  updatedAt: string | null;
  lastError?: { at: string; status?: number; message: string };
  progress?: { done: number; total: number };
  /**
   * the `builtAt` of the snapshot bundled with the deployment, set while an instance answers
   * from it because the store refused the index (build/hotfix.md section 9); the foot names it
   */
  snapshotAt?: string;
};

/** One row of the `logo.search` answer (4.11): the index row with its licence sentence. */
export type LogoSearchRow = LogoRow & { licenceSentence: string };

export type LogoSearchOptions = {
  limit?: number;
  /** `symbol` needs a default, `wordmark` a wordmark of some kind */
  kind?: 'symbol' | 'wordmark';
  /** `brands` (the default) is brands and community; `all` adds the cloud collections and the badges */
  collection?: 'brands' | 'all';
};

// ---------------------------------------------------------------------------------------------
// Licences (4.6, 4.10; question 2)

export type LicenceClass = 'open' | 'credit' | 'unchanged' | 'copyleft' | 'own';

/** The seller's sentence per class (judge-seller rejection 6): never the identifier. */
export const LICENCE_SENTENCES: Readonly<Record<LicenceClass, string>> = {
  open: 'Free to use',
  credit: 'Free to use with credit',
  unchanged: 'Free to use unchanged',
  copyleft: 'Free to use under an open licence',
  own: 'The brand’s own terms',
};

/**
 * The class of a licence string as thesvg records it (57 values on 2026-09-20, audit-logos
 * section 1): CC0, MIT, Apache, BSD, ISC and Unlicense are open; CC BY and CC BY-SA ask for
 * credit; CC BY-ND forbids changes; MPL, GPL, LGPL and AGPL are copyleft; a non commercial
 * clause, brand-use, Trademark, Fair Use, Proprietary, Custom, Unknown, the Microsoft sentence and
 * every string this table does not know are the brand's own terms.
 */
export function licenceClassOf(license: string): LicenceClass {
  const value = license.trim().toUpperCase();
  if (value === '') return 'own';
  if (/^CC0(-|$)/.test(value)) return 'open';
  if (value === 'MIT' || value === 'ISC' || value === 'UNLICENSE') return 'open';
  if (/^APACHE(-|$)/.test(value)) return 'open';
  if (/^BSD(-|$)/.test(value)) return 'open';
  if (/^CC-BY(-[0-9.]+)?$/.test(value) || /^CC-BY-SA(-[0-9.]+)?$/.test(value)) return 'credit';
  if (/^CC-BY-ND(-[0-9.]+)?$/.test(value)) return 'unchanged';
  if (/^(MPL|GPL|LGPL|AGPL)(-|$)/.test(value)) return 'copyleft';
  return 'own';
}

export function licenceSentenceOf(license: string): string {
  return LICENCE_SENTENCES[licenceClassOf(license)];
}

/** The tooltip that carries the recorded string (4.6). */
export function licenceTooltipOf(license: string): string {
  return `Recorded on ${LOGO_SOURCE} as ${license.trim() === '' ? 'no licence' : license.trim()}`;
}

/** True for the marks the server may keep a sanitized copy of in the store (4.2, 4.10). */
export function isOpenLicence(license: string): boolean {
  return licenceClassOf(license) === 'open';
}

/**
 * The mono tint rule of question 2's default: on for an open licence, for one that asks for credit
 * and for a copyleft one (each allows a derivative), off where the licence forbids derivatives or
 * is the brand's own terms (CC BY-ND, Proprietary, Trademark, Unknown), where the mark inserts
 * unmodified.
 */
export function tintAllowed(license: string): boolean {
  const cls = licenceClassOf(license);
  return cls === 'open' || cls === 'credit' || cls === 'copyleft';
}

// ---------------------------------------------------------------------------------------------
// The search (4.3, 4.11; audit-logos 17)

/** Lower case, diacritics stripped, hyphens and underscores as spaces, one space between words. */
export function normalizeLogoText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 for a prefix, 1 for a word start, 2 for a substring, null for no match. */
export function matchTier(field: string, query: string): 0 | 1 | 2 | null {
  const text = normalizeLogoText(field);
  if (text === '' || query === '') return null;
  if (text.startsWith(query)) return 0;
  if (text.includes(` ${query}`)) return 1;
  if (text.includes(query)) return 2;
  return null;
}

/** The best tier of a row over its title, slug, aliases and categories, or null. */
export function rowMatchTier(row: LogoRow, query: string): 0 | 1 | 2 | null {
  let best: 0 | 1 | 2 | null = null;
  for (const field of [row.title, row.slug, ...row.aliases, ...row.categories]) {
    const tier = matchTier(field, query);
    if (tier === null) continue;
    if (best === null || tier < best) best = tier;
    if (best === 0) break;
  }
  return best;
}

export function isBrandCollection(collection: string): boolean {
  return LOGO_BRAND_COLLECTIONS.includes(collection);
}

/** True while a variant is listed and not marked unavailable. */
export function variantAvailable(row: LogoRow, key: string): boolean {
  return row.variants[key] !== undefined && row.unavailable?.[key] === undefined;
}

/** The kind a variant key names: a wordmark of some kind, a symbol, or one of the badge sizes and one offs. */
export function variantKindOf(key: string): 'symbol' | 'wordmark' | 'other' {
  if (/^wordmark|^lockup|^horizontal$/.test(key)) return 'wordmark';
  if (key === 'default' || key === 'mono' || key === 'light' || key === 'dark' || key === 'color')
    return 'symbol';
  return 'other';
}

/** The row has an available wordmark of some kind. */
export function hasWordmark(row: LogoRow): boolean {
  return Object.keys(row.variants).some(
    (key) => variantKindOf(key) === 'wordmark' && variantAvailable(row, key),
  );
}

function collectionRank(collection: string): number {
  if (collection === 'brands') return 0;
  if (collection === 'community') return 1;
  return 2;
}

/**
 * The ranking of 4.3: prefix, then word start, then substring, brands before community before the
 * rest, then shorter titles, then the title. A row whose default is unavailable is never listed
 * (audit-logos 13); the cloud collections and the badges are out unless `collection: 'all'`
 * (question 1). An empty query lists nothing.
 */
export function rankLogos(
  rows: ReadonlyArray<LogoRow>,
  query: string,
  options: LogoSearchOptions = {},
): LogoRow[] {
  const q = normalizeLogoText(query);
  if (q === '') return [];
  const limit = Math.max(
    1,
    Math.min(LOGO_SEARCH_MAX_LIMIT, options.limit ?? LOGO_SEARCH_DEFAULT_LIMIT),
  );
  const all = options.collection === 'all';
  const scored: { row: LogoRow; tier: number; rank: number }[] = [];
  for (const row of rows) {
    if (!all && !isBrandCollection(row.collection)) continue;
    if (!variantAvailable(row, 'default')) continue;
    if (options.kind === 'wordmark' && !hasWordmark(row)) continue;
    const tier = rowMatchTier(row, q);
    if (tier === null) continue;
    scored.push({ row, tier, rank: collectionRank(row.collection) });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.rank - b.rank ||
      a.row.title.length - b.row.title.length ||
      a.row.title.localeCompare(b.row.title) ||
      a.row.slug.localeCompare(b.row.slug),
  );
  return scored.slice(0, limit).map((entry) => entry.row);
}

/** A search row: the index row with its licence sentence (4.11). */
export function searchRowOf(row: LogoRow): LogoSearchRow {
  return { ...row, licenceSentence: licenceSentenceOf(row.license) };
}

/**
 * The brand a name means (4.5, the Tailor button): the first row whose title or an alias is the
 * name, else the first prefix match on the title; null when the index knows no such brand.
 */
export function logoMatchFor(rows: ReadonlyArray<LogoRow>, name: string): LogoRow | null {
  const q = normalizeLogoText(name);
  if (q === '') return null;
  const exact = rows
    .filter(
      (row) =>
        isBrandCollection(row.collection) &&
        variantAvailable(row, 'default') &&
        (normalizeLogoText(row.title) === q || row.aliases.some((a) => normalizeLogoText(a) === q)),
    )
    .sort((a, b) => collectionRank(a.collection) - collectionRank(b.collection))[0];
  if (exact !== undefined) return exact;
  const ranked = rankLogos(rows, name, { limit: 5 });
  const first = ranked[0];
  if (first === undefined) return null;
  return matchTier(first.title, q) === 0 ? first : null;
}

// ---------------------------------------------------------------------------------------------
// The appearance rule and the Mono decision (4.3, 4.4; audit-logos 5, 6)

export type LogoVariantChoice = {
  /** the variant key to fetch */
  variant: string;
  /** true when the file is rasterized with the kit's text colour written into every fill and stroke */
  tint: boolean;
  /** set when no variant reads on this appearance: the tile draws on a plate with this line */
  plateLine?: string;
};

export type ChooseVariantOptions = {
  /** Symbol (the default) or Wordmark (P1's control; an agent's `variant`) */
  kind?: 'symbol' | 'wordmark';
  /** Mono asks for the tinted mono when the licence allows it; Color asks for the coloured mark */
  tone?: 'color' | 'mono';
};

/** The plate line when nothing reads on the appearance (audit-logos 6). */
export const LOGO_PLATE_LINES = {
  light: 'Best on a dark slide',
  dark: 'Best on a light slide',
} as const;

function readsOn(row: LogoRow, appearance: KitAppearance): boolean {
  const flag = appearance === 'light' ? row.readsOnPaper : row.readsOnInk;
  return flag !== false;
}

/**
 * The variant for the deck's appearance (4.3): on a light deck `light`, else `default` when it
 * reads on paper, else `mono` tinted; on a dark deck `dark`, else `default` when it reads on ink,
 * else `mono` tinted; the tint only where the licence allows it (question 2); a mark with no
 * readable variant and no mono is the default on a plate with the line. A wordmark asks the same of
 * the wordmark keys (`wordmarkLight`, `wordmarkDark`, `wordmark`); Mono asks for the tinted mono
 * first. Null when the row has nothing of the kind asked for.
 *
 * thesvg.org names a variant after the ground it is drawn for, not after its ink: Vercel's
 * `light.svg` is the black triangle and its `dark.svg` the white one, GitHub's `light.svg` fills
 * `#1b1f23` and its `dark.svg` `#ffffff` (the files served on 2026-09-22, verbatim in the fixture
 * upstream). The first form of this rule read the names as ink colours and chose the invisible
 * file on each ground (the integrator's gate run, row `logos.picker.paper-and-ink`: both tile
 * halves and the inserted light twin read 0 percent lit).
 */
export function chooseVariant(
  row: LogoRow,
  appearance: KitAppearance,
  options: ChooseVariantOptions = {},
): LogoVariantChoice | null {
  const has = (key: string): boolean => variantAvailable(row, key);
  const tintable = tintAllowed(row.license);
  if (options.kind === 'wordmark') {
    const paired = appearance === 'light' ? 'wordmarkLight' : 'wordmarkDark';
    if (options.tone === 'mono' && tintable && has('wordmarkMono'))
      return { variant: 'wordmarkMono', tint: true };
    if (has(paired)) return { variant: paired, tint: false };
    if (has('wordmark')) return { variant: 'wordmark', tint: false };
    if (has('lockup')) return { variant: 'lockup', tint: false };
    if (has('horizontal')) return { variant: 'horizontal', tint: false };
    return null;
  }
  if (options.tone === 'mono') {
    if (tintable && has('mono')) return { variant: 'mono', tint: true };
    // a licence that forbids the tint offers the untinted mark alone (4.10)
  }
  const paired = appearance === 'light' ? 'light' : 'dark';
  if (has(paired)) return { variant: paired, tint: false };
  if (has('default') && readsOn(row, appearance)) return { variant: 'default', tint: false };
  if (tintable && has('mono')) return { variant: 'mono', tint: true };
  if (has('default'))
    return { variant: 'default', tint: false, plateLine: LOGO_PLATE_LINES[appearance] };
  return null;
}

/**
 * True when a mono file may be offered as Mono (4.4): a fill or a stroke that references a
 * gradient or a pattern (`url(#…)`) cannot take one colour, so such a file is not tinted and the
 * appearance rule skips it. Read over the sanitized text, attributes and style declarations alike.
 */
export function monoOffered(svgText: string): boolean {
  return !/(?:fill|stroke)\s*[:=]\s*["']?\s*url\(\s*#/i.test(svgText);
}

// ---------------------------------------------------------------------------------------------
// The kit's colours a logo is drawn with (4.3, 4.4)

/** The kit's text colour for an appearance, else the theme's ink (the tint colour of a mono mark). */
export function kitTextColour(kit: BrandKit | undefined, appearance: KitAppearance): string {
  return kit?.colors?.[appearance]?.text ?? TOKENS[appearance].ink;
}

/** The kit's background for an appearance, else the theme's paper (the two grounds of a tile). */
export function kitBackgroundColour(kit: BrandKit | undefined, appearance: KitAppearance): string {
  return kit?.colors?.[appearance]?.background ?? TOKENS[appearance].paper;
}

// ---------------------------------------------------------------------------------------------
// The size an insert takes (4.4; audit-logos 9)

export type LogoBox = [number, number, number, number];

/**
 * The sheet px size of a placed logo: a symbol 160 tall, a wordmark 320 wide, at the mark's own
 * ratio; a degenerate or unknown ratio reads as square for a symbol and 4:1 for a wordmark.
 */
export function logoInsertSize(
  kind: 'symbol' | 'wordmark',
  natural: readonly [number, number] | undefined,
): [number, number] {
  const ok = natural !== undefined && natural[0] > 0 && natural[1] > 0;
  if (kind === 'wordmark') {
    const ratio = ok ? natural[0] / natural[1] : 4;
    const w = LOGO_WORDMARK_WIDTH;
    return [w, Math.max(8, Math.round(w / ratio))];
  }
  const ratio = ok ? natural[0] / natural[1] : 1;
  const h = LOGO_SYMBOL_HEIGHT;
  return [Math.max(8, Math.round(h * ratio)), h];
}

/**
 * The box a logo takes inside an area (the free rectangle of the body slot, else the slot): the
 * logo size, scaled down when the area minus the margin is smaller, centred in the area, never
 * scaled up, rounded to whole sheet px.
 */
export function logoBoxIn(
  area: LogoBox,
  size: readonly [number, number],
  margin: number = LOGO_INSERT_MARGIN,
): LogoBox {
  const maxW = Math.max(8, area[2] - 2 * margin);
  const maxH = Math.max(8, area[3] - 2 * margin);
  const scale = Math.min(1, maxW / size[0], maxH / size[1]);
  const w = Math.max(8, Math.round(size[0] * scale));
  const h = Math.max(8, Math.round(size[1] * scale));
  return [Math.round(area[0] + (area[2] - w) / 2), Math.round(area[1] + (area[3] - h) / 2), w, h];
}

/** The room kept between the title's mark slot, a logo placed beside it and the content box's edge, in sheet px. */
export const LOGO_TITLE_GAP = 40;

/** What the title rule reads of a canvas object: its kind and its box. */
export type LogoPlacedObject = {
  type: string;
  pos?: { x: number; y: number; w: number; h: number } | undefined;
};

/**
 * Where a logo lands on a title slide that has become a canvas (4.4; the verifier's pass 1, F3):
 * the title layout has no body slot, its mark, heading and lead are one stack in the middle of
 * the sheet, and its empty lead reads to the picture rule as a placeholder standing for the whole
 * content box, so the customer's mark landed over the heading's words at the slot's centre. The
 * rule here: the mark slot's row, to the right of the mark block (the brand's own mark), from the
 * mark's right edge plus the gap to the content box's right edge minus the gap, at the mark's
 * height; an object already on that row (a second logo) moves the area's left edge past it. Null
 * when the slide is not a converted title, carries no mark block, or the row is full, so the
 * general rule decides. The viewer repeats the rule (Editor.tsx `insertLogoAsset`) because it
 * cannot import this package; the numbers are these.
 */
export function logoTitleArea(
  kind: string | undefined,
  objects: ReadonlyArray<LogoPlacedObject>,
  content: LogoBox,
): LogoBox | null {
  if (kind !== 'title') return null;
  const mark = objects.find((block) => block.type === 'mark' && block.pos !== undefined);
  const pos = mark?.pos;
  if (pos === undefined) return null;
  const top = pos.y;
  const bottom = pos.y + pos.h;
  let left = pos.x + pos.w + LOGO_TITLE_GAP;
  const right = content[0] + content[2] - LOGO_TITLE_GAP;
  for (const block of objects) {
    if (block === mark || block.pos === undefined || block.type === 'picture') continue;
    const own = block.pos;
    // an object on the mark's row (its box crosses the row) with its left edge at or past the
    // mark's right edge takes the row up to its right edge plus the gap
    if (own.y >= bottom || own.y + own.h <= top) continue;
    if (own.x + own.w <= pos.x + pos.w) continue;
    if (own.x >= right) continue;
    left = Math.max(left, own.x + own.w + LOGO_TITLE_GAP);
  }
  if (right - left < 8) return null;
  return [left, top, right - left, pos.h];
}

/**
 * The box a logo takes beside the title's mark (4.4): the logo size scaled down to the area's
 * height and width, never up, at the area's left edge and centred on its height, so the
 * customer's mark sits beside the brand's mark on one row.
 */
export function logoBoxAtStart(area: LogoBox, size: readonly [number, number]): LogoBox {
  const scale = Math.min(1, area[2] / size[0], area[3] / size[1]);
  const w = Math.max(8, Math.round(size[0] * scale));
  const h = Math.max(8, Math.round(size[1] * scale));
  return [Math.round(area[0]), Math.round(area[1] + (area[3] - h) / 2), w, h];
}

/**
 * The pixel size the twins are rasterized at (4.4; audit-logos 2): 3x of the logo size, the long
 * side at least 384 and at most 1536 px, the aspect kept.
 */
export function logoRasterSize(
  kind: 'symbol' | 'wordmark',
  natural: readonly [number, number] | undefined,
): [number, number] {
  const [w, h] = logoInsertSize(kind, natural);
  let scale = LOGO_RASTER_SCALE;
  const long = Math.max(w, h) * scale;
  if (long < LOGO_RASTER_MIN_LONG_SIDE) scale = LOGO_RASTER_MIN_LONG_SIDE / Math.max(w, h);
  if (long > LOGO_RASTER_MAX_LONG_SIDE) scale = LOGO_RASTER_MAX_LONG_SIDE / Math.max(w, h);
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

/** The kind a chosen variant inserts as. */
export function insertKindOf(variant: string): 'symbol' | 'wordmark' {
  return variantKindOf(variant) === 'wordmark' ? 'wordmark' : 'symbol';
}

// ---------------------------------------------------------------------------------------------
// The words (4.3, 4.4, 4.6, 4.9)

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** An ISO time as the foot reads it: "20 September 2026"; the empty string for none. */
export function logoIndexDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}

/** A time as the failure clause reads it: "at 06:02 UTC". */
function logoFailureTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

export const LOGO_WORDS = {
  /** the dialog's lead (audit-logos 21) */
  lead: 'Company logos from thesvg.org, or upload your own',
  /** the alt of an inserted mark */
  alt: (title: string) => `${title} logo`,
  /** the snackbar of an insert with Use as this presentation's logo checked (4.4) */
  everySlide: (title: string) => `The ${title} logo is on every slide`,
  everySlideCheck: 'Use as this presentation’s logo on every slide',
  everySlideLine: 'Replaces the brand kit’s logo on the title slide and in every footer',
  /** the sentence a mark whose fetch failed answers (4.9) */
  upstreamDown: 'thesvg.org did not answer; try again in a minute',
  /** the sentence a file that does not parse answers (4.7) */
  broken: 'This logo’s file is broken on thesvg.org',
  /** the sentence of the size cap (4.7) */
  tooLarge: (capBytes: number) =>
    `This logo’s file is over ${Math.round(capBytes / 1024)} KB, the most the picker reads`,
  /** the sentence of a mark the index does not know */
  unknown: (slug: string) => `No logo named ${slug} on thesvg.org`,
  /** the sentence of a variant the mark does not have */
  noVariant: (title: string, variant: string) => `${title} has no ${variant} on thesvg.org`,
  /** the foot sentence (4.6); "as of" names the bundled snapshot's date while it stands (build/hotfix.md 9) */
  source: (facts: LogoIndexFacts) => {
    const snapshot = logoIndexDate(facts.snapshotAt);
    const date = logoIndexDate(facts.updatedAt);
    const head =
      snapshot !== ''
        ? `Logos from thesvg.org as of ${snapshot}`
        : date === ''
          ? 'Logos from thesvg.org'
          : `Logos from thesvg.org, updated ${date}`;
    const tail =
      'Brand marks belong to their owners; use them to name the brand, not to imply endorsement';
    const failure =
      facts.lastError === undefined
        ? ''
        : `. thesvg.org did not answer at ${logoFailureTime(facts.lastError.at)}`;
    return `${head}. ${tail}${failure}`;
  },
  /** the selected tile's row (4.6): "<Title>: <sentence>, brand guidelines" */
  licenceRow: (title: string, license: string) =>
    `${title}: ${licenceSentenceOf(license)}, brand guidelines`,
  /** the Tailor button (4.5) */
  findLogo: (to: string) => `Find the ${to} logo`,
  /** the empty state (4.3) */
  empty: (query: string) =>
    `No logo named ${query} on thesvg.org. Upload a file, or ask the brand for its press kit`,
  emptyKit: 'Your brand kit’s logo is under Your brand',
  /** the Brand kit panel's button (4.5, P1) */
  findAKit: 'Find a logo',
  findAKitDoc: 'Picks a company logo from thesvg.org for the title slide and every footer',
} as const;

/** The link a licence row opens: the brand's guidelines when recorded, else its site, else the source's legal page. */
export function licenceLinkOf(row: Pick<LogoRow, 'url' | 'guidelines'>): string {
  return row.guidelines ?? row.url ?? `https://${LOGO_SOURCE}/legal`;
}

/** The asset id a mark takes: its slug, `-2`, `-3`, ... while the deck holds the id already. */
export function logoAssetId(slug: string, taken: ReadonlySet<string>): string {
  const base = slug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'logo';
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** The mark route of a variant, the address a tile's `<img>` loads (4.7). */
export function logoMarkPath(slug: string, variant: string): string {
  return `${LOGO_ROUTE}/mark/${encodeURIComponent(slug)}/${encodeURIComponent(variant)}.svg`;
}

/** How long the Tailor handler waits for the stored mark to reach the deck's document, and how often it looks (4.5). */
export const FIND_LOGO_LANDED_MS = 15_000;
export const FIND_LOGO_LANDED_INTERVAL_MS = 100;

/**
 * How the Tailor handler learns the stored mark has reached the deck's document (the verifier's
 * pass 1, F2): `landed` reads the document the dialog's `deck.tailor` will plan over and answers
 * true once it holds the asset. On the blob tier the record of an asset only write reaches the
 * tab through the channel's head poll and a resync, seconds after the server's answer, while the
 * memory tier's room streams it within milliseconds; `deck.tailor` runs in the page over the
 * tab's document, so an Apply before the record arrived was refused with "no asset" and nothing
 * was renamed. Without `landed` the handler answers as the server does.
 */
export type FindLogoLanded = {
  landed: (assetId: string) => Promise<boolean> | boolean;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * The Tailor handler (4.5): the mark is stored through `logo.insert` with no slide and no kit write
 * (an asset alone), and the asset id is what `deck.tailor { logo: { assetId, replaceAlt } }`
 * names in the one Tailor commit. `insert` is the transport the dialog has (the window action, or
 * the same origin route until it lands). With `wait` the handler answers only once the deck's
 * document holds the asset, or after the bound with `landed: false`, so the dialog's "ready" line
 * is true when it reads and Apply finds the asset it names.
 */
export async function findCustomerLogo(
  row: LogoRow,
  appearance: KitAppearance,
  insert: (input: {
    slug: string;
    variant: string;
    baseRevision: number;
  }) => Promise<{ asset: { id: string } }>,
  baseRevision: number,
  wait?: FindLogoLanded,
): Promise<{ assetId: string; variant: string; landed: boolean } | null> {
  const choice = chooseVariant(row, appearance);
  if (choice === null) return null;
  const answer = await insert({ slug: row.slug, variant: choice.variant, baseRevision });
  const assetId = answer.asset.id;
  if (wait === undefined) return { assetId, variant: choice.variant, landed: true };
  const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const until = Date.now() + (wait.timeoutMs ?? FIND_LOGO_LANDED_MS);
  const interval = Math.max(1, wait.intervalMs ?? FIND_LOGO_LANDED_INTERVAL_MS);
  let landed = await wait.landed(assetId);
  while (!landed && Date.now() < until) {
    await sleep(interval);
    landed = await wait.landed(assetId);
  }
  return { assetId, variant: choice.variant, landed };
}
