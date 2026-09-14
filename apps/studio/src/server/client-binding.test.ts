// The client binding of the ops and presence routes (gslides-parity SPEC-3 3.3, 3.4; report 10
// F26; VERIFICATION-3 findings 5 and 25): a server issued client id carries a MAC over the deck
// and the identity, so an instance that holds no binding (the blob tier's per instance memory,
// a lapsed TTL) still admits the session's own id and refuses every other.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryChannel } from '@turboslide/realtime/memory';
import { CLIENT_ID_PATTERN } from '@turboslide/realtime/protocol';

import type { RequestIdentity, Room } from './room';
import { bindClient, clientBoundTo, clientIdMatches, mintClientId } from './room';

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

beforeEach(() => {
  process.env.TURBOSLIDE_SESSION_SECRET = 'client-binding-test-secret-0000000000000000000';
});

afterEach(() => {
  if (SECRET_BEFORE === undefined) delete process.env.TURBOSLIDE_SESSION_SECRET;
  else process.env.TURBOSLIDE_SESSION_SECRET = SECRET_BEFORE;
});

describe('the signed client id', () => {
  it('has the protocol shape, differs per mint and verifies for its deck and identity alone', () => {
    const a = mintClientId('gt-brand', 'anon_a');
    const b = mintClientId('gt-brand', 'anon_a');
    expect(a).toMatch(CLIENT_ID_PATTERN);
    expect(b).toMatch(CLIENT_ID_PATTERN);
    expect(a).not.toBe(b);
    expect(clientIdMatches('gt-brand', a, 'anon_a')).toBe(true);
    expect(clientIdMatches('gt-brand', a, 'anon_b')).toBe(false);
    expect(clientIdMatches('other-deck', a, 'anon_a')).toBe(false);
    expect(
      clientIdMatches('gt-brand', `${a.slice(0, 31)}${a.endsWith('0') ? '1' : '0'}`, 'anon_a'),
    ).toBe(false);
    expect(clientIdMatches('gt-brand', 'not-a-client-id', 'anon_a')).toBe(false);
  });
});

describe('clientBoundTo', () => {
  it('admits the id the stream bound on this instance and refuses another session', async () => {
    const room = roomOver('gt-brand');
    const me = identity('anon_me');
    const clientId = await bindClient(room, me);
    expect(clientId).toMatch(CLIENT_ID_PATTERN);
    expect(await clientBoundTo(room, clientId, me)).toBe(true);
    expect(await clientBoundTo(room, clientId, identity('anon_other'))).toBe(false);
  });

  it("admits the session's own id on an instance that never saw the binding, and binds it there", async () => {
    const streamInstance = roomOver('gt-brand');
    const me = identity('anon_me');
    const clientId = await bindClient(streamInstance, me);
    // the ops request lands on another function with its own memory (the blob tier)
    const otherInstance = roomOver('gt-brand');
    expect(await otherInstance.channel.presence.owner('gt-brand', clientId)).toBeNull();
    expect(await clientBoundTo(otherInstance, clientId, me)).toBe(true);
    expect(await otherInstance.channel.presence.owner('gt-brand', clientId)).toBe('anon_me');
  });

  it("refuses a stranger's id, another deck's id and a forged id on a fresh instance", async () => {
    const me = identity('anon_me');
    const stranger = identity('anon_stranger');
    const mine = mintClientId('gt-brand', 'anon_me');
    const elsewhere = mintClientId('other-deck', 'anon_me');
    const fresh = roomOver('gt-brand');
    expect(await clientBoundTo(fresh, mine, stranger)).toBe(false);
    expect(await clientBoundTo(fresh, elsewhere, me)).toBe(false);
    expect(await clientBoundTo(fresh, 'deadbeefdeadbeefdeadbeefdeadbeef', me)).toBe(false);
    expect(await fresh.channel.presence.owner('gt-brand', mine)).toBeNull();
  });
});
