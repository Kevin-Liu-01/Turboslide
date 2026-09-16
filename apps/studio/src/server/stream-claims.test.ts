// One stream per tab per instance (gslides-parity SPEC-5-amendments A3 item 5; the fix round of
// VERIFICATION-5 finding 14): a stream opening under a client id this instance already streams
// closes the earlier stream first, so its slot is free before the new one is counted and a
// reconnecting tab never meets the identity cap on its own dead streams; a claim is forgotten only
// by the stream that holds it.
import { describe, expect, it } from 'vitest';

import { CAPS } from '@turboslide/realtime/admission';

import { createStreamCounters } from './room';

const CLIENT = 'a'.repeat(32);

describe('the stream claims', () => {
  it('closes the earlier stream of the same tab and frees its slot before the new one counts', () => {
    const counters = createStreamCounters();
    const closed: string[] = [];
    const cap = CAPS.streams.anonymous;
    // the identity holds every slot on dropped streams the runtime never reported as aborted
    const slots: { release: () => void }[] = [];
    for (let i = 0; i < cap; i++) {
      const slot = counters.take('anon_1', 'anonymous', '10.0.0.1');
      expect(slot.ok).toBe(true);
      if (slot.ok) slots.push(slot);
    }
    const earlier = (): void => {
      closed.push('earlier');
      slots[0]?.release();
    };
    expect(counters.claim('gt-brand', CLIENT, earlier)).toBe(false);
    expect(counters.take('anon_1', 'anonymous', '10.0.0.1')).toEqual({
      ok: false,
      cap: 'identity',
    });
    // the tab reconnects: the claim closes the earlier stream, whose release frees the slot
    const later = (): void => {
      closed.push('later');
    };
    expect(counters.claim('gt-brand', CLIENT, later)).toBe(true);
    expect(closed).toEqual(['earlier']);
    const reconnect = counters.take('anon_1', 'anonymous', '10.0.0.1');
    expect(reconnect.ok).toBe(true);
    expect(counters.claimed()).toBe(1);
    // the earlier stream's cleanup forgets nothing: the claim is the later stream's
    counters.unclaim('gt-brand', CLIENT, earlier);
    expect(counters.claimed()).toBe(1);
    counters.unclaim('gt-brand', CLIENT, later);
    expect(counters.claimed()).toBe(0);
    // another tab and another deck are their own claims
    expect(counters.claim('gt-brand', 'b'.repeat(32), () => undefined)).toBe(false);
    expect(counters.claim('other-deck', CLIENT, () => undefined)).toBe(false);
    expect(counters.claimed()).toBe(2);
  });

  it('survives a closer that throws', () => {
    const counters = createStreamCounters();
    counters.claim('gt-brand', CLIENT, () => {
      throw new Error('closing already');
    });
    expect(counters.claim('gt-brand', CLIENT, () => undefined)).toBe(true);
  });
});
