import { describe, expect, it } from 'vitest';

import type { Version } from '@turboslide/schema/mutations';

import type { VersionRecord } from '@turboslide/store/store';

import {
  EDITOR_VERSIONS_KEPT,
  RESYNC_ORIGINS_MAX,
  originsSince,
  shapeByRole,
  trimVersionLog,
  withTrashStamp,
} from './write';
import type { EditorDeck } from './write';

// The editor payload's version log (gslides-parity SPEC-4 0.34; PP 3.5 item 3): the loader
// carries the newest EDITOR_VERSIONS_KEPT records without their mutations, and the trim runs
// after the role shaping so a role without `history` keeps its empty log. Pure functions over
// hand built records; no store, no server function. `withTrashStamp` (the round four fixer) is
// the store's manifest stamp applied over the room's live document.

function version(n: number, mutationCount = 1): Version {
  return {
    n,
    revision: n,
    author: { kind: 'human', name: 'studio' },
    note: `write ${n}`,
    createdAt: new Date(Date.UTC(2026, 8, 14, 0, 0, n)).toISOString(),
    mutations: Array.from({ length: mutationCount }, (_, i) => ({
      op: 'deck.set',
      path: '/title',
      value: `title ${n}.${i}`,
    })) as Version['mutations'],
  };
}

describe('originsSince', () => {
  const record = (n: number, opIds?: string[]): VersionRecord => ({
    ...version(n),
    baseRevision: n - 1,
    inverse: [],
    ...(opIds === undefined ? {} : { origin: { clientId: `tab-${n % 2}`, opIds } }),
  });

  it('answers the origins of the records above since, oldest first, mutations stripped, and skips a record without one (docs/SYNC.md 3.2)', () => {
    const log = [record(1, ['a1']), record(2), record(3, ['c1', 'c2']), record(4, ['d1'])];
    expect(originsSince(log, 1)).toEqual([
      { seq: 3, n: 3, clientId: 'tab-1', opIds: ['c1', 'c2'] },
      { seq: 4, n: 4, clientId: 'tab-0', opIds: ['d1'] },
    ]);
    expect(originsSince(log, 0).map((row) => row.seq)).toEqual([1, 3, 4]);
    expect(originsSince(log, 4)).toEqual([]);
    expect(originsSince([], 0)).toEqual([]);
    // the bound: the newest `max` records above since are read, the older ones are not
    const long = Array.from({ length: 6 }, (_, i) => record(i + 1, [`op-${i + 1}`]));
    expect(originsSince(long, 0, 3).map((row) => row.seq)).toEqual([4, 5, 6]);
    expect(RESYNC_ORIGINS_MAX).toBe(2000);
    // the answer carries no mutations and does not alias the record's op id list
    const [first] = originsSince(log, 2);
    expect(first).not.toHaveProperty('mutations');
    first?.opIds.push('x');
    expect(log[2]?.origin?.opIds).toEqual(['c1', 'c2']);
  });
});

describe('trimVersionLog', () => {
  it('keeps the newest fifty records in the log order and drops every mutation', () => {
    const log = Array.from({ length: 120 }, (_, i) => version(i + 1, 3));
    const trimmed = trimVersionLog(log);
    expect(trimmed).toHaveLength(EDITOR_VERSIONS_KEPT);
    expect(trimmed[0]?.n).toBe(120 - EDITOR_VERSIONS_KEPT + 1);
    expect(trimmed[trimmed.length - 1]?.n).toBe(120);
    expect(trimmed.every((entry) => entry.mutations.length === 0)).toBe(true);
    /* the fields the title row and the panel rows read stay */
    const last = trimmed[trimmed.length - 1]!;
    expect(last.author).toEqual({ kind: 'human', name: 'studio' });
    expect(last.note).toBe('write 120');
    expect(last.revision).toBe(120);
    expect(last.createdAt).toBe(log[119]?.createdAt);
    /* the source log is not touched */
    expect(log[119]?.mutations).toHaveLength(3);
  });

  it('leaves a short log whole apart from the mutations, and an empty log empty', () => {
    const log = [version(1), version(2)];
    expect(trimVersionLog(log).map((entry) => entry.n)).toEqual([1, 2]);
    expect(trimVersionLog([])).toEqual([]);
  });
});

describe('shapeByRole then trimVersionLog', () => {
  const payload: EditorDeck = {
    deckId: 'q4',
    document: {
      deck: {
        id: 'q4',
        title: 'Q4',
        revision: 3,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:03.000Z',
        sections: [{ id: 's', name: 'S', slideIds: ['a'] }],
        assets: {},
      },
      slides: { a: { id: 'a', kind: 'title', heading: 'A' } },
    } as unknown as EditorDeck['document'],
    issues: [],
    ok: true,
    sprite: '',
    versions: [version(1), version(2), version(3)],
    leases: [],
    hosting: {
      store: 'file',
      reason: 'test',
      persistent: true,
      blob: false,
      seed: null,
      notice: null,
      decksDir: '/tmp',
    },
  };

  it('an editor with history gets the trimmed log and the count', () => {
    const shaped = shapeByRole(payload, ['read', 'write', 'history']);
    const trimmed = trimVersionLog(shaped.versions);
    expect(trimmed).toHaveLength(3);
    expect(trimmed.every((entry) => entry.mutations.length === 0)).toBe(true);
    expect(shaped.versions.length).toBe(3);
  });

  it('a role without history keeps an empty log', () => {
    const shaped = shapeByRole(payload, ['read']);
    expect(shaped.versions).toEqual([]);
    expect(trimVersionLog(shaped.versions)).toEqual([]);
  });

  describe('withTrashStamp', () => {
    const live = payload.document;

    it('applies the store manifest stamp a room opened before the trash does not carry', () => {
      const stamped = withTrashStamp(live, '2026-09-14T01:00:00.000Z');
      expect(stamped.deck.trashedAt).toBe('2026-09-14T01:00:00.000Z');
      /* the rest of the document is the room's: the same slides object, the same revision */
      expect(stamped.slides).toBe(live.slides);
      expect(stamped.deck.revision).toBe(live.deck.revision);
      expect(live.deck.trashedAt).toBeUndefined();
    });

    it('removes a stamp the store has cleared, and returns the same document when they agree', () => {
      const trashed = { ...live, deck: { ...live.deck, trashedAt: '2026-09-14T01:00:00.000Z' } };
      const restored = withTrashStamp(trashed, undefined);
      expect('trashedAt' in restored.deck).toBe(false);
      expect(withTrashStamp(live, undefined)).toBe(live);
      expect(withTrashStamp(trashed, '2026-09-14T01:00:00.000Z')).toBe(trashed);
      /* an empty string is no stamp (schema/deck isTrashed) */
      expect(withTrashStamp(live, '')).toBe(live);
    });
  });
});
