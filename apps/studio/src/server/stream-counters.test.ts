// The stream counters and the stream's one close (the focus round, cycle 3 stream fix round;
// VERIFICATION.md C3-F1, build/ship.md C3.7): a closed stream's slot is released the moment the
// runtime reports the connection gone, on whichever path it reports it (the body's cancel, the
// request's abort, a write the controller refuses), a later open of the same tab releases the
// tab's earlier slots on this instance before its own cap is judged, and a refusal names the cap
// and the counts. CAPS.streams stays Kevin's product decision (anonymous 4, ip 16, instance 256).
import { describe, expect, it } from 'vitest';

import { CAPS } from '@turboslide/realtime/admission';

import {
  STREAM_PRESENCE_GRACE_MS,
  STREAM_PRESENCE_UNSEEN_MS,
  STREAM_READER_GONE_MS,
  createReaderLiveness,
  createStreamCloser,
  createStreamCounters,
  streamRefusalLine,
  tabTokenOf,
} from './room';

const ANON = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const OTHER = 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const id = (n: number): string => `${String(n).padStart(16, '0')}${'a'.repeat(16)}`;

describe('createStreamCounters', () => {
  it('refuses the fifth stream of an anonymous identity with the cap and the counts, and frees a slot on release once', () => {
    const counters = createStreamCounters();
    const slots = [];
    for (let i = 0; i < CAPS.streams.anonymous; i += 1) {
      const slot = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(i) });
      expect(slot.ok).toBe(true);
      slots.push(slot);
    }
    const fifth = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(9) });
    expect(fifth.ok).toBe(false);
    if (fifth.ok) throw new Error('refused');
    expect(fifth.cap).toBe('identity');
    expect(fifth.counts).toEqual({
      total: 4,
      identities: 1,
      identity: 4,
      address: 4,
    });
    expect(streamRefusalLine('gt-brand', 'anonymous', fifth)).toBe(
      'stream refused on gt-brand: cap identity for anonymous; identity 4/4, address 4/16, instance 4/256 (1 identities)',
    );
    // another identity behind the same address still has room under the address cap
    expect(counters.take(OTHER, 'anonymous', '203.0.113.7').ok).toBe(true);
    const first = slots[0];
    if (first === undefined || !first.ok) throw new Error('slot');
    first.release();
    first.release();
    expect(counters.counts(ANON, '203.0.113.7')).toEqual({
      total: 4,
      identities: 2,
      identity: 3,
      address: 4,
    });
    expect(counters.take(ANON, 'anonymous', '203.0.113.7').ok).toBe(true);
  });

  it('releases the slots the retire list names before judging the cap, so a reload or a reconnect of one tab never fills its own cap (the replacement)', () => {
    const counters = createStreamCounters();
    // four pages of one tab, none of which the runtime has reported closed
    for (let i = 0; i < CAPS.streams.anonymous; i += 1)
      expect(counters.take(ANON, 'anonymous', null, { clientId: id(i) }).ok).toBe(true);
    // the fifth page names the tab's earlier ids: their slots go first and the open is admitted
    const fifth = counters.take(ANON, 'anonymous', null, {
      clientId: id(4),
      retire: [id(0), id(1), id(2), id(3)],
    });
    expect(fifth.ok).toBe(true);
    if (!fifth.ok) throw new Error('admitted');
    expect(fifth.retired).toEqual([id(0), id(1), id(2), id(3)]);
    expect(counters.counts(ANON).identity).toBe(1);
    // the route's own close of a retired stream, later, finds nothing to release
    fifth.release();
    expect(counters.counts(ANON).identity).toBe(0);
  });

  it('releases an earlier slot held under the same client id (a reconnect that reuses the id) and never another identity’s', () => {
    const counters = createStreamCounters();
    const mine = counters.take(ANON, 'anonymous', null, { clientId: id(1) });
    const theirs = counters.take(OTHER, 'anonymous', null, { clientId: id(2) });
    expect(mine.ok && theirs.ok).toBe(true);
    // the same id opens again: the earlier slot is replaced, not added to
    expect(counters.take(ANON, 'anonymous', null, { clientId: id(1) }).ok).toBe(true);
    expect(counters.counts(ANON).identity).toBe(1);
    // a retire list naming another identity's id releases nothing of theirs
    const again = counters.take(ANON, 'anonymous', null, { clientId: id(3), retire: [id(2)] });
    expect(again.ok && again.retired).toEqual([]);
    expect(counters.counts(OTHER).identity).toBe(1);
    expect(counters.release(OTHER, [id(2)])).toEqual([id(2)]);
    expect(counters.counts(OTHER).identity).toBe(0);
  });

  it('counts the address and the instance caps as before', () => {
    const counters = createStreamCounters();
    for (let i = 0; i < CAPS.streams.ip; i += 1) {
      expect(counters.take(`anon_${i}`, 'anonymous', '198.51.100.9').ok).toBe(true);
    }
    const over = counters.take('anon_x', 'anonymous', '198.51.100.9');
    expect(!over.ok && over.cap).toBe('ip');
    // no address (a checkout) is never counted against the address cap
    expect(counters.take('anon_x', 'anonymous', null).ok).toBe(true);
  });
});

describe('createStreamCloser', () => {
  const stream = (
    closer: ReturnType<typeof createStreamCloser>,
  ): { body: ReadableStream<Uint8Array>; cancels: number } => {
    const state = { body: null as unknown as ReadableStream<Uint8Array>, cancels: 0 };
    state.body = new ReadableStream<Uint8Array>({
      start(controller) {
        closer.attach(controller);
        closer.write('event: hello\ndata: {}\n\n');
      },
      cancel() {
        state.cancels += 1;
        closer.close();
      },
    });
    return state;
  };

  it('releases the slot once when the reader cancels the body', async () => {
    let released = 0;
    const closer = createStreamCloser(() => {
      released += 1;
    });
    const { body } = stream(closer);
    const reader = body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: hello');
    await reader.cancel();
    expect(closer.closed()).toBe(true);
    expect(released).toBe(1);
    // the lifetime timer and the abort, arriving later, find it closed
    closer.close();
    closer.close();
    expect(released).toBe(1);
  });

  it('releases the slot at once when the request aborts, and closes a stream attached after the abort', () => {
    let released = 0;
    const aborter = new AbortController();
    const closer = createStreamCloser(() => {
      released += 1;
    }, aborter.signal);
    stream(closer);
    expect(released).toBe(0);
    aborter.abort();
    expect(closer.closed()).toBe(true);
    expect(released).toBe(1);

    const late = new AbortController();
    late.abort();
    let lateReleased = 0;
    const lateCloser = createStreamCloser(() => {
      lateReleased += 1;
    }, late.signal);
    stream(lateCloser);
    expect(lateCloser.closed()).toBe(true);
    expect(lateReleased).toBe(1);
  });

  it('releases the slot when a write is refused by the controller (the stream is gone) and stops writing', () => {
    let released = 0;
    let cleaned = 0;
    const closer = createStreamCloser(() => {
      released += 1;
    });
    let enqueued = 0;
    const refusing = {
      enqueue: () => {
        enqueued += 1;
        if (enqueued > 1) throw new TypeError('Invalid state: Controller is already closed');
      },
      close: () => undefined,
    } as unknown as ReadableStreamDefaultController<Uint8Array>;
    closer.attach(refusing);
    closer.onClose(() => {
      cleaned += 1;
    });
    closer.write(': heartbeat\n\n');
    expect(closer.closed()).toBe(false);
    closer.write(': heartbeat\n\n');
    expect(closer.closed()).toBe(true);
    expect(released).toBe(1);
    expect(cleaned).toBe(1);
    closer.write(': heartbeat\n\n');
    expect(enqueued).toBe(2);
  });

  it('closes and releases a stream whose reader stopped pulling for STREAM_READER_GONE_MS, and never one that drains (the preview runtime reports no abort)', () => {
    let released = 0;
    let clock = 1_000_000;
    const closer = createStreamCloser(
      () => {
        released += 1;
      },
      undefined,
      () => clock,
    );
    let desiredSize = 1;
    let enqueued = 0;
    closer.attach({
      get desiredSize() {
        return desiredSize;
      },
      enqueue: () => {
        enqueued += 1;
      },
      close: () => undefined,
      error: () => undefined,
    } as unknown as ReadableStreamDefaultController<Uint8Array>);
    // a live reader: a burst of frames finds the queue full for a moment and drains right after
    closer.write('a');
    desiredSize = 0;
    closer.write('b');
    closer.write('c');
    desiredSize = 1;
    clock += 15_000;
    closer.write(': heartbeat\n\n');
    expect(closer.closed()).toBe(false);
    expect(enqueued).toBe(4);
    // the reader goes: the heartbeats find the last chunk still queued
    desiredSize = 0;
    clock += 15_000;
    closer.write(': heartbeat\n\n');
    clock += 15_000;
    closer.write(': heartbeat\n\n');
    expect(closer.closed()).toBe(false);
    clock += 15_000;
    expect(clock - 1_000_000 - 15_000).toBeGreaterThanOrEqual(STREAM_READER_GONE_MS);
    closer.write(': heartbeat\n\n');
    expect(closer.closed()).toBe(true);
    expect(released).toBe(1);
    expect(enqueued).toBe(6);
    closer.write('after');
    expect(enqueued).toBe(6);
  });

  it('runs a cleanup set after the close at once, and releases even when the cleanup throws', () => {
    let released = 0;
    const closer = createStreamCloser(() => {
      released += 1;
    });
    closer.onClose(() => {
      throw new Error('a timer already gone');
    });
    closer.close();
    expect(closer.closed()).toBe(true);
    expect(released).toBe(1);
    let ran = 0;
    closer.onClose(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
  });
});

describe('the tab token and the reader liveness (the cycle 3 stream fix round, fix round; VERIFICATION C3S-F1, C3S-F2, SEAM-F4)', () => {
  const TAB = 'f'.repeat(32);

  it('releases every slot the tab holds on this instance before judging the cap, hello or not and whatever deck, and never another identity’s under the same token', () => {
    const counters = createStreamCounters();
    // three quick navigations of one tab, none of which the runtime reported closed and none of
    // whose ids the tab learned (their opens were aborted before a hello): each open carries the
    // tab's token, so the earlier slot goes before the cap is judged and the tab holds one slot
    const first = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(0), tab: TAB });
    expect(first.ok && first.tabReleased).toBe(0);
    const second = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(1), tab: TAB });
    expect(second.ok && second.tabReleased).toBe(1);
    // another deck's stream of the same tab is the same tab's slot
    const third = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(2), tab: TAB });
    expect(third.ok && third.tabReleased).toBe(1);
    expect(counters.counts(ANON, '203.0.113.7')).toEqual({
      total: 1,
      identities: 1,
      identity: 1,
      address: 1,
    });
    // the fourth open, which the identity cap refused on the preview, is admitted with room to
    // spare, and so is every later one
    for (let i = 3; i < 8; i += 1) {
      const next = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(i), tab: TAB });
      expect(next.ok && next.tabReleased).toBe(1);
    }
    expect(counters.counts(ANON).identity).toBe(1);
    // another identity's slot under the same token (a stranger who learned it, a tab whose
    // session changed) is left alone by this identity's opens
    expect(counters.take(OTHER, 'anonymous', '203.0.113.7', { clientId: id(9), tab: TAB }).ok).toBe(
      true,
    );
    const again = counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(10), tab: TAB });
    expect(again.ok && again.tabReleased).toBe(1);
    expect(counters.counts(OTHER).identity).toBe(1);
    expect(counters.releaseTab(OTHER, 'e'.repeat(32))).toBe(0);
    // the route's own close of a slot the token released finds nothing to release
    if (first.ok) first.release();
    expect(counters.counts(ANON).identity).toBe(1);
    expect(counters.counts(OTHER).identity).toBe(1);
    // the tab's one slot goes with its token, and a slot without a token is never a tab's
    expect(counters.take(ANON, 'anonymous', '203.0.113.7', { clientId: id(11) }).ok).toBe(true);
    expect(counters.releaseTab(ANON, TAB)).toBe(1);
    expect(counters.counts(ANON).identity).toBe(1);
    expect(counters.releaseTab(ANON, TAB)).toBe(0);
  });

  it('reads the tab token from the query in its one shape and refuses anything else', () => {
    expect(tabTokenOf(TAB)).toBe(TAB);
    expect(tabTokenOf(` ${TAB.toUpperCase()} `)).toBe(TAB);
    expect(tabTokenOf(null)).toBeUndefined();
    expect(tabTokenOf('')).toBeUndefined();
    expect(tabTokenOf('not-a-token')).toBeUndefined();
    expect(tabTokenOf(TAB.slice(1))).toBeUndefined();
  });

  it('judges a reader gone once its presence has not reached the instance for STREAM_PRESENCE_UNSEEN_MS after the grace, never inside the grace and never while the store refuses', () => {
    let clock = 5_000_000;
    const liveness = createReaderLiveness(() => clock, 45_000, 45_000);
    expect(STREAM_PRESENCE_GRACE_MS).toBe(45_000);
    expect(STREAM_PRESENCE_UNSEEN_MS).toBe(75_000);
    // a raw stream nobody posts presence for: inside the grace it stands, after it it is gone
    clock += 44_000;
    expect(liveness.gone()).toBe(false);
    clock += 2_000;
    expect(liveness.gone()).toBe(true);
    // a live reader: its presence every 15 s keeps the stream through and past the grace
    clock = 6_000_000;
    const live = createReaderLiveness(() => clock, 45_000, 45_000);
    for (let i = 0; i < 8; i += 1) {
      clock += 15_000;
      live.seen();
      expect(live.gone()).toBe(false);
    }
    // the reader goes: 44 s after its last presence it stands, at 45 s it is gone
    clock += 44_000;
    expect(live.gone()).toBe(false);
    clock += 1_000;
    expect(live.gone()).toBe(true);
    // the store refuses its poll: no presence reaches anyone, so nobody is judged; the outage's
    // end gives the reader the whole window again
    clock = 7_000_000;
    const outage = createReaderLiveness(() => clock, 45_000, 45_000);
    clock += 60_000;
    outage.storeOk(false);
    clock += 120_000;
    expect(outage.gone()).toBe(false);
    outage.storeOk(true);
    expect(outage.gone()).toBe(false);
    clock += 44_000;
    expect(outage.gone()).toBe(false);
    clock += 1_000;
    expect(outage.gone()).toBe(true);
  });
});
