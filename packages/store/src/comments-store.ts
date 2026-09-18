// The comments sidecar's storage (gslides-parity SPEC-3 2.2, 5.2, 0.52; research 08 2.2, 2.3):
// `comments/index.json`, `comments/<threadId>.json` and `comments/authors.json` under the deck
// folder (a checkout's `decks/<id>/`, the hosted mirror of the same deck), written in the order
// thread, authors, index so a reader never sees an index row without its file, through the
// schema's one reducer (`applyCommentOp`, B1) so the bytes are the same on every path. Hosted,
// the changed files are pushed to the Blob store with `ifMatch` on `index.json` as the commit
// point; a precondition failure pulls the sidecar, re-applies the ops (every op commutes or has
// one winner, 5.2) and retries. The anchors of text threads follow the text they name: `shiftOps`
// computes the `comment.shift` entries a mutation list produces, the room's admission emits them
// after the text op (the redis tier) and `fileCommentsOnWrite` writes them inside `FileStore.write`
// under the deck's lock (a checkout, the blob tier), so one test asserts identical thread bytes.
// Framework free; the CLI's records (apps/cli/src/records/comments.ts, B1) read and write the same
// files with the same reducer and the same order.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { CommentAuthors, CommentOp, CommentsIndex, Thread } from '@turboslide/schema/comments';
import {
  COMMENT_CAPS,
  CommentOpError,
  anchorSlideId,
  applyCommentOp,
  commentAuthorsSchema,
  commentsIndexSchema,
  indexRowOf,
  shiftAnchors,
  threadSchema,
} from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';
import type { Mutation } from '@turboslide/schema/mutations';

import type { ProvenReadOptions } from './access-store.ts';
import { provenGet, putWithCopy } from './access-store.ts';
import { HOSTED_POLL_MS, putPulse } from './pulse.ts';
import type { BlobClient } from './blob-store.ts';
import {
  COMMENTS_DIR,
  boundedBlobClient,
  deckPrefix,
  isBlobExistsError,
  isBlobPreconditionError,
} from './blob-store.ts';

export { COMMENTS_DIR };
export const INDEX_FILE = 'index.json';
export const AUTHORS_FILE = 'authors.json';

/** The sidecar as read from a deck folder. */
export type CommentsSidecar = {
  index: CommentsIndex;
  threads: Map<string, Thread>;
  authors: CommentAuthors;
};

/** What one apply wrote: the index, the threads whose files changed, the authors when new. */
export type SidecarChange = {
  index: CommentsIndex;
  threads: Thread[];
  authors?: CommentAuthors;
  /** the ops the reducer refused, with the reason (a duplicate add, a moved thread) */
  refused: { op: CommentOp; error: CommentOpError }[];
};

function commentsDir(deckDir: string): string {
  return join(deckDir, COMMENTS_DIR);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** The bytes a sidecar document is stored as: canonical JSON, the same on every path (0.52). */
export function sidecarBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

function writeCanonical(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, sidecarBytes(value));
  renameSync(partial, path);
}

export function freshIndex(deckId: string, now: string): CommentsIndex {
  return { schemaVersion: 1, deckId, revision: 0, updatedAt: now, threads: [] };
}

/** The index of a deck folder, or a fresh one; a malformed file is a TypeError. */
export function readIndex(
  deckDir: string,
  deckId: string,
  now = new Date().toISOString(),
): CommentsIndex {
  const path = join(commentsDir(deckDir), INDEX_FILE);
  if (!existsSync(path)) return freshIndex(deckId, now);
  const parsed = commentsIndexSchema.safeParse(readJson(path));
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
  const parsed = commentAuthorsSchema.safeParse(readJson(path));
  return parsed.success ? parsed.data : {};
}

export function readThread(deckDir: string, threadId: string): Thread | undefined {
  const path = join(commentsDir(deckDir), `${threadId}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = threadSchema.safeParse(readJson(path));
  if (!parsed.success) {
    throw new TypeError(`${path} is not a thread: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** The whole sidecar of a deck folder. */
export function readSidecar(
  deckDir: string,
  deckId: string,
  now = new Date().toISOString(),
): CommentsSidecar {
  const index = readIndex(deckDir, deckId, now);
  const threads = new Map<string, Thread>();
  for (const row of index.threads) {
    const thread = readThread(deckDir, row.id);
    if (thread !== undefined) threads.set(thread.id, thread);
  }
  return { index, threads, authors: readAuthors(deckDir) };
}

/** The thread files on disk, for the bundle and a repair of a torn index. */
export function threadFilesOf(deckDir: string): string[] {
  const dir = commentsDir(deckDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== INDEX_FILE && name !== AUTHORS_FILE)
    .sort();
}

export function threadIdOf(op: CommentOp): string {
  return op.op === 'add' ? op.thread.id : op.threadId;
}

/**
 * Applies comment ops to a deck folder's sidecar in order and writes the files (thread, authors,
 * index last), each op at its own bumped revision (08 2.3). Idempotent over a redelivery: an
 * `add` of a thread that exists with the same id and creation stamp is skipped, a `reply` whose
 * comment id is present is the reducer's no-op. The caller holds the deck's write lock (the file
 * store's `withDeckLock`, the checkpointer's lock). A refused op (a duplicate add of another
 * thread, a moved thread on `edit`) is recorded and the rest still land.
 */
export function applyCommentOps(
  deckDir: string,
  deckId: string,
  ops: readonly CommentOp[],
  now = new Date().toISOString(),
): SidecarChange {
  const dir = commentsDir(deckDir);
  const index = readIndex(deckDir, deckId, now);
  const authors = readAuthors(deckDir);
  const changed = new Map<string, Thread>();
  const refused: SidecarChange['refused'] = [];
  let authorsChanged = false;
  let wrote = false;
  for (const op of ops) {
    const threadId = threadIdOf(op);
    // the index is the commit point (08 2.2): a thread file the index does not list is the
    // remainder of a push that failed before its index landed, never a stored thread
    const listed = index.threads.some((row) => row.id === threadId);
    const before = changed.get(threadId) ?? (listed ? readThread(deckDir, threadId) : undefined);
    try {
      if (op.op === 'add') {
        if (before !== undefined) {
          if (before.createdAt === op.thread.createdAt) continue; // a redelivery of the same add
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
      changed.set(threadId, thread);
      mkdirSync(dir, { recursive: true });
      writeCanonical(join(dir, `${threadId}.json`), thread);
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
      const row = indexRowOf(thread);
      const at = index.threads.findIndex((entry) => entry.id === threadId);
      if (at >= 0) index.threads[at] = row;
      else index.threads.push(row);
      index.revision = revision;
      index.updatedAt = now;
      wrote = true;
    } catch (error) {
      if (error instanceof CommentOpError) refused.push({ op, error });
      else throw error;
    }
  }
  if (authorsChanged) writeCanonical(join(dir, AUTHORS_FILE), authors);
  if (wrote) writeCanonical(join(dir, INDEX_FILE), index);
  return {
    index,
    threads: [...changed.values()],
    ...(authorsChanged ? { authors } : {}),
    refused,
  };
}

/**
 * The `comment.shift` ops a mutation list produces on a deck folder's threads (SPEC-3 0.52; 08
 * 1.2): every text anchor moved by a `text.splice` on its Text, or re-placed by its quoted text
 * after a whole Text rewrite. Pure over the sidecar read; the caller applies them.
 */
export function shiftOps(
  deckDir: string,
  deckId: string,
  before: DeckDocument,
  after: DeckDocument,
  mutations: readonly Mutation[],
): CommentOp[] {
  if (!existsSync(commentsDir(deckDir))) return [];
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
  const sidecar = readSidecar(deckDir, deckId);
  const { shifts } = shiftAnchors([...sidecar.threads.values()], mutations, { before, after });
  return shifts.map((shift) => ({ op: 'shift', threadId: shift.threadId, anchor: shift.anchor }));
}

/**
 * The file store's `onWrite` hook (SPEC-3 0.52): inside `FileStore.write`'s lock, after the
 * documents were written, the anchors the write moved are shifted in the sidecar. The same ops
 * ride the stream as `comment.shift` entries on the redis tier, so both paths write the same
 * bytes (comments-store.test.ts).
 */
export function fileCommentsOnWrite(
  deckDir: string,
  deckId: string,
  now: () => string = () => new Date().toISOString(),
  onChange?: (change: SidecarChange) => void,
): (before: DeckDocument, after: DeckDocument, mutations: readonly Mutation[]) => void {
  return (before, after, mutations) => {
    const ops = shiftOps(deckDir, deckId, before, after, mutations);
    if (ops.length === 0) return;
    const change = applyCommentOps(deckDir, deckId, ops, now());
    if (onChange !== undefined && change.threads.length > 0) onChange(change);
  };
}

// ---------------------------------------------------------------------------------------------
// The Blob side (08 2.2, 2.3): thread files put in place, index.json with ifMatch as the commit

function quotedMd5(bytes: Uint8Array): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

/**
 * Pulls the store's sidecar into a deck folder, replacing what the folder holds; a local thread
 * file the store's index does not name is removed, so a failed push leaves nothing behind that a
 * re-apply would take for a redelivery. The reads are proven (`provenGet`, access-store.ts; the
 * focus round, VERIFICATION.md pass 2 F-comments-reply): the index counts only when its bytes
 * hash to the version `head()` names, and each thread is read by the index's rows, never by the
 * prefix listing (which lags the store by up to a minute), and proven the same way, with the
 * immutable copy under the head's version as the read that holds when the file's own url lags
 * (`pushSidecar` stores it first). Before this a reply pushed by one instance was read back by
 * another through the CDN's copy of the thread file from before the reply, and the reply stayed
 * unlisted while the plain read kept answering it.
 */
export async function pullSidecar(
  client: BlobClient,
  deckId: string,
  deckDir: string,
  options: ProvenReadOptions = {},
): Promise<CommentsIndex | null> {
  const prefix = `${deckPrefix(deckId)}${COMMENTS_DIR}/`;
  const dir = commentsDir(deckDir);
  const write = (name: string, bytes: Uint8Array): void => {
    mkdirSync(dir, { recursive: true });
    const partial = join(dir, `${name}.${process.pid}.part`);
    writeFileSync(partial, bytes);
    renameSync(partial, join(dir, name));
  };
  const remove = (keep: Set<string>): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.json') && !keep.has(name)) rmSync(join(dir, name), { force: true });
    }
  };
  const fetchedIndex = await provenGet(client, `${prefix}${INDEX_FILE}`, options);
  if (fetchedIndex === null) {
    // no sidecar in the store: the folder holds nothing the store does
    remove(new Set());
    return null;
  }
  const parsed = commentsIndexSchema.safeParse(
    JSON.parse(new TextDecoder().decode(fetchedIndex.bytes)),
  );
  if (!parsed.success) {
    remove(new Set());
    return null;
  }
  const index = parsed.data;
  const keep = new Set<string>([INDEX_FILE, AUTHORS_FILE]);
  for (const row of index.threads) {
    if (!/^[A-Za-z0-9_.-]+$/.test(row.id)) continue;
    const name = `${row.id}.json`;
    // a thread file on disk that hashes to the etag the index names is the store's already
    // (`pushSidecar` writes the etag beside each row it pushes): no read for it, so a pull of a
    // deck with many threads costs the index and the changed threads alone (the focus round,
    // cycle 3: the second browser's `comment.list` on the blob tier read every thread twice)
    const local = join(dir, name);
    if (row.etag !== undefined && existsSync(local)) {
      if (quotedMd5(new Uint8Array(readFileSync(local))) === row.etag) {
        keep.add(name);
        continue;
      }
    }
    const fetched = await provenGet(client, `${prefix}${name}`, options);
    if (fetched === null) continue;
    keep.add(name);
    write(name, fetched.bytes);
  }
  const authors = await provenGet(client, `${prefix}${AUTHORS_FILE}`, options).catch(() => null);
  if (authors !== null) write(AUTHORS_FILE, authors.bytes);
  // the index last, once every thread it names is on disk (08 2.2: the index is the commit point)
  write(INDEX_FILE, fetchedIndex.bytes);
  remove(keep);
  return index;
}

export type PushResult = { pushed: string[]; indexEtag: string };

/**
 * Pushes a change to the store: every changed thread, `authors.json` when it changed, then
 * `index.json` conditional on the etag the store held before (`ifMatch`; no record yet means the
 * file must not exist). A precondition failure is the caller's to resolve by pulling and
 * re-applying (`applyAndPush`). Each thread file and the index go up with their immutable copy
 * first (`putWithCopy`, access-store.ts; b7's C2-R12: `comments/index/<md5>` in its words, under
 * the deck's `.turboslide/copies/` here so the mirror never pulls it), so a pull on another
 * instance whose edge still serves the file from before this push reads the copy under the
 * version `head()` names (the cycle 2 preview: the Insert menu route's thread was not listed for
 * 20 s while the toolbar route's was, C2-F7).
 */
export async function pushSidecar(
  client: BlobClient,
  deckId: string,
  deckDir: string,
  change: SidecarChange,
  indexEtag: string | null,
): Promise<PushResult> {
  const prefix = `${deckPrefix(deckId)}${COMMENTS_DIR}/`;
  const pushed: string[] = [];
  for (const thread of change.threads) {
    const bytes = sidecarBytes(thread);
    await putWithCopy(client, `${prefix}${thread.id}.json`, bytes, {
      overwrite: true,
      contentType: 'application/json',
    });
    pushed.push(`${thread.id}.json`);
    const row = change.index.threads.find((entry) => entry.id === thread.id);
    if (row !== undefined) row.etag = quotedMd5(bytes);
  }
  if (change.authors !== undefined) {
    await client.put(`${prefix}${AUTHORS_FILE}`, sidecarBytes(change.authors), {
      overwrite: true,
      contentType: 'application/json',
    });
    pushed.push(AUTHORS_FILE);
  }
  // the index with the etags of the thread files it names (08 2.2), rewritten locally too
  writeCanonical(join(commentsDir(deckDir), INDEX_FILE), change.index);
  const entry = await putWithCopy(client, `${prefix}${INDEX_FILE}`, sidecarBytes(change.index), {
    overwrite: indexEtag !== null,
    contentType: 'application/json',
    ...(indexEtag === null ? {} : { ifMatch: indexEtag }),
  });
  pushed.push(INDEX_FILE);
  // the deck's pulse (pulse.ts): the one head every other instance's poll makes moves with
  // this push, so its watcher reads the index (the focus round, cycle 3 fix round)
  await putPulse(client, deckId, 'comments');
  return { pushed, indexEtag: entry.version };
}

/**
 * Applies ops to the mirror and pushes them, retrying through a pull when another instance moved
 * `index.json` first (every op commutes or has one winner, so the retry always lands, 08 2.3).
 * The caller holds the deck's lock on this instance.
 */
export async function applyAndPush(
  client: BlobClient,
  deckId: string,
  deckDir: string,
  ops: readonly CommentOp[],
  now = new Date().toISOString(),
  attempts = 4,
  options: ProvenReadOptions = {},
): Promise<SidecarChange & { indexEtag: string }> {
  const prefix = `${deckPrefix(deckId)}${COMMENTS_DIR}/`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const stored = await client.head(`${prefix}${INDEX_FILE}`);
    const local = existsSync(join(commentsDir(deckDir), INDEX_FILE))
      ? quotedMd5(new Uint8Array(readFileSync(join(commentsDir(deckDir), INDEX_FILE))))
      : null;
    if (stored !== null && stored.version !== local)
      await pullSidecar(client, deckId, deckDir, options);
    const change = applyCommentOps(deckDir, deckId, ops, now);
    if (change.threads.length === 0 && change.authors === undefined) {
      return { ...change, indexEtag: stored?.version ?? '' };
    }
    try {
      const result = await pushSidecar(client, deckId, deckDir, change, stored?.version ?? null);
      return { ...change, indexEtag: result.indexEtag };
    } catch (error) {
      if (!isBlobPreconditionError(error) && !isBlobExistsError(error)) throw error;
      // another instance committed first: the pull at the top of the next round takes its bytes
    }
  }
  throw new Error(`The comments of ${deckId} kept moving under this write; retry`);
}

/** The etag of the local index, the ifMatch a first push after a pull carries. */
export function localIndexEtag(deckDir: string): string | null {
  const path = join(commentsDir(deckDir), INDEX_FILE);
  return existsSync(path) ? quotedMd5(new Uint8Array(readFileSync(path))) : null;
}

/** What a poll of the sidecar's index announces: its version and the threads whose row changed. */
export type SidecarIndexChange = {
  version: string;
  revision: number;
  /** the rows new or changed since the last announced index; every row on the first change */
  threadIds: string[];
};

/** The standalone watcher's interval, for a caller without the deck's pulse; the blob channel passes null. */
export const SIDECAR_WATCH_POLL_MS = HOSTED_POLL_MS;

export type SidecarWatchOptions = {
  /**
   * how often the index's head is read on the watcher's own timer; SIDECAR_WATCH_POLL_MS by
   * default, null for no timer at all (the caller drives `poll`: the blob channel reads the
   * index when the deck's pulse moved, so the watcher makes no timed call of its own; the focus
   * round's cycle 3 fix round, VERIFICATION C3-F2)
   */
  pollMs?: number | null;
  /**
   * the etag of this instance's own copy of the index; a head that equals it is this instance's
   * push, which its own append announced already, so it is not announced twice
   */
  localEtag?: () => string | null;
  proven?: ProvenReadOptions;
  onError?: (error: unknown, context: string) => void;
};

export type SidecarWatch = {
  /** one poll now (the tests, a stream open) */
  poll: () => Promise<void>;
  stop: () => void;
};

/**
 * Polls the head of a deck's `comments/index.json` and announces every version another instance
 * pushed (the focus round, cycle 3; VERIFICATION.md C2-F28 `comments.reaches-second-browser`).
 * On the blob tier a comment entry writes the sidecar inside the append and moves no deck
 * revision, so the store's manifest poll behind the blob channel never fires for it: the writer's
 * instance published the `op` to its own listeners and every tab streaming from another instance
 * kept the threads it had. The watcher takes its position first (the current head is not
 * announced), reads a moved index through `provenGet` (the immutable copy `pushSidecar` stores
 * under the deck's state folder is the read that holds while the url lags) and hands the caller
 * the revision and the changed thread ids; the blob channel turns them into the checkpoint frame
 * with `comments` that the memory tier's checkpointer sends, which every tab answers with a
 * `comment.list`.
 */
export function watchSidecarIndex(
  rawClient: BlobClient,
  deckId: string,
  onChange: (change: SidecarIndexChange) => void,
  options: SidecarWatchOptions = {},
): SidecarWatch {
  // every call meets a deadline (blob-store.ts boundedBlobClient): a hung head never holds the poll
  const client = boundedBlobClient(rawClient);
  const path = `${deckPrefix(deckId)}${COMMENTS_DIR}/${INDEX_FILE}`;
  const onError = options.onError ?? (() => {});
  let last: string | null | undefined;
  let rows = new Map<string, string | undefined>();
  let running: Promise<void> | null = null;
  let stopped = false;
  const pollNow = async (): Promise<void> => {
    const head = await client.head(path);
    const version = head?.version ?? null;
    if (last === undefined) {
      // the position: what is stored now was there before this watcher
      last = version;
      if (head !== null) {
        const got = await provenGet(client, path, options.proven);
        if (got !== null) rows = rowsOf(got.bytes);
      }
      return;
    }
    if (version === last) return;
    if (version !== null && options.localEtag?.() === version) {
      last = version;
      const got = await provenGet(client, path, options.proven);
      if (got !== null) rows = rowsOf(got.bytes);
      return;
    }
    if (head === null) {
      last = null;
      rows = new Map();
      return;
    }
    const got = await provenGet(client, path, options.proven);
    if (got === null) return;
    const parsed = commentsIndexSchema.safeParse(JSON.parse(new TextDecoder().decode(got.bytes)));
    if (!parsed.success) return;
    const next = new Map(parsed.data.threads.map((row) => [row.id, row.etag] as const));
    const changed = [...next].filter(([id, etag]) => !rows.has(id) || rows.get(id) !== etag);
    last = got.entry.version;
    rows = next;
    onChange({
      version: got.entry.version,
      revision: parsed.data.revision,
      threadIds: changed.map(([id]) => id),
    });
  };
  const poll = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    running ??= pollNow()
      .catch((error: unknown) => onError(error, `comments: polling the index of ${deckId}`))
      .finally(() => {
        running = null;
      });
    return running;
  };
  const pollMs = options.pollMs === undefined ? SIDECAR_WATCH_POLL_MS : options.pollMs;
  const timer = pollMs === null ? null : setInterval(() => void poll(), pollMs);
  timer?.unref();
  return {
    poll,
    stop() {
      stopped = true;
      if (timer !== null) clearInterval(timer);
    },
  };
}

/** The thread rows of an index's bytes, id to etag; empty for bytes that are not an index. */
function rowsOf(bytes: Uint8Array): Map<string, string | undefined> {
  try {
    const parsed = commentsIndexSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return new Map();
    return new Map(parsed.data.threads.map((row) => [row.id, row.etag] as const));
  } catch {
    return new Map();
  }
}
