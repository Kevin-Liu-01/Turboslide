import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Entry, NewEntry } from '@turboslide/realtime/channel';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { Author } from '@turboslide/schema/mutations';

import type { Room, ViewerFacts } from './room';
import { replayFor, serverClientId } from './room';

// The resync for a `since` the stream does not hold (the realtime round, docs/REALTIME.md 3.7):
// a stream open whose position is above the head, more than 2,000 behind it, or below the first
// retained entry (the trim behind a checkpoint, a Redis reset, a position from the other tier
// after a hand off or a rollback) is answered `resync`, never a replay with a gap and never a
// hang; a position the stream holds is answered the entries after it. The room is a fake over the
// memory channel, the way presence-leave.test.ts builds one. The second block pins the client id
// a server write's entry carries (3.3): `agent:<principalId>` for an agent author, `server`
// otherwise, within the 64 characters of the entry schema.

const SECRET_BEFORE = process.env.TURBOSLIDE_SESSION_SECRET;
const DECK = 'q4-review';
const CLIENT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const kevin: Author = { kind: 'human', name: 'kevin' };

function entry(n: number): NewEntry {
  return {
    rev: 3,
    kind: 'edit',
    author: kevin,
    clientId: CLIENT,
    opId: `${CLIENT}:${n}`,
    mutations: [
      { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: n },
    ],
    at: '2026-10-01T10:00:00.000Z',
  };
}

const reader: ViewerFacts = { role: 'editor', via: 'owner', showNames: true, readComments: true };

describe('replayFor (docs/REALTIME.md 3.7)', () => {
  beforeEach(() => {
    process.env.TURBOSLIDE_SESSION_SECRET = 'a'.repeat(32);
  });
  afterEach(() => {
    if (SECRET_BEFORE === undefined) delete process.env.TURBOSLIDE_SESSION_SECRET;
    else process.env.TURBOSLIDE_SESSION_SECRET = SECRET_BEFORE;
  });

  async function roomWith(count: number): Promise<{ room: Room; entries: Entry[] }> {
    const channel = memoryChannel();
    const result = await channel.append(
      DECK,
      0,
      Array.from({ length: count }, (_, i) => entry(i + 1)),
    );
    if (!result.ok) throw new Error('the append missed');
    const room = {
      deckId: DECK,
      channel,
      tier: 'memory',
      live: async () => ({ seq: await channel.head(DECK), document: {} }),
      revision: () => 7,
    } as unknown as Room;
    return { room, entries: result.entries };
  }

  it('answers the entries after a position the stream holds, and none at the head', async () => {
    const { room } = await roomWith(6);
    const replay = await replayFor(room, 3, reader);
    expect(replay.type).toBe('ops');
    if (replay.type === 'ops') expect(replay.entries.map((row) => row.seq)).toEqual([4, 5, 6]);
    const atHead = await replayFor(room, 6, reader);
    expect(atHead).toEqual({ type: 'ops', entries: [] });
  });

  it('answers resync for a position above the head (a position of the other tier, a reset stream)', async () => {
    const { room } = await roomWith(6);
    expect(await replayFor(room, 7, reader)).toEqual({ type: 'resync', revision: 7 });
    expect(await replayFor(room, 57, reader)).toEqual({ type: 'resync', revision: 7 });
  });

  it('answers resync for a position below the first retained entry instead of a replay with a gap', async () => {
    const { room } = await roomWith(6);
    await room.channel.trim(DECK, { minSeq: 4 });
    // the stream holds 4, 5 and 6: a position of 1 would skip 2 and 3
    expect(await replayFor(room, 1, reader)).toEqual({ type: 'resync', revision: 7 });
    // a position at the trim's edge is held: the next entry is 4
    const held = await replayFor(room, 3, reader);
    if (held.type === 'ops') expect(held.entries.map((row) => row.seq)).toEqual([4, 5, 6]);
    else throw new Error(`expected ops, got ${held.type}`);
  });
});

describe('serverClientId (docs/REALTIME.md 3.3)', () => {
  it('names the agent under its principal id and every other writer as server, within 64 characters', () => {
    expect(
      serverClientId({ kind: 'agent', name: 'bootstrap', principalId: 'agent:bootstrap' }),
    ).toBe('agent:agent:bootstrap');
    expect(serverClientId({ kind: 'agent', name: 'checkout' })).toBe('agent:checkout');
    expect(serverClientId({ kind: 'human', name: 'kevin', principalId: 'anon_x' })).toBe('server');
    const long = serverClientId({
      kind: 'agent',
      name: 'x',
      principalId: `agent:${'k'.repeat(90)}`,
    });
    expect(long).toHaveLength(64);
    expect(long.startsWith('agent:agent:')).toBe(true);
  });
});
