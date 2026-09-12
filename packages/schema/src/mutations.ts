// Mutations, writes, versions and leases (SPEC 4.2 "Mutations"). A designer's gesture and an
// agent's call both become a Write: a list of mutations applied atomically against a
// baseRevision. Restore is a mutation, so it is undoable and visible in History (SPEC 6.7).
import { z } from 'zod';
import type { Asset } from './assets.ts';
import { assetSchema } from './assets.ts';
import type { Block } from './blocks.ts';
import { blockSchema } from './blocks.ts';
import type { Section, Slide, SlotName } from './deck.ts';
import { SLOT_NAMES, sectionSchema, slideSchema } from './deck.ts';
import type { AssetId, BlockId, SectionId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';
import type { Text } from './text.ts';
import { textSchema } from './text.ts';

/** Where a block lives: a content slot, or the plate of a full-picture slide. */
export type BlockSlot = SlotName | 'plate';

export type Mutation =
  /** `after` absent inserts first in the section. */
  | { op: 'slide.insert'; sectionId: SectionId; after?: SlideId; slide: Slide }
  | { op: 'slide.remove'; slideId: SlideId }
  | { op: 'slide.move'; slideId: SlideId; sectionId: SectionId; after?: SlideId }
  /** JSON pointer into the slide; an absent value deletes the field. */
  | { op: 'slide.set'; slideId: SlideId; path: string; value?: unknown }
  /** what the source drawer's Apply emits */
  | { op: 'slide.replace'; slideId: SlideId; slide: Slide }
  /** `after` absent inserts first in the slot. */
  | { op: 'block.insert'; slideId: SlideId; slot: BlockSlot; after?: BlockId; block: Block }
  | { op: 'block.remove'; slideId: SlideId; blockId: BlockId }
  /** `z` sets the stacking order of a positioned block on a freeform slide (docs/freeform.md). */
  | {
      op: 'block.move';
      slideId: SlideId;
      blockId: BlockId;
      slot: BlockSlot;
      after?: BlockId;
      z?: number;
    }
  /** JSON pointer into the block; an absent value deletes the field. */
  | { op: 'block.set'; slideId: SlideId; blockId: BlockId; path: string; value?: unknown }
  /** typing, coalesced; range is [start, end) in the markup string at `path` */
  | {
      op: 'text.replace';
      slideId: SlideId;
      blockId: BlockId;
      path: string;
      range: [number, number];
      text: Text;
    }
  | { op: 'section.set'; sections: Section[] }
  | { op: 'asset.set'; asset: Asset }
  | { op: 'asset.remove'; assetId: AssetId }
  /** JSON pointer into the manifest; title, theme and defaults only */
  | { op: 'deck.set'; path: string; value?: unknown }
  /** restore is a mutation, so it is undoable and visible */
  | { op: 'version.restore'; n: number };

export type MutationOp = Mutation['op'];

export const MUTATION_OPS = [
  'slide.insert',
  'slide.remove',
  'slide.move',
  'slide.set',
  'slide.replace',
  'block.insert',
  'block.remove',
  'block.move',
  'block.set',
  'text.replace',
  'section.set',
  'asset.set',
  'asset.remove',
  'deck.set',
  'version.restore',
] as const satisfies ReadonlyArray<MutationOp>;

/** CLI and MCP: --author agent:<runId> */
export type Author = { kind: 'human' | 'agent'; name: string; runId?: string };
export type Write = { baseRevision: number; author: Author; note?: string; mutations: Mutation[] };
export type Version = {
  n: number;
  revision: number;
  author: Author;
  note: string;
  createdAt: string;
  mutations: Mutation[];
};
/** advisory in M3, enforced for agent writes in M4 */
export type Lease = { slideId: SlideId; holder: Author; until: string };

const pointer = z.string().regex(/^(\/.*)?$/, 'a JSON pointer');
const blockSlotSchema = z.enum([...SLOT_NAMES, 'plate']);

export const mutationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('slide.insert'),
    sectionId: slugSchema,
    after: slugSchema.optional(),
    slide: slideSchema,
  }),
  z.strictObject({ op: z.literal('slide.remove'), slideId: slugSchema }),
  z.strictObject({
    op: z.literal('slide.move'),
    slideId: slugSchema,
    sectionId: slugSchema,
    after: slugSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('slide.set'),
    slideId: slugSchema,
    path: pointer,
    // Zod 4 requires the key for a bare z.unknown(); optional() lets a deletion omit it.
    value: z.unknown().optional(),
  }),
  z.strictObject({ op: z.literal('slide.replace'), slideId: slugSchema, slide: slideSchema }),
  z.strictObject({
    op: z.literal('block.insert'),
    slideId: slugSchema,
    slot: blockSlotSchema,
    after: blockIdSchema.optional(),
    block: blockSchema,
  }),
  z.strictObject({ op: z.literal('block.remove'), slideId: slugSchema, blockId: blockIdSchema }),
  z.strictObject({
    op: z.literal('block.move'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    slot: blockSlotSchema,
    after: blockIdSchema.optional(),
    z: z.number().int().optional(),
  }),
  z.strictObject({
    op: z.literal('block.set'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    path: pointer,
    value: z.unknown().optional(),
  }),
  z.strictObject({
    op: z.literal('text.replace'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    path: pointer,
    range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    text: textSchema,
  }),
  z.strictObject({ op: z.literal('section.set'), sections: z.array(sectionSchema) }),
  z.strictObject({ op: z.literal('asset.set'), asset: assetSchema }),
  z.strictObject({ op: z.literal('asset.remove'), assetId: slugSchema }),
  z.strictObject({ op: z.literal('deck.set'), path: pointer, value: z.unknown().optional() }),
  z.strictObject({ op: z.literal('version.restore'), n: z.number().int().positive() }),
]) satisfies z.ZodType<Mutation>;

export const authorSchema = z.strictObject({
  kind: z.enum(['human', 'agent']),
  name: z.string().min(1),
  runId: z.string().optional(),
}) satisfies z.ZodType<Author>;

export const writeSchema = z.strictObject({
  baseRevision: z.number().int().nonnegative(),
  author: authorSchema,
  note: z.string().optional(),
  mutations: z.array(mutationSchema).min(1),
}) satisfies z.ZodType<Write>;

export const versionSchema = z.strictObject({
  n: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  author: authorSchema,
  note: z.string(),
  createdAt: z.string(),
  mutations: z.array(mutationSchema),
}) satisfies z.ZodType<Version>;

export const leaseSchema = z.strictObject({
  slideId: slugSchema,
  holder: authorSchema,
  until: z.string(),
}) satisfies z.ZodType<Lease>;

/** Parses `--author` values: 'agent:<runId>' is an agent, anything else a human name. */
export function parseAuthor(value: string): Author {
  const match = /^agent:(.+)$/.exec(value);
  if (match !== null && match[1] !== undefined) {
    return { kind: 'agent', name: 'agent', runId: match[1] };
  }
  return { kind: 'human', name: value };
}
