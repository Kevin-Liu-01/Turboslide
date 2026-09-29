import { describe, expect, test } from 'vitest';

import { labelFor } from '@turboslide/identity/labels';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec, MarkVariant } from '@turboslide/identity/marks';
import { MARK_FIELD_ORIGIN, renderMarkBits } from '@turboslide/identity/marks-render';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import { sha256 } from '@turboslide/identity/sha256';

import { markCells, plateOf } from '../presence/mark-svg';

// The two mark renderers agree (docs/PEOPLE.md 3.5, 6.5): the chrome's chip draws the field of
// the package's `renderMarkBits` through `markCells`, so 64 random specs at the four chip sizes
// rasterised from the chip's rects equal the package's bit grid cell for cell. The spec stream is
// seeded (a digest per index), so the run is the same every time.

const VARIANTS: readonly MarkVariant[] = ['initials', 'glyph', 'dither', 'picture', 'agent'];
const SIZES = [24, 16, 14, 12] as const;

function anonId(i: number): string {
  const d = sha256(`agree-${i}`);
  const hex = [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `anon_${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function identity(i: number, variant: MarkVariant): ResolvedIdentity {
  const principalId = anonId(i);
  const agent = variant === 'agent';
  return {
    principalId,
    kind: agent ? 'agent' : 'anonymous',
    displayName: agent ? 'Agent' : i % 2 === 0 ? `Maya Chen ${i}` : labelFor(principalId),
    label: labelFor(principalId),
    trust: agent ? 'agent' : i % 2 === 0 ? 'guest' : 'label',
    avatar: agent ? { variant: 'initials' } : { variant, salt: i % 5 === 0 ? i * 7919 : undefined },
    deleted: false,
    admin: false,
  };
}

function spec(i: number): MarkSpec {
  const variant = VARIANTS[i % VARIANTS.length] ?? 'initials';
  return markSpec(identity(i, variant), {
    hueSlot: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    presenter: i % 7 === 3,
    self: i % 4 === 0,
    ...(variant === 'picture' ? { pictureUrl: `/u/k${i}/p-64.webp` } : {}),
  });
}

/** The chip's rects rasterised into a chip sized grid with the ring, the way the DOM would read them. */
function rasterOfChip(s: MarkSpec, size: number): Uint8Array {
  const bits = new Uint8Array(size * size);
  for (let i = 0; i < size; i += 1) {
    const gap = s.variant === 'agent' && i !== 0 && i !== size - 1 && Math.floor(i / 2) % 2 === 1;
    if (gap) continue;
    bits[i] = 1;
    bits[(size - 1) * size + i] = 1;
    bits[i * size] = 1;
    bits[i * size + size - 1] = 1;
  }
  for (const cell of markCells(s, size)) {
    for (let dy = 0; dy < cell.h; dy += 1)
      for (let dx = 0; dx < cell.w; dx += 1) {
        const x = MARK_FIELD_ORIGIN + cell.x + dx;
        const y = MARK_FIELD_ORIGIN + cell.y + dy;
        expect(x).toBeGreaterThanOrEqual(MARK_FIELD_ORIGIN);
        expect(y).toBeGreaterThanOrEqual(MARK_FIELD_ORIGIN);
        expect(x).toBeLessThan(size - MARK_FIELD_ORIGIN);
        expect(y).toBeLessThan(size - MARK_FIELD_ORIGIN);
        bits[y * size + x] = 1;
      }
  }
  return bits;
}

describe('the chip and the package draw one mark', () => {
  test('64 random specs at 24, 16, 14 and 12 px give equal bit grids through both paths', () => {
    let compared = 0;
    for (let i = 0; i < 64; i += 1) {
      const s = spec(i);
      for (const size of SIZES) {
        // the chip draws the presenter's triangle as its own element, so the raster it must match
        // is the badge free one
        const fromPackage = renderMarkBits({ ...s, presenter: false }, size).bits;
        const fromChip = rasterOfChip(s, size);
        expect(Buffer.from(fromChip).equals(Buffer.from(fromPackage))).toBe(true);
        compared += 1;
      }
    }
    expect(compared).toBe(64 * SIZES.length);
  });

  test('the field is size - 4 and every variant lights something in it except a picture', () => {
    for (const size of SIZES) expect(plateOf(size)).toBe(size - 4);
    for (let i = 0; i < VARIANTS.length; i += 1) {
      const s = spec(i);
      const cells = markCells(s, 24);
      if (s.variant === 'picture') expect(cells).toEqual([]);
      else expect(cells.length).toBeGreaterThan(0);
    }
  });
});
