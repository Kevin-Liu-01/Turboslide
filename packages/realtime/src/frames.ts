// The socket frames of the `do` tier (the Cloudflare move, docs/CLOUDFLARE.md 3.3, 3.6.1, 3.6.3):
// what a tab sends up its WebSocket to the deck's Durable Object and what comes down, as zod
// schemas over protocol.ts's shapes, plus the room ticket's claims and its token codec, which the
// function's minter (apps/studio room-ticket.ts, node:crypto) and the Worker's verifier
// (apps/realtime-worker src/ticket.ts, crypto.subtle) share byte for byte. Up frames carry `t`;
// down frames are either a `RoomEvent` of protocol.ts as is (`type`) or a frame with `t` (`ack`,
// `reauth`, `presence-refused`, `room`); `resend` is a `RoomEvent` shaped frame (`type: 'resend'`)
// because the client's event path reads it (3.6.3). The heartbeat is the literal string `ping`,
// answered `pong` by the runtime's auto response without waking the object (W1 section 4); it is
// not JSON and never reaches these parsers. Browser safe: no `node:`, no framework. R2's transport
// reads the schemas; the object and the Worker's router are the writers.
import { z } from 'zod';

import { slugSchema } from '@turboslide/schema/ids';
import { authorSchema, mutationSchema } from '@turboslide/schema/mutations';

import type { Entry, RejectReason, RoomEvent } from './channel.ts';
import {
  CLIENT_ID_PATTERN,
  clientIdSchema,
  commentOpSchema,
  entrySchema,
  opsPostSchema,
  presencePostSchema,
  rejectReasonSchema,
  roleSchema,
  roomEventSchema,
  trustSchema,
} from './protocol.ts';
import type { OpsPost, PresencePost } from './protocol.ts';

/** The room protocol version the hello, the ticket (`v`) and `/health` carry (docs/CLOUDFLARE.md 3.3). */
export const ROOM_PROTOCOL = 1;

/** The subprotocol a tab offers first; the Worker answers it alone. */
export const ROOM_SUBPROTOCOL = 'turboslide.v1';
/** The prefix of the second subprotocol that carries the ticket (3.3: `ticket.<token>`). */
export const TICKET_SUBPROTOCOL_PREFIX = 'ticket.';

/** The heartbeat pair the runtime answers without waking the object (3.2). */
export const HEARTBEAT_REQUEST = 'ping';
export const HEARTBEAT_RESPONSE = 'pong';

/** A tab's first frame when the ticket could not ride the subprotocol must arrive within this (3.3). */
export const JOIN_WINDOW_MS = 5_000;
/** A socket whose ticket is this far past `exp` with no refresh closes with 4401 (3.3). */
export const TICKET_GRACE_MS = 30_000;
/** A fresh ticket must follow a `reauth` within this, else 4403 (3.3). */
export const REAUTH_GRACE_MS = 10_000;

/** The close codes the object sends (3.6.3; build/r1.md R1-R2f). */
export const CLOSE_CODES = {
  /** the ticket is invalid, expired past its grace, or absent after the join window */
  ticket: 4401,
  /** the role fell, or no fresh ticket followed a reauth */
  forbidden: 4403,
  /** a newer socket of the same client id or tab token took this one's place */
  superseded: 4409,
  /** a cap is full; the reason reads `retry-after=<seconds>` */
  capped: 4429,
  /** an error inside the object */
  error: 4500,
  /** the realtime flag is off, or the checkpoint route answered another tier */
  tier: 4503,
} as const;
export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
/** The request id a tab puts on an ops frame and the ack echoes: a positive integer (the transport's counter). */
const reqSchema = positiveInt;

// ---------------------------------------------------------------------------------------------
// The ticket (3.3)

/**
 * The claims the function signs (3.3): the protocol version, the deck, the client id it minted,
 * the identity the budgets key on and its kind, the principal, the decision (`role`, `via`), the
 * reader's two facts (`names` is `showNames`, `rc` is `readComments`), the roster entry's identity
 * fields (`label`, `trust`, `mark`, `email` only when `trust` is `verified`), the origin the
 * function served (`org`), the tab token, the build commit (`dpl`) and the two times in ms.
 */
export const ticketClaimsSchema = z.strictObject({
  v: nonNegativeInt,
  deck: slugSchema,
  cid: clientIdSchema,
  id: z.string().min(1).max(128),
  kind: z.enum(['anonymous', 'signedIn', 'agent']),
  pid: z.string().min(1).max(128).optional(),
  role: roleSchema,
  via: z.string().min(1).max(32),
  names: z.boolean(),
  rc: z.boolean(),
  label: z.string().min(1).max(80),
  trust: trustSchema,
  mark: z.record(z.string(), z.unknown()),
  email: z.string().max(254).optional(),
  org: z.string().min(1).max(256),
  tab: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  dpl: z.string().max(64).optional(),
  iat: nonNegativeInt,
  exp: nonNegativeInt,
});

export type TicketClaims = z.infer<typeof ticketClaimsSchema>;

/** The reader facts of room-core's `ViewerFacts`, read off the claims (3.4 item 6). */
export function viewerFactsOfClaims(claims: TicketClaims): {
  role: TicketClaims['role'];
  via: string;
  showNames: boolean;
  readComments: boolean;
  principalId?: string;
} {
  return {
    role: claims.role,
    via: claims.via,
    showNames: claims.names,
    readComments: claims.rc,
    ...(claims.pid === undefined ? {} : { principalId: claims.pid }),
  };
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Bytes to base64url without padding, web safe (no Buffer). */
export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url to bytes; null when the text is not base64url. */
export function fromBase64url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text)) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** `base64url(claims) + '.' + base64url(mac)` (3.3): the claims text as signed, the MAC over its bytes. */
export function encodeTicket(claimsText: string, mac: Uint8Array): string {
  return `${base64url(new TextEncoder().encode(claimsText))}.${base64url(mac)}`;
}

export type SplitTicket = {
  /** the claims text exactly as it was signed */
  claimsText: string;
  /** the bytes the MAC covers */
  signed: Uint8Array;
  mac: Uint8Array;
};

/** The two halves of a token; null when the shape is not `<base64url>.<base64url>` with a 32 byte MAC. */
export function splitTicket(token: string): SplitTicket | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1 || token.indexOf('.', dot + 1) !== -1) return null;
  const signed = fromBase64url(token.slice(0, dot));
  const mac = fromBase64url(token.slice(dot + 1));
  if (signed === null || mac === null || mac.length !== 32) return null;
  let claimsText: string;
  try {
    claimsText = new TextDecoder('utf-8', { fatal: true }).decode(signed);
  } catch {
    return null;
  }
  return { claimsText, signed, mac };
}

/** The claims of a split token, or null when the text is not the claims' JSON. */
export function parseTicketClaims(claimsText: string): TicketClaims | null {
  let raw: unknown;
  try {
    raw = JSON.parse(claimsText);
  } catch {
    return null;
  }
  const parsed = ticketClaimsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The ticket token of an upgrade's `Sec-WebSocket-Protocol` header, or null when none rides it (3.3). */
export function ticketOfProtocols(header: string | null): string | null {
  if (header === null) return null;
  for (const raw of header.split(',')) {
    const value = raw.trim();
    if (value.startsWith(TICKET_SUBPROTOCOL_PREFIX))
      return value.slice(TICKET_SUBPROTOCOL_PREFIX.length);
  }
  return null;
}

/** True when the header offers the room subprotocol (the first of the two the tab sends). */
export function offersRoomProtocol(header: string | null): boolean {
  if (header === null) return false;
  return header.split(',').some((raw) => raw.trim() === ROOM_SUBPROTOCOL);
}

// ---------------------------------------------------------------------------------------------
// Up: what a tab sends

const envelope = z.object({ t: z.string() }).loose();

export type OpsFrame = { t: 'ops'; req: number } & OpsPost;
export type PresenceFrame = { t: 'presence' } & PresencePost;
export type LeaveFrame = { t: 'leave'; clientId?: string; clock?: number };
export type TicketFrame = { t: 'ticket'; ticket: string };
export type JoinFrame = { t: 'join'; ticket: string };
export type UpFrame = OpsFrame | PresenceFrame | LeaveFrame | TicketFrame | JoinFrame;

const leaveFrameSchema = z.strictObject({
  t: z.literal('leave'),
  clientId: clientIdSchema.optional(),
  clock: nonNegativeInt.optional(),
});
const ticketFrameSchema = z.strictObject({
  t: z.literal('ticket'),
  ticket: z.string().min(1).max(8192),
});
const joinFrameSchema = z.strictObject({
  t: z.literal('join'),
  ticket: z.string().min(1).max(8192),
});

/**
 * Parses one up frame: the envelope's `t`, then the body against protocol.ts's POST schema for
 * `ops` (with `req`) and `presence`, so the object admits exactly what the HTTP routes admit.
 * Null for a frame the object does not know, a body the schema refuses, or text that is not JSON.
 */
export function parseUpFrame(text: string): UpFrame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const outer = envelope.safeParse(raw);
  if (!outer.success) return null;
  const { t, ...body } = outer.data as { t: string } & Record<string, unknown>;
  switch (t) {
    case 'ops': {
      const { req, ...post } = body;
      const reqParsed = reqSchema.safeParse(req);
      const postParsed = opsPostSchema.safeParse(post);
      if (!reqParsed.success || !postParsed.success) return null;
      return { t: 'ops', req: reqParsed.data, ...postParsed.data };
    }
    case 'presence': {
      const parsed = presencePostSchema.safeParse(body);
      return parsed.success ? { t: 'presence', ...parsed.data } : null;
    }
    case 'leave': {
      const parsed = leaveFrameSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }
    case 'ticket': {
      const parsed = ticketFrameSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }
    case 'join': {
      const parsed = joinFrameSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Down: what the object sends

/** The ops answer as the HTTP route's body shapes it (room-client.ts `OpsResponse`), on the socket with `req`. */
export const ackFrameSchema = z.union([
  z.strictObject({
    t: z.literal('ack'),
    req: reqSchema,
    ok: z.literal(true),
    entries: z.array(entrySchema),
    rejected: z.array(
      z.strictObject({
        opId: z.string().min(1),
        reason: rejectReasonSchema,
        message: z.string().optional(),
      }),
    ),
    head: nonNegativeInt,
    revision: nonNegativeInt,
    between: z.array(entrySchema).optional(),
  }),
  z.strictObject({
    t: z.literal('ack'),
    req: reqSchema,
    ok: z.literal(false),
    status: z.number().int().min(400).max(599),
    code: z.string().min(1),
    message: z.string(),
    head: nonNegativeInt.optional(),
    retryAfterMs: nonNegativeInt.optional(),
  }),
]);
export type AckFrame = z.infer<typeof ackFrameSchema>;

/** The object asks every socket for a fresh ticket (3.3: an access change). */
export const reauthFrameSchema = z.strictObject({ t: z.literal('reauth') });
export type ReauthFrame = z.infer<typeof reauthFrameSchema>;

/** A woken object asks every socket for its presence again (3.3); event shaped, the client's hello path. */
export const resendFrameSchema = z.strictObject({ type: z.literal('resend') });
export type ResendFrame = z.infer<typeof resendFrameSchema>;

/**
 * A presence frame the object dropped: the 15 a second budget, a state the schema or the ticket
 * refused, or an older clock. `status`, `code` and `message` are the presence route's refusal
 * body as a frame (R2-C4), so one reader covers the belt and the socket.
 */
export const presenceRefusedFrameSchema = z.strictObject({
  t: z.literal('presence-refused'),
  reason: z.enum(['budget', 'invalid', 'clock']),
  status: z.number().int().min(400).max(599).optional(),
  code: z.string().min(1).optional(),
  message: z.string().optional(),
});
export type PresenceRefusedFrame = z.infer<typeof presenceRefusedFrameSchema>;

/**
 * The object names itself once after `hello` (build/r1.md R1-R2e, R1-R5d): the colo that answered
 * the upgrade, the first eight characters of the object id and the checkpoint cadence it runs.
 */
export const roomFrameSchema = z.strictObject({
  t: z.literal('room'),
  colo: z.string().max(16),
  object: z.string().min(1).max(16),
  idleMs: positiveInt,
  maxMs: positiveInt,
});
export type RoomFrame = z.infer<typeof roomFrameSchema>;

export type DownFrame =
  | { kind: 'event'; event: RoomEvent }
  | { kind: 'ack'; frame: AckFrame }
  | { kind: 'reauth'; frame: ReauthFrame }
  | { kind: 'resend'; frame: ResendFrame }
  | { kind: 'presence-refused'; frame: PresenceRefusedFrame }
  | { kind: 'room'; frame: RoomFrame };

/**
 * Parses one down frame: a `RoomEvent` by protocol.ts's schema (`type`), else one of the socket's
 * own frames (`t`); null for text that is not JSON or a frame this version does not know, which
 * the transport drops as `roomEventOf` drops an unknown event.
 */
export function parseDownFrame(text: string): DownFrame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  if ('type' in raw) {
    const resend = resendFrameSchema.safeParse(raw);
    if (resend.success) return { kind: 'resend', frame: resend.data };
    const event = roomEventSchema.safeParse(raw);
    return event.success ? { kind: 'event', event: event.data } : null;
  }
  const t = (raw as { t?: unknown }).t;
  switch (t) {
    case 'ack': {
      const parsed = ackFrameSchema.safeParse(raw);
      return parsed.success ? { kind: 'ack', frame: parsed.data } : null;
    }
    case 'reauth': {
      const parsed = reauthFrameSchema.safeParse(raw);
      return parsed.success ? { kind: 'reauth', frame: parsed.data } : null;
    }
    case 'presence-refused': {
      const parsed = presenceRefusedFrameSchema.safeParse(raw);
      return parsed.success ? { kind: 'presence-refused', frame: parsed.data } : null;
    }
    case 'room': {
      const parsed = roomFrameSchema.safeParse(raw);
      return parsed.success ? { kind: 'room', frame: parsed.data } : null;
    }
    default:
      return null;
  }
}

/** A refused op as the ack carries it (room-client.ts `Rejected`). */
export type AckRejected = { opId: string; reason: RejectReason; message?: string };

/** The ack of an admitted POST, for the object; `entries` are the admitted and replayed ones in seq order. */
export function ackOf(
  req: number,
  result:
    | {
        ok: true;
        entries: Entry[];
        rejected: AckRejected[];
        head: number;
        revision: number;
        between?: Entry[];
      }
    | {
        ok: false;
        status: number;
        code: string;
        message: string;
        head?: number;
        retryAfterMs?: number;
      },
): AckFrame {
  if (result.ok) {
    return {
      t: 'ack',
      req,
      ok: true,
      entries: result.entries,
      rejected: result.rejected,
      head: result.head,
      revision: result.revision,
      ...(result.between === undefined ? {} : { between: result.between }),
    };
  }
  return {
    t: 'ack',
    req,
    ok: false,
    status: result.status,
    code: result.code,
    message: result.message,
    ...(result.head === undefined ? {} : { head: result.head }),
    ...(result.retryAfterMs === undefined ? {} : { retryAfterMs: result.retryAfterMs }),
  };
}

/** True for a server issued client id (the tag the object keys sockets on). */
export function isClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value);
}

// ---------------------------------------------------------------------------------------------
// The bearer route bodies the object parses (docs/CLOUDFLARE.md 3.6.2 `src/index.ts`)

/** `POST /rooms/:id/write`: an agent's write forwarded by the function (3.2 "An agent HTTP write"). */
export const roomWriteBodySchema = z.strictObject({
  author: authorSchema,
  clientId: z.string().min(1).max(64),
  mutations: z.array(mutationSchema).min(1),
  baseRevision: nonNegativeInt,
  strict: z.boolean().optional(),
  note: z.string().min(1).max(120).optional(),
});
export type RoomWriteBody = z.infer<typeof roomWriteBodySchema>;

/**
 * `POST /rooms/:id/comment`: a comment op the function checked against the live thread
 * (`comments.ts` `landOp` on the do tier). It enters the object's order as a `comment` entry, fans
 * out as an `op`, and the object checkpoints at once, so the sidecar holds it before the answer
 * and the next comment action reads it (the integrator's merge pass: on the do tier every comment
 * action threw "append is not on the do tier").
 */
export const roomCommentBodySchema = z.strictObject({
  author: authorSchema,
  clientId: z.string().min(1).max(64),
  comment: commentOpSchema,
});
export type RoomCommentBody = z.infer<typeof roomCommentBodySchema>;

/** `POST /rooms/:id/external`: a manifest written outside the object (3.5). */
export const roomExternalBodySchema = z.strictObject({
  revision: nonNegativeInt,
  author: authorSchema,
  note: z.string(),
});
export type RoomExternalBody = z.infer<typeof roomExternalBodySchema>;

/** `POST /rooms/:id/publish`: a deck level event the function fans out through the object. */
export const roomPublishBodySchema = z.strictObject({ event: roomEventSchema });

/** `POST /rooms/:id/access-changed`: the reauth of 3.3, every socket when no principal is named. */
export const roomAccessChangedSchema = z.strictObject({
  principalIds: z.array(z.string().min(1).max(128)).max(1000).optional(),
});

/** `POST /api/decks/:id/checkpoint` (the object to the function, 3.5): the entries above `covered`, the object's revision when it knows one, `closed` at the last socket. */
export const checkpointBodySchema = z.strictObject({
  fromSeq: nonNegativeInt,
  toSeq: nonNegativeInt,
  entries: z.array(entrySchema).max(2000),
  closed: z.boolean().optional(),
  revision: nonNegativeInt.optional(),
});
export type CheckpointBody = z.infer<typeof checkpointBodySchema>;
