import { describe, expect, it } from 'vitest';

import { bayer8 } from '../dither';

// The deck's 8 by 8 Bayer screen is a permutation of 0..63 (SPEC 5.4, tail:100-103).
describe('bayer8', () => {
  it('is a permutation of 0 to 63', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) seen.add(bayer8(r, c));
    expect(seen.size).toBe(64);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(63);
  });

  it('matches the deck at the corners', () => {
    expect(bayer8(0, 0)).toBe(0);
    expect(bayer8(0, 4)).toBe(2);
    expect(bayer8(4, 0)).toBe(3);
    expect(bayer8(4, 4)).toBe(1);
    expect(bayer8(1, 1)).toBe(16);
  });

  it('wraps', () => {
    expect(bayer8(9, 10)).toBe(bayer8(1, 2));
  });
});
