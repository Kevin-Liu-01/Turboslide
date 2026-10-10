import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { standInKey, standInOf } from '@turboslide/identity/stand-in';

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
  presenceFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp, Socket } from './lib.ts';

// Hardening HR-SD#1, the fix round after verifier pass 2 (F2): a reader who may not share the deck
// (the ticket's `sh: false`, a viewer or a commenter link, an editor without the share right)
// reads every other principal on the socket by the principal's stand-in on the deck, the one the
// app's answers carry: the hello's roster, presence, the op entries' authors, the replay on join
// and the ack's `between`. A reader who may share, and a ticket an older app minted without the
// claim, read the ids as before.

const OWNER = 'usr_owner01';

/** Every principal id the frames carry but the reader's own. */
function othersIn(frames: unknown, own: string): string[] {
  return [...JSON.stringify(frames).matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)]
    .map((match) => match[0])
    .filter((id) => id !== own);
}

describe('the deck room names other people by stand-ins to a reader who may not share', () => {
  let app: FakeApp;
  let deck: string;
  let ref: string;
  const open: Socket[] = [];

  beforeEach(() => {
    deck = uniqueDeck('stand-in');
    app = fakeApp(deck);
    // the app computes the same from TURBOSLIDE_ROOM_SECRET (apps/studio stand-ins.ts)
    ref = standInOf(standInKey(env.TURBOSLIDE_ROOM_SECRET), deck, OWNER);
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

  it('sends the roster, presence, ops, the replay and between with the stand-in', async () => {
    const owner = await join(
      mint({ deck, cid: CID_A, id: OWNER, pid: OWNER, kind: 'signedIn', role: 'owner', sh: true }),
    );
    eventOf(await owner.next(isEvent('hello')), 'hello');
    const viewer = await join(
      mint({
        deck,
        cid: CID_B,
        id: ANON_B,
        pid: ANON_B,
        role: 'editor',
        via: 'link',
        names: true,
        sh: false,
      }),
    );
    eventOf(await viewer.next(isEvent('hello')), 'hello');

    owner.send(presenceFrame(CID_A, 1));
    const presence = eventOf(await viewer.next(isEvent('presence')), 'presence');
    expect(presence.state.principalId).toBe(ref);
    owner.send(opsFrame(CID_A, 1, 0, 1, [[splice(0, 0, 'A')]]));
    expect((await owner.next(isAck(1))).kind).toBe('ack');
    const op = eventOf(await viewer.next(isEvent('op')), 'op');
    expect(op.entry.author.principalId).toBe(ref);

    // the editor's own write past the owner's: the ack's between names the owner by the stand-in
    viewer.send(opsFrame(CID_B, 1, 0, 1, [[splice(0, 0, 'B')]]));
    const ack = await viewer.next(isAck(1));
    expect(ack.kind === 'ack' && ack.frame.ok && ack.frame.between?.[0]?.author.principalId).toBe(
      ref,
    );

    // a reader who joins later: the roster and the replay
    const late = await join(
      mint({
        deck,
        cid: CID_C,
        id: 'anon_00000000-0000-4000-8000-00000000000c',
        pid: 'anon_00000000-0000-4000-8000-00000000000c',
        role: 'viewer',
        via: 'link',
        sh: false,
      }),
      '?since=0',
    );
    const hello = eventOf(await late.next(isEvent('hello')), 'hello');
    expect(hello.clients.find((row) => row.clientId === CID_A)?.principalId).toBe(ref);
    const replay = eventOf(await late.next(isEvent('ops')), 'ops');
    expect(replay.entries.map((entry) => entry.author.principalId)).toContain(ref);

    expect(othersIn([presence, op, ack], ANON_B)).toEqual([]);
    expect(othersIn(viewer.frames, ANON_B)).toEqual([]);
    expect(othersIn([hello, replay], 'anon_00000000-0000-4000-8000-00000000000c')).toEqual([]);
  });

  it('sends the ids to a reader who may share, and to a ticket an older app minted', async () => {
    const owner = await join(
      mint({ deck, cid: CID_A, id: OWNER, pid: OWNER, kind: 'signedIn', role: 'owner', sh: true }),
    );
    eventOf(await owner.next(isEvent('hello')), 'hello');
    const sharer = await join(
      mint({ deck, cid: CID_B, id: ANON_B, pid: ANON_B, role: 'editor', via: 'grant', sh: true }),
    );
    eventOf(await sharer.next(isEvent('hello')), 'hello');
    const older = await join(
      mint({
        deck,
        cid: CID_C,
        id: 'anon_00000000-0000-4000-8000-00000000000c',
        pid: 'anon_00000000-0000-4000-8000-00000000000c',
        role: 'viewer',
        via: 'link',
      }),
    );
    eventOf(await older.next(isEvent('hello')), 'hello');
    owner.send(presenceFrame(CID_A, 1));
    expect(eventOf(await sharer.next(isEvent('presence')), 'presence').state.principalId).toBe(
      OWNER,
    );
    expect(eventOf(await older.next(isEvent('presence')), 'presence').state.principalId).toBe(
      OWNER,
    );
  });
});
