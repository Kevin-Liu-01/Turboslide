// Templates and building blocks (gslides-parity SPEC-5 0.22, 0.23, 0.25, 4.1, 4.5): the gallery's
// three category headings, the nine building block categories with their labels (`unverified:
// true`, R02 b.1), and the two index records the home page, the panes and the actions read:
// `TemplateIndexEntry` (one row of `decks/templates/templates.json`) and `BuildingBlock` (one JSON
// file under `decks/templates/building-blocks/<category>/<id>.json`: positioned native blocks
// inside a 1326 by 642 box under one `pos.group` tag). The integrator landed the ids, the labels
// and the record shapes on day 0 as the seam of SPEC-5 1.6; from merge 1 the module is B3's
// (MILESTONES-5 B3 "Owns"), who fills the indexes and the reader.
import { z } from 'zod';
import type { Block } from './blocks.ts';
import { blockSchema } from './blocks.ts';
import { THEMES } from './deck.ts';
import { slugSchema } from './ids.ts';
import type { Position } from './position.ts';
import { groupPathOnGroup, groupSegments } from './position.ts';
import { contentBox } from './render.ts';

/** The gallery's three headings in Google's order (SPEC-5 0.23; a third party list, unverified). */
export const TEMPLATE_CATEGORIES = ['personal', 'work', 'education'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Readonly<Record<TemplateCategory, string>> = {
  personal: 'Personal',
  work: 'Work',
  education: 'Education',
};

/** The nine building block categories (SPEC-5 0.25; the labels `unverified: true`). */
export const BUILDING_BLOCK_CATEGORIES = [
  'agendas',
  'lists',
  'key-statistics',
  'quotes',
  'headlines',
  'text-callouts',
  'calls-to-action',
  'people',
  'cards',
] as const;
export type BuildingBlockCategory = (typeof BUILDING_BLOCK_CATEGORIES)[number];

export const BUILDING_BLOCK_CATEGORY_LABELS: Readonly<Record<BuildingBlockCategory, string>> = {
  agendas: 'Agendas',
  lists: 'Lists',
  'key-statistics': 'Key statistics',
  quotes: 'Quotes',
  headlines: 'Headlines',
  'text-callouts': 'Text callouts',
  'calls-to-action': 'Calls to action',
  people: 'People',
  cards: 'Cards',
};

/** The box a building block's blocks are positioned in: the GT content box (SPEC-5 0.25). */
export const BUILDING_BLOCK_BOX: readonly [number, number] = [1326, 642];

/** One row of `decks/templates/templates.json` (SPEC-5 4.1, 4.3). */
export type TemplateIndexEntry = {
  /** the template id, the folder under decks/templates and the `deck.create --from` value */
  id: string;
  name: string;
  category: TemplateCategory;
  description?: string;
  /** the cover picture the gallery card shows, relative to the template folder */
  cover?: string;
  useCases?: string[];
  slides: number;
  theme: (typeof THEMES)[number];
};

/** One building block file (SPEC-5 0.25, 4.5). */
export type BuildingBlock = {
  /** `<category>/<id>`, the path under building-blocks/ */
  id: string;
  category: BuildingBlockCategory;
  label: string;
  /** the blocks with `pos` inside the 1326 by 642 box, sharing one `pos.group` tag */
  blocks: Block[];
  /** the width and height the blocks cover, for the pane's tile */
  box: [number, number];
};

export const templateIndexEntrySchema = z.strictObject({
  id: slugSchema,
  name: z.string().min(1).max(120),
  category: z.enum(TEMPLATE_CATEGORIES),
  description: z.string().max(400).optional(),
  cover: z.string().min(1).optional(),
  useCases: z.array(z.string().min(1).max(80)).max(8).optional(),
  slides: z.number().int().nonnegative(),
  theme: z.enum(THEMES),
}) satisfies z.ZodType<TemplateIndexEntry>;

/** `<category>/<slug>`. */
export const buildingBlockIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'a building block id: <category>/<slug>',
  );

export const buildingBlockSchema = z.strictObject({
  id: buildingBlockIdSchema,
  category: z.enum(BUILDING_BLOCK_CATEGORIES),
  label: z.string().min(1).max(120),
  blocks: z.array(blockSchema).min(1),
  box: z.tuple([z.number().positive(), z.number().positive()]),
}) satisfies z.ZodType<BuildingBlock>;

/** The pane's row: everything but the blocks themselves. */
export const buildingBlockSummarySchema = buildingBlockSchema.omit({ blocks: true });

// ---------------------------------------------------------------------------------------------
// Placement (SPEC-5 4.5; MILESTONES-5 B3 day 7): `buildingBlock.insert` lands a block's positioned
// blocks as one group at the content box or the point given, scaled by min(1, contentWidth / 1326)
// on a narrower page (B3 fills this half of the module).

/** The scale a building block takes on a page: one on the GT sheet, smaller on a narrower page. */
export function buildingBlockScale(page: { width: number; height: number }): number {
  const [, , width] = contentBox(page);
  return Math.min(1, width / BUILDING_BLOCK_BOX[0]);
}

/** The group tag a placed building block takes: the id's slug after the category. */
export function buildingBlockGroupTag(id: string): string {
  return id.split('/').pop() ?? id;
}

function freeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type PlaceBuildingBlockOptions = {
  page: { width: number; height: number };
  /** the top left in sheet px; the content box's when absent */
  at?: readonly [number, number];
  /** the block ids the slide holds already; a colliding id takes a `-2` suffix */
  takenIds?: ReadonlySet<string>;
  /** the group tags the slide holds already; the block's tag is freed against them */
  takenGroups?: ReadonlySet<string>;
  /** the z the first block takes; the rest follow in file order */
  z?: number;
};

export type PlacedBuildingBlock = { blocks: Block[]; group: string; scale: number };

/**
 * The blocks of a building block placed on a page: every `pos` is offset to `at` (the content
 * box's corner when absent) and scaled with the page, the ids are freed against the slide's, the
 * shared `block` tag becomes one fresh group tag (a nested path inside the record keeps its inner
 * segments under the new tag), and the z values run from `z` in file order.
 */
export function placeBuildingBlock(
  record: BuildingBlock,
  options: PlaceBuildingBlockOptions,
): PlacedBuildingBlock {
  const scale = buildingBlockScale(options.page);
  const [cx, cy] = contentBox(options.page);
  const [ax, ay] = options.at ?? [cx, cy];
  const taken = new Set(options.takenIds ?? []);
  const group = freeName(buildingBlockGroupTag(record.id), options.takenGroups ?? new Set());
  const z0 = options.z ?? 0;
  const round = (value: number): number => Math.round(value * 100) / 100;
  const blocks = record.blocks.map((block, index) => {
    const id = freeName(block.id, taken);
    taken.add(id);
    const pos = block.pos as Position | undefined;
    const copy = JSON.parse(JSON.stringify(block)) as Block;
    copy.id = id;
    if (pos !== undefined) {
      const inner = pos.group === undefined ? [] : groupSegments(pos.group).slice(1);
      const path = inner.length === 0 ? group : groupPathOnGroup(inner.join('/'), group);
      copy.pos = {
        ...pos,
        x: round(ax + pos.x * scale),
        y: round(ay + pos.y * scale),
        w: round(pos.w * scale),
        h: round(pos.h * scale),
        z: z0 + index,
        group: path,
      };
    }
    if (copy.type === 'rule' && copy.length !== undefined) copy.length = round(copy.length * scale);
    return copy;
  });
  return { blocks, group, scale };
}
