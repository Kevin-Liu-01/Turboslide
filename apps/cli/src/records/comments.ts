// The comment sidecar on a checkout (gslides-parity SPEC-3 2.2, 5.1, 5.2, 5.9; research-3 08 2,
// 8): `decks/<id>/comments/index.json`, `comments/<threadId>.json` and `comments/authors.json`,
// written under the deck's write lock in canonical JSON so the bytes equal the ones the hosted
// sidecar writes for the same op (0.52). The action functions take the caller's principal (the
// CLI's `--author` as `local:<name>`, the hosted transports' session principal) and the current
// document for anchor resolution, apply the op through the schema's reducer (applyCommentOp, one
// implementation for every path), bump the comments revision and write the inbox records of the
// people the op names (mentions, assignments, replies, resolutions, reactions). Reads resolve
// every anchor against the current document at read time (resolveAnchor), so a removed block
// orphans a thread without a write and an undo revives it.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { Capability } from '@turboslide/schema/access';
import type {
  AnchorResolution,
  Comment,
  CommentAnchor,
  CommentAuthor,
  CommentAuthors,
  CommentBody,
  CommentOp,
  CommentsIndex,
  Emoji,
  Mention,
  Thread,
} from '@turboslide/schema/comments';
import {
  COMMENT_CAPS,
  CommentOpError,
  anchorSlideId,
  applyCommentOp,
  commentAuthorsSchema,
  commentsIndexSchema,
  indexRowOf,
  quotedTextOf,
  readableThread,
  resolveAnchor,
  threadIsFor,
  threadParticipants,
  threadSchema,
} from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import { ConflictError, ForbiddenError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';

import { pushNotification } from './inbox.ts';
import { ulid } from './ids.ts';
import { withDeckLock } from './lock.ts';

export const COMMENTS_DIR = 'comments';
export const INDEX_FILE = 'index.json';
export const AUTHORS_FILE = 'authors.json';

/** What the comment actions work with on one deck. */
export type CommentsDeps = {
  deckDir: string;
  deckId: string;
  /** The repository's `.turboslide/`, where the inbox files live. */
  stateDir: string;
  document: () => Promise<DeckDocument> | DeckDocument;
  /** The caller: a checkout's `local:<name>`, an agent, or the session principal hosted. */
  principal: CommentAuthor;
  /** What the caller may do; every capability on a checkout's own folder (09 1.6). */
  capabilities: ReadonlySet<Capability>;
  /** The studio's origin for comment.link, `http://localhost:4321` on a checkout. */
  origin: string;
  now?: () => string;
  id?: () => string;
};

export type ThreadResult = { thread: Thread; commentsRevision: number };
export type PlacedThread = Thread & { placement: AnchorResolution };

function commentsDir(deckDir: string): string {
  return join(deckDir, COMMENTS_DIR);
}

function freshIndex(deckId: string, now: string): CommentsIndex {
  return { schemaVersion: 1, deckId, revision: 0, updatedAt: now, threads: [] };
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** The index, or a fresh one when the sidecar does not exist yet. */
export function readIndex(
  deckDir: string,
  deckId: string,
  now: string = new Date().toISOString(),
): CommentsIndex {
  const path = join(commentsDir(deckDir), INDEX_FILE);
  if (!existsSync(path)) return freshIndex(deckId, now);
  const parsed = commentsIndexSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new TypeError(
      `${path} is not a comments index: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  return parsed.data;
}

export function readAuthors(deckDir: string): CommentAuthors {
  const path = join(commentsDir(deckDir), AUTHORS_FILE);
  if (!existsSync(path)) return {};
  const parsed = commentAuthorsSchema.safeParse(readJsonFile(path));
  return parsed.success ? parsed.data : {};
}

/** One thread file, or undefined when the index does not know the id. */
export function readThread(deckDir: string, threadId: string): Thread | undefined {
  const path = join(commentsDir(deckDir), `${threadId}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = threadSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    throw new TypeError(`${path} is not a thread: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** Every thread the index lists, in index order; a file the index names and the folder lacks is skipped. */
export function readThreads(deckDir: string, deckId: string): Thread[] {
  const index = readIndex(deckDir, deckId);
  const out: Thread[] = [];
  for (const row of index.threads) {
    const thread = readThread(deckDir, row.id);
    if (thread !== undefined) out.push(thread);
  }
  return out;
}

/** The thread files present on disk, for a repair of a torn index. */
export function threadFilesOnDisk(deckDir: string): string[] {
  const dir = commentsDir(deckDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== INDEX_FILE && name !== AUTHORS_FILE)
    .map((name) => name.slice(0, -'.json'.length));
}

function writeCanonical(path: string, value: unknown): void {
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, canonicalJson(value));
  renameSync(partial, path);
}

/**
 * Applies one op under the deck's lock: the thread file, then `authors.json` when a label is new,
 * then `index.json` last with the bumped revision (08 2.3), the write order the hosted sidecar
 * keeps so a reader never sees an index row without its file. Answers the stored thread and the
 * revision after the write.
 */
export async function applyOp(deps: CommentsDeps, op: CommentOp): Promise<ThreadResult> {
  const now = deps.now?.() ?? new Date().toISOString();
  return withDeckLock(deps.deckDir, () => {
    const dir = commentsDir(deps.deckDir);
    mkdirSync(dir, { recursive: true });
    const index = readIndex(deps.deckDir, deps.deckId, now);
    const threadId = op.op === 'add' ? op.thread.id : op.threadId;
    const before = readThread(deps.deckDir, threadId);
    if (op.op === 'add') {
      if (before !== undefined) {
        throw new CommentOpError(409, 'conflict', `thread ${threadId} exists already`, before);
      }
      if (index.threads.length >= COMMENT_CAPS.threadsPerDeck) {
        throw new CommentOpError(
          400,
          'invalid_input',
          `a deck holds at most ${COMMENT_CAPS.threadsPerDeck} threads`,
        );
      }
      const slideId = anchorSlideId(op.thread.anchor);
      if (slideId !== undefined) {
        const onSlide = index.threads.filter((row) => row.slideId === slideId).length;
        if (onSlide >= COMMENT_CAPS.threadsPerSlide) {
          throw new CommentOpError(
            400,
            'invalid_input',
            `a slide holds at most ${COMMENT_CAPS.threadsPerSlide} threads`,
          );
        }
      }
    }
    const revision = index.revision + 1;
    const thread = applyCommentOp(before, op, now, revision);
    writeCanonical(join(dir, `${threadId}.json`), thread);
    const authors = readAuthors(deps.deckDir);
    let authorsChanged = false;
    for (const comment of [thread.comment, ...thread.replies]) {
      const known = authors[comment.author.principalId];
      if (known === undefined || known.label !== comment.author.label) {
        authors[comment.author.principalId] = {
          label: comment.author.label,
          kind: comment.author.kind,
        };
        authorsChanged = true;
      }
    }
    if (authorsChanged) writeCanonical(join(dir, AUTHORS_FILE), authors);
    const row = indexRowOf(thread);
    const at = index.threads.findIndex((entry) => entry.id === threadId);
    if (at >= 0) index.threads[at] = row;
    else index.threads.push(row);
    index.revision = revision;
    index.updatedAt = now;
    writeCanonical(join(dir, INDEX_FILE), index);
    return { thread, commentsRevision: revision };
  });
}

function require(deps: CommentsDeps, capability: Capability, what: string): void {
  if (!deps.capabilities.has(capability)) {
    throw new ForbiddenError(
      `${what} needs the ${capability} capability on this presentation`,
      capability,
    );
  }
}

function stamp(deps: CommentsDeps): string {
  return deps.now?.() ?? new Date().toISOString();
}

function nextId(deps: CommentsDeps): string {
  return deps.id?.() ?? ulid();
}

/** Writes the inbox records an op produces for the principals it names; the actor never notifies itself. */
function notify(
  deps: CommentsDeps,
  thread: Thread,
  kind: 'mention' | 'reply' | 'assigned' | 'resolved' | 'reopened' | 'reaction' | 'comment',
  recipients: Iterable<string>,
  at: string,
): void {
  const slideId = anchorSlideId(thread.anchor);
  for (const principalId of new Set(recipients)) {
    pushNotification(
      deps.stateDir,
      principalId,
      {
        kind,
        deckId: deps.deckId,
        threadId: thread.id,
        ...(slideId !== undefined ? { slideId } : {}),
        actor: deps.principal.principalId,
        at,
      },
      () => nextId(deps),
    );
  }
}

function mentioned(body: CommentBody): string[] {
  return body.mentions.flatMap((mention) =>
    mention.kind === 'principal' ? [mention.principalId] : [],
  );
}

/**
 * The anchor a comment lands on, checked against the current document: a slide, block or cell
 * that does not exist is a RangeError (404); a text anchor gets its `quoted` from the document
 * when the caller left it empty.
 */
export async function placeAnchor(
  deps: CommentsDeps,
  anchor: CommentAnchor,
): Promise<CommentAnchor> {
  const document = await deps.document();
  const checked =
    anchor.kind === 'text' && anchor.quoted === ''
      ? { ...anchor, quoted: quotedTextOf(document, anchor) }
      : anchor;
  const placed = resolveAnchor(document, checked);
  if (placed.orphaned) {
    throw new RangeError(`the anchor names nothing on the current document (${placed.reason})`);
  }
  return checked;
}

export async function commentAdd(
  deps: CommentsDeps,
  input: { anchor: CommentAnchor; body: CommentBody; assignee?: Mention },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.add');
  const at = stamp(deps);
  const anchor = await placeAnchor(deps, input.anchor);
  const id = nextId(deps);
  const thread: Thread = {
    id,
    deckId: deps.deckId,
    anchor,
    comment: { id, author: deps.principal, createdAt: at, body: input.body },
    replies: [],
    ...(input.assignee !== undefined
      ? { assignee: { to: input.assignee, by: deps.principal.principalId, at } }
      : {}),
    createdAt: at,
    updatedAt: at,
    revision: 0,
  };
  const result = await applyOp(deps, { op: 'add', thread });
  notify(deps, result.thread, 'mention', mentioned(input.body), at);
  if (input.assignee?.kind === 'principal')
    notify(deps, result.thread, 'assigned', [input.assignee.principalId], at);
  return result;
}

export async function commentReply(
  deps: CommentsDeps,
  input: { threadId: string; body: CommentBody },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.reply');
  const at = stamp(deps);
  const comment: Comment = {
    id: nextId(deps),
    author: deps.principal,
    createdAt: at,
    body: input.body,
  };
  const result = await applyOp(deps, { op: 'reply', threadId: input.threadId, comment });
  const mentions = mentioned(input.body);
  notify(deps, result.thread, 'mention', mentions, at);
  const others = threadParticipants(result.thread).filter((id) => !mentions.includes(id));
  notify(deps, result.thread, 'reply', others, at);
  return result;
}

export async function commentEdit(
  deps: CommentsDeps,
  input: { threadId: string; commentId: string; body: CommentBody; expectedUpdatedAt: string },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.edit');
  const at = stamp(deps);
  return applyOp(deps, {
    op: 'edit',
    threadId: input.threadId,
    commentId: input.commentId,
    body: input.body,
    editedAt: at,
    by: deps.principal.principalId,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
}

export async function commentDelete(
  deps: CommentsDeps,
  input: { threadId: string; commentId: string; restore?: boolean },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.delete');
  const thread = readThread(deps.deckDir, input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  const target =
    thread.comment.id === input.commentId
      ? thread.comment
      : thread.replies.find((row) => row.id === input.commentId);
  if (target === undefined)
    throw new RangeError(`no comment ${input.commentId} in thread ${input.threadId}`);
  // the author, or the deck owner (SPEC-3 5.3)
  if (
    target.author.principalId !== deps.principal.principalId &&
    !deps.capabilities.has('remove')
  ) {
    throw new ForbiddenError('only the author or the owner may delete a comment', 'comment');
  }
  return applyOp(deps, {
    op: 'delete',
    threadId: input.threadId,
    commentId: input.commentId,
    at: stamp(deps),
    by: deps.principal.principalId,
    ...(input.restore === true ? { restore: true } : {}),
  });
}

export async function commentResolve(
  deps: CommentsDeps,
  input: { threadId: string },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.resolve');
  const at = stamp(deps);
  const result = await applyOp(deps, {
    op: 'resolve',
    threadId: input.threadId,
    at,
    by: deps.principal.principalId,
  });
  notify(deps, result.thread, 'resolved', threadParticipants(result.thread), at);
  return result;
}

export async function commentReopen(
  deps: CommentsDeps,
  input: { threadId: string },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.reopen');
  const at = stamp(deps);
  const result = await applyOp(deps, {
    op: 'reopen',
    threadId: input.threadId,
    at,
    by: deps.principal.principalId,
  });
  notify(deps, result.thread, 'reopened', threadParticipants(result.thread), at);
  return result;
}

export async function commentAssign(
  deps: CommentsDeps,
  input: { threadId: string; assignee: Mention | null },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.assign');
  const at = stamp(deps);
  const result = await applyOp(deps, {
    op: 'assign',
    threadId: input.threadId,
    to: input.assignee,
    at,
    by: deps.principal.principalId,
  });
  if (input.assignee?.kind === 'principal')
    notify(deps, result.thread, 'assigned', [input.assignee.principalId], at);
  return result;
}

export async function commentDone(
  deps: CommentsDeps,
  input: { threadId: string },
): Promise<ThreadResult> {
  require(deps, 'comment', 'comment.done');
  const at = stamp(deps);
  const result = await applyOp(deps, {
    op: 'done',
    threadId: input.threadId,
    at,
    by: deps.principal.principalId,
  });
  notify(deps, result.thread, 'resolved', threadParticipants(result.thread), at);
  return result;
}

export async function commentReact(
  deps: CommentsDeps,
  input: { threadId: string; commentId: string; emoji: Emoji; on: boolean },
): Promise<ThreadResult> {
  require(deps, 'readComments', 'comment.react');
  const result = await applyOp(deps, {
    op: input.on ? 'react' : 'unreact',
    threadId: input.threadId,
    commentId: input.commentId,
    emoji: input.emoji,
    principalId: deps.principal.principalId,
  });
  if (input.on) {
    const target =
      result.thread.comment.id === input.commentId
        ? result.thread.comment
        : result.thread.replies.find((row) => row.id === input.commentId);
    if (target !== undefined)
      notify(deps, result.thread, 'reaction', [target.author.principalId], stamp(deps));
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

/** The threads of the deck or a slide, resolved against the current document (SPEC-3 5.9). */
export async function commentList(
  deps: CommentsDeps,
  input: CommentListInput = {},
): Promise<CommentListResult> {
  require(deps, 'readComments', 'comment.list');
  const document = await deps.document();
  const index = readIndex(deps.deckDir, deps.deckId);
  const state = input.state ?? 'open';
  const search = input.search?.trim().toLowerCase();
  const rows = readThreads(deps.deckDir, deps.deckId)
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
    .filter((thread) =>
      input.forMe === true ? threadIsFor(thread, deps.principal.principalId) : true,
    )
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
    // open threads by last activity, newest first; resolved after them (SPEC-3 5.3)
    .sort((a, b) => {
      const ra = a.resolved === undefined ? 0 : 1;
      const rb = b.resolved === undefined ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
    });
  const limited = rows.slice(0, input.limit ?? 200);
  return {
    threads: limited.map((thread) => place(document, thread, input.includeDeleted === true)),
    commentsRevision: index.revision,
    total: rows.length,
  };
}

export async function commentGet(
  deps: CommentsDeps,
  input: { threadId: string },
): Promise<{ thread: PlacedThread; commentsRevision: number }> {
  require(deps, 'readComments', 'comment.get');
  const thread = readThread(deps.deckDir, input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  const document = await deps.document();
  return {
    thread: place(document, thread, false),
    commentsRevision: readIndex(deps.deckDir, deps.deckId).revision,
  };
}

/** The editor and view URLs that open the deck on the thread's slide with its card expanded (SPEC-3 5.9). */
export function commentLink(
  deps: CommentsDeps,
  input: { threadId: string },
): { url: string; viewUrl: string } {
  require(deps, 'readComments', 'comment.link');
  const thread = readThread(deps.deckDir, input.threadId);
  if (thread === undefined) throw new RangeError(`no thread ${input.threadId}`);
  const slideId = anchorSlideId(thread.anchor);
  const search = new URLSearchParams({ comment: thread.id });
  if (slideId !== undefined) search.set('slide', slideId);
  const origin = deps.origin.replace(/\/$/, '');
  return {
    url: `${origin}/edit/${deps.deckId}?${search.toString()}`,
    viewUrl: `${origin}/deck/${deps.deckId}?${search.toString()}`,
  };
}

/** Maps the reducer's refusals to the transports' error classes (SPEC 7.1). */
export function mapCommentError(error: unknown): unknown {
  if (!(error instanceof CommentOpError)) return error;
  switch (error.status) {
    case 403:
      return new ForbiddenError(error.message, 'comment');
    case 404:
      return new RangeError(error.message);
    case 409:
      return new ConflictError(error.message, {
        currentRevision: error.current?.revision ?? 0,
        current: error.current,
      });
    default:
      return new TypeError(error.message);
  }
}
