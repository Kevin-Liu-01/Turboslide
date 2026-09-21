import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { freeformDocument } from '@turboslide/schema/fixtures';

import { LIVE_AT_LEAST_ATTEMPTS, LIVE_AT_LEAST_PAUSE_MS, liveAtLeast } from './room';
import type { Room } from './room';

// The restore's resync bound on the blob tier (the product round, docs/PRODUCT.md 8.2 the
// recorded classes; RETURN ship.md section 5 `versions.undo-restore`): a reader that names the
// revision it learned from a write's answer gets a document at or above it once the mirror
// catches up, inside about three seconds, and the bound costs the request's own syncs alone.

function documentAt(revision: number): DeckDocument {
  const base = freeformDocument();
  return { ...base, deck: { ...base.deck, revision } };
}

/** A blob tier room whose mirror reaches `reaches` after `lag` forced syncs. */
function room(reaches: number, lag: number): Room & { syncs: () => number } {
  let synced = 0;
  let revision = reaches - 1;
  const fake = {
    deckId: 'q4-review',
    tier: 'blob',
    store: {
      sync: async () => {
        synced += 1;
        if (synced >= lag) revision = reaches;
        return {};
      },
    },
    live: async () => ({ seq: 0, document: documentAt(revision) }),
    syncs: () => synced,
  };
  return fake as unknown as Room & { syncs: () => number };
}

describe('liveAtLeast', () => {
  it('bounds the wait at about three seconds, over a second', () => {
    expect(LIVE_AT_LEAST_ATTEMPTS * LIVE_AT_LEAST_PAUSE_MS).toBeGreaterThanOrEqual(2_500);
    expect((LIVE_AT_LEAST_ATTEMPTS - 1) * LIVE_AT_LEAST_PAUSE_MS).toBeLessThanOrEqual(3_000);
  });

  it('syncs until the mirror reaches the revision and stops there', async () => {
    const r = room(12, 3);
    const live = await liveAtLeast(r, 12, LIVE_AT_LEAST_ATTEMPTS, 1);
    expect(live.document.deck.revision).toBe(12);
    expect(r.syncs()).toBe(3);
  });

  it('answers the document it has after the attempts when the mirror never reaches the revision', async () => {
    const r = room(12, 99);
    const live = await liveAtLeast(r, 12, 4, 1);
    expect(live.document.deck.revision).toBe(11);
    expect(r.syncs()).toBe(4);
  });

  it('syncs once for a read that names no revision and not at all off the blob tier', async () => {
    const r = room(12, 1);
    await liveAtLeast(r, undefined, LIVE_AT_LEAST_ATTEMPTS, 1);
    expect(r.syncs()).toBe(1);
    const memory = { ...room(12, 1), tier: 'memory' } as unknown as Room & { syncs: () => number };
    await liveAtLeast(memory, 12, LIVE_AT_LEAST_ATTEMPTS, 1);
    expect(memory.syncs()).toBe(0);
  });
});
