import { describe, expect, test } from 'vitest';

import {
  DITHER_ANGLE,
  DITHER_DEFAULTS,
  DITHER_PATTERNS,
  DITHER_PATTERNS_GS5,
  resolveDither,
} from './dither.ts';

// The dither patterns of round five (gslides-parity SPEC-5 1.2, 11; MILESTONES-5 B6 day 6): the
// eight ids with the four families after the four textures, the halftone angle's bounds and its
// default, and the resolved record carrying `angle` only when written so the variant key of every
// existing dither stays byte identical (SPEC-5 0.7).

describe('DITHER_PATTERNS', () => {
  test('lists the four textures and then the two error diffusions and the two halftone screens', () => {
    expect(DITHER_PATTERNS).toEqual([
      'bayer8',
      'bayer4',
      'blue64',
      'random',
      'floyd-steinberg',
      'atkinson',
      'halftone-dot',
      'halftone-line',
    ]);
    expect(DITHER_PATTERNS_GS5).toEqual([
      'floyd-steinberg',
      'atkinson',
      'halftone-dot',
      'halftone-line',
    ]);
    expect(DITHER_PATTERNS_GS5.every((id) => DITHER_PATTERNS.includes(id))).toBe(true);
  });

  test('the halftone angle is 0 to 180 degrees, 45 when absent, and no default names it', () => {
    expect(DITHER_ANGLE).toEqual({ min: 0, max: 180, default: 45 });
    expect('angle' in DITHER_DEFAULTS).toBe(false);
  });

  test('resolveDither copies angle only when written', () => {
    const plain = resolveDither({ pattern: 'halftone-dot' });
    expect('angle' in plain).toBe(false);
    expect(plain.pattern).toBe('halftone-dot');
    const angled = resolveDither({ pattern: 'halftone-line', angle: 15 });
    expect(angled.angle).toBe(15);
    expect(JSON.stringify(resolveDither({ pattern: 'bayer8' }))).toBe(
      JSON.stringify(resolveDither({ pattern: 'bayer8', angle: undefined })),
    );
  });
});
