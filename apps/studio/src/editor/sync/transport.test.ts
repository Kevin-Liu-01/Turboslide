// The stream's reopen (gslides-parity SPEC-5-amendments A3 items 3 and 5; the fix round of
// VERIFICATION-5 finding 14): an EventSource that closed for good after an HTTP answer is opened
// again after a backoff from the last event id the transport saw, with the tab's client id and
// without the retire list; a network error, which the EventSource retries itself, opens nothing;
// a closed transport opens nothing more.
import { describe, expect, it } from 'vitest';

import type { RoomEvent } from '@turboslide/realtime/channel';

import { REOPEN_MS, sinceOf, sseTransport, streamUrl } from './transport.ts';
import type { EventSourceLike } from './transport.ts';

type Listener = (event: { data: string; lastEventId?: string }) => void;

class FakeSource implements EventSourceLike {
  static opened: FakeSource[] = [];
  readyState = 0;
  onerror: ((event: unknown) => void) | null = null;
  readonly listeners = new Map<string, Listener[]>();
  closedByTransport = false;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.opened.push(this);
  }
  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  close(): void {
    this.closedByTransport = true;
    this.readyState = 2;
  }
  /** the server's frame: the event with its id line */
  deliver(event: RoomEvent, id?: number): void {
    this.readyState = 1;
    for (const listener of this.listeners.get(event.type) ?? [])
      listener({
        data: JSON.stringify(event),
        ...(id === undefined ? {} : { lastEventId: String(id) }),
      });
  }
  /** a network error: the browser keeps the source and retries */
  networkError(): void {
    this.readyState = 0;
    this.onerror?.({});
  }
  /** an HTTP error: the browser closes the source for good */
  httpError(): void {
    this.readyState = 2;
    this.onerror?.({});
  }
}

function harness() {
  FakeSource.opened = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const events: RoomEvent[] = [];
  const errors: Error[] = [];
  const transport = sseTransport('gt-brand', {
    EventSource: FakeSource,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => undefined,
  });
  const handle = transport.open({
    since: 12,
    clientId: 'c'.repeat(32),
    retire: ['d'.repeat(32)],
    onEvent: (event) => events.push(event),
    onError: (error: unknown) => {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    },
  });
  return { timers, events, errors, handle };
}

const hello = (seq: number): RoomEvent => ({
  type: 'hello',
  seq,
  revision: seq,
  clientId: 'c'.repeat(32),
  role: 'editor',
  clients: [],
  editing: 1,
  tier: 'blob',
});

describe('sseTransport', () => {
  it('opens once with the position, the client id and the retire list', () => {
    const { timers } = harness();
    expect(FakeSource.opened).toHaveLength(1);
    const url = new URL(FakeSource.opened[0]?.url ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/decks/gt-brand/stream');
    expect(url.searchParams.get('since')).toBe('12');
    expect(url.searchParams.get('client')).toBe('c'.repeat(32));
    expect(url.searchParams.get('retire')).toBe('d'.repeat(32));
    expect(timers).toHaveLength(0);
  });

  it('opens a new source from the last event id after an HTTP error, and none after a network error', () => {
    const { timers, events, errors } = harness();
    const first = FakeSource.opened[0] as FakeSource;
    first.deliver(hello(14), 14);
    first.deliver({ type: 'leave', clientId: 'e'.repeat(32) }, 15);
    expect(events.map((event) => event.type)).toEqual(['hello', 'leave']);
    // a network error: the browser retries the same source; the transport reports and waits
    first.networkError();
    expect(errors).toHaveLength(1);
    expect(timers).toHaveLength(0);
    expect(FakeSource.opened).toHaveLength(1);
    // an HTTP error closed the source for good: a reopen is scheduled after REOPEN_MS
    first.httpError();
    expect(errors).toHaveLength(2);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(REOPEN_MS);
    // a second error before the timer fires schedules nothing more
    first.httpError();
    expect(timers).toHaveLength(1);
    timers[0]?.fn();
    expect(FakeSource.opened).toHaveLength(2);
    const second = FakeSource.opened[1] as FakeSource;
    const url = new URL(second.url, 'http://localhost');
    // from the last event id, with the client id, without the retire list
    expect(url.searchParams.get('since')).toBe('15');
    expect(url.searchParams.get('client')).toBe('c'.repeat(32));
    expect(url.searchParams.get('retire')).toBeNull();
    // the backoff doubles while the reopen keeps failing and resets on a hello
    second.httpError();
    expect(timers[1]?.ms).toBe(REOPEN_MS * 2);
    timers[1]?.fn();
    const third = FakeSource.opened[2] as FakeSource;
    third.deliver(hello(15), 15);
    third.httpError();
    expect(timers[2]?.ms).toBe(REOPEN_MS);
  });

  it('opens nothing after the transport was closed', () => {
    const { timers, handle } = harness();
    const first = FakeSource.opened[0] as FakeSource;
    first.httpError();
    expect(timers).toHaveLength(1);
    handle.close();
    expect(first.closedByTransport).toBe(true);
    timers[0]?.fn();
    expect(FakeSource.opened).toHaveLength(1);
    // an error after the close reports nothing and schedules nothing
    first.httpError();
    expect(timers).toHaveLength(1);
  });

  it('keeps the URL and the 409 body helpers', () => {
    expect(streamUrl('/api/decks/x', { since: 3 })).toBe('/api/decks/x/stream?since=3');
    expect(sinceOf({ since: 'nope' })).toBeUndefined();
    expect(sinceOf({ since: [{ seq: 1, opId: 'a', clientId: 'b' }] })).toHaveLength(1);
  });
});
