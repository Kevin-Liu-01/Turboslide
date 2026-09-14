// Comments (gslides-parity SPEC-3 5.1, 5.2, 0.10; research-3 08 1): a sidecar per deck, never
// document data, never in the version log, the undo stack, a snapshot, the standalone build or the
// view payload. Threads anchor to the deck, a slide, a block, a text range, a table cell or the
// notes; `resolveAnchor` is pure and runs at read time, so a removed block orphans its threads
// without a write and an undo revives them. Text anchors shift under `text.splice` through
// `shiftAnchors`, emitted as `comment.shift` entries (0.52). The types are the ones report 08 1.1
// writes; nothing in deck.ts, blocks.ts or mutations.ts changes for them.
import { z } from 'zod';
import type { Block } from './blocks.ts';
import { blockTextPaths } from './catalog.ts';
import type { DeckDocument, Slide } from './deck.ts';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';
import type { Mutation } from './mutations.ts';
import { getAt } from './pointer.ts';
import { plainLength, plainOf } from './text.ts';
import { shiftRange } from './transform.ts';

// ---------------------------------------------------------------------------------------------
// Identifiers and caps

/** A 26 character lower case Crockford base32 ULID: time ordered, so a list sorted by id is sorted by creation. */
export const ULID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;
export const threadIdSchema = z.string().regex(ULID_PATTERN, 'a 26 character lower case ULID');
export const commentIdSchema = threadIdSchema;

/**
 * A principal id (SPEC-3 0.17): `anon_<uuid>` for a sealed cookie, `usr_<id>` for an account,
 * `agent:<tokenId>` for an API key. A checkout's file store author is `local:<name>`. The schema
 * refuses control characters and bidi controls and nothing else, so the identity package owns the
 * formats; `principalKind` reads them.
 */
export const PRINCIPAL_ID_PATTERN =
  /^(anon_[0-9a-f-]{36}|usr_[A-Za-z0-9_-]+|agent:[A-Za-z0-9_.-]+|local:.+)$/;
export const principalIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !CONTROL_OR_BIDI.test(value), 'a principal id without control characters');

export type PrincipalKind = 'anonymous' | 'account' | 'agent' | 'local' | 'unknown';

export function principalKind(principalId: string): PrincipalKind {
  if (principalId.startsWith('anon_')) return 'anonymous';
  if (principalId.startsWith('usr_')) return 'account';
  if (principalId.startsWith('agent:')) return 'agent';
  if (principalId.startsWith('local:')) return 'local';
  return 'unknown';
}

/** The caps of 08 1.3. */
export const COMMENT_CAPS = {
  bodyCodePoints: 4000,
  mentions: 20,
  replies: 100,
  threadsPerSlide: 200,
  threadsPerDeck: 5000,
  quotedCodePoints: 200,
  labelCodePoints: 40,
} as const;

/** Control characters and the bidi controls a label or an id never carries (SPEC-3 0.19). */
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

function codePoints(value: string): number {
  return [...value].length;
}

/** A display label as stored beside a comment: at most 40 code points, no control or bidi characters. */
export const labelSchema = z
  .string()
  .min(1)
  .refine((value) => codePoints(value) <= COMMENT_CAPS.labelCodePoints, 'at most 40 code points')
  .refine((value) => !CONTROL_OR_BIDI.test(value), 'no control or bidi characters in a label');

// ---------------------------------------------------------------------------------------------
// Anchors

/** The six anchor kinds (SPEC-3 5.1; 08 1.1 maps Google's to them). */
export type CommentAnchor =
  | { kind: 'deck' }
  | { kind: 'slide'; slideId: SlideId }
  | { kind: 'block'; slideId: SlideId; blockId: BlockId }
  | {
      kind: 'text';
      slideId: SlideId;
      blockId: BlockId;
      /** A Text pointer of the block's catalog (`/text`, `/items/3/text`). */
      path: string;
      /** [start, end] in the plain text of the Text, one character per paragraph break. */
      range: [number, number];
      /** The plain text the range covered when the thread was made, at most 200 code points. */
      quoted: string;
    }
  | { kind: 'cell'; slideId: SlideId; blockId: BlockId; cell: [number, number] }
  | { kind: 'notes'; slideId: SlideId };

export type CommentAnchorKind = CommentAnchor['kind'];
export const COMMENT_ANCHOR_KINDS = ['deck', 'slide', 'block', 'text', 'cell', 'notes'] as const;

const textPointer = z.string().regex(/^\/.+/, 'a JSON pointer into the block');
const plainRange = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

export const commentAnchorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('deck') }),
  z.strictObject({ kind: z.literal('slide'), slideId: slugSchema }),
  z.strictObject({ kind: z.literal('block'), slideId: slugSchema, blockId: blockIdSchema }),
  z.strictObject({
    kind: z.literal('text'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    path: textPointer,
    range: plainRange.refine(([start, end]) => start <= end, 'start at or before end'),
    quoted: z
      .string()
      .refine(
        (value) => codePoints(value) <= COMMENT_CAPS.quotedCodePoints,
        'at most 200 code points',
      ),
  }),
  z.strictObject({
    kind: z.literal('cell'),
    slideId: slugSchema,
    blockId: blockIdSchema,
    cell: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  }),
  z.strictObject({ kind: z.literal('notes'), slideId: slugSchema }),
]) satisfies z.ZodType<CommentAnchor>;

/** The slide an anchor names, if any. */
export function anchorSlideId(anchor: CommentAnchor): SlideId | undefined {
  return anchor.kind === 'deck' ? undefined : anchor.slideId;
}

// ---------------------------------------------------------------------------------------------
// Authors, mentions, bodies, reactions

/** Who wrote a comment: the principal plus the label at the time (03 E2). */
export type CommentAuthor = { principalId: string; label: string; kind: 'human' | 'agent' };

export const commentAuthorSchema = z.strictObject({
  principalId: principalIdSchema,
  label: labelSchema,
  kind: z.enum(['human', 'agent']),
}) satisfies z.ZodType<CommentAuthor>;

/** A mention inside a body: a principal, or an invitation the share dialog issued (SPEC-3 5.4). */
export type Mention =
  { kind: 'principal'; principalId: string } | { kind: 'invite'; inviteId: string };

export const mentionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('principal'), principalId: principalIdSchema }),
  z.strictObject({ kind: z.literal('invite'), inviteId: z.string().min(1).max(200) }),
]) satisfies z.ZodType<Mention>;

/** The body is plain text; `{@n}` tokens name `mentions[n]`. Never markup. */
export type CommentBody = { text: string; mentions: Mention[] };

const MENTION_TOKEN = /\{@(\d+)\}/g;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * The refinement of 08 1.1: every `{@n}` names an existing mention and no other `{` appears, so a
 * body can never smuggle markup or an unresolved token.
 */
export function bodyProblem(body: CommentBody): string | null {
  if (codePoints(body.text) > COMMENT_CAPS.bodyCodePoints)
    return 'the body is over 4,000 code points';
  if (BODY_CONTROL.test(body.text)) return 'the body carries a control character';
  let cursor = 0;
  while (cursor < body.text.length) {
    const brace = body.text.indexOf('{', cursor);
    if (brace < 0) break;
    const match = /^\{@(\d+)\}/.exec(body.text.slice(brace));
    if (match === null) return `an unresolved token at ${brace}: a brace opens only a {@n} mention`;
    const index = Number(match[1]);
    if (index >= body.mentions.length) return `the token {@${index}} names no mention`;
    cursor = brace + match[0].length;
  }
  return null;
}

export const commentBodySchema = z
  .strictObject({
    text: z.string(),
    mentions: z.array(mentionSchema).max(COMMENT_CAPS.mentions),
  })
  .refine((body) => bodyProblem(body) === null, {
    message: 'a body of at most 4,000 code points whose {@n} tokens each name a mention',
  }) satisfies z.ZodType<CommentBody>;

/** The mention indexes a body names, in order of appearance, once each. */
export function mentionedIndexes(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const index = Number(match[1]);
    if (!out.includes(index)) out.push(index);
  }
  return out;
}

/** The 24 reactions (SPEC-3 5.1): the palette is data, so a reaction never carries free text. */
export const EMOJI_PALETTE = [
  '👍',
  '👎',
  '❤️',
  '🎉',
  '😂',
  '😮',
  '😢',
  '🙏',
  '👀',
  '✅',
  '❌',
  '🔥',
  '💯',
  '🚀',
  '👏',
  '🤔',
  '⭐',
  '💡',
  '⚠️',
  '❓',
  '➕',
  '➖',
  '🙌',
  '😍',
] as const;
export type Emoji = (typeof EMOJI_PALETTE)[number];
export const emojiSchema = z.enum(EMOJI_PALETTE);

export type Reaction = { emoji: Emoji; principalIds: string[] };

export const reactionSchema = z.strictObject({
  emoji: emojiSchema,
  principalIds: z.array(principalIdSchema),
}) satisfies z.ZodType<Reaction>;

/** A stamp of who did something and when. */
export type Stamp = { at: string; by: string };
export const stampSchema = z.strictObject({
  at: z.string(),
  by: principalIdSchema,
}) satisfies z.ZodType<Stamp>;

export type Comment = {
  id: string;
  author: CommentAuthor;
  createdAt: string;
  editedAt?: string;
  body: CommentBody;
  reactions?: Reaction[];
  /** A tombstone keeps the slot and the replies; the body is gone from every read (30 day restore). */
  deleted?: Stamp;
};

export const commentSchema = z.strictObject({
  id: commentIdSchema,
  author: commentAuthorSchema,
  createdAt: z.string(),
  editedAt: z.string().optional(),
  body: commentBodySchema,
  reactions: z.array(reactionSchema).max(EMOJI_PALETTE.length).optional(),
  deleted: stampSchema.optional(),
}) satisfies z.ZodType<Comment>;

/** An assignment (Google's action item): who, by whom, when, and the done stamp. */
export type Assignment = { to: Mention; by: string; at: string; done?: Stamp };

export const assignmentSchema = z.strictObject({
  to: mentionSchema,
  by: principalIdSchema,
  at: z.string(),
  done: stampSchema.optional(),
}) satisfies z.ZodType<Assignment>;

export type Thread = {
  id: string;
  deckId: string;
  anchor: CommentAnchor;
  /** The first comment is the thread's own; `replies` follow in order. */
  comment: Comment;
  replies: Comment[];
  resolved?: Stamp;
  assignee?: Assignment;
  createdAt: string;
  updatedAt: string;
  /** The comments revision that last touched this thread (08 2.4), independent of deck.revision. */
  revision: number;
};

export const threadSchema = z.strictObject({
  id: threadIdSchema,
  deckId: slugSchema,
  anchor: commentAnchorSchema,
  comment: commentSchema,
  replies: z.array(commentSchema).max(COMMENT_CAPS.replies),
  resolved: stampSchema.optional(),
  assignee: assignmentSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
}) satisfies z.ZodType<Thread>;

// ---------------------------------------------------------------------------------------------
// The sidecar (08 2.2): comments/index.json, comments/<threadId>.json, comments/authors.json

export type CommentsIndexRow = {
  id: string;
  slideId?: SlideId;
  kind: CommentAnchorKind;
  open: boolean;
  updatedAt: string;
  /** The comment count, replies included, tombstones excluded. */
  count: number;
  assignee?: Mention;
  /** The md5 etag of the thread file's bytes on the Blob store, the mirror's staleness proof. */
  etag?: string;
};

export type CommentsIndex = {
  schemaVersion: 1;
  deckId: string;
  /** The comments' own counter, bumped by every write. */
  revision: number;
  updatedAt: string;
  threads: CommentsIndexRow[];
};

export const commentsIndexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  deckId: slugSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  threads: z.array(
    z.strictObject({
      id: threadIdSchema,
      slideId: slugSchema.optional(),
      kind: z.enum(COMMENT_ANCHOR_KINDS),
      open: z.boolean(),
      updatedAt: z.string(),
      count: z.number().int().nonnegative(),
      assignee: mentionSchema.optional(),
      etag: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<CommentsIndex>;

/** authors.json: principal id to the last label and kind seen, the PPTX author list's source. */
export type CommentAuthors = Record<string, { label: string; kind: 'human' | 'agent' }>;

export const commentAuthorsSchema = z.record(
  principalIdSchema,
  z.strictObject({ label: labelSchema, kind: z.enum(['human', 'agent']) }),
) satisfies z.ZodType<CommentAuthors>;

/** The index row of a thread. */
export function indexRowOf(thread: Thread): CommentsIndexRow {
  const count =
    (thread.comment.deleted === undefined ? 1 : 0) +
    thread.replies.filter((reply) => reply.deleted === undefined).length;
  const slideId = anchorSlideId(thread.anchor);
  return {
    id: thread.id,
    ...(slideId !== undefined ? { slideId } : {}),
    kind: thread.anchor.kind,
    open: thread.resolved === undefined,
    updatedAt: thread.updatedAt,
    count,
    ...(thread.assignee !== undefined ? { assignee: thread.assignee.to } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// The stream entries (SPEC-3 5.2): kind 'comment' ops, each commuting or with one winner

export type CommentOp =
  | { op: 'add'; thread: Thread }
  | { op: 'reply'; threadId: string; comment: Comment }
  | {
      op: 'edit';
      threadId: string;
      commentId: string;
      body: CommentBody;
      editedAt: string;
      by: string;
      /** The thread's updatedAt the caller read; 409 when the thread moved (08 3.2). */
      expectedUpdatedAt?: string;
    }
  | { op: 'delete'; threadId: string; commentId: string; at: string; by: string; restore?: true }
  | { op: 'resolve'; threadId: string; at: string; by: string }
  | { op: 'reopen'; threadId: string; at: string; by: string }
  | { op: 'assign'; threadId: string; to: Mention | null; at: string; by: string }
  | { op: 'reassign'; threadId: string; to: Mention; at: string; by: string }
  | { op: 'done'; threadId: string; at: string; by: string }
  | { op: 'react'; threadId: string; commentId: string; emoji: Emoji; principalId: string }
  | { op: 'unreact'; threadId: string; commentId: string; emoji: Emoji; principalId: string }
  | {
      op: 'move';
      threadId: string;
      anchor: CommentAnchor;
      at: string;
      by: string;
      expectedUpdatedAt?: string;
    }
  /** The anchor after a text op moved it (0.52); emitted by the admission or the file store, never by a person. */
  | { op: 'shift'; threadId: string; anchor: CommentAnchor };

export type CommentOpName = CommentOp['op'];
export const COMMENT_OPS = [
  'add',
  'reply',
  'edit',
  'delete',
  'resolve',
  'reopen',
  'assign',
  'reassign',
  'done',
  'react',
  'unreact',
  'move',
  'shift',
] as const satisfies ReadonlyArray<CommentOpName>;

const stamped = { at: z.string(), by: principalIdSchema };

export const commentOpSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), thread: threadSchema }),
  z.strictObject({ op: z.literal('reply'), threadId: threadIdSchema, comment: commentSchema }),
  z.strictObject({
    op: z.literal('edit'),
    threadId: threadIdSchema,
    commentId: commentIdSchema,
    body: commentBodySchema,
    editedAt: z.string(),
    by: principalIdSchema,
    expectedUpdatedAt: z.string().optional(),
  }),
  z.strictObject({
    op: z.literal('delete'),
    threadId: threadIdSchema,
    commentId: commentIdSchema,
    ...stamped,
    restore: z.literal(true).optional(),
  }),
  z.strictObject({ op: z.literal('resolve'), threadId: threadIdSchema, ...stamped }),
  z.strictObject({ op: z.literal('reopen'), threadId: threadIdSchema, ...stamped }),
  z.strictObject({
    op: z.literal('assign'),
    threadId: threadIdSchema,
    to: mentionSchema.nullable(),
    ...stamped,
  }),
  z.strictObject({
    op: z.literal('reassign'),
    threadId: threadIdSchema,
    to: mentionSchema,
    ...stamped,
  }),
  z.strictObject({ op: z.literal('done'), threadId: threadIdSchema, ...stamped }),
  z.strictObject({
    op: z.literal('react'),
    threadId: threadIdSchema,
    commentId: commentIdSchema,
    emoji: emojiSchema,
    principalId: principalIdSchema,
  }),
  z.strictObject({
    op: z.literal('unreact'),
    threadId: threadIdSchema,
    commentId: commentIdSchema,
    emoji: emojiSchema,
    principalId: principalIdSchema,
  }),
  z.strictObject({
    op: z.literal('move'),
    threadId: threadIdSchema,
    anchor: commentAnchorSchema,
    ...stamped,
    expectedUpdatedAt: z.string().optional(),
  }),
  z.strictObject({ op: z.literal('shift'), threadId: threadIdSchema, anchor: commentAnchorSchema }),
]) satisfies z.ZodType<CommentOp>;

// ---------------------------------------------------------------------------------------------
// Resolution at read time (08 1.2)

export type OrphanReason =
  | 'slide removed'
  | 'block removed'
  | 'text removed'
  | 'path missing'
  | 'cell missing'
  | 'range outside';

/**
 * Where an anchor lands on the document now. `text` carries the current plain characters of the
 * range (clamped to the Text) so a reader sees what is commented on after the words moved; an
 * orphan keeps the anchor (and its `quoted`) so the panel lists it under its slide and a later
 * undo revives it without a write.
 */
export type AnchorResolution =
  | {
      orphaned: false;
      anchor: CommentAnchor;
      slideId?: SlideId;
      blockId?: BlockId;
      /** The block's slot list pointer, `/slots/left` or `/plate/blocks`, for the marker. */
      pointer?: string;
      /** The current plain text of a text anchor's range, clamped to the Text. */
      text?: string;
      /** The anchor cell of a merged cell, when the anchor named a covered cell. */
      cell?: [number, number];
    }
  | { orphaned: true; reason: OrphanReason; anchor: CommentAnchor; slideId?: SlideId };

export const anchorResolutionSchema = z.union([
  z.strictObject({
    orphaned: z.literal(false),
    anchor: commentAnchorSchema,
    slideId: slugSchema.optional(),
    blockId: blockIdSchema.optional(),
    pointer: z.string().optional(),
    text: z.string().optional(),
    cell: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  }),
  z.strictObject({
    orphaned: z.literal(true),
    reason: z.enum([
      'slide removed',
      'block removed',
      'text removed',
      'path missing',
      'cell missing',
      'range outside',
    ]),
    anchor: commentAnchorSchema,
    slideId: slugSchema.optional(),
  }),
]) satisfies z.ZodType<AnchorResolution>;

type Located = { block: Block; pointer: string };

/** The top level block by id in any slot or the plate, with its list pointer. */
function locateTopBlock(slide: Slide, blockId: BlockId): Located | undefined {
  if (slide.kind === 'content') {
    for (const [slot, list] of Object.entries(slide.slots)) {
      const block = list.find((row) => row.id === blockId);
      if (block !== undefined) return { block, pointer: `/slots/${slot}` };
    }
    return undefined;
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    const block = slide.plate.blocks.find((row) => row.id === blockId);
    if (block !== undefined) return { block, pointer: '/plate/blocks' };
  }
  return undefined;
}

/** The pure resolution of 08 1.2, run at read time by the panel, the markers, the exporter and comment.list. */
export function resolveAnchor(document: DeckDocument, anchor: CommentAnchor): AnchorResolution {
  if (anchor.kind === 'deck') return { orphaned: false, anchor };
  const slide = document.slides[anchor.slideId];
  if (slide === undefined) {
    return { orphaned: true, reason: 'slide removed', anchor, slideId: anchor.slideId };
  }
  if (anchor.kind === 'slide' || anchor.kind === 'notes') {
    return { orphaned: false, anchor, slideId: anchor.slideId };
  }
  const located = locateTopBlock(slide, anchor.blockId);
  if (located === undefined) {
    return { orphaned: true, reason: 'block removed', anchor, slideId: anchor.slideId };
  }
  const base = {
    orphaned: false as const,
    anchor,
    slideId: anchor.slideId,
    blockId: anchor.blockId,
    pointer: located.pointer,
  };
  if (anchor.kind === 'block') return base;
  if (anchor.kind === 'cell') {
    const block = located.block;
    if (block.type !== 'table') {
      return { orphaned: true, reason: 'cell missing', anchor, slideId: anchor.slideId };
    }
    const [row, column] = anchor.cell;
    const cells = block.rows[row]?.cells;
    if (cells === undefined || column >= cells.length) {
      return { orphaned: true, reason: 'cell missing', anchor, slideId: anchor.slideId };
    }
    // a covered cell resolves to the anchor cell of its span (blocks/table.ts spans)
    const span = (block.spans ?? []).find(
      (entry) =>
        row >= entry.row &&
        row < entry.row + entry.rows &&
        column >= entry.column &&
        column < entry.column + entry.columns,
    );
    const cell: [number, number] = span === undefined ? [row, column] : [span.row, span.column];
    return { ...base, cell };
  }
  // text
  if (!blockTextPaths(located.block).includes(anchor.path)) {
    return { orphaned: true, reason: 'path missing', anchor, slideId: anchor.slideId };
  }
  const value = getAt(located.block, anchor.path);
  if (typeof value !== 'string') {
    return { orphaned: true, reason: 'path missing', anchor, slideId: anchor.slideId };
  }
  const length = plainLength(value);
  const [start, rawEnd] = anchor.range;
  const end = Math.min(rawEnd, length);
  if (start >= length && !(start === 0 && length === 0)) {
    return { orphaned: true, reason: 'range outside', anchor, slideId: anchor.slideId };
  }
  if (end <= start) {
    return { orphaned: true, reason: 'text removed', anchor, slideId: anchor.slideId };
  }
  return { ...base, text: plainOf(value).slice(start, end) };
}

// ---------------------------------------------------------------------------------------------
// Anchor shifts (08 1.2; SPEC-3 0.52)

export type AnchorShift = { threadId: string; anchor: CommentAnchor };

export type ShiftOptions = {
  /** The document before the mutations, for whole Text rewrites re-placed by their quoted text. */
  before?: DeckDocument;
  /** The document after the mutations. */
  after?: DeckDocument;
};

function textOf(
  document: DeckDocument | undefined,
  anchor: Extract<CommentAnchor, { kind: 'text' }>,
): string | undefined {
  const slide = document?.slides[anchor.slideId];
  if (slide === undefined) return undefined;
  const located = locateTopBlock(slide, anchor.blockId);
  if (located === undefined) return undefined;
  const value = getAt(located.block, anchor.path);
  return typeof value === 'string' ? value : undefined;
}

/**
 * True when the mutation rewrites the whole Text an anchor names (an agent's `text.replace`, a
 * `block.set` of the pointer, a `slide.replace`): the string is last writer wins (SPEC-3 3.5) and
 * the anchor is re-placed by its quoted text.
 */
function rewritesText(
  mutation: Mutation,
  anchor: Extract<CommentAnchor, { kind: 'text' }>,
): boolean {
  switch (mutation.op) {
    case 'text.replace':
      return (
        mutation.slideId === anchor.slideId &&
        mutation.blockId === anchor.blockId &&
        mutation.path === anchor.path
      );
    case 'block.set':
      return (
        mutation.slideId === anchor.slideId &&
        mutation.blockId === anchor.blockId &&
        (anchor.path === mutation.path || anchor.path.startsWith(`${mutation.path}/`))
      );
    case 'slide.replace':
    case 'slide.set':
      return mutation.slideId === anchor.slideId;
    default:
      return false;
  }
}

/**
 * The anchors a mutation list moves (08 1.2): a `text.splice` shifts every text anchor on its
 * Text through `shiftRange` (an insert before moves both ends, inside grows the range, a delete
 * before shrinks the offsets, overlapping trims, covering collapses to [start, start], which
 * `resolveAnchor` reports as text removed while `quoted` is kept). A whole Text rewrite re-places
 * an anchor where its quoted text occurs exactly once in the new Text, else collapses it. Returns
 * the threads with their anchors moved and one shift entry per changed anchor, the
 * `comment.shift` entries the admission and the file store emit (0.52). Pure.
 */
export function shiftAnchors(
  threads: ReadonlyArray<Thread>,
  mutations: ReadonlyArray<Mutation>,
  options: ShiftOptions = {},
): { threads: Thread[]; shifts: AnchorShift[] } {
  const out: Thread[] = [];
  const shifts: AnchorShift[] = [];
  for (const thread of threads) {
    if (thread.anchor.kind !== 'text') {
      out.push(thread);
      continue;
    }
    let anchor = thread.anchor;
    for (const mutation of mutations) {
      if (
        mutation.op === 'text.splice' &&
        mutation.slideId === anchor.slideId &&
        mutation.blockId === anchor.blockId &&
        mutation.path === anchor.path
      ) {
        anchor = { ...anchor, range: shiftRange(anchor.range, mutation) };
        continue;
      }
      if (rewritesText(mutation, anchor)) {
        const next = textOf(options.after, anchor);
        if (next === undefined) continue;
        const plain = plainOf(next);
        const first = anchor.quoted === '' ? -1 : plain.indexOf(anchor.quoted);
        const again = first < 0 ? -1 : plain.indexOf(anchor.quoted, first + 1);
        anchor =
          first >= 0 && again < 0
            ? { ...anchor, range: [first, first + anchor.quoted.length] }
            : { ...anchor, range: [anchor.range[0], anchor.range[0]] };
      }
    }
    if (anchor.range[0] === thread.anchor.range[0] && anchor.range[1] === thread.anchor.range[1]) {
      out.push(thread);
      continue;
    }
    out.push({ ...thread, anchor });
    shifts.push({ threadId: thread.id, anchor });
  }
  return { threads: out, shifts };
}

/** The plain text a text anchor covers on a document, the `quoted` a new thread stores. */
export function quotedTextOf(
  document: DeckDocument,
  anchor: Omit<Extract<CommentAnchor, { kind: 'text' }>, 'quoted'>,
): string {
  const text = textOf(document, { ...anchor, quoted: '' });
  if (text === undefined) return '';
  const quoted = plainOf(text).slice(anchor.range[0], anchor.range[1]);
  return [...quoted].slice(0, COMMENT_CAPS.quotedCodePoints).join('');
}

// ---------------------------------------------------------------------------------------------
// The sidecar's reducer (SPEC-3 5.2): one implementation of every comment op for the checkout's
// file, the Blob sidecar and the room's checkpointer, so the same bytes land on every path (0.52)

/** How long a tombstoned comment can be restored (SPEC-3 5.3). */
export const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A comment op the reducer refused: the status is what every transport answers. */
export class CommentOpError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  readonly code: 'invalid_input' | 'forbidden' | 'not_found' | 'conflict';
  /** The thread as stored, for a 409 (08 3.2). */
  readonly current: Thread | undefined;

  constructor(
    status: 400 | 403 | 404 | 409,
    code: 'invalid_input' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
    current?: Thread,
  ) {
    super(message);
    this.name = 'CommentOpError';
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

function findComment(thread: Thread, commentId: string): Comment {
  if (thread.comment.id === commentId) return thread.comment;
  const reply = thread.replies.find((row) => row.id === commentId);
  if (reply === undefined) {
    throw new CommentOpError(404, 'not_found', `no comment ${commentId} in thread ${thread.id}`);
  }
  return reply;
}

/**
 * Applies one op to a thread (undefined for `add`) and returns the thread as stored, with
 * `updatedAt` and `revision` set by the caller's counter. Every op commutes or has one winner
 * (5.2): add and reply append (100 replies at most); edit is the author's alone and the later
 * arrival wins; delete is a tombstone that keeps the replies, restore lifts it inside 30 days;
 * resolve, reopen, assign, reassign and done are last writer wins; react and unreact keep a set
 * per emoji keyed by principal; move and shift replace the anchor, move refusing with 409 when
 * `expectedUpdatedAt` no longer matches. No op is refused for a stale base.
 */
export function applyCommentOp(
  thread: Thread | undefined,
  op: CommentOp,
  now: string,
  revision: number,
): Thread {
  if (op.op === 'add') {
    return { ...op.thread, updatedAt: op.thread.updatedAt || now, revision };
  }
  if (thread === undefined) {
    throw new CommentOpError(404, 'not_found', `no thread ${op.threadId}`);
  }
  const next: Thread = structuredClone(thread);
  switch (op.op) {
    case 'reply': {
      if (next.replies.length >= COMMENT_CAPS.replies) {
        throw new CommentOpError(
          400,
          'invalid_input',
          `a thread holds at most ${COMMENT_CAPS.replies} replies`,
        );
      }
      if (next.replies.some((row) => row.id === op.comment.id)) break; // an idempotent redelivery
      next.replies.push(op.comment);
      break;
    }
    case 'edit': {
      const target = findComment(next, op.commentId);
      if (target.author.principalId !== op.by) {
        throw new CommentOpError(403, 'forbidden', 'only the author may edit a comment');
      }
      if (op.expectedUpdatedAt !== undefined && op.expectedUpdatedAt !== thread.updatedAt) {
        throw new CommentOpError(409, 'conflict', 'the thread moved since it was read', thread);
      }
      target.body = op.body;
      target.editedAt = op.editedAt;
      break;
    }
    case 'delete': {
      const target = findComment(next, op.commentId);
      if (op.restore === true) {
        if (target.deleted === undefined) break;
        if (Date.parse(op.at) - Date.parse(target.deleted.at) > RESTORE_WINDOW_MS) {
          throw new CommentOpError(
            400,
            'invalid_input',
            'a comment can be restored within 30 days of its deletion',
          );
        }
        delete target.deleted;
        break;
      }
      target.deleted = { at: op.at, by: op.by };
      break;
    }
    case 'resolve':
      next.resolved = { at: op.at, by: op.by };
      break;
    case 'reopen':
      delete next.resolved;
      break;
    case 'assign':
      if (op.to === null) delete next.assignee;
      else next.assignee = { to: op.to, by: op.by, at: op.at };
      break;
    case 'reassign':
      next.assignee = { to: op.to, by: op.by, at: op.at };
      break;
    case 'done': {
      if (next.assignee === undefined) {
        throw new CommentOpError(400, 'invalid_input', 'the thread is not assigned');
      }
      next.assignee.done = { at: op.at, by: op.by };
      next.resolved = { at: op.at, by: op.by };
      break;
    }
    case 'react':
    case 'unreact': {
      const target = findComment(next, op.commentId);
      const reactions = target.reactions ?? [];
      const row = reactions.find((entry) => entry.emoji === op.emoji);
      if (op.op === 'react') {
        if (row === undefined) reactions.push({ emoji: op.emoji, principalIds: [op.principalId] });
        else if (!row.principalIds.includes(op.principalId)) row.principalIds.push(op.principalId);
      } else if (row !== undefined) {
        row.principalIds = row.principalIds.filter((id) => id !== op.principalId);
      }
      const kept = reactions.filter((entry) => entry.principalIds.length > 0);
      if (kept.length > 0) target.reactions = kept;
      else delete target.reactions;
      break;
    }
    case 'move': {
      if (op.expectedUpdatedAt !== undefined && op.expectedUpdatedAt !== thread.updatedAt) {
        throw new CommentOpError(409, 'conflict', 'the thread moved since it was read', thread);
      }
      next.anchor = op.anchor;
      break;
    }
    case 'shift':
      next.anchor = op.anchor;
      break;
    default:
      break;
  }
  next.updatedAt = now;
  next.revision = revision;
  return next;
}

/**
 * A thread as a reader sees it (SPEC-3 5.3): a tombstoned comment's body is gone, its slot and
 * the replies stay ("Comment deleted"); tombstoned replies leave the list unless the caller asks
 * for them. The stored file keeps every body for the 30 day restore.
 */
export function readableThread(thread: Thread, options: { includeDeleted?: boolean } = {}): Thread {
  const blank = (comment: Comment): Comment =>
    comment.deleted === undefined ? comment : { ...comment, body: { text: '', mentions: [] } };
  const replies = thread.replies
    .filter((reply) => options.includeDeleted === true || reply.deleted === undefined)
    .map(blank);
  return { ...thread, comment: blank(thread.comment), replies };
}

/** The principals a thread names: the authors, the mentions and the assignee. */
export function threadParticipants(thread: Thread): string[] {
  const out = new Set<string>();
  const comments = [thread.comment, ...thread.replies];
  for (const comment of comments) {
    out.add(comment.author.principalId);
    for (const mention of comment.body.mentions) {
      if (mention.kind === 'principal') out.add(mention.principalId);
    }
  }
  if (thread.assignee?.to.kind === 'principal') out.add(thread.assignee.to.principalId);
  return [...out];
}

/** True when a thread mentions or is assigned to a principal (comment.list forMe). */
export function threadIsFor(thread: Thread, principalId: string): boolean {
  if (thread.assignee?.to.kind === 'principal' && thread.assignee.to.principalId === principalId) {
    return true;
  }
  return [thread.comment, ...thread.replies].some((comment) =>
    comment.body.mentions.some(
      (mention) => mention.kind === 'principal' && mention.principalId === principalId,
    ),
  );
}
