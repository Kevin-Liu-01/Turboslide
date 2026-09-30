// An ops POST answered 404 by an instance that does not know the deck yet (the blob tier's head
// of a deck made seconds ago answers null on another instance for a while; the polish round's
// sync fix round 3 read a resend answered 404 on the enforce preview 23 s after the deck's first
// write, and the word went to the card) is sent again after a backoff, NOT_FOUND_RETRY_MAX times,
// before the ops return to their author; a deck gone for good still answers 404 on every retry
// and the ops return then.
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
import { NOT_FOUND_RETRY_MAX, createRoomClient } from './room-client.ts';
import type { Rejected } from './room-client.ts';

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
/** The ladder's waits divided by 50, so five retries take a third of a second in the test. */
const fastTimers = {
  setTimeout: (run: () => void, ms: number) => setTimeout(run, Math.ceil(ms / 50)),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** A tab over the fake server whose first `answers404` ops POSTs are answered 404. */
function harness(answers404: number) {
  const channel = memoryChannel();
  const document = normalized();
  const server = fakeRoomServer({ deckId: 'gt-brand', channel, document });
  const tab = tabTransport(server, kevin);
  let posts = 0;
  const rejects: Rejected[] = [];
  const room = createRoomClient({
    deckId: 'gt-brand',
    transport: {
      ...tab,
      async postOps(body: OpsPost) {
        posts += 1;
        if (posts <= answers404) return notFound;
        return tab.postOps(body);
      },
    },
    document: server.document(),
    seq: server.seq(),
    timers: fastTimers,
    onChange: () => undefined,
    onReject: (rejected) => rejects.push(rejected),
    onResync: async () => server.document(),
  });
  return { server, room, rejects, posts: () => posts, original: textOf(document) };
}

describe('an ops POST answered 404 by an instance behind the store', () => {
  it('sends the ops again after a backoff and lands them, with nothing returned to the author', async () => {
    const h = harness(2);
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.posts() >= 1);
    // the client is sending the write again; the title row's retry word, never Offline
    await until(() => h.room.status().resending, 2000);
    expect(h.room.status().offline).toBe(false);
    await until(() => h.room.status().pending === 0, 5000);
    expect(h.posts()).toBe(3);
    expect(h.rejects).toHaveLength(0);
    expect(textOf(h.server.document())).toBe(`k${h.original}`);
    expect(h.room.status().resending).toBe(false);
    await h.room.stop();
  });

  it('returns the ops to the author once the retries are spent (a deck gone for good)', async () => {
    const h = harness(Number.POSITIVE_INFINITY);
    h.room.start();
    await until(() => h.room.status().connected);
    h.room.apply([splice(0, 0, 'k')], 'type', 'now');
    await until(() => h.rejects.length === 1, 10_000);
    expect(h.posts()).toBe(NOT_FOUND_RETRY_MAX + 1);
    expect(h.rejects[0]).toMatchObject({ reason: 'forbidden', message: 'The room answered 404' });
    expect(h.room.status().pending).toBe(0);
    expect(textOf(h.server.document())).toBe(h.original);
    await h.room.stop();
  });
});
