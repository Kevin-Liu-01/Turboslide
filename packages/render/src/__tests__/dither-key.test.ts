// The dither variant key (gslides-parity SPEC-3 10.1, 10.3): the digest against node:crypto, the
// resolved defaults, and the key's stability across writers.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  DITHER_DEFAULTS,
  DITHER_PHOTOGRAPH,
  ditherKey,
  ditherKey12,
  ditherScreen,
  ditherSourceOf,
  readDither,
  resolveDither,
  variantFor,
} from '../dither-key.ts';
import { sha256Hex } from '../sha256.ts';
import { openerAsset } from './fixtures.ts';

function nodeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches node:crypto on short, block boundary, long and multibyte inputs', () => {
    const inputs = [
      'a',
      'x'.repeat(55),
      'x'.repeat(56),
      'x'.repeat(63),
      'x'.repeat(64),
      'x'.repeat(65),
      'x'.repeat(1000),
      JSON.stringify([
        'assets/mood-rosetta.source.jpg',
        resolveDither(DITHER_PHOTOGRAPH),
        [800, 450],
      ]),
      'Ünïcödé ✓ 日本語 🙂',
    ];
    for (const input of inputs)
      expect(sha256Hex(input), input.slice(0, 20)).toBe(nodeSha256(input));
  });
});

describe('resolveDither', () => {
  it('fills every default of SPEC-3 10.1 in the fixed key order', () => {
    const resolved = resolveDither({ pattern: 'bayer8' });
    expect(resolved).toEqual({ pattern: 'bayer8', ...DITHER_DEFAULTS });
    expect(Object.keys(resolved)).toEqual([
      'pattern',
      'tone',
      'steps',
      'cell',
      'strength',
      'black',
      'white',
      'gamma',
      'invert',
      'polarity',
      'blur',
      'minFilter',
      'channel',
      'seed',
    ]);
  });

  it('keeps the written values and orders them the same whatever the source order', () => {
    const a = resolveDither({ pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 });
    const b = resolveDither({ gamma: 0.9, white: 230, black: 120, pattern: 'bayer8' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.black).toBe(120);
    expect(a.cell).toBe(2);
  });

  it('treats an explicit undefined as absent', () => {
    expect(resolveDither({ pattern: 'bayer4', cell: undefined }).cell).toBe(2);
  });
});

describe('ditherKey', () => {
  const source = ditherSourceOf(openerAsset);

  it('is the sha256 hex digest of the JSON of source, resolved dither and screen', () => {
    const key = ditherKey({ source, dither: { pattern: 'bayer8' }, screen: [800, 450] });
    const expected = nodeSha256(
      JSON.stringify([source, resolveDither({ pattern: 'bayer8' }), [800, 450]]),
    );
    expect(key).toBe(expected);
    // the form the schema keys Asset.variants by (ASSET_VARIANT_KEY, 64 hex characters)
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(ditherKey12(key)).toBe(expected.slice(0, 12));
    expect(ditherKey12(key)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('names one variant for a field with and without its defaults written', () => {
    const bare = ditherKey({ source, dither: { pattern: 'bayer8' }, screen: [800, 450] });
    const spelled = ditherKey({
      source,
      dither: { pattern: 'bayer8', cell: 2, tone: 'two', strength: 1 },
      screen: [800, 450],
    });
    expect(spelled).toBe(bare);
  });

  it('changes with any parameter, the screen size and the source', () => {
    const base = ditherKey({ source, dither: { pattern: 'bayer8' }, screen: [800, 450] });
    expect(
      ditherKey({ source, dither: { pattern: 'bayer8', black: 1 }, screen: [800, 450] }),
    ).not.toBe(base);
    expect(ditherKey({ source, dither: { pattern: 'bayer4' }, screen: [800, 450] })).not.toBe(base);
    expect(ditherKey({ source, dither: { pattern: 'bayer8' }, screen: [200, 113] })).not.toBe(base);
    expect(
      ditherKey({
        source: 'assets/other.source.jpg',
        dither: { pattern: 'bayer8' },
        screen: [800, 450],
      }),
    ).not.toBe(base);
  });

  it('reads the source as the continuous original, else the light or neutral twin', () => {
    expect(ditherSourceOf({ ...openerAsset, sourceFile: 'assets/opener-brand.source.jpg' })).toBe(
      'assets/opener-brand.source.jpg',
    );
    expect(ditherSourceOf(openerAsset)).toBe('assets/opener-brand-light.jpg');
    expect(ditherSourceOf({ twins: { neutral: 'assets/one.png' } })).toBe('assets/one.png');
  });

  it('sizes the screen in cells, at least one each way', () => {
    expect(ditherScreen(1600, 900, 2)).toEqual([800, 450]);
    expect(ditherScreen(400, 225, 2)).toEqual([200, 113]);
    expect(ditherScreen(1600, 900, 1)).toEqual([1600, 900]);
    expect(ditherScreen(1, 1, 4)).toEqual([1, 1]);
  });
});

describe('readDither and variantFor', () => {
  it('reads a stored field and refuses anything else', () => {
    expect(readDither({ dither: { pattern: 'blue64', strength: 0.6 } })).toEqual({
      pattern: 'blue64',
      strength: 0.6,
    });
    expect(readDither({})).toBeUndefined();
    expect(readDither({ dither: null })).toBeUndefined();
    expect(readDither({ dither: 'bayer8' })).toBeUndefined();
    expect(readDither({ dither: { pattern: 'floyd' } })).toBeUndefined();
    expect(readDither({ dither: { cell: 2 } })).toBeUndefined();
  });

  it('finds a variant record by key and refuses a malformed one', () => {
    const key = 'a'.repeat(64);
    const record = {
      key,
      twins: { light: 'assets/a-light.png', dark: 'assets/a-dark.png' },
      size: [1600, 900],
      scale: 1,
      producedAt: '2026-09-13T00:00:00Z',
    };
    expect(variantFor({ variants: { [key]: record } }, key)).toEqual(record);
    expect(variantFor({ variants: { [key]: record } }, 'b'.repeat(64))).toBeUndefined();
    expect(variantFor({}, key)).toBeUndefined();
    expect(variantFor({ variants: { [key]: { key } } }, key)).toBeUndefined();
  });
});
