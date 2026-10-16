import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import type { AccessRecord } from '@turboslide/schema/access';
import type { ReadResult } from '@turboslide/store/store';
import type { DefaultKit } from '@turboslide/store/templates';

import type { Decision } from './authorize';
import { loadEditorReads } from './editor-load';
import type { EditorLoadSteps, EditorReads } from './editor-load';
import type { LiveDocument, RequestIdentity, Room } from './room';

// Hardening PS#5 (docs/hardening/HARDENING.md 4.9; PERF-4): the editor loader's reads run in at
// most three serial rounds. Every read here answers 100 ms after it starts on fake timers, so the
// load's virtual time over 100 is its number of serial rounds, at any machine load.

const ROUND_MS = 100;
const IDENTITY = { identity: 'anon_1', kind: 'anonymous' } as unknown as RequestIdentity;
const ROOM = { deckId: 'gt-brand' } as unknown as Room;
const RECORD = { revision: 1 } as unknown as AccessRecord;
const BOUND = { revision: 2 } as unknown as AccessRecord;
const ALLOWED = { ok: true, role: 'editor' } as unknown as Decision;
const REFUSED = { ok: false } as unknown as Decision;

/** A read that answers `value` one round after it starts, and records its start. */
function read<T>(name: string, value: T, started: Map<string, number>): () => Promise<T> {
  return () => {
    started.set(name, Date.now());
    return new Promise((resolve) => setTimeout(() => resolve(value), ROUND_MS));
  };
}

function steps(
  started: Map<string, number>,
  overrides: Partial<EditorLoadSteps<string>> = {},
): EditorLoadSteps<string> {
  return {
    deckHead: read('deck-head', true, started),
    identity: read('identity', IDENTITY, started),
    room: read('room', ROOM, started),
    accessRecord: read('access-record', RECORD, started),
    templates: read('templates', {} as DefaultKit, started),
    decide: read('access', ALLOWED, started),
    bindGrants: read('grants', null, started),
    live: read('live', { seq: 3 } as LiveDocument, started),
    document: read('document', {} as ReadResult, started),
    versions: read('versions', [], started),
    leases: read('leases', [], started),
    records: null,
    commentAuthors: read('comments', [], started),
    resolve: read('resolve', {} as ResolvedIdentity, started),
    // round three: the views and the room ticket together
    finish: async (reads: EditorReads) => {
      const [views] = await Promise.all([
        read('views', 'views', started)(),
        read('ticket', 'ticket', started)(),
      ]);
      return `${views} at ${reads.live.seq} for record ${reads.record.revision}`;
    },
    ...overrides,
  };
}

/** Runs one load on fake timers: its answer, its rounds and when each read started. */
async function load(
  overrides: Partial<EditorLoadSteps<string>> = {},
): Promise<{ answer: string | null; rounds: number; started: Map<string, number> }> {
  const started = new Map<string, number>();
  const start = Date.now();
  const pending = loadEditorReads(steps(started, overrides));
  // a load that rejects is read below; no unhandled rejection while the timers run
  pending.catch(() => undefined);
  await vi.runAllTimersAsync();
  const answer = await pending;
  return { answer, rounds: (Date.now() - start) / ROUND_MS, started };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hardening PS#5: the editor loader reads in three rounds', () => {
  it('answers after three serial rounds, with each read started once its inputs answered', async () => {
    // origin/main 8c9465b6 awaited the reads one after another: deck-head, identity, access,
    // room, live, the three store reads, access-record, resolve, templates, comments and views,
    // 11 rounds for this caller (13 with the grants binding and the ticket)
    const { answer, rounds, started } = await load();
    expect(answer).toBe('views at 3 for record 1');
    expect(rounds).toBe(3);
    const round = (name: string): number => (started.get(name) ?? Number.NaN) / ROUND_MS + 1;
    for (const name of ['deck-head', 'identity', 'room', 'access-record', 'templates'])
      expect(round(name), name).toBe(1);
    for (const name of [
      'access',
      'grants',
      'resolve',
      'live',
      'document',
      'versions',
      'leases',
      'comments',
    ])
      expect(round(name), name).toBe(2);
    for (const name of ['views', 'ticket']) expect(round(name), name).toBe(3);
  });

  it('reads the log beside the documents for a resync', async () => {
    let roomOfRecords: Room | undefined;
    const { rounds, answer } = await load({
      records: (room) => {
        roomOfRecords = room;
        return read('records', [], new Map())();
      },
    });
    expect(answer).not.toBeNull();
    expect(rounds).toBe(3);
    expect(roomOfRecords).toBe(ROOM);
  });

  it('answers null for a deck the store does not hold, and for a caller the decision refuses', async () => {
    const missing = await load({
      deckHead: read('deck-head', false, new Map()),
      // a read started beside the head that rejects is left to settle, never unhandled
      room: () => Promise.reject(new Error('No deck gt-brand in the Blob store')),
    });
    expect(missing.answer).toBeNull();
    const refused = await load({ decide: read('access', REFUSED, new Map()) });
    expect(refused.answer).toBeNull();
    expect(refused.started.has('views')).toBe(false);
  });

  it('reads the access record again after it bound an invitation, the one fourth round', async () => {
    let reads = 0;
    const { answer, rounds } = await load({
      bindGrants: read('grants', BOUND, new Map()),
      accessRecord: () => {
        reads += 1;
        return read('access-record', reads === 1 ? RECORD : BOUND, new Map())();
      },
    });
    expect(answer).toBe('views at 3 for record 2');
    expect(reads).toBe(2);
    expect(rounds).toBe(4);
  });

  it('rejects with the error of a read that failed', async () => {
    const pending = load({ live: () => Promise.reject(new Error('the store refused')) });
    await expect(pending).rejects.toThrow('the store refused');
  });
});
