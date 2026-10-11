import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DownFrame } from '@turboslide/realtime/frames';

import {
  ANON_B,
  CID_A,
  CID_B,
  CID_C,
  connect,
  eventOf,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp, Socket } from './lib.ts';

// Hardening HR-SD#1e: the socket's replay never goes below the reader's floor. A reader without
// `history` (a viewer, a commenter) replays from the position its ticket's `fl` signs, the
// position of the document the app handed it, so `?since=0` from a viewer link holder is answered
// `resync` and never the entries under that document (a heading the owner wrote and deleted
// before sharing). A reconnect at or above the floor gets every entry it missed. A ticket without
// `fl` (an app from before the claim) puts such a reader's floor at the head. A reader with
// history replays as before. A comment post's ack carries no `between`, as the app's ops route
// answers: the entries over a commenter's base are not a commenter's to read.

const OWNER = 'usr_owner01';
const SECRET = 'Figure 4471';
const ANON_C = 'anon_00000000-0000-4000-8000-00000000000c';

const THREAD = '01j8z2kmayaq4e0s7r9x2v8b3d';
const STAMP = '2026-10-11T10:00:00.000Z';

/** A thread the commenter adds at a block, the schema's shape. */
function threadOf(deck: string) {
  return {
    id: THREAD,
    deckId: deck,
    anchor: { kind: 'block', slideId: 'content-rule', blockId: 'p1' },
    comment: {
      id: THREAD,
      author: { principalId: ANON_B, label: 'Someone', kind: 'human' },
      createdAt: STAMP,
      body: { text: 'A note', mentions: [] },
    },
    replies: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    revision: 0,
  };
}

/** True when any frame carries the deleted heading. */
function carriesSecret(frames: readonly DownFrame[]): boolean {
  return JSON.stringify(frames).includes(SECRET);
}

describe('the replay floor of a reader without history (HR-SD#1e)', () => {
  let app: FakeApp;
  let deck: string;
  const open: Socket[] = [];

  beforeEach(() => {
    deck = uniqueDeck('floor');
    app = fakeApp(deck);
  });

  afterEach(() => {
    for (const socket of open.splice(0)) socket.close();
    app.restore();
  });

  async function join(ticket: Promise<string>, query?: string): Promise<Socket> {
    const socket = await connect(deck, await ticket, query === undefined ? {} : { query });
    open.push(socket);
    return socket;
  }

  /** The owner writes the heading, deletes it, then writes one letter: the head is 3. */
  async function ownerWritesAndDeletes(): Promise<Socket> {
    const owner = await join(
      mint({ deck, cid: CID_A, id: OWNER, pid: OWNER, kind: 'signedIn', role: 'owner', sh: true }),
    );
    eventOf(await owner.next(isEvent('hello')), 'hello');
    owner.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, `${SECRET} `)]]));
    expect((await owner.next(isAck(1))).kind).toBe('ack');
    owner.send(opsFrame(CID_A, 2, 1, 2, [[splice(0, SECRET.length + 1, '')]]));
    expect((await owner.next(isAck(2))).kind).toBe('ack');
    owner.send(opsFrame(CID_A, 3, 2, 3, [[splice(0, 0, 'Q')]]));
    expect((await owner.next(isAck(3))).kind).toBe('ack');
    return owner;
  }

  it('answers since=0 with resync to a viewer and a commenter loaded at the head, never an entry under it', async () => {
    await ownerWritesAndDeletes();
    const viewer = await join(
      mint({
        deck,
        cid: CID_B,
        id: ANON_B,
        pid: ANON_B,
        role: 'viewer',
        via: 'link',
        sh: false,
        fl: 3,
      }),
      '?since=0',
    );
    const hello = eventOf(await viewer.next(isEvent('hello')), 'hello');
    expect(hello.seq).toBe(3);
    const resync = eventOf(await viewer.next(isEvent('resync')), 'resync');
    expect(resync.type).toBe('resync');
    const commenter = await join(
      mint({
        deck,
        cid: CID_C,
        id: ANON_C,
        pid: ANON_C,
        role: 'commenter',
        via: 'link',
        sh: false,
        fl: 3,
      }),
      '?since=0',
    );
    eventOf(await commenter.next(isEvent('hello')), 'hello');
    eventOf(await commenter.next(isEvent('resync')), 'resync');
    // nothing that names the heading reached either reader, and no ops frame was sent
    expect(carriesSecret(viewer.frames)).toBe(false);
    expect(carriesSecret(commenter.frames)).toBe(false);
    expect(viewer.frames.some(isEvent('ops'))).toBe(false);
    expect(commenter.frames.some(isEvent('ops'))).toBe(false);
  });

  it('answers a since below the floor with resync, and one at the floor with the entries above it', async () => {
    await ownerWritesAndDeletes();
    // loaded at 2: the heading was gone from the document the reader was handed
    const below = await join(
      mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B, role: 'viewer', via: 'link', fl: 2 }),
      '?since=1',
    );
    eventOf(await below.next(isEvent('hello')), 'hello');
    eventOf(await below.next(isEvent('resync')), 'resync');
    expect(carriesSecret(below.frames)).toBe(false);
    const at = await join(
      mint({ deck, cid: CID_C, id: ANON_C, pid: ANON_C, role: 'viewer', via: 'link', fl: 2 }),
      '?since=2',
    );
    eventOf(await at.next(isEvent('hello')), 'hello');
    const replay = eventOf(await at.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([3]);
    expect(carriesSecret([...at.frames, { kind: 'event', event: replay } as DownFrame])).toBe(
      false,
    );
  });

  it('gives a reconnect after a gap every entry it missed', async () => {
    const owner = await ownerWritesAndDeletes();
    const ticket = mint({
      deck,
      cid: CID_B,
      id: ANON_B,
      pid: ANON_B,
      role: 'viewer',
      via: 'link',
      fl: 3,
    });
    const first = await join(ticket, '?since=3');
    eventOf(await first.next(isEvent('hello')), 'hello');
    expect(eventOf(await first.next(isEvent('ops')), 'ops').entries).toEqual([]);
    first.close();
    // two entries land while the viewer's socket is down
    owner.send(opsFrame(CID_A, 4, 3, 4, [[splice(0, 0, 'R')]]));
    expect((await owner.next(isAck(4))).kind).toBe('ack');
    owner.send(opsFrame(CID_A, 5, 4, 5, [[splice(0, 0, 'S')]]));
    expect((await owner.next(isAck(5))).kind).toBe('ack');
    const again = await join(ticket, '?since=3');
    eventOf(await again.next(isEvent('hello')), 'hello');
    const replay = eventOf(await again.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([4, 5]);
  });

  it('puts the floor of a ticket without fl at the head for a viewer, and keeps an editor on today’s replay', async () => {
    await ownerWritesAndDeletes();
    // an app from before the claim: a viewer's since=0 resyncs, its since at the head replays nothing
    const older = await join(
      mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B, role: 'viewer', via: 'link' }),
      '?since=0',
    );
    eventOf(await older.next(isEvent('hello')), 'hello');
    eventOf(await older.next(isEvent('resync')), 'resync');
    expect(carriesSecret(older.frames)).toBe(false);
    const atHead = await join(
      mint({ deck, cid: CID_C, id: ANON_C, pid: ANON_C, role: 'commenter', via: 'link' }),
      '?since=3',
    );
    eventOf(await atHead.next(isEvent('hello')), 'hello');
    expect(eventOf(await atHead.next(isEvent('ops')), 'ops').entries).toEqual([]);
    atHead.close();
    // an editor holds history: since=0 replays the log as before, the heading among it
    const editor = await join(
      mint({ deck, cid: CID_C, id: ANON_C, pid: ANON_C, role: 'editor', via: 'grant', sh: true }),
      '?since=0',
    );
    eventOf(await editor.next(isEvent('hello')), 'hello');
    const replay = eventOf(await editor.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(JSON.stringify(replay)).toContain(SECRET);
  });

  it('answers a commenter’s comment post without between, and an editor’s edit post with it', async () => {
    const owner = await ownerWritesAndDeletes();
    const commenter = await join(
      mint({
        deck,
        cid: CID_B,
        id: ANON_B,
        pid: ANON_B,
        role: 'commenter',
        via: 'link',
        sh: false,
        fl: 3,
      }),
      '?since=3',
    );
    eventOf(await commenter.next(isEvent('hello')), 'hello');
    // a base of 0, under the commenter's document, with a comment op
    commenter.send({
      t: 'ops',
      req: 1,
      clientId: CID_B,
      base: { seq: 0 },
      entries: [
        {
          opId: `${CID_B}:1`,
          kind: 'comment',
          comment: { op: 'add', thread: threadOf(deck) },
        },
      ],
    });
    const ack = await commenter.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok).toBe(true);
    if (ack.kind === 'ack' && ack.frame.ok) expect(ack.frame.between).toBeUndefined();
    expect(carriesSecret([ack])).toBe(false);
    // the owner's edit post from the same base reads the entries between, as before
    owner.send(opsFrame(CID_A, 9, 0, 9, [[splice(0, 0, 'T')]]));
    const own = await owner.next(isAck(9));
    expect(
      own.kind === 'ack' && own.frame.ok && own.frame.between?.map((entry) => entry.seq),
    ).toEqual([1, 2, 3, 4]);
  });
});
