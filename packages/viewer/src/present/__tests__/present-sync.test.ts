import { describe, expect, it } from 'vitest';

import type {
  BroadcastLike,
  PresentChannelEnv,
  PresentMessage,
  StorageEventLike,
} from '../presentSync';
import {
  createMoveTracker,
  MOVE_ANSWER_MS,
  openPresentChannel,
  PRESENT_PROTOCOL,
  parsePresentEnvelope,
  presentChannelName,
  presentStorageKey,
} from '../presentSync';

/** An in-memory BroadcastChannel: every instance on a name hears every other instance's messages. */
function fakeBroadcast(): new (name: string) => BroadcastLike {
  const rooms = new Map<string, Set<FakeChannel>>();
  class FakeChannel implements BroadcastLike {
    readonly name: string;
    readonly listeners = new Set<(event: { data: unknown }) => void>();
    constructor(name: string) {
      this.name = name;
      const room = rooms.get(name) ?? new Set<FakeChannel>();
      room.add(this);
      rooms.set(name, room);
    }
    addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
      this.listeners.add(listener);
    }
    postMessage(message: unknown): void {
      for (const other of rooms.get(this.name) ?? []) {
        if (other === this) continue;
        for (const listener of other.listeners) listener({ data: structuredClone(message) });
      }
    }
    close(): void {
      rooms.get(this.name)?.delete(this);
    }
  }
  return FakeChannel;
}

/** A shared localStorage whose writes fire storage events on every other listener. */
function fakeStorage(): Pick<PresentChannelEnv, 'storage' | 'onStorage'> {
  const listeners = new Set<(event: StorageEventLike) => void>();
  const values = new Map<string, string>();
  return {
    storage: {
      setItem(key, value) {
        values.set(key, value);
        for (const listener of listeners) listener({ key, newValue: value });
      },
      removeItem(key) {
        values.delete(key);
      },
    },
    onStorage(listener) {
      /* a window never receives its own storage events; the channel drops them by sender id anyway */
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// The two windows exchange slide ids over BroadcastChannel('turboslide:<deckId>'), falling back to
// localStorage (gslides-parity SPEC 9.1, 9.3).
describe('openPresentChannel', () => {
  it('names the channel and the storage key after the deck', () => {
    expect(presentChannelName('gt-brand')).toBe('turboslide:gt-brand');
    expect(presentStorageKey('gt-brand')).toBe('turboslide:present:gt-brand');
  });

  it('delivers to the other window over BroadcastChannel and never to itself', () => {
    const env: PresentChannelEnv = { BroadcastChannel: fakeBroadcast(), now: () => 1000 };
    const heardByAudience: PresentMessage[] = [];
    const heardByPresenter: PresentMessage[] = [];
    const audience = openPresentChannel('d', 'audience', (m) => heardByAudience.push(m), env);
    const presenter = openPresentChannel('d', 'presenter', (m) => heardByPresenter.push(m), env);
    expect(audience.transport).toBe('broadcast');
    presenter.post({ type: 'hello' });
    audience.post({ type: 'goto', slideId: 'two' });
    expect(heardByAudience).toEqual([
      {
        type: 'hello',
        from: presenter.id,
        role: 'presenter',
        v: PRESENT_PROTOCOL,
        at: 1000,
        seq: 1,
      },
    ]);
    expect(heardByPresenter).toEqual([
      {
        type: 'goto',
        slideId: 'two',
        from: audience.id,
        role: 'audience',
        v: PRESENT_PROTOCOL,
        at: 1000,
        seq: 1,
      },
    ]);
    /* another deck's channel is silent */
    const other: PresentMessage[] = [];
    openPresentChannel('other', 'presenter', (m) => other.push(m), env);
    audience.post({ type: 'bye' });
    expect(other).toEqual([]);
    audience.close();
    presenter.post({ type: 'goto', slideId: 'three' });
    expect(heardByAudience).toHaveLength(1);
  });

  it('falls back to localStorage and storage events without BroadcastChannel', () => {
    const env: PresentChannelEnv = { ...fakeStorage(), now: () => 5 };
    const heard: PresentMessage[] = [];
    const a = openPresentChannel('d', 'audience', () => undefined, env);
    const b = openPresentChannel('d', 'presenter', (m) => heard.push(m), env);
    expect(a.transport).toBe('storage');
    a.post({
      type: 'state',
      slideId: 'one',
      index: 0,
      total: 6,
      blank: null,
      laser: false,
      step: 0,
      steps: 0,
    });
    a.post({
      type: 'state',
      slideId: 'one',
      index: 0,
      total: 6,
      blank: null,
      laser: false,
      step: 0,
      steps: 0,
    });
    expect(heard.map((m) => m.type)).toEqual(['state', 'state']);
    /* the sequence number makes a repeated state a different stored value */
    expect((heard[0] as unknown as { seq: number }).seq).toBe(1);
    expect((heard[1] as unknown as { seq: number }).seq).toBe(2);
    b.close();
    a.post({ type: 'bye' });
    expect(heard).toHaveLength(2);
  });

  it('is inert with neither transport', () => {
    const channel = openPresentChannel('d', 'audience', () => undefined, {});
    expect(channel.transport).toBe('none');
    expect(() => channel.post({ type: 'hello' })).not.toThrow();
    channel.close();
  });

  it('returns the sequence number of each message it posts, and 0 once closed', () => {
    const channel = openPresentChannel('d', 'presenter', () => undefined, {
      BroadcastChannel: fakeBroadcast(),
    });
    expect(channel.post({ type: 'hello' })).toBe(1);
    expect(channel.post({ type: 'goto', slideId: 'two', step: 0 })).toBe(2);
    channel.close();
    expect(channel.post({ type: 'bye' })).toBe(0);
  });
});

describe('parsePresentEnvelope', () => {
  const base = { v: PRESENT_PROTOCOL, from: 'w1', role: 'audience', at: 1, seq: 1 };

  it('accepts the five message types with their fields, as an object or as JSON text', () => {
    expect(parsePresentEnvelope({ ...base, type: 'hello' })).not.toBeNull();
    expect(
      parsePresentEnvelope(JSON.stringify({ ...base, type: 'goto', slideId: 'x' }))?.type,
    ).toBe('goto');
    expect(
      parsePresentEnvelope({
        ...base,
        type: 'state',
        slideId: 'x',
        index: 1,
        total: 3,
        blank: 'white',
        laser: true,
        step: 1,
        steps: 3,
      }),
    ).not.toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'goto', slideId: 'x', step: 2 })?.type).toBe(
      'goto',
    );
    expect(parsePresentEnvelope({ ...base, type: 'present', on: false })).not.toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'bye' })).not.toBeNull();
  });

  it('accepts a state that names the goto it answers, or none', () => {
    const state = {
      ...base,
      type: 'state',
      slideId: 'x',
      index: 1,
      total: 3,
      blank: null,
      laser: false,
      step: 0,
      steps: 0,
    };
    expect(parsePresentEnvelope({ ...state, reply: { to: 'w2', seq: 4 } })).toMatchObject({
      reply: { to: 'w2', seq: 4 },
    });
    expect(parsePresentEnvelope({ ...state, reply: null })).not.toBeNull();
    /* a window from before the field */
    expect(parsePresentEnvelope(state)).not.toBeNull();
    expect(parsePresentEnvelope({ ...state, reply: { to: 'w2' } })).toBeNull();
    expect(parsePresentEnvelope({ ...state, reply: { to: 'w2', seq: 0 } })).toBeNull();
    expect(parsePresentEnvelope({ ...state, reply: { to: 'w2', seq: 1.5 } })).toBeNull();
    expect(parsePresentEnvelope({ ...state, reply: { to: 2, seq: 1 } })).toBeNull();
    expect(parsePresentEnvelope({ ...state, reply: 'w2' })).toBeNull();
  });

  it('refuses noise, another protocol version and malformed fields', () => {
    expect(parsePresentEnvelope(null)).toBeNull();
    expect(parsePresentEnvelope('not json')).toBeNull();
    /* a version 1 window, from before the slide clock, is ignored */
    expect(parsePresentEnvelope({ ...base, v: 1, type: 'hello' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, v: 3, type: 'hello' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'goto', slideId: 'x', step: -1 })).toBeNull();
    expect(
      parsePresentEnvelope({
        ...base,
        type: 'state',
        slideId: 'x',
        index: 1,
        total: 3,
        blank: null,
        laser: true,
      }),
    ).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'dance' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, role: 'viewer', type: 'hello' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'goto' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'present', on: 'yes' })).toBeNull();
    expect(
      parsePresentEnvelope({
        ...base,
        type: 'state',
        slideId: 'x',
        index: 1,
        total: 3,
        blank: 'red',
        laser: true,
        step: 0,
        steps: 0,
      }),
    ).toBeNull();
  });
});

// The presenter's reply rule (the presenter audit of a95d4097d, item 1): while its latest move is
// in flight, a late answer to an older press is never followed, a state that answers no move of
// this window waits, and the answer to the latest move ends the hold.
describe('createMoveTracker', () => {
  const answer = (to: string, seq: number) => ({ reply: { to, seq } });

  it('follows every state while no move of its own is in flight', () => {
    const moves = createMoveTracker('me', { now: () => 0 });
    expect(moves.follows({})).toBe(true);
    expect(moves.follows({ reply: null })).toBe(true);
    expect(moves.follows(answer('other', 9))).toBe(true);
  });

  it('never follows a late answer to an older move, and follows the answer to the latest', () => {
    let clock = 0;
    const moves = createMoveTracker('me', { now: () => clock });
    moves.sent(3);
    moves.sent(4);
    expect(moves.follows(answer('me', 3))).toBe(false);
    clock += MOVE_ANSWER_MS * 10;
    expect(moves.follows(answer('me', 3)), 'however late it comes').toBe(false);
    expect(moves.follows(answer('me', 4))).toBe(true);
    /* answered: the audience's own moves after it are followed */
    expect(moves.follows(answer('me', 4))).toBe(true);
    expect(moves.follows(answer('me', 3)), 'nothing in flight any more').toBe(true);
  });

  it('holds a state that answers no move of its own until the hold runs out', () => {
    let clock = 1000;
    const moves = createMoveTracker('me', { now: () => clock, holdMs: 500 });
    moves.sent(7);
    expect(moves.follows({ reply: null })).toBe(false);
    expect(moves.follows({})).toBe(false);
    expect(moves.follows(answer('another-presenter', 12))).toBe(false);
    clock += 499;
    expect(moves.follows({ reply: null })).toBe(false);
    clock += 1;
    expect(moves.follows({ reply: null })).toBe(true);
    expect(moves.follows({ reply: null })).toBe(true);
  });

  it('takes an answer to a later move as the answer to the latest', () => {
    const moves = createMoveTracker('me', { now: () => 0 });
    moves.sent(2);
    expect(moves.follows(answer('me', 5))).toBe(true);
    moves.sent(0);
    expect(moves.follows({ reply: null }), 'a closed channel posts nothing to wait for').toBe(true);
  });
});
