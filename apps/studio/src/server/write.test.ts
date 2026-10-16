import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Version } from '@turboslide/schema/mutations';

import { StorageFrozenError, StorageLayoutError } from '@turboslide/store/migrate';
import type { VersionRecord } from '@turboslide/store/store';

import { sendThroughFreeze, storeWaitMs } from '../editor/draft-retry';
import { RESYNC_ORIGINS_MAX, originsSince } from './origins';
import {
  EDITOR_VERSIONS_KEPT,
  answeringRefusals,
  readWriteDeckAnswer,
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

  it('answers the origins of the records above since, oldest first, mutations stripped, and skips a record without one (docs/archive/rounds/SYNC.md 3.2)', () => {
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

describe('answeringRefusals (HR-K1#4b; docs/hosting.md 10)', () => {
  const recorder = () => {
    const set: { status?: number } = {};
    return { set, status: (code: number) => void (set.status = code) };
  };
  const frozenSentence =
    'Saving is paused while the documents move between stores; try again in a minute';

  it("answers a freeze's or a layout read's refusal of writeDeck as 503 with the refusal in its body", async () => {
    const r = recorder();
    const answer = await answeringRefusals(
      () => Promise.reject(new StorageFrozenError(frozenSentence)),
      r.status,
    );
    expect(JSON.parse(answer)).toEqual({
      ok: false,
      code: 'busy',
      name: 'StorageFrozenError',
      message: frozenSentence,
      retryAfter: 30,
    });
    expect(r.set).toEqual({ status: 503 });
    const layout = recorder();
    const read = await answeringRefusals(
      () => Promise.reject(new StorageLayoutError('meta.json did not read')),
      layout.status,
    );
    expect(JSON.parse(read)).toMatchObject({
      code: 'busy',
      name: 'StorageLayoutError',
      retryAfter: 5,
    });
    expect(layout.set).toEqual({ status: 503 });
  });

  it('leaves any other error and an answer as they are', async () => {
    const r = recorder();
    await expect(
      answeringRefusals(() => Promise.reject(new RangeError('No deck d1')), r.status),
    ).rejects.toThrow('No deck d1');
    await expect(
      answeringRefusals(
        () => Promise.reject(new Error('The store did not answer; try again in 7 s')),
        r.status,
      ),
    ).rejects.toThrow('The store did not answer');
    expect(await answeringRefusals(async () => '{"ok":true}', r.status)).toBe('{"ok":true}');
    expect(r.set).toEqual({});
  });

  it('crosses the server function serializer, and the page waits and sends the first save again (finish round regression finding 2)', async () => {
    // the serializer the installed TanStack Start runs over a server function's answer
    // (server-functions-handler.js) and the page's reading of it (serverFnFetcher.js)
    type Options = { refs: Map<number, unknown>; plugins: unknown[] };
    type Seroval = {
      toCrossJSONAsync: (value: unknown, options: Options) => Promise<unknown>;
      fromCrossJSON: (value: unknown, options: Options) => unknown;
    };
    const studio = createRequire(import.meta.url);
    const router = createRequire(studio.resolve('@tanstack/react-router'));
    const core = createRequire(router.resolve('@tanstack/router-core'));
    const { toCrossJSONAsync, fromCrossJSON } = (await import(
      pathToFileURL(core.resolve('seroval')).href
    )) as Seroval;
    const { createDefaultSerovalPlugins, defaultSerovalPlugins } =
      await import('@tanstack/react-router/ssr/client');
    const wire = async (res: { result?: unknown; error?: unknown }) =>
      fromCrossJSON(
        JSON.parse(
          JSON.stringify(
            await toCrossJSONAsync(res, { refs: new Map(), plugins: defaultSerovalPlugins }),
          ),
        ),
        { refs: new Map(), plugins: createDefaultSerovalPlugins() },
      ) as { result?: unknown; error?: unknown };
    // a thrown refusal reaches the page as its message alone: no name, no status, no wait
    const thrown = (await wire({ error: new StorageFrozenError(frozenSentence) })).error;
    expect(thrown).toBeInstanceOf(Error);
    expect(storeWaitMs(thrown)).toBeNull();
    // the refusal as writeDeck answers it now: a string, read on the page into an error with its wait
    const busy = await answeringRefusals(
      () => Promise.reject(new StorageFrozenError(frozenSentence)),
      () => undefined,
    );
    const received = (await wire({ result: busy })).result as string;
    let refusal: unknown;
    try {
      readWriteDeckAnswer(received);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      name: 'StorageFrozenError',
      message: frozenSentence,
      status: 503,
    });
    expect(storeWaitMs(refusal)).toBe(30_000);
    // the draft's first save: refused twice by the freeze, then written, its sentence shown meanwhile
    const at = { t: 0 };
    const shown: string[] = [];
    let sent = 0;
    const done = '{"ok":true,"revision":1,"entry":{},"changed":[],"warnings":[],"issues":[]}';
    const answer = await sendThroughFreeze(
      async () => {
        sent += 1;
        return readWriteDeckAnswer(
          (await wire({ result: sent <= 2 ? busy : done })).result as string,
        );
      },
      {
        waiting: (shownRefusal) => shown.push(shownRefusal.message),
        sleep: async (ms) => {
          at.t += ms;
        },
        now: () => at.t,
      },
    );
    expect(answer).toMatchObject({ ok: true, revision: 1 });
    expect(sent).toBe(3);
    expect(at.t).toBe(60_000);
    expect(shown).toEqual([frozenSentence, frozenSentence]);
  });
});
