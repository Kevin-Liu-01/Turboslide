// The leave with the beacon's clock (b4.md C3T-R2; the return round's B7): the presence route's
// `?leave=1` hands the post's clock to the blob tier's shared roster, whose tombstone keeps it so
// a set of the same tab that lands after the leave never brings the row back; the memory and
// redis tiers, and the clockless leaves of the stream's close and `retireClients`, take the
// channel's own `leave`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryChannel } from '@turboslide/realtime/memory';
import type { RosterEntry } from '@turboslide/realtime/channel';
import type { SharedPresence } from '@turboslide/store/presence-store';

import type { Room } from './room';
import { leavePresence } from './room';

const SECRET_BEFORE = process.env.TURBOSLIDE_SESSION_SECRET;
const DECK = 'q4-review';
const C1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function row(clientId: string, clock: number): RosterEntry {
  return {
    clientId,
    clock,
    pointerOn: false,
    presenting: false,
    principalId: 'p1',
    label: 'Linen 383',
    trust: 'label',
    mark: {},
    hueSlot: 0,
    kind: 'human',
    role: 'editor',
  };
}

describe('leavePresence', () => {
  beforeEach(() => {
    process.env.TURBOSLIDE_SESSION_SECRET = 'a'.repeat(32);
  });
  afterEach(() => {
    if (SECRET_BEFORE === undefined) delete process.env.TURBOSLIDE_SESSION_SECRET;
    else process.env.TURBOSLIDE_SESSION_SECRET = SECRET_BEFORE;
  });

  it('hands the clock to the shared roster when there is one, and the channel its leave otherwise', async () => {
    const channel = memoryChannel();
    const room = { deckId: DECK, channel } as unknown as Room;
    const sharedCalls: [string, string, number | undefined][] = [];
    const shared = {
      leave: async (deckId: string, clientId: string, clock?: number) => {
        sharedCalls.push([deckId, clientId, clock]);
      },
    } as unknown as SharedPresence<RosterEntry>;
    await channel.presence.set(DECK, C1, row(C1, 3), 120_000);
    expect((await channel.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);

    // the blob tier: the beacon's clock reaches the shared roster, the channel is not asked
    await leavePresence(room, C1, 4, shared);
    expect(sharedCalls).toEqual([[DECK, C1, 4]]);
    expect((await channel.presence.roster(DECK)).map((r) => r.clientId)).toEqual([C1]);

    // a clockless leave (the stream's close, retireClients) takes the channel's leave
    await leavePresence(room, C1, undefined, shared);
    expect(sharedCalls).toHaveLength(1);
    expect(await channel.presence.roster(DECK)).toEqual([]);

    // the memory and redis tiers: no shared roster, the channel's leave whatever the clock
    await channel.presence.set(DECK, C1, row(C1, 5), 120_000);
    await leavePresence(room, C1, 6, null);
    expect(sharedCalls).toHaveLength(1);
    expect(await channel.presence.roster(DECK)).toEqual([]);
  });
});
