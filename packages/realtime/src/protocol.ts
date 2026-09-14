// The room protocol (gslides-parity SPEC-3 3.3, 3.8, 3.9): the shapes of what a client posts
// (`ops`, `presence`) and what the stream sends down, as zod schemas the routes parse with and
// the room client types against, plus the caps every implementation applies and the Server-Sent
// Events framing of one message. Browser safe: no `node:`, no framework.
import { z } from 'zod';

import { commentOpSchema as schemaCommentOpSchema } from '@turboslide/schema/comments';
import { blockIdSchema, slugSchema } from '@turboslide/schema/ids';
import { authorSchema, mutationSchema } from '@turboslide/schema/mutations';

import type {
  Entry,
  NewEntry,
  PresenceState,
  RoomEvent,
  RoomMutation,
  RosterEntry,
  RosterIdentity,
} from './channel.ts';
import { REALTIME_TIERS, REJECT_REASONS } from './channel.ts';

// ---------------------------------------------------------------------------------------------
// The numbers (SPEC-3 3.9)

/** entries per ops POST */
export const OPS_POST_MAX_ENTRIES = 64;
/** bytes per ops POST body */
export const OPS_POST_MAX_BYTES = 256 * 1024;
/** entries replayed per stream open; an older position answers `resync` (report 10 F25) */
export const REPLAY_MAX_ENTRIES = 2000;
/** bytes replayed per stream open */
export const REPLAY_MAX_BYTES = 1024 * 1024;
/** a `base.seq` further behind the head than this is a 409 `resync` (report 10 F28) */
export const BASE_SEQ_WINDOW = 500;
/** one presence state as JSON (report 10 F35) */
export const PRESENCE_MAX_BYTES = 2048;
export const PRESENCE_MAX_BLOCKS = 64;
export const SHEET_WIDTH = 1600;
export const SHEET_HEIGHT = 900;
/** live pointers are published for the first 20 clients by join order (Google's cap) */
export const LIVE_POINTERS_MAX = 20;
/** editing connections per deck; beyond it a tab opens in Viewing mode (SPEC-3 0.9) */
export const EDITING_TABS_MAX = 100;
/** the stream's heartbeat comment */
export const STREAM_HEARTBEAT_MS = 15_000;
/** the stream closes at a random point in this window so tabs never reconnect together (report 10 F24) */
export const STREAM_LIFETIME_MS: readonly [number, number] = [240_000, 290_000];
/** the `retry` field, drawn per stream */
export const STREAM_RETRY_MS: readonly [number, number] = [1000, 4000];
/** the client id binding and the stream counters live this long, refreshed by presence */
export const CLIENT_BINDING_TTL_MS = 320_000;
export const PRESENCE_BATCH_MS = 80;
export const PRESENCE_PER_SECOND = 15;
export const PRESENCE_HEARTBEAT_MS = 5000;
export const PRESENCE_STALE_MS = 30_000;
export const PRESENCE_EXPIRY_MS = 120_000;

// ---------------------------------------------------------------------------------------------
// Identifiers

/** 128 random bits as 32 hex characters, issued by the server in `hello` (report 10 F26). */
export const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/;
/** `<clientId>:<counter>` */
export const OP_ID_PATTERN = /^[0-9a-f]{32}:[0-9]{1,12}$/;

export const clientIdSchema = z.string().regex(CLIENT_ID_PATTERN, 'a server issued client id');
export const opIdSchema = z.string().regex(OP_ID_PATTERN, 'an operation id, <clientId>:<counter>');

const nonNegativeInt = z.number().int().nonnegative();
const pointer = z.string().regex(/^(\/.*)?$/, 'a JSON pointer');

// ---------------------------------------------------------------------------------------------
// The mutations the stream carries

/** SPEC-3 3.1 `text.splice`, the schema's own member since merge 1. */
export const textSpliceSchema = mutationSchema.options.find(
  (option) => option.shape.op.value === 'text.splice',
) as (typeof mutationSchema.options)[number];

/** SPEC-3 3.1 `text.mark`, the same. */
export const textMarkSchema = mutationSchema.options.find(
  (option) => option.shape.op.value === 'text.mark',
) as (typeof mutationSchema.options)[number];

/** Every mutation of the schema, the two text ops included. */
export const roomMutationSchema = mutationSchema satisfies z.ZodType<RoomMutation>;

/**
 * A comment operation as the stream carries it: the schema's discriminated union
 * (`@turboslide/schema/comments`, B1), so an op the schema does not know never enters the stream.
 */
export const commentOpSchema = schemaCommentOpSchema;

// ---------------------------------------------------------------------------------------------
// Entries

const entryKindSchema = z.enum(['edit', 'comment']);

/** an entry carries mutations when it is an edit and a comment op when it is a comment */
function hasPayload(entry: {
  kind: 'edit' | 'comment';
  mutations?: unknown[] | undefined;
  comment?: unknown;
}): boolean {
  return entry.kind === 'edit'
    ? entry.mutations !== undefined && entry.mutations.length > 0 && entry.comment === undefined
    : entry.comment !== undefined && entry.mutations === undefined;
}

const PAYLOAD_RULE = 'an edit carries mutations and a comment carries one comment op';

export const newEntrySchema = z
  .strictObject({
    rev: nonNegativeInt,
    kind: entryKindSchema,
    author: authorSchema,
    clientId: z.string().min(1).max(64),
    opId: z.string().min(1).max(64),
    mutations: z.array(roomMutationSchema).optional(),
    comment: commentOpSchema.optional(),
    at: z.string().min(1),
  })
  .refine(hasPayload, PAYLOAD_RULE) satisfies z.ZodType<NewEntry>;

export const entrySchema = z
  .strictObject({
    seq: z.number().int().positive(),
    rev: nonNegativeInt,
    kind: entryKindSchema,
    author: authorSchema,
    clientId: z.string().min(1).max(64),
    opId: z.string().min(1).max(64),
    mutations: z.array(roomMutationSchema).optional(),
    comment: commentOpSchema.optional(),
    at: z.string().min(1),
  })
  .refine(hasPayload, PAYLOAD_RULE) satisfies z.ZodType<Entry>;

// ---------------------------------------------------------------------------------------------
// Up: what a client posts

/** `POST /api/decks/:id/ops` (SPEC-3 3.3): at most 64 entries; the byte cap is the route's. */
export const opsPostSchema = z
  .strictObject({
    clientId: clientIdSchema,
    base: z.strictObject({ seq: nonNegativeInt }),
    entries: z
      .array(
        z
          .strictObject({
            opId: opIdSchema,
            kind: entryKindSchema,
            mutations: z.array(roomMutationSchema).optional(),
            comment: commentOpSchema.optional(),
          })
          .refine(hasPayload, PAYLOAD_RULE),
      )
      .min(1)
      .max(OPS_POST_MAX_ENTRIES),
  })
  .refine(
    (post) => post.entries.every((entry) => entry.opId.startsWith(`${post.clientId}:`)),
    'every opId is this client’s: <clientId>:<counter>',
  );

export type OpsPost = z.infer<typeof opsPostSchema>;

const caretSchema = z.strictObject({
  blockId: blockIdSchema,
  path: pointer,
  offset: nonNegativeInt.optional(),
  range: z.tuple([nonNegativeInt, nonNegativeInt]).optional(),
});

/**
 * The presence fields a client owns (SPEC-3 3.8). The identity fields are the server's and are
 * refused in the body: a strict object reports them as unrecognized keys, which the route answers
 * as `unknown_field` (report 10 F31).
 */
const presenceFields = {
  clientId: clientIdSchema,
  clock: nonNegativeInt,
  slideId: slugSchema.optional(),
  selection: z
    .strictObject({
      blockIds: z.array(blockIdSchema).max(PRESENCE_MAX_BLOCKS),
      caret: caretSchema.optional(),
    })
    .optional(),
  pointer: z
    .strictObject({
      x: z.number().min(0).max(SHEET_WIDTH),
      y: z.number().min(0).max(SHEET_HEIGHT),
    })
    .optional(),
  follow: clientIdSchema.optional(),
  pointerOn: z.boolean(),
  presenting: z.boolean(),
};

function withinPresenceBytes(state: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(state)).byteLength <= PRESENCE_MAX_BYTES;
}

/** `POST /api/decks/:id/presence` */
export const presencePostSchema = z
  .strictObject(presenceFields)
  .refine(withinPresenceBytes, `a presence state is at most ${PRESENCE_MAX_BYTES} bytes`);

export type PresencePost = z.infer<typeof presencePostSchema>;
export const presenceStateSchema: z.ZodType<PresenceState> = presencePostSchema;

export const roleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);
export const trustSchema = z.enum(['label', 'guest', 'verified', 'agent']);

const identityFields = {
  principalId: z.string().min(1).max(128),
  label: z.string().min(1).max(80),
  trust: trustSchema,
  mark: z.record(z.string(), z.unknown()),
  hueSlot: z.number().int().min(0).max(5),
  kind: z.enum(['human', 'agent']),
  role: roleSchema,
};

export const rosterIdentitySchema = z.strictObject(
  identityFields,
) satisfies z.ZodType<RosterIdentity>;

/** A roster entry: the client's state and the server's identity fields, as `presence` and `hello` carry it. */
export const rosterEntrySchema = z.strictObject({
  ...presenceFields,
  ...identityFields,
}) satisfies z.ZodType<RosterEntry>;

// ---------------------------------------------------------------------------------------------
// Down: the events

export const rejectReasonSchema = z.enum(REJECT_REASONS);

export const checkpointEventSchema = z.strictObject({
  type: z.literal('checkpoint'),
  revision: nonNegativeInt,
  fromSeq: nonNegativeInt,
  toSeq: nonNegativeInt,
  snapshot: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  author: authorSchema,
  note: z.string(),
  comments: z
    .strictObject({ revision: nonNegativeInt, threadIds: z.array(z.string().min(1)) })
    .optional(),
  external: z.literal(true).optional(),
});

export const roomEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    seq: nonNegativeInt,
    revision: nonNegativeInt,
    clientId: z.string().min(1),
    role: roleSchema,
    clients: z.array(rosterEntrySchema),
    editing: nonNegativeInt,
    tier: z.enum(REALTIME_TIERS),
  }),
  z.strictObject({ type: z.literal('ops'), entries: z.array(entrySchema) }),
  z.strictObject({ type: z.literal('op'), entry: entrySchema }),
  checkpointEventSchema,
  z.strictObject({
    type: z.literal('presence'),
    clientId: z.string().min(1),
    clock: nonNegativeInt,
    state: rosterEntrySchema,
  }),
  z.strictObject({ type: z.literal('leave'), clientId: z.string().min(1) }),
  z.strictObject({
    type: z.literal('reject'),
    opId: z.string().min(1),
    reason: rejectReasonSchema,
    mutations: z.array(roomMutationSchema).optional(),
    comment: commentOpSchema.optional(),
    message: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('inbox'),
    unread: nonNegativeInt,
    principalId: z.string().optional(),
  }),
  z.strictObject({ type: z.literal('access'), revision: nonNegativeInt }),
  z.strictObject({ type: z.literal('resync'), revision: nonNegativeInt }),
]) satisfies z.ZodType<RoomEvent>;

// ---------------------------------------------------------------------------------------------
// Server-Sent Events framing

/**
 * One event as the stream writes it: the id the client echoes as `Last-Event-ID`, the event
 * name (the message type) and the JSON body on one `data` line (JSON carries no raw newline).
 */
export function sseFrame(event: RoomEvent, id?: string | number): string {
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  return `${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** The heartbeat: a comment line every 15 s keeps HTTP/1.1 intermediaries from closing an idle stream. */
export function sseComment(text = 'heartbeat'): string {
  return `: ${text}\n\n`;
}

/** The reconnect delay the browser honours, drawn per stream from STREAM_RETRY_MS. */
export function sseRetry(ms: number): string {
  return `retry: ${Math.round(ms)}\n\n`;
}

export type SseBlock = { id?: string; event?: string; data?: string; retry?: number };

/**
 * Parses one block of SSE text (the lines up to a blank line) into its fields; a comment only
 * block is null. Several `data` lines join with newlines, as the WHATWG algorithm says.
 */
export function parseSseBlock(block: string): SseBlock | null {
  const out: SseBlock = {};
  const data: string[] = [];
  let any = false;
  for (const raw of block.split(/\r\n|\r|\n/)) {
    if (raw === '' || raw.startsWith(':')) continue;
    const colon = raw.indexOf(':');
    const field = colon < 0 ? raw : raw.slice(0, colon);
    let value = colon < 0 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'id':
        out.id = value;
        any = true;
        break;
      case 'event':
        out.event = value;
        any = true;
        break;
      case 'data':
        data.push(value);
        any = true;
        break;
      case 'retry': {
        const ms = Number(value);
        if (Number.isInteger(ms) && ms >= 0) {
          out.retry = ms;
          any = true;
        }
        break;
      }
      default:
        break;
    }
  }
  if (!any) return null;
  if (data.length > 0) out.data = data.join('\n');
  return out;
}

/** A parsed block's event, or null when it carries no valid room event. */
export function roomEventOf(block: SseBlock): RoomEvent | null {
  if (block.data === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(block.data);
  } catch {
    return null;
  }
  const parsed = roomEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
