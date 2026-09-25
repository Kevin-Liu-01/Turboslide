// The blob tier's admission against this instance's mirror (docs/FOCUS.md rank 3; audit-slides
// rows 93, 95 and 96; docs/SYNC.md 3.3, invariant 2): every entry is transformed past the
// records between its base and the mirror's revision before the reducer judges it, so a
// candidate the reducer refuses against a mirror at or above the base is the reducer's answer
// and the loser reads its sentence (the sync round fix round, VERIFICATION.md sync pass 1 F2).
// A mirror the forced syncs could not bring up to the client's base is the one case a refusal
// says nothing: the answer is a resync at the head and the client sends the write again.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import type { Entry } from '@turboslide/realtime/channel';

import { TITLE_ROW } from '@turboslide/chrome/menus/strings';
import { BASE_SEQ_WINDOW } from '@turboslide/realtime/protocol';
import { UNTITLED_DECK_TITLE } from '@turboslide/schema/reduce';
import { DEFAULT_BLANK_TITLE } from '@turboslide/store/templates';

import {
  BETWEEN_MAX_ENTRIES,
  BLOB_APPEND_RETRIES,
  STALE_AFTER_REMOTE,
  admitOnBlob,
  betweenEntries,
  blobRefusal,
  filterEventForReader,
  landedOf,
  landedOwn,
  liveAtLeast,
  namesUnknownAsset,
  splitReplayed,
  storeBusyResult,
  storeRefusalOf,
  transformEntry,
  undoOfSplices,
} from './room';

const splice = (at: number, remove: number, insert: string): Mutation => ({
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at,
  remove,
  insert,
});

describe('undoOfSplices', () => {
  it('answers the splices that undo a refused entry by length, newest first, and skips the rest', () => {
    expect(
      undoOfSplices([
        splice(7, 0, 'abc'),
        {
          op: 'text.mark',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          range: [0, 2],
          edit: { kind: 'marks', set: { b: true } },
        } as Mutation,
        splice(2, 3, ''),
      ]),
    ).toEqual([splice(2, 0, 'xxx'), splice(7, 3, '')]);
    expect(undoOfSplices([])).toEqual([]);
  });
});

describe('blobRefusal', () => {
  it("turns an invalid candidate judged against a mirror still behind the client's base into a resync", () => {
    expect(
      blobRefusal(15, 14, {
        opId: 'c:1',
        reason: 'invalid',
        message: 'Slide "split-5" already exists',
      }),
    ).toEqual({ kind: 'resync' });
  });

  it("keeps the reducer's sentence for a candidate judged at the base or past it, since the entry was transformed past what landed (docs/SYNC.md invariant 2; the sync round fix round, F2)", () => {
    const gone = { opId: 'c:1', reason: 'invalid' as const, message: 'No slide "split-5"' };
    // the slide was deleted by the record between the base and the head: the loser's card
    expect(blobRefusal(15, 16, gone)).toEqual({ kind: 'reject', rejected: gone });
    const exists = {
      opId: 'c:1',
      reason: 'invalid' as const,
      message: 'Slide "split-5" already exists',
    };
    // the sentence travels as the reducer wrote it, without the two revisions appended
    expect(blobRefusal(15, 15, exists)).toEqual({ kind: 'reject', rejected: exists });
  });

  it('leaves a refusal without a message and a refusal for another reason as they are', () => {
    const silent = { opId: 'c:2', reason: 'invalid' as const };
    expect(blobRefusal(15, 15, silent)).toEqual({ kind: 'reject', rejected: silent });
    const large = { opId: 'c:3', reason: 'too-large' as const };
    expect(blobRefusal(15, 14, large)).toEqual({ kind: 'reject', rejected: large });
  });
});

describe('liveAtLeast', () => {
  type FakeRoom = Parameters<typeof liveAtLeast>[0];
  const roomAt = (revisions: number[], tier: 'blob' | 'memory' = 'blob') => {
    let reads = 0;
    const syncs: boolean[] = [];
    const revisionNow = (): number => revisions[Math.min(reads, revisions.length - 1)] ?? 0;
    const room = {
      tier,
      live: async () => {
        const revision = revisionNow();
        reads += 1;
        return { seq: revision, document: { deck: { revision }, slides: {} } };
      },
      store: {
        sync: async (force?: boolean) => {
          syncs.push(force === true);
        },
      },
    } as unknown as FakeRoom;
    return { room, syncs };
  };

  it('syncs the blob mirror by force until it reaches the revision the caller knows, then answers it', async () => {
    // the mirror is behind by two commits; each forced sync pulls one
    const { room, syncs } = roomAt([5, 6, 7]);
    const live = await liveAtLeast(room, 7);
    expect(live.document.deck.revision).toBe(7);
    expect(syncs).toEqual([true, true]);
  });

  it('answers the mirror as it stands when it is at or above the revision, with no sync', async () => {
    const { room, syncs } = roomAt([7]);
    expect((await liveAtLeast(room, 7)).document.deck.revision).toBe(7);
    expect((await liveAtLeast(room, 3)).document.deck.revision).toBe(7);
    expect(syncs).toEqual([]);
  });

  it('reads the head once past the sync window when no revision is named, and gives up after the attempts', async () => {
    const fresh = roomAt([5, 6]);
    expect((await liveAtLeast(fresh.room, undefined)).document.deck.revision).toBe(6);
    expect(fresh.syncs).toEqual([true]);
    const stuck = roomAt([5]);
    expect((await liveAtLeast(stuck.room, 9, 2)).document.deck.revision).toBe(5);
    expect(stuck.syncs).toEqual([true, true]);
  });

  it('leaves the memory and redis tiers alone: the stream is the live document there', async () => {
    const { room, syncs } = roomAt([5, 9], 'memory');
    expect((await liveAtLeast(room, 9)).document.deck.revision).toBe(5);
    expect(syncs).toEqual([]);
  });
});

describe('admitOnBlob and a resend (the focus round, cycle 3, VERIFICATION C2-F24; the sync round, docs/SYNC.md 3.2)', () => {
  type Room = Parameters<typeof admitOnBlob>[0];
  type Input = Parameters<typeof admitOnBlob>[1];

  const documentAt = (revision: number): DeckDocument => {
    const result = validateDocument(workedDocument());
    if (!result.ok || result.deck === null) throw new Error('fixture');
    return { deck: { ...result.deck, revision }, slides: result.slides };
  };

  /**
   * A blob tier room over one document: the appends are recorded and answered at the next
   * revision; `records` are the mirror's entries above the base, as `since` reads them (a record
   * that names its origin carries `covers`, blob.ts entryOfRecord).
   */
  const roomOver = (deckId: string, revision: number, records: Entry[] = []) => {
    const appends: { base: number; opIds: string[]; mutations: Mutation[][] }[] = [];
    const room = {
      deckId,
      tier: 'blob',
      live: async () => ({ seq: revision, document: documentAt(revision) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (
          _deckId: string,
          base: number,
          entries: { opId: string; mutations?: Mutation[] }[],
        ) => {
          appends.push({
            base,
            opIds: entries.map((entry) => entry.opId),
            mutations: entries.map((entry) => entry.mutations ?? []),
          });
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
        since: async (_deckId: string, seq: number, limit: number) =>
          records.filter((entry) => entry.seq > seq).slice(0, limit),
      },
    } as unknown as Room;
    return { room, appends };
  };
  /** The stream entry of a record another tab's POST made: its origin names the tab and the op ids. */
  const covering = (
    seq: number,
    clientId: string,
    opIds: string[],
    mutations: Mutation[],
  ): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author: { kind: 'human', name: 'Titanium 471' },
    clientId,
    opId: `store:${seq}`,
    mutations,
    at: '2026-09-21T19:00:00.000Z',
    covers: opIds,
  });

  const post = (opId: string, insert: string): Input =>
    ({
      post: {
        clientId: 'c1',
        base: { seq: 7 },
        entries: [{ opId, kind: 'edit', mutations: [splice(0, 0, insert)] }],
      },
      bytes: 128,
      identity: { kind: 'anonymous', identity: 'anon' },
      author: { kind: 'human', name: 'Titanium 471' },
      role: 'editor',
    }) as unknown as Input;

  it('carries an edit’s history label on the candidate the append commits (the product round fix round)', async () => {
    const notes: (string | undefined)[] = [];
    const room = {
      deckId: 'noted-deck',
      tier: 'blob',
      live: async () => ({ seq: 7, document: documentAt(7) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (
          _deckId: string,
          base: number,
          entries: { opId: string; note?: string }[],
        ) => {
          for (const entry of entries) notes.push(entry.note);
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
      },
    } as unknown as Room;
    const input = post('c1:9', 'k');
    (input.post.entries[0] as { note?: string }).note = 'Brand kit: Primary';
    input.post.entries.push({
      opId: 'c1:10',
      kind: 'edit',
      mutations: [splice(1, 0, 'q')],
    } as (typeof input.post.entries)[number]);
    const result = await admitOnBlob(room, input);
    expect(result.ok).toBe(true);
    expect(notes).toEqual(['Brand kit: Primary', undefined]);
  });

  it('answers a resent op id from the record above its base that names it, with one entry per op id at that seq, and appends nothing twice (docs/SYNC.md 3.2)', async () => {
    // the first attempt committed as revision 8 on some instance and its answer was lost; the
    // record's origin names the tab and its two op ids, so this instance, at 8, answers from it
    const record = covering(8, 'c1', ['c1:1', 'c1:2'], [splice(0, 0, 'qr')]);
    const { room, appends } = roomOver('dedup-deck', 8, [record]);
    const resend = post('c1:1', 'q');
    resend.post.entries.push({
      opId: 'c1:2',
      kind: 'edit',
      mutations: [splice(1, 0, 'r')],
    } as (typeof resend.post.entries)[number]);
    const again = await admitOnBlob(room, resend);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.entries.map((entry) => [entry.opId, entry.seq, entry.clientId])).toEqual([
      ['c1:1', 8, 'c1'],
      ['c1:2', 8, 'c1'],
    ]);
    // the fold rides the first synthesized entry alone, so a client applies it once
    expect(again.entries.map((entry) => entry.mutations?.length)).toEqual([1, 0]);
    expect(again.entries.every((entry) => entry.covers?.join() === 'c1:1,c1:2')).toBe(true);
    expect(again.revision).toBe(8);
    expect(appends).toHaveLength(0);
    // a new op id in the same resend is placed past the record and committed
    const mixed = post('c1:1', 'q');
    mixed.post.entries.push({
      opId: 'c1:3',
      kind: 'edit',
      mutations: [splice(0, 0, 's')],
    } as (typeof mixed.post.entries)[number]);
    const next = await admitOnBlob(room, mixed);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.entries.map((entry) => [entry.opId, entry.seq])).toEqual([
      ['c1:1', 8],
      ['c1:3', 9],
    ]);
    expect(appends).toHaveLength(1);
    // the fresh op was transformed past the record's insert before it was placed (3.3)
    expect(appends[0]?.mutations).toEqual([[splice(2, 0, 's')]]);
    // the record the answer names was not in the tab's stream: it rides the answer as `between`
    // only when something sits under the first entry, and here the record is the first entry
    expect(next.between).toBeUndefined();
  });

  it('splits a POST into the ops a record covers and the fresh ones, one synthesized entry per covered op id', () => {
    const a = covering(8, 'c1', ['c1:1', 'c1:2'], [splice(0, 0, 'ab')]);
    const b = covering(9, 'c1', ['c1:4'], [splice(2, 0, 'd')]);
    const other = covering(10, 'c2', ['c2:1'], [splice(0, 0, 'z')]);
    const entries = ['c1:2', 'c1:3', 'c1:4', 'c1:1'].map((opId) => ({
      opId,
      kind: 'edit' as const,
      mutations: [splice(0, 0, 'x')],
    }));
    const split = splitReplayed(entries, [a, b, other]);
    expect(split.fresh.map((entry) => entry.opId)).toEqual(['c1:3']);
    // in the records' order, the fold on each record's first synthesized entry alone
    expect(split.replayed.map((entry) => [entry.opId, entry.seq, entry.mutations?.length])).toEqual(
      [
        ['c1:1', 8, 1],
        ['c1:2', 8, 0],
        ['c1:4', 9, 1],
      ],
    );
    // a record without an origin covers nothing
    expect(splitReplayed(entries, [{ ...a, covers: undefined }]).fresh).toHaveLength(4);
  });

  it("answers a write the store did not move for as the transient 503, never a resync at the client's own base (C3-F1 `decks.access.paint`)", async () => {
    const appends: number[] = [];
    const room = {
      deckId: 'same-revision-deck',
      tier: 'blob',
      live: async () => ({ seq: 7, document: documentAt(7) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (_deckId: string, base: number) => {
          appends.push(base);
          // the store did not move and the write did not land (a claim held elsewhere)
          return { ok: false, head: base, count: 0 };
        },
      },
    } as unknown as Room;
    const result = await admitOnBlob(room, post('c1:1', 'q'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).toMatchObject({ status: 503, code: 'store_busy', retryAfterMs: 1000 });
    expect(appends).toEqual([7]);
    // the store moved: the resync at its head, as before
    const moved = {
      ...room,
      channel: { append: async () => ({ ok: false, head: 9, count: 2 }) },
    } as unknown as Room;
    const resync = await admitOnBlob(moved, post('c1:2', 'r'));
    expect(resync.ok).toBe(false);
    if (!resync.ok) expect(resync).toMatchObject({ status: 409, code: 'resync', head: 9 });
  });

  it("shapes the store's refusal as a 503 with the wait it named, in the product's words", () => {
    const rateLimited = new Error(
      'Vercel Blob: Too many requests please lower the number of concurrent requests  - try again in 60 seconds.',
    );
    (rateLimited as { retryAfter?: number }).retryAfter = 60;
    const busy = storeBusyResult(rateLimited);
    expect(busy).toMatchObject({
      ok: false,
      status: 503,
      code: 'store_busy',
      retryAfterMs: 60_000,
    });
    if (!busy.ok)
      expect(busy.message).toBe('The store did not answer; the change is sent again in 60 s');
    const timeout = storeBusyResult(null);
    if (!timeout.ok) expect(timeout.retryAfterMs).toBe(1000);
  });

  it('judges a candidate naming an asset the mirror lacks once more on a mirror synced by force, so a block.insert right after its asset.add lands whatever instance it meets (C3S-F6, SEAM-F2)', async () => {
    // the instance's mirror is at the client's revision but does not hold the asset the
    // asset.add on another instance committed; a forced sync brings it
    let synced = 0;
    let withAsset = false;
    const document = (): DeckDocument => {
      const base = documentAt(24);
      if (!withAsset) return base;
      const [existing] = Object.values(base.deck.assets);
      if (existing === undefined) throw new Error('the fixture has no asset');
      return {
        deck: {
          ...base.deck,
          assets: { ...base.deck.assets, 'burst-2-a1b2': { ...existing, id: 'burst-2-a1b2' } },
        },
        slides: base.slides,
      };
    };
    const appends: { base: number; opIds: string[] }[] = [];
    const room = {
      deckId: 'asset-visibility-deck',
      tier: 'blob',
      live: async () => ({ seq: 24, document: document() }),
      store: {
        sync: async (force?: boolean) => {
          synced += 1;
          if (force === true) withAsset = true;
        },
      },
      channel: {
        append: async (_deckId: string, base: number, entries: { opId: string }[]) => {
          appends.push({ base, opIds: entries.map((entry) => entry.opId) });
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
        // the log this mirror holds: nothing names the insert (the refusal's covering read)
        since: async () => [],
      },
    } as unknown as Room;
    const insert = {
      post: {
        clientId: 'c1',
        base: { seq: 24 },
        entries: [
          {
            opId: 'c1:7',
            kind: 'edit',
            mutations: [
              {
                op: 'block.insert',
                slideId: 'content-rule',
                slot: 'left',
                block: { id: 'pic-burst', type: 'picture', asset: 'burst-2-a1b2' },
              },
            ],
          },
        ],
      },
      bytes: 256,
      identity: { kind: 'anonymous', identity: 'anon' },
      author: { kind: 'human', name: 'Titanium 471' },
      role: 'editor',
    } as unknown as Input;
    const result = await admitOnBlob(room, insert);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.rejected).toEqual([]);
    expect(appends).toEqual([{ base: 24, opIds: ['c1:7'] }]);
    // the forced sync ran once for the POST (liveForBase's sync at the base, then the asset's)
    expect(synced).toBeGreaterThanOrEqual(1);
    expect(withAsset).toBe(true);
    // the same candidate with the asset still missing after the sync is the refusal as before
    // (another deck and op id, so the admitted op memory replays nothing)
    withAsset = false;
    const stubborn = {
      ...room,
      deckId: 'asset-visibility-deck-stubborn',
      store: { sync: async () => undefined },
    } as unknown as Room;
    const again = {
      ...insert,
      post: {
        ...insert.post,
        entries: insert.post.entries.map((entry) => ({ ...entry, opId: 'c1:8' })),
      },
    } as unknown as Input;
    const refused = await admitOnBlob(stubborn, again);
    expect(refused.ok).toBe(true);
    if (refused.ok) {
      expect(refused.rejected).toHaveLength(1);
      expect(namesUnknownAsset(refused.rejected[0]!)).toBe(true);
      expect(refused.rejected[0]!.message).toContain('is not in deck.json');
    }
    expect(namesUnknownAsset({ opId: 'x', reason: 'stale' })).toBe(false);
    expect(namesUnknownAsset({ opId: 'x', reason: 'invalid', message: 'No slide "z"' })).toBe(
      false,
    );
  });

  it("answers the store's refusal at a route's boundary as the product's 503 with retry-after, and leaves every other error to the route (C3S-F4)", () => {
    const edge = new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden');
    const busy = storeRefusalOf(edge);
    expect(busy).toEqual({
      status: 503,
      body: {
        error: 'store_busy',
        message: 'The store did not answer; the change is sent again in 1 s',
      },
      retryAfterS: 1,
    });
    const rateLimited = new Error('Vercel Blob: Too many requests - try again in 7 seconds.');
    (rateLimited as { retryAfter?: number }).retryAfter = 7;
    expect(storeRefusalOf(rateLimited)?.retryAfterS).toBe(7);
    expect(storeRefusalOf(new RangeError('No deck x'))).toBeNull();
    expect(storeRefusalOf(new TypeError('a bug'))).toBeNull();
    expect(storeRefusalOf(null)).toBeNull();
  });

  it('spells the blank deck title the reducer follows the heading from as the store and the chrome spell it (docs/SYNC.md 3.4)', () => {
    expect(UNTITLED_DECK_TITLE).toBe(DEFAULT_BLANK_TITLE);
    expect(UNTITLED_DECK_TITLE).toBe(TITLE_ROW.untitled);
  });
});

describe('the ops answer carries the entries under the admitted ones (the stream fix round two; VERIFICATION C3S-F8)', () => {
  const storeEntry = (seq: number, insert = 'x'): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author: { kind: 'human', name: 'Cobalt 118' },
    clientId: 'store',
    opId: `store:${seq}`,
    mutations: [splice(0, 0, insert)],
    at: '2026-09-18T18:00:00.000Z',
  });

  it('filters the given entries to the window between the base and the first admitted seq, oldest first, and answers nothing over the bound', () => {
    const entries = [storeEntry(58), storeEntry(56), storeEntry(55), storeEntry(57)];
    expect(betweenEntries(entries, 55, 58)?.map((entry) => entry.seq)).toEqual([56, 57]);
    expect(betweenEntries(entries, 57, 58)).toBeUndefined();
    expect(betweenEntries([], 55, 58)).toBeUndefined();
    const many = Array.from({ length: BETWEEN_MAX_ENTRIES + 1 }, (_, i) => storeEntry(i + 2, 'x'));
    expect(betweenEntries(many, 1, BETWEEN_MAX_ENTRIES + 3)).toBeUndefined();
    expect(
      betweenEntries(many.slice(0, BETWEEN_MAX_ENTRIES), 1, BETWEEN_MAX_ENTRIES + 3),
    ).toHaveLength(BETWEEN_MAX_ENTRIES);
    const wide = [storeEntry(56, 'y'.repeat(300 * 1024))];
    expect(betweenEntries(wide, 55, 57)).toBeUndefined();
  });

  it("answers the records committed between the tab's base and its own write, read from the mirror, and nothing when the write follows the base at once", async () => {
    type Room = Parameters<typeof admitOnBlob>[0];
    type Input = Parameters<typeof admitOnBlob>[1];
    const documentAt = (revision: number): DeckDocument => {
      const result = validateDocument(workedDocument());
      if (!result.ok || result.deck === null) throw new Error('fixture');
      return { deck: { ...result.deck, revision }, slides: result.slides };
    };
    const sinces: [number, number][] = [];
    // the instance's mirror is at 56 (a second picture's asset.add committed on another
    // instance); the tab's stream never delivered 56 and its base is 55
    const room = {
      deckId: 'between-deck',
      tier: 'blob',
      live: async () => ({ seq: 56, document: documentAt(56) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (_deckId: string, base: number, entries: { opId: string }[]) => ({
          ok: true,
          entries: entries.map((entry) => ({ ...entry, seq: base + 1 })),
        }),
        since: async (_deckId: string, seq: number, limit: number) => {
          sinces.push([seq, limit]);
          return [storeEntry(56, 'O')].filter((entry) => entry.seq > seq).slice(0, limit);
        },
      },
    } as unknown as Room;
    const input = (base: number, opId: string): Input =>
      ({
        post: {
          clientId: 'c1',
          base: { seq: base },
          entries: [{ opId, kind: 'edit', mutations: [splice(0, 0, 'g')] }],
        },
        bytes: 128,
        identity: { kind: 'anonymous', identity: 'anon' },
        author: { kind: 'human', name: 'Titanium 471' },
        role: 'editor',
      }) as unknown as Input;
    const behind = await admitOnBlob(room, input(55, 'c1:1'));
    expect(behind.ok).toBe(true);
    if (!behind.ok) return;
    expect(behind.entries.map((entry) => entry.seq)).toEqual([57]);
    expect(behind.between?.map((entry) => [entry.seq, entry.opId])).toEqual([[56, 'store:56']]);
    expect(sinces).toEqual([[55, 1]]);
    // a tab at the head: nothing between, and the log is not read
    const current = await admitOnBlob(room, input(56, 'c1:2'));
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.between).toBeUndefined();
    expect(sinces).toHaveLength(1);
  });
});

describe('the append that meets a store moved under it (the stream fix round two fix round; VERIFICATION C3T-F2)', () => {
  type Room = Parameters<typeof admitOnBlob>[0];
  type Input = Parameters<typeof admitOnBlob>[1];
  const documentAt = (revision: number): DeckDocument => {
    const result = validateDocument(workedDocument());
    if (!result.ok || result.deck === null) throw new Error('fixture');
    return { deck: { ...result.deck, revision }, slides: result.slides };
  };
  const storeEntry = (seq: number): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author: { kind: 'human', name: 'Cobalt 118' },
    clientId: 'store',
    opId: `store:${seq}`,
    mutations: [],
    at: '2026-09-18T21:20:05.000Z',
  });
  const input = (base: number, opId: string): Input =>
    ({
      post: {
        clientId: 'c1',
        base: { seq: base },
        entries: [{ opId, kind: 'edit', mutations: [splice(0, 0, 'g')] }],
      },
      bytes: 128,
      identity: { kind: 'anonymous', identity: 'anon' },
      author: { kind: 'human', name: 'Titanium 471' },
      role: 'editor',
    }) as unknown as Input;

  it('syncs the mirror to the head the store named, places the entries against it and appends once more, in place of the resync the tab answered with a read and a resend', async () => {
    // the instance's mirror is at 7 and the tab wrote against 7; the second upload's asset.add
    // committed 8 on another instance while the first picture's insert was being placed here,
    // so the first append meets the store at 8 (run 2's trace: the 409 in 387 ms, the resync
    // read, the resend at base 8)
    let revision = 7;
    const syncs: boolean[] = [];
    const appends: { base: number; opIds: string[] }[] = [];
    const sinces: [number, number][] = [];
    const room = {
      deckId: 'moved-under-deck',
      tier: 'blob',
      live: async () => ({ seq: revision, document: documentAt(revision) }),
      store: {
        sync: async (force?: boolean) => {
          syncs.push(force === true);
          if (force === true) revision = 8;
        },
      },
      channel: {
        append: async (_deckId: string, base: number, entries: { opId: string }[]) => {
          appends.push({ base, opIds: entries.map((entry) => entry.opId) });
          if (base < 8) return { ok: false, head: 8, count: 8 - base };
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
        since: async (_deckId: string, seq: number, limit: number) => {
          sinces.push([seq, limit]);
          return [storeEntry(8)].filter((entry) => entry.seq > seq).slice(0, limit);
        },
      },
    } as unknown as Room;
    const result = await admitOnBlob(room, input(7, 'c1:1'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.entries.map((entry) => [entry.opId, entry.seq])).toEqual([['c1:1', 9]]);
    expect(result.rejected).toEqual([]);
    expect(result.revision).toBe(9);
    // one append at the mirror's revision, the forced sync, one append at the head
    expect(appends).toEqual([
      { base: 7, opIds: ['c1:1'] },
      { base: 8, opIds: ['c1:1'] },
    ]);
    expect(syncs).toEqual([true]);
    // the record committed between the tab's base and its write rides the answer (C3S-F8)
    expect(result.between?.map((entry) => entry.seq)).toEqual([8]);
    expect(sinces).toEqual([[7, 1]]);
    expect(BLOB_APPEND_RETRIES).toBe(1);
  });

  it('keeps the resync when the mirror cannot reach the head the store named, and the 503 when the store did not move', async () => {
    // the forced sync brings nothing (the pull could not prove the document yet)
    const syncs: boolean[] = [];
    let appends = 0;
    const stuck = {
      deckId: 'moved-under-stuck-deck',
      tier: 'blob',
      live: async () => ({ seq: 7, document: documentAt(7) }),
      store: {
        sync: async (force?: boolean) => {
          syncs.push(force === true);
        },
      },
      channel: {
        append: async () => {
          appends += 1;
          return { ok: false, head: 8, count: 1 };
        },
      },
    } as unknown as Room;
    const refused = await admitOnBlob(stuck, input(7, 'c1:2'));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused).toMatchObject({ status: 409, code: 'resync', head: 8 });
    // the append ran once: a second attempt against the same mirror would meet the same head
    expect(appends).toBe(1);
    expect(syncs.length).toBeGreaterThan(0);
    // the store at the mirror's revision that did not take the write is the transient, as before
    const held = {
      ...stuck,
      deckId: 'moved-under-held-deck',
      channel: { append: async () => ({ ok: false, head: 7, count: 0 }) },
    } as unknown as Room;
    const busy = await admitOnBlob(held, input(7, 'c1:3'));
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy).toMatchObject({ status: 503, code: 'store_busy' });
  });

  it("answers the reducer's sentence when the entries do not place against the head the sync brought, so the loser reads why (docs/SYNC.md invariant 2; the sync round fix round, F2)", async () => {
    // the head deleted the slide the tab's splice names: transformed past the record under the
    // head, the splice is judged against the document without its slide, and the refusal is the
    // reducer's answer to the write, not a resync (blobRefusal; row sync.structural.concurrent)
    let revision = 7;
    const room = {
      deckId: 'moved-under-gone-deck',
      tier: 'blob',
      live: async () => {
        const document = documentAt(revision);
        if (revision >= 8) {
          const { ['content-rule']: _gone, ...slides } = document.slides;
          return { seq: revision, document: { deck: document.deck, slides } };
        }
        return { seq: revision, document };
      },
      store: {
        sync: async (force?: boolean) => {
          if (force === true) revision = 8;
        },
      },
      channel: {
        append: async (_deckId: string, base: number) =>
          base < 8 ? { ok: false, head: 8, count: 1 } : { ok: true, entries: [] },
        // the record under the head touches nothing the splice names, so the transform passes
        // it through and the reducer meets the slide gone from the synced document
        since: async () => [
          { ...storeEntry(8), mutations: [{ op: 'deck.set', path: '/title', value: 'Moved' }] },
        ],
      },
    } as unknown as Room;
    const result = await admitOnBlob(room, input(7, 'c1:4'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.entries).toEqual([]);
    expect(result.rejected).toEqual([
      { opId: 'c1:4', reason: 'invalid', message: 'No slide "content-rule"' },
    ]);
    expect(result.head).toBe(8);
  });
});

describe('the server transforms before it places, on the blob tier too (the sync round, docs/SYNC.md 3.3, 3.2; invariants 2 and 3)', () => {
  type Room = Parameters<typeof admitOnBlob>[0];
  type Input = Parameters<typeof admitOnBlob>[1];
  const documentAt = (revision: number): DeckDocument => {
    const result = validateDocument(workedDocument());
    if (!result.ok || result.deck === null) throw new Error('fixture');
    return { deck: { ...result.deck, revision }, slides: result.slides };
  };
  /** A record another instance committed: a store entry without an origin, as every record before the round. */
  const landed = (
    seq: number,
    mutations: Mutation[],
    covers?: string[],
    clientId = 'store',
  ): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author: { kind: 'human', name: 'Cobalt 118' },
    clientId,
    opId: `store:${seq}`,
    mutations,
    at: '2026-09-21T19:00:00.000Z',
    ...(covers === undefined ? {} : { covers }),
  });
  const input = (base: number, entries: { opId: string; mutations: Mutation[] }[]): Input =>
    ({
      post: {
        clientId: 'c1',
        base: { seq: base },
        entries: entries.map((entry) => ({ ...entry, kind: 'edit' })),
      },
      bytes: 128,
      identity: { kind: 'anonymous', identity: 'anon' },
      author: { kind: 'human', name: 'Titanium 471' },
      role: 'editor',
    }) as unknown as Input;
  /**
   * A room whose mirror moves as `revisions` says on every forced sync, whose log is `records`
   * and whose append answers by `headAt`: the head the store names for an append at that base,
   * or a commit at base plus one.
   */
  const roomOf = (records: Entry[], revisions: number[], headAt: Record<number, number> = {}) => {
    let at = 0;
    const revision = (): number => revisions[Math.min(at, revisions.length - 1)] ?? 0;
    const appends: { base: number; mutations: Mutation[][] }[] = [];
    const sinces: [number, number][] = [];
    const room = {
      deckId: 'transform-deck',
      tier: 'blob',
      live: async () => ({ seq: revision(), document: documentAt(revision()) }),
      store: {
        sync: async (force?: boolean) => {
          if (force === true) at += 1;
        },
      },
      channel: {
        append: async (_deckId: string, base: number, entries: { mutations?: Mutation[] }[]) => {
          appends.push({ base, mutations: entries.map((entry) => entry.mutations ?? []) });
          const head = headAt[base];
          if (head !== undefined) return { ok: false, head, count: head - base };
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
        since: async (_deckId: string, seq: number, limit: number) => {
          sinces.push([seq, limit]);
          return records.filter((entry) => entry.seq > seq).slice(0, limit);
        },
      },
    } as unknown as Room;
    return { room, appends, sinces };
  };

  it('places a POST at base n against a document at n plus 2 with its splice shifted past the two records, and answers the placed mutations', async () => {
    // two other writers inserted three characters each at offset 0 of the block (run 4 part a)
    const records = [landed(8, [splice(0, 0, 'pa1')]), landed(9, [splice(0, 0, 'pb1')])];
    const { room, appends, sinces } = roomOf(records, [9]);
    const result = await admitOnBlob(
      room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    // the later arrival lands after both inserts: offset 6, never the verbatim 0
    expect(appends).toEqual([{ base: 9, mutations: [[splice(6, 0, 'g')]] }]);
    expect(result.entries.map((entry) => [entry.opId, entry.seq])).toEqual([['c1:1', 10]]);
    expect(result.entries[0]?.mutations).toEqual([splice(6, 0, 'g')]);
    // the two records ride the answer under the entry (C3S-F8), from the same read: one since
    expect(result.between?.map((entry) => entry.seq)).toEqual([8, 9]);
    expect(sinces).toEqual([[7, 2]]);
  });

  it('ties two inserts at one offset by the two client ids when the POST declares the rule, and by server order when it does not (the sync round fix round, F3)', async () => {
    // another client inserted three characters at offset 0; this POST inserts at 0 too
    const post = (insertTie?: 'client-id') => {
      const row = input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]);
      return insertTie === undefined
        ? row
        : ({ ...row, post: { ...row.post, insertTie } } as typeof row);
    };
    // the record's author sorts after c1: c1 keeps the left and its insert stays at 0
    const later = roomOf([landed(8, [splice(0, 0, 'pa1')], undefined, 'zz')], [8]);
    const left = await admitOnBlob(later.room, post('client-id'));
    expect(left.ok && left.entries[0]?.mutations).toEqual([splice(0, 0, 'g')]);
    expect(later.appends).toEqual([{ base: 8, mutations: [[splice(0, 0, 'g')]] }]);
    // the record's author sorts before c1: c1 lands after the three characters
    const earlier = roomOf([landed(8, [splice(0, 0, 'pa1')], undefined, 'a0')], [8]);
    const right = await admitOnBlob(earlier.room, post('client-id'));
    expect(right.ok && right.entries[0]?.mutations).toEqual([splice(3, 0, 'g')]);
    // a record written without an origin travels as `store`, which every client id sorts before
    const store = roomOf([landed(8, [splice(0, 0, 'pa1')])], [8]);
    const beforeStore = await admitOnBlob(store.room, post('client-id'));
    expect(beforeStore.ok && beforeStore.entries[0]?.mutations).toEqual([splice(0, 0, 'g')]);
    // no declaration: server order, the later arrival lands after, as before the round
    const plain = roomOf([landed(8, [splice(0, 0, 'pa1')], undefined, 'zz')], [8]);
    const order = await admitOnBlob(plain.room, post());
    expect(order.ok && order.entries[0]?.mutations).toEqual([splice(3, 0, 'g')]);
    // the rows the server transforms past carry the tie per record; a refused entry's own undo
    // is moved past by server order whatever the POST declared
    const rows = landedOf(
      [landed(8, [splice(0, 0, 'pa1')], undefined, 'zz')],
      post('client-id').post,
    );
    expect(rows).toEqual([{ mutation: splice(0, 0, 'pa1'), insertTie: 'left' }]);
    expect(landedOwn([splice(0, 0, 'x')])).toEqual([
      { mutation: splice(0, 0, 'x'), insertTie: 'right' },
    ]);
    expect(transformEntry([splice(0, 0, 'g')], rows)).toEqual([splice(0, 0, 'g')]);
    expect(transformEntry([splice(0, 0, 'g')], landedOwn([splice(0, 0, 'pa1')]))).toEqual([
      splice(3, 0, 'g'),
    ]);
  });

  it('re-places from the original mutations past every record between the base and the new head after a moved head, not the transformed candidates past the delta', async () => {
    // the mirror is at 8 when the POST arrives (record 8 landed); record 9 lands under the
    // append; the retry syncs to 9 and transforms the original splice at 0 past both records
    const records = [landed(8, [splice(0, 0, 'pa1')]), landed(9, [splice(0, 0, 'pb1')])];
    const { room, appends, sinces } = roomOf(records, [8, 9], { 8: 9 });
    const result = await admitOnBlob(
      room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(appends).toEqual([
      { base: 8, mutations: [[splice(3, 0, 'g')]] },
      // from the original at 0 past 3 and 3 characters: 6, never 3 transformed again past both (9)
      { base: 9, mutations: [[splice(6, 0, 'g')]] },
    ]);
    expect(sinces).toEqual([
      [7, 1],
      [7, 2],
    ]);
    expect(result.entries.map((entry) => entry.seq)).toEqual([10]);
    expect(result.between?.map((entry) => entry.seq)).toEqual([8, 9]);
  });

  it('answers a resend from the records above its base with their seqs and commits nothing, and the same when the record appears only after the sync inside the retry loop', async () => {
    // the record the first attempt made sits above the base and names the op id
    const record = landed(8, [splice(0, 0, 'g')], ['c1:1'], 'c1');
    const direct = roomOf([record], [8]);
    const answered = await admitOnBlob(
      direct.room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(answered.ok).toBe(true);
    if (!answered.ok) throw new Error(answered.message);
    expect(answered.entries.map((entry) => [entry.opId, entry.seq, entry.clientId])).toEqual([
      ['c1:1', 8, 'c1'],
    ]);
    expect(answered.revision).toBe(8);
    expect(direct.appends).toEqual([]);
    // the mirror is at 7 when the resend arrives: the record is not in it yet, the append meets
    // the store at 8, the sync brings the record and the origin check answers before a second
    // placement (JC rejection 2: the check runs again after every sync in the loop)
    const late = roomOf([record], [7, 8], { 7: 8 });
    const afterSync = await admitOnBlob(
      late.room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(afterSync.ok).toBe(true);
    if (!afterSync.ok) throw new Error(afterSync.message);
    expect(afterSync.entries.map((entry) => [entry.opId, entry.seq])).toEqual([['c1:1', 8]]);
    // one append, the one the store refused; nothing committed after the sync
    expect(late.appends.map((row) => row.base)).toEqual([7]);
    expect(late.sinces).toEqual([[7, 1]]);
  });

  it('answers a POST more than BASE_SEQ_WINDOW behind the mirror as a resync at the head, before any placement', async () => {
    const far = roomOf([], [BASE_SEQ_WINDOW + 8]);
    const result = await admitOnBlob(
      far.room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).toMatchObject({ status: 409, code: 'resync', head: BASE_SEQ_WINDOW + 8 });
    expect(far.appends).toEqual([]);
    expect(far.sinces).toEqual([]);
    // exactly the window behind is still placed
    const edge = roomOf([], [BASE_SEQ_WINDOW + 7]);
    const placed = await admitOnBlob(
      edge.room,
      input(7, [{ opId: 'c1:2', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(placed.ok).toBe(true);
    expect(edge.appends).toHaveLength(1);
  });

  it('returns a text op to its author with a sentence when a whole Text rewrite of its block landed first', async () => {
    const rewrite: Mutation = {
      op: 'block.set',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      value: 'Rewritten',
    };
    const { room, appends } = roomOf([landed(8, [rewrite])], [8]);
    const result = await admitOnBlob(
      room,
      input(7, [{ opId: 'c1:1', mutations: [splice(0, 0, 'g')] }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.entries).toEqual([]);
    expect(result.rejected).toEqual([
      { opId: 'c1:1', reason: 'stale', message: STALE_AFTER_REMOTE },
    ]);
    expect(appends).toEqual([]);
  });

  it('answers an entry the reducer refused from the record that names its op id, at or under the base and after one forced sync when the record reaches the log late, and keeps the sentence when no record names it (the vector round fix round; VERIFICATION.md "Vector round, pass 1" finding 1)', async () => {
    // preview 3's star: the block is in the live document from the first attempt, so a second
    // placement of the same op reads "already exists"
    const insertAgain = {
      op: 'block.insert',
      slideId: 'content-rule',
      slot: 'left',
      block: { id: 'p1', type: 'paragraph', text: 'Again' },
    } as unknown as Mutation;
    const sentence = 'Block "p1" already exists on slide "content-rule"';
    // the record sits at the base: the origin check above the base never reads it
    const under = roomOf([landed(7, [insertAgain], ['c1:1'], 'c1')], [7]);
    const answered = await admitOnBlob(
      under.room,
      input(7, [
        { opId: 'c1:1', mutations: [insertAgain] },
        { opId: 'c1:2', mutations: [splice(0, 0, 'g')] },
      ]),
    );
    expect(answered.ok).toBe(true);
    if (!answered.ok) throw new Error(answered.message);
    expect(answered.rejected).toEqual([]);
    expect(answered.entries.map((entry) => [entry.opId, entry.seq, entry.clientId])).toEqual([
      ['c1:1', 7, 'c1'],
      ['c1:2', 8, 'c1'],
    ]);
    expect(answered.entries[0]?.covers).toEqual(['c1:1']);
    expect(answered.between).toBeUndefined();
    // the fresh op alone was appended; the window under the base was read once, on the refusal
    expect(under.appends).toEqual([{ base: 7, mutations: [[splice(0, 0, 'g')]] }]);
    expect(under.sinces).toEqual([[0, 7]]);

    // the commit reached the document before its record reached the log: the window reads
    // nothing, one forced sync brings the record, and the entry is answered from it
    const late = (() => {
      let synced = false;
      const record = landed(8, [insertAgain], ['c1:1'], 'c1');
      const sinces: [number, number][] = [];
      const appends: number[] = [];
      const room = {
        deckId: 'late-record-deck',
        tier: 'blob',
        live: async () => ({ seq: synced ? 8 : 7, document: documentAt(synced ? 8 : 7) }),
        store: {
          sync: async (force?: boolean) => {
            if (force === true) synced = true;
          },
        },
        channel: {
          append: async (_deckId: string, base: number) => {
            appends.push(base);
            return { ok: true, entries: [] };
          },
          since: async (_deckId: string, seq: number, limit: number) => {
            sinces.push([seq, limit]);
            return synced ? [record].filter((entry) => entry.seq > seq).slice(0, limit) : [];
          },
        },
      } as unknown as Room;
      return { room, sinces, appends };
    })();
    const afterSync = await admitOnBlob(
      late.room,
      input(7, [{ opId: 'c1:1', mutations: [insertAgain] }]),
    );
    expect(afterSync.ok).toBe(true);
    if (!afterSync.ok) throw new Error(afterSync.message);
    expect(afterSync.rejected).toEqual([]);
    expect(afterSync.entries.map((entry) => [entry.opId, entry.seq])).toEqual([['c1:1', 8]]);
    expect(afterSync.revision).toBe(8);
    expect(late.appends).toEqual([]);
    expect(late.sinces).toEqual([
      [0, 7],
      [0, 8],
    ]);

    // no record names the op: the reducer's sentence, as before, after the one sync
    const genuine = roomOf([], [7, 7]);
    const refused = await admitOnBlob(
      genuine.room,
      input(7, [{ opId: 'c1:1', mutations: [insertAgain] }]),
    );
    expect(refused.ok).toBe(true);
    if (!refused.ok) throw new Error(refused.message);
    expect(refused.entries).toEqual([]);
    expect(refused.rejected).toEqual([{ opId: 'c1:1', reason: 'invalid', message: sentence }]);
    expect(genuine.appends).toEqual([]);
    expect(genuine.sinces).toEqual([
      [0, 7],
      [0, 7],
    ]);
  });

  it("delivers a viewer's stream every op with the notes stripped, as a commenter's (docs/SYNC.md 3.7, invariant 6)", () => {
    const reader = { role: 'viewer' as const, via: 'link', showNames: false, readComments: false };
    const entry: Entry = landed(8, [
      { op: 'slide.set', slideId: 'content-rule', path: '/notes', value: 'private' },
      splice(0, 0, 'g'),
    ]);
    const op = filterEventForReader({ type: 'op', entry }, reader);
    expect(op).toEqual({ type: 'op', entry: { ...entry, mutations: [splice(0, 0, 'g')] } });
    const ops = filterEventForReader({ type: 'ops', entries: [entry] }, reader);
    expect(ops).toEqual({ type: 'ops', entries: [{ ...entry, mutations: [splice(0, 0, 'g')] }] });
    // an entry that carried notes alone reaches no viewer
    const notesOnly = landed(9, [
      { op: 'slide.set', slideId: 'content-rule', path: '/notes', value: 'p' },
    ]);
    expect(filterEventForReader({ type: 'op', entry: notesOnly }, reader)).toBeNull();
    // an editor reads the notes as before
    expect(filterEventForReader({ type: 'op', entry }, { ...reader, role: 'editor' })).toEqual({
      type: 'op',
      entry,
    });
    // a comment entry still needs the comments right
    const comment: Entry = { ...landed(10, []), kind: 'comment', mutations: undefined } as Entry;
    expect(filterEventForReader({ type: 'op', entry: comment }, reader)).toBeNull();
  });
});
