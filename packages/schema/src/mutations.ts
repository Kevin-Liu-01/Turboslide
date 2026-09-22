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
import type { CaseMode, RunFlagKey, RunFlags, Text } from './text.ts';
import { CASE_MODES, RUN_FLAG_KEYS, multilineTextSchema, runFlagsSchema } from './text.ts';

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
  /**
   * Typing, coalesced; range is [start, end) in the markup string at `path`. Kept for every stored
   * record, the replay paths and the agents that still send it (gslides-parity SPEC-3 0.4); a whole
   * value write at admission. `blockId` may name a slide field (`slideFieldOf`) with `path` the
   * field's own pointer, as for `text.splice`.
   */
  | {
      op: 'text.replace';
      slideId: SlideId;
      blockId: BlockId;
      path: string;
      range: [number, number];
      text: Text;
    }
  /**
   * Typing on the multiplayer path (gslides-parity SPEC-3 3.1): `remove` plain characters at `at`
   * leave and `insert` lands in their place with the flags of the run it continues (the rule of
   * insertAt). Offsets are plain text offsets with one character per paragraph break, the system
   * plainLength, placeRuns, styleRange and the comment anchors use. A `\n` in `insert` is a
   * paragraph break in the four multiline pointers and refused elsewhere by the validator after the
   * write. `flags` pins the run flags of the inserted characters instead (the room client sends
   * the caret's run, so two clients converge on the flags whatever order the server admits
   * concurrent edits in; the transform splits a concurrent mark around a pinned insertion).
   * Transformed at admission; the inverse is a splice.
   *
   * The target is a block's Text, or a slide field (the sync round, docs/SYNC.md 3.4): `blockId`
   * `heading` or `lead` on a title slide and `big` on a statement slide name the field, with
   * `path` the field's own pointer (`/heading`, `/lead`, `/big`; `slideFieldPath`). The three
   * fields travelled as `slide.set` of the whole value before, so two people typing into a cover
   * lost each other's words (audit-ordering item 1); as text runs they are transformed on both
   * sides like a block's text. The reducer resolves the target by the slide's kind
   * (`slideFieldOf`), so a content slide's block whose id happens to be `heading` is a block.
   */
  | {
      op: 'text.splice';
      slideId: SlideId;
      blockId: BlockId;
      path: string;
      at: number;
      remove: number;
      insert: string;
      flags?: RunFlags;
    }
  /**
   * Marks or a case change over a plain text range (gslides-parity SPEC-3 3.1): `marks` sets the
   * run flags of `set` and removes the keys of `clear` on every run of the range; `case` rewrites
   * the range's characters. Transformed as a range at admission; the inverse restores the previous
   * flags, or the previous characters for a case change.
   */
  | {
      op: 'text.mark';
      slideId: SlideId;
      blockId: BlockId;
      path: string;
      range: [number, number];
      edit: TextMarkEdit;
    }
  | { op: 'section.set'; sections: Section[] }
  | { op: 'asset.set'; asset: Asset }
  | { op: 'asset.remove'; assetId: AssetId }
  /** JSON pointer into the manifest; title, theme and defaults only (trashedAt is deck.trash's, gslides-parity SPEC 7.2.5) */
  | { op: 'deck.set'; path: string; value?: unknown }
  /** restore is a mutation, so it is undoable and visible */
  | { op: 'version.restore'; n: number };

/** What text.mark carries: flags to set and clear, or a case mode (gslides-parity SPEC-3 3.1). */
export type TextMarkEdit =
  { kind: 'marks'; set?: RunFlags; clear?: RunFlagKey[] } | { kind: 'case'; mode: CaseMode };

export type MutationOp = Mutation['op'];

/**
 * The slide fields a person types into that are not blocks (docs/SYNC.md 3.4): the heading and
 * the lead of a title slide, the big text of a statement slide. A text op names one with
 * `blockId` the field and `path` the field's pointer.
 */
export const SLIDE_FIELD_IDS = ['heading', 'lead', 'big'] as const;
export type SlideFieldId = (typeof SLIDE_FIELD_IDS)[number];

/** The pointer a slide field's text op carries: `/heading`, `/lead` or `/big`. */
export function slideFieldPath(field: SlideFieldId): string {
  return `/${field}`;
}

/** True for the pointer of one of the three slide fields. */
export function isSlideFieldPath(path: string): path is `/${SlideFieldId}` {
  return path.startsWith('/') && (SLIDE_FIELD_IDS as ReadonlyArray<string>).includes(path.slice(1));
}

/**
 * The slide field a `blockId` names on a slide, by the slide's kind: `heading` and `lead` on a
 * title slide, `big` on a statement slide; null on any other slide, where the id is a block's
 * (a content slide may carry a block whose id is `heading`). The one rule the reducer, the
 * transform's callers and the client share (packages/viewer InlineText `isSlideField`).
 */
export function slideFieldOf(slide: { kind: string }, blockId: string): SlideFieldId | null {
  if (slide.kind === 'title' && (blockId === 'heading' || blockId === 'lead')) return blockId;
  if (slide.kind === 'statement' && blockId === 'big') return blockId;
  return null;
}

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
  'text.splice',
  'text.mark',
  'section.set',
  'asset.set',
  'asset.remove',
  'deck.set',
  'version.restore',
] as const satisfies ReadonlyArray<MutationOp>;

/** The two ops of the multiplayer text path, the ones the admission transforms (SPEC-3 3.4). */
export const TEXT_OPS = ['text.splice', 'text.mark'] as const satisfies ReadonlyArray<MutationOp>;
export type TextOp = Extract<Mutation, { op: (typeof TEXT_OPS)[number] }>;
export type SpliceMutation = Extract<Mutation, { op: 'text.splice' }>;
export type MarkMutation = Extract<Mutation, { op: 'text.mark' }>;

/**
 * Who wrote something. CLI and MCP: --author agent:<runId>. `principalId` is the identity the
 * server derived from the session or the token record (gslides-parity SPEC-3 0.17: `anon_<uuid>`,
 * `usr_<id>` or `agent:<tokenId>`); absent on every record written before round three, which
 * renders by its label.
 */
export type Author = {
  kind: 'human' | 'agent';
  name: string;
  runId?: string;
  principalId?: string;
};
/**
 * Who first sent a write, so a record names its origin (docs/SYNC.md 3.2, invariant 3): the
 * server issued client id of the tab and the op ids the write folded, in the order the client
 * posted them. The blob channel fills it from the POST's entries and the store carries it onto
 * the version record (`VersionRecord.origin`, packages/store), so a resend of the same op ids on
 * any instance is answered with the seq the first admission made and never committed twice, and
 * a tab acknowledges its own echo by id. Absent on a write made outside a room (the CLI, an
 * agent's strict write, a named version) and on every record written before the round.
 */
export type WriteOrigin = { clientId: string; opIds: string[] };

export type Write = {
  baseRevision: number;
  author: Author;
  note?: string;
  mutations: Mutation[];
  /** the room client and op ids this write carries; the channel's, never a caller's (`WriteOrigin`) */
  origin?: WriteOrigin;
};
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
export const BLOCK_SLOTS = [...SLOT_NAMES, 'plate'] as const;
export const blockSlotSchema = z.enum(BLOCK_SLOTS);

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
    // a typed paragraph break is a character here; the validator refuses it outside the four
    // multiline pointers after the write (gslides-parity SPEC 7.4)
    text: multilineTextSchema,
  }),
  z.strictObject({
    op: z.literal('text.splice'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    path: pointer,
    at: z.number().int().nonnegative(),
    remove: z.number().int().nonnegative(),
    // plain text; a `\n` is a paragraph break, refused outside the four multiline pointers by the
    // validator after the write (gslides-parity SPEC 7.4)
    insert: z.string().refine((value) => !/\r/.test(value), 'a splice inserts no \\r'),
    flags: runFlagsSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('text.mark'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    path: pointer,
    range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    edit: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('marks'),
        set: runFlagsSchema.optional(),
        clear: z.array(z.enum(RUN_FLAG_KEYS)).optional(),
      }),
      z.strictObject({ kind: z.literal('case'), mode: z.enum(CASE_MODES) }),
    ]),
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
  principalId: z.string().min(1).optional(),
}) satisfies z.ZodType<Author>;

/**
 * A write's origin as a record stores it (`WriteOrigin`): the client id and at least one op id,
 * each bounded the way the room protocol bounds them. The store's tolerant record parser extends
 * `versionSchema` with this as an optional field (docs/SYNC.md 3.2, deployment N tolerates it
 * before N plus 1 writes it); `writeSchema` below stays closed to it on purpose, since an agent's
 * `deck.write` never carries one.
 */
export const writeOriginSchema = z.strictObject({
  clientId: z.string().min(1).max(64),
  opIds: z.array(z.string().min(1).max(64)).min(1),
}) satisfies z.ZodType<WriteOrigin>;

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
