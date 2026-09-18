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
import { applyMutations } from '@turboslide/schema/reduce';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import type { Entry, RoomEvent } from '../src/channel.ts';
import { memoryChannel } from '../src/memory.ts';
import { until } from '../src/channel-contract.ts';
import type { OpsPost, PresencePost } from '../src/protocol.ts';
import { fakeRoomServer, reconnectingTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore } from './pending-store.ts';
import { createRoomClient } from './room-client.ts';
import type {
  DocumentChange,
  OpenOptions,
  OpsResponse,
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

  it('resends the batch after a 5xx from the room instead of returning the ops as refused (the cycle 2 preview: a stalled store head)', async () => {
    const h = harness();
    const base = reconnectingTransport(h.server, kevin);
    let failures = 2;
    const rejects: unknown[] = [];
    const flaky: typeof base = {
      ...base,
      async postOps(body) {
        if (failures > 0) {
          failures -= 1;
          return {
            ok: false,
            status: 503,
            code: 'store_timeout',
            message: 'The Blob store did not answer head decks/gt-brand/deck.json within 20 s',
            retryAfterMs: 50,
          };
        }
        return base.postOps(body);
      },
    };
    const a = h.client(kevin, { transport: flaky, onReject: (notice) => rejects.push(notice) });
    a.room.start();
    await until(() => a.room.status().connected);
    a.room.apply([splice(0, 0, 'q')], 'type', 'now');
    // the 503 puts the client offline with the op still pending; nothing is refused
    await until(() => a.room.status().offline, 3000);
    expect(a.room.status().pending).toBe(1);
    expect(rejects).toHaveLength(0);
    // the resend lands once the room answers
    await until(() => a.room.status().pending === 0, 10_000);
    expect(a.room.status().offline).toBe(false);
    expect(rejects).toHaveLength(0);
    expect(textOf(h.server.document())).toContain('q');
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

  it('reloads at an entry’s revision when this copy cannot apply it (a restore record on the blob tier), instead of taking the checkpoint on the old document (VERIFICATION F-versions)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const restoredAt = base + 1;
    const transport = blobTransport({ author: kevin.author, head: base });
    const restored: DeckDocument = {
      deck: { ...document.deck, revision: restoredAt, title: 'Restored title' },
      slides: document.slides,
    };
    const resyncs: number[] = [];
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
      onResync: async (at) => {
        resyncs.push(at);
        return restored;
      },
    });
    room.start();
    transport.fire(hello(CLIENT_A, base, base));
    // the record of another tab's version.restore, as the channel announced it before the fix:
    // an op whose mutation needs the version log, which no tab holds
    transport.fire({
      type: 'op',
      entry: {
        seq: restoredAt,
        rev: base,
        kind: 'edit',
        author: maya.author,
        clientId: 'store',
        opId: 'store:9',
        mutations: [{ op: 'version.restore', n: 1 }],
        at: new Date().toISOString(),
      },
    });
    transport.fire({
      type: 'checkpoint',
      revision: restoredAt,
      fromSeq: restoredAt,
      toSeq: restoredAt,
      author: maya.author,
      note: '',
    });
    await until(() => changes.some((change) => change.reason === 'resync'), 3000);
    // one reload, at the entry's revision, and the document is the reloaded one
    expect(resyncs).toEqual([restoredAt]);
    expect(room.document().deck.title).toBe('Restored title');
    expect(room.document().deck.revision).toBe(restoredAt);
    expect(room.status().revision).toBe(restoredAt);
    expect(room.status().seq).toBe(restoredAt);
    // a second entry this copy cannot apply while the reload is in flight is one reload, not two
    await room.stop();
  });

  it('moves the ops typed after a refused splice past its inverse, so they are folded and sent at the offsets the server holds (docs/FOCUS.md rank 13)', async () => {
    const document = normalized();
    const base = document.deck.revision;
    const before = textOf(document);
    const posts: OpsPost[] = [];
    let onEvent: ((event: RoomEvent) => void) | null = null;
    let release: (() => void) | null = null;
    let head = base;
    // the first POST is held, then answered with its op refused (the way an instance refuses a
    // splice it cannot place); every later POST is admitted as sent
    const transport: RoomTransport & { fire: (event: RoomEvent) => void } = {
      fire(event) {
        onEvent?.(event);
      },
      open(o) {
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        if (posts.length === 1) {
          await new Promise<void>((resolve) => (release = resolve));
          return {
            ok: true,
            entries: [],
            rejected: body.entries.map((entry) => ({
              opId: entry.opId,
              reason: 'invalid' as const,
              message: 'text.splice: 0 plus 0 is outside a text of 7 characters',
            })),
            head,
            revision: head,
          };
        }
        head += 1;
        const entries: Entry[] = body.entries.map((entry) => ({
          seq: head,
          rev: head - 1,
          kind: 'edit',
          author: kevin.author,
          clientId: body.clientId,
          opId: entry.opId,
          mutations: (entry as { mutations?: Mutation[] }).mutations ?? [],
          at: new Date().toISOString(),
        }));
        return { ok: true, entries, rejected: [], head, revision: head };
      },
      async postPresence() {
        return undefined;
      },
    };
    const rejected: { opId: string; reason: string }[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: base,
      tier: 'blob',
      transform: testTransform,
      onChange: () => undefined,
      onReject: (r) => rejected.push(r),
    });
    room.start();
    transport.fire(hello(CLIENT_A, base, base));
    // the burst: a word the server refuses, then a character typed while the word is in flight
    room.apply([splice(0, 0, 'Onboarding ')], 'type', 'now');
    await until(() => posts.length === 1, 1000);
    room.apply([splice(11, 0, 'X')], 'type', 'now');
    expect(textOf(room.document())).toBe(`Onboarding X${before}`);
    (release as (() => void) | null)?.();
    await until(() => rejected.length === 1, 1000);
    // the refused word leaves; the character keeps its place in the text the server holds
    await until(() => textOf(room.document()) === `X${before}`, 1000);
    await until(() => posts.length === 2, 1000);
    expect(posts[1]!.entries).toHaveLength(1);
    expect((posts[1]!.entries[0] as { mutations: Mutation[] }).mutations).toEqual([
      splice(0, 0, 'X'),
    ]);
    await until(() => room.status().pending === 0, 1000);
    expect(textOf(room.document())).toBe(`X${before}`);
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

describe('the blob tier and a lost POST (the focus round, cycle 3; VERIFICATION C2-F24; the fix round, C3-F1)', () => {
  /**
   * A transport of this test's own: the stream hands the test its event sink, and the POST
   * admits the ops on the test's server document and then throws, the way the room client's 30 s
   * deadline ends a POST an instance is still working on. The server's commit then comes back
   * through the head poll as a store echo (`clientId: 'store'`), which is what the blob channel
   * announces to every other instance's tabs (blob.ts `entryOfRecord`).
   */
  const lostAnswerHarness = () => {
    const base = normalized();
    const r0 = base.deck.revision;
    let server = base;
    let emit: ((event: RoomEvent) => void) | null = null;
    const posted: OpsPost[] = [];
    const transport: RoomTransport = {
      open({ onEvent }: OpenOptions) {
        emit = onEvent;
        queueMicrotask(() =>
          onEvent({
            type: 'hello',
            seq: r0,
            revision: r0,
            clientId: 'c1',
            role: 'editor',
            clients: [],
            editing: 1,
            tier: 'blob',
          }),
        );
        return { close: () => undefined };
      },
      async postOps(body) {
        posted.push(body);
        for (const entry of body.entries) {
          if (entry.kind === 'edit')
            server = applyMutations(server, entry.mutations ?? []).document;
        }
        server = {
          deck: { ...server.deck, revision: server.deck.revision + 1 },
          slides: server.slides,
        };
        throw new Error('the POST did not answer within its deadline');
      },
      async postPresence() {},
    };
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: base,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
      onResync: async () => server,
    });
    /** The echo of the commit at the next revision, as the poll of another instance announces it. */
    const echo = (mutations: Mutation[]): void => {
      emit?.({
        type: 'op',
        entry: {
          seq: r0 + 1,
          rev: r0,
          kind: 'edit',
          author: { kind: 'human', name: 'Titanium 471' },
          clientId: 'store',
          opId: 'store:9',
          mutations,
          at: '2026-09-17T00:00:00.000Z',
        },
      });
    };
    return {
      room,
      posted,
      echo,
      emitEvent: (event: RoomEvent) => emit?.(event),
      r0,
      serverText: () => textOf(server),
      changes,
    };
  };

  it('acknowledges the ops from the store echo of the POST it lost, applies the edit once and resends nothing', async () => {
    const h = lostAnswerHarness();
    const original = textOf(h.room.document());
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'q')], 'type', 'now');
    await until(() => h.posted.length === 1);
    await until(() => h.room.status().offline, 3000);
    expect(h.room.status().pending).toBe(1);
    expect(h.serverText()).toBe(`q${original}`);
    // the commit's echo arrives before the resend: the op is acknowledged at its revision
    h.echo([splice(0, 0, 'q')]);
    expect(h.room.status().pending).toBe(0);
    expect(h.room.status().seq).toBe(h.r0 + 1);
    expect(textOf(h.room.document())).toBe(`q${original}`);
    expect(h.changes[h.changes.length - 1]?.reason).toBe('ack');
    // no resend follows, so nothing lands twice
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(h.posted).toHaveLength(1);
    expect(h.serverText()).toBe(`q${original}`);
    await h.room.stop();
  });

  it('acknowledges an echo of the POST still in flight, so the text is never doubled while the answer is slow, and the answer then repeats nothing', async () => {
    const base = normalized();
    const r0 = base.deck.revision;
    let emit = null as ((event: RoomEvent) => void) | null;
    let release = null as ((response: OpsResponse) => void) | null;
    const posted: OpsPost[] = [];
    const transport: RoomTransport = {
      open({ onEvent }: OpenOptions) {
        emit = onEvent;
        queueMicrotask(() =>
          onEvent({
            type: 'hello',
            seq: r0,
            revision: r0,
            clientId: 'c1',
            role: 'editor',
            clients: [],
            editing: 1,
            tier: 'blob',
          }),
        );
        return { close: () => undefined };
      },
      postOps(body) {
        posted.push(body);
        // the server admits at once; its answer is held (a slow store, a 20 s put)
        return new Promise<OpsResponse>((resolve) => {
          release = resolve;
        });
      },
      async postPresence() {},
    };
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: base,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      onChange: () => undefined,
    });
    const original = textOf(room.document());
    room.start();
    await until(() => room.status().connected);
    const applied = room.apply([splice(0, 0, 'q')], 'type', 'now');
    await until(() => posted.length === 1);
    expect(room.status().pending).toBe(1);
    // the stream's instance polled the store first: the echo of the commit lands before the answer
    emit?.({
      type: 'op',
      entry: {
        seq: r0 + 1,
        rev: r0,
        kind: 'edit',
        author: { kind: 'human', name: 'Titanium 471' },
        clientId: 'store',
        opId: 'store:9',
        mutations: [splice(0, 0, 'q')],
        at: '2026-09-17T00:00:00.000Z',
      },
    });
    // acknowledged from the echo: nothing pending, the text once
    expect(room.status().pending).toBe(0);
    expect(room.status().seq).toBe(r0 + 1);
    expect(textOf(room.document())).toBe(`q${original}`);
    expect(await applied.settled).toEqual({ seq: r0 + 1 });
    // the answer arrives: the entry at the position repeats nothing and nothing is resent
    const entry: Entry = {
      seq: r0 + 1,
      rev: r0,
      kind: 'edit',
      author: { kind: 'human', name: 'Titanium 471' },
      clientId: 'c1',
      opId: posted[0]!.entries[0]!.opId,
      mutations: [splice(0, 0, 'q')],
      at: '2026-09-17T00:00:00.000Z',
    };
    release?.({ ok: true, entries: [entry], rejected: [], head: r0 + 1, revision: r0 + 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(textOf(room.document())).toBe(`q${original}`);
    expect(room.status()).toMatchObject({ pending: 0, seq: r0 + 1, revision: r0 + 1 });
    expect(room.status().retained).toBe(1);
    expect(posted).toHaveLength(1);
    await room.stop();
  });

  it("settles an op the resent POST's answer replays behind the position instead of leaving it pending and in flight for good (the stall of C3-F1)", async () => {
    const base = normalized();
    const r0 = base.deck.revision;
    let emit = null as ((event: RoomEvent) => void) | null;
    const posted: OpsPost[] = [];
    let answers = 0;
    const transport: RoomTransport = {
      open({ onEvent }: OpenOptions) {
        emit = onEvent;
        queueMicrotask(() =>
          onEvent({
            type: 'hello',
            seq: r0,
            revision: r0,
            clientId: 'c1',
            role: 'editor',
            clients: [],
            editing: 1,
            tier: 'blob',
          }),
        );
        return { close: () => undefined };
      },
      async postOps(body) {
        posted.push(body);
        answers += 1;
        // the first answer is lost (the 30 s deadline); the resend lands on the instance that
        // admitted the first and is answered with the entry that admission made, at r0 + 1
        if (answers === 1) throw new Error('the POST did not answer within its deadline');
        const entry: Entry = {
          seq: r0 + 1,
          rev: r0,
          kind: 'edit',
          author: { kind: 'human', name: 'Titanium 471' },
          clientId: body.clientId,
          opId: body.entries[0]!.opId,
          mutations: [splice(0, 0, 'q')],
          at: '2026-09-17T00:00:00.000Z',
        };
        return { ok: true, entries: [entry], rejected: [], head: r0 + 2, revision: r0 + 2 };
      },
      async postPresence() {},
    };
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: base,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      onChange: () => undefined,
      onResync: async () => base,
    });
    const original = textOf(room.document());
    room.start();
    await until(() => room.status().connected);
    room.apply([splice(0, 0, 'q')], 'type', 'now');
    await until(() => posted.length === 1);
    await until(() => room.status().offline, 3000);
    // the stream delivers the commit and another author's write after it, with the fold of the
    // commit not the client's (the server placed the write differently), so the echo is a remote
    // write here and the position moves to r0 + 2 before the resend is answered
    emit?.({
      type: 'op',
      entry: {
        seq: r0 + 1,
        rev: r0,
        kind: 'edit',
        author: { kind: 'human', name: 'Titanium 471' },
        clientId: 'store',
        opId: 'store:9',
        mutations: [splice(0, 0, 'q'), splice(1, 0, '')],
        at: '2026-09-17T00:00:00.000Z',
      },
    });
    emit?.({
      type: 'op',
      entry: {
        seq: r0 + 2,
        rev: r0 + 1,
        kind: 'edit',
        author: { kind: 'human', name: 'Cobalt 118' },
        clientId: 'store',
        opId: 'store:10',
        mutations: [splice(3, 0, 'Z')],
        at: '2026-09-17T00:00:01.000Z',
      },
    });
    expect(room.status().seq).toBe(r0 + 2);
    expect(room.status().pending).toBe(1);
    // the resend goes and is answered with the entry at r0 + 1, behind the position: the op is
    // acknowledged, not dropped as a duplicate
    await until(() => posted.length === 2, 3000);
    await until(() => room.status().pending === 0, 3000);
    expect(room.status()).toMatchObject({ pending: 0, seq: r0 + 2, revision: r0 + 2 });
    // nothing stays in flight and nothing is sent a third time
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(posted).toHaveLength(2);
    expect(textOf(room.document()).startsWith('q')).toBe(true);
    expect(textOf(room.document()).length).toBe(original.length + 2);
    await room.stop();
  });

  it("reads the store event into sync.status: degraded while the room's store refuses its poll, clear once it answers", async () => {
    const h = lostAnswerHarness();
    const statuses: { storeDegraded: boolean }[] = [];
    h.room.start();
    await until(() => h.room.status().connected);
    expect(h.room.status().storeDegraded).toBe(false);
    h.emitEvent({ type: 'store', ok: false, retryAfterMs: 4000 });
    statuses.push(h.room.status());
    h.emitEvent({ type: 'store', ok: true });
    statuses.push(h.room.status());
    expect(statuses.map((row) => row.storeDegraded)).toEqual([true, false]);
    await h.room.stop();
  });

  it("takes an echo that is not the lost POST as another author's write, as before", async () => {
    const h = lostAnswerHarness();
    const original = textOf(h.room.document());
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'q')], 'type', 'now');
    await until(() => h.room.status().offline, 3000);
    // another author's word at the same base: the pending op moves past it and stays pending
    h.echo([splice(0, 0, 'zz')]);
    expect(h.room.status().pending).toBe(1);
    expect(textOf(h.room.document())).toBe(`zzq${original}`);
    await h.room.stop();
  });
});
