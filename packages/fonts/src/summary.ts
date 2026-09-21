// The browser safe reads of the catalog (docs/PRODUCT.md 4.2): the rows `font.list` answers, the
// family name, the `font-family` stack and the files of a face, all from the light table
// (catalog-light.ts) so the editor page and the page's window transport never load the digests
// of catalog-files.ts. catalog.ts composes the same facts from the full table for Node callers
// and catalog.test.ts pins the two equal.
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';
import { FONT_IDS } from '@turboslide/schema/fonts';

import type { LightFamily, LightFile } from './catalog-light.ts';
import { CATALOG_LIGHT } from './catalog-light.ts';
import { CATEGORY_GENERIC } from './names.ts';

/** The weights the picker can name (CSS's nine); a family carries the ones its files cover. */
export const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const byId = new Map<string, LightFamily>(CATALOG_LIGHT.map((row) => [row.id, row]));

/** The light row of an id; throws on an id outside the table. */
export function lightFamily(id: FontId): LightFamily {
  const row = byId.get(id);
  if (row === undefined) throw new RangeError(`@turboslide/fonts: no catalog row for "${id}"`);
  return row;
}

/** The weights of STANDARD_WEIGHTS a file list covers: a range covers every step inside it. */
export function weightsOf(files: readonly Pick<LightFile, 'weight'>[]): number[] {
  const out = new Set<number>();
  for (const file of files) {
    if (typeof file.weight === 'number') {
      out.add(file.weight);
      continue;
    }
    const [min, max] = file.weight;
    for (const weight of STANDARD_WEIGHTS) if (weight >= min && weight <= max) out.add(weight);
  }
  return [...out].sort((a, b) => a - b);
}

/** One row of `font.list` (the action's output schema in actions.ts). */
export type FontListRow = {
  id: FontId;
  name: string;
  category: FontCategory;
  weights: number[];
  italic: boolean;
  licence: FontLicence;
};

/** What `font.list` answers (SPEC-5-amendments A5 item 6), in FONT_IDS order. */
export function catalogSummary(): { fonts: FontListRow[] } {
  return {
    fonts: FONT_IDS.map((id) => {
      const row = lightFamily(id);
      return {
        id,
        name: row.name,
        category: row.category,
        weights: weightsOf(row.files),
        italic: row.files.some((file) => file.style === 'italic'),
        licence: row.licence,
      };
    }),
  };
}

/** The `font-family` value of a face: its name quoted, then the category's generic family. */
export function fontFamilyStack(id: FontId): string {
  const row = lightFamily(id);
  return `'${row.name.replace(/'/g, "\\'")}', ${CATEGORY_GENERIC[row.category]}`;
}

/** The custom property a block's `font-family` reads for a face (`--ts-font-<id>`). */
export function fontFamilyVariable(id: FontId): string {
  return `--ts-font-${id}`;
}

/**
 * A file's path under packages/fonts/: `assets/<id>/<file>` for a fetched family, `assets/<file>`
 * for the present Inter files (inter.ts named them before the catalog existed).
 */
export function fontAssetPath(id: FontId, file: string): string {
  return id === 'inter' ? `assets/${file}` : `assets/${id}/${file}`;
}

/** The licence text's address in the Google Fonts repository at the pinned commit, or Inter's release. */
export function licenceUrl(id: FontId, directory: string, commit: string): string {
  if (id === 'inter') return 'https://github.com/rsms/inter/blob/v4.001/LICENSE.txt';
  return `https://github.com/google/fonts/blob/${commit}/${directory}/OFL.txt`;
}
