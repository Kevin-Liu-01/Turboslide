// Stand-ins for principal ids (docs/hardening/HARDENING.md HR-SD#1, DATA-V2; the fix round after
// verifier pass 2, F2). A principal id names the person's deck index on the store
// (`users/<id>/decks.json`), so a reader who may not share a deck reads, in place of each other
// person's id, a stand-in: `ref_` and 22 characters of an HMAC-SHA256 over the deck id and the
// principal id. The same person on the same deck has the same stand-in on every instance of the
// studio and in the realtime Worker's deck room, so the page's people map, the version rows, the
// presence chips and the comment cards still meet; it differs between decks, so two decks never
// show that they name the same person. It is no principal id: no store path, lookup or index
// takes it. This file is the one definition, with no `node:` import, so the studio, the Worker's
// deck room and the reader projection of @turboslide/realtime room-core share it byte for byte.
import type {
  Comment,
  CommentAuthor,
  CommentBody,
  CommentOp,
  Mention,
  Stamp,
  Thread,
} from '@turboslide/schema/comments';
import type { Author } from '@turboslide/schema/mutations';

import { isPrincipalId } from './ids.ts';
import { sha256 } from './sha256.ts';

export const STAND_IN_PREFIX = 'ref_';

const encoder = new TextEncoder();
const BLOCK = 64;

/** HMAC-SHA256 (RFC 2104) over the package's synchronous SHA-256. */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(BLOCK);
  block.set(key.byteLength > BLOCK ? sha256(key) : key);
  const inner = new Uint8Array(BLOCK + message.byteLength);
  const outer = new Uint8Array(BLOCK + 32);
  for (let i = 0; i < BLOCK; i += 1) {
    inner[i] = (block[i] ?? 0) ^ 0x36;
    outer[i] = (block[i] ?? 0) ^ 0x5c;
  }
  inner.set(message, BLOCK);
  outer.set(sha256(inner), BLOCK);
  return sha256(outer);
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The key the stand-ins are made under, from a deployment secret both hosts hold. The studio
 * passes `TURBOSLIDE_ROOM_SECRET` when it is set (the Worker verifies the room tickets with the
 * same value, so the two hosts agree) and its download secret otherwise; the label keeps the key
 * apart from every other use of the secret.
 */
export function standInKey(secret: string | Uint8Array): Uint8Array {
  const bytes = typeof secret === 'string' ? encoder.encode(secret) : secret;
  return hmacSha256(bytes, encoder.encode('turboslide stand-in key'));
}

/** The stand-in of one principal on one deck under a key. */
export function standInOf(key: Uint8Array, deckId: string, principalId: string): string {
  const mac = hmacSha256(key, encoder.encode(`stand-in\n${deckId}\n${principalId}`));
  return `${STAND_IN_PREFIX}${base64url(mac).slice(0, 22)}`;
}

/** True for a stand-in this module makes. */
export function isStandIn(value: string): boolean {
  return value.startsWith(STAND_IN_PREFIX) && /^[A-Za-z0-9_-]{22}$/.test(value.slice(4));
}

/**
 * The mapping one answer applies: another principal's id (a person's or an agent key's) becomes
 * its stand-in; the reader's own ids, and every string that is no principal id (`seed`,
 * `legacy`, a round one author name, a stand-in), pass through.
 */
export type StandIns = (id: string) => string;

/** The mapping of a reader on a deck, from the deck's stand-in of a principal and the reader's ids. */
export function standInsWith(
  standIn: (principalId: string) => string,
  own: Iterable<string | null | undefined>,
): StandIns {
  const mine = new Set<string>();
  for (const id of own) if (typeof id === 'string' && id !== '') mine.add(id);
  const made = new Map<string, string>();
  return (id) => {
    if (mine.has(id) || !isPrincipalId(id)) return id;
    let value = made.get(id);
    if (value === undefined) {
      value = standIn(id);
      made.set(id, value);
    }
    return value;
  };
}

// ---------------------------------------------------------------------------------------------
// The version log with its authors as stand-ins: the window's version list and its loader, the
// dispatcher's version answers on every transport and the bundle's `versions/<n>.json` all map
// through these (the fix of verifier pass 3, V3-1). Pure.

/** An author with another person's principal id as its stand-in. */
export function authorWithStandIn<A extends Author>(author: A, people: StandIns): A {
  return author.principalId === undefined
    ? author
    : { ...author, principalId: people(author.principalId) };
}

/** One version entry (a Version, or a stored record with its extra fields) with its author's id as its stand-in. */
export function versionWithStandIns<V extends { author: Author }>(version: V, people: StandIns): V {
  return { ...version, author: authorWithStandIn(version.author, people) };
}

/** The version log with each author's id as its stand-in. */
export function versionsWithStandIns<V extends { author: Author }>(
  versions: ReadonlyArray<V>,
  people: StandIns,
): V[] {
  return versions.map((version) => versionWithStandIns(version, people));
}

// ---------------------------------------------------------------------------------------------
// The comment shapes with their principal ids as stand-ins: the authors, the mentions, the
// reactions, the assignee and every stamp. Pure; a field without an id is kept as it is.

function mentionWith(mention: Mention, people: StandIns): Mention {
  return mention.kind === 'principal'
    ? { kind: 'principal', principalId: people(mention.principalId) }
    : mention;
}

function bodyWith(body: CommentBody, people: StandIns): CommentBody {
  return { ...body, mentions: body.mentions.map((mention) => mentionWith(mention, people)) };
}

function stampWith(stamp: Stamp, people: StandIns): Stamp {
  return { ...stamp, by: people(stamp.by) };
}

function authorWith(author: CommentAuthor, people: StandIns): CommentAuthor {
  return { ...author, principalId: people(author.principalId) };
}

function commentWith(comment: Comment, people: StandIns): Comment {
  return {
    ...comment,
    author: authorWith(comment.author, people),
    body: bodyWith(comment.body, people),
    ...(comment.reactions === undefined
      ? {}
      : {
          reactions: comment.reactions.map((reaction) => ({
            ...reaction,
            principalIds: reaction.principalIds.map(people),
          })),
        }),
    ...(comment.deleted === undefined ? {} : { deleted: stampWith(comment.deleted, people) }),
  };
}

/** A thread as a reader who may not share reads it; the fields beside the thread's (a placement) are kept. */
export function threadWithStandIns<T extends Thread>(thread: T, people: StandIns): T {
  return {
    ...thread,
    comment: commentWith(thread.comment, people),
    replies: thread.replies.map((reply) => commentWith(reply, people)),
    ...(thread.resolved === undefined ? {} : { resolved: stampWith(thread.resolved, people) }),
    ...(thread.assignee === undefined
      ? {}
      : {
          assignee: {
            ...thread.assignee,
            to: mentionWith(thread.assignee.to, people),
            by: people(thread.assignee.by),
            ...(thread.assignee.done === undefined
              ? {}
              : { done: stampWith(thread.assignee.done, people) }),
          },
        }),
  };
}

/** A comment op as a reader who may not share reads it on the room's stream. */
export function commentOpWithStandIns(op: CommentOp, people: StandIns): CommentOp {
  switch (op.op) {
    case 'add':
      return { ...op, thread: threadWithStandIns(op.thread, people) };
    case 'reply':
      return { ...op, comment: commentWith(op.comment, people) };
    case 'edit':
      return { ...op, body: bodyWith(op.body, people), by: people(op.by) };
    case 'assign':
      return { ...op, to: op.to === null ? null : mentionWith(op.to, people), by: people(op.by) };
    case 'reassign':
      return { ...op, to: mentionWith(op.to, people), by: people(op.by) };
    case 'react':
    case 'unreact':
      return { ...op, principalId: people(op.principalId) };
    case 'delete':
    case 'resolve':
    case 'reopen':
    case 'done':
    case 'move':
      return { ...op, by: people(op.by) };
    case 'shift':
      return op;
  }
}
