// The `server-timing` collector of docs/NEXT.md 3.2 H9: the entries a request records, the
// header's grammar, the `cold` entry with the instance's age and ordinal, and nothing recorded
// outside a request.
import { describe, expect, it } from 'vitest';

import {
  MAX_TIMING_ENTRIES,
  currentTiming,
  formatEntry,
  instanceFacts,
  metricName,
  newRequestTiming,
  noteTiming,
  serverTimingValue,
  timed,
  withRequestTiming,
} from './server-timing';

describe('server-timing', () => {
  it('runs a read outside a request and records nothing', async () => {
    expect(currentTiming()).toBeUndefined();
    expect(await timed('document', async () => 7)).toBe(7);
    noteTiming({ name: 'facts', desc: 'hit' });
    expect(currentTiming()).toBeUndefined();
  });

  it('records one entry per read under the request, a failed read marked and thrown again', async () => {
    const timing = newRequestTiming(0);
    await withRequestTiming(timing, async () => {
      await timed('deck-head', async () => true);
      await Promise.all([timed('document', async () => 'doc'), timed('versions', async () => [])]);
      noteTiming({ name: 'facts', desc: 'hit' });
      await expect(
        timed('leases', async () => {
          throw new Error('Vercel Blob: Too many requests');
        }),
      ).rejects.toThrow(/Too many requests/);
    });
    expect(timing.entries.map((entry) => entry.name)).toEqual([
      'deck-head',
      'document',
      'versions',
      'facts',
      'leases',
    ]);
    for (const entry of timing.entries.filter((e) => e.name !== 'facts'))
      expect(entry.dur).toBeGreaterThanOrEqual(0);
    expect(timing.entries.at(-1)?.desc).toBe('failed');
    expect(currentTiming()).toBeUndefined();
  });

  it('keeps two requests apart', async () => {
    const a = newRequestTiming(0);
    const b = newRequestTiming(0);
    await Promise.all([
      withRequestTiming(a, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await timed('a-read', async () => 1);
      }),
      withRequestTiming(b, async () => {
        await timed('b-read', async () => 2);
      }),
    ]);
    expect(a.entries.map((entry) => entry.name)).toEqual(['a-read']);
    expect(b.entries.map((entry) => entry.name)).toEqual(['b-read']);
  });

  it('caps the entries of one answer', async () => {
    const timing = newRequestTiming(0);
    await withRequestTiming(timing, async () => {
      for (let i = 0; i < MAX_TIMING_ENTRIES + 10; i += 1) noteTiming({ name: 'read', dur: 1 });
    });
    expect(timing.entries).toHaveLength(MAX_TIMING_ENTRIES);
  });

  it('writes the header grammar: a token name, dur in ms to one decimal, a quoted desc', () => {
    expect(metricName('access record')).toBe('access-record');
    expect(metricName('"; drop')).toBe('drop');
    expect(metricName('')).toBe('read');
    expect(formatEntry({ name: 'document', dur: 12.345 })).toBe('document;dur=12.3');
    expect(formatEntry({ name: 'facts', desc: 'hit' })).toBe('facts;desc="hit"');
    expect(formatEntry({ name: 'x', dur: -3, desc: 'say "hi"\\\n' })).toBe(
      'x;dur=0;desc="say \\"hi\\"\\\\"',
    );
  });

  it('ends the value with cold (the instance age and the request ordinal) and total', () => {
    const timing = newRequestTiming(100);
    timing.entries.push({ name: 'deck-head', dur: 3 });
    const value = serverTimingValue(timing, { ageMs: 4321, request: 1 }, 150.04);
    expect(value).toBe('deck-head;dur=3, cold;dur=4321;desc="request 1", total;dur=50');
  });

  it('counts the requests of the instance and reads its age from the process start', () => {
    const first = instanceFacts();
    const second = instanceFacts(Date.now() + 1000);
    expect(second.request).toBe(first.request + 1);
    expect(first.ageMs).toBeGreaterThanOrEqual(0);
    expect(second.ageMs).toBeGreaterThan(first.ageMs);
  });
});
