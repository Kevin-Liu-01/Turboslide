// The blob tier's admission against this instance's mirror (docs/FOCUS.md rank 3; audit-slides
// rows 93, 95 and 96): a candidate the reducer refuses is a refusal of the client's write only
// when the document it was judged against is the one the client wrote against. Judged against a
// document at another revision (the instance behind the client, or ahead of it), the answer is a
// resync at the head and the client transforms and sends again; a real refusal names both
// revisions so a probe records them on every refused write.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import type { Entry } from '@turboslide/realtime/channel';

import {
  BETWEEN_MAX_ENTRIES,
  admitOnBlob,
  betweenEntries,
  blobAdmittedBefore,
  blobRefusal,
  closeRoom,
  liveAtLeast,
  namesUnknownAsset,
  rememberBlobAdmitted,
  storeBusyResult,
  storeRefusalOf,
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
  it('turns an invalid candidate judged against another revision into a resync', () => {
    expect(
      blobRefusal(15, 14, {
        opId: 'c:1',
        reason: 'invalid',
        message: 'Slide "split-5" already exists',
      }),
    ).toEqual({ kind: 'resync' });
    expect(
      blobRefusal(15, 16, { opId: 'c:1', reason: 'invalid', message: 'No slide "split-5"' }),
    ).toEqual({ kind: 'resync' });
  });

  it('keeps a refusal judged against the base and names both revisions in it', () => {
    const refusal = blobRefusal(15, 15, {
      opId: 'c:1',
      reason: 'invalid',
      message: 'Slide "split-5" already exists',
    });
    expect(refusal.kind).toBe('reject');
    if (refusal.kind === 'reject') {
      expect(refusal.rejected.opId).toBe('c:1');
      expect(refusal.rejected.reason).toBe('invalid');
      expect(refusal.rejected.message).toBe(
        'Slide "split-5" already exists (this instance\'s document is at revision 15; the write\'s base was 15)',
      );
    }
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

describe('admitOnBlob and the admitted op memory (the focus round, cycle 3; VERIFICATION C2-F24)', () => {
  type Room = Parameters<typeof admitOnBlob>[0];
  type Input = Parameters<typeof admitOnBlob>[1];

  const documentAt = (revision: number): DeckDocument => {
    const result = validateDocument(workedDocument());
    if (!result.ok || result.deck === null) throw new Error('fixture');
    return { deck: { ...result.deck, revision }, slides: result.slides };
  };

  /** A blob tier room over one document: the appends are recorded and answered at the next revision. */
  const roomOver = (deckId: string, revision: number) => {
    const appends: { base: number; opIds: string[] }[] = [];
    const room = {
      deckId,
      tier: 'blob',
      live: async () => ({ seq: revision, document: documentAt(revision) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (_deckId: string, base: number, entries: { opId: string }[]) => {
          appends.push({ base, opIds: entries.map((entry) => entry.opId) });
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
      },
    } as unknown as Room;
    return { room, appends };
  };

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

  it('answers a resent op id with the entry its first admission made and appends nothing twice', async () => {
    const { room, appends } = roomOver('dedup-deck', 7);
    const first = await admitOnBlob(room, post('c1:1', 'q'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.entries.map((entry) => [entry.opId, entry.seq])).toEqual([['c1:1', 8]]);
    expect(appends).toHaveLength(1);
    // the client gave up on the POST and sends the same op again
    const again = await admitOnBlob(room, post('c1:1', 'q'));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.entries).toEqual(first.entries);
    expect(appends).toHaveLength(1);
    // a new op id is admitted as before
    const next = await admitOnBlob(room, post('c1:2', 'r'));
    expect(next.ok).toBe(true);
    expect(appends).toHaveLength(2);
    expect(blobAdmittedBefore('dedup-deck', 'c1:2')?.seq).toBe(8);
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

  it('keeps the last 512 op ids of a deck and forgets the deck with its room', async () => {
    const entries = Array.from({ length: 600 }, (_, i) => ({
      seq: i + 1,
      rev: i,
      kind: 'edit' as const,
      author: { kind: 'human' as const, name: 'Titanium 471' },
      clientId: 'c1',
      opId: `c1:${i + 1}`,
      mutations: [],
      at: '2026-09-17T00:00:00.000Z',
    }));
    rememberBlobAdmitted('cap-deck', entries);
    expect(blobAdmittedBefore('cap-deck', 'c1:1')).toBeUndefined();
    expect(blobAdmittedBefore('cap-deck', 'c1:88')).toBeUndefined();
    expect(blobAdmittedBefore('cap-deck', 'c1:89')?.seq).toBe(89);
    expect(blobAdmittedBefore('cap-deck', 'c1:600')?.seq).toBe(600);
    await closeRoom('cap-deck');
    expect(blobAdmittedBefore('cap-deck', 'c1:600')).toBeUndefined();
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
