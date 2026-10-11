import { describe, expect, it } from 'vitest';

import { mintReplayFloor, readReplayFloor } from './replay-floor';

// The replay floor token (hardening HR-SD#1e): the loader signs the position of the document it
// handed a reader without history, and the stream route and the ticket route read the position
// back only for the same deck, identity and tier. Anything else reads as no token, and the reader
// then replays nothing below the head.

const SECRET = 's'.repeat(48);
const scope = {
  deckId: 'q4-review',
  identity: 'anon_00000000-0000-4000-8000-000000000001',
  tier: 'memory',
};

describe('the replay floor token', () => {
  it('reads back the position it signed', () => {
    const token = mintReplayFloor(scope, 41, SECRET);
    expect(token).toMatch(/^41\.[0-9a-f]{32}$/);
    expect(readReplayFloor(token, scope, SECRET)).toBe(41);
    expect(readReplayFloor(mintReplayFloor(scope, 0, SECRET), scope, SECRET)).toBe(0);
  });

  it('proves nothing for another deck, identity, tier or key', () => {
    const token = mintReplayFloor(scope, 41, SECRET);
    expect(readReplayFloor(token, { ...scope, deckId: 'other-deck' }, SECRET)).toBeUndefined();
    expect(
      readReplayFloor(
        token,
        { ...scope, identity: 'anon_00000000-0000-4000-8000-000000000002' },
        SECRET,
      ),
    ).toBeUndefined();
    expect(readReplayFloor(token, { ...scope, tier: 'do' }, SECRET)).toBeUndefined();
    expect(readReplayFloor(token, scope, 't'.repeat(48))).toBeUndefined();
  });

  it('proves nothing for a moved position, a changed mac or a malformed token', () => {
    const token = mintReplayFloor(scope, 41, SECRET);
    const mac = token.split('.')[1] ?? '';
    // the reader lowers its own floor: the mac names 41
    expect(readReplayFloor(`0.${mac}`, scope, SECRET)).toBeUndefined();
    expect(readReplayFloor(`40.${mac}`, scope, SECRET)).toBeUndefined();
    expect(readReplayFloor(`41.${'0'.repeat(32)}`, scope, SECRET)).toBeUndefined();
    for (const bad of [
      null,
      undefined,
      '',
      '41',
      `041.${mac}`,
      `-1.${mac}`,
      `41.${mac}x`,
      `4.1.${mac}`,
    ])
      expect(readReplayFloor(bad, scope, SECRET)).toBeUndefined();
  });

  it('refuses to sign a position that is not a non negative integer', () => {
    expect(() => mintReplayFloor(scope, -1, SECRET)).toThrow(RangeError);
    expect(() => mintReplayFloor(scope, 1.5, SECRET)).toThrow(RangeError);
    expect(() => mintReplayFloor(scope, Number.NaN, SECRET)).toThrow(RangeError);
  });
});
