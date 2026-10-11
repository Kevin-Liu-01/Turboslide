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
import { memoryPendingStore } from './pending-store.ts';
import { createRoomClient, defaultTransform } from './room-client.ts';
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
  const server = fakeRoomServer({
    deckId: 'gt-brand',
    channel: memoryChannel(),
    document: normalized(),
  });
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
  return { server, store, tab };
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
});
