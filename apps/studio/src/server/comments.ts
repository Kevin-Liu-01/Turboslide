// Comments on the hosted studio (gslides-parity SPEC-3 5.2, 5.5, 5.9, 0.52; MILESTONES-3 B2 day
// 5): the stream path. A comment action builds one `CommentOp` through the schema's reducer
// (B1's `applyCommentOp`, the one implementation every path runs), appends it to the deck's
// operation stream as a `kind: 'comment'` entry so every tab shows it in the stream's latency,
// and the checkpointer writes the sidecar through `commentsApplierFor` (the file under the lock
// on a checkout and the tmp overlay, the Blob push with `ifMatch` on `index.json` hosted). Reads
// fold the entries the checkpointer has not written yet over the sidecar, so a reader never
// waits for a checkpoint. Text anchors follow their text: `shiftEntriesFor` derives the
// `comment.shift` entries a landed edit produces and the admission appends them after the edit
// (the second stream entry of 0.52; the file store's `onWrite` hook writes the same bytes on the
// other path). The inbox records of the people an op names are written through the selected
// `Inbox` (file on a checkout, Redis hosted, memory on the tmp overlay) and announced as `inbox
// { unread }` on the principal's own stream connections. The CLI's records
// (apps/cli/src/records/comments.ts, B1) are the checkout's implementation of the same actions
// over the same files.
import { randomBytes } from 'node:crypto';

import type { Dispatcher } from '@turboslide/agent/dispatch';
import type { Entry, NewEntry } from '@turboslide/realtime/channel';
import { appendWithRetry } from '@turboslide/realtime/admission';
import type { Capability } from '@turboslide/schema/access';
import type { ActionId } from '@turboslide/schema/actions';
import type {
  AnchorResolution,
  Comment,
  CommentAnchor,
  CommentAuthor,
  CommentBody,
  CommentOp,
  Emoji,
  Mention,
  Thread,
} from '@turboslide/schema/comments';
import {
  CommentOpError,
  anchorSlideId,
  applyCommentOp,
  quotedTextOf,
  readableThread,
  resolveAnchor,
  shiftAnchors,
  threadIsFor,
  threadParticipants,
} from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError, ForbiddenError } from '@turboslide/schema/errors';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { withDeckLock } from '@turboslide/store/file-store';
import {
  applyAndPush,
  applyCommentOps,
  fileInbox,
  localIndexEtag,
  memoryInbox,
  pullSidecar,
  readSidecar,
  redisInbox,
} from '@turboslide/store/hosted';
import type { Inbox, Notification, NotificationEvent } from '@turboslide/store/hosted';

import type { CommentsApplier } from './checkpoint';
import { deckPrefix } from '@turboslide/store/blob-store';
import type { Room } from './room';
import { deckDir, exportBlobClient, stateDir, storeSelection } from './root';

// ---------------------------------------------------------------------------------------------
// The sidecar side: what the checkpointer and the admission call

/** A ULID (26 lower case Crockford characters), the id of a thread or a comment (SPEC-3 5.1). */
export function ulid(now: number = Date.now()): string {
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
  let time = now;
  let head = '';
  for (let i = 0; i < 10; i += 1) {
    head = alphabet.charAt(time % 32) + head;
    time = Math.floor(time / 32);
  }
  let bits = 0;
  let buffer = 0;
  let tail = '';
  for (const byte of randomBytes(10)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      tail += alphabet.charAt((buffer >> bits) & 31);
    }
  }
  return (head + tail).slice(0, 26);
}

/** The deck folder the sidecar lives under: the checkout's `decks/<id>`, the overlay's mirror hosted. */
export function commentsDir(deckId: string): string {
  return deckDir(deckId);
}

/**
 * Writes the comment entries of a checkpoint run to the sidecar (SPEC-3 5.2): under the deck's
 * write lock on this instance; on the Blob store through `applyAndPush`, whose `ifMatch` on
 * `index.json` is the commit point across instances.
 */
export function commentsApplierFor(deckId: string): CommentsApplier {
  return {
    async apply(entries) {
      const ops = entries.flatMap((entry) => (entry.comment === undefined ? [] : [entry.comment]));
      if (ops.length === 0) return { revision: 0, threadIds: [] };
      const dir = commentsDir(deckId);
      const now = new Date().toISOString();
      return withDeckLock(dir, async () => {
        const client = storeSelection().kind === 'blob' ? await exportBlobClient() : null;
        const change =
          client === null
            ? applyCommentOps(dir, deckId, ops, now)
            : await applyAndPush(client, deckId, dir, ops, now);
        return {
          revision: change.index.revision,
          threadIds: change.threads.map((thread) => thread.id),
        };
      });
    },
  };
}

/** The sidecar as stored, pulled first when the Blob store moved under this instance. */
async function storedThreads(
  deckId: string,
): Promise<{ threads: Map<string, Thread>; revision: number }> {
  const dir = commentsDir(deckId);
  if (storeSelection().kind === 'blob') {
    const client = await exportBlobClient();
    if (client !== null) {
      const head = await client.head(`${deckPrefix(deckId)}comments/index.json`).catch(() => null);
      if (head !== null && head.version !== localIndexEtag(dir))
        await pullSidecar(client, deckId, dir);
    }
  }
  const sidecar = readSidecar(dir, deckId);
  return { threads: sidecar.threads, revision: sidecar.index.revision };
}

export type LiveThreads = { threads: Map<string, Thread>; revision: number };

/**
 * The threads as every tab sees them now: the sidecar plus the comment entries the checkpointer
 * has not written yet, folded in stream order through the same reducer. An entry the reducer
 * refuses (a duplicate add from a redelivery) is skipped, as the applier skips it.
 */
export async function liveThreads(room: Room): Promise<LiveThreads> {
  const stored = await storedThreads(room.deckId);
  const threads = new Map(stored.threads);
  let revision = stored.revision;
  // `?.` for a room built by an earlier module version of the dev server (the rooms live on globalThis across reloads)
  for (const entry of room.checkpointer.pendingComments?.() ?? []) {
    const op = entry.comment;
    if (op === undefined) continue;
    const threadId = op.op === 'add' ? op.thread.id : op.threadId;
    const before = threads.get(threadId);
    if (op.op === 'add' && before !== undefined) continue;
    try {
      threads.set(threadId, applyCommentOp(before, op, entry.at, revision + 1));
      revision += 1;
    } catch {
      // refused at the checkpoint too
    }
  }
  return { threads, revision };
}

/**
 * The `comment.shift` entries a landed edit produces (SPEC-3 0.52; 08 1.2): every text anchor a
 * `text.splice` moved on its Text, every anchor re-placed after a whole Text rewrite. The
 * admission appends them right after the edit's entries, authored by the edit's author with
 * `clientId: 'server'`; the checkpointer writes them like any comment entry, so the thread bytes
 * equal the ones the file store's hook writes on the other path (comments-store.test.ts).
 */
export async function shiftEntriesFor(
  room: Room,
  landed: readonly Entry[],
  before: DeckDocument,
  after: DeckDocument,
): Promise<NewEntry[]> {
  const mutations: Mutation[] = landed.flatMap((entry) => entry.mutations ?? []);
  if (
    !mutations.some(
      (mutation) =>
        mutation.op === 'text.splice' ||
        mutation.op === 'text.replace' ||
        mutation.op === 'block.set' ||
        mutation.op === 'slide.replace' ||
        mutation.op === 'slide.set',
    )
  ) {
    return [];
  }
  const live = await liveThreads(room);
  if (live.threads.size === 0) return [];
  const { shifts } = shiftAnchors([...live.threads.values()], mutations, { before, after });
  const last = landed[landed.length - 1];
  if (shifts.length === 0 || last === undefined) return [];
  return shifts.map((shift, n) => ({
    rev: last.rev,
    kind: 'comment',
    author: last.author,
    clientId: 'server',
    opId: `shift:${last.seq}:${n}`,
    comment: { op: 'shift', threadId: shift.threadId, anchor: shift.anchor },
    at: last.at,
  }));
}

// ---------------------------------------------------------------------------------------------
// The inbox (SPEC-3 5.5)

type Shared = typeof globalThis & { __turboslideInbox?: Inbox };
const shared = globalThis as Shared;

/** The principal's inbox: the checkout's file, Redis hosted, memory on the tmp overlay. */
export function inboxFor(
  redis: { call: (command: string, ...args: (string | number)[]) => Promise<unknown> } | null,
): Inbox {
  if (shared.__turboslideInbox === undefined) {
    const selection = storeSelection();
    shared.__turboslideInbox =
      redis !== null
        ? redisInbox(redis)
        : selection.kind === 'file'
          ? fileInbox(stateDir())
          : memoryInbox();
  }
  return shared.__turboslideInbox;
}

// ---------------------------------------------------------------------------------------------
// The actions (SPEC-3 5.9)

export type CommentActionId =
  | 'comment.add'
  | 'comment.reply'
  | 'comment.edit'
  | 'comment.delete'
  | 'comment.resolve'
  | 'comment.reopen'
  | 'comment.assign'
  | 'comment.done'
  | 'comment.react'
  | 'comment.list'
  | 'comment.get'
  | 'comment.link';

export const COMMENT_ACTION_IDS: readonly CommentActionId[] = [
  'comment.add',
  'comment.reply',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'comment.reopen',
  'comment.assign',
  'comment.done',
  'comment.react',
  'comment.list',
  'comment.get',
  'comment.link',
];

export function isCommentActionId(value: string): value is CommentActionId {
  return (COMMENT_ACTION_IDS as readonly string[]).includes(value);
}

/** The capability each action needs on the deck (SPEC-3 6.2). */
export function commentCapabilityOf(action: CommentActionId): Capability {
  switch (action) {
    case 'comment.list':
    case 'comment.get':
    case 'comment.link':
    case 'comment.react':
      return 'readComments';
    default:
      return 'comment';
  }
}

export type CommentCaller = {
  room: Room;
  author: Author;
  /** the caller's capabilities on the deck, from `authorize()` and the record */
  capabilities: ReadonlySet<Capability>;
  /** the caller's principal id, `agent:<tokenId>` for a bearer */
  principalId: string;
  /** the studio's origin for comment.link */
  origin: string;
  /** the raw Redis commands hosted, null elsewhere */
  redis: { call: (command: string, ...args: (string | number)[]) => Promise<unknown> } | null;
  now?: () => string;
  id?: () => string;
};

export type ThreadResult = { thread: Thread; commentsRevision: number };
export type PlacedThread = Thread & { placement: AnchorResolution };

function authorRecord(author: Author, principalId: string): CommentAuthor {
  return {
    principalId: author.principalId ?? principalId,
    label: author.name.slice(0, 40) || 'Someone',
    kind: author.kind,
  };
}

function stampOf(caller: CommentCaller): string {
  return caller.now?.() ?? new Date().toISOString();
}

function nextId(caller: CommentCaller): string {
  return caller.id?.() ?? ulid();
}

function need(caller: CommentCaller, capability: Capability, what: string): void {
  if (!caller.capabilities.has(capability)) {
    throw new ForbiddenError(
      `${what} needs the ${capability} capability on this presentation`,
      capability,
    );
  }
}

/** The reducer's refusals as the transports' error classes (SPEC 7.1). */
export function mapCommentError(error: unknown): unknown {
  if (!(error instanceof CommentOpError)) return error;
  switch (error.status) {
    case 403:
      return new ForbiddenError(error.message, 'comment');
    case 404:
      return new RangeError(error.message);
    case 409:
      return new ConflictError(error.message, { currentRevision: error.current?.revision ?? 0 });
    default:
      return new TypeError(error.message);
  }
}

/**
 * Appends one comment op to the stream after checking it against the live thread through the
 * reducer, so a refused op never enters the stream. Comment entries never conflict (every op
 * commutes or has one winner, 5.2), so the append retries as is when the head moved.
 */
async function landOp(caller: CommentCaller, op: CommentOp): Promise<ThreadResult> {
  const { room } = caller;
  const live = await liveThreads(room);
  const threadId = op.op === 'add' ? op.thread.id : op.threadId;
  const before = live.threads.get(threadId);
  const at = stampOf(caller);
  let thread: Thread;
  try {
    if (op.op === 'add' && before !== undefined) {
      throw new CommentOpError(409, 'conflict', `thread ${threadId} exists already`, before);
    }
    thread = applyCommentOp(before, op, at, live.revision + 1);
  } catch (error) {
    throw mapCommentError(error);
  }
  const current = await room.live();
  const entry: NewEntry = {
    rev: current.document.deck.revision,
    kind: 'comment',
    author: caller.author,
    clientId: 'server',
    opId: `comment:${nextId(caller)}`,
    comment: op,
    at,
  };
  const result = await appendWithRetry(
    room.channel,
    room.deckId,
    current.seq,
    [entry],
    (entries) => entries,
  );
  if (!result.ok)
    throw new ConflictError('The room is busy; retry', {
      currentRevision: current.document.deck.revision,
    });
  room.checkpointer.noteComments(result.entries);
  room.checkpointer.noteAppended(result.entries, 0);
  if (caller.author.kind === 'agent') await room.checkpointer.run({ force: true });
  else room.checkpointer.schedule();
  return { thread, commentsRevision: live.revision + 1 };
}

function mentioned(body: CommentBody): string[] {
  return body.mentions.flatMap((mention) =>
    mention.kind === 'principal' ? [mention.principalId] : [],
  );
}

/** Writes the inbox rows an op produces and tells the principals' stream connections (SPEC-3 5.5). */
async function notify(
  caller: CommentCaller,
  thread: Thread,
  kind: NotificationEvent['kind'],
  recipients: Iterable<string>,
  at: string,
): Promise<void> {
  const inbox = inboxFor(caller.redis);
  const slideId = anchorSlideId(thread.anchor);
  for (const principalId of new Set(recipients)) {
    if (principalId === caller.principalId) continue;
    let record: Notification | null;
    try {
      record = await inbox.push(
        principalId,
        {
          kind,
          deckId: caller.room.deckId,
          threadId: thread.id,
          ...(slideId !== undefined ? { slideId } : {}),
          actor: caller.principalId,
          at,
        },
        () => nextId(caller),
      );
    } catch {
      continue;
    }
    if (record === null) continue;
    const unread = await inbox.unread(principalId).catch(() => 0);
    await caller.room.channel
      .publish(caller.room.deckId, { type: 'inbox', unread, principalId })
      .catch(() => undefined);
  }
}

/** The anchor checked against the live document; a text anchor without `quoted` gets it from the document. */
async function placeAnchor(caller: CommentCaller, anchor: CommentAnchor): Promise<CommentAnchor> {
  const document = (await caller.room.live()).document;
  const checked =
    anchor.kind === 'text' && anchor.quoted === ''
      ? { ...anchor, quoted: quotedTextOf(document, anchor) }
      : anchor;
  const placed = resolveAnchor(document, checked);
  if (placed.orphaned)
    throw new RangeError(`the anchor names nothing on the current document (${placed.reason})`);
  return checked;
}

export async function commentAdd(
  caller: CommentCaller,
  input: { anchor: CommentAnchor; body: CommentBody; assignee?: Mention },
): Promise<ThreadResult> {
  need(caller, 'comment', 'comment.add');
  const at = stampOf(caller);
  const anchor = await placeAnchor(caller, input.anchor);
  const id = nextId(caller);
  const me = authorRecord(caller.author, caller.principalId);
  const thread: Thread = {
    id,
    deckId: caller.room.deckId,
    anchor,
    comment: { id, author: me, createdAt: at, body: input.body },
    replies: [],
    ...(input.assignee !== undefined
      ? { assignee: { to: input.assignee, by: me.principalId, at } }
      : {}),
    createdAt: at,
    updatedAt: at,
    revision: 0,
  };
  const result = await landOp(caller, { op: 'add', thread });
  await notify(caller, result.thread, 'mention', mentioned(input.body), at);
  if (input.assignee?.kind === 'principal')
    await notify(caller, result.thread, 'assigned', [input.assignee.principalId], at);
  return result;
}

export async function commentReply(
  caller: CommentCaller,
  input: { threadId: string; body: CommentBody },
): Promise<ThreadResult> {
  need(caller, 'comment', 'comment.reply');
  const at = stampOf(caller);
  const comment: Comment = {
    id: nextId(caller),
    author: authorRecord(caller.author, caller.principalId),
    createdAt: at,
    body: input.body,
  };
  const result = await landOp(caller, { op: 'reply', threadId: input.threadId, comment });
  const mentions = mentioned(input.body);
  await notify(caller, result.thread, 'mention', mentions, at);
  await notify(
    caller,
    result.thread,
    'reply',
    threadParticipants(result.thread).filter((id) => !mentions.includes(id)),
    at,
  );
  return result;
}

export async function commentEdit(
  caller: CommentCaller,
  input: { threadId: string; commentId: string; body: CommentBody; expectedUpdatedAt: string },
): Promise<ThreadResult> {
  need(caller, 'comment', 'comment.edit');
  return landOp(caller, {
    op: 'edit',
    threadId: input.threadId,
    commentId: input.commentId,
    body: input.body,
    editedAt: stampOf(caller),
    by: caller.principalId,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
}

export async function commentDelete(
  caller: CommentCaller,
  input: { threadId: string; commentId: string; restore?: boolean },
): Promise<ThreadResult> {
  need(caller, 'comment', 'comment.delete');
  const live = await liveThreads(caller.room);
  const thread = live.threads.get(input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  const target =
    thread.comment.id === input.commentId
      ? thread.comment
      : thread.replies.find((row) => row.id === input.commentId);
  if (target === undefined)
    throw new RangeError(`no comment ${input.commentId} in thread ${input.threadId}`);
  // the author, or the deck owner (SPEC-3 5.3)
  if (target.author.principalId !== caller.principalId && !caller.capabilities.has('remove')) {
    throw new ForbiddenError('only the author or the owner may delete a comment', 'comment');
  }
  return landOp(caller, {
    op: 'delete',
    threadId: input.threadId,
    commentId: input.commentId,
    at: stampOf(caller),
    by: caller.principalId,
    ...(input.restore === true ? { restore: true } : {}),
  });
}

async function stampedOp(
  caller: CommentCaller,
  op: 'resolve' | 'reopen' | 'done',
  threadId: string,
  kind: 'resolved' | 'reopened',
): Promise<ThreadResult> {
  need(caller, 'comment', `comment.${op}`);
  const at = stampOf(caller);
  const result = await landOp(caller, { op, threadId, at, by: caller.principalId });
  await notify(caller, result.thread, kind, threadParticipants(result.thread), at);
  return result;
}

export const commentResolve = (
  caller: CommentCaller,
  input: { threadId: string },
): Promise<ThreadResult> => stampedOp(caller, 'resolve', input.threadId, 'resolved');
export const commentReopen = (
  caller: CommentCaller,
  input: { threadId: string },
): Promise<ThreadResult> => stampedOp(caller, 'reopen', input.threadId, 'reopened');
export const commentDone = (
  caller: CommentCaller,
  input: { threadId: string },
): Promise<ThreadResult> => stampedOp(caller, 'done', input.threadId, 'resolved');

export async function commentAssign(
  caller: CommentCaller,
  input: { threadId: string; assignee: Mention | null },
): Promise<ThreadResult> {
  need(caller, 'comment', 'comment.assign');
  const at = stampOf(caller);
  const result = await landOp(caller, {
    op: 'assign',
    threadId: input.threadId,
    to: input.assignee,
    at,
    by: caller.principalId,
  });
  if (input.assignee?.kind === 'principal')
    await notify(caller, result.thread, 'assigned', [input.assignee.principalId], at);
  return result;
}

export async function commentReact(
  caller: CommentCaller,
  input: { threadId: string; commentId: string; emoji: Emoji; on: boolean },
): Promise<ThreadResult> {
  need(caller, 'readComments', 'comment.react');
  const result = await landOp(caller, {
    op: input.on ? 'react' : 'unreact',
    threadId: input.threadId,
    commentId: input.commentId,
    emoji: input.emoji,
    principalId: caller.principalId,
  });
  if (input.on) {
    const target =
      result.thread.comment.id === input.commentId
        ? result.thread.comment
        : result.thread.replies.find((row) => row.id === input.commentId);
    if (target !== undefined)
      await notify(caller, result.thread, 'reaction', [target.author.principalId], stampOf(caller));
  }
  return result;
}

export type CommentListInput = {
  slideId?: string;
  blockId?: string;
  state?: 'open' | 'resolved' | 'all';
  forMe?: boolean;
  author?: string;
  search?: string;
  includeDeleted?: boolean;
  since?: number;
  limit?: number;
};

export type CommentListResult = {
  threads: PlacedThread[];
  commentsRevision: number;
  total: number;
};

function place(document: DeckDocument, thread: Thread, includeDeleted: boolean): PlacedThread {
  return {
    ...readableThread(thread, { includeDeleted }),
    placement: resolveAnchor(document, thread.anchor),
  };
}

/** The threads of the deck or a slide against the live document (SPEC-3 5.9), the CLI's order. */
export async function commentList(
  caller: CommentCaller,
  input: CommentListInput = {},
): Promise<CommentListResult> {
  need(caller, 'readComments', 'comment.list');
  const [{ document }, live] = await Promise.all([caller.room.live(), liveThreads(caller.room)]);
  const state = input.state ?? 'open';
  const search = input.search?.trim().toLowerCase();
  const rows = [...live.threads.values()]
    .filter((thread) => (input.since === undefined ? true : thread.revision > input.since))
    .filter((thread) =>
      input.slideId === undefined ? true : anchorSlideId(thread.anchor) === input.slideId,
    )
    .filter((thread) =>
      input.blockId === undefined
        ? true
        : 'blockId' in thread.anchor && thread.anchor.blockId === input.blockId,
    )
    .filter((thread) =>
      state === 'all'
        ? true
        : state === 'open'
          ? thread.resolved === undefined
          : thread.resolved !== undefined,
    )
    .filter((thread) => (input.forMe === true ? threadIsFor(thread, caller.principalId) : true))
    .filter((thread) =>
      input.author === undefined
        ? true
        : [thread.comment, ...thread.replies].some(
            (comment) => comment.author.principalId === input.author,
          ),
    )
    .filter((thread) =>
      search === undefined || search === ''
        ? true
        : [thread.comment, ...thread.replies].some(
            (comment) =>
              comment.deleted === undefined &&
              (comment.body.text.toLowerCase().includes(search) ||
                comment.author.label.toLowerCase().includes(search)),
          ),
    )
    .sort((a, b) => {
      const ra = a.resolved === undefined ? 0 : 1;
      const rb = b.resolved === undefined ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
    });
  return {
    threads: rows
      .slice(0, input.limit ?? 200)
      .map((thread) => place(document, thread, input.includeDeleted === true)),
    commentsRevision: live.revision,
    total: rows.length,
  };
}

export async function commentGet(
  caller: CommentCaller,
  input: { threadId: string },
): Promise<{ thread: PlacedThread; commentsRevision: number }> {
  need(caller, 'readComments', 'comment.get');
  const [{ document }, live] = await Promise.all([caller.room.live(), liveThreads(caller.room)]);
  const thread = live.threads.get(input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  return { thread: place(document, thread, false), commentsRevision: live.revision };
}

/** The editor and view URLs that open the deck on the thread's slide with its card expanded (SPEC-3 5.9). */
export async function commentLink(
  caller: CommentCaller,
  input: { threadId: string },
): Promise<{ url: string; viewUrl: string }> {
  need(caller, 'readComments', 'comment.link');
  const live = await liveThreads(caller.room);
  const thread = live.threads.get(input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  const slideId = anchorSlideId(thread.anchor);
  const search = new URLSearchParams({ comment: thread.id });
  if (slideId !== undefined) search.set('slide', slideId);
  const origin = caller.origin.replace(/\/$/, '');
  return {
    url: `${origin}/edit/${caller.room.deckId}?${search.toString()}`,
    viewUrl: `${origin}/deck/${caller.room.deckId}?${search.toString()}`,
  };
}

/** One entry point for the routes and the dispatcher: the action id and its validated input. */
export async function runCommentAction(
  caller: CommentCaller,
  action: CommentActionId,
  input: unknown,
): Promise<unknown> {
  switch (action) {
    case 'comment.add':
      return commentAdd(caller, input as Parameters<typeof commentAdd>[1]);
    case 'comment.reply':
      return commentReply(caller, input as Parameters<typeof commentReply>[1]);
    case 'comment.edit':
      return commentEdit(caller, input as Parameters<typeof commentEdit>[1]);
    case 'comment.delete':
      return commentDelete(caller, input as Parameters<typeof commentDelete>[1]);
    case 'comment.resolve':
      return commentResolve(caller, input as { threadId: string });
    case 'comment.reopen':
      return commentReopen(caller, input as { threadId: string });
    case 'comment.assign':
      return commentAssign(caller, input as Parameters<typeof commentAssign>[1]);
    case 'comment.done':
      return commentDone(caller, input as { threadId: string });
    case 'comment.react':
      return commentReact(caller, input as Parameters<typeof commentReact>[1]);
    case 'comment.list':
      return commentList(caller, (input ?? {}) as CommentListInput);
    case 'comment.get':
      return commentGet(caller, input as { threadId: string });
    case 'comment.link':
      return commentLink(caller, input as { threadId: string });
  }
}

/**
 * Registers the twelve comment ids on a dispatcher over one caller (B4's `deckDispatcher` calls
 * this after `registerStoreActions` with the session's caller, request in b2.md), so the window,
 * HTTP and MCP transports run the stream path.
 */
export function registerRoomCommentActions(
  dispatcher: Dispatcher,
  caller: () => Promise<CommentCaller>,
): void {
  for (const id of COMMENT_ACTION_IDS) {
    dispatcher.register(id as ActionId, async (input) =>
      runCommentAction(await caller(), id, input),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Notifications (SPEC-3 5.5): the caller's inbox

export type NotificationCaller = {
  principalId: string;
  deckId?: string;
  /** the owner decides whether commenters read the Activity panel */
  settingsCapability: boolean;
  redis: CommentCaller['redis'];
  now?: () => string;
};

export async function notificationList(
  caller: NotificationCaller,
  input: { unread?: boolean; since?: string; limit?: number },
): Promise<{ notifications: Notification[]; unread: number }> {
  const result = await inboxFor(caller.redis).list(caller.principalId, input);
  return { notifications: result.records, unread: result.unread };
}

export async function notificationMarkRead(
  caller: NotificationCaller,
  input: { ids?: string[]; all?: true },
): Promise<{ unread: number }> {
  const unread = await inboxFor(caller.redis).markRead(
    caller.principalId,
    input.all === true ? 'all' : (input.ids ?? []),
    caller.now?.(),
  );
  return { unread };
}

export async function notificationSettings(
  caller: NotificationCaller,
  input: { level?: 'all' | 'forYou' | 'none'; email?: boolean; activityForCommenters?: boolean },
): Promise<{ level: 'all' | 'forYou' | 'none'; email: boolean; activityForCommenters: boolean }> {
  if (caller.deckId === undefined)
    throw new TypeError('notification settings are per presentation; name a deck');
  const inbox = inboxFor(caller.redis);
  if (
    input.level === undefined &&
    input.email === undefined &&
    input.activityForCommenters === undefined
  ) {
    return inbox.settings(caller.principalId, caller.deckId);
  }
  if (input.activityForCommenters !== undefined && !caller.settingsCapability) {
    throw new TypeError('only the owner decides whether commenters read the Activity panel');
  }
  return inbox.setSettings(caller.principalId, caller.deckId, input);
}
