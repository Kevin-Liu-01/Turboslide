import { describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';
import type { DeckDocument } from '@turboslide/schema/deck';
import { freeformDocument } from '@turboslide/schema/fixtures';
import { getAt } from '@turboslide/schema/pointer';

import { applyStreamEntries } from './checkpoint';
import { liveServesRead } from './decks';
import type { LiveDocument } from './room';

// The viewer read against the room's live document (the focus round, cycle 3 fix; b3 C3-R2,
// VERIFICATION C2-F21): `/deck`, `/print` and `getDeckSlides` build their payload from the room's
// document whenever it is not behind the store. On the memory tier the room applies a stream
// entry without moving `deck.revision` (the checkpointer moves it, 2 s after the last op), so the
// live document reads the store's revision while it carries the write; the cycle 2 rule took it
// only when strictly ahead and the viewer opened right after a fill write painted the fill of the
// checkpoint before it. Pure functions over the worked fixture; no store, no room.

const SLIDE = 'free';
const BLOCK = 'arrow';
const AUTHOR = {
  kind: 'human' as const,
  name: 'kevin',
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
};

function fillEntry(seq: number, rev: number, value: string): Entry {
  return {
    seq,
    rev,
    kind: 'edit',
    author: AUTHOR,
    clientId: 'cccccccccccccccccccccccccccccccc',
    opId: `cccccccccccccccccccccccccccccccc:${seq}`,
    mutations: [{ op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/fill', value }],
    at: '2026-09-18T10:00:00.000Z',
  };
}

function fillOf(document: DeckDocument): unknown {
  const blocks = getAt(document, `/slides/${SLIDE}/slots/main`) as
    Array<{ id: string; fill?: unknown }> | undefined;
  return blocks?.find((block) => block.id === BLOCK)?.fill;
}

function live(document: DeckDocument, seq: number): LiveDocument {
  return { seq, document };
}

describe('liveServesRead', () => {
  it('takes the live document at the store revision, the memory tier between checkpoints', () => {
    const stored = freeformDocument();
    const document = { ...stored, deck: { ...stored.deck } };
    expect(liveServesRead(live(document, 3), stored)).toBe(true);
  });

  it('takes the live document ahead of the store', () => {
    const stored = freeformDocument();
    const ahead = { ...stored, deck: { ...stored.deck, revision: stored.deck.revision + 1 } };
    expect(liveServesRead(live(ahead, 4), stored)).toBe(true);
  });

  it('leaves a live document behind the store to the store, and no room to the store', () => {
    const stored = freeformDocument();
    const behind = { ...stored, deck: { ...stored.deck, revision: stored.deck.revision - 1 } };
    expect(liveServesRead(live(behind, 2), stored)).toBe(false);
    expect(liveServesRead(null, stored)).toBe(false);
  });

  it('serves a fill write the stream carries before the checkpoint lands (shapes.reload-and-viewer)', () => {
    const stored = freeformDocument();
    expect(fillOf(stored)).toBeUndefined();
    const revision = stored.deck.revision;
    /* the room applies the entry: the fill lands, the revision stays the checkpoint's */
    const applied = applyStreamEntries(stored, [fillEntry(7, revision, 'green')]);
    expect(fillOf(applied)).toBe('green');
    expect(applied.deck.revision).toBe(revision);
    expect(getAt(applied, '/deck/revision')).toBe(revision);
    /* the store still holds the checkpoint: the read takes the live document */
    const room = live(applied, 7);
    expect(liveServesRead(room, stored)).toBe(true);
    const served = liveServesRead(room, stored) ? room.document : stored;
    expect(fillOf(served)).toBe('green');
  });
});
