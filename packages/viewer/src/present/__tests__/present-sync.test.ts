import { describe, expect, it } from 'vitest';

import type {
  BroadcastLike,
  PresentChannelEnv,
  PresentMessage,
  StorageEventLike,
} from '../presentSync';
import {
  openPresentChannel,
  parsePresentEnvelope,
  PRESENT_PROTOCOL,
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
    });
    a.post({
      type: 'state',
      slideId: 'one',
      index: 0,
      total: 6,
      blank: null,
      laser: false,
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
      }),
    ).not.toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'present', on: false })).not.toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'bye' })).not.toBeNull();
  });

  it('refuses noise, another protocol version and malformed fields', () => {
    expect(parsePresentEnvelope(null)).toBeNull();
    expect(parsePresentEnvelope('not json')).toBeNull();
    expect(parsePresentEnvelope({ ...base, v: PRESENT_PROTOCOL + 1, type: 'hello' })).toBeNull();
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
      }),
    ).toBeNull();
  });
});

// Round five (gslides-parity SPEC-5 2.2; R11 5.6): the step on `state` and `goto`, the media
// messages, the pen's strokes, and the protocol version that keeps a round four window silent.
describe('the round five messages', () => {
  const base = { from: 'w', role: 'audience', v: PRESENT_PROTOCOL, at: 1, seq: 1 };

  it('accepts a state and a goto with steps and refuses a step that is not a number', () => {
    const state = {
      ...base,
      type: 'state',
      slideId: 'a',
      index: 0,
      total: 3,
      blank: null,
      laser: false,
      step: 2,
      steps: 4,
    };
    expect(parsePresentEnvelope(state)?.type).toBe('state');
    expect(parsePresentEnvelope({ ...state, step: 'two' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'goto', slideId: 'b', step: 1 })?.type).toBe(
      'goto',
    );
    expect(parsePresentEnvelope({ ...base, type: 'goto', slideId: 'b', step: 'x' })).toBeNull();
  });

  it('accepts the media, mediaControl, stroke and strokesClear messages and refuses malformed ones', () => {
    const media = {
      ...base,
      type: 'media',
      media: {
        blockId: 'clip',
        state: 'playing',
        positionMs: 120,
        durationMs: 1000,
        title: 'Bars',
      },
    };
    expect(parsePresentEnvelope(media)?.type).toBe('media');
    expect(parsePresentEnvelope({ ...media, media: { ...media.media, state: 'gone' } })).toBeNull();
    expect(
      parsePresentEnvelope({ ...base, type: 'mediaControl', blockId: 'clip', action: 'pause' })
        ?.type,
    ).toBe('mediaControl');
    expect(
      parsePresentEnvelope({ ...base, type: 'mediaControl', blockId: 'clip', action: 'stop' }),
    ).toBeNull();
    const stroke = {
      ...base,
      type: 'stroke',
      stroke: { slideId: 'a', id: 's1', done: false, points: [10, 20, 30, 40] },
    };
    expect(parsePresentEnvelope(stroke)?.type).toBe('stroke');
    expect(
      parsePresentEnvelope({ ...stroke, stroke: { ...stroke.stroke, points: [1, 2, 3] } }),
    ).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'strokesClear', slideId: 'a' })?.type).toBe(
      'strokesClear',
    );
    expect(parsePresentEnvelope({ ...base, type: 'strokesClear' })).toBeNull();
  });

  it('drops a round four envelope (protocol 1)', () => {
    expect(parsePresentEnvelope({ ...base, v: 1, type: 'hello' })).toBeNull();
    expect(parsePresentEnvelope({ ...base, type: 'hello' })?.v).toBe(2);
  });
});
