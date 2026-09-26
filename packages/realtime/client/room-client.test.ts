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
import { PRESENCE_BATCH_MS } from '../src/protocol.ts';
import type { OpsPost, PresencePost } from '../src/protocol.ts';
import { fakeRoomServer, tabTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore, pendingKey } from './pending-store.ts';
import {
  BACKOFF_MAX_MS,
  GAP_REOPEN_MS,
  createRoomClient,
  splitSseBlocks,
  streamFailureOf,
} from './room-client.ts';
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
    transport: ReturnType<typeof tabTransport>;
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
      const transport = tabTransport(server, identity);
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
    const base = tabTransport(h.server, kevin);
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

describe('the stream cap and the client while disconnected (the focus round, cycle 3 stream fix round; VERIFICATION C3-F1)', () => {
  it('posts the pending ops over POST /ops while its stream is down and settles them from the answer, so nothing waits on the stream', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    // the stream goes and every reopen is refused, as the cap refuses a tab's fourth stream
    a.transport.refuseOpens({
      status: 503,
      code: 'too_many_streams',
      retryAfterMs: 5000,
      message: 'The stream answered 503',
    });
    h.server.kill();
    await until(() => !a.room.status().connected);
    expect(a.room.status().streamDown).toBe(true);
    a.room.apply([splice(0, 0, 'p')], 'type', 'now');
    // the write lands on the server and the op settles from the POST's answer, stream or not
    await until(() => a.room.status().pending === 0, 3000);
    expect(textOf(h.server.document())).toContain('p');
    expect(a.room.status().connected).toBe(false);
    expect(a.room.status().streamDown).toBe(true);
    expect(a.room.status().offline).toBe(false);
    a.transport.refuseOpens(null);
    await a.room.stop();
  });

  it('owns the reopen: a refused open is retried after the retry-after the transport reported, with since at its position and its own earlier ids in retire', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    const firstId = a.room.clientId();
    expect(firstId).not.toBeNull();
    const before = a.room.status().seq;
    a.transport.refuseOpens({
      status: 503,
      code: 'too_many_streams',
      retryAfterMs: 120,
      message: 'The stream answered 503',
    });
    const opensBefore = a.transport.opens();
    const t0 = Date.now();
    h.server.kill();
    await until(() => a.transport.opens() === opensBefore + 1, 1000);
    const firstReopenAt = Date.now() - t0;
    // the first reopen follows the ladder's first step (500 ms), since a kill names no wait
    expect(firstReopenAt).toBeGreaterThanOrEqual(400);
    // the refused open is retried after the 120 ms the refusal named, not the browser's whim
    await until(() => a.transport.opens() === opensBefore + 2, 1000);
    const secondReopenAt = Date.now() - t0;
    expect(secondReopenAt - firstReopenAt).toBeGreaterThanOrEqual(100);
    expect(secondReopenAt - firstReopenAt).toBeLessThan(450);
    // the cap frees a slot: the next open succeeds and a hello lands
    a.transport.refuseOpens(null);
    await until(() => a.room.status().connected, 2000);
    expect(a.room.status().streamDown).toBe(false);
    expect(a.room.clientId()).not.toBe(firstId);
    const retires = a.transport.retires();
    // every reopen named the tab's earlier id so the instance releases its slot first
    for (const list of retires.slice(1)) expect(list).toContain(firstId);
    // and asked for the replay from the client's position
    expect(before).toBe(a.room.status().seq);
    await a.room.stop();
  });

  it('reopens after a 404 or a 403 at the backoff cap instead of leaving the stream closed', async () => {
    const h = harness();
    const timers: { run: () => void; ms: number }[] = [];
    const a = h.client(kevin, {
      timers: {
        setTimeout: (run, ms) => {
          const handle = { run, ms };
          timers.push(handle);
          return handle;
        },
        clearTimeout: (handle) => {
          const at = timers.indexOf(handle as { run: () => void; ms: number });
          if (at >= 0) timers.splice(at, 1);
        },
      },
    });
    a.transport.refuseOpens({ status: 404, code: 'not_found', message: 'The stream answered 404' });
    a.room.start();
    await until(() => timers.some((t) => t.ms === BACKOFF_MAX_MS), 1000);
    expect(a.room.status().streamDown).toBe(true);
    expect(a.transport.opens()).toBe(1);
    // the timer fires: the client opens again
    const reopen = timers.find((t) => t.ms === BACKOFF_MAX_MS);
    a.transport.refuseOpens(null);
    reopen?.run();
    expect(a.transport.opens()).toBe(2);
    await until(() => a.room.status().connected, 2000);
    await a.room.stop();
  });

  it('reopens the stream itself when the ops route answers client_unbound, and the ops wait for the new hello', async () => {
    const h = harness();
    const base = tabTransport(h.server, kevin);
    let unbound = 1;
    const flaky: typeof base = {
      ...base,
      async postOps(body) {
        if (unbound > 0) {
          unbound -= 1;
          return { ok: false, status: 403, code: 'client_unbound', message: 'unbound' };
        }
        return base.postOps(body);
      },
    };
    const a = h.client(kevin, { transport: flaky });
    a.room.start();
    await until(() => a.room.status().connected);
    const firstId = a.room.clientId();
    a.room.apply([splice(0, 0, 'u')], 'type', 'now');
    // the refusal closes the stream and the client opens the next one itself
    await until(() => base.opens() === 2, 3000);
    await until(() => a.room.status().connected && a.room.status().pending === 0, 5000);
    expect(a.room.clientId()).not.toBe(firstId);
    expect(textOf(h.server.document())).toContain('u');
    await a.room.stop();
  });

  it('reads a transport failure with its status and wait, and a plain error as a closed stream', () => {
    expect(streamFailureOf(new Error('stream closed'))).toEqual({ message: 'stream closed' });
    expect(
      streamFailureOf({ status: 503, code: 'too_many_streams', retryAfterMs: 5000, message: 'x' }),
    ).toEqual({ status: 503, code: 'too_many_streams', retryAfterMs: 5000, message: 'x' });
    expect(streamFailureOf({ status: 'no', retryAfterMs: -1, message: 'y' })).toEqual({
      message: 'y',
    });
    expect(streamFailureOf(undefined)).toEqual({ message: 'the stream closed' });
  });

  it('splits a stream’s text into complete blocks and keeps a frame still arriving', () => {
    const one = splitSseBlocks('retry: 1500\n\nid: 3\nevent: op\ndata: {"a":1}\n\nid: 4\nev');
    expect(one.blocks).toEqual(['retry: 1500', 'id: 3\nevent: op\ndata: {"a":1}']);
    expect(one.rest).toBe('id: 4\nev');
    const two = splitSseBlocks(`${one.rest}ent: op\ndata: {"b":2}\n\n: heartbeat\n\n`);
    expect(two.blocks).toEqual(['id: 4\nevent: op\ndata: {"b":2}', ': heartbeat']);
    expect(two.rest).toBe('');
    expect(splitSseBlocks('event: hello\r\ndata: {}\r\n\r\n')).toEqual({
      blocks: ['event: hello\ndata: {}'],
      rest: '',
    });
  });
});

describe('an op holds its own copy of its mutations (the cycle 3 stream fix round; s2.md S2-R1, realtime.spec.ts:515)', () => {
  it('sends each burst’s splice once when the caller grows the array it handed to apply, as the typing group of controller.tsx commitAs does', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await settled([a.room]);
    const before = textOf(h.server.document());
    // the first burst; the history's typing group keeps this array and appends every later burst
    const first: Mutation[] = [splice(0, 0, '1')];
    a.room.apply(first, 'type');
    const second: Mutation[] = [splice(1, 0, '2')];
    first.push(...second);
    a.room.apply(second, 'type');
    const third: Mutation[] = [splice(2, 0, '3')];
    first.push(...third);
    a.room.apply(third, 'type');
    // the three ops leave in one batch; before the copy the first op carried every later splice
    // as well and the server read `1223` then `late12323` (the row's shape)
    await settled([a.room]);
    expect(textOf(h.server.document())).toBe(`123${before}`);
    expect(textOf(a.room.document())).toBe(`123${before}`);
    await a.room.stop();
  });
});

describe('the persisted queue across a reconnect (the seam step of the cycle 3 stream fix round; realtime.spec.ts:515)', () => {
  it('moves the record to the new client id when the stream reconnects, so the next page is never offered ops that landed', async () => {
    const h = harness();
    const store = memoryPendingStore();
    const a = h.client(kevin, { pendingStore: store });
    a.room.start();
    await until(() => a.room.status().connected);
    const firstId = a.room.clientId();
    expect(firstId).not.toBeNull();
    // a burst typed while the POSTs fail, then the stream goes: the offline blip of the row
    a.transport.offline(true);
    a.room.apply([splice(0, 0, 'Q')], 'type', 'now');
    await until(() => a.room.status().offline, 3000);
    expect(store.queues.has(pendingKey('gt-brand', firstId!))).toBe(true);
    h.server.kill();
    await until(() => !a.room.status().connected);
    a.transport.offline(false);
    await until(() => a.room.status().connected && a.room.status().pending === 0, 5000);
    expect(a.room.clientId()).not.toBe(firstId);
    expect(textOf(h.server.document())).toContain('Q');
    // the record under the first id is gone with the reconnect; nothing unsaved stays anywhere
    expect(store.queues.has(pendingKey('gt-brand', firstId!))).toBe(false);
    await a.room.stop();
    let offer: { count: number } | undefined;
    const b = h.client(kevin, { pendingStore: store, onPersisted: (o) => (offer = o) });
    b.room.start();
    await until(() => b.room.status().connected);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(offer).toBeUndefined();
    await b.room.stop();
  });
});

describe('the stream fix round, fix round (VERIFICATION C3S-F1, C3S-F2, C3S-F3, SEAM-F8)', () => {
  /** Polls an async reading until it holds, the way `until` does a sync one. */
  const eventually = async (read: () => Promise<boolean>, timeoutMs = 2000): Promise<void> => {
    const started = Date.now();
    while (!(await read())) {
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  it('posts under the client id a refused open minted, so a page whose every open is refused still writes, and takes the hello’s id once a slot frees (C3S-F2)', async () => {
    const h = harness();
    const a = h.client(kevin);
    const minted = '1'.repeat(32);
    // every open of the page is refused from the first, as the identity cap refuses a tab whose
    // earlier slots the runtime still holds; the refusal carries the id the route minted
    a.transport.refuseOpens({
      status: 503,
      code: 'too_many_streams',
      retryAfterMs: 120,
      clientId: minted,
      message: 'The stream answered 503',
    });
    a.room.start();
    await until(() => a.room.clientId() === minted, 1000);
    expect(a.room.status().connected).toBe(false);
    expect(a.room.status().streamDown).toBe(true);
    // the write lands under the minted id with no hello ever received
    a.room.apply([splice(0, 0, 'r')], 'type', 'now');
    await until(() => a.room.status().pending === 0, 3000);
    expect(textOf(h.server.document())).toContain('r');
    expect(a.room.status().connected).toBe(false);
    expect(a.room.status().offline).toBe(false);
    // a slot frees: the hello's id replaces the minted one and the reopens carried it in retire
    a.transport.refuseOpens(null);
    await until(() => a.room.status().connected, 3000);
    expect(a.room.clientId()).not.toBe(minted);
    expect(a.room.clientId()).not.toBeNull();
    const last = a.transport.retires()[a.transport.retires().length - 1];
    expect(last).toContain(minted);
    await a.room.stop();
  });

  it('keeps its presence and its leave going while its stream is down: the binding gates them, not the stream (C3S-F3)', async () => {
    const channel = memoryChannel();
    const server = fakeRoomServer({ deckId: 'gt-brand', channel, document: normalized() });
    const transport = tabTransport(server, kevin);
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: server.document(),
      seq: server.seq(),
      transform: testTransform,
      onChange: () => undefined,
      onResync: async () => server.document(),
    });
    room.start();
    await until(() => room.status().connected);
    const id = room.clientId();
    expect(id).not.toBeNull();
    const rowOf = async () =>
      (await channel.presence.roster('gt-brand')).find((row) => row.clientId === id);
    await eventually(async () => (await rowOf()) !== undefined);
    // the stream goes and every reopen is refused; the closed handle left the roster
    transport.refuseOpens({
      status: 503,
      code: 'too_many_streams',
      retryAfterMs: 5000,
      message: 'The stream answered 503',
    });
    server.kill();
    await until(() => !room.status().connected);
    await eventually(async () => (await rowOf()) === undefined);
    // the tab is alive: its presence still posts while its stream is down, so its chip stays
    room.setPresence({ slideId: 'mood-compass' });
    await eventually(async () => (await rowOf())?.slideId === 'mood-compass');
    // and its leave lands when it closes, stream or not (before this the chip stayed until the
    // roster's TTL when a tab closed with its stream down)
    await room.stop();
    expect(await rowOf()).toBeUndefined();
  });

  it('trims the retained ops to the seq the hello says a checkpoint covered, so a checkpoint that fired while the stream was down does not leave the title row at Saving (SEAM-F8)', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    a.transport.refuseOpens({
      status: 503,
      code: 'too_many_streams',
      retryAfterMs: 100,
      message: 'The stream answered 503',
    });
    h.server.kill();
    await until(() => !a.room.status().connected);
    // the op posts while the stream is down and is acknowledged from the answer: retained 1
    a.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => a.room.status().pending === 0, 3000);
    expect(a.room.status().retained).toBe(1);
    // the checkpoint covers it while no stream of this tab carries the event
    await h.server.checkpoint();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(a.room.status().retained).toBe(1);
    // the reopen's hello names the covered seq and the retained op is saved
    a.transport.refuseOpens(null);
    await until(() => a.room.status().connected, 3000);
    await until(() => a.room.status().retained === 0, 1000);
    expect(a.room.status().pending).toBe(0);
    await a.room.stop();
  });

  it('reopens the stream when an entry above the position waits GAP_REOPEN_MS for the gap under it, and the replay fills the gap and settles the op (C3S-F1)', async () => {
    const base = normalized();
    const r0 = base.deck.revision;
    const author = { kind: 'human' as const, name: 'Titanium 471' };
    // another writer's commit at r0 + 1, which the stream's instance never announces
    const other: Entry = {
      seq: r0 + 1,
      rev: r0,
      kind: 'edit',
      author,
      clientId: 'store',
      opId: 'store:41',
      mutations: [splice(0, 0, 'O')],
      at: '2026-09-18T00:00:00.000Z',
    };
    let answered: Entry | null = null;
    let opens = 0;
    const sinces: number[] = [];
    let emit: ((event: RoomEvent) => void) | null = null;
    const transport: RoomTransport = {
      open({ since, onEvent }: OpenOptions) {
        opens += 1;
        sinces.push(since);
        emit = onEvent;
        const reopen = opens > 1;
        queueMicrotask(() => {
          onEvent({
            type: 'hello',
            seq: reopen ? r0 + 2 : r0,
            revision: reopen ? r0 + 2 : r0,
            clientId: 'c1',
            role: 'editor',
            clients: [],
            editing: 1,
            tier: 'blob',
          });
          // the reopen's replay from the position carries what the first stream never did
          if (reopen && answered !== null) onEvent({ type: 'ops', entries: [other, answered] });
        });
        return { close: () => undefined };
      },
      async postOps(body) {
        const first = body.entries[0];
        if (first === undefined || first.kind !== 'edit') throw new Error('one edit');
        // the commit lands at r0 + 2: the other writer's made r0 + 1 first
        answered = {
          seq: r0 + 2,
          rev: r0 + 1,
          kind: 'edit',
          author,
          clientId: body.clientId,
          opId: first.opId,
          mutations: testTransform(
            (first.mutations ?? [])[0] as Mutation,
            (other.mutations ?? [])[0] as Mutation,
          ),
          at: '2026-09-18T00:00:01.000Z',
        };
        return { ok: true, entries: [answered], rejected: [], head: r0 + 2, revision: r0 + 2 };
      },
      async postPresence() {},
    };
    const timers: { run: () => void; ms: number }[] = [];
    const fireAll = (ms: number): void => {
      for (const timer of timers.filter((row) => row.ms === ms)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    };
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: base,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      timers: {
        setTimeout: (run, ms) => {
          const handle = { run, ms };
          timers.push(handle);
          return handle;
        },
        clearTimeout: (handle) => {
          const at = timers.indexOf(handle as { run: () => void; ms: number });
          if (at >= 0) timers.splice(at, 1);
        },
      },
      onChange: (change) => changes.push(change),
      onResync: async () => null,
    });
    room.start();
    await until(() => room.status().connected);
    room.apply([splice(0, 0, 'g')], 'type', 'now');
    fireAll(0);
    // the answer arrives at r0 + 2 and waits above the position for r0 + 1
    await until(() => answered !== null && timers.some((row) => row.ms === GAP_REOPEN_MS), 2000);
    expect(room.status().pending).toBe(1);
    expect(room.status().seq).toBe(r0);
    expect(room.status().connected).toBe(true);
    expect(opens).toBe(1);
    // nothing fills it for GAP_REOPEN_MS: the client reopens the stream on its ladder
    fireAll(GAP_REOPEN_MS);
    expect(room.status().streamDown).toBe(true);
    expect(timers.some((row) => row.ms === 500)).toBe(true);
    fireAll(500);
    expect(opens).toBe(2);
    expect(sinces[1]).toBe(r0);
    // the replay fills the gap: the other writer's text lands and the op settles
    await until(() => room.status().pending === 0, 2000);
    expect(room.status().seq).toBe(r0 + 2);
    expect(room.status().connected).toBe(true);
    expect(textOf(room.document())).toContain('O');
    expect(textOf(room.document())).toContain('g');
    expect(timers.some((row) => row.ms === GAP_REOPEN_MS)).toBe(false);
    void emit;
    void changes;
    await room.stop();
  });
});

describe('the ops answer carries the entries under the admitted ones (the stream fix round two; VERIFICATION C3S-F8)', () => {
  it('settles an answered op above a gap from the answer alone: no stream delivery under it, no reopen, well inside GAP_REOPEN_MS', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.room.start();
    await until(() => a.room.status().connected);
    const seq0 = a.room.status().seq;
    // the stream stops delivering (its instance stopped announcing) and another writer lands
    // the next entry, which this tab never receives: its position stays
    a.transport.holdStream(true);
    await h.server.appendExternal(maya.author, [splice(0, 0, 'O')]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(a.room.status().seq).toBe(seq0);
    expect(h.server.seq()).toBe(seq0 + 1);
    // the tab writes: the answer lands at seq0 + 2 and carries the entry at seq0 + 1 under it
    const started = Date.now();
    a.room.apply([splice(0, 0, 'g')], 'type', 'now');
    await until(() => a.room.status().pending === 0, 3000);
    expect(Date.now() - started).toBeLessThan(GAP_REOPEN_MS);
    expect(a.room.status().seq).toBe(seq0 + 2);
    expect(textOf(a.room.document())).toContain('O');
    expect(textOf(a.room.document())).toContain('g');
    expect(textOf(a.room.document())).toBe(textOf(h.server.document()));
    // the stream was never reopened for it and reads as up
    expect(a.transport.opens()).toBe(1);
    expect(a.room.status().streamDown).toBe(false);
    expect(a.room.status().connected).toBe(true);
    a.transport.holdStream(false);
    await a.room.stop();
  });

  it('waits above the gap when the answer carries no between (an older server), which is what the field closes', async () => {
    const h = harness();
    const a = h.client(kevin);
    a.transport.answerBetween(false);
    a.room.start();
    await until(() => a.room.status().connected);
    const seq0 = a.room.status().seq;
    a.transport.holdStream(true);
    await h.server.appendExternal(maya.author, [splice(0, 0, 'O')]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    a.room.apply([splice(0, 0, 'g')], 'type', 'now');
    await new Promise((resolve) => setTimeout(resolve, 200));
    // the answered entry sits above the position, pending and in flight, until the stream or
    // the gap watch's reopen fills the gap (the test at GAP_REOPEN_MS above)
    expect(a.room.status().pending).toBe(1);
    expect(a.room.status().seq).toBe(seq0);
    expect(textOf(h.server.document())).toContain('g');
    expect(a.room.status().connected).toBe(true);
    // what fills it from here is the gap watch's reopen at GAP_REOPEN_MS (the test above under
    // C3S-F1), not this test's clock
    a.transport.holdStream(false);
    await a.room.stop();
  });
});

describe('the roster keeps its join order across presence posts (the stream fix round two; build/t2.md T2-R1, presence.spec.ts the second person row)', () => {
  const third: FakeIdentity = {
    principalId: 'anon_3f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
    label: 'Amber 302',
    role: 'editor',
    author: {
      kind: 'human',
      name: 'Amber 302',
      principalId: 'anon_3f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
    },
  };
  const eventually = async (read: () => boolean, timeoutMs = 2000): Promise<void> => {
    const started = Date.now();
    while (!read()) {
      if (Date.now() - started > timeoutMs) throw new Error('not in time');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  it('replaces a participant’s row in place on their presence post and appends only a client it does not hold, so a post from one person moves nobody’s chip', async () => {
    const h = harness();
    const a = h.client(kevin);
    const b = h.client(maya);
    const c = h.client(third);
    a.room.start();
    await until(() => a.room.status().connected);
    b.room.start();
    await until(() => b.room.status().connected);
    c.room.start();
    await until(() => c.room.status().connected);
    const own = a.room.clientId();
    const bId = b.room.clientId();
    const cId = c.room.clientId();
    const others = (): string[] =>
      a.room
        .roster()
        .map((row) => row.clientId)
        .filter((id) => id !== own);
    // join order: B then C
    await eventually(() => others().length === 2);
    expect(others()).toEqual([bId, cId]);
    // B posts its presence (a slide change) while C is present: B's row is replaced where it
    // stands, so the title row's slots keep their order and no chip moves (before this the
    // roster was rebuilt as [...rest, state] and B moved behind C on every post)
    b.room.setPresence({ slideId: 'mood-compass' });
    await eventually(
      () => a.room.roster().find((row) => row.clientId === bId)?.slideId === 'mood-compass',
    );
    expect(others()).toEqual([bId, cId]);
    // C posts too: still the join order
    c.room.setPresence({ slideId: 'content-rule' });
    await eventually(
      () => a.room.roster().find((row) => row.clientId === cId)?.slideId === 'content-rule',
    );
    expect(others()).toEqual([bId, cId]);
    // a fourth joins: appended at the end, the first two where they were
    const d = h.client({
      ...third,
      principalId: 'anon_4f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
      label: 'Slate 917',
    });
    d.room.start();
    await until(() => d.room.status().connected);
    const dId = d.room.clientId();
    await eventually(() => others().length === 3);
    expect(others()).toEqual([bId, cId, dId]);
    // and a leave removes the row alone
    await c.room.stop();
    await eventually(() => others().length === 2);
    expect(others()).toEqual([bId, dId]);
    await d.room.stop();
    await b.room.stop();
    await a.room.stop();
  });
});

// ---------------------------------------------------------------------------------------------
// The sync and costs round (docs/SYNC.md 3.2, 3.10, 3.11 invariants 4, 10 and 11; 6.4's named
// tests for B2): acknowledgement by id from an echo's `covers`, the byte match as the fallback
// for a record without an origin, the undo inverse past a remote insert, the own echo skipped
// and a second tab of the same person read as remote, the resync read's origins dropping the
// pending ops they name, and the heartbeat's two cadences.

describe('the sync and costs round: acknowledgement by id, undo past remote entries, the resync origins and the heartbeat (docs/SYNC.md 3.2, 3.10, 3.11)', () => {
  const TAB_A = 'c'.repeat(32);
  const TAB_A2 = 'd'.repeat(32);
  const TAB_B = 'e'.repeat(32);

  type FakeTimer = { run: () => void; ms: number; at: number };

  /**
   * A blob tier transport of this block's own: one POST is one revision, every entry of it at
   * that seq under the client's id; `hold` keeps the answer back so an echo can arrive first;
   * `fire` hands the client a stream event; the timers and the clock are the test's.
   */
  const blobTab = (
    options: {
      author: FakeIdentity['author'];
      head: number;
      onResync?: RoomClientOptions['onResync'];
      fakeTimers?: boolean;
    } = { author: kevin.author, head: 0 },
  ) => {
    const document = normalized();
    const r0 = options.head === 0 ? document.deck.revision : options.head;
    let head = r0;
    let onEvent: ((event: RoomEvent) => void) | null = null;
    const posts: OpsPost[] = [];
    const presences: PresencePost[] = [];
    let holding = false;
    let held: (() => void) | null = null;
    const timers: FakeTimer[] = [];
    let clock = 1_000_000;
    /** the seq an echo fired for a POST's op ids already made, so the answer names the same commit */
    const echoedByOp = new Map<string, number>();
    let answerSeq: number | null = null;
    const transport: RoomTransport = {
      open(o: OpenOptions) {
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        if (holding) await new Promise<void>((resolve) => (held = resolve));
        const echoed = body.entries.map((entry) => echoedByOp.get(entry.opId)).find(Boolean);
        const seq =
          answerSeq ??
          echoed ??
          // the store's head is at least the client's base (a resync moved the client to the head)
          Math.max(head, body.base.seq) + 1;
        answerSeq = null;
        head = Math.max(head, seq);
        const entries: Entry[] = body.entries.map((entry) => ({
          seq,
          rev: seq - 1,
          kind: 'edit',
          author: options.author,
          clientId: body.clientId,
          opId: entry.opId,
          mutations: (entry as { mutations?: Mutation[] }).mutations ?? [],
          at: new Date().toISOString(),
        }));
        return { ok: true, entries, rejected: [], head, revision: head };
      },
      async postPresence(body) {
        presences.push(structuredClone(body));
      },
    };
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
      ...(options.onResync === undefined ? {} : { onResync: options.onResync }),
      ...(options.fakeTimers === true
        ? {
            now: () => clock,
            timers: {
              setTimeout: (run: () => void, ms: number) => {
                const handle: FakeTimer = { run, ms, at: clock + ms };
                timers.push(handle);
                return handle;
              },
              clearTimeout: (handle: unknown) => {
                const at = timers.indexOf(handle as FakeTimer);
                if (at >= 0) timers.splice(at, 1);
              },
            },
          }
        : {}),
    });
    return {
      room,
      posts,
      presences,
      changes,
      r0,
      head: () => head,
      fire: (event: RoomEvent) => {
        // a record's echo moves the store's head, and the ops it covers were committed at its seq
        if (event.type === 'op') {
          head = Math.max(head, event.entry.seq);
          for (const id of event.entry.covers ?? []) echoedByOp.set(id, event.entry.seq);
        }
        onEvent?.(event);
      },
      /** the next POST is answered at this seq (an echo without covers already carried its commit) */
      answerAt(seq: number) {
        answerSeq = seq;
      },
      hello: (clientId: string) =>
        onEvent?.({
          type: 'hello',
          seq: r0,
          revision: r0,
          clientId,
          role: 'editor',
          clients: [],
          editing: 1,
          tier: 'blob',
        }),
      hold(on: boolean) {
        holding = on;
        if (!on && held !== null) {
          held();
          held = null;
        }
      },
      /** the record's stream entry as blob.ts entryOfRecord emits it since the round */
      echo: (seq: number, clientId: string, covers: string[], mutations: Mutation[]): Entry => ({
        seq,
        rev: seq - 1,
        kind: 'edit',
        author: options.author,
        clientId,
        opId: `store:${seq}`,
        mutations,
        at: new Date().toISOString(),
        covers,
      }),
      /** advances the fake clock and runs every timer due by then, in order */
      advance(ms: number) {
        const until = clock + ms;
        for (;;) {
          const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
          if (due === undefined) break;
          timers.splice(timers.indexOf(due), 1);
          clock = Math.max(clock, due.at);
          due.run();
        }
        clock = until;
      },
      timers,
    };
  };

  it('acknowledges two pending ops from an echo whose covers names them, at the echo’s seq, and applies its mutations once (invariant 4)', async () => {
    const h = blobTab();
    h.room.start();
    h.hello(TAB_A);
    const before = textOf(h.room.document());
    h.hold(true);
    const first = h.room.apply([splice(0, 0, 'ab')], 'type');
    const second = h.room.apply([splice(2, 0, 'cd')], 'type');
    await until(() => h.posts.length === 1);
    expect(h.posts[0]!.entries).toHaveLength(2);
    const [id1, id2] = h.posts[0]!.entries.map((entry) => entry.opId);
    expect(h.room.status().pending).toBe(2);
    // the record's echo lands before the answer: this tab's id, the fold, and the two op ids
    h.fire({
      type: 'op',
      entry: h.echo(h.r0 + 1, TAB_A, [id1!, id2!], [splice(0, 0, 'abcd')]),
    });
    expect(await first.settled).toEqual({ seq: h.r0 + 1 });
    expect(await second.settled).toEqual({ seq: h.r0 + 1 });
    expect(h.room.status()).toMatchObject({ pending: 0, retained: 2, seq: h.r0 + 1 });
    expect(textOf(h.room.document())).toBe(`abcd${before}`);
    expect(h.changes[h.changes.length - 1]?.reason).toBe('ack');
    // the answer follows: its two entries at the same seq repeat nothing
    h.hold(false);
    await h.room.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(textOf(h.room.document())).toBe(`abcd${before}`);
    expect(h.posts).toHaveLength(1);
    // the echo delivered again by the stream (the answer's instance and the poll's) is a duplicate
    h.fire({
      type: 'op',
      entry: h.echo(h.r0 + 1, TAB_A, [id1!, id2!], [splice(0, 0, 'abcd')]),
    });
    expect(textOf(h.room.document())).toBe(`abcd${before}`);
    expect(h.room.status().pending).toBe(0);
    await h.room.stop();
  });

  it('settles a record without an origin by the byte match of its fold, the fallback for a server from before the round', async () => {
    const h = blobTab();
    h.room.start();
    h.hello(TAB_A);
    const before = textOf(h.room.document());
    h.hold(true);
    const applied = h.room.apply([splice(0, 0, 'q')], 'type');
    await until(() => h.posts.length === 1);
    // the record travels as `store` with no covers: the fold, byte for byte, is the match
    h.fire({
      type: 'op',
      entry: {
        seq: h.r0 + 1,
        rev: h.r0,
        kind: 'edit',
        author: kevin.author,
        clientId: 'store',
        opId: `store:${h.r0 + 1}`,
        mutations: [splice(0, 0, 'q')],
        at: new Date().toISOString(),
      },
    });
    expect(await applied.settled).toEqual({ seq: h.r0 + 1 });
    expect(textOf(h.room.document())).toBe(`q${before}`);
    // the answer arrives after the echo, at the commit's seq, and repeats nothing
    h.answerAt(h.r0 + 1);
    h.hold(false);
    await h.room.flush();
    expect(textOf(h.room.document())).toBe(`q${before}`);
    // an equal fold from another tab that names its origin is never taken for this tab's
    h.hold(true);
    const other = h.room.apply([splice(0, 0, 'z')], 'type');
    await until(() => h.posts.length === 2);
    h.fire({
      type: 'op',
      entry: h.echo(h.r0 + 2, TAB_B, [`${TAB_B}:1`], [splice(0, 0, 'z')]),
    });
    expect(h.room.status().pending).toBe(1);
    expect(textOf(h.room.document())).toBe(`zzq${before}`);
    h.hold(false);
    await h.room.flush();
    expect(await other.settled).toEqual({ seq: h.r0 + 3 });
    expect(textOf(h.room.document())).toBe(`zzq${before}`);
    await h.room.stop();
  });

  it('applies an inverse recorded before a remote insert in the same block at the shifted offset (invariant 11)', async () => {
    const h = blobTab();
    h.room.start();
    h.hello(TAB_A);
    const before = textOf(h.room.document());
    const applied = h.room.apply([splice(0, 0, 'A')], 'type');
    await h.room.flush();
    expect(await applied.settled).toEqual({ seq: h.r0 + 1 });
    // another person's record lands in front of the insert
    h.fire({
      type: 'op',
      entry: h.echo(h.r0 + 2, TAB_B, [`${TAB_B}:1`], [splice(0, 0, 'BB')]),
    });
    expect(textOf(h.room.document())).toBe(`BBA${before}`);
    const inverse = h.room.transformSince(applied.inverse, applied.at);
    expect(inverse).toEqual([splice(2, 1, '')]);
    h.room.apply(inverse, 'undo');
    expect(textOf(h.room.document())).toBe(`BB${before}`);
    await h.room.stop();
  });

  it('skips the author’s own echo by client id in transformSince and moves the inverse past a second tab of the same person (invariant 11)', async () => {
    const h = blobTab();
    h.room.start();
    h.hello(TAB_A);
    const before = textOf(h.room.document());
    h.hold(true);
    const applied = h.room.apply([splice(0, 0, 'A')], 'type');
    await until(() => h.posts.length === 1);
    const opId = h.posts[0]!.entries[0]!.opId;
    // the own echo, under this tab's id and covering its op: not a remote entry for the inverse
    h.fire({ type: 'op', entry: h.echo(h.r0 + 1, TAB_A, [opId], [splice(0, 0, 'A')]) });
    expect(await applied.settled).toEqual({ seq: h.r0 + 1 });
    expect(h.room.transformSince(applied.inverse, applied.at)).toEqual([splice(0, 1, '')]);
    // a second tab of the same person (another client id, the same author) inserts before it:
    // remote to this tab, so the inverse moves past it
    h.fire({
      type: 'op',
      entry: h.echo(h.r0 + 2, TAB_A2, [`${TAB_A2}:1`], [splice(0, 0, 'xy')]),
    });
    expect(textOf(h.room.document())).toBe(`xyA${before}`);
    expect(h.room.transformSince(applied.inverse, applied.at)).toEqual([splice(2, 1, '')]);
    // an echo under `store` whose covers name this tab's op (a follower that kept the fixed id)
    // is this tab's own as well
    const again = h.room.apply([splice(3, 0, 'Q')], 'type');
    h.hold(false);
    await h.room.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = h.posts[h.posts.length - 1]!.entries[0]!.opId;
    expect(await again.settled).toEqual({ seq: h.r0 + 3 });
    h.fire({ type: 'op', entry: h.echo(h.r0 + 3, 'store', [second], [splice(3, 0, 'Q')]) });
    expect(h.room.transformSince(again.inverse, again.at)).toEqual([splice(3, 1, '')]);
    expect(textOf(h.room.document())).toBe(`xyAQ${before}`);
    await h.room.stop();
  });

  it('drops the pending ops a resync’s since answer names as acknowledged at their record’s seq and re-folds the rest (invariant 10)', async () => {
    const document = normalized();
    const r0 = document.deck.revision;
    let sinceAsked: number | null = null;
    let pendingIds: string[] = [];
    const h = blobTab({
      author: kevin.author,
      head: r0,
      onResync: async (_revision, since) => {
        sinceAsked = since;
        // the store's document at the head: the first op committed as revision r0 + 1, then a
        // colleague's word as r0 + 2; the resync read answers both records' origins
        const committed = applyMutations(document, [
          splice(0, 0, 'k'),
          splice(1, 0, 'mm'),
        ]).document;
        return {
          document: { deck: { ...committed.deck, revision: r0 + 2 }, slides: committed.slides },
          origins: [
            { seq: r0 + 1, opIds: [pendingIds[0]!] },
            { seq: r0 + 2, opIds: [`${TAB_B}:7`] },
          ],
        };
      },
    });
    h.room.start();
    h.hello(TAB_A);
    h.hold(true);
    const first = h.room.apply([splice(0, 0, 'k')], 'type');
    await until(() => h.posts.length === 1);
    const second = h.room.apply([splice(1, 0, 'zz')], 'type');
    pendingIds = [h.posts[0]!.entries[0]!.opId];
    expect(h.room.status().pending).toBe(2);
    // the server asks for a resync: the read carries the tab's position before it
    h.fire({ type: 'resync', revision: r0 + 2 });
    expect(await first.settled).toEqual({ seq: r0 + 1 });
    await until(() => h.room.status().seq === r0 + 2);
    expect(sinceAsked).toBe(r0);
    // the first op is acknowledged from the origins and never re-sent; the second re-folds on
    // the fresh document and goes on the new base
    expect(h.room.status().pending).toBe(1);
    h.hold(false);
    await h.room.flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const resent = h.posts.slice(1).flatMap((post) => post.entries.map((entry) => entry.opId));
    expect(resent).not.toContain(pendingIds[0]);
    expect(await second.settled).toEqual({ seq: r0 + 3 });
    expect(h.room.status().pending).toBe(0);
    await h.room.stop();
  });

  it('returns a posted op to its author when the resync read is bounded (the records did not reach the old position), and keeps one never posted', async () => {
    const document = normalized();
    const r0 = document.deck.revision;
    const rejects: string[] = [];
    const h = blobTab({
      author: kevin.author,
      head: r0,
      onResync: async () => ({
        document: { deck: { ...document.deck, revision: r0 + 5000 }, slides: document.slides },
        bounded: true,
      }),
    });
    h.room.start();
    h.hello(TAB_A);
    h.hold(true);
    const posted = h.room.apply([splice(0, 0, 'k')], 'type');
    await until(() => h.posts.length === 1);
    // typed after the POST left: no op id yet, never on the wire
    const fresh = h.room.apply([splice(1, 0, 'q')], 'type');
    h.fire({ type: 'resync', revision: r0 + 5000 });
    const outcome = await posted.settled;
    expect('rejected' in outcome && outcome.rejected.reason).toBe('stale');
    if ('rejected' in outcome) rejects.push(outcome.rejected.message ?? '');
    expect(rejects[0]).toContain('no longer fits');
    expect(h.room.rejects()).toHaveLength(1);
    // the never posted op stays pending and goes on the new base
    expect(h.room.status().pending).toBe(1);
    h.hold(false);
    await h.room.flush();
    expect(await fresh.settled).toEqual({ seq: r0 + 5001 });
    await h.room.stop();
  });

  it('moves the heartbeat from 5 s to 10 s after 30 quiet seconds and back to 5 s on a pointer move (3.10)', async () => {
    const h = blobTab({ author: kevin.author, head: 0, fakeTimers: true });
    h.room.start();
    h.hello(TAB_A);
    // the hello posts the presence at once (a zero wait on the test's clock)
    h.advance(0);
    expect(h.presences.length).toBe(1);
    const beats = () => h.timers.filter((t) => t.ms === 5000 || t.ms === 10_000).map((t) => t.ms);
    // active: the beat is armed at 5 s and posts every 5 s
    expect(beats()).toEqual([5000]);
    h.advance(5000);
    expect(h.presences.length).toBe(2);
    expect(beats()).toEqual([5000]);
    // the pointer, the selection and the slide stay still: from 30 quiet seconds on the beat
    // that is armed is the quiet one
    for (let i = 0; i < 5; i += 1) h.advance(5000);
    expect(h.presences.length).toBe(7);
    expect(beats()).toEqual([10_000]);
    h.advance(10_000);
    expect(h.presences.length).toBe(8);
    expect(beats()).toEqual([10_000]);
    // a pointer move: the tab is active again and the quiet beat re-arms at 5 s
    h.room.setPresence({ pointer: { x: 10, y: 10 } });
    expect(beats()).toEqual([5000]);
    // the batch posts the move at once, and the beat 5 s later is the active one again
    h.advance(PRESENCE_BATCH_MS);
    expect(h.presences.length).toBe(9);
    h.advance(5000);
    expect(h.presences.length).toBe(10);
    expect(beats()).toEqual([5000]);
    // a presence change that moves nothing (the pointer toggle) keeps the quiet window running
    for (let i = 0; i < 6; i += 1) h.advance(5000);
    expect(beats()).toEqual([10_000]);
    h.room.setPresence({ pointerOn: true });
    expect(beats()).toEqual([10_000]);
    await h.room.stop();
  });
  it('applies a batch once when its echo and the answer’s own entries drain together above a gap, in either order (3.2)', async () => {
    for (const echoFirst of [true, false]) {
      const h = blobTab();
      h.room.start();
      h.hello(TAB_A);
      const before = textOf(h.room.document());
      h.hold(true);
      const first = h.room.apply([splice(0, 0, 'ab')], 'type');
      const second = h.room.apply([splice(2, 0, 'cd')], 'type');
      await until(() => h.posts.length === 1);
      const ids = h.posts[0]!.entries.map((entry) => entry.opId);
      // another writer's record lands at r0 + 1 and this tab's batch at r0 + 2 (placed by the
      // server past that insert, so its offsets read one higher), but the stream delivers r0 + 2
      // first: the echo and the answer's entries buffer above the gap
      const echo = h.echo(h.r0 + 2, TAB_A, ids, [splice(1, 0, 'abcd')]);
      const answers: Entry[] = ids.map((opId, i) => ({
        seq: h.r0 + 2,
        rev: h.r0 + 1,
        kind: 'edit',
        author: kevin.author,
        clientId: TAB_A,
        opId,
        mutations: [i === 0 ? splice(1, 0, 'ab') : splice(3, 0, 'cd')],
        at: new Date().toISOString(),
      }));
      const above = echoFirst ? [echo, ...answers] : [...answers, echo];
      for (const entry of above) h.fire({ type: 'op', entry });
      // nothing applied yet: the gap under them is open
      expect(h.room.status()).toMatchObject({ seq: h.r0, pending: 2 });
      // the gap fills with the other writer's record: everything drains in one pass
      h.fire({ type: 'op', entry: h.echo(h.r0 + 1, TAB_B, [`${TAB_B}:1`], [splice(0, 0, 'Z')]) });
      expect(await first.settled).toEqual({ seq: h.r0 + 2 });
      expect(await second.settled).toEqual({ seq: h.r0 + 2 });
      expect(h.room.status()).toMatchObject({ seq: h.r0 + 2, pending: 0 });
      // the batch once, at the offsets the server placed it, whichever sibling drained first
      expect(textOf(h.room.document())).toBe(`Zabcd${before}`);
      h.hold(false);
      await h.room.stop();
    }
  });

  it('makes no reject card for an op its record’s echo acknowledged while the POST was in flight when the answer then refuses it (the vector round fix round; VERIFICATION.md "Vector round, pass 1" finding 1)', async () => {
    const document = normalized();
    const r0 = document.deck.revision;
    let onEvent: ((event: RoomEvent) => void) | null = null;
    let release: (() => void) | null = null;
    const posts: OpsPost[] = [];
    const transport: RoomTransport & { fire: (event: RoomEvent) => void } = {
      fire(event) {
        onEvent?.(event);
      },
      open(o: OpenOptions) {
        onEvent = o.onEvent;
        return { close: () => undefined };
      },
      async postOps(body) {
        posts.push(structuredClone(body));
        await new Promise<void>((resolve) => (release = resolve));
        // the store committed the first attempt and this instance placed the op again against
        // a document holding it: the reducer's word, no entry
        return {
          ok: true,
          entries: [],
          rejected: body.entries.map((entry) => ({
            opId: entry.opId,
            reason: 'invalid' as const,
            message: 'Block "shape-6" already exists on slide "blank-7"',
          })),
          head: r0 + 1,
          revision: r0 + 1,
        };
      },
      async postPresence() {
        return undefined;
      },
    };
    const rejected: { opId: string }[] = [];
    const changes: DocumentChange[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document,
      seq: r0,
      tier: 'blob',
      transform: testTransform,
      onChange: (change) => changes.push(change),
      onReject: (r) => rejected.push(r),
    });
    room.start();
    transport.fire({
      type: 'hello',
      seq: r0,
      revision: r0,
      clientId: TAB_A,
      role: 'editor',
      clients: [],
      editing: 1,
      tier: 'blob',
    });
    const before = textOf(room.document());
    const word = room.apply([splice(0, 0, 'ab')], 'type');
    await until(() => posts.length === 1);
    const opId = posts[0]!.entries[0]!.opId;
    // the record's echo reaches the tab before the answer: the op is acknowledged at r0 + 1
    transport.fire({
      type: 'op',
      entry: {
        seq: r0 + 1,
        rev: r0,
        kind: 'edit',
        author: kevin.author,
        clientId: TAB_A,
        opId: `store:${r0 + 1}`,
        mutations: [splice(0, 0, 'ab')],
        at: new Date().toISOString(),
        covers: [opId],
      },
    });
    expect(await word.settled).toEqual({ seq: r0 + 1 });
    expect(room.status()).toMatchObject({ pending: 0, seq: r0 + 1 });
    // the answer refuses the same op id: no card, nothing re-folded, the word once
    (release as (() => void) | null)?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rejected).toEqual([]);
    expect(room.rejects()).toEqual([]);
    expect(changes.some((change) => change.reason === 'reject')).toBe(false);
    expect(textOf(room.document())).toBe(`ab${before}`);
    await room.stop();
  });
});
