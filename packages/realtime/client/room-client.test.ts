// The room client against the fake transport (gslides-parity SPEC-3 3.6, 0.7, 16.6): two clients
// typing in one paragraph converge, the pending and retained sets move as the spec says, undo
// transforms past later ops, an offline client keeps and persists its queue and lands it when the
// wire returns, a killed stream reconnects and replays, a position past the window resyncs, a
// closed tab's queue is offered to the next open, and a refused op comes back with its content.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import { memoryChannel } from '../src/memory.ts';
import { until } from '../src/channel-contract.ts';
import { fakeRoomServer, reconnectingTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore } from './pending-store.ts';
import { createRoomClient } from './room-client.ts';
import type { DocumentChange, RoomClientOptions, SyncStatus } from './room-client.ts';

const SLIDE = 'content-rule';
const BLOCK = 'p1';

const kevin: FakeIdentity = {
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  label: 'Titanium 471',
  role: 'editor',
  author: {
    kind: 'human',
    name: 'Titanium 471',
    principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  },
};
const maya: FakeIdentity = {
  principalId: 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  label: 'Cobalt 118',
  role: 'editor',
  author: {
    kind: 'human',
    name: 'Cobalt 118',
    principalId: 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  },
};
const viewer: FakeIdentity = {
  ...maya,
  principalId: 'anon_2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  role: 'viewer',
};

function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

function splice(at: number, remove: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove, insert };
}

function textOf(document: DeckDocument): string {
  return plainOf(String(getAt(document.slides[SLIDE], '/slots/left/1/text')));
}

/** The one transform this test needs: a splice against an earlier splice on the same Text. */
function testTransform(mutation: Mutation, against: Mutation): Mutation[] {
  if (mutation.op !== 'text.splice' || against.op !== 'text.splice') return [mutation];
  if (mutation.blockId !== against.blockId || mutation.path !== against.path) return [mutation];
  const shift = against.insert.length - against.remove;
  if (against.at <= mutation.at)
    return [{ ...mutation, at: Math.max(against.at, mutation.at + shift) }];
  return [mutation];
}

type Harness = {
  server: ReturnType<typeof fakeRoomServer>;
  client: (
    identity: FakeIdentity,
    extra?: Partial<RoomClientOptions>,
  ) => {
    room: ReturnType<typeof createRoomClient>;
    changes: DocumentChange[];
    statuses: SyncStatus[];
    transport: ReturnType<typeof reconnectingTransport>;
  };
};

function harness(): Harness {
  const channel = memoryChannel();
  const document = normalized();
  const server = fakeRoomServer({ deckId: 'gt-brand', channel, document });
  return {
    server,
    client(identity, extra = {}) {
      const changes: DocumentChange[] = [];
      const statuses: SyncStatus[] = [];
      const transport = reconnectingTransport(server, identity);
      const room = createRoomClient({
        deckId: 'gt-brand',
        transport,
        document: server.document(),
        seq: server.seq(),
        transform: testTransform,
        onChange: (change) => changes.push(change),
        onStatus: (status) => statuses.push(status),
        onResync: async () => server.document(),
        ...extra,
      });
      return { room, changes, statuses, transport };
    },
  };
}

const settled = async (rooms: ReturnType<typeof createRoomClient>[]): Promise<void> => {
  await until(
    () => rooms.every((room) => room.status().pending === 0 && room.status().connected),
    5000,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
};

describe('createRoomClient', () => {
  it('lets two clients type in one paragraph and converge on the server document', async () => {
    const h = harness();
    const a = h.client(kevin);
    const b = h.client(maya);
    a.room.start();
    b.room.start();
    await until(() => a.room.status().connected && b.room.status().connected);
    const before = textOf(a.room.document());
    // both type at once: A at the start, B ten characters in
    a.room.apply([splice(0, 0, 'A')], 'type');
    b.room.apply([splice(10, 0, 'B')], 'type');
    expect(a.room.status().pending).toBe(1);
    await settled([a.room, b.room]);
    const server = textOf(h.server.document());
    expect(textOf(a.room.document())).toBe(server);
    expect(textOf(b.room.document())).toBe(server);
    expect(server).toContain('A');
    expect(server).toContain('B');
    expect(server.length).toBe(before.length + 2);
    expect(a.room.status().retained).toBe(1);
    expect(b.room.status().retained).toBe(1);
    // a checkpoint covers the retained ops and moves the revision on both
    await h.server.checkpoint();
    await until(() => a.room.status().retained === 0 && b.room.status().retained === 0);
    expect(a.room.status().revision).toBe(h.server.document().deck.revision);
    expect(a.room.document().deck.revision).toBe(h.server.document().deck.revision);
    await a.room.stop();
    await b.room.stop();
  });

  it('acks the author’s own op without re-rendering and reports the save words’ counts', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    a.changes.length = 0;
    a.room.apply([splice(0, 0, 'x')], 'type');
    expect(a.changes.map((c) => c.reason)).toEqual(['local']);
    await settled([a.room]);
    // the own admitted op equals the pending one: no second change
    expect(a.changes.map((c) => c.reason)).toEqual(['local']);
    expect(a.room.status()).toMatchObject({
      pending: 0,
      retained: 1,
      connected: true,
      offline: false,
    });
    await a.room.stop();
  });

  it('moves an inverse past the operations that landed after it (undo per author, SPEC-3 3.5)', async () => {
    const h = harness();
    const a = h.client(kevin);
    const b = h.client(maya);
    a.room.start();
    b.room.start();
    await until(() => a.room.status().connected && b.room.status().connected);
    const applied = a.room.apply([splice(0, 0, 'A')], 'type');
    await settled([a.room]);
    b.room.apply([splice(0, 0, 'BB')], 'type');
    await settled([a.room, b.room]);
    await until(() => textOf(a.room.document()).startsWith('BBA'));
    // the recorded inverse removes offset 0; moved past B's insert it removes offset 2
    const inverse = a.room.transformSince(applied.inverse, applied.at);
    expect(inverse).toEqual([splice(2, 1, '')]);
    a.room.apply(inverse, 'undo');
    await settled([a.room, b.room]);
    expect(textOf(a.room.document()).startsWith('BBEvery')).toBe(true);
    expect(textOf(b.room.document())).toBe(textOf(a.room.document()));
    await a.room.stop();
    await b.room.stop();
  });

  it('keeps and persists the queue offline, then lands it when the wire returns', async () => {
    const h = harness();
    const store = memoryPendingStore();
    const a = h.client(kevin, { pendingStore: store });
    a.room.start();
    await until(() => a.room.status().connected);
    a.transport.offline(true);
    a.room.apply([splice(0, 0, 'o')], 'type');
    a.room.apply([splice(1, 0, 'f')], 'type', 'now');
    await until(() => a.room.status().offline, 3000);
    expect(a.room.status().pending).toBe(2);
    const persisted = await store.load('gt-brand');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.entries.filter((e) => e.seq === undefined)).toHaveLength(2);
    a.transport.offline(false);
    await until(() => a.room.status().pending === 0, 10_000);
    expect(a.room.status().offline).toBe(false);
    expect(textOf(h.server.document()).startsWith('of')).toBe(true);
    // the mirror now holds retained ops only
    const after = await store.load('gt-brand');
    expect(after[0]?.entries.every((e) => e.seq !== undefined)).toBe(true);
    await a.room.stop();
  });

  it('reconnects after a killed stream, replays what landed and resends what was pending', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    h.server.kill();
    await until(() => !a.room.status().connected);
    // an agent writes while the stream is down; the tab types too
    await h.server.appendExternal({ kind: 'agent', name: 'ci' }, [splice(0, 0, 'E')]);
    a.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => a.room.status().connected && a.room.status().pending === 0, 5000);
    expect(a.transport.opens()).toBe(2);
    const text = textOf(h.server.document());
    expect(text).toContain('E');
    expect(text).toContain('k');
    expect(textOf(a.room.document())).toBe(text);
    await a.room.stop();
  });

  it('resyncs when the position is more than 2,000 entries behind and rebases the pending ops', async () => {
    const h = harness();
    // a tab that resumes from an old payload: 2,001 entries landed since its position
    const stale = h.server.document();
    const staleSeq = h.server.seq();
    for (let i = 0; i < 2001; i += 1) {
      await h.server.appendExternal({ kind: 'agent', name: 'ci' }, [splice(0, 0, 'z')]);
    }
    const a = h.client(kevin, { document: stale, seq: staleSeq });
    a.room.apply([splice(0, 0, 'k')], 'type', 'now');
    a.room.start();
    await until(() => a.changes.some((c) => c.reason === 'resync'), 20_000);
    await until(() => a.room.status().pending === 0 && a.room.status().connected, 20_000);
    expect(textOf(h.server.document())).toContain('k');
    expect(textOf(a.room.document())).toBe(textOf(h.server.document()));
    expect(a.room.status().seq).toBe(h.server.seq());
    await a.room.stop();
  }, 30_000);

  it('offers a closed tab’s pending queue to the next open and applies it', async () => {
    const h = harness();
    const store = memoryPendingStore();
    const a = h.client(kevin, { pendingStore: store });
    a.room.start();
    await until(() => a.room.status().connected);
    a.transport.offline(true);
    a.room.apply([splice(0, 0, 'Q')], 'type');
    a.room.apply([splice(1, 0, 'R')], 'type');
    a.room.apply([splice(2, 0, 'S')], 'type', 'now');
    await until(() => a.room.status().offline, 3000);
    await a.room.stop();
    let offer:
      { count: number; apply: () => Promise<void>; discard: () => Promise<void> } | undefined;
    const b = h.client(kevin, { pendingStore: store, onPersisted: (o) => (offer = o) });
    b.room.start();
    await until(() => offer !== undefined);
    expect(offer?.count).toBe(3);
    await offer?.apply();
    await until(() => b.room.status().pending === 0 && b.room.status().connected, 5000);
    expect(textOf(h.server.document()).startsWith('QRS')).toBe(true);
    expect(await store.load('gt-brand')).toHaveLength(1);
    await b.room.stop();
  });

  it('returns a refused op to its author with its content and reverts the document', async () => {
    const h = harness();
    const rejected: { opId: string; reason: string }[] = [];
    const v = h.client(viewer, { onReject: (r) => rejected.push(r) });
    v.room.start();
    await until(() => v.room.status().connected);
    const before = textOf(v.room.document());
    v.room.apply([splice(0, 0, 'no')], 'type', 'now');
    expect(textOf(v.room.document()).startsWith('no')).toBe(true);
    await until(() => rejected.length === 1, 3000);
    expect(rejected[0]?.reason).toBe('forbidden');
    expect(v.room.rejects()[0]?.mutations).toEqual([splice(0, 0, 'no')]);
    expect(textOf(v.room.document())).toBe(before);
    expect(v.room.status().pending).toBe(0);
    await v.room.stop();
  });
});
