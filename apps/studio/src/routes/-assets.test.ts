import { describe, expect, it } from 'vitest';

import { rangeHeaders, resolveRange } from './-assets-range';

// The checkout asset route's byte ranges (gslides-parity SPEC-5 3.3, 3.9; R11 2 rule 2): one
// range answers 206 with Content-Range, a range past the end answers 416, no range or a malformed
// one answers the whole file with Accept-Ranges, and HEAD carries the same headers (the route).

describe('resolveRange (RFC 9110 14)', () => {
  it('reads a-b, a- and -n against the size', () => {
    expect(resolveRange('bytes=0-99', 1000)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 99 },
      size: 1000,
    });
    expect(resolveRange('bytes=900-', 1000)).toEqual({
      kind: 'partial',
      range: { start: 900, end: 999 },
      size: 1000,
    });
    expect(resolveRange('bytes=-100', 1000)).toEqual({
      kind: 'partial',
      range: { start: 900, end: 999 },
      size: 1000,
    });
    // a last byte past the end is clamped, as the standard says
    expect(resolveRange('bytes=990-5000', 1000)).toEqual({
      kind: 'partial',
      range: { start: 990, end: 999 },
      size: 1000,
    });
    expect(resolveRange('bytes=-5000', 1000)).toEqual({
      kind: 'partial',
      range: { start: 0, end: 999 },
      size: 1000,
    });
  });

  it('answers the whole file for no range, another unit or several ranges', () => {
    expect(resolveRange(null, 1000)).toEqual({ kind: 'whole', size: 1000 });
    expect(resolveRange('', 1000)).toEqual({ kind: 'whole', size: 1000 });
    expect(resolveRange('items=0-1', 1000)).toEqual({ kind: 'whole', size: 1000 });
    expect(resolveRange('bytes=0-1,5-9', 1000)).toEqual({ kind: 'whole', size: 1000 });
    expect(resolveRange('bytes=-', 1000)).toEqual({ kind: 'whole', size: 1000 });
  });

  it('refuses a first byte past the end, an inverted range and an empty file with 416', () => {
    expect(resolveRange('bytes=1000-', 1000)).toEqual({ kind: 'unsatisfiable', size: 1000 });
    expect(resolveRange('bytes=5000-6000', 1000)).toEqual({ kind: 'unsatisfiable', size: 1000 });
    expect(resolveRange('bytes=50-10', 1000)).toEqual({ kind: 'unsatisfiable', size: 1000 });
    expect(resolveRange('bytes=0-10', 0)).toEqual({ kind: 'unsatisfiable', size: 0 });
    expect(resolveRange('bytes=-0', 1000)).toEqual({ kind: 'unsatisfiable', size: 1000 });
  });
});

describe('rangeHeaders', () => {
  it('writes 200 with Accept-Ranges, 206 with Content-Range and Content-Length, 416 with the size', () => {
    expect(rangeHeaders({ kind: 'whole', size: 1000 })).toEqual({
      status: 200,
      headers: { 'accept-ranges': 'bytes', 'content-length': '1000' },
    });
    expect(rangeHeaders({ kind: 'partial', range: { start: 0, end: 99 }, size: 1000 })).toEqual({
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-range': 'bytes 0-99/1000',
        'content-length': '100',
      },
    });
    expect(rangeHeaders({ kind: 'unsatisfiable', size: 1000 })).toEqual({
      status: 416,
      headers: { 'accept-ranges': 'bytes', 'content-range': 'bytes */1000' },
    });
  });
});
