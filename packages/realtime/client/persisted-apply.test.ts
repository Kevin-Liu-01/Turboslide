// The Apply of a queue an earlier tab of this browser saved (hardening HR-RC#5a, RC#5b, RC#5d;
// RELIABILITY-5 and 6). A tab closed with unsent work leaves its queue in the pending store, and
// the next open offers it. Before this round Apply wrote each op at its old offsets on the
// current document ("Zulu Alpha Bravo Ch Xrayarlie", reliability.md S1 and S2), applied again an
// op the room already held ("Alpha Bravo Charlie Charlie"), and the store dropped the oldest
// entries of a queue over 1 MB without a word. The rooms here are the fake room server's over the
// memory channel, with the room's own transform and run rule.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import { until } from '../src/channel-contract.ts';
import { memoryChannel } from '../src/memory.ts';
import type { OpsPost } from '../src/protocol.ts';
import { fakeRoomServer, tabTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { memoryPendingStore, pendingKey } from './pending-store.ts';
import type { PersistedQueue } from './pending-store.ts';
import {
  PERSISTED_SENTENCE,
  QUEUE_FULL_SENTENCE,
  createRoomClient,
  defaultTransform,
} from './room-client.ts';
import type { PersistedOffer, Rejected, RoomClientOptions, RoomTransport } from './room-client.ts';

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

function splice(at: number, insert: string): Mutation {
  return {
    op: 'text.splice',
    slideId: SLIDE,
    blockId: BLOCK,
    path: '/text',
    at,
    remove: 0,
    insert,
  };
}

type Notice = Rejected & { mutations?: Mutation[] };

function room() {
  const channel = memoryChannel();
  const server = fakeRoomServer({ deckId: 'gt-brand', channel, document: normalized() });
  const store = memoryPendingStore();
  const tab = (
    identity: FakeIdentity,
    extra: Partial<RoomClientOptions> = {},
    transport: RoomTransport = tabTransport(server, identity),
  ) => {
    const notices: Notice[] = [];
    let offer: PersistedOffer | undefined;
    const client = createRoomClient({
      deckId: 'gt-brand',
      transport,
      document: server.document(),
      seq: server.seq(),
      transform: defaultTransform,
      pendingStore: store,
      onChange: () => undefined,
      onReject: (notice) => notices.push(notice),
      onPersisted: (value) => (offer = value),
      onResync: async () => server.document(),
      ...extra,
    });
    return { client, notices, offer: () => offer, transport };
  };
  return { server, channel, store, tab };
}

const settled = async (client: ReturnType<typeof createRoomClient>): Promise<void> => {
  await until(() => client.status().pending === 0 && client.status().connected, 5000);
};

describe('Apply of a saved queue (HR-RC#5a, RC#5b, RC#5d)', () => {
  it('places the words where they were typed after another person edited the text (RC#5a)', async () => {
    const h = room();
    const start = textOf(h.server.document());
    // A goes offline, types " Xray" at the end, and closes the tab
    const a = h.tab(kevin);
    a.client.start();
    await until(() => a.client.status().connected);
    (a.transport as ReturnType<typeof tabTransport>).offline(true);
    a.client.apply([splice(start.length, ' Xray')], 'type', 'now');
    await a.client.stop();
    // B puts "Zulu " in front of the text meanwhile
    const b = h.tab(maya, { pendingStore: undefined, onPersisted: undefined });
    b.client.start();
    await until(() => b.client.status().connected);
    b.client.apply([splice(0, 'Zulu ')], 'type', 'now');
    await settled(b.client);
    // A opens the deck again and applies the saved change
    const c = h.tab(kevin);
    c.client.start();
    await until(() => c.offer() !== undefined && c.client.status().connected);
    expect(c.offer()?.count).toBe(1);
    await c.offer()?.apply();
    await settled(c.client);
    expect(textOf(h.server.document())).toBe(`Zulu ${start} Xray`);
    expect(textOf(c.client.document())).toBe(`Zulu ${start} Xray`);
    expect(c.notices).toEqual([]);
    expect(await h.store.load('gt-brand')).toHaveLength(1);
    for (const tab of [b, c]) await tab.client.stop();
  });

  it('applies nothing the room took before the tab closed (RELIABILITY-6)', async () => {
    const h = room();
    const start = textOf(h.server.document());
    // A's POST reaches the room and its answer is lost as the tab closes
    const base = tabTransport(h.server, kevin);
    let lose = true;
    let admitted = 0;
    const lossy: RoomTransport = {
      ...base,
      // the stream carries nothing after the hello, so the tab never sees its own entry
      open: (options) =>
        base.open({
          ...options,
          onEvent: (event) => {
            if (event.type === 'hello') options.onEvent(event);
          },
        }),
      async postOps(body: OpsPost) {
        const answer = await base.postOps(body);
        if (answer.ok) admitted += answer.entries.length;
        if (lose) throw new Error('the answer was lost');
        return answer;
      },
    };
    const a = h.tab(kevin, {}, lossy);
    a.client.start();
    await until(() => a.client.status().connected);
    a.client.apply([splice(start.length, ' Charlie')], 'type', 'now');
    await until(() => admitted > 0);
    await a.client.stop();
    lose = false;
    expect((await h.store.load('gt-brand'))[0]?.entries).toHaveLength(1);
    const c = h.tab(kevin);
    c.client.start();
    await until(() => c.offer() !== undefined && c.client.status().connected);
    await c.offer()?.apply();
    await settled(c.client);
    expect(textOf(h.server.document())).toBe(`${start} Charlie`);
    expect(c.notices).toEqual([]);
    await c.client.stop();
  });

  it('hands the text back on a card for a queue saved without a position or on another tier (RC#5b)', async () => {
    const h = room();
    const start = textOf(h.server.document());
    const saved = (clientId: string, extra: Partial<PersistedQueue>): PersistedQueue => ({
      key: pendingKey('gt-brand', clientId),
      deckId: 'gt-brand',
      clientId,
      savedAt: new Date().toISOString(),
      entries: [{ opId: `${clientId}:1`, kind: 'edit', mutations: [splice(0, 'Kept text ')] }],
      ...extra,
    });
    // an older build saved no position; a queue of the do tier read on the memory tier
    await h.store.save(saved('oldbuild', {}));
    await h.store.save(saved('othertier', { position: 0, tier: 'do' }));
    const c = h.tab(kevin);
    c.client.start();
    await until(() => c.offer() !== undefined && c.client.status().connected);
    expect(c.offer()?.count).toBe(2);
    await c.offer()?.apply();
    expect(c.notices).toEqual([
      expect.objectContaining({
        message: PERSISTED_SENTENCE,
        mutations: [splice(0, 'Kept text ')],
      }),
      expect.objectContaining({
        message: PERSISTED_SENTENCE,
        mutations: [splice(0, 'Kept text ')],
      }),
    ]);
    expect(textOf(c.client.document())).toBe(start);
    expect(c.client.status().pending).toBe(0);
    expect(await h.store.load('gt-brand')).toHaveLength(0);
    await c.client.stop();
  });

  it('refuses a change past the 1 MB the browser keeps and keeps every queued one (RC#5d)', async () => {
    const h = room();
    const a = h.tab(kevin);
    a.client.start();
    await until(() => a.client.status().connected);
    (a.transport as ReturnType<typeof tabTransport>).offline(true);
    const set = (n: number): Mutation => ({
      op: 'block.set',
      slideId: SLIDE,
      blockId: BLOCK,
      path: '/text',
      value: `${n}`.repeat(150_000),
    });
    for (let n = 1; n <= 6; n += 1) a.client.apply([set(n)], 'type', 'now');
    expect(() => a.client.apply([set(7)], 'type', 'now')).toThrow(QUEUE_FULL_SENTENCE);
    expect(a.client.status().pending).toBe(6);
    // the author reads the sentence on the card that keeps the refused change's text
    expect(a.notices).toEqual([
      expect.objectContaining({ message: QUEUE_FULL_SENTENCE, mutations: [set(7)] }),
    ]);
    await a.client.stop();
    const [queue] = await h.store.load('gt-brand');
    expect(queue?.entries).toHaveLength(6);
    expect(queue?.entries[0]?.mutations).toEqual([set(1)]);
  });
});

describe('the held check of a saved queue (HR-RC#6)', () => {
  /** The op ids the fake room's log holds, as write.ts heldOf answers them. */
  const heldIn =
    (h: ReturnType<typeof room>) =>
    async (opIds: ReadonlyArray<string>): Promise<ReadonlySet<string>> => {
      const entries = await h.channel.since('gt-brand', 0, 1000);
      const ids = new Set(entries.map((entry) => entry.opId));
      return new Set(opIds.filter((id) => ids.has(id)));
    };

  it('offers nothing while the check fails and offers once it answers', async () => {
    const h = room();
    const a = h.tab(kevin);
    a.client.start();
    await until(() => a.client.status().connected);
    (a.transport as ReturnType<typeof tabTransport>).offline(true);
    a.client.apply([splice(0, 'Kept ')], 'type', 'now');
    await a.client.stop();
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const c = h.tab(kevin, {
      heldOps: async (ids) => {
        calls += 1;
        if (calls === 1) throw new Error('the check failed');
        if (calls === 2) {
          await gate;
          throw new Error('the check failed again');
        }
        return heldIn(h)(ids);
      },
      // the retry waits run at once here
      timers: {
        setTimeout: (run: () => void) => setTimeout(run, 1),
        clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    });
    c.client.start();
    await until(() => calls === 2);
    // two checks asked, none answered: nothing is offered (a failure counted as none held before)
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(c.offer()).toBeUndefined();
    release();
    await until(() => c.offer() !== undefined);
    expect(calls).toBe(3);
    expect(c.offer()?.count).toBe(1);
    await c.client.stop();
  });

  it('applies an op the room holds once and keeps the op written after it on it', async () => {
    const h = room();
    const start = textOf(h.server.document());
    // A's " one" reaches the room and its answer is lost; " two" never leaves; the stream is mute
    const base = tabTransport(h.server, kevin);
    let posts = 0;
    const lossy: RoomTransport = {
      ...base,
      open: (options) =>
        base.open({
          ...options,
          onEvent: (event) => {
            if (event.type === 'hello') options.onEvent(event);
          },
        }),
      async postOps(body: OpsPost) {
        posts += 1;
        if (posts > 1) throw new Error('offline');
        await base.postOps(body);
        throw new Error('the answer was lost');
      },
    };
    const a = h.tab(kevin, {}, lossy);
    a.client.start();
    await until(() => a.client.status().connected);
    a.client.apply([splice(start.length, ' one')], 'type', 'now');
    await until(() => posts > 0);
    a.client.apply([splice(start.length + 4, ' two')], 'type', 'now');
    await a.client.stop();
    // B writes in front meanwhile
    const b = h.tab(maya, { pendingStore: undefined, onPersisted: undefined });
    b.client.start();
    await until(() => b.client.status().connected);
    b.client.apply([splice(0, 'Zulu ')], 'type', 'now');
    await settled(b.client);
    const c = h.tab(kevin, { heldOps: heldIn(h) });
    c.client.start();
    await until(() => c.offer() !== undefined && c.client.status().connected);
    // " one" is the room's: only " two" is offered
    expect(c.offer()?.count).toBe(1);
    await c.offer()?.apply();
    await settled(c.client);
    expect(textOf(h.server.document())).toBe(`Zulu ${start} one two`);
    expect(c.notices).toEqual([]);
    for (const tab of [b, c]) await tab.client.stop();
  });
});
