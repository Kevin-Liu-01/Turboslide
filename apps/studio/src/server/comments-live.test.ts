// The comments hotfix of 2026-10-01 (docs/updates.md): the threads a comment action and
// `comment.list` read on the blob tier are the stored sidecar alone. The append writes the
// sidecar inside the append there (room.ts `applyComments`), so the entry the caller notes as
// pending is already in it; folding it again moved the writing instance's `commentsRevision`
// one above every other instance's for the same sidecar (read on production, 2026-10-01). The
// memory tier keeps the fold: its checkpointer writes the sidecar later, so the pending entries
// are the only copy of a comment written a moment ago.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';
import type { CommentOp, Thread } from '@turboslide/schema/comments';
import { applyCommentOps } from '@turboslide/store/hosted';

import type { Room } from './room';

const rootBefore = process.env.TURBOSLIDE_ROOT;
const storeBefore = process.env.TURBOSLIDE_STORE;
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-comments-live-'));
  mkdirSync(join(root, 'decks'), { recursive: true });
  // the file store under a root of its own: deckDir(deckId) is <root>/decks/<id>
  process.env.TURBOSLIDE_ROOT = root;
  process.env.TURBOSLIDE_STORE = 'file';
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (rootBefore === undefined) delete process.env.TURBOSLIDE_ROOT;
  else process.env.TURBOSLIDE_ROOT = rootBefore;
  if (storeBefore === undefined) delete process.env.TURBOSLIDE_STORE;
  else process.env.TURBOSLIDE_STORE = storeBefore;
});

const AT = '2026-10-01T00:00:00.000Z';
const T1 = '01m3shbftjv64ww028yyhs386t';

function addOp(deckId: string, id: string): CommentOp {
  const thread: Thread = {
    id,
    deckId,
    anchor: { kind: 'slide', slideId: 'title' },
    comment: {
      id,
      author: { principalId: 'anon_a', label: 'A', kind: 'human' },
      createdAt: AT,
      body: { text: 'Rename the customer here.', mentions: [] },
    },
    replies: [],
    createdAt: AT,
    updatedAt: AT,
    revision: 0,
  };
  return { op: 'add', thread };
}

function resolveOp(threadId: string): CommentOp {
  return { op: 'resolve', threadId, at: AT, by: 'anon_a' };
}

function entryOf(op: CommentOp, seq: number): Entry {
  return {
    seq,
    rev: 1,
    kind: 'comment',
    author: { kind: 'human', name: 'A', principalId: 'anon_a' },
    clientId: 'server',
    opId: `comment:${seq}`,
    comment: op,
    at: AT,
  };
}

/** A room as liveThreads reads it: the deck id, the tier and the checkpointer's pending entries. */
function roomOf(deckId: string, tier: Room['tier'], pending: Entry[]): Room {
  return {
    deckId,
    tier,
    checkpointer: { pendingComments: () => [...pending] },
  } as unknown as Room;
}

describe('liveThreads on the blob tier (the sidecar the append wrote is the answer)', () => {
  it('answers the stored revision and the resolved thread, with the resolve pending as well', async () => {
    const deckId = 'live-blob';
    const dir = join(root, 'decks', deckId);
    mkdirSync(dir, { recursive: true });
    const { liveThreads } = await import('./comments');
    // the add and the resolve are in the sidecar, as the blob tier's append leaves them
    applyCommentOps(dir, deckId, [addOp(deckId, T1)], AT);
    const change = applyCommentOps(dir, deckId, [resolveOp(T1)], AT);
    const stored = change.index.revision;
    // the writing instance noted the resolve as pending, as landOp did before the hotfix
    const writer = await liveThreads(roomOf(deckId, 'blob', [entryOf(resolveOp(T1), 2)]));
    const other = await liveThreads(roomOf(deckId, 'blob', []));
    expect(writer.threads.get(T1)?.resolved).toBeDefined();
    expect(other.threads.get(T1)?.resolved).toBeDefined();
    // one revision for one sidecar on every instance, the writer's included
    expect(writer.revision).toBe(stored);
    expect(other.revision).toBe(stored);
  });

  it('folds the pending entries on the memory tier, where the checkpointer has not written them yet', async () => {
    const deckId = 'live-memory';
    const dir = join(root, 'decks', deckId);
    mkdirSync(dir, { recursive: true });
    const { liveThreads } = await import('./comments');
    const change = applyCommentOps(dir, deckId, [addOp(deckId, T1)], AT);
    const live = await liveThreads(roomOf(deckId, 'memory', [entryOf(resolveOp(T1), 2)]));
    expect(live.threads.get(T1)?.resolved).toBeDefined();
    expect(live.revision).toBe(change.index.revision + 1);
    const stored = await liveThreads(roomOf(deckId, 'memory', []));
    expect(stored.threads.get(T1)?.resolved).toBeUndefined();
    expect(stored.revision).toBe(change.index.revision);
  });
});
