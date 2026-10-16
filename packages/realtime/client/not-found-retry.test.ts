// An ops POST answered 404 by an instance that does not know the deck yet (the blob tier's head
// of a deck made seconds ago answers null on another instance for a while; the polish round's
// sync fix round 3 read a resend answered 404 on the enforce preview 23 s after the deck's first
// write, and the word went to the card) is sent again on the backoff ladder for
// NOT_FOUND_RETRY_MS (hardening HR-RC#8, RELIABILITY-18). Before this the ops returned to their
// author after five retries, about 15 s, so a 404 that lasted 23 s took the person's words out
// of the slide. Past the window the client asks `hasStoredDeck`: the ops return only when the
// store says the deck is gone, and stay pending while it holds the deck.
//
// The clock is the test's: every wait the client arms runs a hundredth of its length in real
// time and moves the clock by its whole length, so 90 s of 404s take about a second.
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
import { BACKOFF_MAX_MS, NOT_FOUND_RETRY_MS, createRoomClient } from './room-client.ts';
import type { Rejected, RoomClientOptions } from './room-client.ts';

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
const notFound = {
  ok: false as const,
  status: 404,
  code: 'not_found',
  message: 'The room answered 404',
};

/** The test's clock: a wait of `ms` runs ms / 100 in real time and moves the clock by `ms`. */
function testClock() {
  let clock = 1_000_000;
  return {
    now: () => clock,
    timers: {
      setTimeout: (run: () => void, ms: number) => {
        const due = clock + ms;
        return setTimeout(
          () => {
            clock = Math.max(clock, due);
            run();
          },
          Math.ceil(ms / 100),
        );
      },
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  };
}

/**
 * A tab over the fake server whose ops POSTs are answered 404 while `notFound(elapsed)` holds,
 * `elapsed` being the test clock's time since the first POST.
 */
function harness(
  notFoundWhile: (elapsed: number) => boolean,
  hasStoredDeck?: RoomClientOptions['hasStoredDeck'],
) {
  const channel = memoryChannel();
  const document = normalized();
  const server = fakeRoomServer({ deckId: 'gt-brand', channel, document });
  const tab = tabTransport(server, kevin);
  const clock = testClock();
  let firstPostAt: number | null = null;
  const posts: number[] = [];
  const rejects: { rejected: Rejected; at: number }[] = [];
  const room = createRoomClient({
    deckId: 'gt-brand',
    transport: {
      ...tab,
      async postOps(body: OpsPost) {
        firstPostAt ??= clock.now();
        const elapsed = clock.now() - firstPostAt;
        posts.push(elapsed);
        if (notFoundWhile(elapsed)) return notFound;
        return tab.postOps(body);
      },
    },
    document: server.document(),
    seq: server.seq(),
    now: clock.now,
    timers: clock.timers,
    onChange: () => undefined,
    onReject: (rejected) =>
      rejects.push({ rejected, at: firstPostAt === null ? 0 : clock.now() - firstPostAt }),
    onResync: async () => server.document(),
    ...(hasStoredDeck === undefined ? {} : { hasStoredDeck }),
  });
  return { server, room, rejects, posts, original: textOf(document) };
}

describe('an ops POST answered 404 by an instance behind the store (HR-RC#8, RELIABILITY-18)', () => {
  it('keeps the ops through 25 s of 404s and lands them on the first 200, with nothing returned to the author', async () => {
    const h = harness((elapsed) => elapsed < 25_000);
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.posts.length >= 1);
    // the client is sending the write again: the title row's retry word, never Offline
    await until(() => h.room.status().resending, 2000);
    expect(h.room.status().offline).toBe(false);
    await until(() => h.room.status().pending === 0 || h.rejects.length > 0, 10_000);
    expect(h.rejects).toEqual([]);
    expect(h.room.status().pending).toBe(0);
    // the last POST went past the 25 s and the room took it once
    expect(h.posts[h.posts.length - 1]).toBeGreaterThanOrEqual(25_000);
    expect(textOf(h.server.document())).toBe(`k${h.original}`);
    expect(h.room.status().resending).toBe(false);
    await h.room.stop();
  });

  it('asks the store past the window and returns the ops once it says the deck is gone', async () => {
    // the test clock's time of the POST each ask followed
    const asked: number[] = [];
    let lastPost = (): number => -1;
    const h = harness(
      () => true,
      async () => {
        asked.push(lastPost());
        return false;
      },
    );
    lastPost = () => h.posts[h.posts.length - 1] ?? -1;
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.rejects.length === 1, 10_000);
    // the ops went again on the ladder for the whole window, then the store was asked once
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThanOrEqual(NOT_FOUND_RETRY_MS);
    expect(h.rejects[0]?.at).toBeGreaterThanOrEqual(NOT_FOUND_RETRY_MS);
    expect(h.rejects[0]?.rejected).toMatchObject({
      reason: 'forbidden',
      message: 'The room answered 404',
    });
    expect(h.room.status().pending).toBe(0);
    expect(textOf(h.server.document())).toBe(h.original);
    await h.room.stop();
  });

  it('keeps the ops past the window while the store holds the deck, and lands them when the room answers', async () => {
    let asks = 0;
    const h = harness(
      (elapsed) => elapsed < 90_000,
      async () => {
        asks += 1;
        return true;
      },
    );
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.room.status().pending === 0 || h.rejects.length > 0, 10_000);
    expect(h.rejects).toEqual([]);
    expect(asks).toBe(1);
    expect(h.posts[h.posts.length - 1]).toBeGreaterThanOrEqual(90_000);
    expect(textOf(h.server.document())).toBe(`k${h.original}`);
    await h.room.stop();
  });

  it('keeps the ops when the ask fails, the way a 5xx keeps them', async () => {
    let asks = 0;
    const h = harness(
      (elapsed) => elapsed < 70_000,
      async () => {
        asks += 1;
        throw new Error('the read failed');
      },
    );
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.room.status().pending === 0 || h.rejects.length > 0, 10_000);
    expect(h.rejects).toEqual([]);
    expect(asks).toBe(1);
    expect(textOf(h.server.document())).toBe(`k${h.original}`);
    await h.room.stop();
  });

  it('returns the ops once the window is spent when no ask is wired (a deck gone for good)', async () => {
    const h = harness(() => true);
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.rejects.length === 1, 10_000);
    expect(h.rejects[0]?.at).toBeGreaterThanOrEqual(NOT_FOUND_RETRY_MS);
    // at most one ladder step past the window
    expect(h.rejects[0]?.at).toBeLessThan(NOT_FOUND_RETRY_MS + 2 * BACKOFF_MAX_MS);
    expect(h.rejects[0]?.rejected).toMatchObject({
      reason: 'forbidden',
      message: 'The room answered 404',
    });
    expect(h.room.status().pending).toBe(0);
    expect(textOf(h.server.document())).toBe(h.original);
    await h.room.stop();
  });
});
