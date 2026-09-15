// The retire list of the stream open (build-4/hotfix-2.md causes B1 and B2): a reload posts no
// leave and the blob tier's roster is per instance, so the reloaded tab's hello listed the tab's
// own earlier client id as a collaborator. The stream route removes the ids `?retire=` names
// before it writes hello, and only the ids whose MAC names this deck and this identity.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryChannel } from '@turboslide/realtime/memory';
import type { RosterEntry } from '@turboslide/realtime/channel';

import type { RequestIdentity, Room } from './room';
import { RETIRE_MAX, bindClient, mintClientId, retireClients } from './room';

const SECRET_BEFORE = process.env.TURBOSLIDE_SESSION_SECRET;

function identity(id: string): RequestIdentity {
  return {
    ctx: { principal: { id, kind: 'anonymous', admin: false }, linkGrants: [] },
    principalId: id,
    identity: id,
    kind: 'anonymous',
    record: null,
  };
}

function roomOver(deckId: string, channel = memoryChannel()): Room {
  return { deckId, channel } as unknown as Room;
}

function row(clientId: string, principalId: string): RosterEntry {
  return {
    clientId,
    clock: 1,
    pointerOn: false,
    presenting: false,
    principalId,
    label: 'Linen 383',
    trust: 'label',
    mark: {},
    hueSlot: 0,
    kind: 'human',
    role: 'editor',
  };
}

beforeEach(() => {
  process.env.TURBOSLIDE_SESSION_SECRET = 'retire-clients-test-secret-0000000000000000000';
});

afterEach(() => {
  if (SECRET_BEFORE === undefined) delete process.env.TURBOSLIDE_SESSION_SECRET;
  else process.env.TURBOSLIDE_SESSION_SECRET = SECRET_BEFORE;
});

describe('retireClients', () => {
  it('removes the roster rows of the tab’s own earlier ids and leaves every other row', async () => {
    const room = roomOver('gt-brand');
    const me = identity('anon_me');
    const other = identity('anon_other');
    const earlier = mintClientId('gt-brand', 'anon_me');
    const current = await bindClient(room, me);
    const theirs = await bindClient(room, other);
    const strangersId = mintClientId('gt-brand', 'anon_stranger');
    const elsewhere = mintClientId('other-deck', 'anon_me');
    await room.channel.presence.set('gt-brand', earlier, row(earlier, 'anon_me'), 120_000);
    await room.channel.presence.set('gt-brand', current, row(current, 'anon_me'), 120_000);
    await room.channel.presence.set('gt-brand', theirs, row(theirs, 'anon_other'), 120_000);
    await room.channel.presence.set(
      'gt-brand',
      strangersId,
      row(strangersId, 'anon_stranger'),
      120_000,
    );
    const retired = await retireClients(
      room,
      [earlier, current, theirs, strangersId, elsewhere, 'not-an-id', ''].join(','),
      me,
      current,
    );
    // the earlier id alone: the current id is excluded, the other session's and the stranger's
    // ids fail the MAC, another deck's id fails it too, a malformed id is skipped
    expect(retired).toEqual([earlier]);
    const left = (await room.channel.presence.roster('gt-brand')).map((entry) => entry.clientId);
    expect(left.sort()).toEqual([current, theirs, strangersId].sort());
  });

  it('answers nothing for an empty list and caps the list at RETIRE_MAX ids', async () => {
    const room = roomOver('gt-brand');
    const me = identity('anon_me');
    expect(await retireClients(room, null, me)).toEqual([]);
    expect(await retireClients(room, '', me)).toEqual([]);
    const ids = Array.from({ length: RETIRE_MAX + 3 }, () => mintClientId('gt-brand', 'anon_me'));
    for (const id of ids)
      await room.channel.presence.set('gt-brand', id, row(id, 'anon_me'), 120_000);
    const retired = await retireClients(room, ids.join(','), me);
    expect(retired).toEqual(ids.slice(0, RETIRE_MAX));
    const left = (await room.channel.presence.roster('gt-brand')).map((entry) => entry.clientId);
    expect(left.sort()).toEqual(ids.slice(RETIRE_MAX).sort());
  });
});
