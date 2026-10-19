// The 400 px copies of a deck's pictures that predate hardening HR-PC#6
// (docs/hardening/HARDENING.md): the intake writes a copy for every continuous picture it takes in
// (packages/headless/src/capture/intake.ts `smallCopy`), and a deck imported before 2026-10-18 has
// none, so its filmstrip decodes the full twins. For each asset with one neutral raster twin wider
// than ASSET_THUMB_WIDTH and no `thumb`, this writes the copy the intake writes (a WebP named
// `<id>.<sha8>-w400.webp`) and records `thumb`, then raises the revision and `updatedAt` as the
// importer does for a write that changes the deck (packages/import/src/import-deck.ts). A re-import
// carries the field (`carryDeckAssets`) and the import report's `importedAt` follows `updatedAt`,
// so check step 7 leaves the deck as written. A light and dark pair (the two-tone pictures) and an
// svg get no copy, as at the intake.
//
//   node scripts/seed-thumbs.ts decks/gt-brand [--check]
//
// `--check` writes nothing and exits 1 when a picture that qualifies has no copy.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { smallCopy } from '../packages/headless/src/capture/intake.ts';
import { ASSET_THUMB_WIDTH, assetSchema } from '../packages/schema/src/assets.ts';
import type { Asset } from '../packages/schema/src/assets.ts';
import { assetDigest } from '../packages/store/src/file-store.ts';

const args = process.argv.slice(2);
const check = args.includes('--check');
const deckDir = resolve(args.find((arg) => !arg.startsWith('--')) ?? 'decks/gt-brand');
const deckPath = join(deckDir, 'deck.json');
const reportPath = join(deckDir, 'import-report.json');

type DeckFile = { assets: Record<string, Asset>; revision: number; updatedAt: string };
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const deck = JSON.parse(readFileSync(deckPath, 'utf8')) as DeckFile;

/** The neutral twin a copy is made from, or null when the intake would make none. */
function source(asset: Asset): string | null {
  if (asset.thumb !== undefined || asset.vector !== undefined) return null;
  const twin = 'neutral' in asset.twins ? asset.twins.neutral : null;
  if (twin === null || /\.svg$/i.test(twin)) return null;
  return asset.size[0] > ASSET_THUMB_WIDTH ? twin : null;
}

const missing = Object.keys(deck.assets)
  .sort()
  .filter((id) => source(deck.assets[id] as Asset) !== null);
if (check) {
  console.log(
    missing.length === 0
      ? `seed-thumbs: every picture of ${deckDir} that qualifies has its copy`
      : `seed-thumbs: ${missing.length} picture(s) without a copy: ${missing.join(', ')}`,
  );
  process.exit(missing.length === 0 ? 0 : 1);
}
if (missing.length === 0) {
  console.log(`seed-thumbs: nothing to write in ${deckDir}`);
  process.exit(0);
}

let bytesWritten = 0;
for (const id of missing) {
  const asset = deck.assets[id] as Asset;
  const twin = source(asset) as string;
  const small = await smallCopy(readFileSync(join(deckDir, twin)), asset.size[0]);
  if (small === null) continue;
  const file = `assets/${id}.${assetDigest(small.bytes)}-w${ASSET_THUMB_WIDTH}.webp`;
  if (!existsSync(join(deckDir, file))) writeFileSync(join(deckDir, file), small.bytes);
  bytesWritten += small.bytes.byteLength;
  // the schema's parser emits the keys in schema order, as canonical JSON writes them (SPEC 4.1)
  deck.assets[id] = assetSchema.parse({ ...asset, thumb: { file, size: small.size } }) as Asset;
  console.log(`seed-thumbs: ${id} ${asset.size.join('x')} -> ${file} ${small.size.join('x')}`);
}

const before = deck.updatedAt;
deck.revision += 1;
deck.updatedAt = new Date().toISOString();
writeFileSync(deckPath, json(deck));
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { importedAt?: string };
  if (report.importedAt === before) {
    report.importedAt = deck.updatedAt;
    writeFileSync(reportPath, json(report));
  }
}
console.log(
  `seed-thumbs: ${missing.length} copies, ${Math.round(bytesWritten / 1024)} KB; ${deckDir} at revision ${deck.revision}`,
);
