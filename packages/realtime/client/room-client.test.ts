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

import type { Entry, RoomEvent } from '../src/channel.ts';
import { memoryChannel } from '../src/memory.ts';
import { until } from '../src/channel-contract.ts';
import type { OpsPost, PresencePost } from '../src/protocol.ts';
import { fakeRoomServer, reconnectingTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore, pendingKey, unsavedCount } from './pending-store.ts';
import {
  HEARTBEAT_MS,
  OFFLINE_AFTER_MS,
  createRoomClient,
  memoryOpCounter,
} from './room-client.ts';
import type {
  DocumentChange,
  OpenOptions,
  OpsResponse,
  PersistedOffer,
  RoomClientOptions,
  RoomTransport,
  SyncStatus,
} from './room-client.ts';

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

  // ------------------------------------------------------------------------------------------
  // Finding 33: the acknowledged revision is applied before the next write, and a freshly opened
  // page holds its first write until the replay catches the stream up (SPEC-3 3.6). These use a
  // hand-driven transport so the hello, the replay and the POST response interleave exactly.

  const CLIENT_A = 'a'.repeat(32);
  const CLIENT_B = 'b'.repeat(32);

  /** A transport the test fires events into, recording every POST body and answering each op. */
  function drivenTransport(options: {
    author: FakeIdentity['author'];
    /** the seq the first admitted op takes; each op takes the next */
    fromSeq: number;
    /** the server revision after each admitted op (the blob tier moves it per op) */
    revisionAfter: (admitted: number) => number;
  }): RoomTransport & { fire: (event: RoomEvent) => void; posts: OpsPost[] } {
    const posts: OpsPost[] = [];
    let onEvent: ((event: RoomEvent) => void) | null = null;
    let head = options.fromSeq - 1;
    let admitted = 0;
    return {
      fire(event) {
        onEvent?.(event);
      },
      posts,
      open(o) {
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        const entries: Entry[] = body.entries.map((entry) => {
          head += 1;
          admitted += 1;
          return {
            seq: head,
            rev: 0,
            kind: 'edit',
            author: options.author,
            clientId: body.clientId,
            opId: entry.opId,
            mutations: (entry as { mutations?: Mutation[] }).mutations ?? [],
            at: new Date().toISOString(),
          };
        });
        return { ok: true, entries, rejected: [], head, revision: options.revisionAfter(admitted) };
      },
      async postPresence() {
        return undefined;
      },
    };
  }

  it('applies the acknowledged revision so a second write before the echo is not stale (finding 33)', async () => {
    const document = normalized();
    const openSeq = 5;
    const baseRev = document.deck.revision;
    const transport = drivenTransport({
      author: kevin.author,
      fromSeq: openSeq + 1,
      revisionAfter: (n) => baseRev + n,
    });
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: openSeq,
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    transport.fire({
      type: 'hello',
      seq: openSeq,
      revision: baseRev,
      clientId: CLIENT_A,
      role: 'editor',
      clients: [],
      editing: 1,
      tier: 'memory',
    });
    const first = room.apply([splice(0, 0, 'a')], 'type', 'now');
    expect((await first.settled) as { seq: number }).toHaveProperty('seq');
    // the acknowledged revision is adopted, so the next write does not base on a stale one
    expect(room.status().revision).toBe(baseRev + 1);
    // a second write issued before the first op's stream echo bases on the advanced position
    const second = room.apply([splice(1, 0, 'b')], 'type', 'now');
    expect((await second.settled) as { seq: number }).toHaveProperty('seq');
    expect(room.rejects()).toHaveLength(0);
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1]!.base.seq).toBeGreaterThan(transport.posts[0]!.base.seq);
    await room.stop();
  });

  it('holds the first write until the replay catches up, then sends it transformed (finding 33)', async () => {
    const document = normalized();
    const openSeq = 5; // the page was handed the document at this stream position
    const headSeq = 6; // a write landed just before it opened, so the stream head is ahead
    const baseRev = document.deck.revision;
    const transport = drivenTransport({
      author: kevin.author,
      fromSeq: headSeq + 1,
      revisionAfter: () => baseRev,
    });
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: openSeq,
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    // hello names a head ahead of this client's position: the replay is still pending
    transport.fire({
      type: 'hello',
      seq: headSeq,
      revision: baseRev,
      clientId: CLIENT_B,
      role: 'editor',
      clients: [],
      editing: 1,
      tier: 'memory',
    });
    // the rep types immediately, before the replay has arrived
    const applied = room.apply([splice(0, 0, 'k')], 'type', 'now');
    await new Promise((resolve) => setTimeout(resolve, 30));
    // the first write is held on the stale base, and the keystroke is not lost (still pending)
    expect(transport.posts).toHaveLength(0);
    expect(room.status().pending).toBe(1);
    // the entry that landed before the open arrives on the stream (another author inserted at 0)
    transport.fire({
      type: 'op',
      entry: {
        seq: headSeq,
        rev: baseRev,
        kind: 'edit',
        author: maya.author,
        clientId: 'server',
        opId: 'server:1',
        mutations: [splice(0, 0, 'E')],
        at: new Date().toISOString(),
      },
    });
    expect((await applied.settled) as { seq: number }).toHaveProperty('seq');
    // now it flushed, on the caught-up base and transformed past the landed insert
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]!.base.seq).toBe(headSeq);
    expect(transport.posts[0]!.entries[0]).toMatchObject({
      mutations: [splice(1, 0, 'k')],
    });
    await room.stop();
  });

  // ------------------------------------------------------------------------------------------
  // Hotfix 2 (build-4/hotfix-2.md, causes A2, A3 and the late checkpoint): the blob tier commits
  // one ops POST as one revision and answers every entry of the batch at that revision as its
  // seq; the client must settle each of them, take a remote batch whole, keep its position at the
  // fresh document's revision after a resync, and never report a revision behind the server's.

  /** A blob tier transport: one POST is one revision, every entry of it at that seq. */
  function blobTransport(options: {
    author: FakeIdentity['author'];
    head: number;
    /** answers the first POST with a 409 resync naming this head, then admits */
    resyncOnceTo?: number;
  }): RoomTransport & {
    fire: (event: RoomEvent) => void;
    posts: OpsPost[];
    opens: OpenOptions[];
    leaves: PresencePost[];
    /** holds every POST until released */
    hold: (on: boolean) => void;
  } {
    const posts: OpsPost[] = [];
    const opens: OpenOptions[] = [];
    const leaves: PresencePost[] = [];
    let onEvent: ((event: RoomEvent) => void) | null = null;
    let head = options.head;
    let refused = false;
    let held: (() => void) | null = null;
    let holding = false;
    return {
      fire(event) {
        onEvent?.(event);
      },
      posts,
      opens,
      leaves,
      hold(on) {
        holding = on;
        if (!on && held !== null) {
          held();
          held = null;
        }
      },
      open(o) {
        opens.push(o);
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        if (holding) await new Promise<void>((resolve) => (held = resolve));
        if (options.resyncOnceTo !== undefined && !refused) {
          refused = true;
          head = options.resyncOnceTo;
          return {
            ok: false,
            status: 409,
            code: 'resync',
            message: `The deck moved to revision ${head}; reload and rebase`,
            head,
          };
        }
        head += 1;
        const entries: Entry[] = body.entries.map((entry) => ({
          seq: head,
          rev: head - 1,
          kind: 'edit',
          author: options.author,
          clientId: body.clientId,
          opId: entry.opId,
          mutations: (entry as { mutations?: Mutation[] }).mutations ?? [],
          at: new Date().toISOString(),
        }));
        return { ok: true, entries, rejected: [], head, revision: head };
      },
      async postPresence(body, presenceOptions) {
        if (presenceOptions?.leave === true) leaves.push(body);
      },
    };
  }

  const hello = (clientId: string, seq: number, revision: number): RoomEvent => ({
    type: 'hello',
    seq,
    revision,
    clientId,
    role: 'editor',
    clients: [],
    editing: 1,
    tier: 'blob',
  });

  it('settles every entry of a batch the blob tier answered at one seq, drops the store echo and takes a remote batch whole (hotfix 2, A2)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = blobTransport({ author: kevin.author, head: base });
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
    });
    room.start();
    transport.fire(hello(CLIENT_A, base, base));
    const before = textOf(room.document());
    // three bursts inside one flush window: one POST with three entries
    const a = room.apply([splice(0, 0, 'a')], 'type');
    const b = room.apply([splice(1, 0, 'b')], 'type');
    const c = room.apply([splice(2, 0, 'c')], 'type');
    await room.flush();
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]!.entries).toHaveLength(3);
    const outcomes = await Promise.all([a.settled, b.settled, c.settled]);
    for (const outcome of outcomes) expect(outcome).toEqual({ seq: base + 1 });
    // every op settled: nothing pending, the position and the revision are the answer's
    expect(room.status()).toMatchObject({
      pending: 0,
      retained: 3,
      seq: base + 1,
      revision: base + 1,
    });
    expect(textOf(room.document())).toBe(`abc${before}`);
    // the store echo of the record (the same revision, the folded mutations) repeats nothing
    transport.fire({
      type: 'op',
      entry: {
        seq: base + 1,
        rev: base,
        kind: 'edit',
        author: kevin.author,
        clientId: 'store',
        opId: 'store:1',
        mutations: [splice(0, 0, 'abc')],
        at: new Date().toISOString(),
      },
    });
    transport.fire({
      type: 'checkpoint',
      revision: base + 1,
      fromSeq: base + 1,
      toSeq: base + 1,
      author: kevin.author,
      note: '',
    });
    expect(textOf(room.document())).toBe(`abc${before}`);
    expect(room.status()).toMatchObject({ retained: 0, seq: base + 1, revision: base + 1 });
    expect(room.document().deck.revision).toBe(base + 1);
    // another client's batch: two entries at one seq, both applied
    for (const [i, insert] of ['X', 'Y'].entries()) {
      transport.fire({
        type: 'op',
        entry: {
          seq: base + 2,
          rev: base + 1,
          kind: 'edit',
          author: maya.author,
          clientId: CLIENT_B,
          opId: `${CLIENT_B}:${i + 1}`,
          mutations: [splice(i, 0, insert)],
          at: new Date().toISOString(),
        },
      });
    }
    expect(textOf(room.document())).toBe(`XYabc${before}`);
    expect(room.status().seq).toBe(base + 2);
    // a second delivery of a sibling is a duplicate
    transport.fire({
      type: 'op',
      entry: {
        seq: base + 2,
        rev: base + 1,
        kind: 'edit',
        author: maya.author,
        clientId: CLIENT_B,
        opId: `${CLIENT_B}:2`,
        mutations: [splice(1, 0, 'Y')],
        at: new Date().toISOString(),
      },
    });
    expect(textOf(room.document())).toBe(`XYabc${before}`);
    await room.stop();
  });

  it('moves the position to the fresh document’s revision after a resync on the blob tier, so later entries drain and the pending op is re-sent on the new base (hotfix 2, A3)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const moved = base + 3;
    const transport = blobTransport({ author: kevin.author, head: base, resyncOnceTo: moved });
    const fresh: DeckDocument = {
      deck: { ...document.deck, revision: moved },
      slides: document.slides,
    };
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
      onResync: async () => {
        // the flush the resync schedules is held, so the position is read before its answer
        transport.hold(true);
        return fresh;
      },
    });
    room.start();
    transport.fire(hello(CLIENT_A, base, base));
    const applied = room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => changes.some((change) => change.reason === 'resync'), 3000);
    // the position is the fresh document's revision, not the last hello's
    expect(room.status().seq).toBe(moved);
    expect(room.status().revision).toBe(moved);
    expect(room.status().pending).toBe(1);
    // the pending op flushes again on the new base and settles at the next revision
    await until(() => transport.posts.length === 2, 3000);
    expect(transport.posts[1]!.base.seq).toBe(moved);
    transport.hold(false);
    expect((await applied.settled) as { seq: number }).toEqual({ seq: moved + 1 });
    expect(room.status().pending).toBe(0);
    // an entry at the next position is not buffered: it applies at once
    transport.fire({
      type: 'op',
      entry: {
        seq: moved + 2,
        rev: moved + 1,
        kind: 'edit',
        author: maya.author,
        clientId: CLIENT_B,
        opId: `${CLIENT_B}:1`,
        mutations: [splice(0, 0, 'Z')],
        at: new Date().toISOString(),
      },
    });
    expect(room.status().seq).toBe(moved + 2);
    expect(textOf(room.document()).startsWith('Zk')).toBe(true);
    await room.stop();
  });

  it('never reports a revision behind the server’s when a checkpoint frame of an earlier revision arrives late (hotfix 2)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = blobTransport({ author: kevin.author, head: base });
    const revisions: number[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      transform: testTransform,
      onChange: () => undefined,
      onStatus: (status) => revisions.push(status.revision),
    });
    room.start();
    transport.fire(hello(CLIENT_A, base, base));
    const first = room.apply([splice(0, 0, 'a')], 'type', 'now');
    await first.settled;
    const second = room.apply([splice(1, 0, 'b')], 'type', 'now');
    await second.settled;
    expect(room.status().revision).toBe(base + 2);
    // the stream's instance delivers the first commit's checkpoint after the second answer
    transport.fire({
      type: 'checkpoint',
      revision: base + 1,
      fromSeq: base + 1,
      toSeq: base + 1,
      author: kevin.author,
      note: '',
    });
    expect(room.status().revision).toBe(base + 2);
    expect(room.document().deck.revision).toBe(base + 2);
    expect(revisions.every((revision, i) => i === 0 || revision >= revisions[i - 1]!)).toBe(true);
    await room.stop();
  });

  it('sends the tab’s earlier client ids as retire on every open and posts the leave before waiting on a POST in flight (hotfix 2, B1)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = blobTransport({ author: kevin.author, head: base });
    const earlier = ['c'.repeat(32), 'd'.repeat(32)];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      retire: earlier,
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    expect(transport.opens).toHaveLength(1);
    expect(transport.opens[0]!.retire).toEqual(earlier);
    transport.fire(hello(CLIENT_A, base, base));
    transport.hold(true);
    room.apply([splice(0, 0, 'a')], 'type', 'now');
    await until(() => transport.posts.length === 1, 1000);
    const stopping = room.stop();
    // the leave is on the wire while the POST is still held
    await until(() => transport.leaves.length === 1, 1000);
    expect(transport.leaves[0]!.clientId).toBe(CLIENT_A);
    transport.hold(false);
    await stopping;
  });
});

// ---------------------------------------------------------------------------------------------
// Round five (gslides-parity SPEC-5-amendments A3; B7): one client id per tab, the rebase on a 409
// that carries the entries since the base, a record's echo as the tab's own acknowledgement, the
// tab's own persisted queue replayed on its own, an answer that names an op already landed, the
// heartbeat pause of a hidden tab, the offline word, and the author a returned op names.

describe('createRoomClient, round five (SPEC-5-amendments A3)', () => {
  const CLIENT_A = 'a'.repeat(32);
  const CLIENT_B = 'b'.repeat(32);
  type Scripted = RoomTransport & {
    fire: (event: RoomEvent) => void;
    posts: OpsPost[];
    opens: OpenOptions[];
    presences: PresencePost[];
    /** the next POST answers are taken from this list; the default admits at head + 1 */
    answers: ((body: OpsPost) => OpsResponse)[];
    hold: (on: boolean) => void;
    head: () => number;
  };

  function scripted(options: { author: FakeIdentity['author']; head: number }): Scripted {
    const posts: OpsPost[] = [];
    const opens: OpenOptions[] = [];
    const presences: PresencePost[] = [];
    const answers: ((body: OpsPost) => OpsResponse)[] = [];
    let onEvent: ((event: RoomEvent) => void) | null = null;
    let head = options.head;
    let held: (() => void) | null = null;
    let holding = false;
    const admit = (body: OpsPost): OpsResponse => {
      head += 1;
      const entries: Entry[] = body.entries.map((entry) => ({
        seq: head,
        rev: head - 1,
        kind: 'edit',
        author: options.author,
        clientId: body.clientId,
        opId: entry.opId,
        mutations: (entry as { mutations?: Mutation[] }).mutations ?? [],
        at: new Date().toISOString(),
      }));
      return { ok: true, entries, rejected: [], head, revision: head };
    };
    return {
      fire: (event) => onEvent?.(event),
      posts,
      opens,
      presences,
      answers,
      hold(on) {
        holding = on;
        if (!on && held !== null) {
          held();
          held = null;
        }
      },
      head: () => head,
      open(o) {
        opens.push(o);
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        if (holding) await new Promise<void>((resolve) => (held = resolve));
        const script = answers.shift();
        if (script !== undefined) {
          const answer = script(body);
          if (!answer.ok && answer.head !== undefined) head = Math.max(head, answer.head);
          return answer;
        }
        return admit(body);
      },
      async postPresence(body) {
        presences.push(body);
      },
    };
  }

  const helloAt = (clientId: string, seq: number, revision: number): RoomEvent => ({
    type: 'hello',
    seq,
    revision,
    clientId,
    role: 'editor',
    clients: [],
    editing: 1,
    tier: 'blob',
  });

  const remoteEntry = (seq: number, mutations: Mutation[], author = maya.author): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author,
    clientId: CLIENT_B,
    opId: `${CLIENT_B}:${seq}`,
    mutations,
    at: new Date().toISOString(),
  });

  it('asks the stream for the id the tab holds and counts its ops from where the earlier page stopped (item 5)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      opCounter: memoryOpCounter(41),
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    expect(transport.opens[0]?.clientId).toBe(CLIENT_A);
    transport.fire(helloAt(CLIENT_A, base, base));
    const applied = room.apply([splice(0, 0, 'k')], 'type', 'now');
    await applied.settled;
    expect(transport.posts[0]?.entries[0]?.opId).toBe(`${CLIENT_A}:42`);
    expect(room.status()).toMatchObject({ clientId: CLIENT_A, pending: 0, revision: base + 1 });
    await room.stop();
  });

  it('rebases a refused write onto the entries the 409 carries and posts again once, without a reload (item 3)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    let resyncs = 0;
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      transform: testTransform,
      onChange: () => undefined,
      onResync: async () => {
        resyncs += 1;
        return null;
      },
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    const before = textOf(room.document());
    // another instance committed base + 1 while this write was on its way: the 409 names it
    transport.answers.push(() => ({
      ok: false,
      status: 409,
      code: 'resync',
      message: `The presentation moved to revision ${base + 1} while this change was on its way`,
      head: base + 1,
      since: [remoteEntry(base + 1, [splice(0, 0, 'ZZ')])],
    }));
    const applied = room.apply([splice(0, 0, 'k')], 'type', 'now');
    const outcome = await applied.settled;
    expect(outcome).toEqual({ seq: base + 2 });
    // one refusal, one retry on the new base, no reload and no prompt
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1]?.base.seq).toBe(base + 1);
    expect(resyncs).toBe(0);
    expect(room.status()).toMatchObject({
      rebased: 1,
      pending: 0,
      seq: base + 2,
      revision: base + 2,
    });
    // the pending splice moved past the remote insert: both are in the text once
    expect(textOf(room.document())).toBe(`ZZk${before}`);
    await room.stop();
  });

  it('applies a record’s echo from another instance as its own acknowledgement and drops the late answer (items 5 and 6)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      transform: testTransform,
      onChange: (change) => changes.push(change),
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    const before = textOf(room.document());
    transport.hold(true);
    const a = room.apply([splice(0, 0, 'a')], 'type');
    const b = room.apply([splice(1, 0, 'b')], 'type');
    await until(() => transport.posts.length === 1, 1000);
    expect(transport.posts[0]?.entries.map((entry) => entry.opId)).toEqual([
      `${CLIENT_A}:1`,
      `${CLIENT_A}:2`,
    ]);
    changes.length = 0;
    // the stream's instance announces the record first: one entry naming the tab and its batch
    transport.fire({
      type: 'op',
      entry: {
        seq: base + 1,
        rev: base,
        kind: 'edit',
        author: kevin.author,
        clientId: CLIENT_A,
        opId: `${CLIENT_A}:1+2`,
        mutations: [splice(0, 0, 'ab')],
        at: new Date().toISOString(),
      },
    });
    expect(await a.settled).toEqual({ seq: base + 1 });
    expect(await b.settled).toEqual({ seq: base + 1 });
    expect(room.status()).toMatchObject({ pending: 0, seq: base + 1 });
    expect(changes.every((change) => change.reason !== 'remote')).toBe(true);
    expect(textOf(room.document())).toBe(`ab${before}`);
    // the POST answer arrives afterwards with the two entries at the same seq: nothing doubles
    transport.hold(false);
    await room.flush();
    expect(textOf(room.document())).toBe(`ab${before}`);
    expect(room.status()).toMatchObject({ pending: 0, seq: base + 1, revision: base + 1 });
    await room.stop();
  });

  it('settles an op the answer names at or below the position instead of leaving it pending (item 4)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    // the server answers a replayed op id with the record it already made, one revision back
    transport.answers.push((body) => ({
      ok: true,
      entries: [
        {
          seq: base,
          rev: base - 1,
          kind: 'edit',
          author: kevin.author,
          clientId: body.clientId,
          opId: body.entries[0]?.opId ?? '',
          mutations: [splice(0, 0, 'k')],
          at: new Date().toISOString(),
        },
      ],
      rejected: [],
      head: base,
      revision: base,
    }));
    const applied = room.apply([splice(0, 0, 'k')], 'type', 'now');
    expect(await applied.settled).toEqual({ seq: base });
    expect(room.status().pending).toBe(0);
    await room.stop();
  });

  it('replays the tab’s own persisted queue on its own after a reload and offers another tab’s (SPEC-3 0.7, item 5)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const store = memoryPendingStore();
    await store.save({
      key: pendingKey('gt-brand', CLIENT_A),
      deckId: 'gt-brand',
      clientId: CLIENT_A,
      savedAt: new Date().toISOString(),
      entries: [
        { opId: `${CLIENT_A}:5`, kind: 'edit', mutations: [splice(0, 0, 'Q')], sent: true },
        { opId: `${CLIENT_A}:6`, kind: 'edit', mutations: [splice(1, 0, 'R')] },
        { opId: `${CLIENT_A}:4`, kind: 'edit', mutations: [splice(0, 0, 'P')], seq: base },
      ],
    });
    await store.save({
      key: pendingKey('gt-brand', CLIENT_B),
      deckId: 'gt-brand',
      clientId: CLIENT_B,
      savedAt: new Date().toISOString(),
      entries: [{ opId: `${CLIENT_B}:1`, kind: 'edit', mutations: [splice(0, 0, 'X')] }],
    });
    const transport = scripted({ author: kevin.author, head: base });
    let offer: PersistedOffer | undefined;
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      opCounter: memoryOpCounter(6),
      pendingStore: store,
      transform: testTransform,
      onChange: () => undefined,
      onPersisted: (o) => (offer = o),
    });
    room.start();
    // the own queue's two unsent ops are pending at once (the retained one is not), no prompt
    await until(() => room.status().pending === 2, 1000);
    expect(textOf(room.document()).startsWith('QR')).toBe(true);
    // the other tab's queue is offered, as before
    await until(() => offer !== undefined, 1000);
    expect(offer?.count).toBe(1);
    transport.fire(helloAt(CLIENT_A, base, base));
    await until(() => room.status().pending === 0, 2000);
    // the replay kept the op ids, so the server can answer the one that landed already
    expect(transport.posts[0]?.entries.map((entry) => entry.opId)).toEqual([
      `${CLIENT_A}:5`,
      `${CLIENT_A}:6`,
    ]);
    // the own queue holds nothing unsaved any more; the other tab's stays until answered
    const left = (await store.load('gt-brand')).filter((queue) => unsavedCount(queue) > 0);
    expect(left.map((queue) => queue.clientId)).toEqual([CLIENT_B]);
    await room.stop();
  });

  it('posts the heartbeat every 25 s while shown, none while hidden, and once when shown again (A8 rows 7 and 8)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const timers = new Map<number, { run: () => void; at: number }>();
    let clock = 1_000_000;
    let handle = 0;
    const fakeTimers = {
      setTimeout: (run: () => void, ms: number) => {
        handle += 1;
        timers.set(handle, { run, at: clock + ms });
        return handle;
      },
      clearTimeout: (id: unknown) => {
        timers.delete(id as number);
      },
    };
    const advance = (ms: number): void => {
      const until_ = clock + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= until_)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        clock = due[1].at;
        due[1].run();
      }
      clock = until_;
    };
    let hidden = false;
    const listeners = new Set<() => void>();
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      now: () => clock,
      timers: fakeTimers,
      visibility: {
        hidden: () => hidden,
        onChange: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    advance(0);
    await Promise.resolve();
    const afterHello = transport.presences.length;
    expect(afterHello).toBeGreaterThan(0);
    // a shown tab: one heartbeat per HEARTBEAT_MS, under the roster's 30 s stale mark
    advance(HEARTBEAT_MS);
    await Promise.resolve();
    expect(transport.presences.length).toBe(afterHello + 1);
    expect(HEARTBEAT_MS).toBeLessThan(30_000);
    // a hidden tab: none
    hidden = true;
    advance(HEARTBEAT_MS * 3);
    await Promise.resolve();
    expect(transport.presences.length).toBe(afterHello + 1);
    // shown again: one at once
    hidden = false;
    for (const listener of listeners) listener();
    advance(0);
    await Promise.resolve();
    expect(transport.presences.length).toBe(afterHello + 2);
    // the clock outranks any state the earlier page of this tab left under the same client id
    expect(transport.presences[0]?.clock).toBeGreaterThanOrEqual(1_000_000);
    await room.stop();
  });

  it('reads offline after the stream has been down for OFFLINE_AFTER_MS and connected again on the next hello', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const timers = new Map<number, { run: () => void; at: number }>();
    let clock = 0;
    let handle = 0;
    const fakeTimers = {
      setTimeout: (run: () => void, ms: number) => {
        handle += 1;
        timers.set(handle, { run, at: clock + ms });
        return handle;
      },
      clearTimeout: (id: unknown) => {
        timers.delete(id as number);
      },
    };
    const advance = (ms: number): void => {
      clock += ms;
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > clock) continue;
        timers.delete(id);
        timer.run();
      }
    };
    const statuses: SyncStatus[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      now: () => clock,
      timers: fakeTimers,
      transform: testTransform,
      onChange: () => undefined,
      onStatus: (status) => statuses.push(status),
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    expect(room.status()).toMatchObject({ connected: true, offline: false });
    transport.opens[0]?.onError(new Error('the stream closed'));
    expect(room.status()).toMatchObject({ connected: false, offline: false });
    advance(OFFLINE_AFTER_MS + 1);
    expect(room.status()).toMatchObject({ connected: false, offline: true });
    transport.fire(helloAt(CLIENT_A, base, base));
    expect(room.status()).toMatchObject({ connected: true, offline: false });
    await room.stop();
  });

  it('keeps a pending op’s mutations as they were applied when the caller appends to its own array later (item 7: an op held offline posts nothing twice)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      transform: testTransform,
      onChange: () => undefined,
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    // the first POST meets the wire down, as it does offline; the op stays pending
    transport.answers.push(() => {
      throw new Error('offline');
    });
    const first: Mutation[] = [splice(0, 0, 'a')];
    room.apply(first, 'type', 'now');
    await until(() => transport.posts.length === 1, 1000);
    // the editor's undo group appends the next keystroke to the array it passed before, and
    // applies it as its own op too (controller.tsx `group.mutations.push`)
    first.push(splice(1, 0, 'b'));
    room.apply([splice(1, 0, 'b')], 'type', 'now');
    // the retry after the backoff carries each keystroke once
    await until(() => room.status().pending === 0, 4000);
    const sent = transport.posts
      .slice(1)
      .flatMap((body) =>
        body.entries.flatMap((entry) => (entry as { mutations?: Mutation[] }).mutations ?? []),
      );
    expect(sent).toEqual([splice(0, 0, 'a'), splice(1, 0, 'b')]);
    expect(textOf(room.document())).toBe(`ab${textOf(document)}`);
    await room.stop();
  });

  it('hands the entry that rewrote a pending op’s text to onUnplaceable, so the card can name its author (item 8)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const transport = scripted({ author: kevin.author, head: base });
    const unplaceable: { opId: string; author?: string }[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      clientId: CLIENT_A,
      transform: testTransform,
      onChange: () => undefined,
      onUnplaceable: (op, against) =>
        unplaceable.push({ opId: op.opId, author: against?.author.name }),
    });
    room.start();
    transport.fire(helloAt(CLIENT_A, base, base));
    transport.hold(true);
    room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => transport.posts.length === 1, 1000);
    transport.fire({
      type: 'op',
      entry: remoteEntry(base + 1, [
        { op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/text', value: 'rewritten' },
      ]),
    });
    expect(unplaceable).toHaveLength(1);
    expect(unplaceable[0]?.author).toBe(maya.author.name);
    expect(room.rejects()).toHaveLength(1);
    transport.hold(false);
    await room.stop();
  });
});
