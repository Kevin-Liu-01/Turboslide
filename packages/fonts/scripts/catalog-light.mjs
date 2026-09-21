// Writes src/catalog-light.ts from src/catalog-files.ts (docs/PRODUCT.md 4.2): per family the
// name, the category, the licence and the woff2 files with their style and weight, the half of
// the catalog the browser needs for the @font-face emission and the Font dropdown; the digests
// and the source facts stay in catalog-files.ts. Run after scripts/fetch-fonts.mjs; catalog.test.ts
// asserts the two tables agree, so a stale file fails the chain.
//   node packages/fonts/scripts/catalog-light.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { CATALOG_FILES } = await import('../src/catalog-files.ts');

const rows = CATALOG_FILES.map((row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  licence: row.licence,
  files: row.files.map((file) => ({ file: file.file, style: file.style, weight: file.weight })),
}));

const literal = (value) =>
  JSON.stringify(value)
    .replace(/"(\w+)":/g, '$1: ')
    .replace(/"/g, "'")
    .replace(/,/g, ', ')
    .replace(/\{/g, '{ ')
    .replace(/\}/g, ' }');

const out = `// The light half of the catalog for the browser (docs/PRODUCT.md 4.2; SPEC-5-amendments A5
// items 3 and 4): per family the name, the category, the licence and the woff2 files with their
// style and weight, generated from catalog-files.ts by \`node packages/fonts/scripts/catalog-light.mjs\`
// and pinned equal to it by catalog.test.ts. The renderer's @font-face emission
// (@turboslide/render/fonts) and font.list read this table, so the digests and source facts of
// catalog-files.ts (about 20 KB) stay out of the client graph. Do not edit by hand.
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';

/** One woff2 file: its name under assets/<id>/, its style and its weight (a range for a variable file). */
export type LightFile = { file: string; style: 'normal' | 'italic'; weight: number | [number, number] };

export type LightFamily = {
  id: FontId;
  name: string;
  category: FontCategory;
  licence: FontLicence;
  files: LightFile[];
};

export const CATALOG_LIGHT: readonly LightFamily[] = [
${rows.map((row) => `  ${literal(row)},`).join('\n')}
];
`;

const target = fileURLToPath(new URL('../src/catalog-light.ts', import.meta.url));
writeFileSync(target, out);
console.log(`catalog-light: ${rows.length} families written to ${target}; run prettier on it`);
