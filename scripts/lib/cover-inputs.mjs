// The seed deck's inputs of the GT cover (hardening HR-PS#10; packages/theme/brand/site.ts
// GT_COVER.inputs): scripts/build-brand.ts --cover records this digest beside the cover's path
// when it renders the file, and --check (step 29) and cover-inputs.test.mjs refuse a cover whose
// deck no longer hashes to it. The cover is named by its own bytes, so before this an edit to the
// slide it pictures passed every check and /decks showed the old cover for the year the
// `/brand/cover/**` route rule grants. Framework free and read only; plain ESM with JSDoc types,
// as import-report.mjs is, so the root lint parses it without a TypeScript project.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The digest's length in hex digits: enough to tell any edit apart, short in the client bundle. */
export const COVER_INPUTS_DIGITS = 16;

/**
 * JSON with every object's keys in order, so a reformatted or reordered file reads alike.
 * @param {unknown} value
 * @returns {string}
 */
function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${sortedJson(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Every string under a value, in document order.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
function stringsUnder(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsUnder(item, out);
  else if (typeof value === 'object' && value !== null)
    for (const item of Object.values(value)) stringsUnder(item, out);
  return out;
}

/**
 * The asset ids a slide names: every `asset` string and `assets` list in it (readers.ts assetIdsOf).
 * @param {unknown} value
 * @param {Set<string>} [out]
 * @returns {Set<string>}
 */
function slideAssetIds(value, out = new Set()) {
  if (Array.isArray(value)) for (const item of value) slideAssetIds(item, out);
  else if (typeof value === 'object' && value !== null)
    for (const [key, item] of Object.entries(value)) {
      if (key === 'asset' && typeof item === 'string') out.add(item);
      else if (key === 'assets' && Array.isArray(item)) {
        for (const id of item) if (typeof id === 'string') out.add(id);
      } else slideAssetIds(item, out);
    }
  return out;
}

/**
 * The digest of what the cover slide's render can read from its deck folder: the slide's file,
 * every field of deck.json but its bookkeeping (`revision`, `createdAt`, `updatedAt`), with
 * `assets` cut to the entries the slide names, and the bytes of every file under `assets/` those
 * entries name. The deck's other fields stay whole, the sections and their names included: the
 * render reads deck level facts beyond the slide (the counter numbers it against every section's
 * slide list, packages/render/src/deck.ts renderSlides; the theme, the brand kit and the defaults
 * style it), and a narrower cut would have to follow every one of them. So a section renamed, a
 * slide added, removed or moved, or a deck setting changed moves the digest even when the cover
 * slide's file is unchanged, and the cover is rendered again; another
 * slide's file, and an asset entry or a picture the slide does not name, leave it alone. The JSON
 * is hashed with sorted keys, so reformatting a file or reordering its keys changes nothing. The
 * theme's stylesheets, the fonts and the renderer are not the deck's and are not read here.
 * Throws when an input is missing.
 *
 * @param {string} deckDir
 * @param {string} slideId
 * @returns {string}
 */
export function coverInputs(deckDir, slideId) {
  /** @param {string} relative */
  const read = (relative) => {
    const file = join(deckDir, relative);
    if (!existsSync(file)) throw new Error(`the GT cover's input ${file} is missing`);
    return readFileSync(file);
  };
  const slide = JSON.parse(read(`slides/${slideId}.json`).toString('utf8'));
  /** @type {Record<string, unknown>} */
  const deckJson = JSON.parse(read('deck.json').toString('utf8'));
  const { revision: _revision, createdAt: _created, updatedAt: _updated, ...deck } = deckJson;
  const assets = /** @type {Record<string, unknown>} */ (deckJson.assets ?? {});
  /** @type {Record<string, unknown>} */
  const named = {};
  for (const id of [...slideAssetIds(slide)].sort()) named[id] = assets[id] ?? null;
  const hash = createHash('sha256').update(sortedJson({ slide, deck: { ...deck, assets: named } }));
  const files = [...new Set(stringsUnder(named).filter((text) => text.startsWith('assets/')))];
  for (const file of files.sort()) hash.update(`\n${file}\n`).update(read(file));
  return hash.digest('hex').slice(0, COVER_INPUTS_DIGITS);
}
