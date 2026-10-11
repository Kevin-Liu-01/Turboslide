// The resend paths of the room client after a lost answer (hardening HR-RC#9, RELIABILITY-2's
// residual R and the verifier's D; docs/gslides-parity/realtime/build/word-fix.md). Each case is
// one order the two typers lossy properties read red, driven here over a hand transport so the
// order is fixed: a POST answer lost while the stream reconnects under a new client id, a hello
// that is older than a POST answer, an op moved past a remote entry while its POST was in flight,
// and a later op flushed while an earlier one waited for the stream.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import type { Entry, RoomEvent } from '../src/channel.ts';
import type { OpsPost } from '../src/protocol.ts';
import { createRoomClient } from './room-client.ts';
import type { OpenOptions, OpsResponse, RoomTransport } from './room-client.ts';

const SLIDE = 'content-rule';
const BLOCK = 'p1';
const AUTHOR = { kind: 'human' as const, name: 'Titanium 471', principalId: 'anon_a' };

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

function entry(seq: number, clientId: string, opId: string, mutations: Mutation[]): Entry {
  return {
    seq,
    rev: 0,
    kind: 'edit',
    author: AUTHOR,
    clientId,
    opId,
    mutations,
    at: '2026-10-11T00:00:00.000Z',
  };
}

function hello(seq: number, clientId: string): RoomEvent {
  return {
    type: 'hello',
    seq,
    revision: 0,
    clientId,
    role: 'editor',
    clients: [],
    editing: 1,
    tier: 'memory',
  };
}

type Post = { body: OpsPost; answer: (response: OpsResponse | Error) => void };

/** A tab over a hand transport: the test opens, answers and drops everything itself. */
function handTab() {
  const opens: OpenOptions[] = [];
  const posts: Post[] = [];
  const due: (() => void)[] = [];
  const transport: RoomTransport = {
    open(options) {
      opens.push(options);
      return { close: () => undefined };
    },
    postOps: (body) =>
      new Promise<OpsResponse>((resolve, reject) => {
        posts.push({
          body: structuredClone(body),
          answer: (response) => (response instanceof Error ? reject(response) : resolve(response)),
        });
      }),
    postPresence: async () => undefined,
  };
  const document = normalized();
  const room = createRoomClient({
    deckId: 'gt-brand',
    transport,
    document,
    seq: 0,
    // every timer runs when the test says so (`tick`)
    timers: {
      setTimeout: (run) => {
        due.push(run);
        return run;
      },
      clearTimeout: (handle) => {
        const at = due.indexOf(handle as () => void);
        if (at >= 0) due.splice(at, 1);
      },
    },
    onChange: () => undefined,
    onResync: async () => document,
  });
  const tick = async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      for (const run of due.splice(0)) run();
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  const event = (n: number, value: RoomEvent): void => opens[n]?.onEvent(value);
  const drop = (n: number): void => opens[n]?.onError(new Error('the stream dropped'));
  /** ends every POST still out, then stops the tab (stop waits for the POST in flight) */
  const close = async (): Promise<void> => {
    for (const post of posts) post.answer(new Error('closed'));
    await room.stop();
  };
  return { room, opens, posts, tick, event, drop, close, start: textOf(document) };
}

describe('the room client after a lost answer (HR-RC#9)', () => {
  it('holds an op whose answer was lost under an earlier client id until a fresh hello shows it landed', async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    expect(tab.posts.map((post) => post.body.clientId)).toEqual(['c1']);
    // the stream drops and reopens under a new id while the POST is out
    tab.drop(0);
    await tab.tick();
    expect(tab.opens).toHaveLength(2);
    tab.event(1, hello(0, 'c2'));
    await tab.tick();
    // the room admitted the op as seq 1, and the answer is lost
    tab.posts[0]?.answer(new Error('the answer was lost'));
    await tab.tick();
    // no resend under c2: the room could not tell it from a new write; the stream reopens instead
    expect(tab.posts).toHaveLength(1);
    expect(tab.opens).toHaveLength(3);
    tab.event(2, hello(1, 'c3'));
    tab.event(2, {
      type: 'ops',
      entries: [entry(1, 'c1', 'c1:1', [splice(tab.start.length, ' one')])],
    });
    await tab.tick();
    expect(tab.posts).toHaveLength(1);
    expect(tab.room.status().pending).toBe(0);
    expect(textOf(tab.room.document())).toBe(`${tab.start} one`);
    await tab.close();
  });

  it('resends an op whose answer was lost under the same client id at once, for the room to answer from its log', async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    tab.posts[0]?.answer(new Error('the answer was lost'));
    await tab.tick();
    expect(tab.posts.map((post) => post.body.entries.map((row) => row.opId))).toEqual([
      ['c1:1'],
      ['c1:1'],
    ]);
    await tab.close();
  });

  it("never sends again under a reconnect's new id an op the room admitted above a gap", async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    // admitted as seq 3, above two entries of another writer the stream has not brought
    const own = entry(3, 'c1', 'c1:1', [splice(tab.start.length + 2, ' one')]);
    tab.posts[0]?.answer({ ok: true, entries: [own], rejected: [], head: 3, revision: 0 });
    await tab.tick();
    // the stream reconnects under c2; its replay stops at 1, the head when it opened
    tab.drop(0);
    await tab.tick();
    tab.event(1, hello(1, 'c2'));
    tab.event(1, { type: 'ops', entries: [entry(1, 'c9', 'c9:1', [splice(0, 'X')])] });
    await tab.tick();
    tab.room.apply([splice(tab.start.length + 5, ' two')], 'type', 'now');
    await tab.tick();
    // nothing goes: " one" is in the room under c1, and " two" was written on it
    expect(tab.posts).toHaveLength(1);
    // the stream brings 2 and 3; " two" goes alone at base 3, " one" never again
    tab.event(1, { type: 'op', entry: entry(2, 'c9', 'c9:2', [splice(0, 'Y')]) });
    tab.event(1, { type: 'op', entry: own });
    await tab.tick();
    expect(tab.posts).toHaveLength(2);
    expect(tab.posts[1]?.body.base.seq).toBe(3);
    expect(tab.posts[1]?.body.entries.map((row) => row.opId)).toEqual(['c2:2']);
    await tab.close();
  });

  it('reads a hello below the position but not below the open as stale, never as a reset (the verifier D)', async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    // the stream drops; the reopen asks from 0 and its hello will name the head it read then
    tab.drop(0);
    await tab.tick();
    expect(tab.opens[1]?.since).toBe(0);
    // the POST's answer lands first and moves the position to 1
    const own = entry(1, 'c1', 'c1:1', [splice(tab.start.length, ' one')]);
    tab.posts[0]?.answer({ ok: true, entries: [own], rejected: [], head: 1, revision: 0 });
    await tab.tick();
    expect(tab.room.status().seq).toBe(1);
    // the hello of the open names head 0; then the stream brings seq 1, the tab's own write
    tab.event(1, hello(0, 'c1'));
    tab.event(1, { type: 'op', entry: own });
    await tab.tick();
    expect(tab.room.status().seq).toBe(1);
    expect(textOf(tab.room.document())).toBe(`${tab.start} one`);
    await tab.close();
  });

  it('sends a later op with an earlier one the room admitted and the stream has not brought (R)', async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    // the answer is entry 2, above a gap: the op waits for the stream to bring seq 1 and 2
    const own = entry(2, 'c1', 'c1:1', [splice(tab.start.length + 4, ' one')]);
    tab.posts[0]?.answer({ ok: true, entries: [own], rejected: [], head: 2, revision: 0 });
    await tab.tick();
    expect(tab.room.status().seq).toBe(0);
    // the next word was written on " one": it goes with it, never alone on base 0
    tab.room.apply([splice(tab.start.length + 4, ' two')], 'type', 'now');
    await tab.tick();
    expect(tab.posts[1]?.body.base.seq).toBe(0);
    expect(tab.posts[1]?.body.entries.map((row) => row.opId)).toEqual(['c1:1', 'c1:2']);
    await tab.close();
  });

  it('keeps an op moved past a remote entry while its POST was out in the batch, so a lost answer resends it (R)', async () => {
    const tab = handTab();
    tab.room.start();
    tab.event(0, hello(0, 'c1'));
    await tab.tick();
    tab.room.apply([splice(tab.start.length, ' one')], 'type', 'now');
    await tab.tick();
    // another person's word lands in front while the POST is out: the op moves past it
    tab.event(0, { type: 'op', entry: entry(1, 'c9', 'c9:1', [splice(0, 'X')]) });
    await tab.tick();
    tab.posts[0]?.answer(new Error('the answer was lost'));
    await tab.tick();
    // before the fix the moved copy kept `inflight` and the resend carried nothing
    expect(tab.posts).toHaveLength(2);
    expect(tab.posts[1]?.body.entries.map((row) => row.opId)).toEqual(['c1:1']);
    expect(tab.posts[1]?.body.base.seq).toBe(1);
    await tab.close();
  });
});
