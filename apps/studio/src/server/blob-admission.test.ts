// The blob tier's admission against this instance's mirror (docs/FOCUS.md rank 3; audit-slides
// rows 93, 95 and 96): a candidate the reducer refuses is a refusal of the client's write only
// when the document it was judged against is the one the client wrote against. Judged against a
// document at another revision (the instance behind the client, or ahead of it), the answer is a
// resync at the head and the client transforms and sends again; a real refusal names both
// revisions so a probe records them on every refused write.
import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import { blobRefusal, liveAtLeast, undoOfSplices } from './room';

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
