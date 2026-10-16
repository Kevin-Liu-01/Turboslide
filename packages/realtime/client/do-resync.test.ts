// A long gap on the do tier (hardening HR-RC#7, RELIABILITY-17, the client half). On the do tier,
// as on the memory tier the fake server runs here, a stream seq counts entries and is not the
// revision. Before this, after a gap the tab reloaded the document and re-folded its pending text
// at the offsets it was typed at, and its position stayed where it was. Reproduced on
// `origin/main` 8c9465b6 with the stream down and the POSTs answered: every POST went at the old
// base and was answered 409 `resync`, a reload each time (8 to 25 reads in 300 ms), and when the
// stream came back its replay applied the gap's entries a second time on the document that held
// them (the tab showed another person's 600 letters twice: 1,315 characters against the room's
// 715). Now a gap the stream can replay is caught up through the stream, whose replay moves the
// pending text past what landed; a reload moves the position to the document's (the loader's
// `room.seq`), and past the bound typed text returns to its author as a card.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import type { RealtimeChannel, RoomEvent } from '../src/channel.ts';
import { until } from '../src/channel-contract.ts';
import { memoryChannel } from '../src/memory.ts';
import { BASE_SEQ_WINDOW, REPLAY_MAX_ENTRIES } from '../src/protocol.ts';
import type { OpsPost } from '../src/protocol.ts';
import { fakeRoomServer, tabTransport } from './fake-transport.ts';
import type { FakeIdentity } from './fake-transport.ts';
import { UNPLACEABLE_SENTENCE, createRoomClient } from './room-client.ts';
import type { Rejected, ResyncAnswer, RoomClientOptions, StreamHandle } from './room-client.ts';

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
const colleague = {
  kind: 'human' as const,
  name: 'Cobalt 112',
  principalId: 'anon_11111111-2222-4333-8444-555555555555',
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
const fastTimers = {
  setTimeout: (run: () => void, ms: number) => setTimeout(run, Math.ceil(ms / 50)),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A tab on the do tier over the fake server, the controller's resync read (the document and its
 * position), and a knob that answers every ops POST 409 `resync` with a head past the replay, the
 * way the object answers a base more than REPLAY_MAX_ENTRIES behind. `openDelayMs` holds every
 * stream open that long in real time before the server sees it, as a slow network does.
 */
function doTab(options: { floor?: () => number | null; openDelayMs?: number } = {}) {
  // the memory channel under the do tier's word: the seq counts entries, the revision commits
  const channel: RealtimeChannel = { ...memoryChannel(), tier: 'do' };
  const server = fakeRoomServer({
    deckId: 'gt-brand',
    channel,
    document: normalized(),
    ...(options.floor === undefined ? {} : { floorFor: options.floor }),
  });
  const tab = tabTransport(server, kevin);
  const rejects: Rejected[] = [];
  let reads = 0;
  let unplaceable = 0;
  let pastReplay = false;
  const room = createRoomClient({
    deckId: 'gt-brand',
    transport: {
      ...tab,
      open(open) {
        const delay = options.openDelayMs;
        if (delay === undefined) return tab.open(open);
        let inner: StreamHandle | null = null;
        let closed = false;
        const timer = setTimeout(() => {
          if (!closed) inner = tab.open(open);
        }, delay);
        return {
          close: () => {
            closed = true;
            clearTimeout(timer);
            inner?.close();
          },
        };
      },
      async postOps(body: OpsPost) {
        if (pastReplay) {
          return {
            ok: false,
            status: 409,
            code: 'resync',
            message: 'resync',
            head: body.base.seq + REPLAY_MAX_ENTRIES + 1,
          };
        }
        return tab.postOps(body);
      },
    },
    document: server.document(),
    seq: server.seq(),
    tier: 'do',
    timers: fastTimers,
    onChange: () => undefined,
    onReject: (rejected) => rejects.push(rejected),
    onUnplaceable: () => {
      unplaceable += 1;
    },
    // the controller's answer (resyncAnswerOf): the loader's document and its position
    onResync: async () => {
      reads += 1;
      return { document: server.document(), position: { seq: server.seq(), tier: 'do' } };
    },
  });
  return {
    server,
    tab,
    room,
    rejects,
    reads: () => reads,
    unplaceable: () => unplaceable,
    pastReplay: (on: boolean) => {
      pastReplay = on;
    },
    original: textOf(server.document()),
  };
}

/** The tab's stream goes down and stays refused, and its POSTs fail. */
async function cut(h: ReturnType<typeof doTab>): Promise<void> {
  h.tab.refuseOpens({ status: 503, message: 'the room is restarting', retryAfterMs: 2000 });
  h.tab.offline(true);
  h.server.kill();
  await until(() => !h.room.status().connected, 30_000);
}

/** A colleague types `count` letters at the start of the tab's text while the tab is away. */
async function colleagueTypes(h: ReturnType<typeof doTab>, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await h.server.appendExternal(colleague, [splice(0, 0, 'z')]);
}

describe('a long gap on the do tier (HR-RC#7, RELIABILITY-17)', () => {
  it('catches a gap past the base window up through the stream: the typed word lands after the colleague’s letters, nothing is read again or applied twice', async () => {
    const h = doTab();
    h.room.start();
    await until(() => h.room.status().connected, 30_000);
    await cut(h);
    // the tab types at the end of the text
    h.room.apply([splice(h.original.length, 0, 'K')], 'type', 'now');
    const gap = BASE_SEQ_WINDOW + 20;
    await colleagueTypes(h, gap);
    // the POSTs come back first: answered 409 `resync`, the word waits for the stream
    h.tab.offline(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(h.reads()).toBe(0);
    expect(h.room.status().pending).toBe(1);
    // the stream comes back: its replay moves the word past the colleague's letters
    h.tab.refuseOpens(null);
    await until(() => h.room.status().pending === 0 || h.rejects.length > 0, 90_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(h.rejects).toEqual([]);
    const stored = textOf(h.server.document());
    expect(stored).toBe(`${'z'.repeat(gap)}${h.original}K`);
    expect(textOf(h.room.document())).toBe(stored);
    expect(h.room.status().seq).toBe(h.server.seq());
    expect(h.reads()).toBe(0);
    await h.room.stop();
  }, 300_000);

  it('lets a slow stream open answer while the writes are answered resync, then catches up through it', async () => {
    // each open reaches the server 600 ms after it starts, longer than a resend's round (the hold
    // of RECONNECT_HOLD_MAX_MS, 160 ms on these timers). Closing the open in flight at every 409
    // kept the stream down for good: the lane's browser reading on the memory tier read a 409
    // every 8 s for two minutes and no stream
    const h = doTab({ openDelayMs: 600 });
    h.room.start();
    await until(() => h.room.status().connected, 30_000);
    await cut(h);
    h.room.apply([splice(h.original.length, 0, 'K')], 'type', 'now');
    const gap = BASE_SEQ_WINDOW + 20;
    await colleagueTypes(h, gap);
    h.tab.offline(false);
    h.tab.refuseOpens(null);
    await until(() => h.room.status().pending === 0 || h.rejects.length > 0, 90_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(h.rejects).toEqual([]);
    const stored = textOf(h.server.document());
    expect(stored).toBe(`${'z'.repeat(gap)}${h.original}K`);
    expect(textOf(h.room.document())).toBe(stored);
    expect(h.reads()).toBe(0);
    await h.room.stop();
  }, 300_000);

  it('reloads once for a gap past the replay: the typed word returns as a card, and the stream that comes back applies nothing twice', async () => {
    const h = doTab();
    h.room.start();
    await until(() => h.room.status().connected, 30_000);
    await cut(h);
    h.room.apply([splice(h.original.length, 0, 'K')], 'type', 'now');
    const gap = BASE_SEQ_WINDOW + 20;
    await colleagueTypes(h, gap);
    // the room answers the resend as a base past the replay: one reload, at the document's
    // position, and the word typed on the old document returns to its author
    h.pastReplay(true);
    h.tab.offline(false);
    await until(() => h.room.rejects().length > 0, 90_000);
    h.pastReplay(false);
    expect(h.reads()).toBe(1);
    expect(h.room.rejects()).toHaveLength(1);
    expect(h.room.rejects()[0]).toMatchObject({
      reason: 'stale',
      message: UNPLACEABLE_SENTENCE,
      mutations: [splice(h.original.length, 0, 'K')],
    });
    expect(h.unplaceable()).toBe(1);
    expect(h.room.status().pending).toBe(0);
    expect(h.room.status().seq).toBe(h.server.seq());
    // the stream comes back from the document's position
    h.tab.refuseOpens(null);
    await until(() => h.room.status().connected, 90_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const stored = textOf(h.server.document());
    expect(stored).toBe(`${'z'.repeat(gap)}${h.original}`);
    expect(textOf(h.room.document())).toBe(stored);
    expect(h.reads()).toBe(1);
    await h.room.stop();
  }, 300_000);

  it('returns typed text as cards when the stream answers resync at its open, and applies nothing twice', async () => {
    // the replay floor stands in for a position more than REPLAY_MAX_ENTRIES behind: an open
    // from below it is answered `resync`, as the object answers one past the replay
    let floor: number | null = null;
    const h = doTab({ floor: () => floor });
    h.room.start();
    await until(() => h.room.status().connected, 30_000);
    await cut(h);
    h.room.apply([splice(h.original.length, 0, 'K')], 'type', 'now');
    await colleagueTypes(h, 40);
    floor = h.server.seq();
    h.tab.refuseOpens(null);
    await until(() => h.room.rejects().length > 0, 90_000);
    h.tab.offline(false);
    await until(() => h.room.status().connected, 90_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(h.reads()).toBe(1);
    expect(h.room.rejects()).toHaveLength(1);
    expect(h.room.rejects()[0]?.mutations).toEqual([splice(h.original.length, 0, 'K')]);
    expect(h.room.status().pending).toBe(0);
    const stored = textOf(h.server.document());
    expect(stored).toBe(`${'z'.repeat(40)}${h.original}`);
    expect(textOf(h.room.document())).toBe(stored);
    await h.room.stop();
  }, 300_000);
});

describe('the resync answer on the do tier (HR-RC#7)', () => {
  /** A tab on the do tier over a hand transport: the test fires the stream and answers the reads. */
  function handTab(onResync: RoomClientOptions['onResync']) {
    const document = normalized();
    const wire: { onEvent?: (event: RoomEvent) => void; opens: number } = { opens: 0 };
    const posts: OpsPost[] = [];
    // each POST waits for the test: in flight until `release` answers it with a 503
    const waiting: (() => void)[] = [];
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport: {
        open: (open) => {
          wire.opens += 1;
          wire.onEvent = open.onEvent;
          return { close: () => undefined };
        },
        postOps: async (body) => {
          posts.push(structuredClone(body));
          await new Promise<void>((resolve) => waiting.push(resolve));
          return { ok: false, status: 503, code: 'store_busy', message: 'busy' };
        },
        postPresence: async () => undefined,
      },
      document,
      seq: 10,
      tier: 'do',
      onChange: () => undefined,
      ...(onResync === undefined ? {} : { onResync }),
    });
    room.start();
    wire.onEvent?.({
      type: 'hello',
      seq: 10,
      revision: document.deck.revision,
      clientId: 'c'.repeat(32),
      role: 'editor',
      clients: [],
      editing: 1,
      tier: 'do',
    });
    const stop = async (): Promise<void> => {
      for (const answer of waiting.splice(0)) answer();
      await room.stop();
    };
    return { room, wire, posts, document, stop };
  }

  it('returns posted and unposted typed text as cards when the read says the records did not reach the position, and keeps a change without text', async () => {
    const document = normalized();
    const h = handTab(async () => ({
      document,
      bounded: true,
      position: { seq: 10, tier: 'do' },
    }));
    // posted: its POST is in flight, never answered
    const posted = h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.posts.length === 1, 30_000);
    // typed after it: no op id yet; and a change without text
    const typed = h.room.apply([splice(1, 0, 'q')], 'type');
    const measure: Mutation = {
      op: 'block.set',
      slideId: SLIDE,
      blockId: BLOCK,
      path: '/measure',
      value: 60,
    };
    h.room.apply([measure], 'measure');
    await h.room.resync();
    for (const settled of [posted.settled, typed.settled]) {
      const outcome = await settled;
      expect('rejected' in outcome && outcome.rejected.message).toBe(UNPLACEABLE_SENTENCE);
    }
    expect(h.room.rejects().map((row) => row.mutations)).toEqual([
      [splice(0, 0, 'k')],
      [splice(1, 0, 'q')],
    ]);
    expect(h.room.status().pending).toBe(1);
    expect(textOf(h.room.document())).toBe(textOf(document));
    await h.stop();
  }, 60_000);

  it('re-folds the pending text when the document is at the tab’s own position and nothing bounds it', async () => {
    const document = normalized();
    const h = handTab(async () => ({ document, position: { seq: 10, tier: 'do' } }));
    const typed = h.room.apply([splice(0, 0, 'k')], 'type');
    await h.room.resync();
    expect(h.room.rejects()).toEqual([]);
    expect(h.room.status().pending).toBe(1);
    expect(textOf(h.room.document())).toBe(`k${textOf(document)}`);
    void typed;
    await h.stop();
  }, 60_000);

  it('moves the position to the document’s on its own tier, down too with a replay from it, and leaves another tier’s alone', async () => {
    const document = normalized();
    let answered: ResyncAnswer['position'];
    const h = handTab(async () => ({
      document,
      ...(answered === undefined ? {} : { position: answered }),
    }));
    // a read on the blob tier names a revision, another numbering: left alone
    answered = { seq: 9999, tier: 'blob' };
    await h.room.resync();
    expect(h.room.status().seq).toBe(10);
    // a read without a position keeps the reading of before
    answered = undefined;
    await h.room.resync();
    expect(h.room.status().seq).toBe(10);
    // a read on the do tier: the position is the document's
    answered = { seq: 40, tier: 'do' };
    await h.room.resync();
    expect(h.room.status().seq).toBe(40);
    expect(h.wire.opens).toBe(1);
    // a document behind the position: the position is the document's and the stream opens
    // again from it, so its replay brings the entries the document lacks
    answered = { seq: 25, tier: 'do' };
    await h.room.resync();
    expect(h.room.status().seq).toBe(25);
    await until(() => h.wire.opens === 2, 30_000);
    await h.stop();
  }, 60_000);
});
