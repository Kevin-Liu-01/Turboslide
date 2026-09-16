// The building block files (gslides-parity SPEC-5 0.25, 4.5; MILESTONES-5 B3 day 7): one JSON
// record per block under `decks/templates/building-blocks/<category>/<id>.json` and the index of
// their summaries at `building-blocks/index.json`, both written by `decks/templates/build.ts` and
// committed. `buildingBlock.list` reads the index (the summaries, or the full records when the
// pane draws thumbnails), `buildingBlock.insert` reads one record and places it through the
// schema's `placeBuildingBlock`. The id is `<category>/<slug>`, so a path never leaves the folder.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BuildingBlock, BuildingBlockCategory } from '@turboslide/schema/building-blocks';
import {
  BUILDING_BLOCK_CATEGORIES,
  buildingBlockIdSchema,
  buildingBlockSchema,
  buildingBlockSummarySchema,
} from '@turboslide/schema/building-blocks';
import { canonicalJson, parseJson } from '@turboslide/schema/json';

import { templatesDir } from './templates.ts';

export const BUILDING_BLOCKS_DIR = 'building-blocks';
export const BUILDING_BLOCK_INDEX_FILE = 'index.json';

/** One row of the index: the record without its blocks. */
export type BuildingBlockSummary = Omit<BuildingBlock, 'blocks'>;

/** The folder: decks/templates/building-blocks. */
export function buildingBlocksDir(decksDir: string): string {
  return join(templatesDir(decksDir), BUILDING_BLOCKS_DIR);
}

/** A record from its JSON; a TypeError naming the file and the first issue when it does not parse. */
export function parseBuildingBlock(raw: unknown, file: string): BuildingBlock {
  const parsed = buildingBlockSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TypeError(
      `${file}: /${first?.path.map(String).join('/') ?? ''} ${first?.message ?? 'invalid'}`,
    );
  }
  return parsed.data;
}

/** The file of a block id, or a TypeError for an id that is not `<category>/<slug>`. */
export function buildingBlockFile(decksDir: string, id: string): string {
  const parsed = buildingBlockIdSchema.safeParse(id);
  if (!parsed.success)
    throw new TypeError(`"${id}" is not a building block id (<category>/<slug>)`);
  const [category, slug] = parsed.data.split('/') as [string, string];
  return join(buildingBlocksDir(decksDir), category, `${slug}.json`);
}

/** One record by id; a RangeError when the folder has no such file. */
export function readBuildingBlock(decksDir: string, id: string): BuildingBlock {
  const file = buildingBlockFile(decksDir, id);
  if (!existsSync(file))
    throw new RangeError(`No building block "${id}" under ${buildingBlocksDir(decksDir)}`);
  return parseBuildingBlock(parseJson(readFileSync(file, 'utf8'), file), file);
}

const CATEGORY_ORDER = new Map<string, number>(
  BUILDING_BLOCK_CATEGORIES.map((category, index) => [category, index]),
);

/** The index order: the nine categories in the pane's order, then the label. */
export function compareBuildingBlocks(
  a: Pick<BuildingBlock, 'category' | 'label'>,
  b: Pick<BuildingBlock, 'category' | 'label'>,
): number {
  const byCategory =
    (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99);
  return byCategory !== 0 ? byCategory : a.label.localeCompare(b.label);
}

/** Every record under the folder, one category or all, in index order. */
export function listBuildingBlocks(
  decksDir: string,
  category?: BuildingBlockCategory,
): BuildingBlock[] {
  const root = buildingBlocksDir(decksDir);
  if (!existsSync(root)) return [];
  const categories = category === undefined ? [...BUILDING_BLOCK_CATEGORIES] : [category];
  const out: BuildingBlock[] = [];
  for (const name of categories) {
    const dir = join(root, name);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const file = join(dir, entry.name);
      out.push(parseBuildingBlock(parseJson(readFileSync(file, 'utf8'), file), file));
    }
  }
  return out.sort(compareBuildingBlocks);
}

/** The summaries of every record, derived from the files. */
export function buildBuildingBlockIndex(decksDir: string): BuildingBlockSummary[] {
  return listBuildingBlocks(decksDir).map(({ blocks: _blocks, ...summary }) => summary);
}

/** Writes `building-blocks/index.json` from the files and answers the rows. */
export function writeBuildingBlockIndex(decksDir: string): BuildingBlockSummary[] {
  const rows = buildBuildingBlockIndex(decksDir);
  const root = buildingBlocksDir(decksDir);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, BUILDING_BLOCK_INDEX_FILE), canonicalJson(rows));
  return rows;
}

/** The index rows: `index.json` when present and well formed, else derived from the files. */
export function readBuildingBlockIndex(
  decksDir: string,
  category?: BuildingBlockCategory,
): BuildingBlockSummary[] {
  const file = join(buildingBlocksDir(decksDir), BUILDING_BLOCK_INDEX_FILE);
  let rows: BuildingBlockSummary[] | undefined;
  if (existsSync(file)) {
    const raw = parseJson(readFileSync(file, 'utf8'), file);
    const parsed = buildingBlockSummarySchema.array().safeParse(raw);
    if (parsed.success) rows = parsed.data;
  }
  rows ??= buildBuildingBlockIndex(decksDir);
  return (category === undefined ? rows : rows.filter((row) => row.category === category)).sort(
    compareBuildingBlocks,
  );
}
