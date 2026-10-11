// The room client never writes into a document it was given or has handed out (hardening CRIT-M17,
// the room client half of HR-RT#5a). The admission's incremental path shares every slide it does
// not touch with the base document (`applyMutationsTouched`); the browser keeps `applyMutations`
// and its deep copy. Every document here is deep frozen: the start document, each document the
// client hands to `onChange`, and each answer of `onResync`, so a write through a shared reference
// throws (the module runs in strict mode) instead of changing a copy another reader holds.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import { deepFreeze } from '../src/admission-decks.ts';
import { until } from '../src/channel-contract.ts';
import { memoryChannel } from '../src/memory.ts';
import { fakeRoomServer, tabTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore } from './pending-store.ts';
import { createRoomClient, defaultTransform } from './room-client.ts';
import type { PersistedOffer, Rejected, RoomClientOptions } from './room-client.ts';

const SLIDE = 'content-rule';
const BLOCK = 'p1';

function person(n: number): FakeIdentity {
  const principalId = `anon_${n}f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b`;
  const label = ['Titanium 471', 'Cobalt 118'][n] ?? `Person ${n}`;
  return {
    principalId,
    label,
    role: 'editor',
    author: { kind: 'human', name: label, principalId },
  };
}
const kevin = person(0);
const maya = person(1);

function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

function textOf(document: DeckDocument): string {
  return plainOf(String(getAt(document.slides[SLIDE], '/slots/left/1/text')));
}

function splice(at: number, insert: string, remove = 0): Mutation {
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove, insert };
}

/** A frozen copy: the server keeps its own document unfrozen. */
const frozen = (document: DeckDocument): DeckDocument => deepFreeze(structuredClone(document));

function room() {
  const server = fakeRoomServer({
    deckId: 'gt-brand',
    channel: memoryChannel(),
    document: normalized(),
  });
  const store = memoryPendingStore();
  const tab = (identity: FakeIdentity, extra: Partial<RoomClientOptions> = {}) => {
    const notices: Rejected[] = [];
    let offer: PersistedOffer | undefined;
    const transport = tabTransport(server, identity);
    const client = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: frozen(server.document()),
      seq: server.seq(),
      transform: defaultTransform,
      pendingStore: store,
      onChange: (change) => void deepFreeze(change.document),
      onReject: (notice) => notices.push(notice),
      onPersisted: (value) => (offer = value),
      onResync: async () => frozen(server.document()),
      ...extra,
    });
    return { client, notices, offer: () => offer, transport };
  };
  return { server, store, tab };
}

const settled = async (client: ReturnType<typeof createRoomClient>): Promise<void> => {
  await until(() => client.status().pending === 0 && client.status().connected, 5000);
};

describe('the room client on frozen documents (CRIT-M17)', () => {
  it('types, takes remote entries over pending ops, undoes, resyncs and applies a saved queue', async () => {
    const h = room();
    const start = textOf(h.server.document());
    const a = h.tab(kevin);
    const b = h.tab(maya, { pendingStore: undefined, onPersisted: undefined });
    a.client.start();
    b.client.start();
    await until(() => a.client.status().connected && b.client.status().connected);

    // A types at the end while B types in front: A's pending op is moved past B's entry
    const typed = a.client.apply([splice(start.length, ' Alpha')], 'type', 'text');
    b.client.apply([splice(0, 'Zulu ')], 'type', 'now');
    await settled(b.client);
    await until(() => textOf(a.client.document()).startsWith('Zulu '), 5000);
    a.client.flush();
    await settled(a.client);
    expect(textOf(h.server.document())).toBe(`Zulu ${start} Alpha`);

    // A undoes its word: the inverse is moved past B's entry
    const inverse = a.client.transformSince(typed.inverse, typed.at);
    a.client.apply(inverse, 'undo', 'now');
    await settled(a.client);
    await until(() => textOf(b.client.document()) === `Zulu ${start}`, 5000);

    // a resync reads the server's document again
    await a.client.resync();
    expect(textOf(a.client.document())).toBe(`Zulu ${start}`);

    // A goes offline, types, and closes; the next tab applies the saved queue
    a.transport.offline(true);
    a.client.apply([splice(`Zulu ${start}`.length, ' Bravo')], 'type', 'now');
    await a.client.stop();
    b.client.apply([splice(0, 'Yankee ')], 'type', 'now');
    await settled(b.client);
    const c = h.tab(kevin);
    c.client.start();
    await until(() => c.offer() !== undefined && c.client.status().connected, 5000);
    await c.offer()?.apply?.();
    await settled(c.client);

    const end = `Yankee Zulu ${start} Bravo`;
    expect(textOf(h.server.document())).toBe(end);
    expect(textOf(c.client.document())).toBe(end);
    await until(() => textOf(b.client.document()) === end, 5000);
    for (const tab of [a, b, c]) {
      expect(tab.notices).toEqual([]);
      expect(Object.isFrozen(tab.client.document().slides[SLIDE])).toBe(true);
    }
    for (const tab of [b, c]) await tab.client.stop();
  });
});
