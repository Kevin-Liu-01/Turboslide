import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SEED_TWIN_DECKS, placeSeedTwins } from './overlay-twins.mjs';

// The gate's placement of the GT deck's twins in a local node server's overlay (the realtime
// round, R5 fix 3; VERIFICATION.md realtime pass 3 P3-4): every twin the overlay lacks is copied,
// none it holds is written, and a deck the checkout does not hold places nothing.

function folders() {
  const root = mkdtempSync(join(tmpdir(), 'overlay-twins-'));
  const source = join(root, 'decks');
  const overlay = join(root, 'overlay');
  mkdirSync(join(source, 'gt-brand', 'assets'), { recursive: true });
  writeFileSync(join(source, 'gt-brand', 'assets', 'a.png'), 'checkout a');
  writeFileSync(join(source, 'gt-brand', 'assets', 'b.webp'), 'checkout b');
  writeFileSync(join(source, 'gt-brand', 'assets', '.DS_Store'), 'not a twin');
  return { source, overlay };
}

describe('placeSeedTwins', () => {
  it('names the GT brand deck as the one seed deck whose twins the bundle drops', () => {
    expect(SEED_TWIN_DECKS).toEqual(['gt-brand']);
  });

  it('copies every twin into an overlay that holds none', () => {
    const { source, overlay } = folders();
    const placed = placeSeedTwins({ overlay, source });
    expect(placed).toEqual([
      { deck: 'gt-brand', placed: 2, present: 0, source: join(source, 'gt-brand', 'assets') },
    ]);
    const to = join(overlay, 'decks', 'gt-brand', 'assets');
    expect(readdirSync(to).sort()).toEqual(['a.png', 'b.webp']);
    expect(readFileSync(join(to, 'b.webp'), 'utf8')).toBe('checkout b');
  });

  it('never writes a twin the overlay already holds and places only the missing ones', () => {
    const { source, overlay } = folders();
    const to = join(overlay, 'decks', 'gt-brand', 'assets');
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, 'a.png'), 'the server fetched this one');
    const placed = placeSeedTwins({ overlay, source });
    expect(placed[0]).toMatchObject({ placed: 1, present: 1 });
    expect(readFileSync(join(to, 'a.png'), 'utf8')).toBe('the server fetched this one');
    expect(readFileSync(join(to, 'b.webp'), 'utf8')).toBe('checkout b');
    /* a second run places nothing */
    expect(placeSeedTwins({ overlay, source })[0]).toMatchObject({ placed: 0, present: 2 });
  });

  it('places nothing for a deck the checkout does not hold', () => {
    const { source, overlay } = folders();
    expect(placeSeedTwins({ overlay, source, decks: ['absent'] })).toEqual([
      { deck: 'absent', placed: 0, present: 0, source: null },
    ]);
    expect(() => readdirSync(join(overlay, 'decks', 'absent'))).toThrow();
  });
});
