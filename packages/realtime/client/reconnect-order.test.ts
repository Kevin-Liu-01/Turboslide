// The reconnect's order after the browser's `online` event (docs/SYNC.md 3.7; the polish round's
// sync fix round 3): the stream reopens at once, its replay lands first, then the resend goes at
// the caught up base with the pending ops transformed past what landed while the browser was
// off, so the resend carries the shifted offset (the row sync.block.offline-replay-converges).
// Item 100's online event flushed at once, and the resend went at the old base with the original
// offset for the server to transform: the enforce preview of 2026-09-30 read the same offset, 18,
// on the first attempt and on the admitted POST, twice. The hold is released by a reopen that
// failed (the ops post while the stream waits for a slot, C3-F1) and by RECONNECT_HOLD_MAX_MS.
import { afterEach, describe, expect, it } from 'vitest';

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
import { createRoomClient } from './room-client.ts';

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

type Listener = () => void;
/** The browser's `offline` and `online` events, which the room client listens to on `window`. */
function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener): void {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string): void {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  };
}

type PostRow = { base: number; at: number | null; ok: boolean };
/** A tab's transport with every ops POST's base and splice offset recorded, and whether it was admitted. */
function recorded(tab: ReturnType<typeof tabTransport>, posts: PostRow[]) {
  return {
    ...tab,
    async postOps(body: OpsPost) {
      const first = body.entries
        .flatMap((entry) => ('mutations' in entry ? (entry.mutations ?? []) : []))
        .find((mutation) => mutation.op === 'text.splice');
      const row: PostRow = {
        base: body.base.seq,
        at: first !== undefined && first.op === 'text.splice' ? first.at : null,
        ok: false,
      };
      posts.push(row);
      const answer = await tab.postOps(body);
      row.ok = answer.ok;
      return answer;
    },
  };
}

const refusedOpen = {
  status: 503,
  code: 'busy',
  message: 'The stream answered 503',
  retryAfterMs: 60_000,
};

describe('the reconnect after the browser’s online event (docs/SYNC.md 3.7)', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  /** A tab that typed one word at offset 0 while the browser was off and three words landed at the head. */
  async function cutAndType() {
    const channel = memoryChannel();
    const document = normalized();
    const original = textOf(document);
    const server = fakeRoomServer({ deckId: 'gt-brand', channel, document });
    const tab = tabTransport(server, kevin);
    const posts: PostRow[] = [];
    const browser = fakeWindow();
    (globalThis as { window?: unknown }).window = browser;
    const room = createRoomClient({
      deckId: 'gt-brand',
      transport: recorded(tab, posts),
      document: server.document(),
      seq: server.seq(),
      transform: testTransform,
      onChange: () => undefined,
      onResync: async () => server.document(),
    });
    room.start();
    await until(() => room.status().connected);
    // the cut: the browser says offline, every POST throws, the stream dies and its reopen is
    // refused (the network is gone for the open too)
    tab.offline(true);
    tab.refuseOpens(refusedOpen);
    browser.dispatch('offline');
    server.kill();
    await until(() => !room.status().connected);
    expect(room.status().offline).toBe(true);
    // three words land at the head while the tab is off; the tab types one at 0 and its POST fails
    for (const word of ['E1 ', 'E2 ', 'E3 ']) {
      await server.appendExternal(maya.author, [splice(0, 0, word)]);
    }
    const head = server.seq();
    room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => posts.length >= 1, 3000);
    expect(posts[0]).toMatchObject({ base: head - 3, at: 0, ok: false });
    return { server, tab, room, posts, browser, head, original };
  }

  it('reopens the stream at once, lands the replay and resends at the caught up base with the shifted offset', async () => {
    const { server, tab, room, posts, browser, head, original } = await cutAndType();
    // the return: the network is back for the open and the POST, and the browser says so
    tab.offline(false);
    tab.refuseOpens(null);
    browser.dispatch('online');
    await until(() => room.status().connected && room.status().pending === 0, 5000);
    const admitted = posts.find((row) => row.ok);
    expect(admitted).toBeDefined();
    // the resend went after the replay: at the head the hello named, past the three words
    expect(admitted!.base).toBe(head);
    expect(admitted!.at).toBe('E1 E2 E3 '.length);
    expect(textOf(server.document())).toBe(`E3 E2 E1 k${original}`);
    expect(textOf(room.document())).toBe(textOf(server.document()));
    expect(room.status().offline).toBe(false);
    expect(room.status().resending).toBe(false);
    await room.stop();
  });

  it('releases the hold when the reopened stream is refused, so the ops post while the stream waits (C3-F1)', async () => {
    const { server, tab, room, posts, browser, head, original } = await cutAndType();
    // the POST route is back, the stream route still refuses: the resend must not wait a minute
    tab.offline(false);
    browser.dispatch('online');
    await until(() => room.status().pending === 0, 3000);
    const admitted = posts.find((row) => row.ok);
    expect(admitted).toBeDefined();
    // the resend went on the base the tab had, and the server transformed it (docs/SYNC.md 3.3)
    expect(admitted!.base).toBe(head - 3);
    expect(admitted!.at).toBe(0);
    expect(textOf(server.document())).toBe(`E3 E2 E1 k${original}`);
    expect(room.status().streamDown).toBe(true);
    tab.refuseOpens(null);
    await room.stop();
  });
});
